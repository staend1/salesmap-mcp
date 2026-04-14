# 세일즈맵 API 레거시 리포트 — MCP 구현 관점

> 작성: 2026-04-14
> 작성자: CX팀 (MCP 서버 구현 경험 기반)
> 대상: 세일즈맵 API 팀 / 공식 MCP 서버 개발 시 참고

## 요약

세일즈맵 CRM API v2를 MCP(Model Context Protocol) 서버로 래핑하면서, AI 에이전트가 API를 사용할 때 발생하는 구조적 문제들을 발견했습니다. HubSpot 공식 MCP 서버(20개 도구)와 비교하며 정리합니다.

**핵심 메시지: 공식 MCP를 만들려면 API가 먼저 잘 되어있어야 합니다.**

MCP는 API 위에 얇은 래퍼를 씌우는 구조인데, API 설계에 문제가 있으면 MCP 레이어에서 우회 로직이 폭발적으로 늘어납니다. 현재 세일즈맵 MCP는 21개 도구 중 절반 이상에서 API 레거시를 보완하는 변환/우회 로직이 들어가 있습니다.

---

## 1. Batch Read API 부재

### 문제

세일즈맵에는 다건 조회 API가 없습니다. `GET /v2/deal/{id}`로 1건씩만 조회 가능합니다.

### 실제 영향

검색 API(`/v2/object/{type}/search`)는 `{ id, name }`만 반환합니다. 상세 필드를 보려면 검색 결과 N건에 대해 개별 GET을 N번 호출해야 합니다.

```
MCP 내부 동작:
  search → [id1, id2, id3, id4, id5]
  → GET /v2/deal/id1  (120ms 대기)
  → GET /v2/deal/id2  (120ms 대기)
  → GET /v2/deal/id3  (120ms 대기)
  → GET /v2/deal/id4  (120ms 대기)
  → GET /v2/deal/id5  (120ms 대기)
  = 최소 600ms + API 응답 시간
```

### HubSpot 비교

```
HubSpot: POST /crm/v3/objects/deals/batch/read
  → { inputs: [{id:"1"}, {id:"2"}, ...{id:"100"}], properties: ["name","amount"] }
  → 1번의 API 콜로 최대 100건 조회
```

### MCP에서의 우회

`salesmap-batch-read-objects` 도구를 만들었지만 내부적으로는 for-loop + rate limit 대기입니다. 20건 조회 시 최소 2.4초가 소요됩니다.

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

AI 에이전트가 자연스럽게 사용하려는데 존재하지 않는 API들:

| 기능 | 현재 상태 | AI 사용 시나리오 |
|------|-----------|-----------------|
| TODO 생성 | `POST /v2/todo` → 500 | "내일 이 고객에게 전화하기 등록해줘" |
| 시퀀스 등록 | `POST /v2/sequence/enrollment` → 500 | "이 고객을 콜드메일 시퀀스에 등록해줘" |
| 이메일 본문 | 응답에 body 없음 | "이 이메일 뭐라고 보냈어?" |
| SMS/미팅/카카오알림톡 상세 | 모두 404 | "최근 미팅 내용 알려줘" |
| 커스텀 오브젝트 정의 목록 | API 없음 | "어떤 커스텀 오브젝트가 있어?" |
| 리드→딜 전환 | API 없음 | "이 리드 딜로 전환해줘" |

---

## 10. 이메일 본문 미제공

### 문제

`GET /v2/email/{id}` 응답에 subject, from, to, date 등 메타데이터만 포함됩니다. body/htmlBody/content 필드가 없습니다.

### 실제 영향

이메일 조회 도구가 존재해도 실질적 가치가 없습니다. "이 고객에게 뭐라고 메일 보냈어?" → 제목만 보여줄 수 있고, 본문은 알 수 없습니다. 이메일 내용 기반 분석·요약·후속 조치 추천이 불가능합니다.

### HubSpot 비교

```
HubSpot: GET /crm/v3/objects/emails/{id}?properties=hs_email_html,hs_email_text
  → 본문 HTML/텍스트 반환. 이메일이 일반 오브젝트이므로 properties로 원하는 필드 지정 가능.
```

### MCP에서의 우회

우회 불가. `read-email` 도구 description에 `📦 본문 없음 — API 제한` 명시하여 LLM이 헛수고하지 않도록 안내합니다.

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

`pickProperties()` 함수로 API 응답 전체를 받은 후 클라이언트에서 필터링합니다. `read-object`와 `batch-read-objects` 도구에 `properties` 파라미터를 노출하지만, 실제로는 전체를 받고 잘라내는 후처리입니다. 네트워크/API 부하는 줄지 않습니다.

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

## 15. Engagement 상세 조회 API 대부분 부재

### 문제

세일즈맵의 engagement(활동) 타입은 email, memo, todo, sms, 카카오 알림톡, meeting, AI transcript 등이 있습니다. 이 중 상세 조회 API가 작동하는 것은 **email과 memo 뿐**입니다.

| Engagement 타입 | 상세 조회 API | 상태 |
|----------------|-------------|------|
| email | `GET /v2/email/{id}` | ⚠️ 동작하지만 본문 없음 (이슈 #10) |
| memo | `GET /v2/memo/{id}` | ✅ 동작 |
| todo | `GET /v2/todo/{id}` | ❌ 미확인 / 생성 API는 500 |
| sms | `GET /v2/sms/{id}` | ❌ 404 |
| 카카오 알림톡 | `GET /v2/kakao-alimtalk/{id}` | ❌ 404 |
| meeting | `GET /v2/meeting/{id}` | ❌ 404 |
| AI transcript | — | ❌ API 자체 없음 |

### 실제 영향

activity 타임라인에서 `smsId`, `meetingId`, `kakaoAlimtalkId` 등이 나오지만, 상세 내용을 조회할 방법이 없습니다. "어제 보낸 문자 내용 알려줘", "미팅 내용 정리해줘" 같은 요청에 응답 불가.

### HubSpot 비교

```
HubSpot: 모든 engagement가 오브젝트.
  GET /crm/v3/objects/meetings/{id}?properties=hs_meeting_title,hs_meeting_body
  GET /crm/v3/objects/calls/{id}?properties=hs_call_body,hs_call_duration
  GET /crm/v3/objects/tasks/{id}?properties=hs_task_body,hs_task_status
  → 모든 engagement 타입에 대해 동일한 패턴으로 상세 조회 가능
```

### MCP에서의 우회

`list-engagements` 도구에서 email 제목과 memo 본문을 자동 인라인하지만, sms/meeting/alimtalk/transcript는 ID만 반환하고 상세 내용을 붙일 수 없습니다.

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

## 요약: MCP에서 우회한 API 레거시 목록

| # | API 레거시 | MCP 우회 방법 | 추가 코드량 |
|---|-----------|-------------|-----------|
| 1 | Batch Read 없음 | for-loop + rate limit | ~30줄 |
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
| 16 | 반환 필드 선택 불가 | pickProperties() 후처리 필터링 | ~15줄 |
| 17 | 노트 생성 API 제한 | 레코드 update의 memo 파라미터 우회 | 날짜/유형/담당자 지정 불가 |
| 18 | 커스텀 오브젝트 Definition 목록 없음 | — | 우회 불가 |
| 19 | Engagement 상세 조회 대부분 404 | email/memo만 인라인 | sms/meeting/alimtalk 불가 |
| 20 | 리드→딜 전환 API 없음 | 도구 조합으로 수동 처리 | 이력 이전 불가 |

**총 우회 코드: ~400줄** (전체 MCP 서버 코드의 약 30%)

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
8. Association에 engagement(memo, email, todo) 포함

### 중기 (기능 추가)

9. TODO/시퀀스 등록 API 정상화
10. 이메일 본문 반환
11. 커스텀 오브젝트 검색 지원 + Definition 목록 API
12. Internal field name 도입
13. 노트 생성 전용 API (날짜·담당자·유형 지정 가능)
14. Engagement 상세 조회 API 확대 (sms, meeting, 알림톡, AI transcript)
15. 리드→딜 전환 API (`POST /v2/lead/{id}/convert`)
