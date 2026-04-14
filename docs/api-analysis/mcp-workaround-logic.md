# 세일즈맵 MCP — 변환/우회 로직 전체 해설

> 2026-04-14 작성
> 대상 독자: MCP 유지보수자, API 팀
> 목적: MCP 코드에 왜 이런 로직이 있는지, API가 바뀌면 어떤 코드가 사라지는지 이해

---

## 개요

세일즈맵 MCP 서버는 21개 도구를 제공하지만, 도구 핸들러 코드의 약 30%(~400줄)가 API 레거시를 우회하는 변환/보정 로직입니다. 이 문서는 각 로직이 **무엇을 하고, 왜 필요하고, API가 개선되면 어떻게 되는지**를 설명합니다.

참고: 각 로직이 대응하는 API 이슈 번호는 `docs/api-analysis/api-legacy-report.md`를 참조하세요.

---

## 1. compactRecord / compactRecords — 응답 정리

**파일**: `src/client.ts` (109~132줄)
**사용 위치**: read-object, batch-read, list-engagements, read-memo, list-changelog

### 뭘 하는가

API 응답에서 두 가지를 자동 제거합니다:

1. **null 값 필드**: 50개 필드 중 30개가 null이면, 20개만 남김
2. **파이프라인 자동생성 필드**: `"XX로 진입한 날짜"`, `"XX에서 보낸 누적 시간"`, `"XX에서 퇴장한 날짜"` 패턴

### 왜 필요한가

세일즈맵 API는 모든 필드를 항상 반환합니다. 딜 하나에 파이프라인 단계가 5개면, 단계별 진입/체류/퇴장 = 15개 필드가 추가됩니다. 대부분 null. batch-read 20건이면 300개의 null 파이프라인 필드가 LLM 컨텍스트를 차지합니다.

### API가 개선되면

`properties[]` 파라미터로 필요한 필드만 요청할 수 있게 되면, null 제거 로직과 파이프라인 필드 제거 로직 모두 불필요해집니다.

---

## 2. pickProperties — 필드 선택 후처리

**파일**: `src/client.ts` (134~146줄)
**사용 위치**: read-object, batch-read-objects

### 뭘 하는가

`properties: ["이름", "금액"]`으로 요청하면, 응답에서 해당 필드만 남깁니다. `id`와 `name`/`이름`은 항상 포함.

### 왜 필요한가

API에 `properties[]` 파라미터가 없기 때문입니다. 전체를 받고 클라이언트에서 잘라내는 후처리.

### API가 개선되면

API가 `properties[]`를 지원하면 이 함수 자체가 삭제됩니다. API 콜에 파라미터를 넘기기만 하면 됨.

---

## 3. resolveProperties — properties → fieldList 변환

**파일**: `src/client.ts` (245~352줄)
**사용 위치**: create-object, update-object, create-quote

### 뭘 하는가

LLM이 보내는 허브스팟 스타일 `{ "담당자": "홍길동", "금액": 50000 }` 입력을 세일즈맵 API가 요구하는 형식으로 변환합니다. 하나의 함수에 3가지 변환이 포함:

**a) 타입 키 자동 매핑 (이슈 #2)**

```
입력: { "담당자": "uuid" }
→ 스키마 조회: "담당자"는 user 타입
→ user → userValueId
→ 출력: { name: "담당자", userValueId: "uuid" }
```

15개 이상의 타입별 매핑 테이블 (`TYPE_TO_VALUE_KEY`):
- string → stringValue
- number → numberValue
- user → userValueId
- multiUser → userValueIdList
- pipeline → pipelineValueId
- 등등...

**b) TOP_LEVEL_ONLY 자동 추출 (이슈 #3)**

```
입력 properties: { "금액": 50000, "파이프라인": "uuid" }
→ "금액" → TOP_LEVEL_ONLY 감지 → body.price = 50000
→ "파이프라인" → body.pipelineId = "uuid"
→ fieldList에서 제거됨
```

추출 대상: 금액→price, 이름→name, 파이프라인→pipelineId, 파이프라인 단계→pipelineStageId, 상태→status

**c) 사용자 이름→UUID 자동 변환 (이슈 #18)**

```
입력: { "담당자": "홍길동" }
→ user 타입 필드인데 UUID가 아닌 문자열 감지
→ GET /v2/user → 전체 사용자 목록 → "홍길동" → "a1b2c3d4-..."
→ 출력: { name: "담당자", userValueId: "a1b2c3d4-..." }
```

### 추가 검증

- 읽기 전용 필드 (formula, multiAttachment 등) → 에러: "읽기 전용 필드라 설정할 수 없습니다"
- 존재하지 않는 필드명 → 에러: "salesmap-list-properties로 확인하세요"
- 파이프라인 ID에 이름 문자열 → 에러: "salesmap-get-pipelines로 조회하세요"

### API가 개선되면

API가 `properties` key-value를 직접 받고 서버에서 타입 추론하면, 이 ~120줄이 전부 삭제됩니다.

---

## 4. resolveFilterIds — 검색 필터 자동 변환

**파일**: `src/tools/search.ts` (43~167줄)
**사용 위치**: search-objects

### 뭘 하는가

검색 필터에서 참조 필드의 값을 자동 처리합니다.

**a) 사용자/팀 이름 → UUID 자동 변환**

```
필터: { propertyName: "담당자", operator: "EQ", value: "홍길동" }
→ 스키마 조회: "담당자"는 user 타입
→ "홍길동"은 UUID가 아님 → 사용자 목록 조회 → UUID 변환
→ API 전송: { fieldName: "담당자", operator: "EQ", value: "a1b2c3d4..." }
```

팀 필드도 동일하게 자동 변환 (`fetchTeamMap`).

**b) 파라미터 키 변환**

```
LLM 입력: propertyName (허브스팟 네이밍)
API 실제: fieldName (세일즈맵 네이밍)
→ 자동 변환
```

**c) 관계 필드 UUID 검증**

파이프라인, people, organization 등 관계 필드는 UUID만 허용. 이름 문자열이 들어오면 에러 + 힌트:
"salesmap-get-pipelines로 ID를 먼저 조회하세요"

### API가 개선되면

API가 이름 문자열을 직접 받으면, 이 ~100줄이 삭제됩니다.

---

## 5. fetchAssociationCounts — 연관 레코드 자동 카운트

**파일**: `src/tools/generic.ts` (63~92줄)
**사용 위치**: read-object, batch-read-objects

### 뭘 하는가

레코드 조회 시, 연관된 다른 오브젝트가 몇 개인지 자동으로 세서 `_associations`에 추가합니다.

```
read-object(deal, "abc") →

병렬 API 호출:
  GET /v2/object/deal/abc/association/people/primary   → 2건
  GET /v2/object/deal/abc/association/organization/primary → 1건

응답에 추가:
  _associations: { people: 2, organization: 1 }
```

타입별 조회 대상 (`ASSOCIATION_TARGETS`):
- people → deal, organization, lead
- organization → deal, people, lead
- deal → people, organization
- lead → people, organization

batch-read에서도 레코드마다 동일하게 동작 (각 레코드별 병렬).

### 왜 필요한가

LLM이 "이 딜에 연관 고객이 있나?"를 모르면 `list-associations` 도구를 안 씁니다. 카운트가 있으면 "people: 2 → 조회해보자"로 자연스럽게 이어짐.

### API가 개선되면

조회 응답에 association 카운트가 기본 포함되면, 추가 API 호출 없이 가능. 현재는 read 1건에 association 조회가 2~3건 추가 발생.

---

## 6. Association primary+custom 병합

**파일**: `src/tools/extras.ts` (160~186줄)
**사용 위치**: list-associations

### 뭘 하는가

세일즈맵의 primary/custom 별도 API를 병렬 호출해서 하나로 합칩니다.

```
GET .../association/people/primary → { associationIdList: ["id1", "id2"] }
GET .../association/people/custom  → { associationItemList: [{ id: "id3", label: "파트너" }] }

병합: [
  { id: "id1", source: "primary" },
  { id: "id2", source: "primary" },
  { id: "id3", label: "파트너", source: "custom" }
]
```

중복 ID 자동 제거 (seen Set).

### API가 개선되면

하나의 엔드포인트로 primary+custom이 합쳐져서 오면, 병합 로직 삭제.

---

## 7. Lead Time 파싱 — 파이프라인 체류 시간 구조화

**파일**: `src/tools/extras.ts` (44~111줄)
**사용 위치**: get-lead-time

### 뭘 하는가

딜/리드의 전체 필드에서 파이프라인 체류 정보를 추출하여 구조화합니다.

세일즈맵 API는 파이프라인 단계별 진입/체류/퇴장을 **개별 플랫 필드**로 반환합니다:

```
원본 (딜 레코드의 필드들):
  "미팅(신규영업)로 진입한 날짜": "2026-01-15",
  "미팅(신규영업)에서 보낸 누적 시간": 86400,
  "미팅(신규영업)에서 퇴장한 날짜": "2026-01-16",
  "제안(신규영업)로 진입한 날짜": "2026-01-16",
  "제안(신규영업)에서 보낸 누적 시간": 172800,
  ...
```

이걸 파싱 → `"단계이름(파이프라인이름)"` 패턴에서 파이프라인과 단계를 분리 → 진입시간 기준 정렬:

```json
{
  "currentStage": "제안",
  "currentPipeline": "신규영업",
  "pipelines": {
    "신규영업": [
      { "stage": "미팅", "enteredAt": "2026-01-15", "durationSeconds": 86400, "exitedAt": "2026-01-16" },
      { "stage": "제안", "enteredAt": "2026-01-16", "durationSeconds": 172800 }
    ]
  }
}
```

### 왜 필요한가

파이프라인 단계가 5개인 딜은 15개의 플랫 필드(5×3)가 생깁니다. 파이프라인이 2개면 30개. 이 필드들은 `compactRecord`에서 노이즈로 제거되기 때문에, 체류 시간 분석이 필요하면 이 전용 도구를 써야 합니다.

### API가 개선되면

파이프라인 체류 정보를 구조화된 JSON으로 반환하면 (예: `/v2/deal/{id}/pipeline-history`), 이 파싱 로직이 삭제됩니다.

---

## 8. Engagement 자동 인라인

**파일**: `src/tools/extras.ts` (436~463줄)
**사용 위치**: list-engagements

### 뭘 하는가

활동 타임라인의 각 항목에 이메일 제목과 메모 본문을 자동으로 붙여줍니다.

```
activity API 응답:
  [{ type: "emailSend", emailId: "abc" }, { type: "memoCreate", memoId: "def" }]

추가 API 호출 (캐시 적용):
  GET /v2/email/abc → subject: "미팅 일정 확인"
  GET /v2/memo/def  → text: "통화 결과: 긍정적"

최종:
  [{ type: "emailSend", emailId: "abc", emailSubject: "미팅 일정 확인" },
   { type: "memoCreate", memoId: "def", memoText: "통화 결과: 긍정적" }]
```

같은 emailId/memoId가 여러 번 나오면 캐시에서 가져옴 (Map 기반, 요청 내 중복 호출 방지).

### 왜 필요한가

activity API는 ID만 주고 내용을 주지 않습니다. LLM이 "이 고객과의 소통 내역 알려줘"라고 하면, ID 목록만 보여줘서는 의미가 없습니다.

### API가 개선되면

activity 응답에 이메일 제목/메모 본문이 포함되면 (또는 `expand=true` 파라미터), 추가 API 호출과 캐시 로직이 삭제됩니다.

---

## 9. Changelog 노이즈 필터링

**파일**: `src/tools/extras.ts` (13~31줄)
**사용 위치**: list-changelog

### 뭘 하는가

필드 변경 이력에서 의미 없는 자동계산 필드 변경을 제거합니다.

필터링 규칙 (~30개 필드):
- **정확 일치**: `"생성 날짜"`, `"수정 날짜"`, `"매출(억)"`, `"완료 TODO"`, `"미완료 TODO"`, `"전체 TODO"`, `"다음 TODO 날짜"`, `"현재 진행중인 시퀀스 여부"` 등
- **접두사**: `"최근 "` 으로 시작하는 것
- **접미사**: `"개수"`, `" 수"` 로 끝나는 것
- **파이프라인**: `"로 진입한 날짜"`, `"에서 보낸 누적 시간"`, `"에서 퇴장한 날짜"` 패턴

### 왜 필요한가

담당자가 딜 금액 하나를 바꾸면, `"총 매출"`, `"성사된 딜 개수"`, `"매출(억)"` 등 자동계산 필드도 연쇄 변경됩니다. 이 자동 변경들이 이력에 섞이면 "실제로 누가 뭘 바꿨는지" 파악이 어렵습니다.

### API가 개선되면

API가 `systemGenerated: true` 플래그를 변경 이력에 포함하거나, 필터링 파라미터를 지원하면 클라이언트 필터링이 불필요해집니다.

---

## 10. getOne — 응답 래핑 자동 언래핑

**파일**: `src/client.ts` (91~99줄)
**사용 위치**: read-object, get-lead-time, delete-object (미리보기)

### 뭘 하는가

단건 조회 응답이 타입마다 다른 래핑 구조를 가지는 것을 자동 처리합니다.

```
GET /v2/deal/{id}         → { deal: { ...레코드 } }           → data["deal"] 추출
GET /v2/organization/{id} → { organization: [{ ...레코드 }] } → data["organization"][0] 추출
GET /v2/email/{id}        → { email: { ...레코드 } }          → data["email"] 추출
```

배열이면 `[0]`을 꺼내고, 객체면 그대로 반환.

### API가 개선되면

모든 단건 조회가 동일한 응답 구조 (예: `{ data: { ... } }`)를 사용하면, 이 분기 처리가 삭제됩니다.

---

## 11. 삭제 2단계 확인 + Elicitation

**파일**: `src/tools/generic.ts` (266~342줄)
**사용 위치**: delete-object

### 뭘 하는가

삭제를 안전하게 처리하기 위한 3중 보호:

1. **confirmed=false** (기본): 삭제 대상 레코드를 미리보기로 보여줌. 실제 삭제 안 함.
2. **MCP Elicitation**: 클라이언트가 지원하면, 사용자에게 확인 폼을 띄움.
3. **description guardrail**: Elicitation 미지원 시, 도구 설명에 "반드시 사용자가 명시적으로 삭제를 요청한 경우에만 사용"을 넣어 LLM 행동을 제어.

추가: 시퀀스 등록 레코드 삭제 실패 시 "시퀀스 해제 후 재시도" 힌트 추가.

### 이건 API 이슈라기보다

LLM 안전장치. 다만 삭제 API가 `DELETE` 메서드가 아니라 `POST /v2/{type}/{id}/delete`인 비표준 구조는 이슈 #11.

---

## 12. FIELD_HINTS 주입 — injectHints

**파일**: `src/tools/field.ts` (8~85줄)
**사용 위치**: list-properties

### 뭘 하는가

`list-properties` 응답에 시스템 필드 설명을 수동 추가합니다.

```
API 응답:  { name: "마감일", type: "date" }
주입 후:   { name: "마감일", type: "date", description: "상태가 Won/Lost로 변경 시 자동 업데이트되는 종료 날짜" }
```

커버리지:
- deal: 14개 (마감일, 담당자, 팔로워, 팀, 파이프라인 등)
- lead: 12개
- people: 9개
- organization: 13개
- **합계: ~48개** 시스템 필드

커스텀 필드와 매핑 안 된 시스템 필드는 description 없음.

### API가 개선되면

API가 description 필드를 네이티브로 반환하면, `FIELD_HINTS` 상수와 `injectHints` 함수 전체가 삭제됩니다.

---

## 13. errWithSchemaHint — 에러 메시지 보강

**파일**: `src/client.ts` (368~387줄)
**사용 위치**: create-object, update-object, search-objects, create-quote

### 뭘 하는가

API 에러 문자열을 `includes()` 패턴 매칭해서 다음 행동 힌트를 붙입니다.

| 감지 패턴 | 힌트 |
|-----------|------|
| `"정의 되지 않은 값"` | salesmap-list-properties로 옵션 확인 |
| `"Invalid fieldName"` | 필드명은 한글 (예: 'name' → '이름') |
| `"relation field"` | UUID만 허용, salesmap-get-pipelines 안내 |
| `"userValueId가 없습니다"` | salesmap-list-users로 ID 확인 |
| `"fieldList이 아닌 파라메터"` | top-level price 파라미터로 전달 |
| 기타 | salesmap-list-properties로 확인 |

### API가 개선되면

API가 구조화된 에러 (category, code, context)를 반환하면, 문자열 패턴 매칭 대신 code 기반 분기가 가능. 에러 메시지 문구 변경에도 깨지지 않음.

---

## 14. 검색 0건 힌트

**파일**: `src/tools/search.ts` (223~228줄)
**사용 위치**: search-objects

### 뭘 하는가

검색 결과가 빈 배열이면 자동으로 힌트를 추가합니다.

```json
{ "objectList": [], "hint": "결과 없음 — 필터 조건이나 필드 이름(salesmap-list-properties)을 확인하세요." }
```

### 왜 필요한가

LLM이 빈 결과를 받으면 "데이터가 없다"고 판단하기 쉽습니다. 실제로는 필드명이 틀렸을 수 있는데 (한글 필드명 문제). 힌트가 있으면 LLM이 자가 교정을 시도합니다.

---

## 15. Rate Limit 글로벌 인터벌

**파일**: `src/client.ts` (8~20줄)
**사용 위치**: 모든 API 호출

### 뭘 하는가

모든 API 호출 전 최소 120ms 간격을 강제합니다. 429 응답 시 exponential backoff (1초→2초→4초, 최대 3회) 재시도.

```
lastRequestTime (모듈 레벨 변수)
→ 호출 전: 마지막 호출로부터 120ms 미경과 시 대기
→ 호출 후: lastRequestTime 갱신
→ 429 시: 2^attempt 초 대기 후 재시도
```

### API가 개선되면

Rate limit이 문서화되고 retry-after 헤더가 제공되면, 고정 인터벌 대신 동적 조절이 가능. 불필요한 대기 시간 감소.

---

## 16. validateCreate / validateIdParams — 사전 검증

**파일**: `src/tools/generic.ts` (14~44줄)
**사용 위치**: create-object, update-object

### 뭘 하는가

API 호출 전에 필수 파라미터와 ID 형식을 미리 검증합니다.

**deal 생성 시 필수:**
- pipelineId (UUID 형식)
- pipelineStageId (UUID 형식)
- status ('Won', 'Lost', 'In progress')
- peopleId 또는 organizationId 중 하나

**ID 형식 검증:**
- pipelineId, pipelineStageId, peopleId, organizationId → UUID 또는 ObjectId 형식인지 확인
- 이름 문자열이 들어오면 에러 + 해당 조회 도구 안내

### 왜 필요한가

API에 보내기 전에 잡아야 하는 에러. API 에러 메시지가 비구조화 문자열이라 (이슈 #19), API에서 돌아오는 에러보다 MCP에서 직접 만든 에러가 더 명확합니다.

---

## 17. URL 동적 생성 — get-link

**파일**: `src/tools/extras.ts` (113~144줄)
**사용 위치**: get-link

### 뭘 하는가

레코드의 CRM 웹 URL을 동적으로 생성합니다.

```
1. GET /v2/user/me → { user: { room: { id: "workspace-id" } } }
2. URL = https://salesmap.kr/{workspace-id}/{타입경로}/{레코드id}

타입→경로 매핑:
  people → "contact/people"
  organization → "organization"
  deal → "deal"
  ...
```

### 왜 필요한가

멀티테넌트라서 workspace ID가 토큰마다 다릅니다. 하드코딩 불가. 매번 `/v2/user/me`를 호출해서 workspace ID를 얻어야 합니다.

---

## 요약: API 개선 시 삭제 가능한 코드

| 로직 | 코드량 | 삭제 조건 |
|------|--------|----------|
| resolveProperties (타입 키 + top-level + 이름변환) | ~120줄 | properties key-value 지원 + 서버 타입 추론 |
| resolveFilterIds (검색 필터 변환) | ~100줄 | 이름 문자열 허용 + propertyName 통일 |
| compactRecord/compactRecords | ~30줄 | properties[] 파라미터 지원 |
| pickProperties | ~15줄 | properties[] 파라미터 지원 |
| fetchAssociationCounts | ~30줄 | 조회 응답에 association 카운트 포함 |
| Association 병합 | ~25줄 | primary/custom 통합 엔드포인트 |
| FIELD_HINTS + injectHints | ~60줄 | 필드 스키마에 description 포함 |
| errWithSchemaHint | ~20줄 | 구조화된 에러 응답 |
| Engagement 인라인 | ~30줄 | activity 응답에 내용 포함 |
| Changelog 노이즈 필터 | ~20줄 | systemGenerated 플래그 |
| getOne 래핑 분기 | ~10줄 | 응답 구조 통일 |
| Rate limit 인터벌 | ~15줄 | rate limit 문서화 + retry-after |
| Lead Time 파싱 | ~50줄 | 구조화된 파이프라인 이력 API |
| **합계** | **~525줄** | — |
