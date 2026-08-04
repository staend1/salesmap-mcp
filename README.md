# SalesMap MCP Server

AI 어시스턴트가 [SalesMap](https://salesmap.kr) CRM을 안전하게 조회·생성·수정할 수 있게 해주는 MCP 서버입니다. 딜/리드/고객/회사/상품/견적/커스텀 오브젝트를 다루고, 필드 스키마 조회·검색·일괄 생성·활동 타임라인·노트 작성까지 지원합니다.

문의: siyeolyang@salesmap.kr

## 지금 지원하는 연결 방식

### 1. Streamable HTTP

권장 방식입니다. MCP 서버는 Vercel/Next.js 위에서 HTTP 엔드포인트로 동작합니다.

```text
https://salesmap-mcp.vercel.app/api/mcp
```

클라이언트는 요청마다 SalesMap API 토큰을 Bearer 헤더로 전달합니다.

```bash
Authorization: Bearer YOUR_SALESMAP_API_TOKEN
```

### 2. stdio 클라이언트 브릿지

Claude Desktop처럼 로컬 stdio MCP만 받는 클라이언트는 `mcp-remote`로 HTTP MCP를 stdio처럼 연결합니다. 이때 SalesMap MCP 서버 자체는 여전히 원격 HTTP 서버이고, `mcp-remote`가 로컬 브릿지 역할을 합니다.

## 빠른 시작

### Claude Code

```bash
claude mcp add salesmap-mcp \
  --transport http \
  --url https://salesmap-mcp.vercel.app/api/mcp \
  --header "Authorization: Bearer YOUR_SALESMAP_API_TOKEN"
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "salesmap-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://salesmap-mcp.vercel.app/api/mcp",
        "--header",
        "Authorization: Bearer YOUR_SALESMAP_API_TOKEN"
      ]
    }
  }
}
```

### Cursor / VS Code / 기타 MCP 클라이언트

Streamable HTTP를 지원하면 아래 URL을 그대로 사용합니다.

```text
https://salesmap-mcp.vercel.app/api/mcp
```

HTTP를 직접 지원하지 않고 stdio만 지원하면 `mcp-remote`를 브릿지로 사용합니다.

## 인증

기본 인증은 간단합니다.

```text
Authorization: Bearer <SalesMap API Token>
```

각 사용자는 자신의 SalesMap API 토큰으로 인증하므로 워크스페이스와 권한은 해당 토큰 기준으로 적용됩니다.

배포 환경에 `OAUTH_SHIM_SECRET`이 설정되어 있으면 OAuth discovery/shim 엔드포인트도 활성화됩니다. 커스텀 커넥터가 OAuth 흐름을 요구하는 경우를 위한 호환 레이어이며, 기존 Bearer 헤더 방식은 그대로 동작합니다.

## 특징

- **Streamable HTTP MCP**: 로컬 빌드 없이 원격 URL로 연결
- **29개 도구**: 스키마, 검색, 읽기, 생성, 수정, 삭제, 노트, 활동, 견적, 파이프라인, 문서, 피드백
- **멀티테넌트**: 요청의 Bearer 토큰 기준으로 SalesMap API 호출
- **LLM 친화 입력**: `properties`는 화면의 필드명 그대로 사용하고, 필요한 경우 이름/ID 변환과 에러 힌트를 제공
- **v3 생성 지원**: `salesmap-batch-create-objects`로 1~100건 생성
- **실패 방어**: 필드명 오타, 관계 필드 오용, 커스텀 오브젝트 이름/ID 혼동, 상품 생성 규칙 등을 사전 검증
- **활동 전문 조회**: 목록은 미리보기 중심, 이메일/녹취/노트 전문은 별도 도구로 조회
- **최후수단 run-script**: 전용 도구로 안 되는 대량 수집·집계만 직접 API 스크립트로 처리

## 기본 사용 흐름

1. `salesmap-list-objects`로 기본/커스텀 오브젝트 이름을 확인합니다.
2. `salesmap-list-properties`로 필드명, 타입, 선택지, 입력 힌트를 확인합니다.
3. `salesmap-search-objects`로 대상 레코드 ID를 찾습니다.
4. `salesmap-batch-read-objects`로 필요한 필드와 관계를 상세 조회합니다.
5. 생성은 `salesmap-batch-create-objects`, 수정은 `salesmap-update-object`, 노트는 `salesmap-create-note`를 사용합니다.
6. 막히면 `salesmap-get-guide`를 먼저 보고, REST API 직접 호출이 꼭 필요할 때만 `salesmap-get-api-ref`와 `salesmap-run-script`를 사용합니다.

## 입력 규칙 요약

- 필드 값은 대부분 `properties`에 `{ "필드명": 값 }` 형태로 넣습니다.
- 담당자/사용자 필드는 기본적으로 활성 사용자 이름을 받습니다.
- 파이프라인/파이프라인 단계는 생성과 검색에서 이름 입력을 우선합니다. 단계명이 중복되면 파이프라인도 함께 지정합니다.
- 다른 레코드와의 연결은 필드가 아니라 관계입니다. 생성 시에는 `associations`에 관계명과 레코드 ID 배열을 넣습니다.
- 딜/리드 생성 시 `associations["메인 고객"]` 또는 `associations["메인 회사"]`가 필요합니다.
- 딜 생성 시 `properties["파이프라인 단계"]`는 단계 이름으로 넣습니다.
- 커스텀 오브젝트는 `objectType: "custom-object"`가 아니라 정의 이름을 그대로 넣습니다. 예: `티켓(CRM)`.
- 상품 생성은 `properties["이름"]`, `properties["금액"]`이 필수입니다. 상품에는 `associations`를 사용할 수 없습니다.
- 견적서는 일반 batch create가 아니라 `salesmap-create-quote`를 사용합니다.

## 도구 목록

전체 상세 명세는 [docs/tool-spec.md](docs/tool-spec.md)를 참고하세요.

| 카테고리 | 도구 | 용도 |
|---|---|---|
| 오브젝트/스키마 | `salesmap-list-objects` | 기본 오브젝트와 커스텀 오브젝트 목록 조회 |
|  | `salesmap-list-properties` | 필드 이름·타입·옵션·입력 힌트 조회 |
|  | `salesmap-create-property` | 커스텀 필드 생성, formula 필드 포함 |
| 검색/조회 | `salesmap-search-objects` | OR/AND 필터 검색, id/name 중심 반환 |
|  | `salesmap-batch-read-objects` | 최대 500개 레코드 일괄 조회 |
|  | `salesmap-list-associations` | 사용 가능한 관계명 조회 |
|  | `salesmap-get-link` | SalesMap 웹 URL 생성 |
| 생성/수정/삭제 | `salesmap-batch-create-objects` | 1~100건 레코드 생성 |
|  | `salesmap-update-object` | 레코드 필드 및 일부 메인 관계 수정 |
|  | `salesmap-delete-object` | 딜/리드 삭제, 미리보기 후 확정 |
| 노트/활동 | `salesmap-create-note` | 레코드에 노트 작성 |
|  | `salesmap-list-notes` | 노트 목록 필터 조회 |
|  | `salesmap-list-engagements` | 활동 타임라인 목록 조회 |
|  | `salesmap-read-engagement` | 이메일/녹취/노트 전문 조회 |
|  | `salesmap-list-changelog` | 필드 변경 이력 조회 |
| 파이프라인 | `salesmap-get-pipelines` | 파이프라인과 단계 목록 조회 |
|  | `salesmap-get-lead-time` | 딜/리드 단계별 체류 시간 분석 |
| 견적/상품 | `salesmap-get-quotes` | 딜/리드 연결 견적서 조회 |
|  | `salesmap-create-quote` | 견적서와 견적 상품 생성 |
|  | `salesmap-list-products` | 상품 목록 조회 |
| 사용자/팀 | `salesmap-list-users` | 사용자 목록 조회 |
|  | `salesmap-list-teams` | 팀과 소속 멤버 조회 |
|  | `salesmap-get-user-details` | 현재 API 토큰 소유자 조회 |
| 기타 참조 | `salesmap-list-sequences` | 시퀀스 목록 조회 |
|  | `salesmap-list-webforms` | 웹폼 목록 조회 |
|  | `salesmap-get-guide` | MCP 사용 가이드 조회 |
|  | `salesmap-get-api-ref` | SalesMap REST API 레퍼런스 조회 |
|  | `salesmap-run-script` | 최후수단 직접 API 스크립트 실행 |
| 피드백 | `salesmap-report-feedback` | MCP 문제·한계·기능 요청 전달 |

## 아키텍처

```text
MCP client
  -> MCP over Streamable HTTP
    -> Next.js App Router (/api/mcp)
      -> SalesMap REST API v2/v3
```

- 서버는 요청마다 `McpServer`와 HTTP transport를 새로 생성하는 stateless 구조입니다.
- `GET /api/mcp`는 브라우저 헬스체크용 JSON을 반환합니다.
- MCP SSE 스트림용 `GET` 요청은 스펙에 맞게 405를 반환하고, 실제 MCP 호출은 `POST`로 처리합니다.
- SalesMap API 토큰은 서버 환경변수가 아니라 클라이언트의 `Authorization` 헤더로 전달됩니다.

## 로컬 개발

```bash
npm install
npm run dev
```

로컬 엔드포인트:

```text
http://localhost:3000/api/mcp
```

검증:

```bash
npm run typecheck
npm run build
```

## 배포

```bash
npx vercel deploy --prod
```

Vercel 함수는 서울 리전(`icn1`)과 130초 제한으로 설정되어 있습니다.

## 문서

- [docs/tool-spec.md](docs/tool-spec.md): 코드에서 생성한 전체 MCP 도구 명세
- `salesmap-get-guide`: 에이전트가 런타임에 읽는 MCP 사용 가이드
- `salesmap-get-api-ref`: 에이전트가 런타임에 읽는 SalesMap REST API 레퍼런스

## License

MIT
