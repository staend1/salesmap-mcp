# 도구 레퍼런스

세일즈맵 MCP 서버가 제공하는 17개 도구의 상세 스펙입니다.

> Claude는 대화 맥락에 따라 적절한 도구를 자동으로 선택합니다. 이 문서는 어떤 도구가 있는지 이해하고, 원하는 작업이 가능한지 확인하는 용도입니다.

## 스키마 탐색

### salesmap-list-properties

오브젝트의 필드 이름·타입·옵션을 조회합니다. **검색·생성·수정 전에 반드시 먼저 실행해야** 필드 구조를 정확히 알 수 있습니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `objectType` | enum | ✅ | `deal` `lead` `people` `organization` `product` `quote` `todo` `custom-object` |

**사용 예시:** "딜 오브젝트에 어떤 필드가 있는지 알려줘"

---

## 검색

### salesmap-search-objects

필터 조건으로 레코드를 검색합니다. 필터 그룹 간 OR, 그룹 내 필터 간 AND로 동작합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `targetType` | enum | ✅ | `people` `organization` `deal` `lead` |
| `filterGroupList` | array | ✅ | 필터 그룹 배열 (최대 3개 그룹, 그룹당 최대 3개 필터) |
| `cursor` | string | | 페이지네이션 커서 |

**필터 객체 구조:**

| 필드 | 타입 | 설명 |
|------|------|------|
| `fieldName` | string | 필드의 한글 이름 (list-properties 결과 참조) |
| `operator` | enum | 비교 연산자 (아래 표 참조) |
| `value` | string \| number \| string[] | 검색 값 |

<details>
<summary>지원 연산자 목록</summary>

| 연산자 | 설명 |
|--------|------|
| `EQ` | 같음 |
| `NEQ` | 같지 않음 |
| `EXISTS` | 값 있음 |
| `NOT_EXISTS` | 값 없음 |
| `CONTAINS` | 포함 |
| `NOT_CONTAINS` | 포함하지 않음 |
| `LT` / `LTE` | 미만 / 이하 |
| `GT` / `GTE` | 초과 / 이상 |
| `IN` / `NOT_IN` | 목록에 포함 / 불포함 |
| `LIST_CONTAIN` / `LIST_NOT_CONTAIN` | 리스트 필드에 포함 / 불포함 |
| `DATE_ON_OR_AFTER` | 이후 날짜 |
| `DATE_ON_OR_BEFORE` | 이전 날짜 |
| `DATE_IS_SPECIFIC_DAY` | 특정 날짜 |
| `DATE_BETWEEN` | 날짜 범위 |
| `DATE_MORE_THAN_DAYS_AGO` | N일 이전보다 오래됨 |
| `DATE_LESS_THAN_DAYS_AGO` | N일 이내 |
| `DATE_LESS_THAN_DAYS_LATER` | 앞으로 N일 이내 |
| `DATE_MORE_THAN_DAYS_LATER` | 앞으로 N일 이후 |
| `DATE_AGO` | N일 전 |
| `DATE_LATER` | N일 후 |

</details>

**사용 예시:** "이번 달 생성된 딜 중 상태가 Won인 것 검색해줘"

---

## 레코드 CRUD

### salesmap-read-object

레코드 한 건의 상세 정보를 조회합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `objectType` | enum | ✅ | `people` `organization` `deal` `lead` `custom-object` `email` |
| `id` | string | ✅ | 레코드 UUID |
| `properties` | string[] | | 반환할 필드 이름 목록 (한글). 생략 시 전체 반환 |

### salesmap-batch-read-objects

여러 레코드를 한 번에 조회합니다 (최대 20개).

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `objectType` | enum | ✅ | `people` `organization` `deal` `lead` `custom-object` |
| `ids` | string[] | ✅ | 레코드 ID 배열 (1~20개) |
| `properties` | string[] | | 반환할 필드 이름 목록. 다건 조회 시 지정 권장 |

### salesmap-create-object

새 레코드를 생성합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `objectType` | enum | ✅ | `people` `organization` `deal` `lead` `custom-object` `product` |
| `name` | string | 조건부 | 레코드 이름 (custom-object 제외 필수) |
| `memo` | string | | 초기 메모 |
| `fieldList` | array | | 커스텀 필드 값 배열 |
| `peopleId` | string | 조건부 | 연결할 고객 ID |
| `organizationId` | string | 조건부 | 연결할 회사 ID |
| `pipelineId` | string | 조건부 | 파이프라인 ID (딜 필수) |
| `pipelineStageId` | string | 조건부 | 단계 ID (딜 필수) |
| `status` | enum | 조건부 | `Won` `Lost` `In progress` (딜 필수) |
| `price` | number | | 금액 (딜) |
| `customObjectDefinitionId` | string | 조건부 | Definition ID (custom-object 필수) |

> 딜/리드 생성 시 `peopleId` 또는 `organizationId` 중 하나 이상 필요합니다.
> 딜 생성 시 `pipelineId`, `pipelineStageId`는 `salesmap-get-pipelines`로 확인하세요.

### salesmap-update-object

기존 레코드를 수정합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `objectType` | enum | ✅ | `people` `organization` `deal` `lead` `custom-object` |
| `id` | string | ✅ | 레코드 UUID |
| `name` | string | | 이름 변경 |
| `fieldList` | array | | 커스텀 필드 값 변경 |
| `peopleId` | string | | 고객 변경 |
| `organizationId` | string | | 회사 변경 |
| `pipelineId` | string | | 파이프라인 변경 |
| `pipelineStageId` | string | | 단계 변경 |
| `status` | enum | | `Won` `Lost` `In progress` |
| `price` | number | | 금액 변경 (딜) |

### salesmap-delete-object

딜/리드 레코드를 영구 삭제합니다. 2단계 확인 패턴을 사용합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `objectType` | enum | ✅ | `deal` `lead` |
| `id` | string | ✅ | 삭제할 레코드 UUID |
| `confirmed` | boolean | | `false`(기본)=미리보기, `true`=실제 삭제 |

> 시퀀스에 등록된 레코드는 삭제 불가 — 시퀀스 해제 후 재시도하세요.

---

## 지원 도구

### salesmap-list-associations

레코드에 연결된 다른 레코드들을 조회합니다. primary(FK)와 custom(커스텀 필드) 관계를 모두 조회하여 병합 반환합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `targetType` | enum | ✅ | 출발 오브젝트 타입 |
| `targetId` | string | ✅ | 출발 오브젝트 ID |
| `toTargetType` | enum | ✅ | 조회할 연관 오브젝트 타입 |

**사용 예시:** "이 회사에 연결된 딜 목록 보여줘"

### salesmap-create-note

레코드에 메모(노트)를 추가합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `objectType` | enum | ✅ | `people` `organization` `deal` `lead` `custom-object` |
| `id` | string | ✅ | 대상 레코드 UUID |
| `memo` | string | ✅ | 메모 내용 |

### salesmap-get-quotes

딜/리드에 연결된 견적서 목록을 조회합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `objectType` | enum | ✅ | `deal` `lead` |
| `id` | string | ✅ | 딜/리드 UUID |

### salesmap-create-quote

견적서를 생성합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `name` | string | ✅ | 견적서 이름 |
| `dealId` | string | 조건부 | 연결할 딜 ID |
| `leadId` | string | 조건부 | 연결할 리드 ID |
| `memo` | string | | 메모 |
| `isMainQuote` | boolean | | 메인 견적서 여부 |
| `quoteProductList` | array | | 상품 목록 |
| `fieldList` | array | | 커스텀 필드 |

> `dealId` 또는 `leadId` 중 하나를 지정해야 합니다.

### salesmap-get-pipelines

파이프라인 목록과 각 단계(stage)의 ID를 조회합니다. 딜·리드 생성/검색 시 필요합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `entityType` | enum | ✅ | `deal` `lead` |

### salesmap-get-lead-time

딜/리드의 파이프라인 스테이지별 체류 시간을 분석합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `objectType` | enum | ✅ | `deal` `lead` |
| `id` | string | ✅ | 레코드 ID |

**사용 예시:** "이 딜이 각 단계에서 며칠씩 걸렸는지 분석해줘"

### salesmap-get-link

레코드의 세일즈맵 웹 URL을 생성합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `objectType` | enum | ✅ | `people` `organization` `deal` `lead` `custom-object` `product` `quote` |
| `id` | string | ✅ | 레코드 ID |

### salesmap-list-users

CRM 사용자 목록을 조회합니다. 담당자 지정·변경 시 필요합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `cursor` | string | | 페이지네이션 커서 |

### salesmap-list-teams

팀 목록을 조회합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `cursor` | string | | 페이지네이션 커서 |

### salesmap-get-user-details

현재 API 토큰 소유자의 정보를 조회합니다. 파라미터 없음.

---

## 도구 권한

| 구분 | 도구 수 | 해당 도구 |
|------|--------|----------|
| **읽기 전용** | 12개 | list-properties, search-objects, read-object, batch-read-objects, list-associations, get-quotes, get-pipelines, get-lead-time, get-link, list-users, list-teams, get-user-details |
| **쓰기** | 4개 | create-object, update-object, create-note, create-quote |
| **삭제** | 1개 | delete-object (2단계 확인 필수) |

쓰기 도구를 호출하면 Claude가 실행 전에 확인을 요청합니다. 삭제 도구는 추가로 미리보기 단계를 거칩니다.
