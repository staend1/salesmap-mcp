# SalesMap MCP Server

> 최종 작업: 2026-04-13 (HubSpot 어텐션 정렬 + 에러 보강 배포)

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
| `src/index.ts` | MCP 서버 생성 + 17개 tool 등록 |
| `src/client.ts` | SalesMap API 클라이언트 (rate limit, retry, compactRecords, errWithSchemaHint) |
| `src/types.ts` | 공통 타입 + `getClient(extra)` 헬퍼 |
| `src/tools/*.ts` | 4개 tool 파일 (field, search, generic, extras) |
| `scripts/test-agent.mjs` | 멀티턴 에이전트 시뮬레이션 (LLM 행동 테스트) |

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

## 작업 규칙
- API 버그, 레거시 동작, MCP 제한사항 발견 시 → `알려진 이슈 로그` 섹션에 즉시 추가 (날짜 + 증상 + 우회 방법)
- 해결된 이슈는 삭제하지 말고 해결 날짜와 방법 병기

## 상세 문서
- `docs/PRD.md` — 상세 요구사항, tool 목록, 설계 결정
- `docs/architecture.md` — 프로젝트 구조, API 클라이언트 설계
- `docs/TODO.md` — 통합 TODO (도구 추가, API 이슈, 로드맵)
- `docs/api-improvement-proposals.md` — 세일즈맵 API 개선 제안 (19건)
- `docs/references/` — 외부 레퍼런스 (HubSpot MCP, ejlee/salesmap-mcp, OpenAPI 스펙)

## 현재 상태
- ✅ 21개 MCP tool — HubSpot 파라미터 정렬 (objectId, filterGroups, after)
- ✅ HubSpot 🎯/📋/📦/🧭 description 패턴 적용
- ✅ TOP_LEVEL_ONLY 자동 추출 (금액/이름/파이프라인/상태 → properties에서 top-level로)
- ✅ properties 변환 레이어 (fieldList 타입 키 자동 매핑, key-value → typed fieldList)
- ✅ user/team 이름 자동 해석 (검색 필터에서 이름 → UUID 변환)
- ✅ 에러 보강 (404 래핑, search 0건 힌트, delete 시퀀스 힌트)
- ✅ Vercel Production 배포 + 21/21 실서버 테스트 통과
- ⬜ create-quote에 properties 지원 추가

## 알려진 이슈 로그
> API/MCP 버그, 레거시, 제한사항 발견 시 여기에 무조건 추가. 해결되면 해결 날짜와 방법 병기.

- **search sorts 미지원** (2026-04-08) — `sorts` 파라미터를 보내도 API가 정렬 무시. 클라이언트 정렬로 우회 필요. API 개선 요청 중.
- **search filterGroupList 빈 배열 불가** (2026-04-10) — 전체 목록 조회가 search로 안 됨. 최소 1개 filter 필수 (EXISTS 더미 필터로 우회).
- **email API 본문 미제공** (2026-04-09) — `GET /v2/email/{id}` 응답에 body/content 없음. subject 등 메타데이터만 반환.
- **email/memo API 래핑 구조** (2026-04-10) — `GET /v2/email/{id}`, `GET /v2/memo/{id}` 응답이 `{ email: {...} }`, `{ memo: {...} }` 형태로 래핑됨. `client.get()` 후 `.email` / `.memo`로 접근 필요.
- **search 응답 키가 `objectList`** (2026-04-10) — `/v2/object/{type}/search` 응답이 `dealList`가 아니라 `objectList`로 래핑됨. 또한 상세 필드 없이 `{ id, name }`만 반환 — 상세 조회는 별도 batch-read 필요.
