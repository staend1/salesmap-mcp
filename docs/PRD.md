# SalesMap MCP Server — PRD

## 목적
세일즈맵 CRM API v2의 모든 검증된 엔드포인트를 MCP 도구로 노출하여, Claude가 영업 데이터 조회/생성/수정 + 비즈니스 컨설팅을 수행할 수 있게 한다.

## 배경
- 세일즈맵은 한국 B2B 영업 CRM
- API 레퍼런스: `/Users/siyeol/conductor/workspaces/conductor-setting/austin/salesmap-api-reference.md` (1,852줄, 실전 검증 완료)
- MCP 서버는 tool description에 비즈니스 맥락을 포함하여 Claude가 단순 API 호출 뿐 아니라 영업 컨설팅까지 가능하도록 설계

## 등록된 Tool 목록 (46개)

### 핵심 CRUD (23개)
| Tool | 엔드포인트 | 파일 |
|------|-----------|------|
| `salesmap_list_people` | GET /v2/people | people.ts |
| `salesmap_get_person` | GET /v2/people/{id} | people.ts |
| `salesmap_create_person` | POST /v2/people | people.ts |
| `salesmap_update_person` | POST /v2/people/{id} | people.ts |
| `salesmap_find_people_by_email` | GET /v2/people-temp/{email} | people.ts |
| `salesmap_list_organizations` | GET /v2/organization | organization.ts |
| `salesmap_get_organization` | GET /v2/organization/{id} | organization.ts |
| `salesmap_create_organization` | POST /v2/organization | organization.ts |
| `salesmap_update_organization` | POST /v2/organization/{id} | organization.ts |
| `salesmap_list_deals` | GET /v2/deal | deal.ts |
| `salesmap_get_deal` | GET /v2/deal/{id} | deal.ts |
| `salesmap_create_deal` | POST /v2/deal | deal.ts |
| `salesmap_update_deal` | POST /v2/deal/{id} | deal.ts |
| `salesmap_get_deal_quotes` | GET /v2/deal/{id}/quote | deal.ts |
| `salesmap_list_leads` | GET /v2/lead | lead.ts |
| `salesmap_get_lead` | GET /v2/lead/{id} | lead.ts |
| `salesmap_create_lead` | POST /v2/lead | lead.ts |
| `salesmap_update_lead` | POST /v2/lead/{id} | lead.ts |
| `salesmap_get_lead_quotes` | GET /v2/lead/{id}/quote | lead.ts |
| `salesmap_list_custom_objects` | GET /v2/custom-object | custom-object.ts |
| `salesmap_get_custom_object` | GET /v2/custom-object/{id} | custom-object.ts |
| `salesmap_create_custom_object` | POST /v2/custom-object | custom-object.ts |
| `salesmap_update_custom_object` | POST /v2/custom-object/{id} | custom-object.ts |

### 검색/조회 (3개)
| Tool | 엔드포인트 | 파일 |
|------|-----------|------|
| `salesmap_search_records` | POST /v2/object/{type}/search | search.ts |
| `salesmap_get_fields` | GET /v2/field/{type} | field.ts |
| `salesmap_list_pipelines` | GET /v2/{type}/pipeline | pipeline.ts |

### 시퀀스 (5개)
| Tool | 엔드포인트 | 파일 |
|------|-----------|------|
| `salesmap_list_sequences` | GET /v2/sequence | sequence.ts |
| `salesmap_get_sequence` | GET /v2/sequence/{id} | sequence.ts |
| `salesmap_get_sequence_steps` | GET /v2/sequence/{id}/step | sequence.ts |
| `salesmap_get_sequence_enrollments` | GET /v2/sequence/{id}/enrollment | sequence.ts |
| `salesmap_get_enrollment_timeline` | GET /v2/sequence/enrollment/{id}/timeline | sequence.ts |

### 지원 엔티티 (9개)
| Tool | 엔드포인트 | 파일 |
|------|-----------|------|
| `salesmap_list_products` | GET /v2/product | product.ts |
| `salesmap_create_product` | POST /v2/product | product.ts |
| `salesmap_list_webforms` | GET /v2/webForm | webform.ts |
| `salesmap_get_webform_submits` | GET /v2/webForm/{id}/submit | webform.ts |
| `salesmap_list_todos` | GET /v2/todo | todo.ts |
| `salesmap_list_memos` | GET /v2/memo | memo.ts |
| `salesmap_list_users` | GET /v2/user | user.ts |
| `salesmap_get_current_user` | GET /v2/user/me | user.ts |
| `salesmap_list_teams` | GET /v2/team | user.ts |

### 이메일/히스토리/액티비티/연관관계/견적서 (6개)
| Tool | 엔드포인트 | 파일 |
|------|-----------|------|
| `salesmap_get_email` | GET /v2/email/{id} | email.ts |
| `salesmap_get_history` | GET /v2/{entityType}/history | history.ts |
| `salesmap_get_activity` | GET /v2/{entityType}/activity | activity.ts |
| `salesmap_get_association_primary` | GET /v2/object/.../primary | association.ts |
| `salesmap_get_association_custom` | GET /v2/object/.../custom | association.ts |
| `salesmap_create_quote` | POST /v2/quote | quote.ts |

## 주요 설계 결정

### API 클라이언트 (`src/client.ts`)
- Rate limit: 120ms 최소 간격 (100req/10sec 안전 마진)
- 429 자동 재시도: exponential backoff, 최대 3회
- 단일 조회 배열 래핑 자동 처리: `getOne()` 메서드
- 응답: JSON 원본 반환 (Claude가 직접 해석)

### Tool Description 전략
- 각 tool에 비즈니스 맥락 포함 (영업 흐름에서의 역할)
- 예: enrollment timeline → "emailReply는 가장 강한 시그널, 즉시 follow-up 필요"
- fieldList 사용 tool → "salesmap_get_fields로 먼저 필드 확인 권장" 명시

### SalesMap API 주의사항
- 단일 조회: 모든 오브젝트 배열 래핑 (`data.people[0]` 등)
- 시퀀스: `_id` 사용 (not `id`)
- 메모 생성: 별도 API 없음, 오브젝트 수정의 `memo` 파라미터
- 딜 금액: `price` top-level 파라미터 (fieldList 아님)
- 히스토리/액티비티 URL: slash notation만 작동
- 이메일: 메타데이터만 (body 필드 없음)
- TODO: 읽기 전용 (생성 API 없음)
- nextCursor: 키가 없으면 마지막 페이지

## 미완료 작업
1. Cloudflare Workers 배포
2. MCP Inspector 통합 테스트
3. 에러 핸들링 고도화
4. Claude Desktop / Claude Code에서 실제 연결 테스트

## 작업 이력
| 날짜 | 내용 |
|------|------|
| 2026-02-27 | 초기 구현 완료 (46 tools, 타입체크 통과, 로컬 API 테스트 성공) |
