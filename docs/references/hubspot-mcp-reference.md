# HubSpot MCP Server 분석 (v0.4.0)

> 2026-02-27 npm 패키지 소스 분석 기준. 우리 MCP 설계 참고용.

## Tool 목록 (20개)

### Objects — CRM 레코드 (6개)

| Tool | R/W | Description | 핵심 파라미터 |
|------|-----|-------------|--------------|
| `hubspot-list-objects` | R | 페이지네이션된 레코드 목록. "Use for initial data exploration" | `objectType`, `limit`(max 500, default 100), `after`, `properties[]`, `associations[]` |
| `hubspot-search-objects` | R | 복합 필터 검색. "Preferred for targeted data retrieval" | `objectType`, `query`, `filterGroups[]`(OR) > `filters[]`(AND), `sorts[]`, `limit`(max 100, default 10), `after`, `properties[]` |
| `hubspot-batch-read-objects` | R | ID로 다건 조회 | `objectType`, `inputs[].id`(max 100), `properties[]` |
| `hubspot-batch-create-objects` | W | 다건 생성 | `objectType`, `inputs[].properties`(max 100), `inputs[].associations[]` |
| `hubspot-batch-update-objects` | W | 다건 수정 | `objectType`, `inputs[].id`, `inputs[].properties`(max 100) |
| `hubspot-get-schemas` | R | 커스텀 오브젝트 스키마 조회 | 없음 |

### Properties — 필드 정의 (4개)

| Tool | R/W | Description | 핵심 파라미터 |
|------|-----|-------------|--------------|
| `hubspot-list-properties` | R | 속성 카탈로그 (축소 응답: name, label, type, description, groupName만) | `objectType` |
| `hubspot-get-property` | R | 속성 상세 | `objectType`, `propertyName` |
| `hubspot-create-property` | W | 커스텀 속성 생성 | `objectType`, `name`, `label`, `type`, `fieldType`, `groupName` |
| `hubspot-update-property` | W | 속성 수정 | `objectType`, `propertyName` + 변경할 필드 |

### Associations — 레코드 관계 (3개)

| Tool | R/W | Description | 핵심 파라미터 |
|------|-----|-------------|--------------|
| `hubspot-list-associations` | R | 연관 레코드 조회 | `objectType`, `objectId`, `toObjectType`, `after` |
| `hubspot-batch-create-associations` | W | 다건 관계 생성 | `fromObjectType`, `toObjectType`, `types[]`, `inputs[]` |
| `hubspot-get-association-definitions` | R | 유효한 관계 유형 조회 | `fromObjectType`, `toObjectType` |

### Engagements — 활동 (3개)

| Tool | R/W | Description | 핵심 파라미터 |
|------|-----|-------------|--------------|
| `hubspot-create-engagement` | W | Note/Task 생성 | `type`(NOTE/TASK), `ownerId`, `associations`, `metadata` |
| `hubspot-get-engagement` | R | engagement 조회 | `engagementId` |
| `hubspot-update-engagement` | W | engagement 수정 | `engagementId`, `metadata`, `associations` |

### Workflows (2개)

| Tool | R/W | Description |
|------|-----|-------------|
| `hubspot-list-workflows` | R | 워크플로우 목록 (limit max 100, default 20) |
| `hubspot-get-workflow` | R | 워크플로우 상세 (액션, 등록 조건, 스케줄링) |

### Utility (2개)

| Tool | R/W | Description |
|------|-----|-------------|
| `hubspot-get-user-details` | R | 토큰 인증 + 사용자/계정 정보. **모든 작업 전 최초 1회 호출 필수** |
| `hubspot-get-link` | R | HubSpot UI URL 생성 |

---

## 핵심 설계 패턴

### 1. Generic objectType 패턴
모든 CRM tool이 `objectType` 파라미터 하나로 contacts/deals/companies 등 통합 처리. 개별 entity tool 없음.

### 2. 단건 CRUD 없음
전부 batch 단위. 단건 조회도 `batch-read`에 ID 1개 넘기는 방식.

### 3. 응답 크기 관리 (3가지)
- **`properties` 파라미터**: 가져올 필드 지정 가능 (가장 중요)
- **페이지네이션**: limit + after cursor
- **응답 필드 필터링**: 서버단에서 `id`, `properties`, `createdAt`, `updatedAt`만 추출

### 4. Description 구조화
모든 tool description에 섹션 헤더 사용:
- `Purpose` — 목적
- `Prerequisites` — 선행 조건 (어떤 tool을 먼저 호출해야 하는지)
- `Returns` — 반환 내용
- `Usage Guidance` — 사용 가이드
- `Guardrails` — 쓰기 작업 시 경고

### 5. MCP Annotations
모든 tool에 `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` 메타데이터 포함.

---

## 우리 MCP와 비교

| 항목 | HubSpot | SalesMap |
|------|---------|---------|
| Tool 수 | 20 | 13 |
| CRUD 패턴 | batch 전용 | 단건 |
| 필드 선택 | `properties[]` 파라미터 | 불가 (API 미지원) |
| 응답 필터링 | 서버단 필드 추출 | `compactRecords` (null + 파이프라인 필드 제거) |
| Description | 영문 구조화 (Purpose/Prerequisites/Returns) | 한글 간결 |
| 스키마 조회 | `list-properties` + `get-property` | `describe_object` |
| Rate limit | 없음 | 120ms 간격 + 429 retry |
