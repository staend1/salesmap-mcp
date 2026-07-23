# API 개선 우선순위 리포트

> 대상: 세일즈맵 API·백엔드 팀 / 목적: MCP(AI 연동) 관점에서 필요한 API 개선을 **우선순위와 실사용 근거**로 보고
> 원장: [salesmap-api-issues.md](salesmap-api-issues.md) — 각 항목은 원장 이슈의 기술 상세를 **그대로 담고 그 위에 로그 정량·VOC·레퍼런스로 보강한 확장본**. 원장의 축약이 아니라 원장 이상으로 자세하게 (판단에 필요한 근거를 이 문서에서 다 볼 수 있게)
> 근거 데이터: MCP 텔레메트리 (베타 워크스페이스 ~77개, 2026-06-01~07-23, 24K+ 호출)
> 최신화: 2026-07-23 / 우선순위(별점): 초안(AI) — 담당자가 항목별로 직접 확정

---

## 우선순위 표기

제목 앞 별점으로 표시한다.

| 별점 | 의미 |
|---|---|
| **★★★** | 원천 불가 — API로 아예 안 됨. 로그에서 플로우 끊김 다수 또는 고객 직접 VOC |
| **★★** | 심각한 비효율 — 가능은 하나 심각한 타격 (예: 배치 없어 느리지만 되긴 함) |
| **★** | 우회+소폭 비효율 — MCP로 우회하되 내부 비용(스키마 조회 등) 발생 |
| **(없음)** | 참고용 — 우회되고 성능 문제도 없음. 뉴버전 API 설계 시 참고 |

### 항목 템플릿 (신규 추가 시 복사)

원장과 동일한 필드 순서. 원장 기술 상세를 흡수하고 로그·레퍼런스로 보강한다.

```markdown
### ★★? 제목

**원장**: #N

**문제** — 한두 줄 요약 (핵심만)

**실제 영향** — 실제로 왜 문제인지 (메커니즘·재현·코드 예시)

**로그/VOC** — 통계 있으면 (기간 명시). 없으면 생략

**레퍼런스** — HubSpot·Salesforce 등 타 CRM은 어떤 구조인지 (원문 예시 인용)

**현재 우회와 비용** — MCP가 어떻게 우회하며 그 한계·비용은 뭔지

**API 개선안** — 어떻게 되어야 하는지 (스펙 예시까지)
```

---

## ★★★ Batch Create / Update API — 레코드 N건 일괄 생성·수정

**원장**: #1

**문제** — 생성(`POST /v2/{type}`)·수정(`POST /v2/{type}/{id}`)이 1건씩만 가능. 다건 처리 엔드포인트가 없음. (조회는 `POST /v3/object/read`로 500건 배치 해결됨)

**실제 영향** — "이 리드 20건의 담당자를 바꿔줘" = 20번의 개별 POST. AI는 툴콜을 N번 반복해야 하고, 각 응답이 컨텍스트에 쌓여 토큰을 낭비하며, 사용자는 분 단위로 대기한다. 우리 클라이언트 스로틀(120ms 간격)로 N건이 순차 직렬화되어 벽시계가 선형 증가.

**로그/VOC** — create/update 전체 2,049콜 분석 (6/1~7/23):
- **86%(1,759콜)가 "5건 이상 연속 버스트"** 안에서 발생 — 이 도구들의 실제 용도가 사실상 배치 작업임
- 최악 사례: 고객 **598명에 불리언 필드 1개** 켜기 = **598콜 연속, 19.8분** (Fast campus, 6/12). 3일 뒤 225건 `false`로 재분류 반복
- 반복 업무: 한 계정이 **7월에만 버스트 12회** (교육 프로그램 선발/참여 관리 — 매주 도는 정기 업무가 매번 수십 콜)
- 임포트: 회사 37건 연속 생성 4.6분, 실패 3건 (SK렌터카)
- 버스트 동안 우리 스로틀이 워크스페이스 rate limit(100/10초)의 **~83%를 지속 점유** → 같은 워크스페이스 동료의 AI 사용·타 연동까지 밀림

**레퍼런스 — HubSpot** (2026-07 공식 문서): create·update 모두 최대 100건, `{ inputs: [...] }`. **create는 body에 `associations` 배열을 동봉해 "생성하면서 연결"** 가능. update는 속성만 (연결 변경은 별도 association API).
```
POST /crm/v3/objects/deals/batch/create
  { inputs: [{ properties: {...}, associations: [{ to:{id}, types:[...] }] }, ...] }
POST /crm/v3/objects/deals/batch/update
  { inputs: [{ id, properties: {...} }, ...] }
```
세일즈맵은 연결이 관계 필드라, batch update가 관계 필드·top-level 연결 id를 수용하면 **HubSpot의 batch association까지 한 번에 커버**됨 (별도 association API 불필요 — 원장 #20).

**현재 우회와 비용** — 단건 도구 반복 또는 run-script 순회(50초 상한 + "전용 도구 우선" 가드레일로 쓰기엔 소극적). 근본 해결 아님.

**API 개선안** — `POST /v3/object/create`·`update`에 다건 입력(최대 100건). create는 association 동시 세팅 포함. v3 `object/create`가 전 오브젝트(딜·리드·커오) 지원되면 `salesmap-batch-create-objects` 도구로 노출. → batch 100 기준 **1,759콜 → 63콜(28배), 121분 → 1~2분**, 쿼타 점유·토큰 낭비 동시 해소.

---

## ★★★ Activity(타임라인) 배치 조회 — 레코드 N건의 활동을 한 번에

**원장**: #28

**문제** — `/v3/object/activity`가 단일 `objectId`만 받음. 여러 레코드의 타임라인을 한 번에 조회할 배치 엔드포인트가 없고, `/v3/object/read`(배치 읽기)에도 activity를 인라인할 파라미터가 없음.

**실제 영향** — N개 레코드의 활동 조회 = N회 호출. "리드 87건 각각의 팔로업 이력" 같은 분석이 87콜로 늘어짐.

**로그/VOC** — 6월 로그:
- list-engagements가 **전 도구 중 최다 호출(6,703콜)**, `engagements→engagements` 연속 전이 **6,385회** = 레코드별 순회가 구조적
- p90 **7.9초**, 5초 초과 20.9%, **429 rate limit 52건이 전부 이 도구에서 발생**

**레퍼런스 — HubSpot**: engagement(이메일·노트·미팅 등)가 독립 오브젝트라 batch/read로 다건 조회 가능. association API로 "이 딜에 연결된 이메일 전부"를 배치로 당김.

**현재 우회와 비용** — 유형 필터·유형별 limit·note.htmlBody 제거로 응답은 경량화(2026-07). 그러나 **N레코드=N콜 구조 자체는 백엔드 확인 결과 해소 불가** — activity API가 단일 objectId만 수용.

**API 개선안** — `/v3/object/read`에 activity 인라인 파라미터(예: `activityTypes: ["email","note"]` → 각 레코드에 활동 동봉), 또는 다건 objectId를 받는 배치 activity 엔드포인트. → 87콜 → 1콜, 429·지연·쿼타 점유 동시 해소.

---

## ★★ 쓰기 입력 위치 이중성 — top-level vs fieldList (+연결)

**원장**: #3

**문제** — 같은 "필드 값 쓰기"인데 값을 넣는 **위치가 3갈래**로 갈림. AI가 매 필드마다 "이건 어느 갈래인가"를 판단해야 함.

**실제 영향**:
```
POST /v2/deal
{
  "name": "딜 이름",           ← ① top-level 전용
  "price": 50000,              ← ① top-level 전용
  "pipelineId": "uuid",        ← ① top-level 전용
  "pipelineStageId": "uuid",   ← ① top-level 전용
  "status": "In progress",     ← ① top-level 전용
  "peopleId": "uuid",          ← ② 기본연결 top-level
  "organizationId": "uuid",    ← ② 기본연결 top-level
  "fieldList": [               ← ③ 나머지 + 커스텀연결
    { "name": "담당자", "userValueId": "uuid" }
  ]
}
```
연결도 같은 이중성 — 기본 연결(회사·고객)은 top-level, 커스텀 연결(관계 필드)은 fieldList. 세 종류의 실패가 실제로 발생:
1. **파이프라인/단계 이름→ID 미변환** — 담당자·팀은 `getUserMap`/`getTeamMap`으로 이름→ID 자동변환되는데 파이프라인/단계는 그런 맵이 없음. AI가 `"파이프라인": "국내영업"`(이름)을 넣으면 `"ID 형식이어야 합니다. salesmap-get-pipelines로 조회하세요"` 에러. 로그에 `[refine]: 파이프라인 값은 fieldList가 아닌 파라메터` 계열 실패 반복
2. **silent no-op (가장 위험)** — 필드를 잘못된 위치·키로 보내면 API가 거부하지 않고 **`200 OK`를 반환하면서 값만 조용히 버림**. `updatedAt`은 갱신돼 겉보기엔 성공. 실제 관찰된 케이스:
   - top-level `ownerId`(담당자) — `200`인데 미반영. 담당자는 `fieldList`의 `userValueId`로만 변경됨
   - 고객의 top-level `email`·`phone` — `200`인데 미저장. `fieldList`의 `이메일`/`전화`로만 저장됨
   - 스키마에 없는 임의 파라미터(`foobar`, `amount` 등) — 에러 없이 조용히 무시
   
   → 에러가 안 나니 AI가 "수정 완료"로 판단하고 **사용자에게 틀린 완료 보고**. 재조회로 검증 안 하면 데이터가 안 바뀐 걸 아무도 모름. 명시적 400 거부보다 나쁜 실패(조용한 데이터 유실)

**레퍼런스** — 타 CRM은 한 축으로 통일. **Salesforce**: 기본 연결(Contact의 AccountId)도 전부 필드. **HubSpot**: 기본이든 커스텀이든 전부 association 리소스. 어느 쪽이든 "같은 개념은 같은 문법". 세일즈맵만 위치별 혼합.

**현재 우회와 비용** — `TOP_LEVEL_ONLY = {"금액":"price","이름":"name","파이프라인":"pipelineId","파이프라인 단계":"pipelineStageId","상태":"status"}` 맵으로 properties의 값을 top-level로 자동 추출. 단 ① 예외를 손으로 유지하는 취약한 커버 ② 파이프라인/단계는 이름→ID를 못 해줘 커버 실패 ③ 커스텀 연결만 우회되고 **기본 연결(회사·고객)은 미적용** — AI가 여전히 top-level `organizationId`/`peopleId`를 써야 함 ④ 필드·관계·top-level이 얽혀 `resolveProperties()`가 복잡. (부분 개선 여지: `TOP_LEVEL_ONLY`에 objectType-스코프로 `"회사"→organizationId`·`"고객"→peopleId` 추가 시 기본 연결도 흡수 — 코드 십수 줄)

**API 개선안** — 뉴버전에서 top-level 파라미터·기본연결·커스텀연결을 **전부 fieldList로 통일**, 서버가 이름→타입을 스키마로 해석(아래 타입 키 항목과 한 묶음). 클라이언트는 위치·타입 구분 없이 이름-값만 전송. ※breaking change라 뉴버전에서만.

---

## ★★ 견적서 발행 API — 생성까지만 되고 발송을 못 함

**원장**: #29

**문제** — 견적서 엔드포인트가 생성(`POST /v2/quote`)·조회 2개뿐. 발행(publish)·발송·수정·삭제가 없음. 발행은 세일즈맵 GUI에서만 가능.

**실제 영향** — API로 견적서를 만들면 고객 전달용 `공유 링크`가 생성되지 않아, 이메일에 첨부할 URL 자체가 안 나옴. "AI가 견적서 만들어 고객에게 발송"이 **구조적으로 완결 불가** — 생성 후 사람이 GUI에서 발행+발송을 이어받는 반쪽 자동화.

**로그/VOC** — 실측(2026-07, 테스트 워크스페이스): API 생성 견적서 `공유 링크` = null / `isMainQuote:true`(메인 지정은 정상 작동)로 만들어도 링크 null (메인 지정과 발행은 별개) / `/quote/{id}/publish`·`/share`·`/issue` probing 전부 404 / 기존에 링크 있던 견적서는 전부 사람이 GUI에서 발행한 것 / 그 발행 링크는 인증 없이 열리는 공개 페이지(HTTP 200).

**레퍼런스** — HubSpot Quotes API: 생성 시 `hs_status`를 `APPROVED`로 두거나 전용 상태 전환으로 발행 상태를 API로 제어. 공유 URL도 응답에 포함.

**현재 우회와 비용** — 없음. 발행이 GUI 전용이라 완결 불가.

**API 개선안** — `POST /v2/quote/{id}/publish`(공유 링크 반환) 또는 생성 시 `publish: true` 옵션. → 견적 플로우(생성→발행→이메일 발송)가 API 조합으로 완결, 세일즈 핵심 시나리오 자동화 개방.

---

## ★★ 커스텀 오브젝트 검색 — 커오는 조건 검색이 안 됨

**원장**: #4-5

**문제** — `POST /v2/object/{type}/search`가 people·organization·deal·lead 4종만 지원. 커스텀 오브젝트는 조건 검색 불가.

**실제 영향** — 커오 레코드는 전량 조회 후 클라이언트에서 필터링하는 수밖에 없음. 티켓(CRM)처럼 커오를 메인 워크플로우로 쓰는 팀은 "이번 주 VOC 티켓"조차 서버 검색이 안 됨.

**로그/VOC** — 커오 활용 팀이 조건 검색 대신 run-script `getAll`로 전량 스캔하는 패턴 관찰 (티켓·Meissa 세션).

**레퍼런스** — HubSpot: 커스텀 오브젝트도 표준 오브젝트와 동일한 `/crm/v3/objects/{objectType}/search` 사용. 구분 없음.

**현재 우회와 비용** — 전량 스캔. 레코드 수백 건이면 낭비, 수천 건이면 사실상 불가.

**API 개선안** — search API의 커스텀 오브젝트 지원. → 커오 업무(티켓·계약·정산)가 기본 오브젝트와 동급으로 검색.

---

## ★★ 레코드 병합 API

**원장**: #24

**문제** — 중복 레코드를 병합(survivor로 연결 이전 + 원본 정리)하는 API가 없음.

**실제 영향** — 중복 정리는 CRM 위생의 최다 빈도 작업인데, 손으로 하려면 각 중복의 연결 고객·딜을 일일이 재연결해야 해서 사실상 불가능한 물량.

**로그/VOC** — 한 고객이 회사 중복 정리를 위해 run-script **77회, 7시간**(2026-07-06)에 걸쳐 병합 로직을 자체 조립 — `getAll`로 전체 로드 → 이름 정규화 → 연결 고객·딜을 survivor로 재연결 → `[DEL]` 마킹. 병합 API 수요가 "7시간을 갈아넣은 우회"로 증명됨.

**레퍼런스** — HubSpot: `POST /crm/v3/objects/{objectType}/merge` — `{ primaryObjectId, objectIdToMerge }`. 연결·활동이 자동으로 primary로 이전됨.

**현재 우회와 비용** — 공개 API 조합으로 가능하나 위험한 대량 쓰기를 매번 AI가 즉석 작성 — 실수 시 데이터 꼬임.

**API 개선안** — `POST /v2/object/{type}/merge`(survivor 지정 + 연결 이전). → MCP에 merge 도구로 노출, 중복 정리가 안전한 1콜.

---

## ★★ 이메일 본문 미제공 (재판단 대기)

**원장**: #9

**문제** — activity/email 응답에 제목·수신자·발송시각·오픈수 등 메타만 있고 **본문(html/text)이 없음**.

**실제 영향** — "이 고객과 주고받은 이메일 내용 요약해줘"가 불가능. 제목만으론 맥락 파악 안 됨.

**레퍼런스** — HubSpot: `GET /crm/v3/objects/emails/{id}?properties=hs_email_html,hs_email_text`로 본문 조회.

**현재 우회와 비용** — 없음. 제목·메타만으로 버팀.

**API 개선안** — activity/email 응답 또는 개별 조회에 본문 필드 추가.

---

## ★★ 필드 수정 API 부재 (재판단 대기)

**원장**: #19

**문제** — 필드 생성(`POST /v2/field/{type}`)은 되나 **수정 API가 없음**. 옵션 값 추가·라벨 변경이 UI 전용.

**실제 영향** — "기능 카테고리에 '보안' 옵션 추가해줘" 같은 스키마 관리 자동화가 차단. 타 CRM 이관 시 필드 설정 복제 불가.

**레퍼런스** — HubSpot: `hubspot-update-property`로 라벨·옵션 수정.

**현재 우회와 비용** — 없음. `list-properties`로 조회만 가능, 수정은 사용자를 UI로 안내.

**API 개선안** — `POST /v2/field/{type}/{id}`(또는 PATCH)로 옵션·라벨·설정 수정.

---

## ★ fieldList 타입 키 패턴 — 값마다 타입별 키를 골라야 함

**원장**: #2

**문제** — 필드 값을 쓸 때 타입별로 다른 값 키(`stringValue`/`numberValue`/`userValueId`…)를 15개+ 알아야 함.

**실제 영향**:
```json
// 세일즈맵: 타입마다 다른 값 키
{ "fieldList": [
    { "name": "담당자",  "userValueId": "uuid" },
    { "name": "금액",    "numberValue": 50000 },
    { "name": "이메일",  "stringValue": "a@b.com" },
    { "name": "참여자",  "userValueIdList": ["uuid1","uuid2"] },
    { "name": "소속팀",  "teamValueIdList": ["team-uuid"] }
]}
```
LLM이 필드 타입을 모르면 잘못된 키를 씀. 실사용 실패: 사용자가 `{ "부가 서비스": "A" }`로 요청 — '부가 서비스'가 복수선택(multiSelect)이라 `{ "name":"부가 서비스", "stringValueList":["A"] }`(배열)여야 함. AI는 단일 문자열로 보내고 API는 `"부가 서비스에 stringValueList가 없습니다"`로 거부.

**레퍼런스 — HubSpot** (2026-07 공식 문서 재검증): 평탄한 name→value 맵, 타입 키 없음.
```json
{ "properties": { "dealname":"New deal", "amount":"1500.00",
  "closedate":"2019-12-07T16:50:06.678Z", "hubspot_owner_id":"910901",
  "hs_buying_role":";BUDGET_HOLDER;END_USER" } }
```
서버가 이름→타입을 스키마로 해석. 타입별 부담이 "키 선택"이 아니라 **"값 표기 규칙"**(날짜=ISO 8601 또는 epoch ms, 복수선택=세미콜론 문자열)으로만 남고, 그마저 관대함 — **복수선택 필드에 단일 문자열을 보내도 400이 아니라 단일 값으로 수용**. 클라이언트(LLM)가 타입을 몰라도 대부분 통과. **API 주 소비자가 AI 에이전트가 된 시대엔 이 정도는 서버가 흡수하는 게 맞는 설계.**

**현재 우회와 비용** — `resolveProperties()`가 매번 `/v2/field/{type}`로 스키마를 조회한 뒤 타입별 값 키로 변환 (`{ "부가 서비스":"A" }` → `{ "name":"부가 서비스", "stringValueList":["A"] }`, 리스트 타입은 단일값을 배열로 자동 래핑). AI가 타입을 몰라도 자연값만 넘기게 흡수. 다만 **매 쓰기마다 스키마 조회 콜 1회 추가**, 이 흡수는 **MCP를 거칠 때만** — 공식 MCP·직접 API 사용자에겐 원래 부담이 그대로 노출. 필드 조회로 커버 가능하고 잘 동작 중이라 낮은 우선순위.

**API 개선안** — 프로퍼티 이름-값만 받고 서버가 스키마로 타입 해석 (위치 이중성 항목과 한 묶음, 뉴버전 기본 설계 원칙). → 쓰기 전 스키마 조회 제거, 타입 불일치 에러 소멸.

---

## ★ Search 응답 필드 선택

**원장**: #4-3

**문제** — search API가 `{id, name}`만 반환. 상세 필드를 보려면 batch-read를 이어서 호출해야 함.

**실제 영향** — search→batch-read **2단 호출(N+1 패턴)**이 강제됨.

**레퍼런스** — HubSpot search: 요청에 `properties: [...]`를 주면 검색 결과에 해당 필드가 바로 포함.

**현재 우회와 비용** — MCP가 search 후 batch-read를 별도 호출로 이어붙임. 왕복 1회 추가.

**API 개선안** — search에 `properties[]` 파라미터 지원 → batch-read 후속 호출 제거.

---

## (참고) 뉴버전 정리 대상 — 우회되고 성능 문제 없음

| 항목 | 원장 | 개선안 | 비고 |
|---|---|---|---|
| 노트 생성 메타 지정 | #12 | 전용 노트 생성 API (날짜·유형·담당자) | update의 memo로 생성은 됨, 메타만 미지정 |
| Association 대량 처리 전용 API | #20 | (선택) 연결만 대량 처리하는 엔드포인트 | 연결 변경은 update로 됨. batch update(#1)가 관계 필드 수용하면 자동 커버 — 별도 API 불필요할 수 있음 |
| 429 표준 헤더 | #28 부수 | `Retry-After` 헤더 | body 텍스트 파싱으로 대응 완료 |

---

## 이미 해결된 것

원장 하단 "해결됨 (메모)" 참조 — Batch Read(v3)·activity 유형별 조회·definition 목록·필드 생성·노트 목록·커오 파이프라인 등 7건 (2026-06).
