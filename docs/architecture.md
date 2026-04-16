# Architecture

## 프로젝트 구조

```
salesmap-mcp/
├── package.json
├── tsconfig.json
├── next.config.ts
├── vercel.json
├── app/
│   └── api/[transport]/route.ts   # Vercel API 엔트리 (auth + MCP transport)
├── src/
│   ├── index.ts                   # MCP 서버 생성 + 19개 tool 등록
│   ├── client.ts                  # SalesMapClient + DEFAULT_PROPERTIES + pickProperties + compactRecords
│   ├── types.ts                   # 공통 타입 + getClient(extra) 헬퍼
│   └── tools/
│       ├── field.ts               # 1 tool: salesmap-list-properties
│       ├── search.ts              # 1 tool: salesmap-search-objects
│       ├── generic.ts             # 4 tools: batch-read, create, update, delete
│       └── extras.ts              # 13 tools: associations, note, engagements, changelog,
│                                  #           quotes, pipelines, lead-time, users, teams,
│                                  #           user-details, get-link
└── docs/
    ├── architecture.md
    ├── salesmap-api-reference.md
    ├── field-editability.md
    ├── system-fields.md
    └── api-analysis/
        ├── api-mcp-readiness.md
        ├── mcp-workaround-logic.md
        └── llm-mental-model-gap.md
```

## 핵심 흐름

```
Claude → MCP Client → Streamable HTTP → Vercel (Next.js App Router)
  → route.ts (Bearer 토큰 추출) → createServer() → tool 매칭
  → SalesMapClient.get/post() → https://salesmap.kr/api/v2/...
  → JSON 응답 → Claude에 반환
```

## 멀티테넌트 인증

- 클라이언트가 `Authorization: Bearer <token>` 헤더로 전달
- route.ts에서 토큰 추출 → `getClient(extra)`로 요청별 SalesMapClient 생성
- 서버는 토큰 저장 안 함, 환경변수 불필요

## SalesMapClient 설계

```typescript
class SalesMapClient {
  // Bearer token auth (요청별 전달)
  // Rate limit: 120ms 최소 간격
  // 429 → exponential backoff (1s, 2s, 4s), 최대 3회

  get(path, query?)      // GET 요청
  post(path, body?)      // POST 요청
  getOne(path, key)      // 단일 조회 + 배열 [0] 추출 (응답 래핑 비일관성 우회)
}

// 응답 후처리 유틸
DEFAULT_PROPERTIES       // 타입별 코어 필드 목록 (properties 미지정 시 기본값)
getDefaultProperties()   // 커스텀 오브젝트는 스키마 조회로 동적 감지
pickProperties()         // 지정 필드만 남김 (id/name 항상 포함)
compactRecords()         // null 필드 + 파이프라인 자동생성 필드 제거

ok(data)                 // → { content: [{ type: "text", text: JSON.stringify(data) }] }
err(msg)                 // → { content: [...], isError: true }
```

## Tool 등록 패턴

각 tool 파일은 `register*Tools(server)` 함수를 export.
`src/index.ts`에서 4개 register 함수 호출.

```typescript
function createServer(): McpServer {
  const server = new McpServer({ name: "salesmap-mcp", version: "2.0.0" });
  registerFieldTools(server);     // 1: salesmap-list-properties
  registerSearchTools(server);    // 2: salesmap-search-objects
  registerGenericTools(server);   // 3-6: batch-read, create, update, delete
  registerExtrasTools(server);    // 7-19: 지원 도구 13개
  return server;
}
```

## MCP Annotations

모든 tool에 `readOnlyHint`, `destructiveHint`, `idempotentHint` 적용.
`server.tool(name, description, schema, annotations, handler)` 오버로드 사용.

## 배포

- 플랫폼: Vercel (Next.js App Router)
- Transport: Streamable HTTP (`/api/mcp`)
- 환경변수 불필요 — 토큰은 클라이언트가 헤더로 전달
