# SalesMap MCP Server — PRD

## 목적
세일즈맵 CRM API v2를 MCP 도구로 래핑하여, Claude가 영업 데이터 조회/생성/수정 + 비즈니스 컨설팅을 수행할 수 있게 한다.

## 배경
- 세일즈맵은 한국 B2B 영업 CRM
- API 레퍼런스: `/Users/siyeol/conductor/workspaces/conductor-setting/austin/salesmap-api-reference.md`
- 멀티테넌트 — 고객마다 자기 API 토큰(Bearer)으로 접속, 서버는 토큰 저장 안 함

## 등록된 Tool 목록 (14개)

### 스키마 탐색 + 검색 (2개)
| Tool | 설명 | 파일 |
|------|------|------|
| `salesmap_describe_object` | CRM 스키마 파악. 작업 전 반드시 먼저 실행하여 필드 구조 확인. | field.ts |
| `salesmap_search_records` | 조건 기반 검색. salesmap_describe_object로 필드명 확인 후 사용. | search.ts |

### 범용 CRUD (4개)
| Tool | 설명 | 파일 |
|------|------|------|
| `salesmap_list_records` | 오브젝트 목록 조회 (커서 페이지네이션). | generic.ts |
| `salesmap_get_record` | 단일 레코드 상세 조회. | generic.ts |
| `salesmap_create_record` | 레코드 생성. salesmap_describe_object로 필드명 확인 후 사용. | generic.ts |
| `salesmap_update_record` | 레코드 수정. salesmap_describe_object로 필드명 확인 후 사용. | generic.ts |

### 지원 도구 (8개)
| Tool | 설명 | 파일 |
|------|------|------|
| `salesmap_get_association` | 레코드 간 연관관계 조회. | extras.ts |
| `salesmap_create_memo` | 레코드에 노트(메모) 추가. | extras.ts |
| `salesmap_get_pipeline_ids` | 딜/리드 생성 시 필요한 pipelineId·pipelineStageId 조회 전용. | extras.ts |
| `salesmap_create_quote` | 견적서 생성. 딜 또는 리드에 연결. | extras.ts |
| `salesmap_get_quotes` | 딜/리드에 연결된 견적서 조회. | extras.ts |
| `salesmap_list_users` | CRM 사용자 목록. 담당자 변경 시 userValueId 확인용. | extras.ts |
| `salesmap_get_current_user` | 현재 API 토큰 소유자 정보. | extras.ts |
| `salesmap_get_record_url` | 레코드의 CRM 웹 URL 생성. | extras.ts |

## MCP Annotations
모든 tool에 프로토콜 레벨 메타데이터 적용:
- **READ** (10개): `readOnlyHint=true, destructiveHint=false, idempotentHint=true`
- **WRITE** (4개: create_record, update_record, create_memo, create_quote): `readOnlyHint=false, destructiveHint=false, idempotentHint=false`

## 응답 최적화 — compactRecords
`list_records`, `search_records` 응답에서 자동 필터링:
1. `null` 값 필드 제거
2. 파이프라인 자동생성 필드 제거 (접미사: "로 진입한 날짜", "에서 보낸 누적 시간", "에서 퇴장한 날짜")

`get_record`는 필터링 없이 전체 필드 반환 (리드타임 분석 등에 필요).

## 주요 설계 결정

### Tool 통합 전략
- 초기 46개 → 14개로 통합 (objectType 파라미터 기반 범용 CRUD)
- LLM 행동 최적화: tool 이름/설명으로 호출 순서 유도 (describe_object 우선)
- HubSpot MCP 패턴 참고 (`docs/hubspot-mcp-reference.md`)

### SalesMap API 주의사항
- 단일 조회: 모든 오브젝트 배열 래핑 (`data.people[0]` 등)
- 메모 생성: 오브젝트 수정의 `memo` 파라미터로 전달
- 딜 금액: `price` top-level 파라미터 (fieldList 아님)
- nextCursor: 키가 없으면 마지막 페이지

## 추후 예정
- [ ] Vercel 배포 + 실서버 테스트
- [ ] MCP Inspector 전체 tool 통합 테스트
- [ ] 에러 핸들링 고도화
- [ ] todo/memo/email/activity/history URL 지원 (API 개발 후)

## 작업 이력
| 날짜 | 내용 |
|------|------|
| 2026-02-27 | 초기 구현 (46 tools) → 14개 통합, compactRecords, MCP Annotations, record URL tool 추가 |
