# SalesMap MCP Server

> 최종 작업: 2026-02-27

## 프로젝트 개요
세일즈맵 CRM API v2를 MCP(Model Context Protocol) 서버로 래핑. Claude가 CRM 데이터를 직접 조회/생성/수정하여 영업 컨설팅+자동화 가능. 멀티테넌트 — 고객마다 자기 API 토큰으로 접속.

## 기술 스택
- **런타임**: Vercel (Next.js App Router, Streamable HTTP transport)
- **MCP SDK**: `@modelcontextprotocol/sdk` ^1.26.0
- **언어**: TypeScript + Zod 스키마
- **API**: SalesMap REST API v2 (`https://salesmap.kr/api`)

## 핵심 파일
| 파일 | 역할 |
|------|------|
| `app/api/[transport]/route.ts` | Vercel API 엔트리 (auth + MCP transport) |
| `src/index.ts` | MCP 서버 생성 + 14개 tool 등록 |
| `src/client.ts` | SalesMap API 클라이언트 (rate limit, retry, compactRecords) |
| `src/types.ts` | 공통 타입 + `getClient(extra)` 헬퍼 |
| `src/tools/*.ts` | 4개 tool 파일 (field, search, generic, extras) |

## 멀티테넌트
각 고객이 자기 SalesMap API 토큰을 `Authorization: Bearer <token>` 헤더로 전달. 서버는 토큰을 저장하지 않음 — 요청마다 추출하여 API 호출에 사용.

## API 레퍼런스
- **필수 참조**: `/Users/siyeol/conductor/workspaces/conductor-setting/austin/salesmap-api-reference.md`

## 로컬 실행
```bash
npm install
npm run dev  # http://localhost:3000/api/mcp
```

## 배포
```bash
npx vercel deploy --prod
```
환경변수 불필요 — 토큰은 클라이언트가 헤더로 전달.

## 상세 문서
- `docs/PRD.md` — 상세 요구사항, tool 목록, 설계 결정
- `docs/architecture.md` — 프로젝트 구조, API 클라이언트 설계
- `docs/hubspot-mcp-reference.md` — HubSpot MCP 패턴 분석 (설계 참고)

## 현재 상태
- ✅ 14개 MCP tool (46개에서 통합)
- ✅ MCP Annotations (readOnlyHint, destructiveHint, idempotentHint)
- ✅ compactRecords 응답 필터 (list/search)
- ✅ record URL 생성 tool
- ⬜ Vercel 배포 + 실서버 테스트
- ⬜ MCP Inspector 전체 tool 통합 테스트
- ⬜ 에러 핸들링 고도화
- ⬜ todo/memo/email/activity/history URL 지원 (API 개발 후)
