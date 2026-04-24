# SalesMap MCP Server

AI 어시스턴트를 [세일즈맵](https://salesmap.kr) CRM에 연결하는 [Model Context Protocol](https://modelcontextprotocol.io) 서버입니다. 자연어로 CRM 데이터를 조회·생성·수정하고 영업 자동화를 실행할 수 있습니다.

## 문의처
siyeolyang@salesmap.kr

## 특징

- **19개 도구** — 스키마 조회, 검색, CRUD, 관계, 파이프라인 분석, 활동 타임라인 등
- **멀티테넌트** — 각 사용자가 자신의 세일즈맵 API 토큰으로 인증
- **Streamable HTTP** — Vercel 배포, 로컬 빌드 불필요
- **스마트 응답** — properties 미지정 시 타입별 코어 필드만 반환 (컨텍스트 절약), 사전 검증으로 불필요한 API 에러 방지
- **LLM 최적화** — 도구 설명이 선행 호출·에러 힌트·가이드를 포함해 LLM이 스스로 올바른 순서로 호출

## 빠른 시작

### Claude Code로 연결

```bash
claude mcp add salesmap-mcp \
  --transport http \
  --url https://salesmap-mcp.vercel.app/api/mcp \
  --header "Authorization: Bearer YOUR_SALESMAP_API_TOKEN"
```

### Claude Desktop으로 연결

`~/Library/Application Support/Claude/claude_desktop_config.json`에 추가:

```json
{
  "mcpServers": {
    "salesmap-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://salesmap-mcp.vercel.app/api/mcp",
        "--header",
        "Authorization: Bearer YOUR_SALESMAP_API_TOKEN"
      ]
    }
  }
}
```

### Cursor / VS Code로 연결

에디터의 MCP 확장 설정에서 동일한 HTTP URL을 사용하세요.

## 도구 목록

> 필수 파라미터는 굵게, 선택 파라미터는 `?` 표시

| 카테고리 | 도구 | 설명 | 파라미터 |
|---------|------|------|---------|
| **스키마** | `salesmap-list-properties` | 오브젝트의 필드 이름·타입·옵션 조회 | **objectType** |
| **검색** | `salesmap-search-objects` | OR/AND 조합 필터 기반 검색. id·name만 반환 | **objectType** · **filterGroups** · after? |
| **CRUD** | `salesmap-batch-read-objects` | 최대 20개 레코드 일괄 조회. properties 생략 시 코어 필드만 반환 | **objectType** · **objectIds** · properties? |
| | `salesmap-create-object` | 레코드 생성 | **objectType** · properties? · note? · peopleId? · organizationId? · customObjectDefinitionId? |
| | `salesmap-update-object` | 레코드 수정 | **objectType** · **objectId** · properties? · peopleId? · organizationId? |
| | `salesmap-delete-object` | 딜/리드 삭제 (confirmed=false 미리보기 → true 실행) | **objectType** · **objectId** · confirmed? |
| **관계** | `salesmap-list-associations` | 연관 레코드 조회 | **objectType** · **objectId** · **toObjectType** |
| **노트** | `salesmap-create-note` | 레코드에 노트 추가 | **objectType** · **objectId** · **note** |
| | `salesmap-read-note` | 노트 단건 상세 조회 | **noteId** |
| **활동** | `salesmap-list-engagements` | 활동 타임라인 조회. 이메일 제목·노트 본문 자동 인라인 | **objectType** · **objectId** · after? |
| | `salesmap-list-changelog` | 필드 변경 이력. 자동계산·시스템 필드 자동 제외 | **objectType** · **objectId** · after? |
| **파이프라인** | `salesmap-get-pipelines` | 파이프라인·단계 목록 및 ID 조회 | **objectType** |
| | `salesmap-get-lead-time` | 단계별 체류 시간 구조화 분석 | **objectType** · **objectId** |
| **견적** | `salesmap-get-quotes` | 딜/리드의 견적서 목록 조회 | **objectType** · **objectId** |
| | `salesmap-create-quote` | 견적서 생성 및 연결 | **name** · dealId? · leadId? · note? · isMainQuote? · quoteProductList? · properties? |
| **사용자** | `salesmap-list-users` | CRM 사용자 목록 조회 | after? |
| | `salesmap-list-teams` | 팀 목록 조회 | after? |
| | `salesmap-get-user-details` | 현재 토큰 소유자 정보 조회 | — |
| **유틸** | `salesmap-get-link` | 레코드의 CRM 웹 URL 생성 | **objectType** · **objectId** |

## 아키텍처

```
클라이언트 (Claude, Cursor 등)
  → MCP over Streamable HTTP
    → Vercel (Next.js App Router)
      → 세일즈맵 REST API v2
```

- **Stateless** — 요청마다 서버와 트랜스포트를 새로 생성
- **환경변수 불필요** — 클라이언트가 `Authorization` 헤더로 API 토큰 전달
- **Rate limit 대응** — API 호출 간 120ms 최소 인터벌 + 429 자동 재시도

## 지원 오브젝트

`organization` · `people` · `deal` · `lead` · `custom-object`

## 로컬 개발

```bash
npm install
npm run dev    # http://localhost:3000/api/mcp
```

```bash
npm run build       # 타입 체크 + 빌드
npm run typecheck   # 타입 체크만
```

## 배포

```bash
npx vercel deploy --prod
```

## License

MIT
