# Architecture

## 프로젝트 구조
```
salesmap-mcp/
├── package.json
├── tsconfig.json
├── next.config.ts
├── app/
│   └── api/[transport]/route.ts   # Vercel API 엔트리 (auth + MCP transport)
├── src/
│   ├── index.ts                   # MCP 서버 생성 + 14개 tool 등록
│   ├── client.ts                  # SalesMapClient + compactRecords 필터
│   ├── types.ts                   # 공통 타입 + getClient(extra) 헬퍼
│   └── tools/
│       ├── field.ts               # 1 tool: describe_object
│       ├── search.ts              # 1 tool: search_records
│       ├── generic.ts             # 4 tools: list, get, create, update
│       └── extras.ts              # 8 tools: association, memo, pipeline, quote, quotes, users, me, record_url
└── docs/
    ├── PRD.md
    ├── architecture.md
    └── hubspot-mcp-reference.md
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
  getOne(path, key)      // 단일 조회 + 배열 [0] 추출
}

compactRecords(data)     // list/search용 응답 필터 (null + 파이프라인 자동필드 제거)
ok(data)                 // → { content: [{ type: "text", text: JSON.stringify(data) }] }
err(msg)                 // → { content: [...], isError: true }
```

## Tool 등록 패턴

각 tool 파일은 `register*Tools(server)` 함수를 export.
`src/index.ts`에서 4개 register 함수 호출.

```typescript
function createServer(): McpServer {
  const server = new McpServer({ name: "salesmap-mcp", version: "2.0.0" });
  registerFieldTools(server);     // 1: describe_object
  registerSearchTools(server);    // 2: search_records
  registerGenericTools(server);   // 3-6: list, get, create, update
  registerExtrasTools(server);    // 7-14: 지원 도구
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
