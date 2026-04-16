# Tool 리네이밍 계획 — HubSpot 패턴 편승

> 상태: ✅ 완료 (2026-04-08)

## 목적
HubSpot MCP 등 유명 tool의 네이밍/구조를 따라가서, LLM 강화학습 데이터에서 오는 어텐션을 간접적으로 활용.

---

## Tool 이름 변경

| 현재 | 변경 후 | HubSpot 대응 |
|------|---------|-------------|
| `salesmap_search_records` | `salesmap-search-objects` | `hubspot-search-objects` |
| `salesmap_get_record` | `salesmap-read-object` | `hubspot-batch-read-objects` |
| `salesmap_batch_get_records` | `salesmap-batch-read-objects` | `hubspot-batch-read-objects` |
| `salesmap_create_record` | `salesmap-create-object` | `hubspot-batch-create-objects` |
| `salesmap_update_record` | `salesmap-update-object` | `hubspot-batch-update-objects` |
| `salesmap_delete_record` | `salesmap-delete-object` | (HubSpot 없음) |
| `salesmap_describe_object` | `salesmap-list-properties` | `hubspot-list-properties` |
| `salesmap_get_pipeline_ids` | `salesmap-get-pipelines` | - |
| `salesmap_list_records` | `salesmap-list-objects` | `hubspot-list-objects` |
| `salesmap_get_record_url` | `salesmap-get-link` | `hubspot-get-link` |
| `salesmap_list_users` | `salesmap-list-users` | - |
| `salesmap_list_teams` | `salesmap-list-teams` | - |
| `salesmap_get_current_user` | `salesmap-get-user-details` | `hubspot-get-user-details` |
| `salesmap_get_association` | `salesmap-list-associations` | `hubspot-list-associations` |
| `salesmap_create_memo` | `salesmap-create-note` | `hubspot-create-engagement` (NOTE type) |
| `salesmap_get_lead_time` | `salesmap-get-lead-time` | - |
| `salesmap_create_quote` | `salesmap-create-quote` | - |
| `salesmap_get_quotes` | `salesmap-get-quotes` | - |

## HubSpot에만 있는 tool (추가 검토 대상)

| HubSpot tool | 기능 | 세일즈맵 API 가능 여부 |
|---|---|---|
| `hubspot-get-schemas` | 커스텀 오브젝트 스키마 조회 | 검토 필요 |
| `hubspot-get-property` | 특정 속성 상세 조회 | describe_object로 부분 대체 가능 |
| `hubspot-create-property` | 커스텀 속성 생성 | API 미지원 |
| `hubspot-update-property` | 속성 수정 | API 미지원 |
| `hubspot-batch-create-associations` | 다건 관계 생성 | 검토 필요 |
| `hubspot-get-association-definitions` | 유효한 관계 유형 조회 | 검토 필요 |
| `hubspot-get-engagement` | engagement 조회 | 메모 조회 API 확인 필요 |
| `hubspot-update-engagement` | engagement 수정 | 메모 수정 API 확인 필요 |
| `hubspot-list-workflows` | 워크플로우 목록 | API 미지원 (시퀀스로 대체?) |
| `hubspot-get-workflow` | 워크플로우 상세 | API 미지원 |
| `hubspot-feedback-link` | 피드백 링크 생성 | 우선순위 낮음 |

## 파라미터 네이밍 변경

| 현재 | 변경 후 | 비고 |
|------|---------|------|
| `type` | `objectType` | 전 tool 공통 |
| `id` | `objectId` 또는 유지 | 검토 필요 |
| `properties` | 유지 | 이미 일치 |

## Description 키워드 영문화

현재 한글 구조 → HubSpot 패턴 영문 키워드 병행:
```
Purpose: ...
Prerequisites: salesmap_list_properties → salesmap_search_objects 순서로 호출
Returns: ...
Usage Guidance: ...
Guardrails: (쓰기 tool만)
```

## 필터 구조 변경 (검토 필요)

현재 flat filters → HubSpot식 filterGroups > filters (AND/OR 조합)
- 세일즈맵 search API가 이 구조를 지원하는지 확인 필요
- API가 flat이면 MCP에서 변환 레이어 추가

## 구분자 변경: 언더스코어 → 하이픈

현재 `salesmap_search_records` → 변경 후 `salesmap-search-objects`

- HubSpot이 하이픈 사용 (`hubspot-search-objects`, `hubspot-batch-read-objects`)
- 편승 전략상 구분자도 하이픈으로 통일

## 주의사항
- 전체 tool 이름이 바뀌므로 test-agent.mjs 테스트 시나리오도 같이 수정
- docs/PRD.md tool 목록 업데이트
- gitbook 문서도 같이 업데이트
