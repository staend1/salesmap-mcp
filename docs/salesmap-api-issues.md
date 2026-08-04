# 세일즈맵 API MCP Readiness 리포트

> 작성: 2026-04-14 / 최신화: 2026-08-04
> 작성자: CX팀 (MCP 서버 구현 경험 기반)
> 대상: 세일즈맵 API 팀 / 공식 MCP 서버 개발 시 참고
> 운영 방침: 본문은 **현재 없는 것만** 현재형으로 기술. 해결된 이슈는 본문에서 제거하고 문서 하단 "해결됨 (메모)"에 한 줄로만 남김.

## 요약

세일즈맵 CRM API v2를 MCP(Model Context Protocol) 서버로 래핑하면서, AI 에이전트가 API를 사용할 때 발생하는 구조적 문제들을 발견했습니다. HubSpot 공식 MCP 서버(당시 확인한 20개 도구)와 비교하며 정리합니다.

**핵심 메시지: 공식 MCP를 만들려면 API가 먼저 잘 되어있어야 합니다.**

MCP는 API 위에 얇은 래퍼를 씌우는 구조인데, API 설계에 문제가 있으면 MCP 레이어에서 우회 로직이 폭발적으로 늘어납니다. 2026-08-04 현재 세일즈맵 MCP는 29개 도구를 제공하며, 그중 절반 이상에서 API 레거시를 보완하는 변환/우회 로직이 들어가 있습니다.

이번 최신화에서는 API 실측·내부 API 계획·MCP 소스를 함께 대조했습니다. 아래 본문은 업스트림 API의 한계이고, 문서 뒤의 **MCP 코드 감사 추가 이슈**는 래퍼 자체의 결함입니다. 두 종류를 섞으면 API 팀이 고칠 문제와 MCP 팀이 즉시 고칠 문제가 흐려지므로 분리합니다.

## 우선순위 (필요성 기준)

공수는 평가하지 않고, 데이터 정확성·잘못된 완료 보고·핵심 업무 차단·실사용 빈도를 기준으로 정렬했습니다.

| 등급 | 먼저 볼 항목 | 판단 기준 |
|---|---|---|
| **T1** | #3-6~#3-10, #16, #2-3, #13 | 성공처럼 보이는 누락·오판, 핵심 타임라인·대량 수정의 구조적 차단. 즉시 사용자 피해가 있거나 피해를 발견하기 어렵다. |
| **T2** | #1-1·#1-3·#1-4·#1-5, #2-1, #3-1~#3-5·#3-9, #5·#8·#9·#2-2·#2-4·#2-5·#12·#2-6, MCP-B1~B3 | 핵심 CRM·아웃바운드·카탈로그 업무가 막히거나, 가능한 작업이 N+1·전체 스캔·추가 왕복으로 크게 느려진다. |
| **T3** | #4·#6·#7·#10·#11·#14·#15·#2-7, MCP-C1 | 현재 MCP가 대부분 흡수했거나 기능·스키마 일관성 문제다. 뉴버전 설계에는 중요하지만 즉시 데이터 손실이나 핵심 흐름 차단은 아니다. |

**T1 실행 순서:** (1) #3-10의 MCP-A1/A2 활동 누락을 먼저 막고, (2) #3-8과 #16의 날짜 계약을 통일하고, (3) #3-6·#3-7의 타임라인 정렬·페이지·배치 계약과 #2-3의 관계 배치 경로를 같이 엽니다. #13의 모든 목록에 대한 페이지 신호도 함께 보강합니다. 이 순서는 구현 난이도가 아니라 “틀린 결과를 성공으로 보고하는 위험”과 반복 사용량을 기준으로 한 것입니다.

---

## v3 이관 중 잔존 레거시 문제

이 섹션은 v3 계약에서 이미 해결됐거나 해결되는 방향이 확정됐지만, MCP가 아직 v2 경로를
호환해야 해서 남아 있는 문제를 모읍니다. 본문의 현재 API 이슈와 달리 T1/T2/T3 우선순위에는
넣지 않습니다. v2 경로가 사라지거나 v3로 이관되면 관련 MCP 변환도 함께 제거합니다.

### L-1. v2 `fieldList` 타입 키 패턴

**v3 현재 상태:** `POST /v3/object/create`는 필드명→값의 평탄한 `data` 객체를 받고,
MCP도 `properties`를 그대로 `data`로 보냅니다. v3 update 계약도 값이
`string | number | boolean | string[] | null`인 같은 `data` 구조입니다. 따라서
`userValueId`·`numberValue`·`stringValueList` 같은 타입별 `fieldList` 키를 클라이언트가
선택할 필요가 없습니다.

**잔존 범위:** 현재 `salesmap-update-object`와 `create-quote`의 v2 쓰기 경로는 여전히
`fieldList`를 사용합니다. MCP의 `resolveProperties()`는 스키마를 조회해
`{ "부가 서비스": "A" }`를 해당 타입의 값 키로 변환하고, 사용자 이름도 UUID로 해석합니다.
이 호환 변환은 v2 경로가 남아 있는 동안 유지합니다.

**제거 조건:** 해당 쓰기 경로가 v3 `data` 계약으로 이관되고, 견적서 전용 입력도 같은 수준의
평탄 계약을 갖추면 제거합니다.

### L-2. v2 Top-level 파라미터 분리

**v3 현재 상태:** v3 batch create는 시스템 필드를 포함한 필드 값을 `data`의 필드명→값으로
받습니다. v2처럼 `fieldList`와 `name`·`price`·`pipelineId`·`pipelineStageId`·`status` 같은
top-level 슬롯을 오가게 하지 않습니다.

**잔존 범위:** 현재 v2 수정 경로에서는 오브젝트별 top-level 전용 값이 남아 있습니다. 예를 들어
딜은 이름·금액·파이프라인·단계·상태를 top-level body로 보내야 하고, 다른 필드는
`fieldList`에 넣습니다. MCP는 `TOP_LEVEL_BY_TYPE`으로 알려진 표시명(`금액`, `파이프라인 단계`
등)을 API 파라미터로 자동 추출하지만, 잘못된 위치로 보내면 API가 200으로 조용히 무시하는
경우가 있어 매핑 유지가 필요합니다.

견적서 상품의 별도 top-level 계약은 일반 경로와 다르므로 #15에서 계속 다룹니다.

**제거 조건:** v2 단건 수정과 견적서 관련 쓰기 경로가 v3의 평탄한 필드 입력 계약으로 이관되면
제거합니다.

## 1. Search API 제한

### 1-1. 정렬 미지원

`sorts` 파라미터를 보내도 API가 무시합니다. 금액순 정렬, 최신순 정렬 등이 서버단에서 불가능합니다.

**MCP 우회**: 전체 결과를 가져온 후 클라이언트에서 정렬해야 해서 비용이 많이 듭니다.

### 1-2. 빈 필터 불가

`filterGroupList: []`를 보내면 에러. 전체 목록 조회가 search로 안 됩니다.

**MCP 우회**: `{ fieldName: "이름", operator: "EXISTS" }` 더미 필터를 삽입합니다.

### 1-3. 응답이 `{ id, name }`만 반환

검색 결과에 상세 필드가 없습니다. 사용자가 "금액 1억 이상인 딜"을 검색하면, 검색은 되지만 금액 값을 보려면 다시 개별 조회해야 합니다.

**HubSpot**: search 응답에 `properties[]`로 지정한 필드가 포함됩니다.

### 1-4. custom-object·상품 검색 미지원

`POST /v2/object/custom-object/search`는 `Invalid Parameters`,
`POST /v2/object/product/search`는 `400 Bad Request`를 반환합니다. 두 object type이 공통
Search API 대상에서 빠져 있습니다.

상품은 목록 API에도 이름·코드 같은 필터가 없어 특정 `productId`를 찾으려면 전체
`GET /v2/product` 목록을 cursor로 순회해야 합니다. `create-quote`의 카탈로그 연동이 특히
영향을 받습니다. custom-object도 전용 search 경로가 없어 일반 object와 같은 조건 검색을
표현할 수 없습니다.

**API 개선안:** custom-object와 product를 공통 object search dispatcher에 포함하고, 상품에는
최소한 이름·코드 exact filter를 지원합니다. 상품 수정·삭제 경로의 부재는 #2-4에서 다룹니다.

### 1-5. string 필드 다중 exact match(`IN`) 미지원

`POST /v2/object/{targetType}/search`는 string 타입 필드에 `IN` 연산자를 허용하지 않습니다.
따라서 "회사명 80개를 CRM organization과 exact match" 같은 작업을 한 번에 표현할 수 없습니다.

실제 MCP 사용 로그에서 아래 요청이 실패했습니다.

```json
{
  "fieldName": "이름",
  "operator": "IN",
  "value": ["A병원", "B의원", "C피부과"]
}
```

서버 응답은 다음 취지입니다.

```text
Invalid operator "IN" for field "이름" (type: string)
허용 연산자: EQ, NEQ, CONTAINS, NOT_CONTAINS, EXISTS, NOT_EXISTS
```

현재 서버 검증 기준 string 허용 연산자는 `EQ`, `NEQ`, `CONTAINS`, `NOT_CONTAINS`,
`EXISTS`, `NOT_EXISTS`뿐입니다.

#### 실제 영향

MCP/LLM이 합리적인 대량 이름 조회를 API로 표현하지 못해, 아래처럼 전체 organization을
페이지네이션으로 가져온 뒤 JS 메모리에서 매칭하는 위험한 우회를 수행했습니다.

```js
const all = await salesmap.getAll('/v2/organization');
const orgList = all.organizationList;
```

이후 이름 기준 `Map`을 만들어 로컬 매칭했습니다.

```js
const byName = new Map();
for (const o of orgList) {
  const n = o['이름'];
  // ...
}
```

다음 유사검색 스크립트도 동일하게 전체 organization을 가져왔습니다.

```js
const all = await salesmap.getAll('/v2/organization');
const orgs = all.organizationList.map(o => ({ id: o.id, name: o['이름'] }));
```

실측 소요 시간은 첫 전체 스캔 약 22.4초, 두 번째 약 20.3초로 120초 제한 안에는 들어왔지만,
레코드 수가 증가하면 실패·부하 위험이 큽니다.

전체 스캔 우회는 다음 문제가 있습니다.

- `/v2/organization` 전체를 끝까지 읽어야 함
- 회사가 수만~수십만 개면 MCP 서버 메모리·CPU 사용량 증가
- Salesmap API/DB에도 페이지네이션 부하 전파
- `getAll`에 max page 제한이 있으면 일부만 읽고도 성공처럼 보일 수 있음
- 여러 사용자가 동시에 실행하면 MCP가 병목 또는 DoS 지점이 될 수 있음

EQ 반복 호출 우회도 느립니다. search API가 100 request / 10s 쿼타이고 search 호출 1회가
10 request치를 소모한다면, 80개 이름을 개별 `EQ`로 찾는 데 800 request quota가 필요합니다.
현재 search API의 `filterGroup` 제한이 3개라 OR로 묶어도 약 27회 호출이 필요합니다.

#### MCP에서의 우회

현재는 전용 우회가 없습니다. LLM이 `IN` 실패 후 `CONTAINS`를 여러 번 호출하거나,
`run-script`에서 전체 목록을 가져와 메모리 매칭을 수행합니다.

MCP 레벨에서 할 수 있는 완화책:

- 큰 object 타입에 대한 무제한 `getAll('/v2/organization')` 사용 금지 또는 경고
- max page 도달 시 성공 반환 금지 (`truncated=true` 또는 error)
- 임시로 `batchSearchOrganizationsByName(names)` 같은 도구 제공

단, MCP 전용 batch lookup 도구도 내부 구현이 전체 스캔이면 안 됩니다. 반드시 서버/API/DB에서
exact lookup으로 후보만 가져와야 합니다.

#### API 개선안

string 필드에 제한된 `IN`을 지원합니다. 목적은 문자열 포함검색이 아니라 여러 문자열의
exact match입니다.

```json
{
  "fieldName": "이름",
  "operator": "IN",
  "value": ["A병원", "B의원", "C피부과"]
}
```

동작은 `이름 = A OR 이름 = B OR 이름 = C`와 같고, SQL 레벨에서는
`WHERE name IN (...)` 형태로 처리할 수 있습니다. `CONTAINS`와는 별개이며 fuzzy/partial batch 검색은
지원하지 않아도 됩니다.

제한 조건:

- string `IN`은 string 배열만 허용
- 빈 배열 불가
- 배열 길이 제한 필요 (예: 최대 100개 또는 200개)
- 중복 value는 서버에서 dedupe 가능
- 개별 문자열 길이 제한 적용
- CRM 리스트 UI에는 노출하지 않고 API/MCP 용도로만 먼저 열어도 됨

---

## 2. API 부재 — 없는 기능 모음

API 자체가 없거나 정상 동작 경로가 없어 MCP가 작업을 완료할 수 없는 항목을 모았습니다.
검색 대상 누락은 Search API 문맥을 보존하기 위해 #1-4에, activity의 목록·상세·쓰기 부재는
한곳에서 보도록 #3에 둡니다. 이 섹션에는 그 밖의 업무·스키마·카탈로그 API 부재를 모읍니다.

| 이슈 | 없는 기능 | 상세 위치 또는 MCP 영향 |
|------|-----------|-------------------------|
| #1-4 | custom-object·상품 조건 검색 | Search API 제한 섹션 |
| #3-1·#3-2·#3-4·#3-7·#3-9 | 활동 공통 CRUD·전역 발견, 이메일 분석, TODO lifecycle, activity batch, 녹음 목록/역방향 조회 | Engagement / Activity 섹션 |
| #2-1 | 이메일 템플릿·시퀀스 생성 및 등록 | 아웃바운드 자동화 전체 차단 |
| #2-2 | 필드(Property) 수정 | 옵션·라벨·설정 변경이 UI 전용 |
| #2-3 | 관계만 대량 처리하는 경로 | batch update 전까지 단건 반복 |
| #2-4 | 상품 수정·삭제 | 잘못 만든 카탈로그를 API로 정정·정리 불가 |
| #2-5 | 레코드 병합 | 중복 데이터 정리가 UI 전용 |
| #2-6 | 견적서 발행/공유 링크 생성 | 견적 자동화의 마지막 단계 차단 |
| #2-7 | 상품 구성 읽기 | 생성 결과를 API로 검증 불가 |

### 2-1. 시퀀스·아웃바운드 API 부재

CRM 업무에서 일상적으로 필요하지만 API가 없거나 작동하지 않는 기능들:

| 기능 | 현재 상태 | 비즈니스 필요 |
|------|-----------|-------------|
| 이메일 템플릿 생성 | API 없음 | 시퀀스의 재료 — 아웃바운드 자동화의 시작점 |
| 시퀀스 생성 | API 없음 | 템플릿을 엮어 캠페인 구성 |
| 시퀀스 등록 | `POST /v2/sequence/enrollment` → 500 | 신규 리드 자동 시퀀스 배정, 대량 아웃바운드 |

### 아웃바운드 자동화 플로우가 통째로 막힘

시퀀스 기반 아웃바운드는 3단계 플로우인데 **전 단계가 API 부재**입니다:

```
이메일 템플릿 생성 → 시퀀스 생성 (템플릿 조합) → 시퀀스 등록 (리드 배정)
     API 없음            API 없음                 500
```

"이 리드 20명에게 온보딩 시퀀스 돌려줘"는 등록만 있으면 되지만, "이런 내용으로 3단계 팔로업 시퀀스 만들어서 돌려줘"(AI에게 가장 자연스러운 요청)는 템플릿부터 등록까지 전부 필요. 현재는 셋 다 없어서 **아웃바운드 자동화 전체가 GUI 전용**.

> 개별 이메일·TODO·활동 상세·활동 전파는 #3 Engagement / Activity API에서 함께 다룹니다.

### 2-2. 필드(Property) 수정 API 부재

#### 문제

필드 **수정** API가 없습니다. 옵션 값 변경, 라벨 변경, 필드 설정 변경은 UI에서만 가능합니다.
(생성은 `POST /v2/field/{type}`으로 가능 — 하단 해결 메모 참조)

#### 실제 영향

- **옵션 값 관리 불가**: 선택형 필드에 옵션 추가/변경이 UI 전용 — "기능 카테고리에 '보안' 옵션 추가해줘" 불가
- **마이그레이션 제약**: 타 CRM 이관 시 기존 필드의 설정 변경을 프로그래밍적으로 못 함

#### HubSpot 비교

```text
HubSpot: list/get/create/update property를 분리해 제공
  - list: 축소 응답으로 전체 목록을 가볍게 탐색
  - get: 옵션·validation·설정 상세
  - create/update: 커스텀 필드 lifecycle
```

#### MCP에서의 우회

없음 — `list-properties`로 조회만 가능. 수정이 필요하면 사용자를 UI로 안내.

### 2-3. Association 대량 처리 전용 API 부재

#### 문제

레코드 연결 **자체는 update로 가능**합니다 (기본 연결 = top-level `peopleId`/`organizationId`,
커스텀 연결 = fieldList 관계 키). 세일즈맵은 연결을 별도 리소스가 아닌 **관계 필드**로 취급하기
때문입니다. 없는 것은 **연결만 대량으로 처리하는 전용 경로** — 현재는 단건 update를
반복해야 합니다.

#### 실제 영향

"고객 500명을 회사 A로 재연결" 같은 대량 연결 변경이 update 500회입니다. 예정된 batch
update가 v3의 `association` 객체를 그대로 수용하면 별도 association API 없이 함께 해소됩니다.

#### 세일즈맵 vs HubSpot (모델 차이)

- **HubSpot**: 연결이 독립 리소스 → 전용 association API(batch 최대 2,000쌍). update로는 연결 변경 불가
- **세일즈맵**: 연결이 관계 필드 → update로 변경 가능. 대신 "연결만" 대량 처리하는 전용 API는 없음

#### MCP에서의 우회

`list-associations`로 가능한 관계명 확인 → `update-object` properties에 관계명으로 연결 지정.
대량은 단건 반복 또는 run-script입니다. **예정된 batch update가 `association` 객체를 지원하면
별도 association API 없이 커버 가능합니다.**

### 2-4. 상품(Product) 수정·삭제 API 부재

#### 문제

상품 생성은 `POST /v3/object/create`, 상세 조회는 `POST /v3/object/read`로 가능하며 MCP도 두
경로를 사용합니다. 반면 수정과 삭제에는 MCP가 사용할 수 있는 API가 없습니다.

```text
POST /v3/object/create  (product) → 가능
POST /v3/object/read    (product) → 가능
POST /v3/object/update  (product) → 지원하지 않는 오브젝트 유형
삭제 경로                         → v2·v3 모두 MCP 사용 가능 경로 없음
```

2026-07-31에 열린 `POST /v3/object/update`는 회사·고객만 지원합니다(백엔드 코드 실측:
`updateObjectListForApiFunc`에서 Organization·People 외는 `지원하지 않는 오브젝트 유형입니다`).
v2에도 상품 수정·삭제 경로가 없으므로, **만들고 읽을 수는 있지만 고치거나 지울 수 없습니다.**
상품 이름·코드로 ID를 찾는 검색/필터 문제는 #1-4에서 다룹니다.

#### 실제 영향

- 상품명·가격 수정 불가 — 잘못 생성하면 UI에서만 수정 가능
- 테스트용 상품 삭제 불가
- 카탈로그를 대량 생성한 뒤 정정·정리하는 자동화가 불가

#### HubSpot 비교

HubSpot은 Product/Line Item lifecycle에 create·read·update·delete 경로를 제공합니다.

#### MCP에서의 우회

MCP는 `salesmap-batch-create-objects`와 `salesmap-batch-read-objects`로 생성·조회만 처리합니다.
수정·삭제는 UI에서 해야 합니다. `create-quote`는 카탈로그 연동 없이 `name` + `price`로 항목을
만들 수 있지만, 이미 만든 카탈로그 상품을 정정하지는 못합니다.

### 2-5. 레코드 병합(Merge) API 부재

#### 문제

중복 레코드를 하나로 병합하는 API가 없습니다. CRM 운영에서 중복 고객/회사 레코드는 빈번하게
발생하며, 병합은 일상적인 데이터 정리 작업입니다.

#### 비즈니스 필요

- 동일 고객이 여러 경로로 유입되어 중복 레코드 생성 (웹폼, 수동 입력, CSV 임포트)
- 병합 시 활동 이력, 노트, 연관 딜 등을 보존하면서 하나로 통합해야 함
- 현재는 UI에서만 가능 — API/자동화로 대량 중복 정리 불가

#### HubSpot 비교

```text
HubSpot: POST /crm/v3/objects/{objectType}/merge
  body: { primaryObjectId, objectIdToMerge }
  → 두 레코드를 병합하고 활동/연관 관계를 primary로 이전.
```

허브스팟 공식 MCP에는 merge 도구가 아직 없지만, API는 존재합니다.

#### MCP에서의 우회

우회 불가. 중복 레코드 감지는 search로 가능하지만, 병합 자체는 API가 없어 실행 불가.

### 2-6. 견적서 발행(공유 링크 생성) API 부재 — 견적 자동화의 최종 장벽

#### 문제

견적서 관련 엔드포인트는 3개뿐이다 (2026-07 라이브 OpenAPI + 테스트 워크스페이스 실측):
- `POST /v2/quote` — 생성
- `GET /v2/deal/{id}/quote`, `GET /v2/lead/{id}/quote` — 딜/리드별 조회

**발행(publish)·발송·수정·삭제 엔드포인트가 없다.** 발행은 세일즈맵 GUI에서 사람이 눌러야만
일어나는 액션이며, 그 순간에 `공유 링크`(고객 전달용 공개 URL)가 생성된다.

#### 실제 영향 (실측)

견적서 조회 응답에 `공유 링크` 필드가 있어 "생성 → 링크 획득 → 이메일 발송(`POST /v2/email`)"으로
자동화가 이어질 것처럼 보이지만, 실측 결과:

| 검증 | 결과 |
|---|---|
| API로 생성한 견적서의 `공유 링크` | **null** |
| `isMainQuote: true` | 메인 견적서로 지정되지만 공유 링크는 여전히 **null** |
| 미문서 경로 probing (`/quote/{id}/publish`·`/share`·`/issue`) | 전부 **404** |
| 기존에 링크가 있던 견적서 | 사람이 GUI에서 발행한 메인 견적서 |

즉 **API/MCP로는 생성까지만 되고, 발행(공유 링크 발급)이 불가**해서 이메일에 첨부할 URL 자체가
안 나옵니다. "AI가 견적서 만들어 바로 고객에게 발송"은 생성까지만 자동화되고, 발행+발송은
사람이 GUI에서 마무리해야 합니다.

#### 백엔드 제안

1. **견적서 발행 API** (예: `POST /v2/quote/{id}/publish` → 공유 링크 반환)
2. 또는 생성 시 발행 옵션 (`POST /v2/quote`에 `publish: true` → 응답에 공유 링크 포함)
3. (부수) 견적서 수정·삭제 API

### 2-7. 상품 구성(productElementList) 읽기 API 부재

#### 문제

`POST /v3/object/create`가 `productElementList`(상품의 하위 상품 묶음)를 지원하지만,
**만든 구성을 다시 읽을 방법이 없습니다.** `GET /v2/product` 응답에 구성 상품이 없습니다.

#### MCP에서의 결정

**지원하지 않기로 결정했습니다.** 구성 상품은 상품의 하위 상품 묶음을 의미하는데,
역으로 읽는 방법이 없어 AI가 생성 결과를 검증할 수 없습니다.

#### API 개선안

상품 조회 응답에 `productElementList`를 포함하는 읽기 경로를 제공합니다.

---

## 3. Engagement / Activity API — 목록·상세·쓰기·타임라인을 한곳에

> 범위: 노트, 이메일, TODO, SMS, 미팅, 카카오 알림톡, 녹음/AI transcript와 이들을 보여주는
> activity 타임라인. 활동과 직접 무관한 시퀀스·템플릿 API는 #2-1에 남깁니다.
> `3-1~3-5`는 타입·발견·쓰기·전파, `3-6~3-10`은 타임라인 완전성·확장성·MCP 정확성입니다.

### 3-1. 타입별 API 표면이 분절됨

세일즈맵의 engagement는 일관된 CRM object 계약으로 노출되지 않습니다. 기본 접근은 특정
레코드의 activity 타임라인이며, 공통 search/association/batch-read·CRUD 대상이 아닙니다.
노트만 `GET /v2/memo`라는 독립 목록을 가진 부분적 예외입니다.

| Engagement 타입 | 독립 목록/역방향 조회 | 상세 조회 | 쓰기 | 주요 제약 |
|----------------|:-------------------:|:---------:|:----:|----------|
| memo (노트) | ✅ `GET /v2/memo` (날짜·작성자·유형·연결 레코드 필터) | ✅ `GET /v2/memo/{id}` | ⚠️ 레코드 update의 `memo` 파라미터로만 생성 | 날짜/담당자/유형 지정 불가, 수정·삭제 불가 |
| email | ❌ 알려진 레코드의 activity에서만 발견 | ✅ `GET /v2/email/{id}` | 외부 발송만 가능 | 전역 목록·open/click 고객 집계 없음 |
| todo | ❌ | ❌ 미확인 | ❌ `POST /v2/todo` → 500 | 수정·삭제도 불가 |
| sms | ❌ | ❌ 404 | — | |
| 카카오 알림톡 | ❌ | ❌ 404 | — | |
| meeting | ❌ | ❌ 404 | — | |
| AI transcript | ❌ | ✅ `GET /v2/recording/{id}/transcript` | — | 목록·역방향 조회와 응답 상한이 없음 |

- activity 타임라인에서 `smsId` 등이 나와도 상세 내용 조회 경로가 없습니다.
- **meeting·카카오 알림톡은 id조차 없습니다** (2026-07-31 실측). 기본 오브젝트 4종의 activity
  응답에는 `meetingId`·`kakaoAlimtalkId`가 없어, 타임라인에 보여도 무엇에 대한 활동인지 열 수
  없습니다. 커스텀 오브젝트 응답에만 해당 필드가 존재합니다.

### HubSpot 비교 (공식 문서 재검증: 2026-08-04)

현재 HubSpot의 기준은 예전 단일 `engagements/v1`가 아니라 CRM object API입니다. calls
(`0-48`), communications (`0-18`), emails (`0-49`), meetings (`0-47`), notes (`0-46`),
postal mail (`0-116`), tasks (`0-27`)는 각각 자체 object type과 record ID를 가진 activity입니다.
공통 object API는 단건·전역 목록·batch read와 생성/수정/삭제를 같은 자원 계열에서 제공합니다.

| 능력 | HubSpot 현재 | 세일즈맵 현재 |
|---|---|---|
| 독립 발견 | `GET /crm/objects/2026-03/{objectTypeId}`로 activity 타입별 전역 목록 | 노트만 독립 목록, 나머지는 특정 레코드 activity에서 발견 |
| 단건/배치 | `GET /crm/objects/2026-03/{objectTypeId}/{id}`, `POST .../batch/read` | 타입별 detail API가 일부만 존재, 통합 batch read 없음 |
| 쓰기 | 공통 `properties` + `associations` 계약으로 create/update/delete | 노트도 레코드 update 우회이며, 다수 타입은 쓰기 경로 없음 |
| 관계 | association API 하나의 자원 계열에서 primary·unlabeled·custom label을 함께 다룸 | engagement 다수는 관계 그래프 밖 |
| 검색 | 공식 Search CRM 문서에 calls·emails·meetings·notes·tasks의 `/search`가 명시됨 | 전역 activity 검색 없음 |

`communications`와 postal mail도 CRM object type이지만, 현재 Search CRM 안내에서 검색 endpoint가
명시된 것은 위 다섯 타입뿐입니다. 카카오 알림톡·녹음·AI transcript는 현재 HubSpot 표준 CRM
activity object 목록에 동일한 타입으로 열거되어 있지 않습니다. 즉 이 표는 "모든 상호작용이
완전히 같은 기능"이라는 뜻이 아니라, 이메일 같은 핵심 활동이 **독립 object collection**으로
존재한다는 대비입니다.

참조: [HubSpot CRM object 개요](https://developers.hubspot.com/docs/api-reference/latest/crm/understanding-the-crm),
[Object API](https://developers.hubspot.com/docs/api-reference/latest/crm/using-object-apis),
[Email activity API](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/emails/guide),
[Search CRM](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm),
[Association schema](https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associations-schema/guide).

### 9-2. 이메일 전역 목록·이벤트 분석 API 부재

`GET /v2/email/{emailId}`는 이미 알고 있는 이메일 한 건만 읽습니다. `GET /v2/email` 같은
전역 목록·검색 API가 없습니다. `emailId`는 특정 레코드의 activity 타임라인이나 직접 발송 응답에서만
알 수 있고, MCP의 `salesmap-list-engagements`도 `objectId`를 필수로 받는 레코드 관점 API입니다.

따라서 "이번 주 주고받은 메일 전부"는 후보 레코드를 전부 열거한 뒤 각 activity를 순회해야
합니다. 특히 아래 질문에는 `emailOpen`·`emailLinkClick`을 기간별 고객으로 집계하는 전역 조회가
필요합니다.

> 최근 이메일 오픈/클릭을 많이 한 고객 중 연락할 만한 고객은?

현재 API로는 고객 전체를 읽어 각 고객의 activity를 N회 호출하고 MCP 메모리에서 합산해야 합니다.
규모가 커지면 느리고, 딜·리드 등에 연결된 활동을 어떤 기준으로 고객에게 귀속할지도 호출자가
결정해야 합니다. 이메일 detail에는 첨부 유무·파일명·크기 같은 첨부 메타도 없습니다(실측 확인).

**API 개선안:**

1. `GET /v2/email`에 기간·방향·상대/연결 레코드 필터와 이메일 id·시각·참여자·연결 레코드,
   open/click 요약을 제공합니다.
2. 또는 `POST /v3/activity/search`가 `types: ["emailOpen", "emailLinkClick"]`, 기간,
   연결 오브젝트 필터, `groupBy: "people"`를 받아 고객별 집계를 반환합니다.

2번은 전체 CRM object 모델을 즉시 도입하지 않아도 이메일 분석 요구를 해결하는 작은 계약입니다.
HubSpot도 이메일 전역 목록/검색이라는 출발점은 제공하지만, 고객별 open/click 순위에는 실제로
filter/sort 가능한 tracking property 또는 별도 분석 API가 필요합니다.

### 9-3. 노트 lifecycle과 응답 형식

노트는 두 접근 경로가 있습니다.

- **전역/관계별 목록:** `GET /v2/memo`가 날짜·작성자·유형과 `peopleId`/`organizationId`/
  `dealId`/`leadId` 필터를 받습니다.
- **레코드별 타임라인:** `GET /v2/{type}/activity` 또는 v3 activity에서 다른 활동과 함께 봅니다.

따라서 노트는 독립 목록 인덱스가 있는 부분적 예외일 뿐, 완전한 1급 object는 아닙니다. 전용 생성
API도 없습니다. 레코드 수정 API의 `memo` 파라미터에 텍스트를 넣어 자동 생성해야 합니다.

```json
POST /v2/deal/{id}
{ "memo": "미팅 내용 정리" }
```

이 방식은 날짜·유형·담당자를 지정할 수 없고, 항상 현재 시각과 API 토큰 소유자로 기록됩니다.
과거 활동 이관, 태그 지정, 타인 작성 기록, 수정·삭제가 모두 막힙니다. MCP의
`salesmap-create-note`도 이 update 호출을 감싼 제한적 우회입니다.

노트 detail은 일반 v3 read 형식과도 다릅니다. 일반 레코드는
`objectList[].{ id, data, association }`이지만, `salesmap-read-engagement(type: "note")`는
`GET /v2/memo/{id}`의 `memo` 객체(`text`, `htmlBody`, `typeList`, 연결 ID 등)를 그대로 반환합니다.
이는 실제 사용 중인 활동 전용 v2 호환 형식입니다.

HubSpot은 `POST /crm/objects/2026-03/0-46`에서 `hs_note_body`, `hs_timestamp`,
`hubspot_owner_id`, `associations`를 함께 지정하므로 날짜·담당자·연관 레코드를 제어할 수 있습니다.

### 9-4. TODO 생성·수정·삭제 경로 부재

`POST /v2/todo`가 500을 반환합니다. 미팅 후 후속 조치 등록이나 팀원 업무 할당을 API로 수행할 수
없고, detail/수정/삭제 경로도 확인되지 않았습니다. 이는 #8의 시퀀스·템플릿 부재와 별개로,
개별 CRM 활동을 기록하는 기본 업무가 막힌 문제입니다.

### 9-5. 리드/딜 생성 시 연결 고객 activity 전파를 제어할 수 없음

UI에서 리드/딜을 만들며 고객을 연결하면, 고객의 활동 내역을 리드/딜 타임라인에 함께 보일지와
범위(전체·최근 30일·지정일 이후)를 정할 수 있습니다. 이 전파는 **생성 시 고객 활동에만**
적용됩니다. 그러나 `POST /v2/lead`·`POST /v2/deal`은 `peopleId` 연결만 받고 이 옵션은 받지
않습니다.

따라서 UI로 만든 리드/딜과 API로 만든 리드/딜의 타임라인이 달라지고, "이 리드에 고객의 최근
이메일 히스토리도 연결"이라는 의도를 API로 표현할 수 없습니다. MCP 우회도 불가합니다.

세일즈맵·HubSpot 모두 활동은 association을 통해 연결 레코드 타임라인에 표시됩니다. 차이는
세일즈맵 UI에만 연결 시점의 기간 범위 제어가 있다는 점입니다. `POST /v2/lead`·`POST /v2/deal`에
아래처럼 고객 활동 전파 옵션을 추가해야 합니다.

```json
{
  "name": "...", "peopleId": "...",
  "linkPeopleActivity": true,
  "activityRange": "ALL" | "LAST_30_DAYS" | { "from": "2026-01-01" }
}
```

### 9-6. 타임라인 페이지·정렬·최근 N건 계약 부재 ★★★

`GET /v2/{object}/activity`는 오래된 순으로 고정되고 한 페이지가 50건으로 고정됩니다.
`limit` 파라미터를 받아도 조용히 무시합니다. "이 고객 최근 활동"을 찾으려면 전체 커서를 끝까지
따라가거나 날짜를 추측해 범위를 좁혀야 하며, 호출 횟수와 결과 완전성을 미리 알 수 없습니다.

activity 응답은 `nextCursor`를 주지만 `total`/`hasMore`/정렬/서버 page size 계약이 없습니다.
MCP는 모든 목록에 `nextCursor`가 있으면 다음 `after` 호출을 안내하는 힌트를 붙이지만, 정확한
건수는 알 수 없습니다. API는 최소 `hasMore` 또는 `total`, `order`(기본 최신순), `size`를 제공해야
합니다. `GET /v2/{object}/search`의 정렬 미작동은 별도 Search API 문제로 #4-1에서 다룹니다.

### 9-7. Activity 배치 조회 부재

`/v3/object/activity`는 단일 `objectId`만 받고, `/v3/object/read`도 activity 인라인 파라미터가
없습니다. N개 레코드의 활동을 분석하려면 N회 호출해야 합니다. 텔레메트리(2026-06)에서
`list-engagements`는 6,703회로 최다 호출이었고, 연속 호출은 6,385회였습니다. p90은 7.9초,
20.9%가 5초를 넘었습니다.

MCP는 `limit` 노출, `note.htmlBody` 제거, 429 본문 기반 대기, `run-script` 서버측 순회로만
완화합니다. 근본적으로는 `/v3/object/read`에 `activityTypes: ["email", "note"]` 인라인을
추가하거나 여러 `objectId`를 받는 batch activity endpoint가 필요합니다.

### 9-8. 노트/activity 날짜 경계 불일치 ★★★

date-only 범위에서 `GET /v2/{object}/activity`는 KST 달력일을 쓰지만 `GET /v2/memo`만 UTC로
해석합니다. `endDate=D`가 `D T00:00:00Z`까지가 되어 종료일 당일 노트가 전부 빠집니다.

```text
노트 createdAt = 2026-07-31T04:27:55Z  (KST 13:27)
GET /v2/memo?startDate=2026-07-31  →  1건
GET /v2/memo?endDate=2026-07-31    →  0건  # 당일 누락
```

텔레메트리에서 `list-notes` 358회 중 날짜 필터 29회, `endDate` 사용 22회가 모두 종료일 당일을
누락했습니다. 200으로 성공해 사용자와 로그가 누락을 알아채기 어렵습니다. MCP는 endDate를
다음 날 또는 오프셋 포함 date-time으로 보정하지만, API가 memo도 activity와 같은 KST day-bound로
통일해야 합니다. 일반 v3 `dateTime` 필드의 date-only 저장 문제는 활동 고유 문제가 아니므로 #32에
남깁니다.

### 9-9. 녹음/AI transcript 목록·역방향 조회·응답 상한 부재

`GET /v2/recording/{id}`와 `/transcript`가 생겨 녹취 detail은 읽을 수 있지만, `recordingId`를
얻는 경로가 activity뿐입니다. "이번 주 녹음 전부 요약"은 레코드를 하나씩 돌며 activity를
뒤져야 합니다.

detail 응답에도 연결 레코드가 없어서 `recordingId`만 있으면 어느 딜·리드·고객·회사 것인지
역추적할 수 없습니다. transcript에는 상한·페이지네이션도 없습니다. 실측으로 59분 회의가
404 세그먼트, 85KB, 20,687자였고 3시간 회의는 약 250KB가 될 수 있습니다.

필요한 계약은 `GET /v2/recording`의 기간·담당자 필터, detail의 연결 레코드 ID, transcript의
`fromMs`/`toMs` 구간 조회 또는 페이지네이션입니다.

### 9-10. MCP activity 래퍼의 T1 정확성 위험

**MCP-A1 — custom-object activity 키:** `listActivityV2`가 `custom-object`를 그대로
`${objectType}Id`/`${objectType}ActivityList`에 조합해 `custom-objectId`와
`custom-objectActivityList`를 만듭니다. 저장된 API reference의 실제 계약은
`customObjectId`/`customObjectActivityList`입니다. 빈 결과를 성공으로 반환하거나 검증 오류가
날 수 있으므로 실제 워크스페이스에서 요청·응답을 확인해 키와 입력 계약을 고정해야 합니다.

**MCP-A2 — `limit`과 cursor:** v2 activity가 50건을 준 뒤 MCP가 `raw.slice(0, limit)`로 앞부분만
반환하면서 원래 `nextCursor`를 유지합니다. `limit=10` 뒤 그 cursor를 쓰면 같은 서버 페이지의
나머지 40건을 건너뜁니다. 전체 페이지 반환, 서버 페이지 내부 offset 보존, 잘라낸 응답의 cursor
제거 중 하나가 필요합니다. 두 항목 모두 **T1**이며, 활동 누락을 성공처럼 보고할 수 있습니다.

### 현재 MCP 우회와 장기 방향

- `list-notes`: 노트의 전역/관계별 목록
- `list-engagements`: 레코드별 타임라인과 email 제목/memo 본문 인라인
- `create-note`: 레코드 update의 `memo` 우회
- `read-engagement`: email·note·recording 단건 detail 통합

단기적으로는 노트처럼 전역 activity 목록/검색·집계 경로를 제공해 CRM 전체 분석을 가능하게 해야
합니다. 장기적으로는 각 engagement에 독립 object identity와 공통 search/association/batch-read·CRUD
계약을 제공합니다. 하나의 거대한 engagement 테이블을 뜻하는 것이 아니라, HubSpot처럼 타입별
object가 공통 자원 계열을 공유하는 형태면 충분합니다.

---

## 10. 삭제 API 비표준

### 문제

삭제가 `DELETE /v2/{type}/{id}`가 아니라 `POST /v2/{type}/{id}/delete`입니다. body 형식이 문서화되어 있지 않고, 시퀀스에 등록된 레코드는 에러 메시지 없이 실패합니다.

### MCP에서의 우회

에러 메시지에 "시퀀스"가 포함되면 `시퀀스에 등록된 레코드는 삭제 불가` 힌트를 수동으로 추가합니다.

---

## 11. 조회 시 반환 필드 선택 불가

### 문제

v2 단건 조회는 원하는 필드만 지정하여 받는 기능이 없습니다. 반면 `POST /v3/object/read`는 `fieldList`를 지원하므로, 현재 문제는 v2 레거시와 MCP가 어느 경로에서 projection을 적용하느냐로 나뉩니다.

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

**1. DEFAULT_PROPERTIES** (2026-04-16 추가): 원래 v2 fallback 경로의 `batch-read-objects`에서 `properties`를 명시하지 않으면 타입별 코어 필드만 반환하도록 만들었습니다. 그러나 **현재 `V3_OBJECT_READ = true`인 기본 경로에서는 `fieldList`를 명시했을 때만 v3에 전달하고, 생략하면 전체 필드를 요청합니다.** 따라서 README·architecture의 "미지정 시 코어 필드" 설명과 실제 기본 경로가 어긋납니다. 커스텀 오브젝트 이름 필드 휴리스틱도 v2 fallback에만 남아 있습니다.

**2. pickProperties()**: `properties`를 명시한 경우, 전체 API 응답을 받은 후 해당 필드만 클라이언트에서 잘라냅니다. 네트워크/API 부하는 줄지 않습니다.

v3 read가 이미 `fieldList`를 지원하므로, 이 문제의 API 측 해결은 v2 단건·목록에도 동일한 projection 계약을 제공하는 것이고, MCP 측에서는 v3 기본 경로에 코어 필드 정책을 적용할지 문서와 함께 결정해야 합니다.

---

## 13-b. 커스텀 오브젝트 '이름 필드'를 식별할 수단이 없음

### 문제

레코드를 `properties` 필터 없이 조회하면 **기본 필드만** 반환하는 게 토큰 효율상 바람직합니다(HubSpot 방식, 이슈 #11). 이때 최소한 **"이름 역할 필드"**는 기본에 포함해야 하는데 —

- **빌트인 오브젝트**: 이름 필드가 항상 `이름`으로 고정 → 그대로 내려주면 됨
- **커스텀 오브젝트**: 이름 필드 **라벨이 definition마다 제각각**(`계약이름`, `프로젝트명`, …). 게다가 **이름 필드를 지목하는 안정적 식별자가 없음** — internal name이 `name`으로 고정돼 있다면 그걸 쓰면 되지만, 그런 게 없습니다.

→ 어쩔 수 없이 MCP가 **휴리스틱으로 추론**합니다(`type:string + required:true + name≠RecordId`). 게다가 `GET /v2/field/custom-object`가 **모든 definition 필드를 구분 없이** 반환해서, 이 추론이 definition 경계를 넘어 오염됩니다.

### 실제 영향

`getDefaultProperties()`가 위 추론으로 이름 필드를 찾는데, 커오가 2개 이상이면 각 definition의 이름 필드가 모두 섞입니다.

```typescript
// client.ts의 현재 구현
const schema = await client.get("/v2/field/custom-object");
const nameFields = schema.fieldList
  .filter(f => f.type === "string" && f.required && f.name !== "RecordId")
  .map(f => f.name);
```

커스텀 오브젝트가 2개 이상이고 각 definition에 `required: true` string 필드가 있으면 모두 nameFields에 포함됩니다.

```
커스텀 오브젝트 A (계약): required string → "계약이름"
커스텀 오브젝트 B (프로젝트): required string → "프로젝트명"

→ getDefaultProperties() 반환: ["계약이름", "프로젝트명", "담당자", "팀", ...]
→ 커스텀 오브젝트 B 레코드를 batch-read하면 "계약이름" 필드도 기본 반환 목록에 포함
→ 해당 레코드에 없는 필드라 null로 채워지거나 응답이 오염됨
```

### MCP에서의 우회

현재 미해결. Definition이 1개인 워크스페이스에서는 문제없지만, 2개 이상이면 기본 반환 필드가 오염됩니다. `properties`를 명시적으로 지정하면 우회 가능하지만 LLM이 이를 알아야 하는 부담이 생깁니다.

### 해결 방향 (둘 중 하나)

1. **(근본) 이름 필드 식별자 제공** — 스키마가 이름 필드를 명시적으로 지목(internal name을 `name`으로 고정, 또는 `isNameField`/primary 플래그). 있으면 **추론 자체가 불필요**해지고 definition 오염도 동시에 사라집니다.
2. **(차선) definition 단위 필드 조회** — `GET /v2/field/custom-object?definitionId={id}` (또는 `/{definitionId}`). 추론은 유지하되 definition별로 스코프 → 오염만 제거. 1번이 어려울 때의 대안.

---

## 16. 필드 스키마에 description 없음

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

## 17. 참조 필드가 ID만 허용 (이름→ID 변환 없음)

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

**파이프라인/단계**: 표면마다 다릅니다. `search-objects`는 목록을 조회해 이름→ID 자동 변환하지만, v2 `update-object`는 여전히 ID만 검증하고, v3 `batch-create-objects`는 단계 이름을 받습니다. 따라서 같은 `properties["파이프라인 단계"]`라도 검색·수정·생성에서 값 계약이 다릅니다.

**동명이인 위험**: 현재 MCP의 `fetchUserMap()`·`fetchTeamMap()`은 `name → id` 단일 `Map`으로 만들며 같은 이름이 있으면 마지막 항목이 조용히 앞 항목을 덮습니다. 동명이인 사용자/팀이 있는 워크스페이스에서 이름 기반 쓰기가 잘못된 대상에 적용될 수 있으므로, 중복 이름을 오류로 돌리거나 ID를 요구해야 합니다. 실제 중복 워크스페이스 재현은 별도 확인이 필요합니다.

---

## 18. 에러 응답이 비구조화 문자열

### 문제

v2의 대다수 에러는 `reason` 문자열 하나로 반환됩니다. 다만 2026-07 이후 v3 batch API, 특히 update의 일부 검증/부분 성공 응답은 `errors[]`에 code·inputIndex·fieldName·context를 담을 수 있습니다. 즉 전부 비구조화라고 쓰면 최신 경로를 놓칩니다.

> **참고 (2026-06)**: 전부 비구조화는 아님 — **유니크 중복 에러는 `data: {id, name}`(충돌한 기존 레코드)** 를 함께 반환하고, status enum 위반은 허용값(Won/Lost/In progress)을 나열함. MCP는 중복 에러의 `data`를 보존해 힌트에 기존 레코드 id를 노출(검색 없이 update 유도). 다만 대다수 에러는 여전히 `reason` 문자열뿐이라 이슈 자체는 유효.

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

허브스팟 MCP는 이 구조화된 에러를 **추가 가공 없이 그대로 전달**합니다. 세일즈맵도 v3 구조화 오류를 그대로 보존해야 하지만, 현재 `SalesMapClient`는 `errors[]`의 객체를 JSON 문자열로 합쳐 일반 메시지로 평탄화합니다. 따라서 API가 이미 제공한 `code`·`inputIndex`·`fieldName`·`context`를 MCP 소비자가 구조적으로 사용할 수 없습니다.

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

## 22. `/v2/user/me` vs `/v2/user` 응답 비일관성

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

## 23. 시퀀스 ID 필드 비일관성 (`_id` vs `id`)

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

## 25. IP 화이트리스트 + 프록시 아키텍처 충돌

### 문제

워크스페이스 **IP 제한(화이트리스트)** 을 켠 고객은 MCP를 사용할 수 없습니다. MCP는 프록시 구조라, 세일즈맵 API가 보는 출발 IP가 **고객 IP가 아니라 MCP 서버(Vercel)의 IP**인데, 이 IP가 고객 허용 목록에 없어서 모든 호출이 기각됩니다.

실제 발생 (2026-06-05, 한 고객 워크스페이스):
```
허용되지 않은 IP 입니다. 워크스페이스 관리에서 IP를 추가해주세요. (현재 IP: 16.184.29.134)
허용되지 않은 IP 입니다. ... (현재 IP: 13.209.98.183)   ← 호출마다 IP가 바뀜
```

### 원인

```
고객 AI → [MCP 서버(Vercel)] → 세일즈맵 API
              ↑ 세일즈맵은 우리 서버의 egress IP만 봄 (고객 IP는 여기까지만 옴)
```
- 프록시 구조상 세일즈맵 API는 **우리 서버의 출발 IP**를 검사 → 고객 사무실 IP가 아님
- Vercel 서버리스는 IP가 **동적**(호출마다 다른 AWS IP) → 고정 IP가 없어 고객이 허용 목록에 추가할 수도 없음

### 수정 방향 제안

- **(인프라, 근본)** MCP 아웃바운드를 **고정 IP로** — AWS **Elastic IP**를 가진 **포워드 프록시**(EC2/Fargate, squid 등) 경유. 고객은 그 IP 하나만 허용하면 됨.
  - ⚠️ NAT Gateway 아님 (NAT는 VPC 내부 egress용. MCP는 VPC 밖이라 포워드 프록시가 맞음)
- **(백엔드, 대안)** MCP 전용 자격증명/헤더 요청은 워크스페이스 IP 체크를 우회 + 고객 "MCP 허용" 토글 (고객 동의 기반)
- **(MCP 측 연결)** `OUTBOUND_PROXY` env + undici `ProxyAgent`로 SalesMapClient만 프록시 경유. CONNECT 터널이라 **토큰은 프록시에 미노출**(TLS end-to-end)
- **(단기)** 해당 고객에게 **API용 IP 제한 해제** 안내 (즉효, 0비용)

### MCP에서의 우회

우회 불가 (인프라 레벨 문제). 현재 IP 제한을 켠 워크스페이스는 MCP 사용 불가 — 고정 egress IP 확보 또는 고객 측 제한 해제 필요.

---

## 27. 페이지네이션 — `nextCursor`를 반환해도 LLM이 추가 탐색을 안 함

### 문제

커서 페이지네이션 자체는 정상 동작하지만, LLM은 `nextCursor`를 받고도 "이게 전부"라고 단정하고
추가 탐색을 멈춥니다. 입력은 `after`, 응답은 `nextCursor`라 값의 다음 사용처도 한 단계 추론해야
합니다.

### 실제 영향

- 목록 결과만 보고 분석을 끝내면 불완전한 결론을 낼 수 있습니다.
- 전체 건수가 없으면 현재 페이지가 전부인지 일부인지 판단할 수 없습니다.

### HubSpot 비교 (조사: REST + 공식 MCP 소스 검증)

- HubSpot list API도 커서와 `limit`을 사용하며 total을 항상 주지는 않습니다.
- 공식 MCP도 커서를 노출하지만, 자연어 "더 있음" 힌트나 자동 페이지네이션은 제공하지 않습니다.
- MCP 프로토콜은 tool 결과의 페이지 표준을 정하지 않으므로, 도구 응답에 구조화 메타데이터와 자연어
  힌트를 함께 주는 것이 필요합니다.

### MCP에서의 우회 (2026-06 채택)

`ok()`(모든 도구 응답이 거치는 직렬화 단일 경유점)에서 **응답에 비어있지 않은 `nextCursor`가 있으면 힌트 한 줄을 자동 주입**합니다.

```typescript
// client.ts — ok() 진입 시
function withMoreHint(data) {
  if (data?.nextCursor 가 비어있지 않은 문자열 && data.hint 없음)
    return { ...data, hint: `결과가 더 있습니다(이 응답은 일부). 더 필요하면 after="${nextCursor}"로 이어서 조회하세요.` };
  return data;
}
```

- `nextCursor`가 `null`이면(마지막 페이지) **미부착** → 노이즈 없음.
- 힌트가 `after="<값>"`을 직접 박아줘서 **`after`/`nextCursor` 이름 비대칭도 동시에 브리지**.
- 적용 범위: 커서를 반환하는 모든 목록 도구와 향후 도구입니다.
- 정확한 total은 여전히 불가합니다. activity 고유의 페이지·정렬·cursor 문제는 #9-6과 #9-10에
  모았습니다.

### 근본 해결 (백엔드)

1. 모든 목록 응답에 **`total` 또는 `hasMore`**를 제공합니다.
2. (선택) count 전용 조회를 지원합니다.

---

## 30. 필드 스키마의 선택지 목록이 select 타입에만 붙음 — 관계 타입은 별도 API로 분리

### 문제

`GET /v2/field/{type}` 응답은 `optionList`(선택 가능한 값 목록)를 **singleSelect·multiSelect에만** 붙여줍니다. 그런데 `pipeline`·`pipelineStage`·`user`·`multiUser` 등 관계 타입도 "선택 가능한 값 목록"이 똑같이 필요한데, 필드 API는 **타입 이름만 반환하고 값 목록은 안 줍니다.** 그 목록은 각각 `GET /v2/{type}/pipeline`·`GET /v2/user` 등 **별도 API로 분리**돼 있습니다.

### 실제 영향 (실측, 2026-07)

`GET /v2/field/deal`의 타입별 `optionList` 채워짐 여부:

| 타입 | 필드 수 | optionList 제공 |
|---|:---:|:---:|
| singleSelect | 18 | ✅ 18/18 |
| multiSelect | 5 | ✅ 5/5 |
| **pipeline** | 1 | ❌ 0 (별도 `/v2/deal/pipeline`) |
| **pipelineStage** | 2 | ❌ 0 |
| **user / multiUser** | 8 | ❌ 0 (별도 `/v2/user`) |
| people·organization·team·sequence·webForm 등 관계 | 다수 | ❌ 0 |

같은 "값을 골라 넣는 필드"인데 select는 필드 API 한 번에 옵션까지 나오고, 관계 타입은 **필드 조회 → 타입 확인 → 타입별 별도 목록 API 재조회**의 2단계가 강제됩니다.

### 추상화 관점

일관된 설계라면 optionList가 타입 무관하게 붙어야 합니다:
```
singleSelect  → optionList  (현재 O)
user          → optionList  (현재 X, 별도 /v2/user)
pipeline      → optionList  (현재 X, 별도 /v2/{type}/pipeline)
```
현재는 **구현 편의 기준**으로 쪼개진 것으로 추정됩니다 — 파이프라인·유저는 CustomField 테이블이 아닌 별도 테이블이라, 필드 API에서 조인하지 않고 별도 API를 만든 형태. 추상화 기준이 아니라 저장 구조 기준으로 갈린 것.

### 실제 영향 — LLM 관점

이슈 #16(필드에 description 없음)·#17(이름→ID 변환 없음)과 한 뿌리입니다. AI가 `"파이프라인": "국내영업"`을 쓰려면 ① 필드 조회로 타입이 pipeline임을 확인 → ② `get-pipelines`로 이름→ID 목록 재조회 → ③ ID로 재작성. select 필드였다면 ①에서 옵션까지 다 나와 한 번에 끝날 일.

### MCP에서의 우회

`salesmap-list-users`·`list-teams`·`get-pipelines`·`list-sequences`·`list-webforms` 등 타입별 목록 도구를 각각 노출. AI가 필드 타입을 보고 알맞은 목록 도구를 골라 재조회. 도구 수가 늘고 왕복이 추가됨.

### API 개선안

`GET /v2/field/{type}` 응답의 관계 타입 필드에도 `optionList`(또는 `referenceOptions`)를 채워주기 — 파이프라인·유저·팀 등 선택지가 유한한 타입은 필드 조회 한 번에 값 목록까지. (선택지가 매우 큰 타입은 별도 조회 유지하되 `optionsEndpoint` 힌트라도 제공)

---

## 31. 견적서 상품 — 타입 표기 3중화 + 필드 API 개선의 사각지대

### 문제

견적서 상품은 **필드를 생성·수정할 수 있는 대상인데**(`POST /v2/field/{type}`의 enum에 `quote-product`가 있음),
그 타입을 가리키는 이름이 표면마다 다릅니다.

| 쓰이는 곳 | 표기 |
|---|---|
| 필드 스키마 조회·생성 (`/v2/field/{type}`) | `quote-product` |
| 에러 메시지 | `QuoteProduct` |
| 요청 본문 키 | `quoteProductList` |

```
GET /v2/field/quote-product   → 200 (할인 유형·결제 횟수·시작 결제일·마지막 결제일·할인·금액·전체 금액·수량)
GET /v2/field/quoteProduct    → 404 Not Found / Invalid Parameters
```

### 실제 영향 (실측 2026-07-29)

`QuoteProduct에 정의되있지 않은 데이터 필드를 입력했습니다` 에러를 받은 클라이언트가
**에러에 적힌 이름으로 스키마를 조회하면 404**입니다.
MCP 개발 중 실제로 이 경로를 밟아 "견적서 상품은 필드 조회 자체가 불가능하다"고 잘못 결론냈습니다.
AI 클라이언트도 같은 경로를 밟습니다 — 에러에서 타입 이름을 읽어 조회 → 404 → 필드가 없다고 판단 → 엉뚱한 우회 시도.

`deal`·`people` 등 다른 타입은 표기가 일치해 이 문제가 없습니다. 견적서 상품만 예외입니다.

### 연관 — 필드 생성 API 개선건과 한 묶음

`POST /v2/field/{type}` 신설(2026-06, 아래 「해결됨」)로 필드를 코드에서 만들 수 있게 됐지만,
`quote-product`는 **enum에는 있는데 그 이름이 어디에도 노출되지 않아** 사실상 도달할 수 없습니다.
필드 API를 손볼 때 이 타입도 함께 정리하는 게 맞습니다.

같은 성격의 나머지 항목:
- 견적서 상품의 `이름`은 필드 스키마에 없는 **순수 top-level**입니다. 다른 오브젝트와 다릅니다 (#3)
- `이름·금액·수량·결제 횟수·시작 결제일`을 fieldList에 넣으면 400인데 **단독 입력 시 에러가 원인을 가립니다**
  (`[quoteProductList,0,amount]: 유효한 숫자를 입력해주세요` — 실제 원인은 값이 아니라 넣은 자리).
  top-level과 양쪽에 넣으면 정확한 메시지(`수량 값은 fieldList가 아닌 파라메터 입니다`)가 나옵니다 (#18)
- 스키마의 실제 이름은 `시작 결제일`인데 백엔드 안내 문구·저희 문서에 `결제 시작일`도 섞여 있었습니다
- `할인 유형`은 quote와 값 규칙이 다릅니다 — quote-product는 조회값(`percentage`) 그대로, quote는 `%`. quote 쪽이 이상 (#2 계열)

### MCP에서의 우회

`create-quote`가 견적서 상품을 평탄한 `properties`로 받고, `quote-product` 스키마를 조회해
top-level 5종과 fieldList로 분리합니다. fieldList에 금지 필드가 와도 400을 내지 않고 제자리로 옮깁니다.
타입 이름은 `QUOTE_PRODUCT_SCHEMA_TYPE` 상수 하나로 고정했습니다.

### API 개선안

1. **(근본) 타입 표기 통일** — 에러 메시지의 타입 이름을 `/v2/field/{type}`에 그대로 넣을 수 있는 값으로. 되면 2번은 불필요
2. **(차선) 별칭 허용** — `/v2/field/{type}`이 `quoteProduct` 표기도 수용
3. fieldList에 top-level 전용 필드가 오면 필수값 검증보다 **먼저** refine 메시지 (#18과 동일 성격)

---

## 32. v3 `dateTime` 필드가 date-only 입력에 호출 시각을 주입 ★★★

노트/activity 날짜 범위의 KST/UTC 불일치와 종료일 누락은 #9-8에서 다룹니다. 이 항목은 활동과
무관하게 v3 쓰기 전체에 영향을 주는 `dateTime` 필드의 별도 계약 문제입니다.

### 실제 영향

```
입력: { "마감일": "2026-07-29" }   (KST 13:26에 호출)
저장: 2026-07-29T04:26:00.000Z  = KST 07-29 13:26
```

자정이 아니라 **호출 시각**이 붙습니다. 같은 요청을 아침에 하면 09:00, 저녁에 하면 18:00으로
저장되어 **재현이 불가능**하고, 날짜 범위 조회의 경계에서 들락날락합니다.

같은 요청에서 `date` 타입 필드는 정상적으로 KST 자정(`2026-07-28T15:00:00Z`)으로 저장됩니다.

### MCP에서의 우회

- v3 `dateTime` 필드는 date-only 사용을 피하고 오프셋 포함 date-time을 권장합니다.

### API 개선안

v3 create의 `dateTime` 필드에 date-only가 오면 **KST 자정**으로 통일하고, 규약을 문서화합니다.

---

## MCP 코드 감사 추가 이슈 (업스트림 API와 분리)

아래 항목은 API의 한계가 아니라 현재 래퍼 소스 자체에서 확인한 문제입니다. 실제 API 계약이
문서와 다를 가능성이 있는 항목은 재현 전까지 추정으로 표시합니다.

### MCP-B1. v3 batch read가 `DEFAULT_PROPERTIES` 기본 정책을 사용하지 않음

`src/tools/generic.ts`의 v3 `/v3/object/read` 경로는 사용자가 `fieldList`를 주면 그대로
전달하지만, 생략하면 `fieldList` 자체를 보내지 않아 API가 모든 필드를 반환합니다.
`src/client.ts`의 `DEFAULT_PROPERTIES`는 v2 단건 조회의 fallback에만 적용됩니다.

즉 README와 일부 설계 문서가 말하는 “기본 핵심 필드만 반환”은 현재 v3 batch-read 경로의
동작이 아닙니다. 커스텀 필드가 많거나 association을 함께 읽는 경우 응답·토큰·지연이
불필요하게 커질 수 있습니다. **T2** — 데이터 정확성보다는 반복 조회의 비용과 컨텍스트
폭발 문제입니다.

### MCP-B2. v3 구조화 오류가 클라이언트에서 문자열로 평탄화됨

v3 batch mutation은 `errors[]`에 `code`, `inputIndex`, `fieldName`, `context`를 줄 수 있고
207 partial success에서는 일부 레코드만 실패할 수 있습니다. 그러나 현재 `SalesMapClient`의
공통 오류 처리에서는 이 객체들이 문자열 메시지로 합쳐집니다.

그 결과 LLM은 어떤 입력 인덱스가 실패했는지, 어느 필드가 원인인지, 성공한 레코드와 실패한
레코드를 어떻게 나눠 재시도해야 하는지 안정적으로 알 수 없습니다. 오류 구조를 MCP 응답의
고정된 `errors`/`partial` 형태로 보존해야 합니다. **T2** — 배치 결과를 잘못 재시도하거나
성공·실패를 한 덩어리로 보고할 위험이 있습니다.

### MCP-B3. 이름→ID 조회에서 중복 이름이 조용히 덮어써짐

`fetchUserMap`과 `fetchTeamMap`은 이름을 key로 하는 `Map`을 만들며, 같은 이름이 여러 개면
마지막 항목이 이전 항목을 덮어씁니다. 현재 중복 이름이 있는 워크스페이스의 재현 데이터는
확보하지 못했지만, 담당자·팀을 이름으로 지정한 쓰기에서 잘못된 UUID가 선택될 수 있는
정적 코드 위험입니다.

이름이 유일하지 않으면 후보 목록을 반환해 선택을 요구하거나, 이름+ID를 함께 표시하고
명시적 ID를 우선해야 합니다. **T2** — 데이터 변경 대상이 틀릴 수 있으므로 단순 UX 문제가
아닙니다.

### MCP-C1. 도구 수와 LLM용 문서가 실제 구현에서 드리프트됨

현재 `src/index.ts`는 29개 도구를 등록하지만 README와 `docs/architecture.md`에는 22개로
남아 있습니다. `src/tools/extras.ts`의 내장 `SALESMAP_DOCS`에도 현재 입력 계약과 다른
견적 상품 예시(`startPaymentDate`)가 남아 있고, 정적 `api-ref`는 2026-07-30 v2 reference를
기반으로 합니다. v3 object CRUD를 설명하는 도구와 v2 reference를 조합해 읽으면 모델이
존재하지 않는 필드명·도구 수·요청 형식을 학습할 수 있습니다.

등록 도구 목록과 내장 문서를 단일 생성 원천에서 만들고, API reference에는 기준일·실측 우선
원칙을 표시해야 합니다. **T3** — 대부분의 호출은 동작하지만 잘못된 탐색과 불필요한 재시도를
유발합니다.

### 확인 완료: v3 batch create association 계약

백엔드 확인 결과 실제 API 키는 `association`(단수형)입니다. MCP 입력 표면에서
`associations`(복수형)를 받는 것은 LLM 친화적인 도구 계약이고, outgoing body에서
`associations` → `association`으로 변환하는 현재 코드는 올바릅니다.

create의 값은 배열을 직접 넣는 형태가 아니라 다음과 같은
`Record<string, string[]>` 객체입니다.

```json
{
  "association": {
    "메인 고객": ["people-record-uuid"],
    "메인 회사": ["organization-record-uuid"]
  }
}
```

관계명은 워크스페이스의 관계 설정명 또는 시스템 관계명이어야 하고, 값은 이름이나 unique
필드가 아닌 레코드 UUID 배열이어야 합니다. create에서는 선택 사항이지만 딜·리드는
`메인 고객` 또는 `메인 회사`가 최소 하나 필요하며, 상품에 association을 지정하면 400입니다.
update도 키와 기본 구조는 같고, `null`/빈 배열을 통한 연결 해제와 `rewrite`는 update에서만
지원합니다. 따라서 이 계약은 MCP 감사 이슈가 아니라 **확인·해결된 구현 계약**으로 기록합니다.

---

## 요약: MCP에서 우회한 API 갭 목록

| # | API 레거시 | MCP 우회 방법 | 추가 코드량 |
|---|-----------|-------------|-----------|
| 4-1 | Search 정렬 미지원 | 클라이언트 정렬 (불완전) | ~10줄 |
| 4-2 | Search 빈 필터 불가 | EXISTS 더미 필터 | ~5줄 |
| 4-3 | Search 응답이 `{id, name}`만 반환 | batch-read 후속 호출 | N+1 패턴 |
| 4-5 | custom-object·상품 검색 미지원 | 상품은 전체 목록 순회, custom-object는 우회 불가 | 대규모 카탈로그·커스텀 오브젝트 탐색 불가 |
| 4-6 | string 필드 다중 exact match(`IN`) 미지원 | 전체 목록 스캔 또는 다중 CONTAINS 우회 | 위험한 우회 |
| 8 | 이메일 템플릿·시퀀스 생성/등록 API 부재 | — | 아웃바운드 플로우 전체 차단 |
| 9-1 | Engagement 타입별 목록·상세·쓰기 표면 분절 | `list-notes`/`list-engagements`/`read-engagement` 분리 | 타입마다 가능한 업무 범위가 다름 |
| 9-2 | 이메일 전역 목록·open/click 고객 분석 API 부재 | 레코드별 activity 순회·MCP 메모리 집계 | CRM 전체 후보 선별은 전체 스캔 위험 |
| 9-3 | 노트 생성 lifecycle·응답 형식 제한 | 레코드 update의 `memo` 우회 | 날짜/유형/담당자 지정 불가 |
| 9-4 | TODO 생성·수정·삭제 경로 부재 | — | 후속 조치 자동화 불가 |
| 9-5 | 리드/딜 생성 시 고객 activity 전파 제어 부재 | — | UI/API 타임라인 불일치 |
| 9-6 | 타임라인 정렬·page size·최근 N건 계약 부재 | 날짜 범위 안내 | 결과 완전성·호출량 예측 불가 |
| 9-7 | Activity 배치 조회 부재 | 단건 반복 + run-script | N+1, 반복 지연 |
| 9-8 | 노트 `endDate` UTC 해석으로 당일 누락 | endDate 보정 | 실피해 22회 |
| 9-9 | 녹음/AI transcript 목록·역방향 조회·상한 부재 | activity 경유 + 응답 절단 | 전체 녹취 분석 불가 |
| 10 | 삭제 API 비표준 | 시퀀스 에러 힌트 수동 추가 | ~5줄 |
| 11 | 조회 시 반환 필드 선택 불가 | v2 fallback은 DEFAULT_PROPERTIES, v3 batch-read는 명시한 fieldList만 투영하고 생략 시 전체 반환 | 부분 우회 |
| 13-b | 커스텀 오브젝트 이름 필드 식별 수단 부재 → 추론 + 다중 definition 오염 | properties 명시로 우회 (LLM 부담) | 미해결 |
| 16 | 필드 스키마에 description 없음 | FIELD_HINTS 하드코딩 주입 (~44필드) | ~60줄 |
| 17 | 참조 필드가 ID만 허용 (이름→ID) | 사용자/팀 이름→UUID, search의 pipeline/stage 이름 자동 변환; v2 update는 여전히 ID 중심 | ~60줄 (중복 이름 위험) |
| 18 | 에러 응답이 비구조화 문자열 | v2는 errWithSchemaHint(), v3 구조화 `errors[]`는 문자열로 평탄화 | 부분 우회 |
| 19 | 필드 수정 API 부재 (옵션 값 변경 등 UI 전용) | — | 우회 불가 |
| 20 | Association 대량 처리 전용 API 없음 (연결 변경 자체는 update로 가능) | update 관계 필드로 우회 | 예정된 v3 batch update의 `association`으로 커버 가능 |
| 21 | 상품 수정·삭제 API 부재 | v3 batch create/read로 생성·조회만 가능 | 정정·정리 작업은 UI 전용 |
| 22 | user/me와 user 목록 스키마 불일치 | user 목록에서 id 매칭으로 email 추출 | ~5줄 |
| 23 | 시퀀스 `_id` vs `id` + 필드명 불일치 | `_id`→`id` 재매핑 | ~5줄 |
| 24 | 레코드 병합(Merge) API 없음 | — | 우회 불가 |
| 25 | IP 화이트리스트 + 프록시 충돌 (고객 IP제한 시 MCP 기각) | — | 우회 불가 (고정 egress IP 필요) |
| 27 | 페이지네이션 `nextCursor` 신호를 LLM이 무시 | `ok()`에 다음 `after` 호출 힌트 자동 주입 | 정확한 total은 불가 |
| 31 | 견적서 상품 타입 표기 3중화 (`quote-product`/`QuoteProduct`/`quoteProductList`) + top-level 전용 필드 에러가 원인을 가림 | 평탄 properties 수용 후 스키마 기반 분리, 타입명 상수 고정 | ~40줄 |
| 32 | v3 `dateTime` date-only 입력이 호출 시각으로 저장됨 | 오프셋 포함 date-time 권장 | 재현 불가능한 값 |
| 35 | 구성 상품 쓰기만 되고 읽기 없음 | **미지원 결정** | — |

### MCP 코드 감사 요약

| 항목 | 문제 | 등급 |
|---|---|---|
| MCP-B1 | v3 batch-read에서 fieldList 생략 시 전체 필드 반환 | T2 |
| MCP-B2 | v3 구조화 오류의 inputIndex/fieldName/context 손실 | T2 |
| MCP-B3 | 동일한 user/team 이름이 Map에서 조용히 덮어써질 수 있음 | T2 |
| MCP-C1 | 도구 수·내장 문서·정적 API reference가 실제 구현과 드리프트 | T3 |

> Activity 관련 MCP-A1/A2의 상세와 T1 판단은 #9-10에 통합했습니다.

**총 우회 코드: ~527줄** (전체 MCP 서버 코드의 약 30%)

---

## 제안: 공식 MCP를 위한 T1/T2/T3 실행 로드맵

공수나 릴리즈 일정이 아니라, 잘못된 성공 응답·데이터 누락·핵심 업무 차단 가능성을 기준으로
정렬합니다. T1은 MCP와 API가 각각 담당할 일을 나눠 동시에 처리해야 합니다.

### T1 — 데이터 누락과 대량 쓰기 안전성

1. **#9-10 (MCP-A1/A2)** — `custom-object` activity 키를 검증·수정하고, activity `limit`과
   cursor가 함께 사용될 때 항목을 건너뛰지 않도록 고칩니다.
2. **#9-8·#32** — memo의 `endDate`를 당일 포함 KST 경계로 통일하고, v3 `dateTime`의
   date-only 입력에 호출 시각이 붙지 않게 합니다.
3. **#9-6·#9-7·#27** — activity의 `hasMore`/`total`, 정렬, page size와 batch 경로를 추가하고,
   모든 목록 도구는 페이지가 일부라는 신호를 유지합니다.
4. **#20** — 예정된 v3 batch update가 `association` 객체를 포함하도록 계약을 확정합니다.

### T2 — 핵심 업무 차단과 반복 비용

1. **검색·투영** — #4-1/#4-3/#4-5/#4-6의 정렬·properties·custom-object/product search와
   string exact `IN`을 지원합니다.
2. **오류·참조 안전성** — #18의 구조화 오류(`code`, `inputIndex`, `fieldName`, `context`)와
   MCP-B2 보존 계약을 마련하고, #17의 이름 참조와 중복 이름 처리 정책을 API/MCP 양쪽에
   명시합니다(MCP-B1/B3 포함).
3. **활동** — #9-1~#9-5·#9-9의 전역 이메일 이벤트 조회·고객별 집계, 공통 CRUD/검색,
   활동 전파, 녹음 역방향 조회를 보강합니다.
4. **업무 기능** — #8의 시퀀스 등록, #19의 필드 수정, #21의 상품 수정·삭제,
   #24의 merge, #29의 quote publish를 제공합니다.
5. **운영 안정성** — #25의 IP whitelist와 MCP egress 충돌에 대한 고정 egress 또는 정책
   대안을 마련합니다.

### T3 — 스키마 일관성과 후속 기능

1. **응답·투영 정책** — MCP-B1의 v3 기본 field projection 정책을 문서와 코드에서
   일치시킵니다. v2 호환 문제는 별도 「v3 이관 중 잔존 레거시 문제」 섹션에서 관리합니다.
2. **식별자·옵션·문서** — #10/#16/#22/#23/#30/#31의 API 표기·description·user 응답·
   sequence ID·관계 옵션·quote-product 타입을 정리합니다.
3. **커스텀 오브젝트와 상품** — #13-b의 internal field name/definition 단위 스키마와
   #35의 productElementList 읽기 경로를 추가합니다.
4. **MCP-C1** — 실제 등록 도구 목록과 README·architecture·내장 `SALESMAP_DOCS`·정적
   reference의 생성 원천과 갱신 기준일을 통일합니다.

> Engagement 1급 오브젝트화 아키텍처 방향은 #9 "Engagement / Activity API" 섹션 참조.

---

## 해결됨 (메모)

해결된 이슈는 본문에서 제거하고 여기 간단히만 남긴다.

### 2026-06-10 릴리즈 — 관계 필드 `LIST_CONTAIN` 지원 (구 #4-7)

- SAL-9179(PR #12674, commit `d23f78a029`)이 2026-06-10 릴리즈에 포함됐고, 현재 production
  `2026-08-03`에도 배포되어 있습니다.
- 다중 관계 필드에서 `LIST_CONTAIN`/`LIST_NOT_CONTAIN`은 UUID 하나의 scalar 값, 여러 후보의
  멤버십 검색은 `IN`/`NOT_IN` + UUID 배열이 현행 계약입니다. UI도 각각 "포함"과
  "하나라도 포함"에 이 shape을 사용합니다.
- 2026-06-08 telemetry의 `Operator LIST_CONTAIN is not supported for relation field`는 이 릴리즈
  전 버전에 UUID 배열을 `LIST_CONTAIN`으로 보낸 과거 실패입니다. 현재 활성 API 이슈가 아닙니다.

### 2026-07-29 릴리즈 — 반영 완료 (2026-07-31)

- **association 응답 규약** `type`→`유형`(한글, 단복수 포함: `"고객 (단일)"`), `_id`→`id`.
  배포 확인했고 **우리 영향 없음** — `associationList`에서 `name`만 읽는다. 실측 재확인 완료
- **v2 activity 유형·기간 필터** → `list-engagements` v2 재이관, 활동 유형 8종 신규 노출
- **이메일 본문 / 녹음·녹취** → `salesmap-read-engagement` 신설 (`read-note` 흡수)
- **v3 상품 생성** → v2 단건 순회 폐기. 전 필드 저장 역확인 완료
- **formula 오류 500→400** — 힌트는 붙이지 않기로 결정. 문구가 내부 validator 메시지에 의존해
  고정 계약이 아니다(백엔드 확인). 문자열 매칭 힌트는 문구가 바뀌면 조용히 깨진다
- **`/v2/field/{type}` 표기 양쪽 수용 예정** — 우리는 이미 `canonicalFieldSchemaType()`으로
  정규화 중. 반영돼도 유지한다(`견적서 상품`·`quote_product` 같은 표기까지 흡수하므로)
- **시스템 select 값** — 변환 대상 4종이 전부이고 워크스페이스 언어와 무관한 고정값임을 확인.
  하위호환 때문에 MCP 내부 예외처리로 남을 가능성이 커 변환표는 유지

### 완료

- **Batch Read** — `POST /v3/object/read` (최대 500건, fieldList·associationList 지원). MCP `batch-read-objects`가 사용 (2026-06)
- **Batch Create** — `POST /v3/object/create` (최대 100건, data·association 지원). MCP `batch-create-objects`가 사용 (2026-07)
- **Search 값 파싱 실패 500** — 백엔드 타입별 검증 추가로 명확한 400 반환 (구 #4-4, 2026-06)
- **커스텀 오브젝트 Definition 목록** — `GET /v2/custom-object-definitions` 신설 + 레코드/필드가 `customObjectDefinitionName`(이름)으로 지정 가능. MCP `list-objects` (구 #13, 2026-06)
- **필드 생성** — `POST /v2/field/{type}` 신설 (formula·custom-object 포함). MCP `create-property` (구 #19 생성부, 2026-06)
- **노트 목록·유형 조회** — `GET /v2/memo`(필터)·`GET /v2/memo/type-list` 신설. MCP `list-notes` (2026-06)
- **Activity 유형별 조회** — `POST /v3/object/activity` (유형 필터·유형별 limit 1~50·독립 커서·이메일/녹음 인라인). MCP `list-engagements` (2026-06)
- **커스텀 오브젝트 파이프라인 조회** — `POST /v3/pipeline/list`가 커오 지원. MCP `get-pipelines` (2026-06)
