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
│   ├── index.ts                   # MCP 서버 생성 + 22개 tool 등록 + instrument()
│   ├── client.ts                  # SalesMapClient + DEFAULT_PROPERTIES + pickProperties + compactRecords
│   ├── types.ts                   # 공통 타입 + getClient(extra) 헬퍼
│   ├── telemetry.ts               # 토큰 지문 + tool_call/feedback 로깅 + instrument() 래퍼
│   └── tools/
│       ├── field.ts               # 1 tool: salesmap-list-properties
│       ├── search.ts              # 1 tool: salesmap-search-objects
│       ├── generic.ts             # 4 tools: batch-read, create, update, delete
│       └── extras.ts              # 16 tools: associations, note, engagements, changelog,
│                                  #           quotes, pipelines, lead-time, users, teams,
│                                  #           user-details, get-link, create-property,
│                                  #           get-docs, report-feedback
└── docs/
    ├── _internal/                     # gitignored — PRD, 내부 참조 문서
    ├── architecture.md
    ├── llm-hubspot-gap-analysis.md
    ├── mcp-implementation-notes.md
    ├── salesmap-api-issues.md
    └── salesmap-api-reference.md
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
  instrument(server);             // tool 등록 전 — 전 tool 핸들러를 로깅 래퍼로 감쌈
  registerFieldTools(server);     // 1: salesmap-list-properties
  registerSearchTools(server);    // 2: salesmap-search-objects
  registerGenericTools(server);   // 3-6: batch-read, create, update, delete
  registerExtrasTools(server);    // 7-22: 지원 도구 16개
  return server;
}
```

## 텔레메트리 (사용 로그 + 피드백)

`src/telemetry.ts` — 베타 사용행태 관찰용. Google Sheet(Apps Script 웹앱)로 발사.

```typescript
fingerprint(token)   // SHA-256(token) 앞 16자 → workspace 식별 (네트워크 호출 0, PII 0)
instrument(server)   // server.tool() 몽키패치 → 전 tool에 tool_call 로깅 자동 주입
logFeedback(...)     // salesmap-report-feedback가 호출 → feedback 행 기록
```

- **수집 범위**: 지문·tool 이름·성공여부·에러 종류·소요시간. **파라미터 값은 미수집** (PII 회피)
- **발사 방식**: `next/server`의 `after()`로 응답 flush 후 백그라운드 전송 → 응답 지연 0
- **환경변수**: `TELEMETRY_URL`, `TELEMETRY_SECRET`. 미설정 시 조용히 no-op (로컬/개발 무영향)

## MCP Annotations

모든 tool에 `readOnlyHint`, `destructiveHint`, `idempotentHint` 적용.
`server.tool(name, description, schema, annotations, handler)` 오버로드 사용.

## 배포

- 플랫폼: Vercel (Next.js App Router)
- Transport: Streamable HTTP (`/api/mcp`)
- 인증: 토큰은 클라이언트가 헤더로 전달 (서버 저장 안 함)
- 환경변수: 텔레메트리용 `TELEMETRY_URL`·`TELEMETRY_SECRET`만 선택적 (미설정 시 로깅 no-op)
