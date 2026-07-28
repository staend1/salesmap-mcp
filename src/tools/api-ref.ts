// AI용 세일즈맵 REST API 레퍼런스 — salesmap-get-api-ref 도구용
// 생성물입니다. 직접 수정하지 마세요.
//   원장:     docs/internal/api-ref-upstream.md  (그대로 보관 — 수정 금지)
//   오버레이: docs/internal/api-ref-overlay.md   (우리 지식 — 여기에 씀)
//   병합본:   docs/internal/api-ref-merged.md                          (LLM 병합 결과)
//   빌드:     node scripts/build-api-ref.mjs
export const SALESMAP_API_REF = `# AI용 문서

## 세일즈맵 API 레퍼런스

세일즈맵은 B2B 영업 CRM입니다. 이 문서는 세일즈맵 v2 REST API의 엔드포인트, 요청·응답 형식, 에러를 설명합니다.

> **문서 기준일: 2026-07-28.** 이 레퍼런스는 세일즈맵 개발팀이 API를 개발·수정할 때 갱신되며, 최신본은 <https://docs.salesmap.kr/developers/api-reference/ai#api> 에 게시됩니다.
>
> * **AI 에이전트:** 호출 결과(키·값·에러)가 이 문서와 다르면 API가 변경된 것일 수 있습니다. 그 경우 위 최신본을 확인하고, 문서보다 **실제 응답을 우선**하세요.
> * **To User:** 주기적으로(예: 분기마다) 위 링크에서 변경 사항을 확인해 통합을 갱신하길 권장합니다.

### 목차

* 오브젝트 모델 · 작업별 빠른 찾기 · 히스토리 vs 액티비티 · 기본 정보 · 공통 응답 형식 · 응답 키 주의 · 페이지네이션 · 에러 형식 · 필드 값 쓰기 (fieldList) · 엔드포인트 인덱스

**엔드포인트**

* 고객 (People)
* 회사 (Organization)
* 딜 (Deal)
* 리드 (Lead)
* 커스텀 오브젝트 (Custom Object)
* 견적서 · 상품 · 파이프라인 (Quote / Product / Pipeline)
* 통합 검색 · 연결관계 (Search & Association)
* 필드 · 파일 · 이메일 (Field / File / Email)
* 시퀀스 · 웹폼 · TODO · 메모 (Sequence / WebForm / Todo / Memo)
* 사용자 · 팀 (User / Team)

**웹훅 (Webhook)**

**부록**

* 삭제 API 요약
* 읽기전용 시스템 필드
* 베스트 프랙티스

### 오브젝트 모델

| 오브젝트              | 비즈니스 의미            | 영업 흐름에서의 역할                            |
| ----------------- | ------------------ | -------------------------------------- |
| 고객 (People)       | 실제 사람. 영업 대상 담당자.  | 모든 영업의 시작점. 이메일/전화로 연락하는 대상            |
| 회사 (Organization) | 고객이 소속된 기업.        | B2B에서 실제 계약 주체. 고객 여러 명이 한 회사에 속함      |
| 리드 (Lead)         | 아직 검증되지 않은 잠재 기회.  | "이 고객이 관심 있을 수도?" 단계. 확인 후 딜로 전환       |
| 딜 (Deal)          | 검증된 영업 기회. 매출과 직결. | "실제로 계약 가능성 있음" 단계. 파이프라인으로 진행 추적      |
| 파이프라인 (Pipeline)  | 딜/리드의 진행 단계 흐름.    | 영업 프로세스를 시각화. 예: 초기접촉→니즈파악→제안→협상→성사/실패 |
| 견적서 (Quote)       | 딜/리드에 연결된 가격 제안서.  | 고객에게 보내는 공식 가격표. 상품×수량×할인              |
| 상품 (Product)      | 판매하는 제품/서비스.       | 견적서에 포함되는 단위. 일반/구독(월간·연간)             |
| 시퀀스 (Sequence)    | 자동화된 이메일 캠페인.      | 고객에게 단계별로 이메일을 자동 발송. 오픈/클릭/회신 추적      |
| TODO              | 영업 담당자의 할 일.       | 전화, 미팅, 업무 등 follow-up 관리              |
| 메모 (Memo)         | 고객/딜 등에 남기는 내부 기록. | 미팅 노트, 상담 내용 등 팀 공유                    |
| 웹 폼 (WebForm)     | 외부 리드 수집 폼.        | 웹사이트에 삽입하여 문의/신청 자동 수집                 |
| 커스텀 오브젝트          | 워크스페이스별 맞춤 데이터.    | 계약, 프로젝트 등 기본 오브젝트로 안 되는 것             |

전형적인 흐름: 웹폼 제출 → 고객·회사 생성 → 리드 → 시퀀스 등록 → 딜 전환 → 파이프라인 진행 → 견적서 발송 → 성사/실패.

### 작업별 빠른 찾기 (Task → API)

사용자 요청을 보고 어떤 API를 쓸지 빠르게 고르는 표입니다.

| 하려는 것                       | API                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| 고객·회사·딜·리드 목록/단건 조회         | \`GET /v2/{type}\`, \`GET /v2/{type}/{id}\`                                                       |
| 고객·회사·딜·리드 생성/수정            | \`POST /v2/{type}\`, \`POST /v2/{type}/{id}\`                                                     |
| 커스텀 필드 값 넣기                 | 생성/수정 body의 \`fieldList\` ("필드 값 쓰기" 참조)                                                        |
| 고객을 회사에 연결 / 딜·리드에 고객·회사 연결 | 생성·수정 시 top-level \`organizationId\`·\`peopleId\`                                                 |
| 복합 조건 검색                    | \`POST /v2/object/{type}/search\`                                                               |
| 연결된 레코드 조회                  | \`GET /v2/object/{type}/{id}/association/{toType}/primary\` 또는 \`/custom\`                        |
| 필드 정의(이름·타입·옵션) 조회          | \`GET /v2/field/{type}\`                                                                        |
| 이메일 발송 / 이메일 첨부용 파일 업로드     | \`POST /v2/email\` / \`POST /v2/file\` (objectType·objectId 없이)                                   |
| 레코드에 파일 첨부 / 첨부 조회 / 파일 삭제  | \`POST /v2/file\` (+\`objectType\`·\`objectId\`) / \`GET /v2/file\` / \`POST /v2/file/{fileId}/delete\` |
| 견적서 생성 / 딜·리드 견적 조회         | \`POST /v2/quote\` / \\\`GET /v2/{deal                                                            |
| 노트(메모) 생성                   | 레코드 생성·수정 시 body \`memo\` (전용 생성 API 없음. "노트 / 메모" 섹션 참조)                                       |
| 노트 조회 / 유형 목록               | \`GET /v2/memo\` (필터 가능) / \`GET /v2/memo/type-list\`                                             |
| 변경 이력 / 활동(타임라인) 조회         | \`GET /v2/{type}/history\` / \`GET /v2/{type}/activity\`                                          |
| 삭제                          | "부록 > 삭제 API 요약" 참조 (딜·리드만 API 삭제 가능)                                                         |

> **생성 순서 (연결된 상태로 만들 때):** 연결 대상 ID(\`organizationId\`·\`peopleId\`)는 생성 시 검증되어 **이미 존재해야** 하며, 없으면 \`400\`(\`organizationId의 대상을 찾을 수 없습니다.\` 등)을 반환합니다. 따라서 처음부터 연결된 상태로 만들려면 **회사 → 고객 → 딜·리드** 순으로 생성하세요(부모를 먼저 만들고, 반환된 \`id\`를 자식 생성 body의 \`organizationId\`·\`peopleId\`로 전달). 순서를 지키지 않아도 각 오브젝트를 독립적으로 만든 뒤 수정 API(\`POST /v2/{type}/{id}\`)로 나중에 연결할 수 있습니다.

### 히스토리 vs 액티비티

여러 오브젝트가 \`…/history\`(히스토리)와 \`…/activity\`(액티비티) 두 종류의 타임라인을 제공합니다. \`…/activity\` 엔드포인트는 세일즈맵 GUI에서 \\*\\*"타임라인"\\*\\*이라는 이름으로 표시됩니다.

|       | 히스토리 (history)                      | 액티비티 (activity)      |
| ----- | ----------------------------------- | -------------------- |
| 기록 대상 | 필드 값 변경 내역                          | 이벤트/활동 타임라인          |
| 활용 예  | "담당자가 누구에서 누구로 바뀌었나"                | "이 고객에게 이메일 보낸 적 있나" |
| 핵심 필드 | \`fieldName\`, \`fieldValue\`, \`source\` | \`type\`, 관련 리소스 ID    |

**레코드 종류별 History / Activity 지원**

History·Activity 타임라인을 제공하는 레코드는 딜·리드·고객·회사·커스텀 오브젝트 5종입니다. 견적서·상품·노트(memo)·TODO는 제공하지 않습니다.

| 레코드      | \`{type}\` 경로값    | History | Activity |
| -------- | --------------- | ------- | -------- |
| 딜        | \`deal\`          | 지원      | 지원       |
| 리드       | \`lead\`          | 지원      | 지원       |
| 고객       | \`people\`        | 지원      | 지원       |
| 회사       | \`organization\`  | 지원      | 지원       |
| 커스텀 오브젝트 | \`custom-object\` | 지원      | 지원       |
| 견적서      | \`quote\`         | 미지원     | 미지원      |
| 상품       | \`product\`       | 미지원     | 미지원      |
| 노트       | \`memo\`          | 미지원     | 미지원      |
| TODO     | \`todo\`          | 미지원     | 미지원      |

* "지원" 레코드만 \`GET /v2/{type}/history\`, \`GET /v2/{type}/activity\`로 조회됩니다.
* "미지원" 레코드로 호출하면 엔드포인트가 없어 \`404\`(노트는 라우팅상 \`400\`)를 반환합니다.
* 견적서·상품·노트·TODO의 활동은 자체 타임라인이 아니라 연결된 딜·고객 등 상위 오브젝트의 activity에 기록됩니다.

### 기본 정보

| 항목       | 값                                                                |
| -------- | ---------------------------------------------------------------- |
| Base URL | \`https://salesmap.kr/api\`                                        |
| 버전       | \`v2\` (모든 경로는 \`/v2/...\`)                                          |
| 인증       | \`Authorization: Bearer <token>\` (모든 요청 필수)                       |
| 요청 본문    | \`Content-Type: application/json\` (파일 업로드만 \`multipart/form-data\`) |
| 레이트리밋    | 100 requests / 10초 (권장 호출 간격 0.1\\~0.15초)                         |

> API 토큰은 세일즈맵 웹 UI에서 발급합니다: **설정 > 개인 > 연동 > API > 토큰 생성**. **무료(Free) 또는 Professional 이상 플랜**에서 제공되며, **Starter 플랜은 API를 제공하지 않습니다.**

### 공통 응답 형식

성공 응답은 다음 구조를 따릅니다.

> ⚠️ **run-script 사용 시:** \`salesmap.get()\`/\`post()\`는 이 \`success\`/\`data\` 래퍼를 **벗겨서** 반환합니다. 스크립트에서는 \`r.dealList\`처럼 최상위 키로 접근하세요 (\`r.data.dealList\` 아님). 이 문서의 응답 예시는 래핑된 원형 기준입니다.

\`\`\`json
{ "success": true, "data": { ... } }
\`\`\`

* **목록 조회**: \`data.<리소스>List\` 배열과 \`data.nextCursor\`를 반환합니다. 예: \`peopleList\`, \`dealList\`, \`fieldList\`.
* **단건 조회**: 대부분 \`data.<리소스>\`를 **레코드 1건을 담은 배열**로 반환합니다. 예: \`GET /v2/people/{id}\` → \`data.people[0]\`. (커스텀 오브젝트·노트 단건은 단일 객체로 반환합니다.)
* **레코드 필드**: 기본·커스텀 필드가 **한글 키로 평탄하게** 포함됩니다. 관계형 필드는 \`{ id, name }\` 객체 또는 그 배열입니다.

\`\`\`json
{
  "success": true,
  "data": {
    "peopleList": [
      { "id": "...", "이름": "홍길동", "이메일": "hong@example.com",
        "회사": { "id": "...", "name": "예시" }, "팀": [ { "id": "...", "name": "..." } ] }
    ],
    "nextCursor": "..."
  }
}
\`\`\`

### 응답 키 주의 (위치마다 다른 키)

같은 개념이라도 엔드포인트마다 키 이름·형태가 다른 경우가 있습니다. JSON 파싱 시 아래를 따릅니다.

| 항목                                               | 키                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| 일반 레코드 식별자                                       | \`id\` (= \`RecordId\`)                                                 |
| 시퀀스·시퀀스 등록(enrollment) 식별자                       | **\`_id\`**                                                           |
| 파이프라인/단계 — \`GET /v2/pipeline\`                    | **\`_id\`**                                                           |
| 파이프라인/단계 — \`GET /v2/deal/pipeline\`·시퀀스 스텝        | \`id\`                                                                |
| 히스토리 API(\`GET .../history\`) \`fieldValue\`의 관계형 객체 | \`{ "_id", "name" }\` (히스토리 API는 \`_id\`)                               |
| 웹훅 \`beforeField\`/\`afterField\`의 관계형 객체            | \`{ "id", "name" }\` (웹훅은 히스토리 API와 달리 \`id\`)                          |
| 필드 선택지 — 생성(POST) 응답 / 조회(GET) 응답                | \`options\` / \`optionList\` (둘 다 \`[{id,value}]\`)                       |
| 연결관계 — primary / custom                          | \`associationIdList\`(문자열 배열) / \`associationItemList\`(\`[{id,label}]\`) |
| 웹훅 이벤트 종류 키                                      | \`history\` (\`event\` 아님)                                              |

### 페이지네이션

목록 조회는 커서 기반입니다. 응답의 \`data.nextCursor\` 값을 다음 요청의 \`cursor\` 쿼리 파라미터로 전달합니다. 결과가 더 없으면 \`nextCursor\`는 \`null\`이거나 응답에서 생략됩니다. 페이지 크기는 기본 50건입니다.

\`\`\`
GET /v2/people?cursor=<직전 응답의 nextCursor>
\`\`\`

### 에러 형식

에러 응답은 다음 구조를 따릅니다.

\`\`\`json
{ "success": false, "message": "<HTTP reason>", "reason": "<상세 사유>" }
\`\`\`

\`reason\`은 단일 문자열이거나, 입력 검증 실패 시 사유 문자열의 배열입니다.

\`\`\`json
{ "success": false, "message": "Bad Request", "reason": ["[name]: 필수 입력 사항입니다."] }
\`\`\`

| 코드  | 의미                                               |
| --- | ------------------------------------------------ |
| 400 | 잘못된 요청 — 필수값 누락, 입력 검증 실패, **또는 존재하지 않는 리소스 조회** |
| 401 | 인증 실패 — 토큰 누락/무효                                 |
| 403 | 권한 또는 플랜 제한                                      |
| 404 | 일부 경로/하위 리소스 없음                                  |
| 409 | 충돌 — 중복(예: 같은 이름의 필드)                            |
| 429 | 레이트리밋 초과                                         |
| 500 | 서버 오류                                            |

> **참고:** 존재하지 않는 리소스를 단건 조회하면 404가 아니라 \`400 Bad Request\`와 함께 \`…을 찾을 수 없습니다.\` 메시지를 반환합니다.

### 필드 값 쓰기 (fieldList)

생성·수정 API(\`POST /v2/people\`, \`/v2/deal\`, \`/v2/lead\`, \`/v2/organization\`, \`/v2/custom-object\` 등)에서 커스텀 필드 값은 \`fieldList\` 배열로 지정합니다. 각 항목은 \`{ "name": "<필드 한글 이름>", "<값 키>": <값> }\` 형태이며, **값 키는 필드 타입에 따라 다릅니다.**

> ⚠️ **무시되는(no-op) 파라미터 주의:** 아래 값들은 \`200\`을 반환하지만 **실제로는 반영되지 않습니다.** "변경 성공"으로 오판하지 말고, 필요하면 응답값이나 재조회로 반영 여부를 확인하세요.
>
> * **top-level \`ownerId\`(전 오브젝트)** — 담당자는 \`fieldList\`의 \`userValueId\`로만 변경됩니다.
> * **고객의 top-level \`email\`·\`phone\`** — 이메일·전화는 \`fieldList\`(\`이메일\`/\`전화\`)로만 저장됩니다.
> * **스키마에 없는 임의 파라미터**(예: \`foobar\`, \`amount\`) — 에러 없이 조용히 무시됩니다.

* \`name\`은 세일즈맵 워크스페이스의 **한글 필드 이름과 정확히 일치**해야 합니다. (필드 정의는 \`GET /v2/field/{type}\`로 조회)
* 선택형 필드의 값은 세일즈맵에 등록된 **옵션과 정확히 일치**해야 합니다. 미등록 값은 \`… 정의 되지 않은 값을 입력했습니다.\`를 반환합니다.
* 값 키를 잘못 쓰면 \`400\`과 함께 기대 키를 알려줍니다. 예: 관계형 필드에 \`stringValue\`를 보내면 \`["lead 팔로워에 userValueIdList가 없습니다."]\`.

#### 기본 타입

| 필드 타입       | 값 키               | 요청 예시                                                   | 저장/응답 형태                             |
| ----------- | ----------------- | ------------------------------------------------------- | ------------------------------------ |
| 텍스트         | \`stringValue\`     | \`{ "name": "이메일", "stringValue": "a@b.com" }\`           | \`"이메일": "a@b.com"\`                   |
| 숫자          | \`numberValue\`     | \`{ "name": "인센티브", "numberValue": 50000 }\`              | \`"인센티브": 50000\`                      |
| True/False  | \`booleanValue\`    | \`{ "name": "동의 여부", "booleanValue": true }\`             | \`"동의 여부": true\`                      |
| 날짜 / 날짜(시간) | \`dateValue\`       | \`{ "name": "생년월일", "dateValue": "1990-05-15" }\`         | \`"생년월일": "1990-05-14T15:00:00.000Z"\` |
| 단일 선택       | \`stringValue\`     | \`{ "name": "보류 사유", "stringValue": "예산 부족" }\`           | \`"보류 사유": "예산 부족"\`                   |
| 복수 선택       | \`stringValueList\` | \`{ "name": "관심 제품", "stringValueList": ["CRM","SeA"] }\` | \`"관심 제품": ["CRM","SeA"]\`             |

> **참고(날짜):** \`dateValue\`에 날짜만(\`"1990-05-15"\`) 보내면 KST→UTC 변환으로 9시간 이전 값으로 저장됩니다(\`1990-05-14T15:00:00.000Z\`). 시각까지 지정하려면 ISO8601(\`"..."\`)로 보냅니다.

> **참고(값 비우기):** 기본 타입 필드는 수정 API에서 값 키에 \`null\`을 보내면 값이 **빈 값으로 지워집니다**. 예: \`{ "name": "인센티브", "numberValue": null }\` → \`null\`. \`stringValue\`·\`dateValue\`도 동일합니다(관계 타입은 아래 참고).

#### 관계 타입

값은 대상 레코드의 **ID**(또는 ID 배열)이며, 응답은 \`{id, name}\` 객체(또는 그 배열)로 돌아옵니다.

| 필드 타입        | 값 키                                               | 요청 예시                                                      |
| ------------ | ------------------------------------------------- | ---------------------------------------------------------- |
| 사용자(단일)      | \`userValueId\`                                     | \`{ "name": "담당자", "userValueId": "<userId>" }\`             |
| 사용자(복수)      | \`userValueIdList\`                                 | \`{ "name": "팔로워", "userValueIdList": ["<userId>"] }\`       |
| 고객(단일/복수)    | \`peopleValueId\` / \`peopleValueIdList\`             | \`{ "name": "담당 고객", "peopleValueId": "<peopleId>" }\`       |
| 회사(단일/복수)    | \`organizationValueId\` / \`organizationValueIdList\` | \`{ "name": "거래처", "organizationValueId": "<orgId>" }\`      |
| 딜(복수)        | \`dealValueIdList\`                                 | \`{ "name": "관련 딜", "dealValueIdList": ["<dealId>"] }\`      |
| 리드(복수)       | \`leadValueIdList\`                                 | \`{ "name": "관련 리드", "leadValueIdList": ["<leadId>"] }\`     |
| 커스텀 오브젝트(복수) | \`customObjectValueIdList\`                         | \`{ "name": "관련 계약", "customObjectValueIdList": ["<id>"] }\` |
| 파이프라인 / 단계   | \`pipelineValueId\` / \`pipelineStageValueId\`        | \`{ "name": "파이프라인", "pipelineValueId": "<id>" }\`           |
| 시퀀스(단일/복수)   | \`sequenceValueId\` / \`sequenceValueIdList\`         | \`{ "name": "시퀀스", "sequenceValueId": "<id>" }\`             |
| 웹폼           | \`webformValueId\`                                  | \`{ "name": "유입 웹폼", "webformValueId": "<id>" }\`            |

> 커스텀 연결관계도 위 관계 키로 설정합니다. 예를 들어 딜의 커스텀 연결 필드(타입 \`multiCustomObject\`)에 \`customObjectValueIdList\`로 레코드를 연결하면, 연결관계 조회(\`.../association/.../custom\`)에 그 연결이 나타납니다.

> **참고(담당자):** 담당자/사용자 필드는 반드시 \`userValueId\`(ID)로 지정합니다. 사용자 이름을 \`stringValue\`로 보내면 \`담당자에 userValueId가 없습니다\`를 반환합니다.

> **참고(관계형 비우기):** 관계 타입 필드는 기본 타입과 달리 값 키에 \`null\`을 보내도 **지워지지 않습니다**(무시되어 기존 값 유지, \`200\`). 빈 문자열(\`""\`)이나 빈 배열(\`[]\`)을 보내면 \`400\`(\`… userValueId가 없습니다\` / \`… userValueIdList가 없습니다\`)을 반환합니다.

> **참고(딜 금액):** 딜 금액은 \`fieldList\`가 아니라 top-level \`price\` 파라미터로 보냅니다. \`fieldList\`에 \`금액\`을 넣으면 \`금액 값은 fieldList가 아닌 파라메터 입니다.\`를 반환합니다. 파이프라인/단계도 딜·리드 생성 시 \`pipelineId\`·\`pipelineStageId\` 파라미터로 지정합니다.

**fieldList 요청 예시**

\`\`\`json
{
  "name": "홍길동",
  "fieldList": [
    { "name": "보류 사유", "stringValue": "예산 부족" },
    { "name": "관심 제품", "stringValueList": ["CRM", "SeA"] },
    { "name": "팔로워", "userValueIdList": ["<userId>"] }
  ]
}
\`\`\`

***

### 엔드포인트 인덱스

전체 엔드포인트 목록입니다(상세는 아래 각 섹션).

**고객 (People)**

* \`GET /v2/people\` — 고객 목록 조회
* \`POST /v2/people\` — 고객 생성
* \`GET /v2/people/{peopleId}\` — 고객 상세 조회
* \`POST /v2/people/{peopleId}\` — 고객 수정
* \`GET /v2/people/activity\` — 고객 액티비티 조회
* \`GET /v2/people/history\` — 고객 히스토리 조회
* \`GET /v2/people-temp/{email}\` — 이메일로 고객 조회

**회사 (Organization)**

* \`GET /v2/organization\` — 회사 목록 조회
* \`GET /v2/organization/{organizationId}\` — 회사 단건 조회
* \`GET /v2/organization/activity\` — 회사 액티비티(활동 타임라인)
* \`GET /v2/organization/history\` — 회사 필드 변경 이력
* \`POST /v2/organization\` — 회사 생성
* \`POST /v2/organization/{organizationId}\` — 회사 수정

**딜 (Deal)**

* \`GET /v2/deal\` — 딜 목록 조회
* \`GET /v2/deal/{dealId}\` — 딜 상세 조회
* \`GET /v2/deal/pipeline\` — 딜 파이프라인(단계) 목록 조회
* \`GET /v2/deal/activity\` — 딜 액티비티 조회
* \`GET /v2/deal/history\` — 딜 히스토리(변경 이력) 조회
* \`GET /v2/deal/{dealId}/quote\` — 딜의 견적서 목록 조회
* \`POST /v2/deal\` — 딜 생성
* \`POST /v2/deal/{dealId}\` — 딜 수정
* \`POST /v2/deal/{dealId}/delete\` — 딜 삭제

**리드 (Lead)**

* \`GET /v2/lead\` — 리드 목록 조회
* \`GET /v2/lead/{leadId}\` — 리드 상세 조회
* \`GET /v2/lead/pipeline\` — 리드 파이프라인 조회
* \`GET /v2/lead/activity\` — 리드 액티비티 조회
* \`GET /v2/lead/history\` — 리드 히스토리 조회
* \`GET /v2/lead/{leadId}/quote\` — 리드 견적서 목록 조회
* \`POST /v2/lead\` — 리드 생성
* \`POST /v2/lead/{leadId}\` — 리드 수정
* \`POST /v2/lead/{leadId}/delete\` — 리드 삭제

**커스텀 오브젝트 (Custom Object)**

* \`GET /v2/custom-object-definitions\` — 커스텀 오브젝트 정의 목록 조회
* \`GET /v2/custom-object\` — 커스텀 오브젝트 목록 조회
* \`GET /v2/custom-object/{customObjectId}\` — 커스텀 오브젝트 단건 조회
* \`POST /v2/custom-object\` — 커스텀 오브젝트 생성
* \`POST /v2/custom-object/{customObjectId}\` — 커스텀 오브젝트 수정
* \`GET /v2/custom-object/history\` — 커스텀 오브젝트 히스토리 조회
* \`GET /v2/custom-object/activity\` — 커스텀 오브젝트 액티비티 조회
* \`POST /v2/custom-object-temp\` — 커스텀 오브젝트 임시 생성

**견적서 · 상품 · 파이프라인 (Quote / Product / Pipeline)**

* \`GET /v2/product\` — 상품 목록 조회
* \`POST /v2/product\` — 상품 생성
* \`POST /v2/quote\` — 견적서 생성
* \`GET /v2/{deal|lead}/{id}/quote\` — 딜/리드의 견적서 조회
* \`GET /v2/pipeline\` — 파이프라인 목록 조회

**통합 검색 · 연결관계 (Search & Association)**

* \`POST /v2/object/{targetType}/search\` — 오브젝트 검색
* \`GET /v2/object/{targetType}/{targetId}/association/{toTargetType}/primary\` — 기본 연결관계 조회
* \`GET /v2/object/{targetType}/{targetId}/association/{toTargetType}/custom\` — 커스텀 연결관계 조회

**필드 · 파일 · 이메일 (Field / File / Email)**

* \`GET /v2/field/{type}\` — 필드 정의 목록
* \`POST /v2/field/{type}\` — 필드 생성
* \`POST /v2/file\` — 파일 업로드 · 레코드 첨부
* \`GET /v2/file\` — 레코드 첨부파일 조회
* \`POST /v2/file/{fileId}/delete\` — 파일 삭제
* \`POST /v2/email\` — 이메일 발송
* \`GET /v2/email/{emailId}\` — 발송 이메일 단건 조회

**시퀀스 · 웹폼 · TODO · 메모 (Sequence / WebForm / Todo / Memo)**

* \`GET /v2/sequence\` — 시퀀스 목록 조회
* \`GET /v2/sequence/{sequenceId}\` — 시퀀스 상세 조회
* \`GET /v2/sequence/{sequenceId}/step\` — 스텝 목록 조회
* \`GET /v2/sequence/{sequenceId}/enrollment\` — 등록 목록 조회
* \`GET /v2/sequence/enrollment/{enrollId}/timeline\` — 등록 타임라인 조회
* \`GET /v2/webForm\` — 웹폼 목록 조회
* \`GET /v2/webForm/{webFormId}/submit\` — 웹폼 제출 목록 조회
* \`GET /v2/todo\` — TODO 목록 조회
* \`GET /v2/memo\` — 노트 목록 조회
* \`GET /v2/memo/{memoId}\` — 노트 상세 조회
* \`GET /v2/memo/type-list\` — 노트 유형 목록 조회

**사용자 · 팀 (User / Team)**

* \`GET /v2/user\` — 사용자 목록 조회
* \`GET /v2/user/me\` — 현재 사용자 조회
* \`GET /v2/team\` — 팀 목록 조회

***

## 엔드포인트

***

### 고객 (People)

고객(People)은 실제 영업 대상인 사람(담당자)입니다. 이메일·전화로 연락하며, 회사(Organization)에 소속되고 딜/리드의 주체가 됩니다.

**공통 사항**

* Base: \`https://salesmap.kr/api\`. 모든 경로는 \`/v2/...\` 입니다.
* 헤더: \`Authorization: Bearer <token>\` (필수). 쓰기 요청은 \`Content-Type: application/json\`을 함께 보냅니다.
* 성공 envelope: \`{ "success": true, "data": { ... } }\`.
* 에러 envelope: \`{ "success": false, "message": "<HTTP reason>", "reason": <string | string[]> }\`.

> **참고:** 존재하지 않는 고객을 조회하거나 수정하면 \`404\`가 아니라 \`400 Bad Request\`와 \`"고객을 찾을 수 없습니다."\` 메시지를 반환합니다(이 경우 \`reason\`은 문자열입니다). 잘못된 경로로 요청하면 JSON이 아니라 마케팅 HTML이 반환되므로 경로를 정확히 지정합니다.

> **참고:** 고객 레코드를 삭제하는 API는 제공되지 않습니다. \`DELETE /v2/people/{id}\`는 \`405 Method Not Allowed\`를 반환합니다. 고객 레코드는 세일즈맵 GUI에서만 삭제할 수 있습니다.

***

#### GET /v2/people — 고객 목록 조회

고객 레코드 목록을 페이지네이션으로 조회합니다.

**요청 파라미터**

| 이름       | 위치    | 타입           |  필수 | 설명                                                              |
| -------- | ----- | ------------ | :-: | --------------------------------------------------------------- |
| \`cursor\` | query | string(UUID) |  선택 | 페이지네이션 커서. 직전 응답의 \`data.nextCursor\`를 전달합니다. 미전달 시 첫 페이지를 반환합니다. |

**응답** \`200 OK\`

\`data.peopleList\`는 고객 레코드 배열입니다. 각 레코드의 커스텀 필드는 평탄한 한글 키로 포함되며, 관계형 값은 \`{id,name}\`(단일) 또는 그 배열로 제공됩니다. \`data.nextCursor\`가 \`null\`이면 마지막 페이지입니다.

\`\`\`json
{
  "success": true,
  "data": {
    "peopleList": [
      {
        "id": "...",
        "organizationId": "...",
        "RecordId": "...",
        "이름": "...",
        "이메일": "...",
        "전화": "...",
        "담당자": { "id": "...", "name": "..." },
        "팀": [ { "id": "...", "name": "..." } ],
        "소스": "...",
        "고객 여정 단계": "...",
        "수신 거부 여부": false
      }
    ],
    "nextCursor": null
  }
}
\`\`\`

주요 응답 필드:

| 키                               | 타입                   | 설명                                         |
| ------------------------------- | -------------------- | ------------------------------------------ |
| \`id\`                            | string(UUID)         | 고객 PK                                      |
| \`organizationId\`                | string(UUID) \\| null | 소속 회사                                      |
| \`RecordId\`                      | string(UUID)         | \`id\`와 동일한 값                                |
| \`이름\`                            | string               | 표시명(생성 시 \`name\`)                           |
| \`이메일\`                           | string               | 이메일                                        |
| \`전화\`                            | string               | 전화번호                                       |
| \`담당자\`                           | object \`{id,name}\`   | 담당자(owner). 생성/수정 입력 시에는 \`ownerId\`를 사용합니다. |
| \`팀\`                             | array \`[{id,name}]\`  | 소속 팀                                       |
| \`소스\`                            | string               | 유입경로(select)                               |
| \`고객 여정 단계\`                      | string               | 고객 여정 단계(select)                           |
| \`수신 거부 여부\`                      | boolean              | 수신 거부 여부                                   |
| \`직무\`/\`직책\`/\`직함\`                  | string               | 직무 정보                                      |
| \`딜 개수\`/\`리드 개수\`/\`총 매출\` 등         | int                  | 읽기 전용 집계                                   |
| \`생성 날짜\`/\`수정 날짜\`                 | string(ISO8601)      | 생성·수정 일시                                   |
| \`최근 고객 활동일\`/\`최근 연락일\`/\`최근 이메일 *\` | string \\| null       | 읽기 전용                                      |

> **참고:** 한 페이지의 레코드 수는 워크스페이스 데이터에 따라 달라지며, 데이터가 적어도 \`nextCursor\`가 채워질 수 있습니다. 페이지네이션 종료는 \`nextCursor === null\`로 판단합니다.

> **참고:** 레코드 전체 필드 구성은 워크스페이스 필드 설정에 따라 달라집니다. 필드의 권위 있는 정의는 \`GET /v2/field/people\`에서 확인합니다.

**에러**

| 코드  | message               | reason                             | 조건                  |
| --- | --------------------- | ---------------------------------- | ------------------- |
| 401 | Unauthorized          | \`"헤더에서 Authorization을 찾을 수 없습니다."\` | Authorization 헤더 없음 |
| 401 | Unauthorized          | \`"유효하지 않은 토큰입니다."\`                 | 토큰 무효               |
| 429 | Too Many Requests     | —                                  | 100req/10초 초과       |
| 500 | Internal Server Error | —                                  | 서버 오류               |

***

#### POST /v2/people — 고객 생성

새 고객 레코드를 생성합니다.

**요청 파라미터** (body, \`application/json\`)

| 이름               | 타입                     |  필수 | 설명                                                        |
| ---------------- | ---------------------- | :-: | --------------------------------------------------------- |
| \`name\`           | string                 |  필수 | 고객 이름                                                     |
| \`organizationId\` | string(UUID)           |  선택 | 소속 회사 연결                                                  |
| \`fieldList\`      | array \`[{name, <값키>}]\` |  선택 | 이메일·전화·담당자 등 나머지 값을 설정. 값 키는 필드 타입에 따라 다릅니다("필드 값 쓰기" 참조) |
| \`memo\`           | string                 |  선택 | 이 고객에 텍스트 노트를 생성합니다("노트 / 메모" 섹션 참조).                     |

> **참고:** OpenAPI에 표기된 top-level \`email\`·\`phone\`·\`ownerId\`는 실제로 저장되지 않습니다. 이메일·전화는 \`fieldList\`의 \`이메일\`·\`전화\`(\`stringValue\`)로, 담당자는 \`담당자\`(\`userValueId\`)로 설정합니다.

**요청 예시**

\`\`\`json
{
  "name": "홍길동",
  "organizationId": "<orgId>",
  "fieldList": [
    { "name": "이메일", "stringValue": "hong@example.com" },
    { "name": "전화", "stringValue": "010-1234-5678" },
    { "name": "담당자", "userValueId": "<userId>" }
  ]
}
\`\`\`

**응답** \`201 Created\`

성공 시 \`data.people\`는 생성된 레코드의 축약 객체를 반환합니다.

\`\`\`json
{
  "success": true,
  "data": {
    "people": {
      "id": "...",
      "name": "...",
      "createdAt": "..."
    }
  }
}
\`\`\`

> **참고:** 이메일은 중복될 수 없습니다. \`fieldList\`의 \`이메일\`에 이미 존재하는 값을 넣으면 \`400 Bad Request\`와 \`이미 존재하는 이메일입니다\`를 반환합니다.

> **참고:** \`ownerId\`는 생성 시 유효성 검증을 거치지 않습니다. 존재하지 않는 \`ownerId\`를 보내면 해당 값은 무시되고 고객이 정상 생성됩니다. 반면 \`organizationId\`는 검증되어 존재하지 않으면 \`400\`을 반환합니다.

**에러**

| 코드  | message           | reason                               | 조건                                      |
| --- | ----------------- | ------------------------------------ | --------------------------------------- |
| 400 | Bad Request       | \`["[name]: 필수 입력 사항입니다."]\`           | \`name\` 누락(빈 바디 \`{}\` 포함). reason은 배열입니다. |
| 400 | Bad Request       | \`"organizationId의 대상을 찾을 수 없습니다."\`   | 존재하지 않는 \`organizationId\`                |
| 400 | Bad Request       | \`"people 유입경로에 정의 되지 않은 값을 입력했습니다."\` | select 필드(\`소스\` 등)에 정의되지 않은 옵션값 입력       |
| 401 | Unauthorized      | (위 401 reason과 동일)                   | 인증 실패                                   |
| 429 | Too Many Requests | —                                    | 레이트리밋 초과                                |

***

#### GET /v2/people/{peopleId} — 고객 상세 조회

고객 한 명의 상세 정보를 조회합니다.

**요청 파라미터**

| 이름         | 위치   | 타입           |  필수 | 설명    |
| ---------- | ---- | ------------ | :-: | ----- |
| \`peopleId\` | path | string(UUID) |  필수 | 고객 ID |

**응답** \`200 OK\`

\`data.people\`는 레코드 1건을 담은 배열입니다(\`data.people[0]\`으로 접근). 레코드는 목록 조회와 동일한 스키마(평탄한 한글 키)로 제공됩니다.

\`\`\`json
{ "success": true, "data": { "people": [ { "id": "...", "이름": "...", "이메일": "...", "담당자": { "id": "...", "name": "..." } } ] } }
\`\`\`

**에러**

| 코드  | message               | reason             | 조건         |
| --- | --------------------- | ------------------ | ---------- |
| 400 | Bad Request           | \`"고객을 찾을 수 없습니다."\` | 존재하지 않는 ID |
| 401 | Unauthorized          | (위 401 reason과 동일) | 인증 실패      |
| 429 | Too Many Requests     | —                  | 레이트리밋 초과   |
| 500 | Internal Server Error | —                  | 서버 오류      |

***

#### POST /v2/people/{peopleId} — 고객 수정

고객 레코드의 필드를 수정합니다.

**요청 파라미터**

| 이름               | 위치   | 타입                     |  필수 | 설명                                                        |
| ---------------- | ---- | ---------------------- | :-: | --------------------------------------------------------- |
| \`peopleId\`       | path | string(UUID)           |  필수 | 수정 대상 고객 ID                                               |
| \`name\`           | body | string                 |  선택 | 고객 이름                                                     |
| \`organizationId\` | body | string(UUID)           |  선택 | 소속 회사 ID                                                  |
| \`fieldList\`      | body | array \`[{name, <값키>}]\` |  선택 | 이메일·전화·담당자 등 나머지 값을 설정. 값 키는 필드 타입에 따라 다릅니다("필드 값 쓰기" 참조) |
| \`memo\`           | body | string                 |  선택 | 이 고객에 텍스트 노트를 생성합니다("노트 / 메모" 섹션 참조).                     |

> **참고:** OpenAPI에 표기된 top-level \`email\`·\`phone\`·\`ownerId\`는 실제로 저장되지 않습니다(무시됨). 생성과 동일하게, 이메일·전화는 \`fieldList\`의 \`이메일\`·\`전화\`(\`stringValue\`)로, 담당자는 \`담당자\`(\`userValueId\`)로 설정합니다.

> **참고:** 모든 body 필드는 선택입니다. 빈 바디 \`{}\`를 보내면 변경 없이 \`200 OK\`를 반환합니다.

**요청 예시** (path: \`peopleId = <peopleId>\`)

\`\`\`json
{
  "name": "홍길동",
  "fieldList": [
    { "name": "이메일", "stringValue": "hong@example.com" },
    { "name": "전화", "stringValue": "010-1234-5678" },
    { "name": "담당자", "userValueId": "<userId>" }
  ]
}
\`\`\`

**응답** \`200 OK\`

성공 시 \`data.people\`는 수정된 레코드의 축약 객체를 반환합니다.

\`\`\`json
{
  "success": true,
  "data": {
    "people": {
      "id": "...",
      "name": "...",
      "updatedAt": "..."
    }
  }
}
\`\`\`

**에러**

| 코드  | message               | reason                               | 조건                       |
| --- | --------------------- | ------------------------------------ | ------------------------ |
| 400 | Bad Request           | \`"고객을 찾을 수 없습니다."\`                   | 존재하지 않는 \`peopleId\`       |
| 400 | Bad Request           | \`"organizationId의 대상을 찾을 수 없습니다."\`   | 존재하지 않는 \`organizationId\` |
| 400 | Bad Request           | \`"people 유입경로에 정의 되지 않은 값을 입력했습니다."\` | select 필드에 정의되지 않은 값 입력  |
| 401 | Unauthorized          | (위 401 reason과 동일)                   | 인증 실패                    |
| 429 | Too Many Requests     | —                                    | 레이트리밋 초과                 |
| 500 | Internal Server Error | —                                    | 서버 오류                    |

***

#### GET /v2/people/activity — 고객 액티비티 조회

고객의 이메일·웹폼·노트·TODO 등 영업 활동(engagement)을 조회합니다.

**요청 파라미터**

| 이름         | 위치    | 타입           |  필수 | 설명                                       |
| ---------- | ----- | ------------ | :-: | ---------------------------------------- |
| \`peopleId\` | query | string(UUID) |  선택 | 특정 고객으로 필터링합니다. 생략 시 전체 고객의 액티비티를 반환합니다. |
| \`cursor\`   | query | string(UUID) |  선택 | 페이지네이션 커서                                |

**응답** \`200 OK\`

\`data.peopleActivityList\`는 액티비티 레코드 배열입니다. 해당 없는 항목은 \`null\`입니다.

\`\`\`json
{
  "success": true,
  "data": {
    "peopleActivityList": [
      {
        "id": "...",
        "type": "email",
        "date": "...",
        "peopleId": "...",
        "emailId": "...",
        "messageId": "...",
        "threadId": "...",
        "webFormId": null,
        "webFormName": null,
        "smsId": null,
        "memoId": null,
        "todoId": null,
        "documentId": null,
        "documentName": null
      }
    ],
    "nextCursor": null
  }
}
\`\`\`

액티비티 레코드 키: \`id\`, \`type\`(예: \`"create"\`, \`"email"\`), \`date\`(ISO8601), \`peopleId\`, \`emailId\`, \`messageId\`, \`threadId\`, \`webFormId\`, \`webFormName\`, \`smsId\`, \`memoId\`, \`todoId\`, \`documentId\`, \`documentName\`.

**에러**

| 코드  | message               | reason             | 조건    |
| --- | --------------------- | ------------------ | ----- |
| 401 | Unauthorized          | (위 401 reason과 동일) | 인증 실패 |
| 500 | Internal Server Error | —                  | 서버 오류 |

***

#### GET /v2/people/history — 고객 히스토리 조회

고객의 담당자·이메일·필드 변경 이력(audit)을 조회합니다.

**요청 파라미터**

| 이름         | 위치    | 타입           |  필수 | 설명                                        |
| ---------- | ----- | ------------ | :-: | ----------------------------------------- |
| \`peopleId\` | query | string(UUID) |  선택 | 특정 고객으로 필터링합니다. 생략 시 전체 고객의 변경 이력을 반환합니다. |
| \`cursor\`   | query | string(UUID) |  선택 | 페이지네이션 커서                                 |

**응답** \`200 OK\`

\`data.peopleHistoryList\`는 변경 이력 레코드 배열입니다.

\`\`\`json
{
  "success": true,
  "data": {
    "peopleHistoryList": [
      {
        "id": "...",
        "peopleId": "...",
        "type": "editField",
        "source": { "type": "...", "id": "...", "name": "..." },
        "organization": null,
        "fieldName": "...",
        "fieldValue": { "_id": "...", "name": "..." },
        "ownerId": "...",
        "createdAt": "..."
      }
    ],
    "nextCursor": null
  }
}
\`\`\`

히스토리 레코드 키: \`id\`, \`peopleId\`, \`type\`(예: \`"editField"\`), \`source\`(\`{type,id,name}\`), \`organization\`, \`fieldName\`(string), \`fieldValue\`, \`ownerId\`, \`createdAt\`(ISO8601). \`fieldValue\`는 필드 타입에 따라 string, number, 또는 객체로 가변하며, 관계형 필드일 때는 \`{_id, name}\` 형태입니다.

**에러**

| 코드  | message               | reason             | 조건    |
| --- | --------------------- | ------------------ | ----- |
| 401 | Unauthorized          | (위 401 reason과 동일) | 인증 실패 |
| 500 | Internal Server Error | —                  | 서버 오류 |

***

#### GET /v2/people-temp/{email} — 이메일로 고객 조회

이메일 주소로 고객 한 명을 조회합니다(예: 웹폼·이메일 수신자 매칭).

**요청 파라미터**

| 이름      | 위치   | 타입     |  필수 | 설명                            |
| ------- | ---- | ------ | :-: | ----------------------------- |
| \`email\` | path | string |  필수 | 조회할 고객 이메일. URL 경로에 그대로 넣습니다. |

**응답** \`200 OK\`

\`data.people\`는 레코드 1건을 담은 배열입니다(\`data.people[0]\`으로 접근). 레코드는 목록·상세 조회와 동일한 스키마(평탄한 한글 키)로 제공됩니다.

\`\`\`json
{ "success": true, "data": { "people": [ { "id": "...", "이름": "...", "이메일": "..." } ] } }
\`\`\`

**에러**

| 코드  | message               | reason             | 조건          |
| --- | --------------------- | ------------------ | ----------- |
| 400 | Bad Request           | \`"고객을 찾을 수 없습니다."\` | 매칭되는 이메일 없음 |
| 401 | Unauthorized          | (위 401 reason과 동일) | 인증 실패       |
| 429 | Too Many Requests     | —                  | 레이트리밋 초과    |
| 500 | Internal Server Error | —                  | 서버 오류       |

***

### 회사 (Organization)

회사(Organization)는 B2B 영업의 거래 대상 기업으로, 고객(People)의 상위 개념입니다. 같은 회사에 여러 고객·딜·리드가 속합니다.

Base: \`https://salesmap.kr/api\` · 버전 **v2** · 인증 \`Authorization: Bearer <token>\` (필수).

**엔드포인트 요약**

| 메서드  | 경로                                  | 용도               |
| ---- | ----------------------------------- | ---------------- |
| GET  | \`/v2/organization\`                  | 회사 목록 조회         |
| GET  | \`/v2/organization/{organizationId}\` | 회사 단건 조회         |
| GET  | \`/v2/organization/activity\`         | 회사 액티비티(활동 타임라인) |
| GET  | \`/v2/organization/history\`          | 회사 필드 변경 이력      |
| POST | \`/v2/organization\`                  | 회사 생성            |
| POST | \`/v2/organization/{organizationId}\` | 회사 수정            |

> **참고:**
>
> * 단건 조회 응답의 \`data.organization\`은 객체가 아니라 1요소 배열이므로 \`data.organization[0]\`으로 접근합니다.
> * 존재하지 않거나 UUID 형식이 아닌 id를 조회하면 \`400 Bad Request\`와 \`회사를 찾을 수 없습니다.\` 메시지를 반환합니다.
> * 수정 요청 바디는 커스텀 필드를 \`fieldList\` 키로 전달합니다(목록 응답의 평탄한 한글 키와 다릅니다). 값 키는 필드 타입에 따라 다릅니다("필드 값 쓰기" 참조).
> * 잘못된 경로로 요청하면 JSON이 아니라 마케팅 HTML이 반환되므로 경로를 정확히 사용합니다.

***

#### GET /v2/organization — 회사 목록 조회

회사 레코드 목록을 페이지네이션으로 조회합니다.

**요청 파라미터**

| 이름       | 위치    | 타입     |  필수 | 설명                                                                                                                  |
| -------- | ----- | ------ | :-: | ------------------------------------------------------------------------------------------------------------------- |
| \`cursor\` | query | string | 아니오 | 페이지네이션 커서. 직전 응답의 \`data.nextCursor\` 값을 그대로 전달합니다. 마지막 페이지 이후에는 \`organizationList\`가 \`[]\`, \`nextCursor\`가 \`null\`이 됩니다. |

**응답** \`200 OK\`

\`\`\`json
{ "success": true, "data": { "organizationList": [ { "...레코드..." } ], "nextCursor": "..." } }
\`\`\`

* \`data.organizationList[]\`: 회사 레코드 배열. 커스텀 필드가 평탄한 한글 키로 포함됩니다.
* \`data.nextCursor\`: string | null. 다음 페이지 커서이며, 다음 페이지가 없으면 \`null\`입니다.

레코드 수가 적어도 \`nextCursor\`에 값이 채워질 수 있습니다. 빈 배열 또는 \`nextCursor: null\`이 나올 때까지 따라가면 종료됩니다.

레코드 키:

\`\`\`
id, RecordId, 이름, 주소, 웹 주소, 전화, 업종, 직원수, 프로필 사진,
담당자:{id,name}, 팀:[{id,name}],
딜 개수, 리드 개수, 연결된 고객 수, 진행중 딜 개수, 성사된 딜 개수, 실패된 딜 개수,
종료된 딜 수, 총 매출, 최근 딜 성사 날짜, 최근 성사된 딜 금액,
전체 TODO, 완료 TODO, 미완료 TODO, 다음 TODO 날짜,
최근 작성된 노트, 최근 노트 작성일, 최근 노트 작성자:{id,name},
최근 제출된 웹폼:{id,name}, 최근 웹폼 제출 날짜, 제출된 웹폼 목록:[{id,name}]|null,
생성 날짜, 수정 날짜,
+ 워크스페이스 커스텀 필드(예: "매출(억)", "유형 매출누계" 등; 값 없으면 null)
\`\`\`

\`id\`와 \`RecordId\`는 동일한 UUID입니다. 관계형 값은 \`{id,name}\` 객체 또는 그 배열이며, 값이 없으면 \`null\`입니다.

**에러**

| HTTP | message      | reason                           | 조건                  |
| ---- | ------------ | -------------------------------- | ------------------- |
| 401  | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\` | Authorization 헤더 누락 |
| 401  | Unauthorized | \`유효하지 않은 토큰입니다.\`                 | 토큰 무효               |

***

#### GET /v2/organization/{organizationId} — 회사 단건 조회

회사 한 건의 상세 정보를 조회합니다.

**요청 파라미터**

| 이름               | 위치   | 타입           |  필수 | 설명        |
| ---------------- | ---- | ------------ | :-: | --------- |
| \`organizationId\` | path | string(UUID) |  필수 | 조회할 회사 id |

**응답** \`200 OK\`

\`data.organization\`은 레코드 1건을 담은 배열입니다. 접근은 \`data.organization[0]\`로 합니다. 레코드 형태는 목록 조회와 동일한 평탄 한글 키 구조입니다.

\`\`\`json
{ "success": true, "data": { "organization": [ { "...목록과 동일한 레코드..." } ] } }
\`\`\`

**에러**

| HTTP | message      | reason                                              | 조건                           |
| ---- | ------------ | --------------------------------------------------- | ---------------------------- |
| 400  | Bad Request  | \`회사를 찾을 수 없습니다.\`                                    | 존재하지 않는 id 또는 UUID 형식이 아닌 id |
| 401  | Unauthorized | \`유효하지 않은 토큰입니다.\` / \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 실패                        |

***

#### GET /v2/organization/activity — 회사 액티비티(활동 타임라인)

회사와 관련된 모든 활동(이메일·미팅·웹폼·메모·TODO·생성 등)을 시계열로 조회합니다.

**요청 파라미터**

| 이름               | 위치    | 타입           |  필수 | 설명                                      |
| ---------------- | ----- | ------------ | :-: | --------------------------------------- |
| \`organizationId\` | query | string(UUID) | 아니오 | 특정 회사로 필터합니다. 생략하면 워크스페이스 전체 활동을 반환합니다. |
| \`cursor\`         | query | string       | 아니오 | 페이지네이션 커서(페이지당 50건).                    |

**응답** \`200 OK\`

\`\`\`json
{ "success": true, "data": { "organizationActivityList": [ { "...": "..." } ], "nextCursor": "..." } }
\`\`\`

항목 스키마(고정 키, 해당 없으면 \`null\`):

\`\`\`
{ id, type, date, organizationId, emailId, messageId, threadId,
  webFormId, webFormName, smsId, memoId, todoId }
\`\`\`

\`type\` 값: \`create\`, \`email\`, \`emailOpen\`, \`webFormSubmit\`, \`memoCreate\`, \`meeting\`, \`todoCreate\`. \`todoCreate\`는 \`todoId\`가 채워집니다. type 목록은 폐쇄형으로 가정하지 않습니다.

**에러**

| HTTP | message      | reason                                              | 조건    |
| ---- | ------------ | --------------------------------------------------- | ----- |
| 401  | Unauthorized | \`유효하지 않은 토큰입니다.\` / \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 실패 |

***

#### GET /v2/organization/history — 회사 필드 변경 이력

회사 레코드의 필드 값 변경 이력(누가·언제·무엇을 무엇으로 변경했는지)을 조회합니다.

**요청 파라미터**

| 이름               | 위치    | 타입           |  필수 | 설명                            |
| ---------------- | ----- | ------------ | :-: | ----------------------------- |
| \`organizationId\` | query | string(UUID) | 아니오 | 특정 회사로 필터합니다. 생략하면 전체를 반환합니다. |
| \`cursor\`         | query | string       | 아니오 | 페이지네이션 커서(페이지당 50건).          |

**응답** \`200 OK\`

\`\`\`json
{ "success": true, "data": { "organizationHistoryList": [ { "...": "..." } ], "nextCursor": "..." } }
\`\`\`

항목 스키마:

\`\`\`
{ id, organizationId, type, source, fieldName, fieldValue, ownerId, createdAt }
\`\`\`

* \`type\`: \`editField\`.
* \`source\`: 변경 출처를 나타내는 객체 \`{ type, id, name }\`.
  * \`{"type":"field","id":null,"name":null}\` — 시스템 집계 필드 자동 갱신
  * \`{"type":"user","id":"<userId>","name":"<유저명>"}\` — 사용자에 의한 변경
* \`fieldName\`: 변경된 필드의 한글 이름(예: \`이름\`, \`담당자\`, \`딜 개수\`, \`매출(억)\`, \`업종\`).
* \`fieldValue\`: 스칼라(string/number) 또는 관계형 객체 \`{"_id":"<id>","name":"<이름>"}\`(예: \`담당자\`). 관계형 값은 \`_id\` 키를 사용합니다.
* \`ownerId\`: 변경 주체의 userId(UUID).

**에러**

| HTTP | message      | reason                                              | 조건    |
| ---- | ------------ | --------------------------------------------------- | ----- |
| 401  | Unauthorized | \`유효하지 않은 토큰입니다.\` / \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 실패 |

***

#### POST /v2/organization — 회사 생성

새 회사 레코드를 생성합니다.

**요청 파라미터** (body, \`Content-Type: application/json\`)

| 이름          | 타입                      |  필수 | 설명                                                       |
| ----------- | ----------------------- | :-: | -------------------------------------------------------- |
| \`name\`      | string (1자 이상)          |  필수 | 회사명                                                      |
| \`ownerId\`   | string(UUID)            | 아니오 | 담당자 userId                                               |
| \`fieldList\` | array of \`{name, <값키>}\` |  선택 | 커스텀 필드 값. 값 키는 필드 타입에 따라 다릅니다("필드 값 쓰기" 참조). 배열이 아니면 400 |
| \`memo\`      | string                  |  선택 | 이 회사에 텍스트 노트를 생성합니다("노트 / 메모" 섹션 참조).                    |

**요청 예시**

\`\`\`json
{
  "name": "예시 회사",
  "ownerId": "...",
  "fieldList": [
    { "name": "직원수", "numberValue": 120 }
  ]
}
\`\`\`

**응답** \`201 Created\`

\`\`\`json
{ "success": true, "data": { "organization": {
  "id": "...", "name": "...", "ownerId": "...", "ownerName": "...",
  "createdAt": "..." } } }
\`\`\`

**에러**

| HTTP | message      | reason                                              | 조건                                                                            |
| ---- | ------------ | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| 400  | Bad Request  | \`["[name]: 필수 입력 사항입니다."]\`                          | \`name\` 누락(빈 바디 \`{}\` 포함)                                                       |
| 400  | Bad Request  | \`["[name]: 1자 이상 입력해주세요."]\`                         | \`name\`이 빈 문자열                                                                 |
| 400  | Bad Request  | \`["[name]: 형식에 맞게 입력해주세요."]\`                        | \`name\`이 문자열이 아님 / \`fieldList\`가 배열이 아님                                         |
| 400  | Bad Request  | \`이미 존재하는 이름입니다\` (+ \`data:{id,name}\`)                | 중복 회사명. \`reason\`은 string이며 \`data.id\`에 기존 회사가 반환되므로, 이 값으로 기존 회사를 재사용할 수 있습니다. |
| 401  | Unauthorized | \`유효하지 않은 토큰입니다.\` / \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 실패                                                                         |

> **참고:** 검증 실패 \`reason\`은 배열(\`["[name]: …"]\`)이고, 리소스·중복 류 \`reason\`은 string입니다. 두 형태를 모두 처리해야 합니다.

***

#### POST /v2/organization/{organizationId} — 회사 수정

회사 레코드를 수정합니다.

**요청 파라미터**

| 이름               | 위치   | 타입                      |  필수 | 설명                                    |
| ---------------- | ---- | ----------------------- | :-: | ------------------------------------- |
| \`organizationId\` | path | string(UUID)            |  필수 | 수정 대상 회사 id                           |
| \`name\`           | body | string                  | 아니오 | 새 회사명                                 |
| \`ownerId\`        | body | string(UUID)            | 아니오 | 담당자 변경                                |
| \`fieldList\`      | body | array of \`{name, <값키>}\` |  선택 | 커스텀 필드 갱신("필드 값 쓰기" 참조)               |
| \`memo\`           | body | string                  |  선택 | 이 회사에 텍스트 노트를 생성합니다("노트 / 메모" 섹션 참조). |

**요청 예시**

\`\`\`json
{
  "name": "예시 회사",
  "ownerId": "...",
  "fieldList": [
    { "name": "필드명", "stringValue": "값" }
  ]
}
\`\`\`

**응답** \`200 OK\`

수정 성공 응답의 \`data.organization\`은 객체이며 \`{ id, name, updatedAt }\`만 반환합니다. 전체 레코드(커스텀 필드 포함)는 응답에 없으므로, 최신 전체 값이 필요하면 GET 단건 조회로 재조회합니다.

\`\`\`json
{ "success": true, "data": { "organization": {
  "id": "...", "name": "예시 회사", "updatedAt": "..." } } }
\`\`\`

**에러**

| HTTP | message      | reason                                              | 조건                                            |
| ---- | ------------ | --------------------------------------------------- | --------------------------------------------- |
| 400  | Bad Request  | \`회사를 찾을 수 없습니다.\`                                    | 존재하지 않거나 형식이 틀린 id. 리소스 존재를 바디 검증보다 먼저 검사합니다. |
| 400  | Bad Request  | \`["[name]: 형식에 맞게 입력해주세요."]\`                        | \`name\`이 문자열이 아님                               |
| 401  | Unauthorized | \`유효하지 않은 토큰입니다.\` / \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 실패                                         |

> **참고:** 스키마에 없는 키를 보내면 거부되지 않고 무시된 채 \`200\`을 반환하며 \`updatedAt\`만 갱신합니다. 요청 후 응답값으로 반영 여부를 확인하세요.

***

### 딜 (Deal)

> 검증된 영업 기회. 매출 예측의 기반. 파이프라인 단계를 따라 진행되며 최종적으로 성사(Won) 또는 실패(Lost). 구조는 리드와 거의 동일합니다.

Base \`https://salesmap.kr/api\` · 버전 **v2** · 인증 \`Authorization: Bearer <token>\` (필수) · 쓰기 \`Content-Type: application/json\`

> **참고:** 딜 API에서 자주 혼동되는 동작입니다.

| 항목                      | 동작                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 파이프라인 조회 경로             | 파이프라인 단계 목록은 \`GET /v2/deal/pipeline\`(슬래시) 경로로 조회합니다.                                                                                                                                        |
| 파이프라인 조회 응답             | 응답은 \`data.pipelineList[]\`(파이프라인+단계 목록)을 반환합니다. 딜 목록이 아닙니다. 딜을 파이프라인별로 거르려면 \`GET /v2/deal?pipelineName=&pipelineStageName=\`을 사용합니다.                                                          |
| 단건 조회 형태                | \`GET /v2/deal/{id}\` 응답의 \`data.deal\`은 1요소 배열입니다(\`data.deal[0]\`).                                                                                                                             |
| 없는 리소스 조회               | 존재하지 않는 리소스를 조회하면 \`400 Bad Request\`와 \`딜을 찾을 수 없습니다.\` 메시지를 반환합니다(단건·quote 모두).                                                                                                               |
| 금액(price) 위치            | 딜 금액은 top-level \`price\` 파라미터입니다. \`fieldList\`에 \`금액\`을 넣으면 \`[refine]: 금액 값은 fieldList가 아닌 파라메터 입니다.\`를 반환합니다.                                                                                   |
| 생성 필수값                  | \`name\`, \`pipelineId\`, \`pipelineStageId\`, \`status\`가 모두 필수입니다.                                                                                                                                |
| 생성 시 고객/회사              | \`peopleId\` 또는 \`organizationId\` 중 최소 하나가 필수입니다. 둘 다 없으면 \`[refine]: peopleId 또는 organizationId를 입력해주세요.\`를 반환합니다.                                                                              |
| status 허용값              | \`"Won"\`, \`"Lost"\`, \`"In progress"\` 세 개만 허용하며 대소문자를 구분합니다.                                                                                                                                   |
| \`상태\`(한글) ≠ \`status\`(영문) | 이름은 비슷하지만 다른 필드입니다. \`status\`는 위 영문 enum(필수). 별개로 \`상태\`(한글)는 워크스페이스 커스텀 값(예: \`"SQL"\`)을 받는 **top-level 파라미터**이며, \`fieldList\`에 넣으면 \`[refine]: 상태 값은 fieldList가 아닌 파라메터 입니다.\`로 거부됩니다(금액과 동일 함정). |
| fieldList-전용 필드 함정      | \`[refine]: <필드명> 값은 fieldList가 아닌 파라메터 입니다.\` 응답이 오면, 그 필드(\`금액\`·\`상태\` 등)를 \`fieldList\`에서 빼고 **top-level 파라미터로** 보내라는 뜻입니다.                                                                     |
| 삭제 경로                   | \`POST /v2/deal/{dealId}/delete\`(path에 ID, body 불필요)로 삭제합니다.                                                                                                                                 |
| 수정 메서드                  | 수정은 \`POST /v2/deal/{dealId}\`입니다. 빈 body로 호출하면 변경 없이 200을 반환합니다.                                                                                                                             |
| 커스텀 필드 키                | 레코드는 평탄한 한글 키(\`이름\`,\`금액\`,\`상태\`,\`담당자\`,\`파이프라인\` 등)로 제공되며, 관계형 값은 \`{id,name}\` 형태입니다. 키는 워크스페이스마다 다르고, 단계 전이 추적 필드가 단계마다 동적 생성되므로 키 이름을 하드코딩하지 않습니다.                                               |

***

#### GET /v2/deal — 딜 목록 조회

딜 레코드 목록을 조회합니다.

**요청 파라미터**

| 이름                | 위치    | 타입     |  필수 | 설명                                                                                                                      |
| ----------------- | ----- | ------ | :-: | ----------------------------------------------------------------------------------------------------------------------- |
| cursor            | query | string |  선택 | 페이지네이션 커서. 응답 \`data.nextCursor\` 값을 다음 요청에 전달합니다. 결과가 없으면 \`nextCursor: null\`입니다.                                         |
| pipelineName      | query | string | N\\* | 파이프라인명으로 필터합니다. \`pipelineStageName\`과 반드시 함께 보내야 합니다. 단독 사용 시 \`400 Bad Request\`와 \`pipelineStageName을 입력해주세요\` 메시지를 반환합니다. |
| pipelineStageName | query | string | N\\* | 파이프라인 단계명으로 필터합니다. 단독 사용 시 \`400 Bad Request\`와 \`pipelineName을 입력해주세요\` 메시지를 반환합니다.                                        |

> **참고:** \`pipelineName\`과 \`pipelineStageName\`은 세트입니다. 하나만 전달하면 400을 반환하고, 둘 다 전달하면 해당 단계의 딜만 반환합니다.

**응답** \`200 OK\`

\`data.dealList\`는 딜 레코드 배열이고, \`data.nextCursor\`는 다음 페이지 커서(string|null)입니다. 마지막 페이지나 빈 결과에서는 \`null\`입니다. 레코드는 평탄한 한글 키로 제공되며 키 구성은 워크스페이스에 따라 다릅니다(레코드 키 구성은 워크스페이스마다 다름).

\`\`\`json
{ "success": true, "data": { "dealList": [ { "id": "...", "이름": "...", "금액": 1000000, "상태": "In progress", "파이프라인": {"id":"...","name":"..."}, "담당자": {"id":"...","name":"..."} } ], "nextCursor": null } }
\`\`\`

주요 키:

| 키                                           | 타입                    | 설명                                                          |
| ------------------------------------------- | --------------------- | ----------------------------------------------------------- |
| \`id\` / \`RecordId\`                           | string(uuid)          | 딜 ID (동일 값)                                                 |
| \`peopleId\`                                  | string(uuid)\\|null    | 연결된 고객                                                      |
| \`organizationId\`                            | string(uuid)\\|null    | 연결된 회사                                                      |
| \`이름\`                                        | string                | 딜명                                                          |
| \`금액\`                                        | number\\|null          | 금액 (생성 시엔 \`price\`로 입력, 조회 시엔 \`금액\` 키로 반환)                    |
| \`상태\`                                        | string                | 딜 상태 (예: \`"Won"\`, \`"SQL"\` 등. status enum과 별개로 커스텀 상태값도 제공됨) |
| \`파이프라인\`                                     | {id,name}\\|null       | 연결 파이프라인                                                    |
| \`파이프라인 단계\`                                  | {id,name}\\|null       | 현재 단계                                                       |
| \`종료된 파이프라인 단계\`                              | {id,name}\\|null       |                                                             |
| \`담당자\`                                       | {id,name}\\|null       | 소유자                                                         |
| \`팀\`                                         | \\[{id,name}]\\|null    | 팀(배열)                                                       |
| \`마감일\` / \`수주 예정일\`                            | string(ISO8601)\\|null |                                                             |
| \`생성 날짜\` / \`수정 날짜\`                           | string(ISO8601)       |                                                             |
| \`전체 TODO\`/\`미완료 TODO\`/\`완료 TODO\`/\`다음 TODO 날짜\` | number/ISO            | TODO 집계                                                     |
| \`성사까지 걸린 시간\`/\`종료까지 걸린 시간\`                   | number(ms)            |                                                             |
| \`메인 견적 상품 리스트\`/\`참여자\`/\`등록된 시퀀스 목록\`           | array\\|null           | 관계형 배열                                                      |

> **참고:** 단계 전이 추적 필드(\`<단계명>로 진입한 날짜\`, \`<단계명>에서 보낸 누적 시간\`, \`<단계명>에서 퇴장한 날짜\`)는 파이프라인×단계 조합마다 동적으로 생성되어 한 레코드에 수백 개의 키가 될 수 있습니다. 키 이름을 하드코딩하지 않습니다.

**에러**

| 코드  | message               | reason                           | 조건                         |
| --- | --------------------- | -------------------------------- | -------------------------- |
| 400 | Bad Request           | \`pipelineStageName을 입력해주세요\`      | \`pipelineName\`만 단독 전달      |
| 400 | Bad Request           | \`pipelineName을 입력해주세요\`           | \`pipelineStageName\`만 단독 전달 |
| 401 | Unauthorized          | \`헤더에서 Authorization을 찾을 수 없습니다.\` | Authorization 헤더 없음        |
| 401 | Unauthorized          | \`유효하지 않은 토큰입니다.\`                 | 토큰 무효                      |
| 429 | —                     | (레이트리밋)                          | 100req/10초 초과              |
| 500 | Internal Server Error | —                                | 서버 오류                      |

***

#### GET /v2/deal/{dealId} — 딜 상세 조회

딜 하나의 상세 정보를 조회합니다.

**요청 파라미터**

| 이름     | 위치   | 타입           |  필수 | 설명   |
| ------ | ---- | ------------ | :-: | ---- |
| dealId | path | string(uuid) |  필수 | 딜 ID |

**응답** \`200 OK\`

\`data.deal\`은 레코드 1건을 담은 1요소 배열입니다(\`data.deal[0]\`). 레코드 형태는 목록 조회와 동일한 평탄 한글 키 구조입니다.

\`\`\`json
{ "success": true, "data": { "deal": [ { "id": "...", "이름": "...", "금액": 1000000, "상태": "In progress", "담당자": {"id":"...","name":"..."} } ] } }
\`\`\`

**에러**

| 코드        | message      | reason                           | 조건                      |
| --------- | ------------ | -------------------------------- | ----------------------- |
| 400       | Bad Request  | \`딜을 찾을 수 없습니다.\`                  | 존재하지 않거나 형식이 잘못된 dealId |
| 401       | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 없음                   |
| 429 / 500 | —            | —                                | 레이트리밋 / 서버 오류           |

***

#### GET /v2/deal/pipeline — 딜 파이프라인(단계) 목록 조회

파이프라인과 그 단계 목록을 조회합니다. 딜을 파이프라인별로 거르려면 이 엔드포인트가 아니라 \`GET /v2/deal?pipelineName=&pipelineStageName=\`을 사용합니다.

**요청 파라미터**

| 이름           | 위치    | 타입     |  필수 | 설명                                    |
| ------------ | ----- | ------ | :-: | ------------------------------------- |
| pipelineName | query | string |  선택 | 필터링에 사용되지 않습니다. 전달해도 전체 파이프라인을 반환합니다. |

**응답** \`200 OK\`

\`data.pipelineList\`는 파이프라인 배열이며, 각 파이프라인은 단계 목록을 nested로 포함합니다. \`nextCursor\`는 포함되지 않습니다.

\`\`\`json
{ "success": true, "data": { "pipelineList": [ { "id": "...", "name": "...", "pipelineStageList": [ { "id": "...", "name": "...", "index": 0 } ] } ] } }
\`\`\`

| 키                           | 타입           | 설명             |
| --------------------------- | ------------ | -------------- |
| \`id\`                        | string(uuid) | 파이프라인 ID       |
| \`name\`                      | string       | 파이프라인명         |
| \`pipelineStageList\`         | array        | 단계 목록          |
| \`pipelineStageList[].id\`    | string(uuid) | 단계 ID          |
| \`pipelineStageList[].name\`  | string       | 단계명            |
| \`pipelineStageList[].index\` | number       | 단계 순서(0-based) |

**에러**

| 코드  | message               | reason                           | 조건    |
| --- | --------------------- | -------------------------------- | ----- |
| 401 | Unauthorized          | \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 없음 |
| 500 | Internal Server Error | —                                | 서버 오류 |

***

#### GET /v2/deal/activity — 딜 액티비티 조회

딜에서 발생한 활동을 조회합니다.

**요청 파라미터**

| 이름     | 위치    | 타입           |  필수 | 설명                                              |
| ------ | ----- | ------------ | :-: | ----------------------------------------------- |
| dealId | query | string(uuid) |  선택 | 특정 딜로 필터합니다. 미지정 시 워크스페이스 전체 액티비티를 최신순으로 반환합니다. |
| cursor | query | string       |  선택 | 페이지네이션 커서                                       |

**응답** \`200 OK\`

\`data.dealActivityList\`는 액티비티 배열이고, \`data.nextCursor\`는 다음 페이지 커서입니다. 페이지 크기는 50건입니다.

\`\`\`json
{ "success": true, "data": { "dealActivityList": [ { "id": "...", "type": "create", "date": "...", "dealId": "..." } ], "nextCursor": "..." } }
\`\`\`

| 키                                    | 타입              | 설명                                        |
| ------------------------------------ | --------------- | ----------------------------------------- |
| \`id\`                                 | string(uuid)    | 액티비티 ID                                   |
| \`type\`                               | string          | 활동 유형. 예: \`create\`, \`email\`, \`todoCreate\` |
| \`date\`                               | string(ISO8601) | 발생 시각                                     |
| \`dealId\`                             | string(uuid)    | 대상 딜                                      |
| \`emailId\` / \`messageId\` / \`threadId\` | string\\|null    | 이메일 관련                                    |
| \`webFormId\` / \`webFormName\`          | string\\|null    | 웹폼 관련                                     |
| \`smsId\` / \`memoId\` / \`todoId\`        | string\\|null    | 각 활동 참조                                   |
| \`dealStatus\`                         | string\\|null    | 상태 변화 활동 시 딜 상태                           |

**에러**

| 코드  | message               | reason                           | 조건    |
| --- | --------------------- | -------------------------------- | ----- |
| 401 | Unauthorized          | \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 없음 |
| 500 | Internal Server Error | —                                | 서버 오류 |

***

#### GET /v2/deal/history — 딜 히스토리(변경 이력) 조회

딜 필드의 변경 이력을 조회합니다. 금액, 담당자, 파이프라인 단계 이동 등을 추적할 수 있습니다.

**요청 파라미터**

| 이름     | 위치    | 타입           |  필수 | 설명                            |
| ------ | ----- | ------------ | :-: | ----------------------------- |
| dealId | query | string(uuid) |  선택 | 특정 딜로 필터합니다. 미지정 시 전체를 반환합니다. |
| cursor | query | string       |  선택 | 페이지네이션 커서                     |

**응답** \`200 OK\`

\`data.dealHistoryList\`는 변경 이력 배열이고, \`data.nextCursor\`는 다음 페이지 커서입니다. 페이지 크기는 50건입니다.

\`\`\`json
{ "success": true, "data": { "dealHistoryList": [ { "id": "...", "dealId": "...", "type": "editField", "source": {"type":"field","id":null,"name":null}, "fieldName": "...", "fieldValue": null, "createdAt": "..." } ], "nextCursor": "..." } }
\`\`\`

| 키              | 타입                 | 설명                                                                       |
| -------------- | ------------------ | ------------------------------------------------------------------------ |
| \`id\`           | string(uuid)       | 이력 ID                                                                    |
| \`dealId\`       | string(uuid)       | 대상 딜                                                                     |
| \`type\`         | string             | 변경 유형. 예: \`editField\`, \`editPeopleConnection\`, \`editOrganizationConnect\` |
| \`source\`       | {type,id,name}     | 변경 출처. 예: \`{"type":"field","id":null,"name":null}\`                       |
| \`fieldName\`    | string\\|null       | 변경된 필드명 (\`editField\` 시)                                                  |
| \`fieldValue\`   | mixed\\|null        | 변경 후 값                                                                   |
| \`people\`       | {\\_id,name}\\|null  | 고객 연결 변경 시 채워지며, 아니면 null                                                |
| \`organization\` | {\\_id,name}\\|null  | 회사 연결 변경 시 채워지며, 아니면 null                                                |
| \`ownerId\`      | string(uuid)\\|null | 변경 수행자                                                                   |
| \`createdAt\`    | string(ISO8601)    | 변경 시각                                                                    |

**에러**

| 코드  | message               | reason                           | 조건    |
| --- | --------------------- | -------------------------------- | ----- |
| 401 | Unauthorized          | \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 없음 |
| 500 | Internal Server Error | —                                | 서버 오류 |

***

#### GET /v2/deal/{dealId}/quote — 딜의 견적서 목록 조회

딜에 연결된 견적서 목록을 조회합니다.

**요청 파라미터**

| 이름     | 위치   | 타입           |  필수 | 설명   |
| ------ | ---- | ------------ | :-: | ---- |
| dealId | path | string(uuid) |  필수 | 딜 ID |

**응답** \`200 OK\`

\`data.quoteList\`는 견적서 배열입니다. 견적서가 없으면 빈 배열(\`[]\`)을 반환하며 \`nextCursor\`는 포함되지 않습니다. 견적서 항목 스키마는 **견적서 · 상품 · 파이프라인** 섹션을 참조하세요.

\`\`\`json
{ "success": true, "data": { "quoteList": [] } }
\`\`\`

**에러**

| 코드        | message      | reason                           | 조건             |
| --------- | ------------ | -------------------------------- | -------------- |
| 400       | Bad Request  | \`딜을 찾을 수 없습니다.\`                  | 존재하지 않는 dealId |
| 401       | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 없음          |
| 429 / 500 | —            | —                                | 레이트리밋 / 서버 오류  |

***

#### POST /v2/deal — 딜 생성

새 딜을 생성합니다.

**요청 파라미터** (body, application/json)

| 이름                | 위치   | 타입              |  필수 | 설명                                                                                                                              |
| ----------------- | ---- | --------------- | :-: | ------------------------------------------------------------------------------------------------------------------------------- |
| name              | body | string          |  필수 | 딜명. 누락 시 \`[name]: 필수 입력 사항입니다.\`                                                                                                 |
| pipelineId        | body | string(uuid)    |  필수 | 파이프라인 ID. 누락 시 \`[pipelineId]: 필수 입력 사항입니다.\`                                                                                     |
| pipelineStageId   | body | string(uuid)    |  필수 | 단계 ID. 누락 시 \`[pipelineStageId]: 필수 입력 사항입니다.\` 해당 파이프라인에 속한 단계여야 합니다.                                                            |
| status            | body | string          |  필수 | \`"Won"\` \\| \`"Lost"\` \\| \`"In progress"\` 중 하나(대소문자 구분). 누락/오류 시 \`[status]: status의 값은 Won, Lost, In progress 중 하나여야 합니다.\`         |
| peopleId          | body | string(uuid)    | 조건부 | \`peopleId\` 또는 \`organizationId\` 중 최소 하나가 필수입니다. 둘 다 없으면 \`[refine]: peopleId 또는 organizationId를 입력해주세요.\`                          |
| organizationId    | body | string(uuid)    | 조건부 | 위와 동일합니다.                                                                                                                       |
| price             | body | number          |  선택 | 딜 금액은 top-level \`price\`입니다. \`fieldList\`에 \`금액\`을 넣으면 \`[refine]: 금액 값은 fieldList가 아닌 파라메터 입니다.\`                                    |
| 상태                | body | string          |  선택 | 한글 커스텀 상태 필드(예: \`"SQL"\`). **top-level**로 보냅니다(영문 \`status\` enum과 별개). \`fieldList\`에 넣으면 \`[refine]: 상태 값은 fieldList가 아닌 파라메터 입니다.\` |
| memo              | body | string          |  선택 | 이 딜에 텍스트 노트를 생성합니다("노트 / 메모" 섹션 참조).                                                                                            |
| expectedCloseDate | body | string(ISO8601) |  선택 | 수주 예정일. \`마감일\`은 status가 Won/Lost일 때만 반영됩니다.                                                                                      |
| fieldList         | body | array           |  선택 | 커스텀 필드. \`[{name, stringValue\\|numberValue\\|booleanValue\\|...}]\`. \`금액\`·\`상태\`는 넣지 않습니다(top-level, 위 참고).                           |

> **참고:** 검증 순서는 ① name/pipelineId/pipelineStageId/status 누락 검사 → ② peopleId|organizationId refine → ③ \`금액\`·\`상태\` 등 top-level 전용 필드의 fieldList refine → ④ 파이프라인/단계 존재 검사(\`파이프라인 단계를 찾을 수 없습니다.\`) 입니다.

**요청 예시**

\`\`\`json
{ "name": "삼성전자 ERP 도입", "pipelineId": "...", "pipelineStageId": "...", "status": "In progress", "peopleId": "...", "price": 1000000 }
\`\`\`

**응답** \`200 OK\`

\`data.deal\`은 생성된 딜 객체이며 \`id\`, \`name\`, \`createdAt\` 등을 포함합니다.

\`\`\`json
{ "success": true, "data": { "deal": { "id": "...", "name": "...", "createdAt": "..." } } }
\`\`\`

**에러**

| 코드        | message      | reason                                                                                                                        | 조건                                     |
| --------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 400       | Bad Request  | \`["[name]: 필수 입력 사항입니다.","[pipelineId]: …","[pipelineStageId]: …","[status]: status의 값은 Won, Lost, In progress 중 하나여야 합니다."]\` | 필수값 누락(reason 배열)                      |
| 400       | Bad Request  | \`[refine]: peopleId 또는 organizationId를 입력해주세요.\`                                                                               | 고객/회사 둘 다 누락                           |
| 400       | Bad Request  | \`[refine]: 금액 값은 fieldList가 아닌 파라메터 입니다.\`                                                                                     | \`fieldList\`에 \`금액\` 포함                   |
| 400       | Bad Request  | \`[refine]: 상태 값은 fieldList가 아닌 파라메터 입니다.\`                                                                                     | \`fieldList\`에 \`상태\` 포함 (top-level로 보낼 것) |
| 400       | Bad Request  | \`파이프라인 단계를 찾을 수 없습니다.\`                                                                                                        | 존재하지 않는 pipelineId/pipelineStageId     |
| 401       | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\`                                                                                              | 인증 없음                                  |
| 429 / 500 | —            | —                                                                                                                             | 레이트리밋 / 서버 오류                          |

***

#### POST /v2/deal/{dealId} — 딜 수정

기존 딜을 수정합니다. 수정은 PATCH/PUT이 아니라 POST + path의 dealId로 호출합니다.

**요청 파라미터**

| 이름                        | 위치   | 타입              |  필수 | 설명                                                    |
| ------------------------- | ---- | --------------- | :-: | ----------------------------------------------------- |
| dealId                    | path | string(uuid)    |  필수 | 수정할 딜 ID. 존재하지 않으면 \`400 Bad Request\`와 \`딜을 찾을 수 없습니다.\` |
| name                      | body | string          |  선택 | 딜명                                                    |
| price                     | body | number          |  선택 | 금액(top-level. fieldList에 \`금액\` 금지)                     |
| status                    | body | string          |  선택 | \`Won\` / \`Lost\` / \`In progress\`                        |
| pipelineId                | body | string(uuid)    |  선택 | 변경 시 \`pipelineStageId\`와 함께 보냅니다.                      |
| pipelineStageId           | body | string(uuid)    |  선택 | 단계 ID                                                 |
| peopleId / organizationId | body | string(uuid)    |  선택 | 연결 변경                                                 |
| expectedCloseDate         | body | string(ISO8601) |  선택 | 수주 예정일                                                |
| memo                      | body | string          |  선택 | 이 딜에 텍스트 노트를 생성합니다("노트 / 메모" 섹션 참조).                  |
| fieldList                 | body | array           |  선택 | 커스텀 필드 (금액 금지)                                        |

> **참고:** 빈 body(\`{}\`)로 호출하면 변경 없이 200을 반환하며 \`updatedAt\`만 갱신됩니다.

**요청 예시**

\`\`\`json
{ "name": "삼성전자 ERP 도입 (수정)", "status": "Won", "price": 1500000 }
\`\`\`

**응답** \`200 OK\`

\`data.deal\`은 수정된 딜 객체이며 \`id\`, \`name\`, \`updatedAt\` 등을 포함합니다.

\`\`\`json
{ "success": true, "data": { "deal": { "id": "...", "name": "...", "updatedAt": "..." } } }
\`\`\`

**에러**

| 코드        | message      | reason                           | 조건                                   |
| --------- | ------------ | -------------------------------- | ------------------------------------ |
| 400       | Bad Request  | \`딜을 찾을 수 없습니다.\`                  | 존재하지 않는 dealId                       |
| 400       | Bad Request  | (생성과 동일한 검증 reason)              | 잘못된 status/pipeline/\`금액\` fieldList 등 |
| 401       | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 없음                                |
| 429 / 500 | —            | —                                | 레이트리밋 / 서버 오류                        |

***

#### POST /v2/deal/{dealId}/delete — 딜 삭제

딜을 삭제합니다. 삭제는 POST + \`/{dealId}/delete\`(path에 ID)로 호출하며 body는 필요하지 않습니다.

**요청 파라미터**

| 이름     | 위치   | 타입           |  필수 | 설명       |
| ------ | ---- | ------------ | :-: | -------- |
| dealId | path | string(uuid) |  필수 | 삭제할 딜 ID |

body 불필요 (dealId는 path로만 전달).

**응답** \`200 OK\`

\`\`\`json
{ "success": true }
\`\`\`

**에러**

| 코드        | message      | reason                             | 조건                                        |
| --------- | ------------ | ---------------------------------- | ----------------------------------------- |
| 400       | Bad Request  | \`Deal이 존재하지 않습니다. dealId를 확인해주세요.\` | 존재하지 않는 dealId (path-id 경로)               |
| 400       | Bad Request  | \`딜을 찾을 수 없습니다.\`                    | path 없는 \`/v2/deal/delete\` 경로 사용 시(빈 body) |
| 400       | Bad Request  | \`시퀀스에 딜이 등록되어 있습니다.\`               | 딜이 시퀀스에 등록(enroll)되어 있을 때                 |
| 401       | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\`   | 인증 없음                                     |
| 429 / 500 | —            | —                                  | 레이트리밋 / 서버 오류                             |

> **참고:** 시퀀스에 등록(enroll)되어 있는 딜은 삭제할 수 없습니다(\`400\` \`시퀀스에 딜이 등록되어 있습니다.\`). 먼저 해당 딜을 시퀀스에서 제외한 뒤 삭제하세요.

***

### 리드 (Lead)

리드는 아직 검증되지 않은 잠재 영업 기회입니다. 딜보다 앞 단계로, 관심은 있으나 구매 의사가 확인되지 않은 상태를 나타냅니다. 딜과 거의 동일한 구조를 가지며 딜로 전환(convert)할 수 있습니다.

Base \`https://salesmap.kr/api\` · 버전 **v2** · 인증 \`Authorization: Bearer <token>\` (필수)

> **참고:** 리드 레코드는 평탄한 한글 키로 제공됩니다(\`이름\`, \`금액\`, \`담당자\`, \`파이프라인\` 등). 관계형 값은 \`{id,name}\` 형태입니다. 키 구성은 워크스페이스마다 다릅니다.

***

#### GET /v2/lead — 리드 목록 조회

리드 레코드 목록을 페이지 단위로 조회합니다.

**요청 파라미터**

| 이름     | 위치    | 타입     |  필수 | 설명                                               |
| ------ | ----- | ------ | :-: | ------------------------------------------------ |
| cursor | query | string |     | 페이지네이션 커서. 응답 \`data.nextCursor\` 값을 다음 요청에 전달합니다. |

**응답** \`200 OK\`

\`data.leadList\`는 리드 레코드 배열이며, 한 페이지에 10건을 반환합니다. \`data.nextCursor\`가 있으면 다음 페이지가 존재합니다. 레코드는 평탄한 한글 키로 제공됩니다.

\`\`\`json
{ "success": true, "data": { "leadList": [ { "id": "...", "RecordId": "...", "peopleId": "...", "organizationId": null, "이름": "...", "금액": 1000000, "담당자": {"id":"...","name":"..."}, "파이프라인": {"id":"...","name":"..."}, "파이프라인 단계": {"id":"...","name":"..."}, "생성 날짜": "..." } ], "nextCursor": "..." } }
\`\`\`

주요 레코드 키:

| 키                                                           | 타입                 | 설명             |
| ----------------------------------------------------------- | ------------------ | -------------- |
| \`id\` / \`RecordId\`                                           | string(uuid)       | 리드 ID (동일 값)   |
| \`peopleId\`                                                  | string(uuid)\\|null | 연결된 고객         |
| \`organizationId\`                                            | string(uuid)\\|null | 연결된 회사         |
| \`이름\`                                                        | string             | 리드명            |
| \`금액\`                                                        | number\\|null       |                |
| \`담당자\`                                                       | {id,name}\\|null    | 소유자            |
| \`파이프라인\`                                                     | {id,name}\\|null    | 연결 파이프라인       |
| \`파이프라인 단계\`                                                  | {id,name}\\|null    | 현재 단계          |
| \`리드 그룹\`                                                     | array\\|null        |                |
| \`딜 목록\`                                                      | array\\|null        |                |
| \`생성 날짜\` / \`수정 날짜\`                                           | string(ISO8601)    |                |
| \`누적 시퀀스 등록수\`, \`미완료 TODO\`, \`다음 TODO 날짜\`, \`수주 예정일\`, \`보류 사유\` … | mixed              | 시스템/스테이지 추적 필드 |

> **참고:** 단계 전이 추적 필드(예: \`새 리드(<파이프라인명>)로 진입한 날짜\`)는 파이프라인×단계 조합마다 동적으로 생성됩니다. 키 이름을 하드코딩하지 마세요.

**에러**

| 코드  | message               | reason                           | 조건                   |
| --- | --------------------- | -------------------------------- | -------------------- |
| 401 | Unauthorized          | \`헤더에서 Authorization을 찾을 수 없습니다.\` | Authorization 헤더 없음  |
| 401 | Unauthorized          | \`유효하지 않은 토큰입니다.\`                 | 토큰 무효                |
| 429 | —                     | —                                | 레이트리밋(100req/10초) 초과 |
| 500 | Internal Server Error | —                                | 서버 오류                |

***

#### GET /v2/lead/{leadId} — 리드 상세 조회

리드 하나의 상세 정보를 조회합니다.

**요청 파라미터**

| 이름     | 위치   | 타입           |  필수 | 설명    |
| ------ | ---- | ------------ | :-: | ----- |
| leadId | path | string(uuid) |  필수 | 리드 ID |

**응답** \`200 OK\`

\`data.lead\`는 레코드 1건을 담은 배열입니다(\`data.lead[0]\`). 레코드 형태는 목록과 동일합니다.

\`\`\`json
{ "success": true, "data": { "lead": [ { "id": "...", "이름": "...", "금액": 1000000, "담당자": {"id":"...","name":"..."}, "파이프라인": {"id":"...","name":"..."} } ] } }
\`\`\`

**에러**

| 코드        | message      | reason                           | 조건             |
| --------- | ------------ | -------------------------------- | -------------- |
| 400       | Bad Request  | \`리드를 찾을 수 없습니다.\`                 | 존재하지 않는 leadId |
| 401       | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 없음          |
| 429 / 500 | —            | —                                | 레이트리밋 / 서버 오류  |

> **참고:** 존재하지 않는 리드를 조회하면 \`404\`가 아니라 \`400 Bad Request\`와 \`리드를 찾을 수 없습니다.\` 메시지를 반환합니다.

***

#### GET /v2/lead/pipeline — 리드 파이프라인 조회

리드 파이프라인과 단계 목록을 조회합니다.

**요청 파라미터** — 없음 (인증 헤더만 필요).

**응답** \`200 OK\`

\`data.pipelineList\`는 전체 파이프라인 목록을 반환합니다. 이 응답에는 \`nextCursor\`가 없습니다.

\`\`\`json
{ "success": true, "data": { "pipelineList": [ { "id": "...", "name": "...", "pipelineStageList": [ { "id": "...", "name": "...", "index": 0 } ] } ] } }
\`\`\`

| 경로                                        | 타입           | 설명                                |
| ----------------------------------------- | ------------ | --------------------------------- |
| \`data.pipelineList[]\`                     | array        | 리드 파이프라인 목록                       |
| \`data.pipelineList[].id\`                  | string(uuid) | 파이프라인 ID                          |
| \`data.pipelineList[].name\`                | string       | 파이프라인명                            |
| \`data.pipelineList[].pipelineStageList[]\` | array        | 단계 목록                             |
| \`…pipelineStageList[].id\`                 | string(uuid) | 단계 ID (생성/수정 시 \`pipelineStageId\`) |
| \`…pipelineStageList[].name\`               | string       | 단계명                               |
| \`…pipelineStageList[].index\`              | number       | 단계 순서(0부터)                        |

**에러**

| 코드  | message      | reason                           | 조건    |
| --- | ------------ | -------------------------------- | ----- |
| 401 | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 없음 |

> **참고:** 파이프라인 조회 경로는 슬래시 표기 \`/v2/lead/pipeline\`입니다.

***

#### GET /v2/lead/activity — 리드 액티비티 조회

리드의 액티비티 이력을 조회합니다.

**요청 파라미터**

| 이름     | 위치    | 타입           |  필수 | 설명                                     |
| ------ | ----- | ------------ | :-: | -------------------------------------- |
| leadId | query | string(uuid) |     | 특정 리드로 필터링합니다. 생략 시 전체 리드 액티비티를 반환합니다. |
| cursor | query | string       |     | 페이지네이션 커서                              |

**응답** \`200 OK\`

\`data.leadActivityList\`는 액티비티 배열입니다.

\`\`\`json
{ "success": true, "data": { "leadActivityList": [ { "id": "...", "type": "create", "date": "...", "leadId": "...", "memoId": null } ] } }
\`\`\`

| 항목 키                                                       | 타입                 | 설명          |
| ---------------------------------------------------------- | ------------------ | ----------- |
| \`id\`                                                       | string(uuid)       | 액티비티 ID     |
| \`type\`                                                     | string             | 액티비티 종류     |
| \`date\`                                                     | string(ISO8601)    | 발생 시각       |
| \`leadId\`                                                   | string(uuid)       | 대상 리드       |
| \`emailId\` \`messageId\` \`threadId\` \`smsId\` \`memoId\` \`todoId\` | string(uuid)\\|null | 해당 타입 연결 ID |
| \`webFormId\` \`webFormName\`                                  | string\\|null       | 웹폼 제출 시     |

\`type\` 값에는 \`create\`, \`memoCreate\`, \`todoCreate\`, \`webFormSubmit\`, \`email\` 등이 있습니다.

**에러**

| 코드  | message      | reason                           | 조건    |
| --- | ------------ | -------------------------------- | ----- |
| 401 | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 없음 |
| 500 | —            | —                                | 서버 오류 |

***

#### GET /v2/lead/history — 리드 히스토리 조회

리드 필드 변경 이력을 조회합니다.

**요청 파라미터**

| 이름     | 위치    | 타입           |  필수 | 설명                             |
| ------ | ----- | ------------ | :-: | ------------------------------ |
| leadId | query | string(uuid) |     | 특정 리드로 필터링합니다. 생략 시 전체를 반환합니다. |
| cursor | query | string       |     | 페이지네이션 커서                      |

**응답** \`200 OK\`

\`data.leadHistoryList\`는 변경 이력 배열입니다.

\`\`\`json
{ "success": true, "data": { "leadHistoryList": [ { "id": "...", "leadId": "...", "type": "editField", "source": {"type":"api","id":"...","name":"..."}, "fieldName": "...", "fieldValue": "...", "ownerId": "...", "createdAt": "..." } ] } }
\`\`\`

| 항목 키           | 타입                | 설명                                                                      |
| -------------- | ----------------- | ----------------------------------------------------------------------- |
| \`id\`           | string(uuid)      | 히스토리 ID                                                                 |
| \`leadId\`       | string(uuid)      | 대상 리드                                                                   |
| \`type\`         | string            | 변경 종류. \`editField\`, \`editOrganizationConnect\`, \`editPeopleConnection\` 등 |
| \`source\`       | {type,id,name}    | 변경 주체. API 호출 시 \`type:"api"\`와 토큰 소유자 \`{id,name}\`를 반환합니다.                |
| \`people\`       | {\\_id,name}\\|null | 고객 연결 변경 시                                                              |
| \`organization\` | {\\_id,name}\\|null | 회사 연결 변경 시                                                              |
| \`fieldName\`    | string            | 변경된 필드명                                                                 |
| \`fieldValue\`   | mixed             | 변경 후 값 (관계형은 \`{_id,name}\`)                                              |
| \`ownerId\`      | string(uuid)      |                                                                         |
| \`createdAt\`    | string(ISO8601)   |                                                                         |

**에러**

| 코드  | message      | reason                           | 조건    |
| --- | ------------ | -------------------------------- | ----- |
| 401 | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 없음 |
| 500 | —            | —                                | 서버 오류 |

***

#### GET /v2/lead/{leadId}/quote — 리드 견적서 목록 조회

특정 리드에 연결된 견적서 목록을 조회합니다.

**요청 파라미터**

| 이름     | 위치    | 타입           |  필수 | 설명        |
| ------ | ----- | ------------ | :-: | --------- |
| leadId | path  | string(uuid) |  필수 | 리드 ID     |
| cursor | query | string       |     | 페이지네이션 커서 |

**응답** \`200 OK\`

\`data.quoteList\`는 견적서 배열이며, 견적이 없으면 빈 배열을 반환합니다. 견적 항목 스키마는 **견적서 · 상품 · 파이프라인** 섹션을 참조하세요.

\`\`\`json
{ "success": true, "data": { "quoteList": [ { "id": "...", "roomId": "...", "RecordId": "...", "메인 견적서 여부": true, "금액": 1000000, "담당자": {"id":"...","name":"..."}, "이름": "...", "할인": 0, "할인 유형": "...", "견적 구성 상품": [], "생성 날짜": "...", "수정 날짜": "..." } ] } }
\`\`\`

**에러**

| 코드        | message      | reason                           | 조건             |
| --------- | ------------ | -------------------------------- | -------------- |
| 400       | Bad Request  | \`리드를 찾을 수 없습니다.\`                 | 존재하지 않는 leadId |
| 401       | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 없음          |
| 429 / 500 | —            | —                                | 레이트리밋 / 서버 오류  |

> **참고:** 존재하지 않는 리드의 견적서를 조회하면 \`404\`가 아니라 \`400 Bad Request\`와 \`리드를 찾을 수 없습니다.\` 메시지를 반환합니다.

***

#### POST /v2/lead — 리드 생성

새 리드를 생성합니다.

**요청 파라미터** (body, application/json)

| 이름                | 타입                     |  필수 | 설명                                               |
| ----------------- | ---------------------- | :-: | ------------------------------------------------ |
| \`name\`            | string                 |  필수 | 리드명                                              |
| \`peopleId\`        | string(uuid)           | 조건부 | \`peopleId\` 또는 \`organizationId\` 중 최소 하나를 보내야 합니다. |
| \`organizationId\`  | string(uuid)           | 조건부 | \`peopleId\` 또는 \`organizationId\` 중 최소 하나를 보내야 합니다. |
| \`pipelineId\`      | string(uuid)           |     | \`pipelineStageId\`와 함께 보내야 합니다.                   |
| \`pipelineStageId\` | string(uuid)           |     | \`pipelineId\`와 함께 보내야 합니다.                        |
| \`ownerId\`         | string(uuid)           |     | 담당자                                              |
| \`fieldList\`       | array \`[{name, <값키>}]\` |  선택 | 커스텀 필드 값("필드 값 쓰기" 참조)                           |
| \`memo\`            | string                 |  선택 | 이 리드에 텍스트 노트를 생성합니다("노트 / 메모" 섹션 참조).            |

검증 규칙:

1. \`name\` 누락 시 \`["[name]: 필수 입력 사항입니다."]\`를 반환합니다.
2. \`peopleId\`와 \`organizationId\`가 모두 없으면 \`["[refine]: peopleId 또는 organizationId를 입력해주세요."]\`를 반환합니다.
3. \`pipelineId\`와 \`pipelineStageId\` 중 하나만 보내면 \`["[refine]: 파이프라인 또는 파이프라인 단계를 변경하기 위해서는 pipelineId와 pipelineStageId 모두 필요합니다."]\`를 반환합니다.
4. 존재하지 않는 \`peopleId\`를 보내면 \`peopleId의 대상을 찾을 수 없습니다.\`를 반환합니다(\`organizationId\`도 동일).

**요청 예시**

\`\`\`json
{ "name": "ACME 신규 문의", "peopleId": "...", "pipelineId": "...", "pipelineStageId": "...", "ownerId": "..." }
\`\`\`

**응답** \`200 OK\`

\`\`\`json
{ "success": true, "data": { "lead": { "id": "...", "name": "...", "createdAt": "..." } } }
\`\`\`

**에러**

| 코드        | message      | reason                                                                             | 조건               |
| --------- | ------------ | ---------------------------------------------------------------------------------- | ---------------- |
| 400       | Bad Request  | \`["[name]: 필수 입력 사항입니다."]\`                                                         | name 누락          |
| 400       | Bad Request  | \`["[refine]: peopleId 또는 organizationId를 입력해주세요."]\`                                | 고객/회사 둘 다 없음     |
| 400       | Bad Request  | \`["[refine]: 파이프라인 또는 파이프라인 단계를 변경하기 위해서는 pipelineId와 pipelineStageId 모두 필요합니다."]\` | pipeline 쌍 불완전   |
| 400       | Bad Request  | \`peopleId의 대상을 찾을 수 없습니다.\`                                                         | 존재하지 않는 peopleId |
| 401       | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\`                                                   | 인증 없음            |
| 429 / 500 | —            | —                                                                                  | 레이트리밋 / 서버 오류    |

***

#### POST /v2/lead/{leadId} — 리드 수정

기존 리드를 수정합니다.

**요청 파라미터**

| 이름                                    | 위치   | 타입                     |  필수 | 설명                                             |
| ------------------------------------- | ---- | ---------------------- | :-: | ---------------------------------------------- |
| leadId                                | path | string(uuid)           |  필수 | 대상 리드                                          |
| \`name\`                                | body | string                 |     | 리드명                                            |
| \`pipelineStageId\`                     | body | string(uuid)           |     | 단계 이동. 파이프라인까지 바뀔 때는 \`pipelineId\`와 함께 보내야 합니다. |
| \`pipelineId\`                          | body | string(uuid)           |     | \`pipelineStageId\`와 함께 보내야 합니다.                 |
| \`ownerId\` \`peopleId\` \`organizationId\` | body | string(uuid)           |     |                                                |
| \`fieldList\`                           | body | array \`[{name, <값키>}]\` |  선택 | 커스텀 필드 값("필드 값 쓰기" 참조)                         |
| \`memo\`                                | body | string                 |  선택 | 이 리드에 텍스트 노트를 생성합니다("노트 / 메모" 섹션 참조).          |

**요청 예시**

\`\`\`json
{ "name": "ACME 신규 문의 (수정)", "pipelineId": "...", "pipelineStageId": "...", "ownerId": "..." }
\`\`\`

**응답** \`200 OK\`

\`\`\`json
{ "success": true, "data": { "lead": { "id": "...", "name": "..." } } }
\`\`\`

**에러**

| 코드        | message      | reason                           | 조건             |
| --------- | ------------ | -------------------------------- | -------------- |
| 400       | Bad Request  | \`리드를 찾을 수 없습니다.\`                 | 존재하지 않는 leadId |
| 401       | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\` | 인증 없음          |
| 429 / 500 | —            | —                                | 레이트리밋 / 서버 오류  |

> **참고:** 리드 수정은 \`POST\` 메서드를 사용합니다(\`PATCH\`/\`PUT\` 아님). 존재하지 않는 리드를 수정하면 \`400 Bad Request\`를 반환합니다.

***

#### POST /v2/lead/{leadId}/delete — 리드 삭제

리드를 삭제합니다.

**요청 파라미터**

| 이름     | 위치   | 타입           |  필수 | 설명    |
| ------ | ---- | ------------ | :-: | ----- |
| leadId | path | string(uuid) |  필수 | 삭제 대상 |

요청 본문은 필요하지 않습니다.

**요청 예시**

body 불필요 (leadId는 path로 전달).

**응답** \`200 OK\`

\`\`\`json
{ "success": true }
\`\`\`

**에러**

| 코드        | message      | reason                             | 조건             |
| --------- | ------------ | ---------------------------------- | -------------- |
| 400       | Bad Request  | \`Lead가 존재하지 않습니다. leadId를 확인해주세요.\` | 존재하지 않는 leadId |
| 401       | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\`   | 인증 없음          |
| 429 / 500 | —            | —                                  | 레이트리밋 / 서버 오류  |

> **참고:** 리드 삭제는 \`/delete\` 하위 경로에 \`POST\`로 요청합니다(\`DELETE\` 메서드 아님). 존재하지 않는 리드를 삭제하면 \`400 Bad Request\`를 반환합니다.
>
> 시퀀스에 등록(enroll)되어 있는 리드는 삭제할 수 없습니다. 먼저 해당 리드를 시퀀스에서 제외한 뒤 삭제하세요.

***

### 커스텀 오브젝트 (Custom Object)

커스텀 오브젝트는 기본 오브젝트(고객·회사·딜·리드)로 관리할 수 없는 데이터를 다루는 사용자 정의 오브젝트입니다(예: 계약서, 계약, 자산). 정의(definition)는 워크스페이스마다 다릅니다. 레코드(\`customObject\`)는 항상 어떤 정의(\`customObjectDefinition\`)에 속합니다.

**인증 (공통)**

\`\`\`
Authorization: Bearer <token>          # 필수
Content-Type: application/json          # 쓰기(POST) 시 필수
\`\`\`

레이트리밋은 100req/10초입니다. 호출 간 0.15초 이상 간격을 두고, 429 응답 시 백오프합니다.

**핵심 모델**

* **정의(definition)** = 스키마/타입. \`{ id, name }\` 형태이며, 목록은 \`GET /v2/custom-object-definitions\`로 조회합니다.
* **레코드(customObject)** = 정의에 속한 개별 데이터. 커스텀 필드가 평탄한 한글 키로 포함됩니다.
* 필드 정의(필드 목록/타입)는 \`GET /v2/field/custom-object\`로 조회합니다(별도 섹션).

> **참고:** 단건 조회 응답 형태가 그룹마다 다릅니다. people/deal 등은 단건 조회가 1요소 배열(\`data.people:[{...}]\`)이지만, 커스텀 오브젝트 단건은 \`data.customObject\`가 평탄한 객체입니다(배열 아님).

***

#### GET /v2/custom-object-definitions — 커스텀 오브젝트 정의 목록 조회

워크스페이스에 정의된 커스텀 오브젝트 타입(스키마) 목록을 조회합니다. definition ID를 얻는 출발점이며, 생성·조회 필터에 사용합니다.

**요청 파라미터**

없음(쿼리·바디 모두 없음).

**응답 \`200 OK\`**

\`\`\`json
{
  "success": true,
  "data": {
    "customObjectDefinitionList": [
      { "id": "<id>", "name": "계약서" }
    ]
  }
}
\`\`\`

| 경로                                  | 타입     | 설명                                       |
| ----------------------------------- | ------ | ---------------------------------------- |
| \`data.customObjectDefinitionList[]\` | array  | 정의 목록                                    |
| \`…[].id\`                            | string | 정의 ID(= 레코드의 \`customObjectDefinitionId\`) |
| \`…[].name\`                          | string | 정의 이름(이름 조회에 사용)                         |

이 엔드포인트는 \`nextCursor\`를 반환하지 않습니다.

**에러**

| 코드  | message               | 조건                                         |
| --- | --------------------- | ------------------------------------------ |
| 401 | Unauthorized          | 토큰 무효/누락(\`헤더에서 Authorization을 찾을 수 없습니다.\`) |
| 429 | Too Many Requests     | 레이트리밋 초과                                   |
| 500 | Internal Server Error | 서버 오류                                      |

***

#### GET /v2/custom-object — 커스텀 오브젝트 목록 조회

정의에 속한 레코드 목록을 조회합니다. 정의 ID 또는 정의 이름으로 필터합니다.

**요청 파라미터**

| 이름                           | 위치    | 타입     |  필수 | 설명                               |
| ---------------------------- | ----- | ------ | :-: | -------------------------------- |
| \`customObjectDefinitionId\`   | query | string | 조건부 | 정의 ID로 필터(Id/Name 중 택1 권장)       |
| \`customObjectDefinitionName\` | query | string | 조건부 | 정의 이름으로 필터(예: \`계약서\`). URL 인코딩 필요 |

> **참고:** 두 파라미터를 모두 생략하면 전체 커스텀 오브젝트 레코드가 반환됩니다. 특정 타입만 원하면 둘 중 하나를 지정합니다.

**응답 \`200 OK\`**

\`\`\`json
{
  "success": true,
  "data": {
    "customObjectList": [
      {
        "id": "<id>",
        "customObjectDefinitionId": "<id>",
        "RecordId": "<id>",
        "계약서 이름": "계약서 A",
        "API연동 커오 필드": 239393939,
        "관련 딜": [ { "id": "<id>", "name": "김덕수 딜 1" } ],
        "담당자": { "id": "<id>", "name": "홍길동" },
        "팀": [ { "id": "<id>", "name": "영업 팀" } ],
        "파이프라인": null,
        "파이프라인 단계": null,
        "최근 파이프라인 단계 수정 날짜": null,
        "생성 날짜": "...",
        "수정 날짜": "..."
      }
    ],
    "nextCursor": null
  }
}
\`\`\`

| 경로                             | 타입           | 설명                                                                   |
| ------------------------------ | ------------ | -------------------------------------------------------------------- |
| \`data.customObjectList[]\`      | array        | 레코드 목록(페이지당 50건)                                                     |
| \`…[].id\`                       | string       | 레코드 ID                                                               |
| \`…[].customObjectDefinitionId\` | string       | 소속 정의 ID                                                             |
| \`…[].RecordId\`                 | string       | 레코드 ID(\`id\`와 동일 값)                                                   |
| \`…[].<한글 필드명>\`                 | mixed        | 커스텀 필드값. 평탄한 한글 키. 관계형은 \`{id,name}\` 또는 그 배열, 숫자는 number, 미입력은 \`null\` |
| \`data.nextCursor\`              | string\\|null | 다음 페이지 커서. 더 없으면 \`null\`                                              |

> **참고:** 레코드 안의 관계형 값은 \`{id, name}\` 형태이며, 히스토리 응답에서는 같은 값이 \`{_id, name}\`(언더스코어)로 제공됩니다. 아래 히스토리 조회를 참고합니다.

**에러**

| 코드  | message               | 조건                                                                                  |
| --- | --------------------- | ----------------------------------------------------------------------------------- |
| 404 | Not Found             | 잘못된 \`customObjectDefinitionId\`/\`customObjectDefinitionName\`(\`커스텀 객체 정의를 찾을 수 없습니다\`) |
| 401 | Unauthorized          | 토큰 무효/누락                                                                            |
| 429 | Too Many Requests     | 레이트리밋 초과                                                                            |
| 500 | Internal Server Error | 서버 오류                                                                               |

> **참고:** 잘못된 정의 ID/이름은 \`404 Not Found\`와 \`커스텀 객체 정의를 찾을 수 없습니다\` 메시지를 반환합니다. 반면 잘못된 레코드 ID(단건 조회)는 \`400 Bad Request\`를 반환합니다(아래 단건 조회 참고).

***

#### GET /v2/custom-object/{customObjectId} — 커스텀 오브젝트 단건 조회

레코드 1건의 상세 정보를 조회합니다.

**요청 파라미터**

| 이름               | 위치   | 타입     |  필수 | 설명     |
| ---------------- | ---- | ------ | :-: | ------ |
| \`customObjectId\` | path | string |  필수 | 레코드 ID |

**응답 \`200 OK\`**

\`data.customObject\`는 레코드를 담은 평탄한 객체입니다(배열 아님).

\`\`\`json
{
  "success": true,
  "data": {
    "customObject": {
      "id": "<id>",
      "customObjectDefinitionId": "<id>",
      "RecordId": "<id>",
      "계약서 이름": "계약서 A",
      "API연동 커오 필드": 239393939,
      "관련 딜": [ { "id": "<id>", "name": "김덕수 딜 1" } ],
      "담당자": { "id": "<id>", "name": "홍길동" },
      "팀": [ { "id": "<id>", "name": "영업 팀" } ],
      "파이프라인": null,
      "파이프라인 단계": null,
      "최근 파이프라인 단계 수정 날짜": null,
      "생성 날짜": "...",
      "수정 날짜": "..."
    }
  }
}
\`\`\`

| 경로                  | 타입     | 설명                       |
| ------------------- | ------ | ------------------------ |
| \`data.customObject\` | object | 레코드(목록 항목과 동일 형태). 배열 아님 |

**에러**

| 코드  | message               | 조건                                    |
| --- | --------------------- | ------------------------------------- |
| 400 | Bad Request           | 없는/잘못된 레코드 ID(\`커스텀 오브젝트를 찾을 수 없습니다.\`) |
| 401 | Unauthorized          | 토큰 무효/누락                              |
| 429 | Too Many Requests     | 레이트리밋 초과                              |
| 500 | Internal Server Error | 서버 오류                                 |

> **참고:** 존재하지 않는 레코드를 조회하면 \`400 Bad Request\`와 \`커스텀 오브젝트를 찾을 수 없습니다.\` 메시지를 반환합니다.

***

#### POST /v2/custom-object — 커스텀 오브젝트 생성

새 레코드를 생성합니다.

**요청 파라미터 (body, application/json)**

| 이름                                                                         | 타입     |  필수 | 설명                                                |
| -------------------------------------------------------------------------- | ------ | :-: | ------------------------------------------------- |
| \`customObjectDefinitionId\`                                                 | string | 조건부 | 대상 정의 ID. \`customObjectDefinitionName\`과 둘 중 하나 필수 |
| \`customObjectDefinitionName\`                                               | string | 조건부 | 대상 정의 이름(ID 대신 사용 가능)                             |
| \`pipelineId\`                                                               | string |     | 파이프라인 ID                                          |
| \`pipelineStageId\`                                                          | string |     | 파이프라인 단계 ID                                       |
| \`memo\`                                                                     | string |     | 이 레코드에 텍스트 노트를 생성합니다("노트 / 메모" 섹션 참조).            |
| \`fieldList\`                                                                | array  |     | 필드값 배열. 각 항목 \`name\`(필수) + 값 키 1개                  |
| \`fieldList[].name\`                                                         | string | ✅\\* | 필드 이름(한글 필드명). fieldList 사용 시 항목마다 필수             |
| \`fieldList[].stringValue\` / \`numberValue\` / \`booleanValue\` / \`dateValue\`   | scalar |     | 단일 값(타입별 키 선택)                                    |
| \`fieldList[].stringValueList\`                                              | array  |     | 복수 텍스트 값                                          |
| \`fieldList[].{customObject,deal,lead,organization,people,user}ValueId\`     | string |     | 관계형 단일 FK                                         |
| \`fieldList[].{customObject,deal,lead,organization,people,user}ValueIdList\` | array  |     | 관계형 복수 FK                                         |

**요청 예시**

\`\`\`json
{
  "customObjectDefinitionId": "...",
  "memo": "API로 생성한 계약서",
  "fieldList": [
    { "name": "계약서 이름", "stringValue": "계약서 A" },
    { "name": "API연동 커오 필드", "numberValue": 239393939 },
    { "name": "담당자", "userValueId": "..." },
    { "name": "관련 딜", "dealValueIdList": ["..."] }
  ]
}
\`\`\`

**응답 \`201 Created\`**

\`\`\`json
{ "success": true, "data": { "customObject": { "id": "<id>", "name": "<name>", "createdAt": "<ISO>" } } }
\`\`\`

**에러**

| 코드  | message               | reason                                                                                                    |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| 400 | Bad Request           | 정의 미지정 → \`["[customObjectDefinitionId]: customObjectDefinitionId 또는 customObjectDefinitionName을 입력해주세요"]\` |
| 404 | Not Found             | 없는 정의 ID/이름 → \`커스텀 객체 정의를 찾을 수 없습니다\`                                                                      |
| 401 | Unauthorized          | 토큰 무효/누락                                                                                                  |
| 429 | Too Many Requests     | 레이트리밋 초과                                                                                                  |
| 500 | Internal Server Error | 서버 오류                                                                                                     |

> **참고:** 정의를 지정하지 않으면 \`400 Bad Request\`를, 존재하지 않는 정의 ID를 지정하면 \`404 Not Found\`를 반환합니다. \`reason\`을 읽고 분기합니다.

***

#### POST /v2/custom-object/{customObjectId} — 커스텀 오브젝트 수정

기존 레코드를 수정합니다. 수정도 POST 메서드를 사용하며, 경로에 레코드 ID가 들어갑니다.

**요청 파라미터**

| 이름                | 위치   | 타입     |  필수 | 설명                                     |
| ----------------- | ---- | ------ | :-: | -------------------------------------- |
| \`customObjectId\`  | path | string |  필수 | 수정할 레코드 ID                             |
| \`pipelineId\`      | body | string |     | 파이프라인 ID                               |
| \`pipelineStageId\` | body | string |     | 파이프라인 단계 ID                            |
| \`memo\`            | body | string |     | 이 레코드에 텍스트 노트를 생성합니다("노트 / 메모" 섹션 참조). |
| \`fieldList\`       | body | array  |     | 필드값 배열(생성과 동일 구조, \`name\` 필수)           |

**요청 예시**

\`\`\`json
{
  "memo": "수정 메모",
  "fieldList": [
    { "name": "계약서 이름", "stringValue": "계약서 B" }
  ]
}
\`\`\`

**응답 \`200 OK\`**

\`\`\`json
{ "success": true, "data": {
  "customObjectDefinition": { "id": "<id>", "name": "<name>" },
  "customObject": { "id": "<id>", "name": "<name>", "updatedAt": "<ISO>" }
} }
\`\`\`

**에러**

| 코드  | message               | reason                                                            |
| --- | --------------------- | ----------------------------------------------------------------- |
| 400 | Bad Request           | 없는 레코드 ID → \`커스텀 오브젝트를 찾을 수 없습니다.\`                                |
| 400 | Bad Request           | \`fieldList\` 항목 \`name\` 누락 → \`["[fieldList,0,name]: 필수 입력 사항입니다."]\` |
| 401 | Unauthorized          | 토큰 무효/누락                                                          |
| 429 | Too Many Requests     | 레이트리밋 초과                                                          |
| 500 | Internal Server Error | 서버 오류                                                             |

> **참고:** 존재하지 않는 레코드를 수정하면 \`400 Bad Request\`와 \`커스텀 오브젝트를 찾을 수 없습니다.\` 메시지를 반환합니다.

***

#### GET /v2/custom-object/history — 커스텀 오브젝트 히스토리 조회

레코드의 필드 변경 이력을 조회합니다.

**요청 파라미터**

| 이름               | 위치    | 타입     |  필수 | 설명                  |
| ---------------- | ----- | ------ | :-: | ------------------- |
| \`customObjectId\` | query | string |     | 특정 레코드로 필터. 생략 시 전체 |
| \`cursor\`         | query | string |     | 페이지네이션 커서           |

**응답 \`200 OK\`**

\`\`\`json
{
  "success": true,
  "data": {
    "customObjectHistoryList": [
      {
        "id": "<id>",
        "customObjectId": "<id>",
        "type": "editField",
        "source": { "type": "user", "id": "<id>", "name": "홍길동" },
        "fieldName": "계약서 이름",
        "fieldValue": "계약서 A",
        "ownerId": "<id>",
        "createdAt": "..."
      }
    ],
    "nextCursor": null
  }
}
\`\`\`

| 경로                   | 타입          | 설명                                 |
| -------------------- | ----------- | ---------------------------------- |
| \`…[].id\`             | string      | 히스토리 항목 ID                         |
| \`…[].customObjectId\` | string      | 대상 레코드 ID                          |
| \`…[].type\`           | string      | 변경 유형(예: \`editField\`)              |
| \`…[].source\`         | object      | 변경 주체 \`{ type, id, name }\`         |
| \`…[].fieldName\`      | string      | 변경된 필드명(한글)                        |
| \`…[].fieldValue\`     | mixed       | 변경 후 값. 관계형은 \`{_id, name}\` 또는 그 배열 |
| \`…[].ownerId\`        | string      | 변경자 user ID                        |
| \`…[].createdAt\`      | string(ISO) | 변경 시각                              |

> **참고:** 히스토리의 \`fieldValue\`에서 관계형 값은 \`{_id, name}\`(언더스코어) 형태로 제공됩니다. 레코드 조회의 \`{id, name}\`과 다르므로 파싱 시 분기합니다. 예: 담당자 변경 → \`{"_id": "af66...", "name": "홍길동"}\`, 팀 변경 → \`[{"_id":"f3ad...","name":"영업 팀"}]\`.

**에러**

| 코드  | message               | 조건       |
| --- | --------------------- | -------- |
| 401 | Unauthorized          | 토큰 무효/누락 |
| 429 | Too Many Requests     | 레이트리밋 초과 |
| 500 | Internal Server Error | 서버 오류    |

***

#### GET /v2/custom-object/activity — 커스텀 오브젝트 액티비티 조회

레코드의 활동 타임라인(생성·메모·이메일 등)을 조회합니다.

**요청 파라미터**

| 이름               | 위치    | 타입     |  필수 | 설명                  |
| ---------------- | ----- | ------ | :-: | ------------------- |
| \`customObjectId\` | query | string |     | 특정 레코드로 필터. 생략 시 전체 |
| \`cursor\`         | query | string |     | 페이지네이션 커서           |

**응답 \`200 OK\`**

\`\`\`json
{
  "success": true,
  "data": {
    "customObjectActivityList": [
      {
        "id": "<id>",
        "type": "create",
        "date": "...",
        "customObjectId": "<id>",
        "emailId": null, "messageId": null, "threadId": null, "smsId": null,
        "memoId": null, "todoId": null, "meetingId": null,
        "kakaoAlimtalkId": null, "emailLinkId": null
      }
    ]
  }
}
\`\`\`

| 경로                                                                           | 타입           | 설명                               |
| ---------------------------------------------------------------------------- | ------------ | -------------------------------- |
| \`…[].id\`                                                                     | string       | 액티비티 ID                          |
| \`…[].type\`                                                                   | string       | 활동 유형(예: \`create\`, \`memoCreate\`) |
| \`…[].date\`                                                                   | string(ISO)  | 활동 시각                            |
| \`…[].customObjectId\`                                                         | string       | 대상 레코드 ID                        |
| \`…[].{email,message,thread,sms,memo,todo,meeting,kakaoAlimtalk,emailLink}Id\` | string\\|null | 연결된 객체 ID(해당 활동일 때만 채워짐)         |

> **참고:** 커스텀 오브젝트 액티비티에는 \`meetingId\`, \`kakaoAlimtalkId\`, \`emailLinkId\`가 포함되며 \`webFormId\`는 포함되지 않습니다. 이 응답에는 \`nextCursor\`가 포함되지 않으므로, 사용 전 존재 여부를 확인합니다.

**에러**

| 코드  | message               | 조건       |
| --- | --------------------- | -------- |
| 401 | Unauthorized          | 토큰 무효/누락 |
| 429 | Too Many Requests     | 레이트리밋 초과 |
| 500 | Internal Server Error | 서버 오류    |

***

#### POST /v2/custom-object-temp — 커스텀 오브젝트 임시 생성

정의 ID와 대표값만으로 임시(temp) 커스텀 오브젝트를 생성합니다.

**요청 파라미터 (body, application/json)**

| 이름                         | 타입     |  필수 | 설명             |
| -------------------------- | ------ | :-: | -------------- |
| \`customObjectDefinitionId\` | string |  필수 | 대상 정의 ID       |
| \`mainFieldValue\`           | string |  필수 | 대표 필드 값(메인 필드) |

> **참고:** 임시 생성은 \`customObjectDefinitionName\`을 받지 않고 \`customObjectDefinitionId\`만 받습니다. 두 파라미터 모두 필수입니다.

**요청 예시**

\`\`\`json
{
  "customObjectDefinitionId": "...",
  "mainFieldValue": "계약서 A"
}
\`\`\`

**응답 \`200 OK\`**

\`\`\`json
{ "success": true, "data": { "customObject": { "id": "<id>", "customObjectDefinitionId": "<defId>" } } }
\`\`\`

**에러**

| 코드  | message               | reason                                                                                   |
| --- | --------------------- | ---------------------------------------------------------------------------------------- |
| 400 | Bad Request           | 둘 다 누락 → \`["[customObjectDefinitionId]: 필수 입력 사항입니다.","[mainFieldValue]: 필수 입력 사항입니다."]\` |
| 400 | Bad Request           | \`mainFieldValue\`만 누락 → \`["[mainFieldValue]: 필수 입력 사항입니다."]\`                              |
| 401 | Unauthorized          | 토큰 무효/누락                                                                                 |
| 429 | Too Many Requests     | 레이트리밋 초과                                                                                 |
| 500 | Internal Server Error | 서버 오류                                                                                    |

***

### 견적서 · 상품 · 파이프라인 (Quote / Product / Pipeline)

> 공통 규약(인증·envelope·레이트리밋)은 문서 상단 **기본 정보**·**공통 응답 형식**을 참조하세요. 모든 경로는 \`/v2/...\`입니다.

**인증 (공통)**

\`\`\`
Authorization: Bearer <token>
Content-Type: application/json   # 쓰기(POST)에만
\`\`\`

***

#### 상품 (Product)

판매하는 제품/서비스로, 견적서에 포함되는 단위입니다. 일반 또는 구독(월간·연간) 유형이 있습니다.

**GET /v2/product — 상품 목록 조회**

상품 목록을 페이지 단위로 조회합니다.

**요청 파라미터**

| 이름       | 위치    | 타입     |  필수 | 설명                                                        |
| -------- | ----- | ------ | :-: | --------------------------------------------------------- |
| \`cursor\` | query | string |     | 페이지네이션 커서. 직전 응답의 \`data.nextCursor\` 값을 넘깁니다. 페이지당 50건입니다. |

**응답 — 200 OK**

\`data.productList[]\`는 상품 레코드 배열이며, 커스텀 필드가 평탄한 한글 키로 포함됩니다.

\`\`\`json
{
  "success": true,
  "data": {
    "productList": [
      {
        "id": "<id>",
        "RecordId": "<id>",
        "이름": "서버1",
        "금액": 100000,
        "단위": null,
        "유형": "일반",
        "상태": "active",
        "코드": null,
        "벤더사": "시스코",
        "담당자": {"id": "...", "name": "홍길동"},
        "팀": [{"id": "...", "name": "영업 팀"}],
        "최근 작성된 노트": null,
        "최근 노트 작성일": null,
        "최근 노트 작성자": null,
        "생성 날짜": "...",
        "수정 날짜": "..."
      }
    ],
    "nextCursor": "..."
  }
}
\`\`\`

| 응답 경로                                 | 타입           | 설명                                  |
| ------------------------------------- | ------------ | ----------------------------------- |
| \`data.productList[]\`                  | array        | 상품 레코드 배열. 커스텀 필드가 평탄한 한글 키로 포함됩니다. |
| \`data.productList[].id\` / \`.RecordId\` | UUID         | 상품 ID (둘 다 동일 값)                    |
| \`data.productList[].이름\`               | string       | 상품명                                 |
| \`data.productList[].금액\`               | number       | 단가                                  |
| \`data.productList[].유형\`               | string       | \`"일반"\` / 구독(월간·연간)                  |
| \`data.productList[].상태\`               | string       | \`"active"\` 등                        |
| \`data.productList[].단위\` \`.코드\` \`.벤더사\`  | string\\|null | 부가 속성                               |
| \`data.productList[].담당자\`              | {id,name}    | 담당 사용자                              |
| \`data.productList[].팀\`                | \\[{id,name}] | 팀 배열                                |
| \`data.nextCursor\`                     | string       | 다음 페이지 커서. 마지막 페이지에서는 키 자체가 생략됩니다.  |

> **참고:** \`cursor\`로 끝까지 넘기면 \`data: { "productList": [] }\`만 반환되고 \`nextCursor\` 키는 포함되지 않습니다. \`nextCursor\` 부재를 페이지 종료 신호로 사용하세요.

**에러**

| Status | message               | reason                                              | 조건            |
| ------ | --------------------- | --------------------------------------------------- | ------------- |
| 401    | Unauthorized          | \`헤더에서 Authorization을 찾을 수 없습니다.\` / \`유효하지 않은 토큰입니다.\` | 헤더 누락 / 토큰 무효 |
| 429    | Too Many Requests     | —                                                   | 100req/10초 초과 |
| 500    | Internal Server Error | —                                                   | 서버 오류         |

**POST /v2/product — 상품 생성**

상품을 생성합니다.

**요청 파라미터 (body, application/json)**

| 이름            | 타입     |  필수 | 설명                                                    |
| ------------- | ------ | :-: | ----------------------------------------------------- |
| \`name\`        | string |  필수 | 상품명. 누락 시 \`[name]: 필수 입력 사항입니다.\`                      |
| \`price\`       | number |  필수 | 단가. 숫자로 입력해야 합니다. 누락/비숫자 시 \`[price]: 유효한 숫자를 입력해주세요.\` |
| \`description\` | string |     | 설명                                                    |

> **참고:** \`name\`과 \`price\`는 모두 필수입니다. \`name\`만 보내면 \`400 Bad Request\`와 \`[price]: 유효한 숫자를 입력해주세요.\`를 반환합니다.

**요청 예시**

\`\`\`json
{
  "name": "서버1",
  "price": 100000,
  "description": "1U 랙 서버"
}
\`\`\`

**응답 — 200 OK**

\`\`\`json
{ "success": true, "data": { "product": { "id": "string", "name": "string", "price": 0, "createdAt": "string" } } }
\`\`\`

**에러**

| Status | message               | reason                                                  | 조건                           |
| ------ | --------------------- | ------------------------------------------------------- | ---------------------------- |
| 400    | Bad Request           | \`["[name]: 필수 입력 사항입니다.","[price]: 유효한 숫자를 입력해주세요."]\`   | 빈 바디                         |
| 400    | Bad Request           | \`["[name]: 형식에 맞게 입력해주세요.","[price]: 유효한 숫자를 입력해주세요."]\` | 타입 오류(\`name\`=숫자, \`price\`=문자) |
| 400    | Bad Request           | \`["[price]: 유효한 숫자를 입력해주세요."]\`                          | \`name\`만 전송                   |
| 401    | Unauthorized          | \`헤더에서 Authorization을 찾을 수 없습니다.\` / \`유효하지 않은 토큰입니다.\`     | 인증 실패                        |
| 429    | Too Many Requests     | —                                                       | 레이트리밋 초과                     |
| 500    | Internal Server Error | —                                                       | 서버 오류                        |

> 검증 실패 시 \`reason\`은 배열로 반환됩니다. 각 항목을 읽어 해당 파라미터를 고쳐 재호출하세요.

***

#### 견적서 (Quote)

딜/리드에 연결된 가격 제안서로, 상품 × 수량 × 할인으로 구성됩니다.

> **참고:** 견적서 단독 목록 조회 엔드포인트는 없습니다. 견적서는 딜/리드를 통해 조회합니다(\`GET /v2/{deal|lead}/{id}/quote\`). 생성은 \`POST /v2/quote\`로 합니다.

**POST /v2/quote — 견적서 생성**

견적서를 생성합니다.

**요청 파라미터 (body, application/json)**

| 이름                     | 타입           |  필수 | 설명                                                       |
| ---------------------- | ------------ | :-: | -------------------------------------------------------- |
| \`name\`                 | string       |  필수 | 견적서명. 누락 시 \`[name]: 필수 입력 사항입니다.\`                        |
| \`dealId\`               | string(UUID) | 조건부 | 연결할 딜. \`dealId\` 또는 \`leadId\` 중 하나는 필수입니다.                 |
| \`leadId\`               | string(UUID) | 조건부 | 연결할 리드. \`dealId\` 또는 \`leadId\` 중 하나는 필수입니다.                |
| \`itemList\`             | array        |     | 견적 구성 상품. \`[{productId, quantity, unitPrice, discount}]\` |
| \`itemList[].productId\` | string(UUID) |     | 상품 ID                                                    |
| \`itemList[].quantity\`  | integer      |     | 수량                                                       |
| \`itemList[].unitPrice\` | number       |     | 단가                                                       |
| \`itemList[].discount\`  | number       |     | 할인                                                       |

> **참고:** \`dealId\` 또는 \`leadId\` 중 하나는 반드시 보내야 합니다. 둘 다 생략하면 \`400 Bad Request\`와 \`[refine]: dealId 또는 leadId를 입력해주세요.\`를 반환합니다. 둘 다 함께 보낼 수도 있습니다. **참고:** 존재하지 않는 \`dealId\`/\`leadId\`를 보내면 \`400 Bad Request\`와 \`dealId의 대상을 찾을 수 없습니다.\` / \`leadId의 대상을 찾을 수 없습니다.\` 메시지를 반환합니다(이 경우 \`reason\`은 문자열입니다). 검증 순서는 \`name\` → \`dealId/leadId\` 존재 여부 → 나머지입니다.

**요청 예시**

\`\`\`json
{
  "name": "11월 서버 견적서",
  "dealId": "...",
  "itemList": [
    {
      "productId": "...",
      "quantity": 1,
      "unitPrice": 100000,
      "discount": 0
    }
  ]
}
\`\`\`

**응답 — 200 OK**

\`\`\`json
{ "success": true, "data": { "quote": { "id": "string", "name": "string", "totalAmount": 0, "dealId": "string", "leadId": "string", "createdAt": "string" } } }
\`\`\`

**에러**

| Status | message               | reason                                              | 조건                           |
| ------ | --------------------- | --------------------------------------------------- | ---------------------------- |
| 400    | Bad Request           | \`["[name]: 필수 입력 사항입니다."]\`                          | 빈 바디                         |
| 400    | Bad Request           | \`["[refine]: dealId 또는 leadId를 입력해주세요."]\`           | \`name\`만 전송, deal/lead 둘 다 누락 |
| 400    | Bad Request           | \`dealId의 대상을 찾을 수 없습니다.\` (문자열)                      | 존재하지 않는 \`dealId\`             |
| 400    | Bad Request           | \`leadId의 대상을 찾을 수 없습니다.\` (문자열)                      | 존재하지 않는 \`leadId\`             |
| 401    | Unauthorized          | \`헤더에서 Authorization을 찾을 수 없습니다.\` / \`유효하지 않은 토큰입니다.\` | 인증 실패                        |
| 429    | Too Many Requests     | —                                                   | 레이트리밋 초과                     |
| 500    | Internal Server Error | —                                                   | 서버 오류                        |

**GET /v2/{deal|lead}/{id}/quote — 딜/리드의 견적서 조회**

딜·리드에 연결된 견적서 목록을 반환합니다.

**요청 파라미터**

| 이름   | 위치   | 타입           |  필수 | 설명         |
| ---- | ---- | ------------ | :-: | ---------- |
| \`id\` | path | string(UUID) |  필수 | 딜 또는 리드 ID |

**응답 — 200 OK**

\`data.quoteList[]\`는 견적서 배열이며, 각 견적서는 견적 구성 상품 목록을 포함합니다.

\`\`\`json
{
  "success": true,
  "data": {
    "quoteList": [
      {
        "id": "...",
        "roomId": "...",
        "메인 견적서 여부": true,
        "공유 링크": "...",
        "RecordId": "...",
        "금액": 100000,
        "담당자": {"id": "...", "name": "..."},
        "이름": "...",
        "팀": [{"id": "...", "name": "..."}],
        "할인": 0,
        "할인 유형": "percentage",
        "견적 구성 상품": [
          {
            "id": "...",
            "productId": "...",
            "금액": 100000,
            "수량": 1,
            "할인": 0,
            "할인 유형": "percentage",
            "부가세": 0,
            "전체 금액": 100000,
            "결제 횟수": 1,
            "시작 결제일": "...",
            "마지막 결제일": "...",
            "계약 비고": "..."
          }
        ],
        "생성 날짜": "...",
        "수정 날짜": "..."
      }
    ]
  }
}
\`\`\`

| 응답 경로                         | 타입      | 설명                                                     |
| ----------------------------- | ------- | ------------------------------------------------------ |
| \`data.quoteList[].id\`         | UUID    | 견적서 ID                                                 |
| \`data.quoteList[].메인 견적서 여부\`  | boolean | 대표 견적서 여부                                              |
| \`data.quoteList[].금액\`         | number  | 할인 적용 후 총액                                             |
| \`data.quoteList[].할인 유형\`      | string  | \`"percentage"\` / \`"amount"\`                            |
| \`data.quoteList[].견적 구성 상품[]\` | array   | 구성 상품(\`productId\`, \`금액\`(단가), \`수량\`, \`전체 금액\`, \`결제 횟수\` 등) |

**에러**

| Status | message      | reason                                              | 조건               |
| ------ | ------------ | --------------------------------------------------- | ---------------- |
| 400    | Bad Request  | \`딜을 찾을 수 없습니다.\`                                     | 존재하지 않는 \`dealId\` |
| 401    | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\` / \`유효하지 않은 토큰입니다.\` | 인증 실패            |

> **참고:** 리드의 견적서는 \`GET /v2/lead/{id}/quote\`로 조회합니다. 리드는 \`pipelineId\`/\`status\`가 선택이거나 불필요합니다(딜/리드 섹션 참조).

***

#### 파이프라인 (Pipeline)

딜/리드의 진행 단계 흐름으로, 영업 프로세스를 시각화합니다(예: 첫 미팅 준비 → 고객 니즈 파악 → 솔루션 비교 검토 → 최종 협상 → 계약 승인 절차).

**GET /v2/pipeline — 파이프라인 목록 조회**

전체 파이프라인을 한 번에 반환합니다.

**요청 파라미터** 없습니다. 페이지네이션도 없으며 전체를 한 번에 반환합니다.

**응답 — 200 OK**

\`\`\`json
{
  "success": true,
  "data": {
    "pipelineList": [
      {
        "_id": "<id>",
        "name": "세일즈 파이프라인",
        "pipelineStageList": [
          { "_id": "...", "name": "첫 미팅 준비",   "index": 0 },
          { "_id": "...", "name": "고객 니즈 파악", "index": 1 },
          { "_id": "...", "name": "솔루션 비교 검토","index": 2 },
          { "_id": "...", "name": "최종 협상",     "index": 3 },
          { "_id": "...", "name": "계약 승인 절차", "index": 4 }
        ]
      }
    ]
  }
}
\`\`\`

| 응답 경로                                           | 타입      | 설명         |
| ----------------------------------------------- | ------- | ---------- |
| \`data.pipelineList[]\`                           | array   | 파이프라인 배열   |
| \`data.pipelineList[]._id\`                       | UUID    | 파이프라인 ID   |
| \`data.pipelineList[].name\`                      | string  | 파이프라인 이름   |
| \`data.pipelineList[].pipelineStageList[]\`       | array   | 단계 배열      |
| \`data.pipelineList[].pipelineStageList[]._id\`   | UUID    | 단계 ID      |
| \`data.pipelineList[].pipelineStageList[].name\`  | string  | 단계명        |
| \`data.pipelineList[].pipelineStageList[].index\` | integer | 단계 순서(0부터) |

> **참고:** 파이프라인/단계 식별자 키는 \`_id\`입니다(다른 오브젝트의 \`id\`/\`RecordId\`와 다름). 파싱 시 \`_id\`로 읽으세요. 이 엔드포인트는 페이지네이션이 없어 \`nextCursor\`를 반환하지 않으며, 응답 전체가 모든 파이프라인입니다. 또한 \`name\`/\`index\`는 영문 키로 제공됩니다(커스텀 필드 평탄화 없음). **참고:** 딜/리드 생성·수정 시 파이프라인은 body 파라미터 \`pipelineId\`(=\`_id\`)와 \`pipelineStageId\`(단계 \`_id\`)로 지정합니다. \`pipelineStageId\`를 변경할 때는 반드시 \`pipelineId\`와 함께 보내야 합니다(딜 섹션 참조).

**에러**

| Status | message               | reason                                              | 조건            |
| ------ | --------------------- | --------------------------------------------------- | ------------- |
| 401    | Unauthorized          | \`헤더에서 Authorization을 찾을 수 없습니다.\` / \`유효하지 않은 토큰입니다.\` | 헤더 누락 / 토큰 무효 |
| 429    | Too Many Requests     | —                                                   | 레이트리밋 초과      |
| 500    | Internal Server Error | —                                                   | 서버 오류         |

> **참고:** 파이프라인 단건 조회 엔드포인트는 없습니다. \`GET /v2/pipeline/123\` 같은 미정의 하위 경로는 JSON이 아니라 마케팅 HTML을 \`200\`으로 반환하므로 경로를 정확히 사용하세요. 단건이 필요하면 목록에서 \`_id\`로 필터하세요.

***

### 통합 검색 · 연결관계 (Search & Association)

> 모든 경로는 \`/v2/...\`이며, \`Authorization: Bearer <token>\` 헤더가 필수입니다. 쓰기 요청에는 \`Content-Type: application/json\`을 함께 보내야 합니다.

***

#### POST /v2/object/{targetType}/search — 오브젝트 검색

복합 조건으로 오브젝트를 검색합니다. 예: "이메일 있는 고객 중 이름에 '김'이 포함된 사람", "금액 1000만원 이상인 딜".

이 엔드포인트는 요청당 10포인트를 소모하여 일반 GET보다 비쌉니다. 100req/10초 한도를 빠르게 소진하므로 호출 간 0.3초 이상 간격을 권장합니다.

**요청 파라미터**

| 이름                          | 위치    | 타입                                   | 필수  | 설명                                                                                                                                                                                |
| --------------------------- | ----- | ------------------------------------ | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| \`targetType\`                | path  | string                               | 필수  | \`people\` \\| \`organization\` \\| \`deal\` \\| \`lead\`만 허용합니다. \`custom-object\` 등 그 외 타입은 400 \`Invalid Parameters\`를 반환합니다.                                                                 |
| \`cursor\`                    | query | string                               | 선택  | 페이지네이션 커서. 응답 \`nextCursor\`를 그대로 전달합니다.                                                                                                                                            |
| \`filterGroupList\`           | body  | array                                | 필수  | 필터 그룹 배열. 빈 배열이나 누락은 허용되지 않습니다. 그룹 간 OR로 결합되며, 최대 3개입니다.                                                                                                                          |
| \`filterGroupList[].filters\` | body  | array                                | 필수  | 한 그룹 내 필터 배열. 필터 간 AND로 결합되며, 최대 3개입니다.                                                                                                                                           |
| \`…filters[].fieldName\`      | body  | string                               | 필수  | 기본/커스텀 필드의 한글 이름(예: \`이름\`, \`금액\`, \`실패 사유\`). 정확한 이름은 \`GET /v2/field/{type}\`로 확인합니다.                                                                                                  |
| \`…filters[].operator\`       | body  | enum                                 | 필수  | 아래 연산자표 참고. 필드 타입과 맞아야 합니다.                                                                                                                                                       |
| \`…filters[].value\`          | body  | string \\| number \\| boolean \\| array | 조건부 | \`EXISTS\`/\`NOT_EXISTS\`에서만 생략할 수 있고, 그 외 연산자에서는 필수입니다. 빈 문자열 \`""\`은 허용되지 않습니다. \`IN\`/\`NOT_IN\`/\`DATE_BETWEEN\`은 배열로 전달합니다. boolean 필드는 따옴표 없는 \`true\`/\`false\`로 전달합니다(문자열 \`"true"\`는 400). |

> **참고:** 딜의 이름 필드는 \`이름\`입니다(\`딜 이름\`이 아니며, \`딜 이름\`을 전달하면 400 \`Invalid fieldName: 딜 이름\`을 반환합니다). 정확한 이름은 \`GET /v2/field/{type}\`로 확인합니다.

**연산자표 (operator)**

| 카테고리   | Operator                                                                                                                                 | 적용 필드 타입              | 비고                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------- |
| 공통     | \`EQ\`, \`NEQ\`, \`EXISTS\`, \`NOT_EXISTS\`                                                                                                      | 대부분                   | \`EXISTS\`/\`NOT_EXISTS\`에서만 value 생략 가능                  |
| 문자열    | \`CONTAINS\`, \`NOT_CONTAINS\`                                                                                                               | string                | number/user/relation 필드에는 사용할 수 없습니다(400)             |
| 숫자     | \`LT\`, \`LTE\`, \`GT\`, \`GTE\`                                                                                                                 | number                | value는 숫자여야 합니다                                       |
| 참/거짓   | \`EQ\`, \`NEQ\`                                                                                                                              | boolean               | value는 따옴표 없는 \`true\`/\`false\`. 문자열 \`"true"\`·숫자는 400    |
| 선택(단일) | \`IN\`, \`NOT_IN\`                                                                                                                           | singleSelect          | value는 배열입니다                                          |
| 선택(다중) | \`LIST_CONTAIN\`, \`LIST_NOT_CONTAIN\`                                                                                                       | multiSelect 등 list 타입 | string 등 비-list 필드에는 사용할 수 없습니다(400)                  |
| 날짜(지정) | \`DATE_ON_OR_AFTER\`, \`DATE_ON_OR_BEFORE\`, \`DATE_IS_SPECIFIC_DAY\`, \`DATE_BETWEEN\`                                                          | dateTime/date         | \`DATE_BETWEEN\` value=\`["2025-01-01","2025-12-31"]\` 배열 |
| 날짜(경과) | \`DATE_MORE_THAN_DAYS_AGO\`, \`DATE_LESS_THAN_DAYS_AGO\`, \`DATE_LESS_THAN_DAYS_LATER\`, \`DATE_MORE_THAN_DAYS_LATER\`, \`DATE_AGO\`, \`DATE_LATER\` | dateTime/date         |                                                       |

타입별 사용 규칙:

* **boolean(체크박스)**: \`EQ\`/\`NEQ\`(값 비교)와 \`EXISTS\`/\`NOT_EXISTS\`(설정 여부)를 지원합니다. value는 따옴표 없는 \`true\`/\`false\`이며, 문자열 \`"true"\`/\`"false"\`나 숫자(\`1\`/\`0\`)는 400 \`Operator "EQ" on field "<필드>" requires a boolean value.\`를 반환합니다(숫자 필드와 달리 문자열 변환을 허용하지 않습니다). **\`EQ\`+\`false\`(명시적으로 false로 설정된 레코드)와 \`NOT_EXISTS\`(값이 설정되지 않은 레코드)는 서로 다른 조건이며 결과가 다릅니다** — "체크 해제된 레코드"를 찾을 때 \`NOT_EXISTS\`를 쓰면 안 되고 \`EQ\`+\`false\`를 씁니다.
* **multiSelect**: \`EQ\`/\`NEQ\` 대신 \`LIST_CONTAIN\`/\`LIST_NOT_CONTAIN\`을 사용합니다. value는 옵션의 \`value\`(한글) 또는 옵션 \`id\`(UUID) 둘 다 허용합니다.
* **relation/user 필드**(담당자, 파이프라인, 고객 등): UUID 값만 사용합니다. \`CONTAINS\`/\`NOT_CONTAINS\`는 사용할 수 없으며 400 \`Invalid operator … (type: user)\`를 반환합니다. 존재 여부는 \`EXISTS\`/\`NOT_EXISTS\`로 확인합니다.
* **빈 값 체크**: \`EXISTS\`/\`NOT_EXISTS\`를 사용합니다. \`NEQ\`+\`""\`은 검증 실패합니다.

**요청 예시**

\`\`\`json
{ "filterGroupList": [ { "filters": [ { "fieldName": "이메일", "operator": "EQ", "value": "test@test.com" } ] } ] }
\`\`\`

\`\`\`json
{ "filterGroupList": [ { "filters": [ { "fieldName": "이메일", "operator": "EXISTS" }, { "fieldName": "이름", "operator": "CONTAINS", "value": "테스트" } ] } ] }
\`\`\`

\`\`\`json
// boolean: 체크 해제된(명시적 false) 레코드 — value는 따옴표 없는 false
{ "filterGroupList": [ { "filters": [ { "fieldName": "동의 여부", "operator": "EQ", "value": false } ] } ] }
\`\`\`

**응답 \`200 OK\`**

매칭된 레코드는 타입과 무관하게 \`data.objectList[]\`로 반환되며, 각 레코드는 \`id\`와 \`name\` 두 키만 담습니다. 상세 정보는 개별 조회 API로 가져옵니다.

\`\`\`json
{ "success": true,
  "data": {
    "objectList": [ { "id": "019c285d-…", "name": "테스트담당자" } ],
    "nextCursor": null } }
\`\`\`

| 경로                       | 타입           | 설명                                |
| ------------------------ | ------------ | --------------------------------- |
| \`data.objectList[]\`      | array        | 매칭된 레코드. \`{id, name}\` 두 키만 반환합니다. |
| \`data.objectList[].id\`   | string(uuid) | 레코드 ID                            |
| \`data.objectList[].name\` | string       | 표시 이름                             |
| \`data.nextCursor\`        | string\\|null | 다음 페이지 커서. 페이지당 50건입니다.           |

**에러**

| HTTP | message      | reason                                                                         | 발생 조건                                                 |
| ---- | ------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| 400  | Bad Request  | \`Invalid Parameters\`                                                           | targetType이 4종 외(예: \`custom-object\`, 오타)              |
| 400  | Bad Request  | \`Invalid fieldName: <이름>\`                                                      | 존재하지 않는 fieldName                                     |
| 400  | Bad Request  | \`["[filterGroupList,0,filters,0,operator]: 유효하지 않은 값입니다."]\`                    | 정의되지 않은 operator(예: \`FOO\`)                            |
| 400  | Bad Request  | \`Invalid operator "CONTAINS" for field "금액" (type: number)\`                    | operator–필드타입 불일치(문자열/리스트/유저)                         |
| 400  | Bad Request  | \`Operator "GT" on field "금액" requires a numeric value.\`                        | 숫자로 해석할 수 없는 문자열 value(숫자형 문자열 \`"100"\`은 숫자로 변환되어 허용됨) |
| 400  | Bad Request  | \`Operator "EQ" on field "동의 여부" requires a boolean value.\`                     | boolean 필드에 문자열/숫자 value                              |
| 400  | Bad Request  | \`["[filterGroupList,0,filters,0,value]: value is required for this operator"]\` | EXISTS/NOT\\_EXISTS 외인데 value 누락                       |
| 400  | Bad Request  | \`["[filterGroupList,0,filters,0,value]: 형식에 맞게 입력해주세요."]\`                      | value가 빈 문자열 \`""\`                                     |
| 400  | Bad Request  | \`["[filterGroupList]: 필수 입력 사항입니다."]\`                                          | filterGroupList 누락/빈 배열                               |
| 400  | Bad Request  | \`["[filterGroupList,0,filters]: 3이하의 길이로 입력해주세요."]\`                            | 한 그룹 filters > 3개                                     |
| 400  | Bad Request  | \`["[filterGroupList]: 3이하의 길이로 입력해주세요."]\`                                      | filterGroupList > 3개                                  |
| 401  | Unauthorized | \`헤더에서 Authorization을 찾을 수 없습니다.\`                                               | Authorization 헤더 없음                                   |
| 401  | Unauthorized | \`유효하지 않은 토큰입니다.\`                                                               | 토큰 무효                                                 |

> **참고:** 값 타입이 틀린 경우에도 400으로 응답합니다. reason은 타입 불일치일 때 문자열, 스키마 검증 실패일 때 배열로 반환되므로 두 형태를 모두 파싱해야 합니다.

**예시**

\`\`\`jsonc
// 이메일 EQ → {"objectList":[{"id":"…","name":"테스트담당자"}], "nextCursor":null}
{"filterGroupList":[{"filters":[{"fieldName":"이메일","operator":"EQ","value":"test@test.com"}]}]}

// AND: 이메일 있음 + 이름에 '테스트' 포함
{"filterGroupList":[{"filters":[{"fieldName":"이메일","operator":"EXISTS"},{"fieldName":"이름","operator":"CONTAINS","value":"테스트"}]}]}

// multiSelect: value=한글 또는 옵션id 둘 다 OK
{"filterGroupList":[{"filters":[{"fieldName":"실패 사유","operator":"LIST_CONTAIN","value":"예산 부족 / 비용 부담"}]}]}
\`\`\`

***

#### GET /v2/object/{targetType}/{targetId}/association/{toTargetType}/primary — 기본 연결관계 조회

#### GET /v2/object/{targetType}/{targetId}/association/{toTargetType}/custom — 커스텀 연결관계 조회

오브젝트 간 연결 관계를 조회합니다. 예: "이 딜에 연결된 고객은?", "이 고객이 속한 회사는?". 세일즈맵의 연결관계는 두 종류이며, 각각 별도 엔드포인트로 조회합니다.

* **기본(메인) 연결관계 — Primary**: 시스템이 제공하는 표준 연결입니다(FK 직접 연결). 예: 고객↔회사, 딜↔고객/회사. 연결된 레코드의 **ID 목록**만 반환합니다.
* **커스텀 연결관계 — Custom**: 사용자가 직접 정의하는 연결입니다. 연결관계마다 **이름**을 두고, 양쪽 레코드에 표시되는 \\*\\*라벨(label)\\*\\*을 각각 설정합니다.
  * 예) \`cs건\`이라는 커스텀 연결관계를 만들고 한쪽 라벨을 \`요청사\`, 반대쪽 라벨을 \`관련 cs건\`으로 지정하면 — A 레코드에서는 이 연결이 \`요청사\`로, 연결된 B 레코드에서는 \`관련 cs건\`으로 보입니다.
  * 조회 시 각 항목은 연결된 레코드 \`id\`와 그 연결의 \`label\`(위에서 설정한 라벨)을 함께 반환합니다.

Primary와 Custom은 허용하는 \`toTargetType\`이 서로 다릅니다(아래 참고).

> **참고(연결 만들기·교체):** 연결관계 엔드포인트는 **조회 전용**입니다. 레코드를 실제로 연결하려면 **생성/수정 API에서 연결 대상 ID를 전달**합니다.
>
> * **딜·리드 ↔ 고객/회사**: 생성/수정 시 top-level \`peopleId\`·\`organizationId\`를 보냅니다. 이미 연결이 있으면 **새 값으로 교체**되며(추가가 아님), 같은 값이면 변화가 없습니다. 연결 결과는 평탄 레코드 필드가 아니라 \`.../association/{toTargetType}/primary\`로 조회합니다.
> * **고객 ↔ 회사**: 고객 수정 시 \`organizationId\`를 보내면 기존 회사 연결을 **덮어씁니다(교체)**.
> * 그 밖의 관계는 \`fieldList\`의 관계 키(\`peopleValueId\`, \`organizationValueId\` 등 — "필드 값 쓰기" 참조)로 설정합니다.
> * **연결 해제(제거)는 지원하지 않습니다.** \`peopleId\`·\`organizationId\`에 \`null\`이나 빈 문자열을 보내면 \`[organizationId]: 필수 입력 사항입니다.\`(400)를 반환합니다. 다른 값으로 **교체만** 가능합니다.
> * **커스텀 연결관계**: 레코드를 연결하는 것은 \`fieldList\`의 관계 키(예: \`customObjectValueIdList\`)로 **가능**합니다(설정 후 \`.../association/.../custom\` 조회에 나타남). 단 연결관계의 **라벨 이름 자체를 바꾸는 것은 API로 불가**합니다(웹 UI 전용) — 조회 응답의 \`label\`은 읽기 전용입니다.

**요청 파라미터**

| 이름             | 위치    | 타입           | 필수 | 설명                                            |
| -------------- | ----- | ------------ | -- | --------------------------------------------- |
| \`targetType\`   | path  | string       | 필수 | 기준 오브젝트 타입                                    |
| \`targetId\`     | path  | string(uuid) | 필수 | 기준 레코드 ID                                     |
| \`toTargetType\` | path  | string       | 필수 | 연결 대상 타입. primary와 custom에서 허용값이 다릅니다(아래 참고). |
| \`cursor\`       | query | string       | 선택 | 페이지네이션 커서                                     |

허용 \`toTargetType\`은 엔드포인트별로 다릅니다:

* **primary**: \`people\`, \`organization\`, \`deal\`, \`lead\`, \`memo\`. \`custom-object\`는 400 \`Invalid Parameters\`를 반환합니다.
* **custom**: \`people\`, \`organization\`, \`deal\`, \`lead\`, \`custom-object\`. \`memo\`는 400 \`Invalid Parameters\`를 반환합니다.

**응답 \`200 OK\`**

두 엔드포인트의 응답 키가 다릅니다. primary는 \`data.associationIdList\`(문자열 배열)를, custom은 \`data.associationItemList\`(\`{id, label}\` 객체 배열)를 반환합니다. 연결이 없으면 빈 배열을 반환합니다.

**Primary** — ID 목록:

\`\`\`json
{ "success": true, "data": { "associationIdList": ["<id>"], "nextCursor": null } }
\`\`\`

| 경로                         | 타입              | 설명            |
| -------------------------- | --------------- | ------------- |
| \`data.associationIdList[]\` | string(uuid)\\[] | 연결된 레코드 ID 목록 |
| \`data.nextCursor\`          | string\\|null    | 다음 페이지 커서     |

**Custom** — ID + 라벨:

\`\`\`json
{ "success": true, "data": { "associationItemList": [ { "id": "...", "label": "관련 cs건" } ], "nextCursor": null } }
\`\`\`

| 경로                                 | 타입           | 설명                                                                                       |
| ---------------------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| \`data.associationItemList[].id\`    | string(uuid) | 연결된 레코드 ID                                                                               |
| \`data.associationItemList[].label\` | string       | 조회한 레코드 방향에서 본 그 연결의 라벨. **양방향 연결은 방향마다 라벨이 다릅니다**(예: A→B 조회 시 \`요청사\`, B→A 조회 시 \`관련 cs건\`) |
| \`data.nextCursor\`                  | string\\|null | 다음 페이지 커서                                                                                |

> **참고:** 연결이 FK인지 커스텀인지 불명확하면 primary로 먼저 조회하고, 결과가 비어 있으면 custom으로 재시도합니다.

**에러**

| HTTP | message      | reason                                              | 발생 조건                                                                                    |
| ---- | ------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 400  | Bad Request  | \`<오브젝트명>을 찾을 수 없습니다.\` (예: \`고객을 찾을 수 없습니다.\`)         | 존재하지 않는 targetId(UUID 형식은 맞음)                                                            |
| 400  | Bad Request  | \`Invalid Parameters\`                                | targetId 형식 오류 / 허용 외 targetType·toTargetType (custom-object를 primary에, memo를 custom에 등) |
| 401  | Unauthorized | \`유효하지 않은 토큰입니다.\` / \`헤더에서 Authorization을 찾을 수 없습니다.\` | 토큰 무효 / 헤더 없음                                                                            |

> **참고:** 존재하지 않는 레코드를 조회하면 \`400 Bad Request\`와 \`…을 찾을 수 없습니다.\` 메시지를 반환합니다.

***

### 필드 · 파일 · 이메일 (Field / File / Email)

오브젝트의 데이터 필드(스키마) 정의를 조회·생성합니다. 레코드 값 입력이 아니라 필드 자체를 다룹니다.

#### GET /v2/field/{type} — 필드 정의 목록

오브젝트의 필드 정의(이름·타입·옵션)를 조회합니다. 필드 이름과 허용값을 확인할 수 있는 권위 있는 출처입니다.

**요청 파라미터**

| 이름     | 위치   | 타입     |  필수 | 설명                                                                                             |
| ------ | ---- | ------ | :-: | ---------------------------------------------------------------------------------------------- |
| \`type\` | path | string |  필수 | \`people\` \`organization\` \`deal\` \`lead\` \`product\` \`quote\` \`quote-product\` \`todo\` \`custom-object\` |

**응답** \`200 OK\`

\`\`\`json
{ "success": true, "data": { "fieldList": [ { "id": "...", "name": "...", "type": "singleSelect", "required": false, "optionList": [ { "id": "...", "value": "..." } ] } ] } }
\`\`\`

* \`optionList\`는 \`singleSelect\`/\`multiSelect\` 타입에만 존재하며, 각 항목은 \`{ id, value }\` 형식입니다.
* 조회 시 \`type\`은 30종까지 반환될 수 있습니다(읽기용). 생성 가능한 타입은 10종입니다(아래 참고).

**에러**

| 코드  | 조건         |
| --- | ---------- |
| 400 | 잘못된 \`type\` |
| 401 | 인증 실패      |

> **참고:** 잘못된 경로로 호출하면 JSON이 아니라 마케팅 HTML이 반환되므로 경로를 정확히 지정해야 합니다.

#### POST /v2/field/{type} — 필드 생성

오브젝트에 새 필드를 생성합니다.

**요청 파라미터** (body)

| 이름                                                                                           | 타입          |  필수 | 설명                                                                                                                                                |
| -------------------------------------------------------------------------------------------- | ----------- | :-: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| \`name\`                                                                                       | string      |  필수 | 필드 이름                                                                                                                                             |
| \`type\`                                                                                       | string      |  필수 | \`string\` \`number\` \`date\` \`dateTime\` \`boolean\` \`singleSelect\` \`multiSelect\` \`multiAttachment\` \`user\` \`multiUser\` (생성 가능 10종). \`formula\` 동봉 시 결과 타입 |
| \`options\`                                                                                    | \`[{value}]\` | 조건부 | singleSelect는 1개 이상, multiSelect는 2개 이상                                                                                                           |
| \`description\` \`categoryName\` \`showInCreateForm\` \`required\` \`isSensitive\` \`preventDuplicates\` |             |     | 선택. \`categoryName\`은 존재하는 카테고리여야 하며, 없으면 404를 반환합니다.                                                                                               |
| \`formula\`                                                                                    | string      |     | 계산 필드. \`{{대상명.필드명}}\` 형식으로 참조합니다.                                                                                                                  |
| \`customObjectDefinitionId\`/\`customObjectDefinitionName\`                                      | string      | 조건부 | \`type=custom-object\`일 때만 사용합니다.                                                                                                                   |

**제약** (위반 시 400, 괄호는 실제 \`reason\`)

* singleSelect는 \`options\` 1개 이상, multiSelect는 2개 이상이어야 하며, \`options[].value\`는 중복할 수 없습니다.
* \`required:true\`는 \`showInCreateForm:true\`를 함께 보내야 합니다.
* \`isSensitive\`와 \`preventDuplicates\`는 동시에 사용할 수 없습니다.
* \`preventDuplicates\`는 string·number 타입에만 적용됩니다.
* \`isSensitive\`는 string·number·date·dateTime·boolean·singleSelect·multiSelect 타입에만 적용됩니다.
* \`multiAttachment\`는 quote-product·todo 대상에 사용할 수 없습니다.
* \`customObjectDefinitionId\`는 custom-object 타입에만 사용합니다.
* 계산 필드(\`formula\`)의 타입은 string·number·date·dateTime·boolean만 가능하며, \`options\`·\`showInCreateForm\`·\`required\`·\`isSensitive\`·\`preventDuplicates\`와 동시에 사용할 수 없습니다.

**요청 예시**

\`\`\`json
{ "name": "관심도", "type": "singleSelect", "options": [{ "value": "높음" }, { "value": "낮음" }] }
\`\`\`

**응답** \`201 Created\`

\`\`\`json
{ "success": true, "data": { "field": { "id": "...", "name": "...", "type": "singleSelect", "formula": null, "description": "...", "showInCreateForm": true, "required": false, "isSensitive": false, "preventDuplicates": false, "options": [ { "id": "...", "value": "..." } ], "createdAt": "..." } } }
\`\`\`

> **참고:** 선택지 키 이름이 엔드포인트마다 다릅니다. 생성(POST) 응답은 \`options\`, 조회(GET) 응답은 \`optionList\`를 사용하며, 둘 다 \`[{id,value}]\` 형식입니다.

> **참고:** 필드 삭제 API는 없습니다. \`DELETE /v2/field/{id}\`는 405를 반환하며, 한 번 생성한 필드는 GUI에서만 삭제할 수 있습니다.

**에러**

| 코드  | 조건                                              |
| --- | ----------------------------------------------- |
| 400 | 제약 위반 / 필수값 누락 / 잘못된 \`type\`                     |
| 401 | 인증 실패                                           |
| 403 | 플랜·권한·필드 수 제한                                   |
| 404 | 잘못된 \`type\` / 존재하지 않는 \`categoryName\`·커스텀 오브젝트 정의 |
| 409 | 같은 이름의 필드가 이미 존재                                |
| 429 | 레이트리밋 초과                                        |

***

파일을 업로드합니다. \`objectType\`·\`objectId\`를 함께 보내면 해당 레코드의 첨부파일로 등록되고, 없이 보내면 파일만 업로드됩니다(반환된 \`id\`를 \`POST /v2/email\`의 \`attachmentIdList\`에 넣어 이메일 첨부로 사용). 업로드한 파일은 조회(\`GET /v2/file\`)·삭제(\`POST /v2/file/{fileId}/delete\`)할 수 있습니다.

#### POST /v2/file — 파일 업로드 · 레코드 첨부

**요청 파라미터** (\`multipart/form-data\`)

| 이름           | 타입     |  필수 | 설명                                                    |
| ------------ | ------ | :-: | ----------------------------------------------------- |
| \`file\`       | binary |  필수 | 업로드할 파일. 요청당 1개.                                      |
| \`objectType\` | string | 조건부 | 첨부 대상 종류(아래 허용값). \`objectId\`와 **반드시 함께** 보냅니다.        |
| \`objectId\`   | string | 조건부 | 첨부 대상 레코드의 ID(\`RecordId\`). \`objectType\`과 반드시 함께 보냅니다. |

* Content-Type은 \`multipart/form-data\`입니다. JSON 바디로 보내면 400 \`multipart 파싱 실패: Could not parse content as FormData.\`를 반환합니다.
* \`objectType\`·\`objectId\`는 **둘 다 보내거나 둘 다 생략**합니다. 한쪽만 보내면 400 \`objectType 과 objectId 는 함께 전달해야 합니다.\`를 반환합니다. 둘 다 생략하면 레코드에 붙지 않고 파일만 업로드됩니다.

**objectType 허용값**

| 첨부 대상    | \`objectType\` 값 |
| -------- | -------------- |
| 딜        | \`deal\`         |
| 리드       | \`lead\`         |
| 고객       | \`people\`       |
| 회사       | \`organization\` |
| 상품       | \`product\`      |
| 견적서      | \`quote\`        |
| 커스텀 오브젝트 | \`customObject\` |
| 노트       | \`memo\`         |

> **참고:** 커스텀 오브젝트 값은 다른 API 경로에서 쓰는 \`custom-object\`가 아니라 **\`customObject\`(camelCase)** 입니다. 허용 외 값은 400 \`허용되지 않는 objectType 입니다: <값>. 허용 목록: deal, lead, people, organization, product, quote, customObject, memo\`를 반환합니다. 커스텀 오브젝트의 \`objectId\`에는 정의(definition) ID가 아니라 **레코드**의 ID를 넣습니다.

**제약**

* 허용 MIME 타입: \`image/jpeg\` \`image/png\` \`image/gif\` \`image/webp\` \`application/pdf\` \`application/zip\` \`application/msword\`(doc) \`…wordprocessingml.document\`(docx) \`…spreadsheetml.sheet\`(xlsx) \`…presentationml.presentation\`(pptx) \`application/vnd.ms-excel\`(xls) \`application/vnd.ms-powerpoint\`(ppt) \`text/plain\` \`text/csv\`. 그 외는 400 \`허용되지 않는 MIME type 입니다: <type>. 허용 목록: …\`를 반환합니다. 확장자와 MIME 타입이 일치해야 합니다.
* 크기는 1개당 25MB 이하입니다. 빈 파일(0byte)은 400 \`빈 파일은 허용되지 않습니다.\`를 반환합니다.

**요청 예시**

\`\`\`bash
# 파일만 업로드 (이메일 첨부용)
curl -X POST -H "Authorization: Bearer <token>" -F "file=@/path/to/contract.pdf" "https://salesmap.kr/api/v2/file"

# 딜에 첨부
curl -X POST -H "Authorization: Bearer <token>" -F "file=@/path/to/contract.pdf" -F "objectType=deal" -F "objectId=<dealId>" "https://salesmap.kr/api/v2/file"
\`\`\`

**응답** \`201 Created\` (\`objectType\` 유무와 무관하게 동일)

\`\`\`json
{ "success": true, "data": { "id": "<fileId>", "name": "contract.pdf" } }
\`\`\`

* \`id\`는 파일 ID(이메일 첨부·파일 삭제에 사용), \`name\`은 원본 파일명입니다.

**에러**

| 코드  | 조건                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------- |
| 400 | \`file\` 누락 / JSON 바디 / 허용 외 MIME / 25MB 초과 / 빈 파일 / \`objectType\`·\`objectId\` 한쪽만 / 허용 외 \`objectType\` |
| 401 | 인증 실패                                                                                              |
| 404 | 첨부 대상 레코드 없음: \`첨부 대상 레코드를 찾을 수 없습니다. objectType: <t>, objectId: <id>\` (없거나 다른 워크스페이스)              |
| 429 | 레이트리밋 초과                                                                                           |

***

#### GET /v2/file — 레코드 첨부파일 조회

특정 레코드에 첨부된 파일 목록을 조회합니다. \`objectType\`·\`objectId\`가 **필수**이며, 생략하면 400 \`objectType 과 objectId 는 필수입니다.\`를 반환합니다.

**요청 파라미터**

| 이름           | 위치    | 타입     |  필수 | 설명                    |
| ------------ | ----- | ------ | :-: | --------------------- |
| \`objectType\` | query | string |  필수 | 위 objectType 허용값과 동일. |
| \`objectId\`   | query | string |  필수 | 대상 레코드 ID.            |

**응답** \`200 OK\`

\`\`\`json
{
  "success": true,
  "data": {
    "fileList": [
      { "id": "<fileId>", "name": "contract.pdf", "createdAt": "...", "owner": { "id": "...", "name": "..." } }
    ]
  }
}
\`\`\`

***

#### POST /v2/file/{fileId}/delete — 파일 삭제

업로드된 파일을 삭제합니다.

**요청 파라미터**

| 이름       | 위치   | 타입     |  필수 | 설명                                   |
| -------- | ---- | ------ | :-: | ------------------------------------ |
| \`fileId\` | path | string |  필수 | 삭제할 파일 ID(\`POST /v2/file\` 응답의 \`id\`). |

**응답** \`200 OK\`

\`\`\`json
{ "success": true }
\`\`\`

***

#### POST /v2/email — 이메일 발송

워크스페이스에 연결된 메일 계정으로 이메일을 발송합니다. 발신자(\`from\`)는 토큰 소유자의 연결 계정입니다.

**요청 파라미터** (body)

| 이름                               | 타입        |  필수 | 설명                                      |
| -------------------------------- | --------- | :-: | --------------------------------------- |
| \`emailProvider\`                  | string    |  필수 | \`gmail\` 또는 \`outlook\` (대소문자 구분)          |
| \`toAddressList\`                  | array     |  필수 | \`[{ email(필수), name? }]\` (문자열 배열이 아닙니다) |
| \`subject\`                        | string    |  필수 | 제목                                      |
| \`htmlBody\`                       | string    |  필수 | 본문(HTML)                                |
| \`ccAddressList\`/\`bccAddressList\` | array     |     | 참조/숨은참조 (동일 형식)                         |
| \`attachmentIdList\`               | string\\[] |     | 첨부 파일 ID (\`POST /v2/file\`의 \`id\`)        |

**헤더(선택)**

* \`Idempotency-Key: <키>\` — 같은 키로 재전송하면 중복 발송 없이 같은 \`id\`를 반환합니다(멱등성).

**첨부 용량**

* 파일 1개당 25MB(업로드 시)이며, \`attachmentIdList\`의 합계도 25MB를 넘을 수 없습니다(발송 시). 합계 초과 시 400 \`첨부 파일 합계가 25MB를 초과합니다 (N.NMB)\`를 반환합니다.
* 잘못된 file id는 400 \`등록되지 않거나 권한이 없는 attachment 입니다: <id>\`를 반환합니다.

**요청 예시**

\`\`\`json
{ "emailProvider": "gmail", "toAddressList": [{ "email": "hong@example.com", "name": "홍길동" }], "subject": "제안서 안내", "htmlBody": "<p>안녕하세요, 제안서를 보내드립니다.</p>", "attachmentIdList": ["file_abc123"] }
\`\`\`

**응답** \`201 Created\`

\`\`\`json
{ "success": true, "data": { "id": "...", "messageId": "..." } }
\`\`\`

* \`id\`는 발송 이메일 ID(\`GET /v2/email/{id}\`에 사용), \`messageId\`는 RFC822 Message-ID입니다.

> **참고:** 발송 API에는 답장(reply) 전용 파라미터가 없습니다.

**에러**

| 코드  | 조건                                                           |
| --- | ------------------------------------------------------------ |
| 400 | 필수값 누락 / \`emailProvider\` 불일치 / \`toAddressList\` 형식 오류 / 첨부 오류 |
| 401 | 인증 실패                                                        |
| 429 | 레이트리밋 초과                                                     |

#### GET /v2/email/{emailId} — 발송 이메일 단건 조회

발송한 이메일 1건의 상세 정보를 조회합니다.

> **참고:** 응답에는 이메일 **본문(\`body\`/\`htmlBody\`)이 포함되지 않습니다.** 메타데이터(제목·발신/수신·상태·날짜)만 조회됩니다.

**요청 파라미터**

| 이름        | 위치   | 타입           |  필수 | 설명                                     |
| --------- | ---- | ------------ | :-: | -------------------------------------- |
| \`emailId\` | path | string(uuid) |  필수 | 조회할 이메일 ID (\`POST /v2/email\` 응답의 \`id\`) |

**응답** \`200 OK\`

\`\`\`json
{ "success": true, "data": { "email": { "id": "...", "subject": "...", "from": "...", "to": "...", "cc": "...", "bcc": "...", "status": "...", "messageId": "...", "date": "..." } } }
\`\`\`

* 응답 키는 \`id\`입니다.

**에러**

| 코드  | 조건                             |
| --- | ------------------------------ |
| 400 | 존재하지 않는 id — \`이메일을 찾을 수 없습니다.\` |
| 401 | 인증 실패                          |

***

### 시퀀스 · 웹폼 · TODO · 메모 (Sequence / WebForm / Todo / Memo)

> 그룹: \`sequence\` + \`webForm\` + \`todo\` + \`memo\`. 모든 경로 \`/v2/...\`, 인증 \`Authorization: Bearer <token>\` 필수.

> **참고:** 이 그룹의 목록 엔드포인트는 커서 기반 페이지네이션을 사용합니다. 응답의 \`data.nextCursor\` 값을 다음 요청에 \`?cursor=<값>\`으로 전달하며, \`cursor\`는 exclusive(해당 id 다음 레코드부터)입니다. 파라미터명은 \`cursor\`이며 \`nextCursor\`는 사용하지 않습니다. 끝에 도달하면 해당 목록 키는 빈 배열 \`[]\`을 반환합니다.

> **참고:** 존재하지 않는 리소스 조회 시 응답이 엔드포인트에 따라 다릅니다. \`GET /v2/sequence/{id}\`는 \`200 OK\`와 \`data.sequence: null\`을, \`…/step\`·\`…/enrollment\`는 \`200 OK\`와 빈 배열을 반환합니다. \`GET /v2/memo/{id}\`, \`GET /v2/webForm/{id}/submit\`, \`GET /v2/sequence/enrollment/{id}/timeline\`은 \`400 Bad Request\`와 \`…을 찾을 수 없습니다.\` 메시지를 반환합니다.

***

#### 시퀀스 (sequence)

**GET /v2/sequence — 시퀀스 목록 조회**

시퀀스 목록을 조회합니다.

**요청 파라미터**

| 이름       | 위치    | 타입     |  필수 | 설명                                                                 |
| -------- | ----- | ------ | :-: | ------------------------------------------------------------------ |
| \`cursor\` | query | string |     | 페이지네이션. 직전 응답 \`data.nextCursor\` 값을 넣으면 그 id 다음부터 반환합니다. exclusive. |

**응답** \`200 OK\`

\`data.sequenceList\`는 시퀀스 레코드 배열입니다. 시퀀스가 없으면 빈 배열을 반환하며, 이때 \`data.nextCursor\` 키는 응답에 포함되지 않습니다.

\`\`\`json
{ "success": true, "data": { "sequenceList": [
  { "_id": "...", "name": "직접 만들기", "description": "...", "createdAt": "..." }
] } }
\`\`\`

레코드 스키마: \`{ _id, name, description, createdAt }\`.

> **참고:** 시퀀스 ID 키는 \`id\`가 아니라 \\*\\*\`_id\`\\*\\*입니다(다른 오브젝트의 \`id\`/\`RecordId\`와 다름, OpenAPI 스펙과도 다름). 하위 경로의 \`{sequenceId}\`에는 이 \`_id\` 값을 넣습니다.

**에러**

| 코드  | message               | reason / 조건                                                       |
| --- | --------------------- | ----------------------------------------------------------------- |
| 401 | Unauthorized          | 헤더 없음: \`헤더에서 Authorization을 찾을 수 없습니다.\` / 무효 토큰: \`유효하지 않은 토큰입니다.\` |
| 429 | Too Many Requests     | 100req/10초 초과                                                     |
| 500 | Internal Server Error | 서버 오류                                                             |

***

**GET /v2/sequence/{sequenceId} — 시퀀스 상세 조회**

시퀀스 하나의 상세 정보를 조회합니다.

**요청 파라미터**

| 이름           | 위치   | 타입     |  필수 | 설명     |
| ------------ | ---- | ------ | :-: | ------ |
| \`sequenceId\` | path | string |  필수 | 시퀀스 id |

**응답** \`200 OK\`

\`data.sequence\`는 시퀀스 레코드 객체입니다. 존재하지 않는 id를 조회하면 \`200 OK\`와 함께 \`data.sequence\`가 \`null\`로 반환되므로, 호출 측에서 null 여부를 확인해야 합니다.

\`\`\`json
{ "success": true, "data": { "sequence": { "_id": "...", "name": "...", "description": "...", "createdAt": "..." } } }
\`\`\`

레코드 스키마(객체): \`{ _id, name, description, createdAt }\`. 존재하지 않는 id는 \`data.sequence: null\`.

**에러**

| 코드  | message               | reason / 조건 |
| --- | --------------------- | ----------- |
| 401 | Unauthorized          | 인증 실패       |
| 404 | Not Found             | 잘못된 경로 형식   |
| 429 | Too Many Requests     | 레이트리밋 초과    |
| 500 | Internal Server Error | 서버 오류       |

***

**GET /v2/sequence/{sequenceId}/step — 스텝 목록 조회**

시퀀스의 스텝 목록을 조회합니다. 스텝은 이메일·SMS·알림톡 발송 또는 TODO 생성 단위입니다.

**요청 파라미터**

| 이름           | 위치    | 타입     |  필수 | 설명                 |
| ------------ | ----- | ------ | :-: | ------------------ |
| \`sequenceId\` | path  | string |  필수 | 시퀀스 id             |
| \`cursor\`     | query | string |     | 페이지네이션 (exclusive) |

**응답** \`200 OK\`

\`data.stepList\`는 스텝 레코드 배열입니다. 존재하지 않는 \`sequenceId\`를 조회하면 \`200 OK\`와 빈 배열을 반환합니다.

\`\`\`json
{ "success": true, "data": { "stepList": [
  { "id": "...", "type": "createTodo", "index": 0, "executeImmediately": true, "businessDay": 0, "executionTime": "0900" }
] } }
\`\`\`

스텝 스키마: \`{ id, type, index, executeImmediately, businessDay, executionTime }\`. **스텝은 \`_id\`가 아니라 \`id\`를 사용합니다.** \`type\`은 스텝 종류(예: \`createTodo\`, \`sendEmail\`), \`index\`는 0부터의 실행 순서, \`executionTime\`은 \`"HHMM"\`(예: \`0900\`).

**에러**

| 코드  | message               | reason / 조건 |
| --- | --------------------- | ----------- |
| 401 | Unauthorized          | 인증 실패       |
| 404 | Not Found             | 잘못된 경로 형식   |
| 429 | Too Many Requests     | 레이트리밋 초과    |
| 500 | Internal Server Error | 서버 오류       |

***

**GET /v2/sequence/{sequenceId}/enrollment — 등록 목록 조회**

시퀀스의 등록(enrollment) 목록을 조회합니다.

**요청 파라미터**

| 이름           | 위치    | 타입     |  필수 | 설명                 |
| ------------ | ----- | ------ | :-: | ------------------ |
| \`sequenceId\` | path  | string |  필수 | 시퀀스 id             |
| \`cursor\`     | query | string |     | 페이지네이션 (exclusive) |

**응답** \`200 OK\`

목록 키 이름은 \`sequenceEnrollmentList\`입니다. 존재하지 않는 \`sequenceId\`를 조회하면 \`200 OK\`와 빈 배열을 반환합니다. 각 등록 레코드는 **\`_id\`(enrollId)**, \`peopleId\`, \`createdAt\`을 포함하며, \`_id\` 값을 타임라인 조회에 사용합니다.

\`\`\`json
{ "success": true, "data": { "sequenceEnrollmentList": [ { "_id": "...", "peopleId": "...", "createdAt": "..." } ] } }
\`\`\`

**에러**

| 코드  | message               | reason / 조건 |
| --- | --------------------- | ----------- |
| 401 | Unauthorized          | 인증 실패       |
| 404 | Not Found             | 잘못된 경로 형식   |
| 429 | Too Many Requests     | 레이트리밋 초과    |
| 500 | Internal Server Error | 서버 오류       |

***

**GET /v2/sequence/enrollment/{enrollId}/timeline — 등록 타임라인 조회**

등록(enrollment)의 진행 타임라인을 조회합니다.

**요청 파라미터**

| 이름         | 위치    | 타입     |  필수 | 설명                                       |
| ---------- | ----- | ------ | :-: | ---------------------------------------- |
| \`enrollId\` | path  | string |  필수 | 등록 id. \`…/enrollment\` 목록 레코드의 **\`_id\`**. |
| \`cursor\`   | query | string |     | 페이지네이션 (exclusive)                       |

**응답** \`200 OK\`

\`data.timelineList\`는 타임라인 항목 배열이며, \`data.nextCursor\`로 다음 페이지를 조회합니다.

\`\`\`json
{ "success": true, "data": { "timelineList": [], "nextCursor": "..." } }
\`\`\`

> **참고:** 존재하지 않는 \`enrollId\`는 \`400 Bad Request\` \`sequenceEnroll이 존재하지 않습니다.\`를 반환합니다. 아직 실행된 스텝이 없는 등록은 \`400 Bad Request\` \`sequenceEnrollStep이 존재하지 않습니다.\`를 반환할 수 있습니다(타임라인 항목은 스텝이 실행된 뒤 채워짐).

**에러**

| 코드  | message               | reason / 조건                               |
| --- | --------------------- | ----------------------------------------- |
| 400 | Bad Request           | 없는 enrollId: \`sequenceEnroll이 존재하지 않습니다.\` |
| 401 | Unauthorized          | 인증 실패                                     |
| 429 | Too Many Requests     | 레이트리밋 초과                                  |
| 500 | Internal Server Error | 서버 오류                                     |

***

#### 웹폼 (webForm)

**GET /v2/webForm — 웹폼 목록 조회**

웹폼 목록을 조회합니다.

**요청 파라미터**

| 이름       | 위치    | 타입     |  필수 | 설명                 |
| -------- | ----- | ------ | :-: | ------------------ |
| \`cursor\` | query | string |     | 페이지네이션 (exclusive) |

**응답** \`200 OK\`

\`data.webFormList\`는 웹폼 레코드 배열입니다.

\`\`\`json
{
  "success": true,
  "data": {
    "webFormList": [
      {
        "id": "...",
        "name": "도입 문의 웹 폼",
        "description": null,
        "status": "active",
        "folderName": null,
        "viewCount": 8,
        "submitCount": 0,
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
}
\`\`\`

레코드 스키마 \`data.webFormList[]\`:

| 키             | 타입           | 설명               |
| ------------- | ------------ | ---------------- |
| \`id\`          | string(uuid) | 웹폼 id            |
| \`name\`        | string       | 웹폼 이름            |
| \`description\` | string\\|null | 설명               |
| \`status\`      | string       | 상태 (예: \`active\`) |
| \`folderName\`  | string\\|null | 폴더명              |
| \`viewCount\`   | number       | 조회수              |
| \`submitCount\` | number       | 제출수              |
| \`createdAt\`   | string(ISO)  | 생성 시각            |
| \`updatedAt\`   | string(ISO)  | 수정 시각            |

**에러**

| 코드  | message               | reason / 조건 |
| --- | --------------------- | ----------- |
| 401 | Unauthorized          | 인증 실패       |
| 429 | Too Many Requests     | 레이트리밋 초과    |
| 500 | Internal Server Error | 서버 오류       |

***

**GET /v2/webForm/{webFormId}/submit — 웹폼 제출 목록 조회**

웹폼의 제출 목록을 조회합니다.

**요청 파라미터**

| 이름          | 위치    | 타입     |  필수 | 설명                           |
| ----------- | ----- | ------ | :-: | ---------------------------- |
| \`webFormId\` | path  | string |  필수 | 웹폼 id (\`…/webForm\` 목록의 \`id\`) |
| \`cursor\`    | query | string |     | 페이지네이션 (exclusive)           |

**응답** \`200 OK\`

목록 키 이름은 \`webFormSubmitList\`입니다. 제출이 없는 폼은 빈 배열을 반환합니다.

\`\`\`json
{ "success": true, "data": { "webFormSubmitList": [] } }
\`\`\`

> **참고:** 존재하지 않는 \`webFormId\`를 조회하면 \`400 Bad Request\`와 \`웹 폼을 찾을 수 없습니다.\` 메시지를 반환합니다.

**에러**

| 코드  | message               | reason / 조건                     |
| --- | --------------------- | ------------------------------- |
| 400 | Bad Request           | 없는 webFormId: \`웹 폼을 찾을 수 없습니다.\` |
| 401 | Unauthorized          | 인증 실패                           |
| 429 | Too Many Requests     | 레이트리밋 초과                        |
| 500 | Internal Server Error | 서버 오류                           |

***

#### TODO (todo)

**GET /v2/todo — TODO 목록 조회**

TODO 목록을 조회합니다.

> **참고:** TODO **생성 API는 없습니다.** \`POST /v2/todo\`는 \`405\`를 반환합니다. TODO는 세일즈맵 UI 또는 시퀀스의 \`createTodo\` 스텝으로만 생성됩니다.

**요청 파라미터**

| 이름       | 위치    | 타입     |  필수 | 설명                                                           |
| -------- | ----- | ------ | :-: | ------------------------------------------------------------ |
| \`cursor\` | query | string |     | 페이지네이션. 응답 \`data.nextCursor\`를 \`?cursor=\`로 전달합니다 (exclusive). |

**응답** \`200 OK\`

\`data.todoList\`는 TODO 레코드 배열이며, 레코드 필드는 한글 키로 평탄하게 제공됩니다. \`data.nextCursor\`로 다음 페이지를 조회합니다.

\`\`\`json
{
  "success": true,
  "data": {
    "todoList": [
      {
        "id": "...",
        "RecordId": "...",
        "peopleId": null,
        "dealId": null,
        "제목": "방송 실행",
        "유형": "업무",
        "완료": false,
        "담당자": { "id": "...", "name": "..." },
        "팀": [ { "id": "...", "name": "..." } ]
      }
    ],
    "nextCursor": "..."
  }
}
\`\`\`

레코드 스키마 \`data.todoList[]\`:

| 키                | 타입                | 설명                   |
| ---------------- | ----------------- | -------------------- |
| \`id\`             | string(uuid)      | TODO id              |
| \`RecordId\`       | string(uuid)      | \`id\`와 동일값            |
| \`peopleId\`       | string\\|null      | 연결된 고객               |
| \`dealId\`         | string\\|null      | 연결된 딜                |
| \`dealLeadId\`     | string\\|null      | 딜/리드 id (dealId와 동일) |
| \`leadId\`         | string\\|null      | 연결된 리드               |
| \`organizationId\` | string\\|null      | 연결된 회사               |
| \`제목\`             | string            | TODO 제목 (예: \`방송 실행\`) |
| \`내용\`             | string\\|null      | 상세 내용                |
| \`유형\`             | string            | \`업무\` / \`전화\` / \`미팅\`   |
| \`완료\`             | boolean           | 완료 여부                |
| \`완료일\`            | string(ISO)\\|null | 완료 시각                |
| \`시작일\`            | string(ISO)       | 시작 시각                |
| \`종료일\`            | string(ISO)       | 종료 시각                |
| \`생성 날짜\`          | string(ISO)       | 생성 시각                |
| \`수정 날짜\`          | string(ISO)       | 수정 시각                |
| \`담당자\`            | object\\|null      | \`{id, name}\`         |
| \`참석자\`            | null              | 참석자                  |
| \`팀\`              | array             | \`[{id, name}]\`       |

> **참고:** todo 그룹에는 단건 조회·생성·수정 v2 GET 엔드포인트가 없으며 목록 조회만 제공합니다. 단건이 필요하면 목록에서 필터링하거나 연결된 레코드(people/deal)에서 접근합니다.

**에러**

| 코드  | message               | reason / 조건 |
| --- | --------------------- | ----------- |
| 401 | Unauthorized          | 인증 실패       |
| 429 | Too Many Requests     | 레이트리밋 초과    |
| 500 | Internal Server Error | 서버 오류       |

***

#### 노트 / 메모 (memo)

> **노트 생성 방법:** 노트 전용 생성 엔드포인트는 없습니다(\`POST /v2/memo\`는 \`405\`). 노트는 **레코드(고객·회사·딜·리드·커스텀오브젝트) 생성/수정 요청의 body \`memo\` 파라미터**로 만듭니다. \`memo\`에 텍스트를 넣으면 해당 레코드에 노트가 생성되며, 곧바로 \`GET /v2/memo?{dealId|leadId|peopleId|organizationId}=...\`로 조회됩니다.
>
> * 적용 엔드포인트: \`POST /v2/people\`·\`/v2/people/{id}\`, \`/v2/organization\`·\`/v2/organization/{id}\`, \`/v2/deal\`·\`/v2/deal/{id}\`, \`/v2/lead\`·\`/v2/lead/{id}\`, \`/v2/custom-object\`·\`/v2/custom-object/{id}\` (생성·수정 모두).
> * 본문은 **HTML/CSS가 그대로 보존**됩니다. 태그(\`<b>\`·\`<i>\`·\`<ul><li>\`·\`<a>\`), 인라인 \`style="..."\`, \`<style>\` 블록, \`class\`가 모두 \`htmlBody\`에 유지되어 스타일·목록·링크를 줄 수 있습니다. API는 전체를 \`<div>\`로 감싸고 줄바꿈(\`\\n\`)은 별도 \`<div>\`로 나눕니다. \`text\` 필드에는 보낸 문자열이 **태그째 그대로** 저장되므로, 순수 텍스트가 필요하면 태그를 빼고 보냅니다.
> * 한 번 호출에 **노트 1건** 생성. 유형(\`typeId\`) 지정·스레드(\`parentId\`)·노트 수정/삭제는 불가(→ \`typeList\`는 \`[]\`).
> * ⚠️ API는 입력을 **sanitize하지 않습니다**(\`<script>\`·\`<style>\`도 그대로 저장). 신뢰할 수 없는 HTML은 넣지 마세요. 실제 렌더링·스타일 적용 여부는 화면(GUI) 렌더러에 따라 달라질 수 있습니다.

> **노트 개행·빈 줄 넣기:** 두 방식 모두 가능합니다.
>
> * **줄바꿈**: (a) 순수 텍스트 개행 문자 \`\\n\` — API가 각 줄을 \`<div>\`로 감싸 줄바꿈이 됩니다. (b) HTML \`<br>\`.
> * **빈 줄**: 빈 줄에는 **보이는 문자**가 있어야 화면에 표시됩니다. 그 자리에 **non-breaking space(\`U+00A0\`, nbsp)** 한 칸을 넣으세요.
>   * 순수 텍스트: \`"윗줄\\n \\n아랫줄"\`
>   * HTML: \`"윗줄<div>&nbsp;</div>아랫줄"\` — 두 방식 모두 저장 형태가 \`<div>\` 안에 \`U+00A0\`(nbsp) 하나인 형태로 동일합니다.
> * ⚠️ **빈 \`\\n\\n\`(→ 빈 \`<div></div>\`)이나 일반 스페이스(\`U+0020\`) 줄은 GUI 렌더 시 접혀 빈 줄로 보이지 않습니다.** 빈 줄은 반드시 non-breaking space(\`U+00A0\`, HTML \`&nbsp;\`)로 만드세요.

**GET /v2/memo — 노트 목록 조회**

노트(메모) 목록을 조회합니다.

**요청 파라미터**

| 이름                                                  | 위치    | 타입           |  필수 | 설명                                                                                                 |
| --------------------------------------------------- | ----- | ------------ | :-: | -------------------------------------------------------------------------------------------------- |
| \`cursor\`                                            | query | string       |     | 페이지네이션. 응답 \`data.nextCursor\`를 \`?cursor=\`로 전달합니다. exclusive(해당 id 다음부터).                            |
| \`startDate\` / \`endDate\`                             | query | string(date) |     | 작성일 범위로 필터합니다(예: \`2026-06-01\`).                                                                    |
| \`ownerId\`                                           | query | string(uuid) |     | 작성자(유저)로 필터합니다.                                                                                    |
| \`typeId\`                                            | query | string(uuid) |     | 노트 유형 id로 필터합니다(\`GET /v2/memo/type-list\`의 \`_id\`). UUID 형식이 아니거나 잘못된 값은 \`500\`을 반환하므로 유효한 id만 전달합니다. |
| \`dealId\` / \`leadId\` / \`peopleId\` / \`organizationId\` | query | string(uuid) |     | 연결된 딜/리드/고객/회사로 필터합니다.                                                                             |

> **참고(연결 전파 · 필터 혼입):** 딜·리드에 남긴 노트에는 그 딜·리드가 **연결된 고객·회사 id까지 함께** 기록됩니다. 딜 노트 = \`dealId\` + (연결 시) \`peopleId\` + \`organizationId\`, 리드 노트 = \`leadId\` + (연결 시) \`peopleId\` + \`organizationId\`.
>
> * 따라서 \`peopleId\`(또는 \`organizationId\`)로 필터하면 그 고객·회사에 **직접** 남긴 노트뿐 아니라, 그 고객·회사가 연결된 **상위 딜·리드의 노트까지 함께** 반환됩니다.
> * 특정 고객·회사에 **직접 남긴 노트만** 뽑으려면, 결과에서 상위 id가 채워진 항목을 걸러냅니다. 예: \`peopleId\`로 조회한 뒤 \`dealId\`와 \`leadId\`가 모두 \`null\`인 노트만 취합니다.

**응답** \`200 OK\`

\`data.memoList\`는 노트 레코드 배열이며, \`data.nextCursor\`로 다음 페이지를 조회합니다. 마지막 페이지에서는 \`memoList\`가 빈 배열을 반환합니다.

> **정렬 순서:** \`data.memoList\`는 \`createdAt\` **오름차순(오래된 것부터)** 으로 반환됩니다. 즉 **첫 페이지가 가장 오래된 노트**이고 **최신 노트는 마지막 페이지**에 있습니다. 최신 노트가 필요하면 \`nextCursor\`가 없어질 때까지 끝 페이지까지 넘기세요(정렬 방향을 바꾸는 파라미터는 없습니다).

\`\`\`json
{
  "success": true,
  "data": {
    "memoList": [
      {
        "id": "...",
        "cursorId": "...",
        "htmlBody": "...",
        "text": "...",
        "typeList": [ { "_id": "...", "value": "회의록", "color": "blue" } ],
        "ownerId": "...",
        "parentId": null,
        "todoId": null,
        "organizationId": "...",
        "createdAt": "...",
        "updatedAt": "..."
      }
    ],
    "nextCursor": "..."
  }
}
\`\`\`

레코드 스키마 \`data.memoList[]\`:

| 키                                                                             | 타입                            | 설명                                                                                                                                            |
| ----------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| \`id\`                                                                          | string(uuid)                  | 노트 id                                                                                                                                         |
| \`cursorId\`                                                                    | string(uuid)                  | 페이지네이션 커서값 (=id). 단건 응답에는 없습니다.                                                                                                               |
| \`htmlBody\`                                                                    | string                        | 노트 본문(HTML)                                                                                                                                   |
| \`text\`                                                                        | string                        | 노트 본문(plain text)                                                                                                                             |
| \`typeList\`                                                                    | array \`[{_id, value, color}]\` | 노트 유형 객체 배열. \`_id\`=유형 id, \`value\`=유형명, \`color\`=색 이름(예: \`blue\`,\`orange\`,\`lime\`,\`pink\`). 유형 미지정 시 \`[]\`. 값은 \`GET /v2/memo/type-list\`의 항목과 동일합니다. |
| \`ownerId\`                                                                     | string(uuid)                  | 작성자                                                                                                                                           |
| \`parentId\`                                                                    | string\\|null                  | 부모 노트(스레드)                                                                                                                                    |
| \`todoId\`                                                                      | string\\|null                  | 연결된 TODO                                                                                                                                      |
| \`dealId\` / \`leadId\` / \`peopleId\` / \`organizationId\` / \`productId\` / \`quoteId\` | string\\|null                  | 연결 대상                                                                                                                                         |
| \`createdAt\` / \`updatedAt\`                                                     | string(ISO)                   | 생성 / 수정 시각                                                                                                                                    |

**에러**

| 코드  | message               | reason / 조건 |
| --- | --------------------- | ----------- |
| 401 | Unauthorized          | 인증 실패       |
| 429 | Too Many Requests     | 레이트리밋 초과    |
| 500 | Internal Server Error | 서버 오류       |

***

**GET /v2/memo/{memoId} — 노트 상세 조회**

노트 하나의 상세 정보를 조회합니다.

**요청 파라미터**

| 이름       | 위치   | 타입     |  필수 | 설명    |
| -------- | ---- | ------ | :-: | ----- |
| \`memoId\` | path | string |  필수 | 노트 id |

**응답** \`200 OK\`

\`data.memo\`는 노트 레코드 객체입니다. 단건 응답의 필드는 목록 레코드에서 \`cursorId\`만 제외한 \`{ id, htmlBody, text, typeList, dealId, leadId, peopleId, organizationId, productId, quoteId, todoId, parentId, ownerId, updatedAt, createdAt }\`입니다(\`typeList\`는 단건에도 포함). 본문은 \`htmlBody\`·\`text\`로, 작성자는 \`ownerId\`로 제공됩니다.

\`\`\`json
{
  "success": true,
  "data": {
    "memo": {
      "id": "...",
      "htmlBody": "...",
      "text": "...",
      "typeList": [ { "_id": "...", "value": "회의록", "color": "blue" } ],
      "dealId": null,
      "leadId": null,
      "peopleId": null,
      "organizationId": "...",
      "productId": null,
      "quoteId": null,
      "todoId": null,
      "parentId": null,
      "ownerId": "...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
}
\`\`\`

> **참고:** 존재하지 않는 id 또는 비-UUID 형식의 id를 조회하면 \`400 Bad Request\`와 \`노트를 찾을 수 없습니다.\` 메시지를 반환합니다.

**에러**

| 코드  | message               | reason / 조건                      |
| --- | --------------------- | -------------------------------- |
| 400 | Bad Request           | 없는 id / 잘못된 형식: \`노트를 찾을 수 없습니다.\` |
| 401 | Unauthorized          | 인증 실패                            |
| 429 | Too Many Requests     | 레이트리밋 초과                         |
| 500 | Internal Server Error | 서버 오류                            |

***

**GET /v2/memo/type-list — 노트 유형 목록 조회**

워크스페이스에 설정된 노트 유형 전체를 조회합니다. 노트 작성 UI의 유형 드롭다운을 채우거나, \`GET /v2/memo\`의 \`typeId\` 필터에 쓸 id를 얻을 때 사용합니다.

**요청 파라미터**

없음.

**응답** \`200 OK\`

\`data.typeList\`는 노트 유형 객체 배열입니다.

\`\`\`json
{
  "success": true,
  "data": {
    "typeList": [
      { "_id": "...", "value": "회의록", "color": "blue" },
      { "_id": "...", "value": "고객 미팅", "color": "orange" }
    ]
  }
}
\`\`\`

| 키       | 타입           | 설명                                                                |
| ------- | ------------ | ----------------------------------------------------------------- |
| \`_id\`   | string(uuid) | 유형 id. \`GET /v2/memo?typeId=\` 필터, 노트 레코드 \`typeList[]._id\`와 동일한 값. |
| \`value\` | string       | 유형명                                                               |
| \`color\` | string       | 색 이름(예: \`blue\`, \`orange\`, \`lime\`, \`pink\`). hex 코드가 아닙니다.          |

**에러**

| 코드  | message               | reason / 조건 |
| --- | --------------------- | ----------- |
| 401 | Unauthorized          | 인증 실패       |
| 429 | Too Many Requests     | 레이트리밋 초과    |
| 500 | Internal Server Error | 서버 오류       |

***

**부록: 공통 인증 에러**

| 코드  | message      | reason                                  |
| --- | ------------ | --------------------------------------- |
| 401 | Unauthorized | 헤더 없음: \`헤더에서 Authorization을 찾을 수 없습니다.\` |
| 401 | Unauthorized | 무효 토큰: \`유효하지 않은 토큰입니다.\`                 |

**부록: 페이지네이션 규칙 (그룹 공통)**

1. 목록 응답에 \`data.nextCursor\`가 있으면 다음 페이지가 존재할 수 있습니다.
2. 다음 페이지는 \`GET …?cursor=<nextCursor>\`로 조회합니다. 파라미터명은 \`cursor\`이며 \`nextCursor\`는 사용하지 않습니다.
3. \`cursor\`는 exclusive이며, 해당 id 다음 레코드부터 반환합니다.
4. 끝에 도달하면 해당 목록 키는 빈 배열 \`[]\`을 반환합니다.
5. 레코드 수가 적은 목록에서는 \`nextCursor\` 키가 응답에 포함되지 않습니다.

***

### 사용자 · 팀 (User / Team)

공통 envelope: 성공 \`{ "success": true, "data": {...} }\`, 에러 \`{ "success": false, "message": "<HTTP reason>", "reason": <string|string[]> }\`.

***

#### 사용자 (User)

CRM 사용자(영업 담당자)입니다. 고객·딜의 "담당자"로 할당되는 주체입니다.

**GET /v2/user — 사용자 목록 조회**

사용자 전체 목록을 조회합니다.

**요청 파라미터**

| 이름            | 위치     | 타입     |  필수 | 설명                                        |
| ------------- | ------ | ------ | :-: | ----------------------------------------- |
| Authorization | header | string |  필수 | \`Bearer <token>\`                          |
| cursor        | query  | string |     | 페이지네이션 커서. 인식하지 못하는 값을 전달하면 첫 페이지를 반환합니다. |

**응답** \`200 OK\`

\`data.userList\`는 사용자 객체 배열입니다. \`data\` 키는 \`userList\` 하나입니다.

\`\`\`json
{"success":true,"data":{"userList":[
  {"id":"...","name":"홍길동","status":"active","email":"user@example.com","role":"어드민","createdAt":"...","updatedAt":"..."}
]}}
\`\`\`

| 필드                          | 타입              | 설명                  |
| --------------------------- | --------------- | ------------------- |
| \`data.userList[].id\`        | string(uuid)    | 사용자 ID              |
| \`data.userList[].name\`      | string          | 이름                  |
| \`data.userList[].status\`    | string          | 상태. 값 예: \`"active"\` |
| \`data.userList[].email\`     | string          | 이메일                 |
| \`data.userList[].role\`      | string          | 역할. 값 예: \`"어드민"\`    |
| \`data.userList[].createdAt\` | string(ISO8601) | 생성 시각               |
| \`data.userList[].updatedAt\` | string(ISO8601) | 수정 시각               |

**에러**

| HTTP | message               | reason                           | 발생 조건               |
| ---- | --------------------- | -------------------------------- | ------------------- |
| 401  | Unauthorized          | \`헤더에서 Authorization을 찾을 수 없습니다.\` | Authorization 헤더 누락 |
| 401  | Unauthorized          | \`유효하지 않은 토큰입니다.\`                 | 토큰 무효               |
| 429  | —                     | 레이트리밋                            | 100req/10s 초과       |
| 500  | Internal Server Error | —                                | 서버 오류               |

***

**GET /v2/user/me — 현재 사용자 조회**

요청 토큰에 해당하는 현재 사용자 정보를 조회합니다.

**요청 파라미터**

| 이름            | 위치     | 타입     |  필수 | 설명               |
| ------------- | ------ | ------ | :-: | ---------------- |
| Authorization | header | string |  필수 | \`Bearer <token>\` |

**응답** \`200 OK\`

\`data.user\`는 사용자 객체 1건입니다(배열이 아님).

\`\`\`json
{"success":true,"data":{"user":{"id": "...","name":"홍길동","status":"활성","updatedAt":"...","createdAt":"...","room":{"id": "...","name":"홍길동 연습"}}}}
\`\`\`

| 필드                    | 타입              | 설명                     |
| --------------------- | --------------- | ---------------------- |
| \`data.user.id\`        | string(uuid)    | 사용자 ID                 |
| \`data.user.name\`      | string          | 이름                     |
| \`data.user.status\`    | string          | 상태. 값 예: \`"활성"\`        |
| \`data.user.createdAt\` | string(ISO8601) | 생성 시각                  |
| \`data.user.updatedAt\` | string(ISO8601) | 수정 시각                  |
| \`data.user.room\`      | object          | 소속 워크스페이스 \`{id, name}\` |

> **참고:** \`/v2/user/me\`와 \`/v2/user\` 목록의 스키마가 다릅니다. \`/me\`는 \`email\`·\`role\`이 없고 \`room{id,name}\`을 포함하며 \`status\`가 한글(\`활성\`)입니다. 목록(\`/v2/user\`)은 \`email\`·\`role\`(한글)을 포함하고 \`room\`이 없으며 \`status\`가 영문(\`active\`)입니다. 두 엔드포인트의 상태 값을 비교할 때는 언어 차이를 정규화하세요.

**에러** — \`/v2/user\`와 동일(401/429/500).

***

#### 팀 (Team)

영업팀 그룹입니다. 고객·딜의 "팀" 필드로 할당하며, 팀별 성과 분석에 활용합니다.

**GET /v2/team — 팀 목록 조회**

팀 전체 목록을 조회합니다.

**요청 파라미터**

| 이름            | 위치     | 타입     |  필수 | 설명               |
| ------------- | ------ | ------ | :-: | ---------------- |
| Authorization | header | string |  필수 | \`Bearer <token>\` |
| cursor        | query  | string |     | 페이지네이션 커서        |

**응답** \`200 OK\`

\`data.teamList\`는 팀 객체 배열입니다. \`data\` 키는 \`teamList\` 하나입니다.

\`\`\`json
{"success":true,"data":{"teamList":[
  {"id": "...","name":"영업 팀","description":null,"teammateList":[{"id": "...","name":"홍길동"}]},
  {"id": "...","name":"마케팅 팀","description":null,"teammateList":[]}
]}}
\`\`\`

| 필드                             | 타입             | 설명                                       |
| ------------------------------ | -------------- | ---------------------------------------- |
| \`data.teamList[].id\`           | string(uuid)   | 팀 ID                                     |
| \`data.teamList[].name\`         | string         | 팀 이름                                     |
| \`data.teamList[].description\`  | string \\| null | 설명. \`null\`일 수 있습니다.                      |
| \`data.teamList[].teammateList\` | array          | 팀원 \`[{id, name}]\`. 팀원이 없으면 빈 배열 \`[]\`입니다. |

**에러** — \`/v2/user\`와 동일(401/429/500). 401 reason은 \`헤더에서 Authorization을 찾을 수 없습니다.\` / \`유효하지 않은 토큰입니다.\`입니다.

***

***

## 웹훅 (Webhook)

세일즈맵에서 레코드 이벤트(생성·수정·삭제·병합)가 발생하면 등록된 URL로 실시간 알림을 전송합니다. 자동화 파이프라인의 트리거로 사용합니다.

### 설정 (GUI에서 등록)

웹훅은 API가 아니라 세일즈맵 웹 GUI에서 등록합니다. 경로: **설정 > 회사 설정 > 외부 서비스 연동 > 웹훅**.

1. **오브젝트 탭 선택** — 고객 · 딜 · 리드 · 회사 · 커스텀 오브젝트(예: 세금계산서). **오브젝트마다 따로** 설정합니다.
2. **웹훅 URL 등록** — 알림을 받을 수신 URL을 입력합니다.
3. **이벤트 토글 선택**:
   * **생성** — 레코드 생성 시
   * **삭제** — 레코드 삭제 시
   * **병합** — 레코드 병합 시 (병합 과정에서 삭제된 레코드는 \`삭제\` 알림도 별도로 발생)
   * **수정** — 필드 값 변경 시. **모든 필드 수정** 또는 **특정 필드 수정** 중 선택. (레코드 연결(association) 변경은 수정 알림에 포함되지 않습니다.)
4. **저장** 버튼 클릭 — 저장을 눌러야 적용됩니다.

> **참고:** 등록할 때 세일즈맵이 그 URL로 검증 요청을 보내 **\`200\` 성공 응답**을 받아야 등록됩니다. 응답이 없거나 200이 아니면 "성공 응답을 받지 못했습니다"로 실패합니다. 따라서 수신 엔드포인트는 어떤 요청에도 즉시 \`200\`을 반환하도록 구현합니다.

> **수신 테스트:** 페이로드를 확인하려면 공개 수신 URL이 필요합니다. **어떤 요청에도 \`200\`을 반환하고 본문을 기록하는** 엔드포인트(직접 만든 수신 서버, Google Apps Script 웹앱 등)를 띄워 위 절차로 등록한 뒤, 레코드를 생성/수정해 전송된 원문을 확인합니다. 일부 공개 웹훅 테스트 서비스(webhook.site 등)는 세일즈맵 쪽에서 검증 요청이 닿지 않아 등록이 실패할 수 있으니, 등록이 안 되면 다른 수신 URL을 사용합니다.

**전송 규칙**

* 수신 서버는 \\*\\*10초 이내에 \`200\`\\*\\*을 응답해야 합니다(처리는 비동기로).
* 전송 실패 시 **10분 간격으로 최대 10회 재시도**합니다.
* 페이로드 서명 검증은 제공되지 않습니다.

### 페이로드

\`\`\`json
{
  "history": "필드 수정",
  "occurredAt": "...",
  "source": "API",
  "sourceId": "<userId>",
  "objectType": "deal",
  "objectId": "<objectId>",
  "eventId": "<eventId>",
  "fieldName": "이름",
  "beforeField": "이전 값",
  "afterField": "새 값"
}
\`\`\`

| 필드                                         | 설명                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| \`history\`                                  | 이벤트 종류. \`"생성"\` \\| \`"필드 수정"\` \\| \`"삭제"\` \\| \`"병합"\`. **키 이름은 \`event\`가 아니라 \`history\`입니다.**                                             |
| \`occurredAt\`                               | 이벤트 발생 시각(ISO8601)                                                                                                                |
| \`source\`                                   | 변경 주체. 예: \`API\`, \`웹 폼\`, \`시스템\`, \`시퀀스\`, \`사용자\` 등 (값은 언어 혼재 — \`API\`는 영문, \`웹 폼\`은 한글)                                                   |
| \`sourceId\`                                 | \`source\`에 따른 ID. 시스템이면 \`null\`                                                                                                     |
| \`objectType\`                               | **영문 소문자**. \`lead\` \\| \`deal\` \\| \`people\` \\| \`organization\` \\| 커스텀 오브젝트명. (한글이 아닙니다.)                                              |
| \`objectId\`                                 | 대상 레코드 ID                                                                                                                         |
| \`customObjectDefinitionId\`                 | 커스텀 오브젝트 이벤트에만 포함됩니다(딜·리드 등에는 키 자체가 없음).                                                                                          |
| \`eventId\`                                  | 동일 행위로 여러 웹훅이 발생할 때 공유되는 ID                                                                                                       |
| \`fieldName\` / \`beforeField\` / \`afterField\` | \`history\`가 \`"필드 수정"\`일 때만 포함. \`fieldName\`은 한글 필드명, \`beforeField\`/\`afterField\`는 값(관계형은 \`{id,name}\`, 복수는 \`[{id,name}]\`, 빈 값은 \`null\`) |

> **참고:** 레코드를 생성하면 \`"생성"\` 1건과 함께, 자동으로 채워지는 필드들에 대한 \`"필드 수정"\` 이벤트가 **여러 건** 같은 \`eventId\`로 전송됩니다. 따라서 수신 측은 \`eventId\`로 묶어 처리합니다.

### beforeField / afterField 형태

값의 형태는 필드 타입을 따릅니다.

| 필드 타입       | 형태             | 예시                               |
| ----------- | -------------- | -------------------------------- |
| 비어 있음       | \`null\`         | \`null\`                           |
| 암호화 필드      | \`string\`       | \`"암호화된 데이터"\`                     |
| True/False  | \`boolean\`      | \`true\`                           |
| 날짜          | \`string\`       | \`"2024-04-16"\`                   |
| 날짜(시간)      | \`string\`       | \`"2024-04-16 오전 07시 18분"\`        |
| 숫자          | \`number\`       | \`12000\`                          |
| 텍스트 / 단일 선택 | \`string\`       | \`"서울시 강남구"\`                      |
| 복수 선택       | \`string[]\`     | \`["내과", "외과"]\`                   |
| 관계(단일)      | \`{id, name}\`   | \`{"id": "<id>", "name": "이름"}\`   |
| 관계(복수)      | \`[{id, name}]\` | \`[{"id": "<id>", "name": "이름"}]\` |

> **참고:** 파이프라인 단계 변경 시 \`afterField\`는 객체입니다 — \`{"id": "<stageId>", "name": "단계명"}\`. \`afterField.name\`으로 단계명을 읽습니다.

### eventId 동작 / 구독 이벤트

* 고객 생성 시 \`생성\`과 (자동 채워진 필드들의) \`필드 수정\` 웹훅이 같은 \`eventId\`로 전송됩니다.
* 고객 병합 시 \`삭제\`와 \`병합\` 웹훅이 같은 \`eventId\`로 전송됩니다.
* 구독 가능 이벤트: 고객·회사·리드·딜은 생성/필드 수정/삭제/병합, 커스텀 오브젝트는 생성/필드 수정/삭제(병합 없음).

### 핸들러 패턴

먼저 \`200\`으로 즉시 응답하고 처리는 비동기로 진행합니다. 같은 행위의 중복 수신은 \`eventId + objectId\`로 감지합니다.

\`\`\`js
app.post('/webhook/salesmap', (req, res) => {
  res.status(200).json({ success: true }); // 즉시 응답(10초 이내)
  processWebhook(req.body).catch(console.error);
});
\`\`\`

***

## 부록

### 삭제 API 요약

| 리소스                |  삭제 | 방법 / 비고                                                                         |
| ------------------ | :-: | ------------------------------------------------------------------------------- |
| 딜                  |  ✅  | \`POST /v2/deal/{dealId}/delete\` (body 없음). 시퀀스에 등록된 딜은 불가(\`시퀀스에 딜이 등록되어 있습니다.\`) |
| 리드                 |  ✅  | \`POST /v2/lead/{leadId}/delete\` (body 없음)                                       |
| 고객 / 회사 / 커스텀 오브젝트 |  ❌  | \`POST /v2/{resource}/delete\` 라우트는 존재하나 body 형식이 공개되지 않아 사용 불가 → GUI에서만 삭제       |
| 필드                 |  ❌  | \`DELETE /v2/field/{id}\` → 405. GUI에서만                                           |
| 파일                 |  ✅  | \`POST /v2/file/{fileId}/delete\` (body 없음) → \`{ "success": true }\`               |

> \`DELETE\` HTTP 메서드는 대부분 \`405\`/\`404\`를 반환합니다. 삭제는 \`POST .../delete\` 패턴을 사용합니다.

### 읽기전용 시스템 필드

커스텀 필드는 기본적으로 모두 수정 가능하지만, 아래 **집계·시스템 필드는 수정할 수 없습니다**(요청에 넣어도 반영되지 않음). 전체 목록은 \`GET /v2/field/{type}\`로 확인합니다.

* **공통**: \`RecordId\`, \`수정 날짜\`, TODO 집계(\`전체/완료/미완료 TODO\`, \`다음 TODO 날짜\`), 딜 집계(\`딜 개수\`, \`성사된/실패한/진행중 딜 개수\`, \`총 매출\`), 노트/웹폼/이메일 관련 \`최근 …\` 필드, 시퀀스 집계(\`누적 시퀀스 등록수\`, \`현재 진행중인 시퀀스 여부\` 등).
* **타입 기준 읽기전용**: \`multiPeopleGroup\`(고객 그룹), \`multiLeadGroup\`(리드 그룹), \`multiTeam\`(팀 — People/Org), \`formula\`(계산 필드), \`multiAttachment\`(첨부 파일).
* **파이프라인 자동 생성 필드**(딜/리드): \`{단계명}({파이프라인명})로 진입한 날짜 / 에서 보낸 누적 시간 / 에서 퇴장한 날짜\` 등은 모두 읽기전용입니다.

> **참고(딜 status):** \`status\`는 \`"Won"\`, \`"Lost"\`, \`"In progress"\`만 허용하며 대소문자를 구분합니다. \`마감일\`은 status가 \`Won\`/\`Lost\`일 때만 반영됩니다.

### 베스트 프랙티스

1. **요청 간격**: 호출 사이 0.1\\~0.15초를 두어 레이트리밋(100req/10초)을 피합니다. 배치는 소량씩 나눠 보냅니다.
2. **필드 이름**: \`fieldList\`의 \`name\`은 세일즈맵 UI의 한글 필드명과 정확히 일치시킵니다(\`GET /v2/field/{type}\`로 확인).
3. **딜 금액**: \`price\`(top-level)로 전달합니다. \`fieldList\`에 \`금액\`을 넣지 않습니다.
4. **담당자/관계 필드**: 이름이 아니라 ID(\`userValueId\`, \`peopleValueId\` 등)로 지정합니다.
5. **회사 중복**: 생성이 중복으로 실패하면 에러 응답의 \`data.id\`로 기존 회사를 재사용합니다.
6. **단건 조회**: \`data.<object>\`는 1요소 배열입니다. \`data.people[0]\`처럼 접근합니다.
7. **이메일 본문**: 이메일 메타는 액티비티의 \`emailId\`로 식별한 뒤 \`GET /v2/email/{id}\`로 개별 조회합니다.
8. **시퀀스 분석**: 목록 → \`step\` → \`enrollment\` → \`timeline\` 순으로 드릴다운합니다.
9. **웹훅 처리**: 10초 내 \`200\`을 응답하고 처리는 비동기로, 중복은 \`eventId + objectId\`로 감지합니다.
10. **삭제**: 딜·리드는 \`POST /v2/{type}/{id}/delete\`, 파일은 \`POST /v2/file/{fileId}/delete\`로 삭제합니다. 고객·회사·필드에는 삭제 API가 없습니다(GUI에서만).

***

### REST API vs MCP — 무엇을 쓸까

이 레퍼런스는 **REST API** 기준입니다. 대부분의 통합(연동 서버·자동화·백엔드, 정밀한 제어가 필요한 작업)에는 REST가 우월합니다.

다만 아래가 **모두** 해당하면 세일즈맵 **MCP 서버**가 더 이상적입니다:

* 이 문서를 읽는 AI가 **코드/터미널을 실행할 수 없는 대화형 AI**(예: claude.ai, Claude Desktop)이고,
* 사용자도 터미널이나 **코딩 에이전트**(Claude Code 등 터미널·코드 실행형 AI 도구)를 쓰지 않으며,
* 목적이 연동 서버 구축이 아니라 **일시적 조회·생성·리포트 같은 일상 업무**인 경우.

→ 이때는 MCP를 연결하면 코드 작성·실행 없이 **도구 호출만으로** 바로 처리할 수 있어 더 간단합니다. 반대로 **코딩 에이전트 환경이거나 지속적인 연동을 구축**한다면 REST API를 사용하세요.

#### MCP 설치

설치·설정·도구 목록은 공식 문서를 참고하세요: <https://docs.salesmap.kr/developers/mcp>

원격 MCP 예시:

\`\`\`bash
npx -y mcp-remote https://salesmap-mcp.vercel.app/api/mcp --header "Authorization: Bearer <API 토큰>"
\`\`\`

토큰은 REST와 동일합니다(설정 > 개인 > 연동 > API > 토큰 생성).
`;
