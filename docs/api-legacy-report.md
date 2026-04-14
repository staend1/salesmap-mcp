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

## 10. 삭제 API 비표준

### 문제

삭제가 `DELETE /v2/{type}/{id}`가 아니라 `POST /v2/{type}/{id}/delete`입니다. body 형식이 문서화되어 있지 않고, 시퀀스에 등록된 레코드는 에러 메시지 없이 실패합니다.

### MCP에서의 우회

에러 메시지에 "시퀀스"가 포함되면 `시퀀스에 등록된 레코드는 삭제 불가` 힌트를 수동으로 추가합니다.

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
| 10 | 응답 래핑 비일관 | getOne() 분기 처리 | ~15줄 |
| 11 | 404 에러 메시지 | 커스텀 에러 래핑 | ~10줄 |
| 12 | Search 에러 힌트 없음 | errWithSchemaHint() | ~20줄 |
| 13 | 사용자/팀 이름→ID 변환 | fetchUserMap/fetchTeamMap | ~60줄 |

**총 우회 코드: ~400줄** (전체 MCP 서버 코드의 약 30%)

---

## 제안: 공식 MCP를 위한 API 로드맵

### 즉시 (API 변경 없이 MCP 품질 향상)

1. Search 응답에 `properties[]` 파라미터 지원 → batch-read 후속 호출 제거
2. Search `sorts` 파라미터 실제 작동
3. Batch Read API 추가 (`POST /v2/object/{type}/batch-read`)
4. 에러 응답에 유효값 힌트 포함

### 단기 (설계 개선)

5. `properties` 기반 쓰기 (`fieldList` 타입 키 제거, 서버 타입 추론)
6. Top-level 파라미터를 properties로 통합
7. Rate limit 문서화 + retry-after 헤더
8. Association에 engagement(memo, email, todo) 포함

### 중기 (기능 추가)

9. TODO/시퀀스 등록 API 정상화
10. 이메일 본문 반환
11. 커스텀 오브젝트 검색 지원
12. Internal field name 도입
