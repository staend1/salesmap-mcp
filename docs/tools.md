# 도구 목록

{% hint style="info" %}
AI는 대화 맥락에 따라 적절한 도구를 자동으로 선택합니다. 이 문서는 어떤 도구가 있는지 이해하고, 원하는 작업이 가능한지 확인하는 용도입니다.
{% endhint %}

세일즈맵 MCP 서버가 제공하는 29개 도구의 상세 스펙입니다.

### 스키마 탐색

#### salesmap-list-objects

오브젝트 목록을 조회합니다. 기본 오브젝트(고객·회사·리드·딜·상품·견적서)와 커스텀 오브젝트 모두를 포함합니다.

**사용 예시**: "우리 워크스페이스에 어떤 커스텀 오브젝트가 있어?"

#### salesmap-list-properties

오브젝트의 필드 스키마(이름·유형·옵션)를 조회합니다.

| 파라미터         | 타입   | 필수 | 설명                                                                             |
| ------------ | ---- | -- | ------------------------------------------------------------------------------ |
| `objectType` | enum | ✅  | `deal` `lead` `people` `organization` `product` `quote` `quote-product` `todo` `custom-object` |

**사용 예시:** "딜 오브젝트에 어떤 필드가 있는지 알려줘"

#### salesmap-list-associations

오브젝트에 어떤 연결 관계가 있는지 스키마를 조회합니다. `salesmap-batch-read-objects`의 `associationList`에 넣을 관계명을 확인하는 용도입니다.

| 파라미터         | 타입     | 필수 | 설명                                                             |
| ------------ | ------ | -- | -------------------------------------------------------------- |
| `objectType` | string | ✅  | `deal` `lead` `people` `organization` 또는 커스텀 오브젝트 이름 (예: `티켓`) |

**사용 예시:** "딜에는 어떤 오브젝트를 연결할 수 있어?"

#### salesmap-create-property

필드를 생성합니다.

| 파라미터                         | 타입      | 필수     | 설명                                                                                              |
| ---------------------------- | ------- | ------ | ----------------------------------------------------------------------------------------------- |
| `objectType`                 | enum    | ✅      | `people` `organization` `deal` `lead` `product` `quote` `quote-product` `todo` `custom-object`  |
| `name`                       | string  | ✅      | 필드 이름                                                                                           |
| `type`                       | enum    | ✅      | `string` `number` `date` `dateTime` `boolean` `singleSelect` `multiSelect` `multiAttachment` `user` `multiUser` |
| `customObjectDefinitionName` | string  | 조건부 필수 | `objectType`이 `custom-object`일 때 대상 커스텀 오브젝트 이름 (ID 대신 사용 가능)                                   |
| `customObjectDefinitionId`   | string  | 조건부 필수 | `objectType`이 `custom-object`일 때 대상 커스텀 오브젝트 ID                                                  |
| `options`                    | array   | 조건부 필수 | `type`이 `singleSelect`(1개 이상)·`multiSelect`(2개 이상)일 때의 선택지 목록                                    |
| `description`                | string  |        | 필드 설명                                                                                           |
| `preventDuplicates`          | boolean |        | 같은 값이 중복 등록되지 않도록 막는 유니크 필드로 설정 (기본 false)                                                      |
| `required`                   | boolean |        | 생성 모달 UI에서 입력 강제 여부 (기본 false)                                                                  |
| `showInCreateForm`           | boolean |        | 생성 모달 UI에 표시 여부 (기본 false)                                                                      |
| `formula`                    | string  |        | 계산 수식. 입력 시 계산 유형 필드가 되며 `type`은 계산 결과의 타입이 됨                                                   |

**사용 예시:** "티켓 오브젝트에 중요도 필드 추가해줘"

***

### 레코드 검색

#### salesmap-search-objects

필터 조건으로 레코드를 검색합니다. 필터 그룹 간 OR, 그룹 내 필터 간 AND로 동작합니다. 결과는 id·name만 반환하며, 상세 필드는 `salesmap-batch-read-objects`로 이어서 조회합니다.

| 파라미터           | 타입     | 필수 | 설명                                    |
| -------------- | ------ | -- | ------------------------------------- |
| `objectType`   | enum   | ✅  | `people` `organization` `deal` `lead` |
| `filterGroups` | array  | ✅  | 필터 그룹 배열 (최대 3개 그룹, 그룹당 최대 3개 필터)     |
| `after`        | string |    | 페이지네이션 커서                             |

**필터 객체 구조:**

| 필드             | 타입                            | 설명               |
| -------------- | ----------------------------- | ---------------- |
| `propertyName` | string                        | 필드 이름            |
| `operator`     | enum                          | 비교 연산자 (아래 표 참조) |
| `value`        | string \| number \| string\[] | 검색 값             |

<details>

<summary>지원 연산자 목록</summary>

| 연산자                                 | 설명               |
| ----------------------------------- | ---------------- |
| `EQ`                                | 같음               |
| `NEQ`                               | 같지 않음            |
| `EXISTS`                            | 값 있음             |
| `NOT_EXISTS`                        | 값 없음             |
| `CONTAINS`                          | 포함               |
| `NOT_CONTAINS`                      | 포함하지 않음          |
| `LT` / `LTE`                        | 미만 / 이하          |
| `GT` / `GTE`                        | 초과 / 이상          |
| `IN` / `NOT_IN`                     | 목록에 포함 / 불포함     |
| `LIST_CONTAIN` / `LIST_NOT_CONTAIN` | 리스트 필드에 포함 / 불포함 |
| `DATE_ON_OR_AFTER`                  | 이후 날짜            |
| `DATE_ON_OR_BEFORE`                 | 이전 날짜            |
| `DATE_IS_SPECIFIC_DAY`              | 특정 날짜            |
| `DATE_BETWEEN`                      | 날짜 범위            |
| `DATE_MORE_THAN_DAYS_AGO`           | N일 이전보다 오래됨      |
| `DATE_LESS_THAN_DAYS_AGO`           | N일 이내            |
| `DATE_LESS_THAN_DAYS_LATER`         | 앞으로 N일 이내        |
| `DATE_MORE_THAN_DAYS_LATER`         | 앞으로 N일 이후        |
| `DATE_AGO`                          | N일 전             |
| `DATE_LATER`                        | N일 후             |

</details>

**사용 예시:** "이번 달 생성된 딜 중 상태가 Won인 것 검색해줘"

***

### 레코드 목록 조회

웹 폼, 시퀀스, 상품 목록 조회만 지원합니다.

고객, 회사, 리드, 딜 등 조회는 salesmap-search-objects를 사용합니다.

#### salesmap-list-webforms

웹 폼 목록을 조회합니다.

| 파라미터    | 타입                  | 설명        |
| ------- | ------------------- | --------- |
| `after` | `string` (optional) | 페이지네이션 커서 |

#### salesmap-list-sequences

시퀀스 목록을 조회합니다.

| 파라미터    | 타입                  | 설명        |
| ------- | ------------------- | --------- |
| `after` | `string` (optional) | 페이지네이션 커서 |

#### salesmap-list-products

상품 목록을 조회합니다.

| 파라미터    | 타입                  | 설명        |
| ------- | ------------------- | --------- |
| `after` | `string` (optional) | 페이지네이션 커서 |

### 레코드 CRUD

#### salesmap-batch-read-objects

여러 레코드를 한 번에 조회합니다 (최대 500개). 연결된 레코드도 함께 인라인으로 받을 수 있습니다.

| 파라미터              | 타입        | 필수 | 설명                                                                             |
| ----------------- | --------- | -- | ------------------------------------------------------------------------------ |
| `objectType`      | string    | ✅  | `people` `organization` `deal` `lead` 또는 커스텀 오브젝트 이름 (예: `티켓`)                |
| `objectIds`       | string\[] | ✅  | 레코드 ID 배열 (1\~500개)                                                            |
| `fieldList`       | string\[] |    | 반환할 필드 이름 목록 (한글). 생략 시 전체 필드 반환                                               |
| `associationList` | string\[] |    | 인라인으로 포함할 연결 관계명 목록. 관계명은 `salesmap-list-associations`로 확인                     |

{% hint style="info" %}
고객·회사 연결 같은 관계형 필드는 `fieldList`가 아닌 `associationList`로 조회합니다.
{% endhint %}

#### salesmap-batch-create-objects

레코드를 생성합니다. 1건부터 최대 100건까지 한 번에 생성합니다. v3 create API를 사용하므로 필드 값은 `fieldList` 타입 키가 아니라 필드명→값 형태로 전달합니다.

{% hint style="warning" %}
견적서는 이 도구로 생성할 수 없습니다. 상품 라인아이템·딜/리드 연결 등 전용 입력이 필요하므로 `salesmap-create-quote`를 사용하세요.

상품은 `properties`에 `이름`(필수)·`금액`(숫자, 필수)·`메모`(선택)·상품 데이터 필드(`유형`, `상태`, `코드`, `단위` 등)를 넣습니다. `설명`은 실제 상품 커스텀 필드가 있을 때만 사용합니다. 상품은 `associations`를 지원하지 않습니다.

딜·리드는 `associations`에 `메인 고객` 또는 `메인 회사` 중 하나가 반드시 있어야 합니다. 딜은 `properties["파이프라인 단계"]`(단계 이름)도 필수입니다.
{% endhint %}

| 파라미터                         | 타입     | 필수     | 설명                                                                                         |
| ---------------------------- | ------ | ------ | ------------------------------------------------------------------------------------------ |
| `objectType` | string | ✅ | `people` `organization` `deal` `lead` `product` (또는 한글 `고객` `회사` `딜` `리드` `상품`). 커스텀 오브젝트는 **정의 이름을 그대로** 입력 (예: `티켓(CRM)`) |
| `inputList`  | array  | ✅ | 생성할 레코드 목록(1~100건). 각 항목은 `properties`와 선택 `associations`를 가짐 |

`inputList` 항목 구조:

| 필드             | 타입     | 설명                                                                                       |
| -------------- | ------ | ---------------------------------------------------------------------------------------- |
| `properties`   | object | 필드 표시명 → 값. text=string, number=number/string, multiSelect=string[], checkbox=boolean, 빈 값=null |
| `associations` | object | 관계명 → 레코드 ID 배열. 예: `{ "메인 회사": ["organization-id"] }`                                  |
| `peopleId` | string | 기존 단건 생성 호환 편의값. `associations["메인 고객"]`으로 자동 변환 |
| `organizationId` | string | 기존 단건 생성 호환 편의값. `associations["메인 회사"]`로 자동 변환 |

{% hint style="info" %}
딜 생성 시 `properties["파이프라인 단계"]`는 단계 이름으로 넣고, 같은 단계명이 여러 파이프라인에 있으면 `properties["파이프라인"]`도 파이프라인 이름으로 함께 넣습니다. 딜은 `associations["메인 고객"]` 또는 `associations["메인 회사"]`가 필요합니다.
{% endhint %}

#### salesmap-update-object

기존 레코드를 수정합니다.

| 파라미터             | 타입     | 필수 | 설명                                                    |
| ---------------- | ------ | -- | ----------------------------------------------------- |
| `objectType`     | enum   | ✅  | `people` `organization` `deal` `lead` `custom-object` |
| `objectId`       | string | ✅  | 레코드 ID                                                |
| `properties`     | object |    | 변경할 필드 key-value                                      |
| `peopleId`       | string |    | 연결 고객 변경                                              |
| `organizationId` | string |    | 연결 회사 변경                                              |

#### salesmap-delete-object

기존 레코드를 삭제합니다.

| 파라미터         | 타입      | 필수 | 설명                     |
| ------------ | ------- | -- | ---------------------- |
| `objectType` | enum    | ✅  | `deal` `lead`          |
| `objectId`   | string  | ✅  | 레코드 ID                 |
| `confirmed`  | boolean |    | false=미리보기, true=실제 삭제 |

***

### 활동 이력

#### salesmap-list-engagements

레코드의 활동 타임라인을 조회합니다. 활동 유형별로 독립된 목록과 커서를 반환합니다.

| 파라미터         | 타입        | 필수 | 설명                                                                        |
| ------------ | --------- | -- | ------------------------------------------------------------------------- |
| `objectType` | string    | ✅  | `people` `organization` `deal` `lead` 또는 커스텀 오브젝트 이름                      |
| `objectId`   | string    | ✅  | 레코드 ID                                                                    |
| `types`      | enum\[]   |    | 조회할 활동 유형. `todo` `note` `recording` `meeting` `email` `alimtalk` `sms` (생략 시 전체) |
| `limit`      | number    |    | 유형별 반환 건수 (1\~50, 기본 5)                                                   |
| `after`      | string    |    | 페이지네이션 커서 (`types`로 유형을 한정한 뒤 사용)                                         |

**사용 예시:** "이 고객과 주고받은 이메일 이력 보여줘"

#### salesmap-list-changelog

레코드의 필드 변경 이력을 조회합니다 (누가·언제·무엇을 바꿨는지).

| 파라미터         | 타입       | 필수 | 설명                                    |
| ------------ | -------- | -- | ------------------------------------- |
| `objectType` | `enum`   | ✅  | `people` `organization` `deal` `lead` |
| `objectId`   | `string` | ✅  | 레코드 ID                                |
| `after`      | `string` |    | 페이지네이션 커서                             |

### 노트·견적서

#### salesmap-list-notes

노트 목록을 조회합니다. 담당자·유형·날짜·연결 레코드 기준으로 필터할 수 있습니다.

| 파라미터             | 타입     | 필수 | 설명                            |
| ---------------- | ------ | -- | ----------------------------- |
| `startDate`      | string |    | 작성일 시작 (예: 2026-01-01)        |
| `endDate`        | string |    | 작성일 종료 (예: 2026-06-30)        |
| `owner`          | string |    | 작성한 담당자 (사용자 이름 또는 userId)    |
| `type`           | string |    | 노트 유형 이름 (예: `미팅`, `콜`)       |
| `leadId`         | string |    | 연결된 리드 ID                     |
| `dealId`         | string |    | 연결된 딜 ID                      |
| `peopleId`       | string |    | 연결된 고객 ID                     |
| `organizationId` | string |    | 연결된 회사 ID                     |
| `after`          | string |    | 페이지네이션 커서                     |

**사용 예시:** "이번 주에 작성된 미팅 노트 모아줘"

#### salesmap-read-note

노트(메모)의 상세 내용을 조회합니다.

| 파라미터     | 타입     | 필수 | 설명      |
| -------- | ------ | -- | ------- |
| `noteId` | string | ✅  | 노트 UUID |

#### salesmap-create-note

레코드에 노트(메모)를 추가합니다.

| 파라미터         | 타입     | 필수 | 설명                                                    |
| ------------ | ------ | -- | ----------------------------------------------------- |
| `objectType` | enum   | ✅  | `people` `organization` `deal` `lead` `custom-object` |
| `objectId`   | string | ✅  | 대상 레코드 ID                                             |
| `note`       | string | ✅  | 노트 내용                                                 |

#### salesmap-get-quotes

딜/리드에 연결된 견적서 목록을 조회합니다.

| 파라미터         | 타입     | 필수 | 설명            |
| ------------ | ------ | -- | ------------- |
| `objectType` | enum   | ✅  | `deal` `lead` |
| `objectId`   | string | ✅  | 딜/리드 ID       |

#### salesmap-create-quote

견적서를 생성합니다. `dealId` 또는 `leadId` 중 하나를 지정해야 합니다.

| 파라미터               | 타입      | 필수     | 설명        |
| ------------------ | ------- | ------ | --------- |
| `name`             | string  | ✅      | 견적서 이름    |
| `dealId`           | string  | 조건부 필수 | 연결할 딜 ID  |
| `leadId`           | string  | 조건부 필수 | 연결할 리드 ID |
| `note`             | string  |        | 노트        |
| `isMainQuote`      | boolean |        | 메인 견적서 여부 |
| `quoteProductList` | array   |        | 상품 목록     |
| `properties`       | object  |        | 커스텀 필드    |

### 파이프라인·분석

#### salesmap-get-pipelines

파이프라인 목록과 각 단계의 ID를 조회합니다. 딜·리드 생성/검색 시 필요합니다.

| 파라미터         | 타입     | 필수 | 설명                                     |
| ------------ | ------ | -- | -------------------------------------- |
| `objectType` | string | ✅  | `deal` `lead` 또는 커스텀 오브젝트 이름 (예: `티켓`) |

#### salesmap-get-lead-time

딜/리드의 파이프라인 단계 별 체류 시간을 분석합니다.

| 파라미터         | 타입     | 필수 | 설명            |
| ------------ | ------ | -- | ------------- |
| `objectType` | enum   | ✅  | `deal` `lead` |
| `objectId`   | string | ✅  | 레코드 ID        |

**사용 예시:** "이 딜이 각 단계에서 며칠씩 걸렸는지 분석해줘"

### 서버 스크립트

#### salesmap-run-script

전용 도구로 답을 못 내는 대량 조회·분석의 최후수단입니다. AI가 작성한 JavaScript를 세일즈맵 서버에서 직접 실행하며, 수백 건 레코드를 순회·집계하는 작업을 도구 여러 번 호출 없이 단일 호출로 처리합니다 (최대 120초).

| 파라미터     | 타입     | 필수 | 설명                                                        |
| -------- | ------ | -- | --------------------------------------------------------- |
| `script` | string | ✅  | 실행할 JavaScript 코드. `salesmap.get/post/getAll`로 세일즈맵 API 호출 |

**사용 예시:** "전체 딜을 담당자별로 집계해서 합계 금액 알려줘"

{% hint style="info" %}
단건 조회·생성 같은 일반 작업엔 전용 도구가 자동 선택되고, run-script는 대량 순회·집계가 필요할 때만 사용됩니다.
{% endhint %}

### 유틸리티

#### salesmap-get-guide

세일즈맵 MCP 사용 가이드를 조회합니다. 오브젝트 모델·시나리오별 도구 조합·필드 입력 규칙·계산 수식 문법이 담겨 있어, AI가 세일즈맵 구조를 이해하는 데 사용합니다.

#### salesmap-get-api-ref

세일즈맵 REST API 레퍼런스 전문을 조회합니다. 주로 `salesmap-run-script` 작성 전에 AI가 엔드포인트·요청 형식을 확인하는 용도입니다.

#### salesmap-report-feedback

세일즈맵 MCP의 버그·부족한 기능·개선 요청을 개발팀에 전달합니다.

| 파라미터       | 타입     | 필수 | 설명                                                                  |
| ---------- | ------ | -- | ------------------------------------------------------------------- |
| `category` | enum   | ✅  | `bug` `missing-tool` `tool-limitation` `friction` `feature-request` |
| `summary`  | string | ✅  | 한 줄 요약                                                              |
| `detail`   | string | ✅  | 무엇을 하려 했고 왜 막혔는지                                                    |

#### salesmap-get-link

레코드의 세일즈맵 웹 URL을 생성합니다.

| 파라미터         | 타입     | 필수 | 설명                                                                      |
| ------------ | ------ | -- | ----------------------------------------------------------------------- |
| `objectType` | enum   | ✅  | `people` `organization` `deal` `lead` `custom-object` `product` `quote` |
| `objectId`   | string | ✅  | 레코드 ID                                                                  |

#### salesmap-list-users

CRM 사용자 목록을 조회합니다. 담당자 지정·변경 시 필요합니다.

| 파라미터    | 타입     | 필수 | 설명        |
| ------- | ------ | -- | --------- |
| `after` | string |    | 페이지네이션 커서 |

#### salesmap-list-teams

팀 목록 + 소속 멤버를 조회합니다.

| 파라미터    | 타입     | 필수 | 설명        |
| ------- | ------ | -- | --------- |
| `after` | string |    | 페이지네이션 커서 |

#### salesmap-get-user-details

현재 API 키 소유자의 정보를 조회합니다.

***

### 도구 권한

| 구분     | 도구 수 | 해당 도구                                                                                                                                                                                                                                                                                                       |
| ------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **읽기** | 21개  | list-objects, list-properties, list-associations, search-objects, batch-read-objects, list-engagements, list-changelog, list-notes, read-note, get-quotes, get-pipelines, get-lead-time, get-link, list-users, list-teams, get-user-details, get-guide, get-api-ref, list-products, list-sequences, list-webforms |
| **쓰기** | 7개   | create-property, batch-create-objects, update-object, create-note, create-quote, run-script, report-feedback                                                                                                                                                                                                        |
| **삭제** | 1개   | delete-object                                                                                                                                                                                                                                                                                                |

{% hint style="info" %}
모든 도구는 API 토큰 소유자의 권한 범위 안에서만 동작합니다. 읽기 전용 사용자의 토큰으로는 쓰기·삭제 도구를 사용할 수 없습니다.
{% endhint %}
