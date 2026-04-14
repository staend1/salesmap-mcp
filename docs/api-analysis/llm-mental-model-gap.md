# LLM이 세일즈맵 MCP를 헤매는 이유

> 2026-04-14 작성
> 대상 독자: 세일즈맵 API/MCP 설계에 관여하는 사람
> 핵심 질문: **"허브스팟 MCP를 잘 아는 LLM에게 세일즈맵 MCP를 줬을 때, 왜 시행착오가 생기는가?"**

---

## 배경: LLM의 멘탈 모델

Claude, GPT 등 대형 언어모델은 허브스팟 MCP를 **학습 데이터로 알고 있다.** 허브스팟은 가장 많이 사용되는 CRM MCP 서버이고, 파인튜닝 데이터에 포함되어 있을 가능성이 높다. 따라서 LLM이 CRM MCP 도구를 처음 받으면, **허브스팟에서 학습한 패턴을 기본값으로 적용한다.**

이건 세일즈맵 MCP에 큰 기회이자 함정이다.
- 기회: 허브스팟과 비슷하게 만들면, LLM이 별도 학습 없이 잘 쓴다
- 함정: 다르게 만들면, LLM이 "당연히 이렇게 되겠지"라고 가정하고 실패한다

---

## 실제 시행착오: 허브스팟 사용자가 세일즈맵을 만났을 때

### 1. "고객 정보 조회해줘"

**허브스팟에서 학습한 패턴:**
```
search-objects → batch-read-objects(properties: ["name", "email", ...])
```
허브스팟의 `batch-read`는 `properties[]`로 원하는 필드를 지정하면 상세 데이터가 온다. 1건 조회도 `batch-read`를 쓴다 — 학습된 패턴이 그렇다.

**세일즈맵에서 일어나는 일:**
- ✅ 검색은 잘 된다 (`search-objects`)
- ✅ `batch-read-objects`도 있다 — 허브스팟 패턴 그대로 동작
- ✅ `properties`로 필드 선택도 된다

여기까지는 문제없다. 허브스팟 정렬이 잘 된 부분.

---

### 2. "이 고객의 딜이랑 관련 회사도 보여줘"

**허브스팟에서 학습한 패턴:**
```
list-associations(contacts, id, deals) → batch-read(deals, [...ids])
list-associations(contacts, id, companies) → batch-read(companies, [...ids])
```
허브스팟에서 association은 단순하다. 모든 오브젝트 타입 간에 `list-associations` 하나로 관계를 조회한다. primary니 custom이니 하는 구분이 **도구 레벨에서는 없다.**

**세일즈맵에서 일어나는 일:**
- ✅ `list-associations(people, id, deal)` → 동작한다
- ✅ MCP가 내부적으로 primary + custom을 병합해서 반환한다

하지만 LLM은 여기까지 도달하지 않을 수도 있다. 왜?

**`read-object` 응답에 `_associations` 카운트가 없었다면**, LLM은 연관 레코드가 있는지조차 모른다. 허브스팟의 `read-object`도 association을 자동으로 보여주진 않지만, 허브스팟 학습 패턴에서 LLM은 "고객 조회 → 관련 딜 조회"를 자연스럽게 이어간다.

**우리의 보완:**
```json
// read-object / batch-read-objects 응답에 자동 포함
{
  "이름": "홍길동",
  "_associations": { "deal": 3, "organization": 1, "lead": 0 }
}
```
이걸 보면 LLM이 "아, 딜이 3개 있구나 → list-associations로 조회하자"로 자연스럽게 이어간다.

---

### 3. "이 고객한테 보낸 이메일이랑 메모도 보여줘" ← 여기서 헤맨다

**허브스팟에서 학습한 패턴:**
```
list-associations(contacts, id, notes) → batch-read(notes, [...ids])
list-associations(contacts, id, emails) → batch-read(emails, [...ids])
```
허브스팟에서 메모, 이메일, 미팅, TODO는 전부 **오브젝트**다. 연관관계(association) 그래프에 포함되어 있다. `list-associations`로 note ID를 가져오고, `batch-read`로 내용을 읽는다. 똑같은 패턴의 반복.

**세일즈맵에서 일어나는 일:**
```
list-associations(people, id, memo) → ❌ memo는 유효한 타입이 아님
list-associations(people, id, email) → ❌ email도 아님
```

LLM은 당황한다. "왜 안 되지?" 그리고 두 가지 중 하나를 한다:

**시나리오 A: 포기하고 다른 도구를 찾는다**
- 도구 목록을 다시 보고 `list-engagements`를 발견 → 성공
- 하지만 현대 MCP 클라이언트는 도구를 전부 로드하지 않고 **tool search**로 필요할 때 찾는다
- "engagement"라는 키워드를 떠올리지 못하면 도구를 못 찾는다

**시나리오 B: 연관관계에서 계속 시도한다**
- `read-object`로 고객 상세를 보면 `_associations`에 memo가 없다
- 그래도 허브스팟 패턴이 강하니까, activity나 timeline 관련 필드를 찾으려 한다
- 결국 실패하거나, 돌고 돌아서 `list-engagements`에 도달한다

**실제 관찰된 행동 (Claude Desktop, 2026-04-13):**
```
1. read-object(people, id) → 고객 정보 획득
2. list-associations(people, id, deal) → 딜 목록 획득  ← 여기까지 OK
3. list-associations(people, id, memo) → 실패 예상...
   → 실제로는 association이 아니라 read-object 후 memo 필드를 찾으려 함
4. 방황 끝에 list-engagements 사용 → 성공
```

하지만 더 심한 케이스도 관찰됨:
```
1. list-associations(deal, id, people) → 관련 고객 ID 획득
2. batch-read(people, [...ids]) → 고객 상세
3. 메모를 보려고... list-associations(deal, id, memo) 시도? 아님
   → 대신 association으로 memo를 찾지 못하니까
   → 고객의 "memo" 관계 필드를 찾으려 함
   → 실패 → 우회로 찾다가 결국 개별 memo API 호출 (N+1)
```

**근본 원인: 세일즈맵 API에서 memo/email/todo는 오브젝트가 아니라 "활동(activity)"이다.** Association 그래프에 포함되지 않는다. 허브스팟과 완전히 다른 설계.

---

### 4. "primary 관계? custom 관계? 그게 뭔데?"

**허브스팟의 association 모델:**
- 도구 레벨에서 primary/custom 구분 없음
- `list-associations(contacts, id, deals)` → 모든 관계가 한 번에 온다
- 내부적으로 type ID가 있지만, 사용자/LLM은 신경 쓸 필요 없음

**세일즈맵의 association 모델:**
```
GET /v2/object/{type}/{id}/association/{toType}/primary   ← 시스템 관계
GET /v2/object/{type}/{id}/association/{toType}/custom    ← 사용자 정의 관계
```
- API 레벨에서 primary와 custom이 **별도 엔드포인트**
- 응답 형식도 다름: primary는 `{associationIdList: [...]}`, custom은 `{associationItemList: [{id, label}]}`

LLM이 이걸 직접 다뤄야 했다면? 혼란의 극치.

**우리의 보완:**
```typescript
// MCP에서 자동 병합
const [primary, custom] = await Promise.all([
  client.get(basePath + "/primary"),
  client.get(basePath + "/custom"),
]);
// → 하나의 records 배열로 통합, source: "primary"|"custom" 태그
```

LLM은 `list-associations(deal, id, people)` 한 번이면 된다. primary/custom을 몰라도 된다.

---

### 5. "이 딜 금액을 50만원으로 바꿔줘"

**허브스팟에서 학습한 패턴:**
```
update-object(deals, id, properties: { "amount": 500000 })
```
허브스팟은 모든 필드를 `properties` 하나에 key-value로 넣는다. 끝.

**세일즈맵 API의 실제 구조:**
```json
POST /v2/deal/{id}
{
  "price": 500000,           // ← top-level (properties에 넣으면 에러)
  "pipelineId": "uuid",      // ← top-level
  "pipelineStageId": "uuid", // ← top-level
  "status": "In progress",   // ← top-level
  "fieldList": [              // ← 나머지는 여기
    { "name": "담당자", "userValueId": "uuid" },
    { "name": "메모", "stringValue": "..." }
  ]
}
```

LLM은 당연히 `properties: { "금액": 500000 }`으로 보낸다. 허브스팟이 그러니까. 세일즈맵 API는 이걸 거부한다.

**우리의 보완:**
```typescript
// TOP_LEVEL_ONLY 자동 추출
const TOP_LEVEL_ONLY = {
  "금액": "price",
  "이름": "name",
  "파이프라인": "pipelineId",
  "파이프라인 단계": "pipelineStageId",
  "상태": "status",
};
// properties에서 자동 감지 → top-level body로 이동
```

LLM은 허브스팟처럼 `properties: { "금액": 500000 }` 하면 된다. MCP가 알아서 변환한다.

---

### 6. "담당자를 홍길동으로 바꿔줘"

**허브스팟에서 학습한 패턴:**
```
update-object(deals, id, properties: { "hubspot_owner_id": "12345" })
```
허브스팟은 `properties`에 key-value 하나면 된다. 서버가 타입을 알아서 추론한다.

**세일즈맵 API의 실제 구조:**
```json
{
  "fieldList": [
    { "name": "담당자", "userValueId": "uuid-of-홍길동" }
  ]
}
```
- 필드 타입마다 다른 value 키: `stringValue`, `numberValue`, `booleanValue`, `dateValue`, `userValueId`, `userValueIdList`, `organizationValueId`, `peopleValueId`, `pipelineValueId`, `teamValueIdList`... **15개 이상**
- LLM이 "담당자" 필드가 `userValueId` 타입인지 알아야 한다
- 틀리면 API가 거부한다

**우리의 보완:**
```typescript
// resolveProperties: 스키마 조회 → 타입 키 자동 매핑
// LLM이 보내는 것:  { "담당자": "홍길동" }
// MCP가 변환:       { name: "담당자", userValueId: "uuid" }
// 1) /v2/field/{type} 호출 → 필드 타입 확인
// 2) 이름 문자열이면 /v2/user 검색 → UUID 변환
// 3) 올바른 value 키에 매핑
```

이 변환 레이어만 **~120줄**. API가 허브스팟처럼 key-value를 받으면 필요 없는 코드.

---

## 시행착오 요약: 허브스팟 vs 세일즈맵

| LLM이 기대하는 것 (허브스팟) | 세일즈맵에서 실제 | MCP 보완 |
|---|---|---|
| 모든 필드를 `properties`에 key-value로 | 금액·파이프라인·상태는 top-level만 가능 | TOP_LEVEL_ONLY 자동 추출 |
| `properties: { "담당자": "홍길동" }` | `fieldList: [{ name, userValueId }]` 15개+ 타입 키 | resolveProperties 스키마 자동 변환 |
| `list-associations(contact, id, notes)` | memo는 association 대상 아님 | list-engagements 별도 도구 |
| `list-associations` 한 번에 모든 관계 | primary/custom 별도 엔드포인트 | 자동 병합 |
| `batch-read`로 여러 건 한 번에 | batch API 없음 | for-loop + rate limit 처리 |
| 에러 메시지에 다음 행동 힌트 | "Invalid parameters" | errWithSchemaHint 래핑 |
| 0건이면 "결과 없음" 안내 | 빈 배열만 반환 | hint 필드 자동 추가 |

---

## 우리가 보완한 것 vs API에서 바뀌어야 하는 것

### MCP에서 보완 완료 (현재 동작 중)

| 보완 | 코드량 | 효과 |
|------|--------|------|
| properties → fieldList 타입 키 자동 변환 | ~120줄 | LLM이 key-value로 쓸 수 있음 |
| top-level 파라미터 자동 추출 | ~30줄 | 금액/파이프라인을 properties에 넣어도 동작 |
| primary + custom association 병합 | ~25줄 | 단일 도구로 모든 관계 조회 |
| batch-read 구현 (for-loop) | ~40줄 | 허브스팟 패턴 지원 |
| 사용자/팀 이름 → UUID 자동 변환 | ~35줄 | "홍길동"으로 검색/할당 가능 |
| 에러 메시지 보강 + 스키마 힌트 | ~50줄 | LLM이 스스로 복구 가능 |
| engagement 자동 인라인 (이메일 제목, 메모 본문) | ~45줄 | N+1 조회 불필요 |
| `_associations` 카운트 자동 포함 | ~40줄 | 연관 레코드 존재 신호 |
| **합계** | **~400줄** | — |

이 400줄은 **세일즈맵 API가 허브스팟처럼 동작했다면 필요 없는 코드**다.

### API 단에서 바뀌어야 하는 것

#### 즉시 (LLM 사용성에 직접적 영향)

1. **`fieldList` → `properties` (key-value)**: 서버가 필드 타입 추론. 15개 타입 키를 클라이언트가 알 필요 없게.
2. **top-level 파라미터 통합**: `price`, `pipelineId` 등을 `properties`에 넣을 수 있게.
3. **Batch Read API**: `POST /v2/{type}/batch/read` — MCP의 for-loop 제거 가능.

#### 단기 (도구 설계 개선)

4. **Association에 engagement 포함**: `list-associations(people, id, memo)` 가능하게. 또는 engagement도 오브젝트로 취급.
5. **Search 에러 메시지 개선**: "Invalid parameters" → 구체적 필드명/타입 안내.
6. **Association 엔드포인트 통합**: primary/custom 구분 없이 한 번에 반환.

#### 중기 (플랫폼 성숙)

7. **Rate limit 문서화 + Retry-After 헤더**: 클라이언트가 자체 rate limiter 없이도 동작.
8. **응답 래핑 일관성**: 단건은 객체, 목록은 배열. `getOne()` 우회 불필요.
9. **누락 API 추가**: TODO 생성, 시퀀스 등록, 이메일 본문, 리드→딜 전환.

---

## 결론

**공식 MCP를 만들려면, API가 LLM-friendly해야 한다.**

현재 세일즈맵 MCP는 API와 LLM 사이에 ~400줄의 변환 레이어를 끼워넣어 동작한다. 이건 우리가 API의 특성을 속속들이 알기 때문에 가능한 것이지, 공식 MCP를 만드는 외부 개발자나 API 자체에서 MCP를 제공할 때는 이 변환 레이어를 매번 구현할 수 없다.

허브스팟의 API가 MCP-friendly한 이유는, API 자체가 이미 단순하기 때문이다:
- key-value properties
- 단일 association 모델
- 일관된 응답 구조
- batch 연산 기본 지원

**API를 고치면 MCP 코드의 60%가 사라진다.** 그리고 공식 MCP를 만들 때, 변환 레이어 없이 API를 거의 1:1로 래핑하면 된다. 그게 LLM 시대의 API 설계다.
