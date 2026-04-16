# 세일즈맵 API MCP Readiness 리포트

> 작성: 2026-04-14 / 최신화: 2026-04-16
> 작성자: CX팀 (MCP 서버 구현 경험 기반)
> 대상: 세일즈맵 API 팀 / 공식 MCP 서버 개발 시 참고

## 요약

세일즈맵 CRM API v2를 MCP(Model Context Protocol) 서버로 래핑하면서, AI 에이전트가 API를 사용할 때 발생하는 구조적 문제들을 발견했습니다. HubSpot 공식 MCP 서버(20개 도구)와 비교하며 정리합니다.

**핵심 메시지: 공식 MCP를 만들려면 API가 먼저 잘 되어있어야 합니다.**

MCP는 API 위에 얇은 래퍼를 씌우는 구조인데, API 설계에 문제가 있으면 MCP 레이어에서 우회 로직이 폭발적으로 늘어납니다. 현재 세일즈맵 MCP는 19개 도구 중 절반 이상에서 API 레거시를 보완하는 변환/우회 로직이 들어가 있습니다.

---

## 1. Batch API 부재 (Create / Read / Update)

### 문제

세일즈맵에는 다건 처리 API가 없습니다. 조회(`GET`), 생성(`POST`), 수정(`POST`) 모두 1건씩만 처리 가능합니다.

### 실제 영향

검색 API(`/v2/object/{type}/search`)는 `{ id, name }`만 반환합니다. 상세 필드를 보려면 검색 결과 N건에 대해 개별 GET을 N번 호출해야 합니다.

```
MCP 내부 동작 (batch-read 20건):
  search → [id1, id2, ..., id20]
  → GET /v2/deal/id1  (120ms 대기)
  → GET /v2/deal/id2  (120ms 대기)
  → ...
  → GET /v2/deal/id20 (120ms 대기)
  = 최소 2.4초 + API 응답 시간
```

다건 생성/수정도 마찬가지입니다. "이 리드 20건의 담당자를 홍길동으로 바꿔줘" → 20번의 개별 POST 호출 필요.

### HubSpot 비교

```
HubSpot: 3종 batch API (최대 100건)

POST /crm/v3/objects/deals/batch/read
  → { inputs: [{id:"1"}, ...{id:"100"}], properties: ["name","amount"] }
  → 1번의 API 콜로 최대 100건 조회

POST /crm/v3/objects/deals/batch/create
  → { inputs: [{ properties: {"dealname":"딜1"} }, ...] }
  → 1번의 API 콜로 최대 100건 생성

POST /crm/v3/objects/deals/batch/update
  → { inputs: [{ id:"1", properties: {"amount":50000} }, ...] }
  → 1번의 API 콜로 최대 100건 수정
```

허브스팟 MCP는 이 3개를 `batch-read-objects`, `batch-create-objects`, `batch-update-objects` 도구로 직접 노출합니다. 단건 CRUD 도구가 아예 없이, 1건 조회도 `batch-read`에 ID 1개를 넣는 방식입니다.

### MCP에서의 우회

- **batch-read**: `salesmap-batch-read-objects` 도구를 만들었지만 내부적으로는 for-loop + rate limit 대기입니다.
- **batch-create/update**: 미구현. 현재 단건 도구만 제공합니다. 다건 작업 시 LLM이 도구를 여러 번 호출해야 합니다.

---

## 2. fieldList 타입 키 패턴

### 문제

필드 값을 쓸 때 타입별로 다른 키를 사용해야 합니다.

```json
// 세일즈맵: 클라이언트가 15개 이상의 타입 키를 알아야 함
{ "fieldList": [
    { "name": "담당자", "userValueId": "uuid" },
    { "name": "금액", "numberValue": 50000 },
    { "name": "이메일", "stringValue": "a@b.com" },
    { "name": "참여자", "userValueIdList": ["uuid1", "uuid2"] },
    { "name": "소속팀", "teamValueIdList": ["team-uuid"] }
]}
```

```json
// HubSpot: 서버가 타입 추론
{ "properties": { "담당자": "uuid", "금액": 50000, "이메일": "a@b.com" } }
```

### 실제 영향

LLM이 필드 타입을 모르면 잘못된 키를 사용합니다. `{ "name": "담당자", "stringValue": "홍길동" }` 같은 에러가 빈번합니다.

### MCP에서의 우회

`resolveProperties()` 함수를 구현했습니다. 매번 `/v2/field/{type}` API를 호출하여 스키마를 가져온 후, `{ "담당자": "홍길동" }` → `{ "name": "담당자", "userValueId": "uuid" }`로 변환합니다. 추가 API 콜 1회 + 이름→UUID 자동 변환 로직이 필요합니다.

---

## 3. Top-level 파라미터 분리

### 문제

특정 필드들이 `fieldList` 안에 들어갈 수 없고, top-level body 파라미터로만 전달 가능합니다.

```json
POST /v2/deal
{
  "name": "딜 이름",           // ← top-level만 가능
  "price": 50000,              // ← top-level만 가능
  "pipelineId": "uuid",        // ← top-level만 가능
  "pipelineStageId": "uuid",   // ← top-level만 가능
  "status": "In progress",     // ← top-level만 가능
  "fieldList": [               // ← 나머지 필드
    { "name": "담당자", "userValueId": "uuid" }
  ]
}
```

### 실제 영향

LLM은 "모든 필드를 properties에 넣으면 됨"이라는 단일 규칙으로 동작해야 효율적입니다. top-level 예외가 있으면 매번 "이 필드는 top-level인가 fieldList인가"를 판단해야 하고, 에러율이 높아집니다.

### MCP에서의 우회

`TOP_LEVEL_ONLY` 맵을 구현하여 properties에 `"금액": 50000`을 넣으면 자동으로 body의 `price: 50000`으로 추출합니다. 파이프라인/단계는 ID 형식 검증까지 추가했습니다.

```typescript
const TOP_LEVEL_ONLY = {
  "금액": "price",
  "이름": "name",
  "파이프라인": "pipelineId",
  "파이프라인 단계": "pipelineStageId",
  "상태": "status",
};
```

---

## 4. 필드 이름이 한글 (Internal Name 부재)

### 문제

세일즈맵 필드의 식별자가 한글 표시명(`이름`, `금액`, `담당자`)입니다. 영문 internal name이 없습니다.

### 실제 영향

- **API 파라미터 혼동**: `fieldName: "이름"` vs `name: "딜이름"` — `name`은 top-level 파라미터이고 `이름`은 fieldList의 필드명. 같은 개념인데 경로가 다름.
- **다국어 확장 불가**: 워크스페이스 언어가 바뀌면 필드명이 바뀌고 모든 연동이 깨짐.
- **LLM 혼란**: 영문 API 파라미터(`pipelineId`)와 한글 필드명(`파이프라인`)이 혼재.

### HubSpot 비교

```
HubSpot: "dealname" (internal) → "Deal Name" (label)
         "amount" (internal) → "Amount" (label)
         API에서는 항상 internal name 사용
```

### MCP에서의 우회

한글 필드명을 그대로 사용합니다. 대안이 없습니다.

---

## 5. Search API 제한

### 5-1. 정렬 미지원

`sorts` 파라미터를 보내도 API가 무시합니다. 금액순 정렬, 최신순 정렬 등이 서버단에서 불가능합니다.

**MCP 우회**: 전체 결과를 가져온 후 클라이언트에서 정렬해야 하지만, 페이지네이션과 충돌합니다 (1페이지 50건만 정렬됨).

### 5-2. 빈 필터 불가

`filterGroupList: []`를 보내면 에러. 전체 목록 조회가 search로 안 됩니다.

**MCP 우회**: `{ fieldName: "이름", operator: "EXISTS" }` 더미 필터를 삽입합니다.

### 5-3. 응답이 `{ id, name }`만 반환

검색 결과에 상세 필드가 없습니다. 사용자가 "금액 1억 이상인 딜"을 검색하면, 검색은 되지만 금액 값을 보려면 다시 개별 조회해야 합니다.

**HubSpot**: search 응답에 `properties[]`로 지정한 필드가 포함됩니다.

### 5-4. 에러 메시지 불친절

잘못된 필드명이나 연산자를 사용하면 `Invalid fieldName: 생성일` 같은 에러만 반환합니다. 어떤 필드명이 유효한지, 어떤 연산자가 지원되는지 힌트가 없습니다.

**MCP 우회**: `errWithSchemaHint()` 함수로 에러 메시지에 `salesmap-list-properties로 확인하세요` 힌트를 추가합니다.

### 5-5. custom-object 검색 미지원

`targetType: "custom-object"` → `Invalid targetType` 에러.

---

## 6. Association 구조 차이

### 문제

세일즈맵 association API는 `primary`와 `custom`이 분리되어 있고, 활동(engagement)에 대한 association이 없습니다.

```
세일즈맵:
  GET /v2/object/{type}/{id}/association/{toType}/primary  → ID 배열
  GET /v2/object/{type}/{id}/association/{toType}/custom   → {id, label} 배열
  → memo, email, todo 등은 association 대상이 아님
```

```
HubSpot:
  list-associations(objectType, objectId, toObjectType)
  → notes, emails, tasks도 objectType으로 취급 → association 조회 가능
```

### 실제 영향

Claude가 "이 고객의 메모를 보고 싶다"고 할 때:
- **HubSpot**: `list-associations(contacts, id, notes)` → note ID 목록 → `batch-read`
- **세일즈맵**: association으로 memo를 조회할 수 없음. activity API(`/v2/{type}/activity`)를 통해서만 접근 가능.

Claude는 HubSpot 패턴을 학습했기 때문에 association → 개별 조회 패턴을 시도합니다. 세일즈맵에서는 이 패턴이 memo에 대해 작동하지 않아서 우회해야 합니다.

### MCP에서의 우회

`salesmap-list-engagements` 도구를 별도 구현하여 activity API를 래핑하고, 이메일 제목과 메모 본문을 자동으로 인라인합니다. 하지만 Claude가 이 도구의 존재를 모르고 association 패턴을 시도하는 경우가 빈번합니다.

---

## 7. Rate Limit

### 문제

세일즈맵 API는 10초당 100건 제한(추정)이 있고, 초과 시 429를 반환합니다. 문서화되어 있지 않습니다.

### 실제 영향

AI 에이전트는 병렬로 빠르게 호출하는 패턴이 일반적입니다. batch-read 20건, association 카운트 조회, engagement 조회 등이 동시에 발생하면 쉽게 한도에 도달합니다.

### MCP에서의 우회

모든 API 호출 전 120ms 인터벌을 강제 삽입하고, 429 시 exponential backoff로 재시도합니다. 이로 인해 응답 시간이 불필요하게 늘어납니다.

### HubSpot 비교

HubSpot MCP는 rate limit 처리 로직이 없습니다. HubSpot API 자체가 충분한 한도(초당 100~200건)를 제공하고, 초과 시에도 retry-after 헤더로 명확하게 안내합니다.

---

## 8. 응답 래핑 비일관성

### 문제

단건 조회 응답이 엔티티 타입마다 다릅니다.

```json
GET /v2/deal/{id}       → { "deal": { ...레코드... } }          // 객체
GET /v2/organization/{id} → { "organization": [ { ...레코드... } ] }  // 배열 (1건인데)
GET /v2/email/{id}      → { "email": { ...레코드... } }          // 객체
GET /v2/memo/{id}       → { "memo": { ...레코드... } }           // 객체
```

### MCP에서의 우회

`getOne()` 헬퍼 함수에서 응답이 배열이면 `[0]`을 꺼내고, 객체면 그대로 사용하는 분기 처리를 합니다.

---

## 9. 누락된 API

CRM 업무에서 일상적으로 필요하지만 API가 없거나 작동하지 않는 기능들:

| 기능 | 현재 상태 | 비즈니스 필요 |
|------|-----------|-------------|
| TODO 생성 | `POST /v2/todo` → 500 | 미팅 후 후속 조치 등록, 팀원에게 업무 할당 |
| 시퀀스 등록 | `POST /v2/sequence/enrollment` → 500 | 신규 리드 자동 시퀀스 배정, 대량 아웃바운드 |

> 이메일(#10), engagement 상세(#15), 커스텀 오브젝트(#14), 리드→딜 전환(#16)은 각 독립 이슈 참조.

---

## 10. 이메일 API 제한 — 본문 미제공 + 목록 조회 부재

### 문제

두 가지 제한:

1. **본문 미제공**: `GET /v2/email/{id}` 응답에 subject, from, to, date 등 메타데이터만 포함됩니다. body/htmlBody/content 필드가 없습니다.
2. **목록 API 부재**: `GET /v2/email` → 404 (HTML 반환). 이메일 목록 조회 엔드포인트가 존재하지 않습니다. 고객별 이메일을 보려면 activity API에서 emailId를 하나씩 추출 → 개별 조회해야 합니다.

### 실제 영향

이메일 조회 도구가 존재해도 실질적 가치가 없습니다. "이 고객에게 뭐라고 메일 보냈어?" → 제목만 보여줄 수 있고, 본문은 알 수 없습니다. 이메일 내용 기반 분석·요약·후속 조치 추천이 불가능합니다.

### HubSpot 비교

```
HubSpot: GET /crm/v3/objects/emails/{id}?properties=hs_email_html,hs_email_text
  → 본문 HTML/텍스트 반환. 이메일이 일반 오브젝트이므로 properties로 원하는 필드 지정 가능.
  → 이메일도 오브젝트이므로 search/batch-read로 목록 조회 가능.
```

### MCP에서의 우회

- **본문**: 우회 불가. `read-email` 도구를 비활성화하고 `list-engagements`에서 제목만 인라인.
- **목록**: `list-engagements`가 activity API를 래핑하여 emailId 추출 + 제목 인라인을 자동 처리. API가 본문을 제공하게 되면 `read-email` 활성화 예정.

---

## 11. 삭제 API 비표준

### 문제

삭제가 `DELETE /v2/{type}/{id}`가 아니라 `POST /v2/{type}/{id}/delete`입니다. body 형식이 문서화되어 있지 않고, 시퀀스에 등록된 레코드는 에러 메시지 없이 실패합니다.

### MCP에서의 우회

에러 메시지에 "시퀀스"가 포함되면 `시퀀스에 등록된 레코드는 삭제 불가` 힌트를 수동으로 추가합니다.

---

## 12. 조회 시 반환 필드 선택 불가

### 문제

세일즈맵 API는 레코드 조회 시 원하는 필드만 지정하여 받는 기능이 없습니다. 항상 전체 필드가 반환됩니다.

```
// 세일즈맵: 전체 필드 반환만 가능
GET /v2/deal/{id}
→ 50개 이상의 모든 필드가 응답에 포함됨. 이름과 금액만 필요해도 전부 받아야 함.
```

### 실제 영향

- **토큰 낭비**: LLM 컨텍스트 윈도우에 불필요한 필드가 대량 유입. 딜 1건에 50개 필드 × batch 20건 = 1,000개 필드가 컨텍스트를 차지.
- **응답 속도**: 네트워크 전송량 증가, 특히 batch 조회 시 체감됨.
- **LLM 혼란**: 필드가 너무 많으면 중요한 필드를 놓치거나 관련 없는 필드에 반응하는 경우 발생.

### HubSpot 비교

```
HubSpot: GET /crm/v3/objects/deals/{id}?properties=dealname,amount,closedate
  → 지정한 3개 필드만 반환. batch-read에서도 동일하게 properties[] 파라미터 지원.
  → MCP 도구에서 properties 파라미터가 API에 그대로 전달됨.
```

### MCP에서의 우회

두 가지 방식을 조합합니다.

**1. DEFAULT_PROPERTIES** (2026-04-16 추가): `batch-read-objects`에서 `properties`를 명시하지 않으면 타입별로 미리 정의된 코어 필드 목록만 반환합니다 (HubSpot 방식). 딜은 금액·파이프라인·상태 등, 고객은 이메일·전화 등. 커스텀 오브젝트는 `GET /v2/field/custom-object` 조회 후 시스템 필드를 동적으로 감지.

**2. pickProperties()**: `properties`를 명시한 경우, 전체 API 응답을 받은 후 해당 필드만 클라이언트에서 잘라냅니다. 네트워크/API 부하는 줄지 않습니다.

두 방식 모두 API가 `properties[]` 파라미터를 지원하면 불필요해집니다.

---

## 13. 노트(메모) 생성 API 제한

### 문제

전용 노트 생성 API가 없습니다. 레코드 수정 API(`POST /v2/{type}/{id}`)의 `memo` 파라미터에 텍스트를 넣으면 메모가 자동 생성되는 구조입니다.

```json
// 세일즈맵: 레코드 update 요청에 memo 파라미터 끼워넣기
POST /v2/deal/{id}
{ "memo": "미팅 내용 정리" }
→ 메모 생성되지만, 날짜/유형/담당자는 서버가 자동 설정 (현재 시각, API 토큰 소유자)
```

### 실제 영향

- **날짜 지정 불가**: "지난주 미팅 메모를 남겨줘" → 현재 시각으로만 생성됨. 과거 활동 기록 불가.
- **유형(태그) 지정 불가**: 메모 스키마에 `유형` 필드가 있지만 생성 시 설정할 수 없음.
- **담당자 지정 불가**: 항상 API 토큰 소유자가 작성자. "팀장이 작성한 메모"로 남길 수 없음.
- **데이터 마이그레이션 불가**: 타 CRM에서 이관 시 원래 작성 시각·작성자를 보존할 수 없음.

### HubSpot 비교

```
HubSpot: POST /crm/v3/objects/notes
{
  "properties": {
    "hs_note_body": "미팅 내용 정리",
    "hs_timestamp": "2026-04-10T09:00:00Z",   ← 날짜 지정 가능
    "hubspot_owner_id": "12345"                ← 담당자 지정 가능
  },
  "associations": [{ "to": { "id": "deal-id" }, "types": [...] }]
}
→ 노트가 독립 오브젝트. 날짜·담당자·연관 레코드 모두 지정 가능.
```

### MCP에서의 우회

`salesmap-create-note` 도구를 만들었지만 내부적으로는 레코드 update 호출입니다. 텍스트만 전달 가능하고 메타데이터 제어는 불가능합니다.

---

## 14. 커스텀 오브젝트 Definition 목록 조회 API 부재

### 문제

`GET /v2/custom-object-definition` API가 없습니다. 워크스페이스에 어떤 커스텀 오브젝트 타입이 정의되어 있는지 프로그래밍적으로 파악할 수 없습니다.

### 실제 영향

- **MCP 동적 대응 불가**: "커스텀 오브젝트 목록 보여줘" → 응답할 수 없음
- **Definition ID를 미리 알아야 함**: 커스텀 오브젝트 레코드를 생성하려면 `customObjectDefinitionId`가 필수인데, 이걸 조회할 API가 없음
- **사용자에게 ID를 물어봐야 함**: LLM이 "커스텀 오브젝트 Definition ID를 알려주세요"라고 물어야 하는 비정상적 흐름

### HubSpot 비교

```
HubSpot: GET /crm/v3/schemas
  → 워크스페이스의 모든 커스텀 오브젝트 스키마 반환 (이름, 필드, 연관관계 포함)
  → MCP에서 hubspot-list-schemas 도구로 제공
```

### MCP에서의 우회

우회 불가. 커스텀 오브젝트 타입을 동적으로 다루지 못합니다. 사용자가 `customObjectDefinitionId`를 직접 제공해야 합니다.

---

## 15. Engagement 종합 — 2급 데이터 구조 + API 대부분 부재

> #22(Engagement 통합 CRUD 부재)를 이 섹션으로 통합.

### 구조적 문제

세일즈맵의 engagement(노트, 이메일, TODO, SMS, 미팅, 카카오 알림톡, AI transcript)는 **1급 오브젝트가 아닌 activity API 종속 데이터**입니다. search/association/batch-read 대상이 아니며, 개별 API가 타입별로 분산되어 있고 대부분 미구현입니다.

### API 현황

| Engagement 타입 | 상세 조회 | 생성 | 수정 | 비고 |
|----------------|:---------:|:----:|:----:|------|
| memo (노트) | ✅ `GET /v2/memo/{id}` | ⚠️ 레코드 update의 `memo` 파라미터로 우회 | ❌ | 날짜/담당자/유형 지정 불가 (#13) |
| email | ⚠️ `GET /v2/email/{id}` | — (외부 발송) | — | 본문 없음 (#10), 목록 API 404 |
| todo | ❌ 미확인 | ❌ `POST /v2/todo` → 500 | ❌ | |
| sms | ❌ 404 | — | — | |
| 카카오 알림톡 | ❌ 404 | — | — | |
| meeting | ❌ 404 | — | — | |
| AI transcript | ❌ API 없음 | — | — | |

### 실제 영향

- activity 타임라인에서 `smsId`, `meetingId`, `kakaoAlimtalkId` 등이 나오지만 상세 내용 조회 불가
- 노트 생성은 레코드 update 우회만 가능 — 날짜/담당자/유형 지정 불가
- 노트 수정, 태스크 생성/수정, engagement 삭제 모두 불가

### HubSpot 비교

```
허브스팟: engagement = 1급 오브젝트. 통합 CRUD + 개별 타입 오브젝트 조회.

통합 도구 (3개):
  hubspot-create-engagement(type: "NOTE"|"TASK", metadata, associations, ownerId)
  hubspot-get-engagement(engagementId)
  hubspot-update-engagement(engagementId, metadata)

개별 타입도 오브젝트:
  GET /crm/v3/objects/meetings/{id}?properties=hs_meeting_title,hs_meeting_body
  GET /crm/v3/objects/calls/{id}?properties=hs_call_body,hs_call_duration
  GET /crm/v3/objects/tasks/{id}?properties=hs_task_body,hs_task_status
  → search, association, batch-read 모두 가능

단, NOTE/TASK만 지원. EMAIL/CALL/MEETING은 미지원 — 점진적 확장 중.
```

### MCP에서의 우회

- `list-engagements`: activity API 래핑 + email 제목/memo 본문 자동 인라인 (~80줄)
- `create-note`: 레코드 update의 memo 파라미터 우회 (제한적)
- `read-note`: memo 단건 상세 조회
- sms/meeting/alimtalk/transcript: ID만 반환, 상세 내용 불가

### 최종 방향

engagement를 1급 오브젝트로 승격 → search/association/batch-read 대상화. MCP에서는 `read-note`를 `read-engagement(id)` 통합 도구로 발전시킬 예정. 현재 `list-engagements` 인라인은 임시 우회.

---

## 16. 리드→딜 전환 API 부재

### 문제

`POST /v2/lead/{id}/convert` 같은 전환 API가 없습니다. 리드를 딜로 전환하려면 수동으로:
1. 리드 상세 조회
2. 딜 생성 (리드의 peopleId/organizationId 연결)
3. 리드 삭제 (선택)

이 과정을 거쳐야 합니다.

### 실제 영향

"이 리드 딜로 전환해줘"는 CRM에서 가장 자연스러운 요청 중 하나입니다. 현재는 3단계 수동 프로세스가 필요하고, 리드의 메모·활동 이력이 딜로 이전되지 않습니다.

### HubSpot 비교

HubSpot MCP에도 전용 전환 도구는 없습니다. 다만 HubSpot에서 "리드"는 독립 오브젝트가 아니라 contact/company의 lifecycle stage 값(`lead` → `opportunity`)이므로, 전환이라는 개념 자체가 다릅니다. 딜 생성 + contact association이 자연스러운 흐름.

### MCP에서의 우회

전용 전환 도구는 없지만, LLM이 기존 도구 조합으로 처리 가능합니다:
1. `read-object(lead, id)` → 리드 정보 획득
2. `create-object(deal, { properties, peopleId/organizationId })` → 리드의 연결 정보를 사용해 딜 생성

다만 리드의 활동 이력·메모는 딜로 이전되지 않고, 전환이라기보다 "별도 생성"에 가깝습니다.

---

## 17. 필드 스키마에 description 없음

### 문제

`GET /v2/field/{type}` 응답에 `description` 필드가 없습니다. 각 필드가 무엇을 의미하는지, 어떤 값을 넣어야 하는지에 대한 설명이 API에서 제공되지 않습니다.

```json
// 세일즈맵: description 없음
{ "fieldList": [
    { "id": "...", "name": "마감일", "type": "date", "required": false },
    { "id": "...", "name": "담당자", "type": "user", "required": false }
]}
// "마감일"이 자동 계산 필드인지, 사용자가 입력하는 필드인지 알 수 없음
```

### 실제 영향

- **LLM이 필드 용도를 모름**: "마감일"이 자동 업데이트되는 시스템 필드인지, 직접 입력하는 필드인지 구분 불가. 자동계산 필드에 값을 쓰려고 시도하는 에러 발생.
- **커스텀 필드 의미 파악 불가**: 사용자가 만든 필드의 목적을 LLM이 추론해야 함.
- **검색 시 필드 선택 어려움**: 어떤 필드로 검색해야 유의미한 결과가 나오는지 판단 근거 없음.

### HubSpot 비교

```
HubSpot: GET /crm/v3/properties/deals
→ { "results": [
    { "name": "closedate", "label": "Close Date", "type": "date",
      "description": "Date the deal was closed. This is set automatically..." },
    { "name": "hubspot_owner_id", "label": "Deal Owner", "type": "enumeration",
      "description": "The owner of the deal" }
]}
→ list-properties 도구에서도 description을 포함한 축소 응답(name, label, type, description, groupName) 반환.
```

### MCP에서의 우회

`FIELD_HINTS` 하드코딩으로 시스템 필드 ~44개에 description을 수동 주입합니다. 커스텀 필드와 매핑되지 않은 시스템 필드는 description이 없습니다. API가 description을 제공하면 이 하드코딩이 불필요해집니다.

---

## 18. 참조 필드가 ID만 허용 (이름→ID 변환 없음)

### 문제

사용자, 팀, 파이프라인, 파이프라인 단계 등 참조 필드는 UUID만 허용합니다. 이름 문자열을 넣으면 에러가 발생합니다.

```json
// LLM이 자연스럽게 시도하는 것:
{ "properties": { "담당자": "홍길동", "파이프라인": "신규 영업" } }
→ ❌ 에러: UUID 형식이어야 합니다

// API가 실제로 요구하는 것:
{ "properties": { "담당자": "a1b2c3d4-...", "파이프라인": "e5f6g7h8-..." } }
```

### 실제 영향

LLM은 사람 이름, 팀 이름, 파이프라인 이름을 자연어로 알고 있지 UUID로 알고 있지 않습니다. 매번 "UUID를 먼저 조회하세요"라는 에러를 받고 → 사용자/파이프라인 목록 조회 → UUID 획득 → 재시도하는 3단계 과정을 거쳐야 합니다.

### HubSpot 비교

HubSpot도 owner ID(숫자)를 요구하지만, `search-objects`에서 owner name으로 검색이 가능하고, owner 목록 API가 이름 검색을 지원합니다. 또한 HubSpot의 owner ID는 짧은 숫자(`12345`)여서 LLM이 기억하기 쉽고, 세일즈맵의 UUID(`a1b2c3d4-e5f6-...`)보다 다루기 용이합니다.

### MCP에서의 우회

**사용자/팀**: `fetchUserMap()`, `fetchTeamMap()`으로 이름→UUID 자동 변환 구현. 검색 필터와 properties 쓰기 모두에서 "홍길동" → UUID 자동 해석.

**파이프라인/단계**: 자동 변환 미구현. 이름 문자열 감지 시 에러 메시지에 `salesmap-get-pipelines로 조회하세요` 힌트만 추가. LLM이 2단계(파이프라인 조회 → ID로 재시도)를 거쳐야 함.

---

## 19. 에러 응답이 비구조화 문자열

### 문제

세일즈맵 API 에러는 `reason` 문자열 하나로만 반환됩니다. 에러 카테고리, 에러 코드, 문제가 된 필드명 등의 구조화된 정보가 없습니다.

```json
// 세일즈맵: 문자열 하나
{
  "success": false,
  "reason": "people 유입경로에 정의 되지 않은 값을 입력했습니다"
}
```

```json
// 허브스팟: 구조화된 에러
{
  "status": "error",
  "message": "Property values were not valid",
  "category": "VALIDATION_ERROR",
  "subCategory": "crm.propertyValidation.PROPERTY_DOESNT_EXIST",
  "correlationId": "8a3f6c3a-...",
  "errors": [
    {
      "message": "Property \"testproperty\" does not exist",
      "code": "PROPERTY_DOESNT_EXIST",
      "context": { "propertyName": ["testproperty"] }
    }
  ],
  "links": { "scopes": "https://developers.hubspot.com/scopes" }
}
```

### 실제 영향

- **프로그래밍적 에러 처리 불가**: `reason` 문자열을 정규식이나 `includes()`로 패턴 매칭해야 함. 에러 메시지 문구가 바뀌면 처리 로직이 깨짐.
- **어떤 필드가 문제인지 모름**: "정의 되지 않은 값"이 어느 필드에서 발생했는지 에러만 봐서는 알 수 없음. 여러 필드를 동시에 보내면 원인 특정 불가.
- **LLM 자가 복구 어려움**: 구조화된 에러라면 LLM이 `errors[0].context.propertyName`을 읽고 해당 필드만 수정 재시도 가능. 문자열은 추론에 의존해야 함.

### HubSpot 비교

허브스팟 에러의 핵심 구조:

| 필드 | 용도 | 예시 |
|------|------|------|
| `category` | 에러 대분류 | `VALIDATION_ERROR`, `OBJECT_NOT_FOUND`, `MISSING_SCOPES`, `RATE_LIMITS` |
| `subCategory` | 에러 소분류 | `crm.propertyValidation.PROPERTY_DOESNT_EXIST` |
| `errors[].code` | 프로그래밍용 에러 코드 | `PROPERTY_DOESNT_EXIST`, `INVALID_INTEGER`, `INVALID_OPTION` |
| `errors[].context` | 문제가 된 필드/값 | `{ "propertyName": ["discount"] }` |
| `correlationId` | 디버깅용 요청 ID | UUID |

시나리오별:
- **존재하지 않는 필드**: `code: "PROPERTY_DOESNT_EXIST"` + `context.propertyName` → 정확히 어떤 필드가 문제인지 특정
- **잘못된 옵션값**: `code: "INVALID_OPTION"` → 어떤 필드의 어떤 값이 잘못됐는지 명시
- **404**: `category: "OBJECT_NOT_FOUND"` + `message`에 objectId 포함
- **429**: `errorType: "RATE_LIMIT"` + `policyName: "TEN_SECONDLY_ROLLING"` → 어떤 제한에 걸렸는지 명시
- **권한 부족**: `category: "MISSING_SCOPES"` + `context.requiredScopes` → 필요한 권한 목록

허브스팟 MCP는 이 구조화된 에러를 **추가 가공 없이 그대로 전달**합니다. API 에러 자체가 충분히 상세하기 때문에 MCP 레이어에서 보강할 필요가 없습니다.

### MCP에서의 우회

`errWithSchemaHint()` 함수에서 에러 문자열을 `includes()` 패턴 매칭으로 분류한 뒤, 도구 힌트를 수동으로 붙입니다.

```
감지 패턴 → 힌트:
"정의 되지 않은 값"     → salesmap-list-properties로 옵션 확인
"Invalid fieldName"    → 필드명은 한글 (예: 'name' → '이름')
"relation field"       → UUID만 허용, salesmap-get-pipelines 또는 salesmap-list-users 안내
"userValueId가 없습니다" → salesmap-list-users로 ID 확인
"fieldList이 아닌 파라메터" → top-level price 파라미터로 전달
기타                   → salesmap-list-properties로 확인
```

이 방식은 API 에러 메시지 문구에 의존하므로, API 측에서 문구를 변경하면 힌트 매칭이 깨집니다.

---

## 20. 필드(Property) 생성·수정 API 부재

### 문제

필드 정의를 프로그래밍적으로 생성하거나 수정하는 API가 없습니다. 커스텀 필드 추가, 옵션 값 변경, 필드 설정 변경 등은 UI에서만 가능합니다.

### 실제 영향

- **자동화 불가**: "딜에 '예상 매출' 숫자 필드를 추가해줘" → API로 불가, 관리자가 UI에서 직접 생성해야 함
- **마이그레이션 제약**: 타 CRM에서 이관 시 필드 구조를 프로그래밍적으로 복제할 수 없음
- **옵션 값 관리**: 선택형 필드의 옵션 추가/변경도 UI 전용

### HubSpot 비교

```
HubSpot: 4개 Property 도구
  hubspot-list-properties — 축소 응답 (name, label, type, description, groupName)
  hubspot-get-property    — 개별 필드 상세 (옵션, validation, 설정 전체)
  hubspot-create-property — 커스텀 필드 생성
  hubspot-update-property — 필드 수정 (라벨, 옵션 등)
```

참고: 허브스팟이 `list`와 `get`을 분리한 이유는 토큰 효율. `list`는 5개 필드만 반환하여 전체 목록을 가볍게 훑고, 특정 필드의 옵션이나 validation 규칙이 필요할 때만 `get`으로 상세 조회. 필드가 수십~수백 개인 워크스페이스에서 전부 풀 스키마로 반환하면 토큰이 폭발하기 때문.

### MCP에서의 우회

우회 불가. `list-properties`로 조회만 가능합니다.

---

## 21. Association(관계) 생성 API 부재

### 문제

레코드 간 관계를 프로그래밍적으로 생성하는 API가 없습니다. 고객과 회사를 연결하거나, 딜에 고객을 추가하는 등의 관계 생성은 레코드 생성 시 `peopleId`/`organizationId`로만 가능합니다.

### 실제 영향

- **기존 레코드 간 관계 추가 불가**: 이미 존재하는 고객과 회사를 나중에 연결할 수 없음
- **다대다 관계 관리 불가**: 하나의 딜에 여러 고객을 추가하는 등의 작업 불가
- **관계 유형 정의 조회 불가**: 어떤 타입 간에 관계가 가능한지 프로그래밍적으로 파악 불가

### HubSpot 비교

```
HubSpot: 3개 Association 도구
  hubspot-list-associations           — 관계 조회
  hubspot-batch-create-associations   — 다건 관계 생성 (최대 100)
  hubspot-get-association-definitions — 유효한 관계 유형 조회
```

허브스팟은 관계 생성이 레코드 CRUD와 완전히 분리된 독립 API. 기존 레코드 간에도 자유롭게 관계를 추가/해제할 수 있습니다.

### MCP에서의 우회

우회 불가. `list-associations`로 조회만 가능합니다. 관계 생성은 레코드 생성 시에만 `peopleId`/`organizationId` 파라미터로 가능합니다.

---

## 23. 상품(Product) API — 생성만 가능, 조회·수정·삭제 없음

### 문제

상품(Product) API는 목록 조회(`GET /v2/product`)와 생성(`POST /v2/product`)만 작동합니다. 단건 조회, 수정, 삭제 엔드포인트가 없습니다.

```
GET  /v2/product           → ✅ 목록 조회 (cursor 페이지네이션만 지원)
POST /v2/product           → ✅ 생성 (작동, name + price 필수)
GET  /v2/product/{id}      → ❌ 404 (HTML 반환)
POST /v2/product/{id}      → ❌ 404 (HTML 반환)
POST /v2/product/{id}/delete → ❌ 404 (HTML 반환)
POST /v2/object/product/search → ❌ 400 Bad Request (product는 search 미지원)
```

`GET /v2/product`는 이름·코드 등 필터 파라미터 없이 cursor 페이지네이션만 지원합니다. 상품 수가 많은 워크스페이스에서는 원하는 상품 ID를 찾기 위해 전체 목록을 순회해야 합니다.

### 실제 영향

- 생성한 상품의 상세 정보를 API로 확인 불가 (목록에서만 확인 가능)
- 상품명·가격 수정 불가 — 잘못 생성하면 UI에서만 수정 가능
- 테스트용 상품 삭제 불가
- MCP `batch-read-objects`에서 product 타입 지원 불가 (단건 조회가 없으므로)
- `create-quote`에서 `productId`를 찾으려면 전체 목록 순회 필요 — 대규모 카탈로그에서 비현실적

### HubSpot 비교

HubSpot은 Product(Line Item)도 다른 오브젝트와 동일하게 `batch-read/create/update` + 개별 CRUD를 모두 지원합니다.

### MCP에서의 우회

`salesmap-create-object`에서 product 생성은 가능하지만, 생성 후 상세 조회·수정·삭제가 불가능합니다. 목록 조회(`GET /v2/product`)에서 전체 상품을 볼 수는 있습니다.

`create-quote`의 `quoteProductList`에서 `productId`는 선택 필드 — 카탈로그 연동 없이 `name` + `price`만으로도 견적 항목 생성 가능. 카탈로그 연동이 필요하면 CRM UI에서 상품 ID를 직접 확인해야 합니다.

---

## 24. `/v2/user/me` vs `/v2/user` 응답 비일관성

### 문제

동일 사용자에 대해 두 엔드포인트가 다른 스키마와 값 형식을 반환합니다.

| 필드 | `/v2/user/me` | `/v2/user` 목록 |
|------|:---:|:---:|
| id, name, createdAt, updatedAt | O | O |
| email | **X** | O |
| role | **X** | O |
| room (워크스페이스) | O | **X** |
| status 값 | `"활성"` (한국어) | `"active"` (영어) |

### 실제 영향

- MCP `get-user-details` 도구가 `/v2/user/me`를 사용 → 현재 사용자 email 확인 불가
- status 값 형식이 달라서 프로그래밍 방식으로 비교 시 불일치 발생
- room(워크스페이스) 정보는 me에만 있어 목록에서 확인 불가

### HubSpot 비교

HubSpot의 `GET /account-info/v3/details`와 개별 사용자 조회 응답은 일관된 스키마를 사용합니다.

### MCP에서의 우회

현재 사용자 email이 필요하면 `/v2/user` 목록에서 me의 id로 매칭하여 추출해야 합니다.

---

## 25. 시퀀스 ID 필드 비일관성 (`_id` vs `id`)

### 문제

시퀀스 관련 API만 `_id`를 사용하고, 나머지 모든 리소스는 `id`를 사용합니다. 또한 문서와 실제 응답 필드명이 전반적으로 불일치합니다.

| 구분 | 문서 | 실제 |
|------|------|------|
| enrollment ID | `id` | `_id` |
| enrollment 상태 | `status`, `currentStepOrder`, `enrolledAt` | `createdAt`만 존재 |
| timeline 타입 | `type` | `eventType` |
| timeline 순서 | `stepOrder` | `stepIndex` |
| timeline 날짜 | `createdAt` | `date` |
| timeline ID | `id` | 없음 |

### 실제 영향

- 시퀀스 데이터를 파싱하는 클라이언트가 문서 기반으로 구현하면 전부 실패
- `_id`는 MongoDB ObjectId 형식(24자리 hex) — 나머지 API는 UUID 형식(36자리)으로 ID 포맷도 다름
- enrollment의 status/currentStepOrder가 없어 진행 상황 확인 불가

### HubSpot 비교

HubSpot은 모든 리소스에서 `id` 필드명을 일관되게 사용합니다.

### MCP에서의 우회

시퀀스 관련 도구에서 `_id`를 `id`로 재매핑하여 반환합니다.

---

## 26. 레코드 병합(Merge) API 부재

### 문제

중복 레코드를 하나로 병합하는 API가 없습니다. CRM 운영에서 중복 고객/회사 레코드는 빈번하게 발생하며, 병합은 일상적인 데이터 정리 작업입니다.

### 비즈니스 필요

- 동일 고객이 여러 경로로 유입되어 중복 레코드 생성 (웹폼, 수동 입력, CSV 임포트)
- 병합 시 활동 이력, 노트, 연관 딜 등을 보존하면서 하나로 통합해야 함
- 현재는 UI에서만 가능 — API/자동화로 대량 중복 정리 불가

### HubSpot 비교

```
HubSpot: POST /crm/v3/objects/{objectType}/merge
  body: { primaryObjectId, objectIdToMerge }
  → 두 레코드를 병합. 활동/연관 관계를 primary로 이전.
  → contacts, companies, deals, tickets 등 모든 오브젝트 지원.
```

허브스팟 공식 MCP에는 merge 도구가 아직 없지만, API는 존재합니다.

### MCP에서의 우회

우회 불가. 중복 레코드 감지는 search로 가능하지만, 병합 자체는 API가 없어 실행 불가.

---

## 요약: MCP에서 우회한 API 갭 목록

| # | API 레거시 | MCP 우회 방법 | 추가 코드량 |
|---|-----------|-------------|-----------|
| 1 | Batch CRU 없음 (Create/Read/Update) | Read만 for-loop 우회, C/U 미구현 | ~30줄 |
| 2 | fieldList 타입 키 | resolveProperties() 스키마 변환 | ~120줄 |
| 3 | Top-level 파라미터 분리 | TOP_LEVEL_ONLY 자동 추출 | ~30줄 |
| 4 | Internal name 없음 | 한글 필드명 직접 사용 | 우회 불가 |
| 5 | Search 정렬 미지원 | 클라이언트 정렬 (불완전) | ~10줄 |
| 6 | Search 빈 필터 불가 | EXISTS 더미 필터 | ~5줄 |
| 7 | Search 응답에 상세 없음 | batch-read 후속 호출 | N+1 패턴 |
| 8 | Association에 engagement 없음 | activity API 별도 래핑 | ~80줄 |
| 9 | Rate limit 미문서화 | 120ms 강제 인터벌 + 429 retry | ~20줄 |
| 10 | 이메일 본문 미제공 | description에 제한 명시 | 우회 불가 |
| 11 | 삭제 API 비표준 | 시퀀스 에러 힌트 수동 추가 | ~5줄 |
| 12 | 응답 래핑 비일관 | getOne() 분기 처리 | ~15줄 |
| 13 | 404 에러 메시지 | 커스텀 에러 래핑 | ~10줄 |
| 14 | Search 에러 힌트 없음 | errWithSchemaHint() | ~20줄 |
| 15 | 사용자/팀 이름→ID 변환 | fetchUserMap/fetchTeamMap | ~60줄 |
| 16 | 반환 필드 선택 불가 | DEFAULT_PROPERTIES(타입별 코어 필드 자동 적용) + pickProperties() 후처리 | ~45줄 |
| 17 | 노트 생성 API 제한 | 레코드 update의 memo 파라미터 우회 | 날짜/유형/담당자 지정 불가 |
| 18 | 커스텀 오브젝트 Definition 목록 없음 | — | 우회 불가 |
| 19 | Engagement 2급 구조 + API 대부분 부재 (#15 종합) | list-engagements 인라인 + create-note + read-note | sms/meeting/alimtalk 불가, 통합 CRUD 없음 |
| 20 | 리드→딜 전환 API 없음 | 도구 조합으로 수동 처리 | 이력 이전 불가 |
| 21 | 필드 스키마에 description 없음 | FIELD_HINTS 하드코딩 주입 (~44필드) | ~60줄 |
| 22 | 참조 필드가 ID만 허용 | 사용자/팀 이름→UUID 자동 변환 | ~60줄 (파이프라인은 미구현) |
| 23 | 에러 응답이 비구조화 문자열 | errWithSchemaHint() 패턴 매칭 | ~20줄 (문구 변경 시 깨짐) |
| 24 | 필드 생성·수정 API 없음 | — | 우회 불가 |
| 25 | Association 생성 API 없음 | — | 우회 불가 (레코드 생성 시에만 가능) |
| 23 | 상품 단건 조회·수정·삭제 없음 + search 미지원 | create-quote에서 productId optional 활용, 목록 조회만 가능 | 우회 불가 (대규모 카탈로그) |
| 24 | user/me와 user 목록 스키마 불일치 | user 목록에서 id 매칭으로 email 추출 | ~5줄 |
| 25 | 시퀀스 `_id` vs `id` + 필드명 전반 불일치 | `_id`→`id` 재매핑 | ~5줄 |
| 26 | 레코드 병합(Merge) API 없음 | — | 우회 불가 |

**총 우회 코드: ~555줄** (전체 MCP 서버 코드의 약 30%)

---

## 제안: 공식 MCP를 위한 API 로드맵

### 즉시 (API 변경 없이 MCP 품질 향상)

1. 조회 API에 `properties[]` 파라미터 지원 → 필요한 필드만 반환
2. Search 응답에도 `properties[]` 지원 → batch-read 후속 호출 제거
3. Search `sorts` 파라미터 실제 작동
4. Batch Read API 추가 (`POST /v2/object/{type}/batch-read`)
5. 에러 응답에 유효값 힌트 포함

### 단기 (설계 개선)

5. `properties` 기반 쓰기 (`fieldList` 타입 키 제거, 서버 타입 추론)
6. Top-level 파라미터를 properties로 통합
7. Rate limit 문서화 + retry-after 헤더
8. Engagement를 association 대상으로 포함
9. 필드 스키마에 description 필드 추가
10. 참조 필드에서 이름 문자열 허용 (서버단 이름→ID 해석)
11. 에러 응답 구조화 (category, code, context 포함)

### 중기 (기능 추가)

11. TODO/시퀀스 등록 API 정상화
12. 이메일 본문 반환
13. 커스텀 오브젝트 검색 지원 + Definition 목록 API
14. Internal field name 도입
15. Engagement 1급 오브젝트화 — 노트 전용 생성 API, 상세 조회 확대 (sms, meeting, 알림톡), 통합 CRUD (#15 종합)
16. 리드→딜 전환 API (`POST /v2/lead/{id}/convert`)
17. 필드(Property) 생성·수정 API
18. Association 생성·해제 API
21. 상품(Product) 단건 조회·수정·삭제 API 추가
22. `/v2/user/me` 응답에 email, role 추가 + status 값 형식 통일
23. 시퀀스 응답 필드 문서 일치 + `_id` → `id` 통일
24. 레코드 병합 API (`POST /v2/object/{type}/merge`)

> Engagement 1급 오브젝트화 아키텍처 방향은 #15 "Engagement 종합" 섹션 참조.
