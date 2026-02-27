# Architecture

## 프로젝트 구조
```
salesmap-mcp/
├── package.json
├── tsconfig.json
├── wrangler.jsonc           # Cloudflare Workers 설정
├── .dev.vars                # 로컬 API 토큰 (gitignore)
├── .gitignore
├── src/
│   ├── index.ts             # 엔트리. createMcpHandler + tool 등록
│   ├── client.ts            # SalesMapClient (auth, rate limit, retry)
│   ├── types.ts             # Env, EntityType 등 공통 타입
│   └── tools/
│       ├── people.ts        # 5 tools (list, get, create, update, find-by-email)
│       ├── organization.ts  # 4 tools
│       ├── deal.ts          # 5 tools (+quotes)
│       ├── lead.ts          # 5 tools (+quotes)
│       ├── custom-object.ts # 4 tools
│       ├── search.ts        # 1 tool (filterGroupList)
│       ├── sequence.ts      # 5 tools (list, get, steps, enrollments, timeline)
│       ├── field.ts         # 1 tool
│       ├── pipeline.ts      # 1 tool (deal/lead 공통)
│       ├── product.ts       # 2 tools
│       ├── webform.ts       # 2 tools
│       ├── todo.ts          # 1 tool (읽기 전용)
│       ├── memo.ts          # 1 tool (생성은 entity update의 memo 파라미터)
│       ├── user.ts          # 3 tools (list, me, teams)
│       ├── email.ts         # 1 tool (단일 조회, body 없음)
│       ├── history.ts       # 1 tool (entityType 파라미터)
│       ├── activity.ts      # 1 tool (entityType 파라미터)
│       ├── association.ts   # 2 tools (primary, custom)
│       └── quote.ts         # 1 tool (생성)
└── docs/
    ├── PRD.md               # 상세 요구사항 + tool 목록
    └── architecture.md      # 이 파일
```

## 핵심 흐름

```
Claude → MCP Client → Streamable HTTP → Cloudflare Worker
  → createMcpHandler() → McpServer.tool() 매칭
  → SalesMapClient.get/post() → https://salesmap.kr/api/v2/...
  → JSON 응답 → Claude에 반환
```

## SalesMapClient 설계

```typescript
class SalesMapClient {
  // Bearer token auth (env.SALESMAP_API_TOKEN)
  // Rate limit: 120ms 최소 간격
  // 429 → exponential backoff (1s, 2s, 4s), 최대 3회

  get(path, query?)      // GET 요청
  post(path, body?)      // POST 요청
  getOne(path, key)      // 단일 조회 + 배열 [0] 추출
}

ok(data)   // → { content: [{ type: "text", text: JSON.stringify(data) }] }
err(msg)   // → { content: [{ type: "text", text: JSON.stringify({error}) }], isError: true }
```

## Tool 등록 패턴

각 tool 파일은 `register*Tools(server, client)` 함수를 export.
`src/index.ts`에서 모두 import하여 등록.

```typescript
// 매 요청마다 새 서버 인스턴스 (MCP SDK 1.26.0+ 보안 요구사항)
function createServer(env: Env): McpServer {
  const server = new McpServer({ name: "salesmap-mcp", version: "1.0.0" });
  const client = new SalesMapClient(env);
  registerPeopleTools(server, client);
  // ... 19개 register 함수
  return server;
}
```

## 배포

- 플랫폼: Cloudflare Workers
- Transport: Streamable HTTP (`/mcp` 엔드포인트)
- Secret: `SALESMAP_API_TOKEN` → `wrangler secret put`
- Health check: `GET /` → `{ status: "ok" }`
