# v3 `object/update` 이관 계획 — **보류 중**

> **상태**: 보류 (2026-07-31 결정) · **착수 조건 충족 시 이 문서만 보고 바로 시작할 수 있게 작성됨**

## 왜 보류했나

**2026-08-05 현재 — 딜 하나만 남았고, 딜은 개발 중이다.**

| 시점 | 지원 | v3 커버리지 | 판단 |
|---|---|---:|---|
| 2026-07-31 | 회사·고객 | 93.6% | 보류 — 분기가 여러 축에서 갈림 |
| **2026-08-05** | **+ 리드·커오·상품** | **95.4%** | **보류 유지 — 딜 개발 중이라 곧 열림** |

딜만 v2 단건 순회로 남는데, **딜 지원이 개발 중**이라 지금 그 경로를 만들면 곧 지운다.
분기 하나 때문에 임시 코드를 넣었다 빼는 것보다 열린 뒤 한 번에 옮기는 편이 낫다.

**착수 조건**: `POST /v3/object/update`가 **딜**을 지원할 때. (나머지는 전부 열렸다)

> 견적서도 미지원이지만 우리는 `create-quote` 전용 도구를 쓰므로 이관 대상이 아니다.
> 착수 판단에서 제외한다.

**출처**: 백엔드 에이전트 2인(decode·bugman) 릴리즈 노트 + 13문항 추가 질의 회신
(2026-07-31, 양쪽 prod main 코드 실측 기준). 원장 `docs/salesmap-api-reference-2026-07-30.md`,
라이브 OpenAPI, 운영 DB와 교차 확인.

> **이슈 참조는 번호가 아니라 「제목」으로 적는다.** `salesmap-api-issues.md`는 재구성 때
> 번호가 통째로 바뀐다(2026-08-04에 `#2`→`L-1`, `#4`→`#1`, `#21`→`2-4` 식으로 두 번 바뀌었다).
> 이 문서는 몇 달 뒤에 열릴 것을 전제로 하므로 번호를 믿지 않는다.

---

## §A. 확정된 사실

### A-1. 지원 범위 — 보류의 이유

**2026-08-05 실측으로 갱신** (테스트 워크스페이스, 값 변경 후 `/v3/object/read` 되읽기 확인):

| 오브젝트 | v3 배치 **생성** | v3 배치 **수정** | v2 단건 **수정** |
|---|:---:|:---:|:---:|
| 고객 · 회사 | ✅ | ✅ | ✅ |
| **리드** | ✅ | ✅ **08-05 신규** | ✅ |
| **상품** | ✅ (07-29) | ✅ **08-05 신규** | ❌ 경로 없음 |
| **딜** | ✅ | ❌ `지원하지 않는 오브젝트 유형입니다` | ✅ |
| **커스텀 오브젝트** | ✅ | ✅ **08-05 신규** (백엔드 코드 확인) | ✅ |
| 견적서 | ❌ (`create-quote` 전용) | ❌ 500 `Unexpected Server Error` | ❌ |

🔑 **상품이 처음으로 수정 가능해졌다.** 여태 v2·v3 어느 쪽으로도 못 고치던 유일한 타입이었다
(이슈 「상품(Product) 수정·삭제 API 부재」). 이 이슈의 해결 경로가 열렸다.

🔑 **딜만 빠졌다 — 개발 중이다** (백엔드 회신 2026-08-05).
`getObjectModel`은 `딜`을 인식하지만 `updateObjectListForApiFunc` switch에 `ColumnModel.Deal`
케이스가 없다. 코드 주석에도 *"딜은 아직 수정 dispatcher에 없어 빠져 있다"* 가 남아 있다.
견적서도 같은 이유로 빠져 있다.

⚠️ **딜의 오류가 오해를 부른다 — 검증이 dispatch보다 먼저 돈다.**
```
association 없이 → 400 REQUIRED_FIELD "메인 고객 또는 메인 회사 중 하나는 반드시 연결해야 합니다"
association 동봉 → 400 "지원하지 않는 오브젝트 유형입니다"   ← 진짜 원인
```
메인 고객·회사가 **이미 둘 다 연결된** 딜에서도 앞의 오류가 난다. 기존 상태를 안 보고
요청 페이로드만 검사하기 때문이다. 미지원인 걸 모르고 "메인 고객을 넣으라는 거구나" 하고
재시도하게 되는 형태 — 백엔드에 순서 조정 요청함.

### 실사용 영향 (텔레메트리 6/1~7/29, update 4,066회)

| | 호출 | 비중 |
|---|---:|---:|
| v3 배치 가능 (고객·회사·리드·커오) | 3,880 | **95.4%** |
| v2 순회 잔존 (**딜만**) | 186 | 4.6% |

**딜이 열리면 v2 순회 경로가 통째로 사라진다.** 그래서 딜만 기다린다.

**prod 배포 확인됨** — `HEAD /api/v3/object/update` → 204, 무인증 POST → 401(404 아님).

### A-2. 요청 형식

```jsonc
POST /api/v3/object/update
{
  "objectType": "회사"|"고객"|"리드"|"상품"|"<커오 정의 이름>",   // 딜·견적서는 400
  "rewrite": false,                       // optional, 기본 false
  "inputList": [ {                        // 1~100건
    "id": "<RecordId>",                   // list/read 응답의 id. 이름·이메일 불가
    "data": { "<필드명>": <값> },          // 필수. 관계만 바꿔도 {}
    "association": { "<관계명>": ["<RecordId>"] | null }   // optional
  } ]
}
```

- 같은 요청에 **같은 id 두 번 금지**
- **id가 하나라도 무효면 저장 전 전체 거부** — 형식 오류·타 워크스페이스·삭제된 레코드 전부.
  `validateObjectIdList`가 `roomId + _id`로 조회해 개수가 다르면 차단 →
  **부분 적용이 없으므로 재시도가 안전하다**
  - ⚠️ 단 **UUID 형식 불량은 500 가능** — 입력 스키마가 형식 검증을 안 해 PG UUID 파싱
    오류로 샌다. **우리가 사전 검증해야 한다** (500은 AI에게 "서버 문제니 재시도"로 읽힌다)
- 관계 대상 id: 형식 오류 `INVALID_RECORD_ID`, 없는 대상 `NOT_FOUND_ASSOCIATION_TARGET`
  (둘 다 저장 전 검증)
- 배치 상한 100 = Redis 큐 OOM 방지용 안전장치. 올리면 안 됨
- **objectType 표기** (2026-08-05 확인): 커스텀 오브젝트는 create와 같이 **정의 이름**
  (`티켓(CRM)`), `custom-object` 리터럴이 **아니다**. 정의명은 대소문자 무시로 조회한다.
  상품은 `상품`.

### A-3. `rewrite` — **요청에 포함된 키에만** 적용

`data`·`association` 양쪽에 걸린다.
코드 근거: `if (!(customField.name in fieldMap)) continue;` — 요청에 없는 필드는 건너뜀.

| | `rewrite:false` (기본) | `rewrite:true` |
|---|---|---|
| **안 보낸 필드/관계** | **유지** | **유지** ← 레코드 전체 덮어쓰기가 아니다 |
| 단일 값 | 보낸 값으로 교체 | 보낸 값으로 교체 |
| 다중 값 / 관계 | 기존에 **추가** | 보낸 목록이 최종 상태 |
| `null` / `[]` | **무시** | **삭제** |

🔑 **v2도 `replace:false` 고정 = 병합이다** (`/v2/{people,organization,deal,lead}/{id}` 전부).
→ v2 = v3 `rewrite:false`. **이관해도 동작이 안 바뀐다. 기본값 `false`가 정답.**

🔑 다중값을 "이 값들로 교체"하는 건 **v2에서 애초에 불가능했다.** 원장 2673행
*"연결 해제는 지원하지 않습니다 … 다른 값으로 교체만 가능"*, 259행 *"관계형에 `null`은
조용히 무시(200), `[]`/`""`는 400"*. `rewrite:true`가 이걸 처음 가능하게 하므로
**도구에 노출할 가치가 있다.**

🔑 값 비우기 = `rewrite:true` + `null`.
**빈 문자열 `""`은 400이 아니라 그대로 저장된다** (`이름`만 예외로 400).
AI가 "비워줘"에 `""`를 넣으면 null이 아닌 빈 문자열이 되므로 우리가 정규화할지 판단 필요.

### A-4. `data` 규칙

| 항목 | v3 update |
|---|---|
| `이름` | 빈 값·공백 400. 생략은 OK |
| **User 타입** | **이름만.** UUID는 `NOT_FOUND_USER` 400 (UUID로 해석 안 함) |
| 복수 User | 이름 **배열** — `{"팔로워":["김동우","이영희"]}` |
| 사용자 이름 중복 | 제품 정책상 생성 불가. 정상 워크스페이스에서는 ambiguity가 발생하지 않음 |
| 비활성 | `INACTIVE_USER` 400. **Active + Pending 허용** (Active만이 아님) |
| `date` 타입 | 시각 버리고 KST 해당 날짜 00:00 저장 |
| `dateTime` 타입 | 현재 offset 명시 ISO는 그대로, 날짜만 보내면 현재 KST 시각 주입. **목표 계약은 date-only를 400으로 거부**하며 MCP도 같은 사전 검증을 적용 |
| 계산 필드 | **완전 무음** — 200에 errors·warning 없이 버려짐 (`if (customField.astTree) return false;`). `allowedDataFieldNameSet`에는 포함돼 `PROPERTY_DOESNT_EXIST`도 안 남 |
| 값 타입 | string · number · boolean · string[] · null |
| 지원 시스템 필드 | `이름` · `프로필 사진` · `담당자` · `생성 날짜` |

🔑 **`toKstBoundary`는 `date`에만 적용한다. `dateTime`의 date-only는 자정으로 추측하지 않고 거부한다.**

#### 🔴 파이프라인·단계 — v2와 어휘가 정반대다 (2026-08-05 실측)

| | v2 update | **v3 update** |
|---|---|---|
| 받는 값 | `pipelineStageId` = **UUID** | `파이프라인 단계` = **이름 문자열** |

```
{"파이프라인 단계": "새 리드"}                      → ✅ 수용 (되읽기 시 {id,name}로 나옴)
{"파이프라인 단계": "019f83cd-0000-…"}             → ❌ 400 NOT_FOUND_PIPELINE_STAGE
```

- `파이프라인 단계`만 보내면 **대상 레코드의 현재 파이프라인 안에서** 이름을 해석한다
- 다른 파이프라인으로 옮기려면 `파이프라인` + `파이프라인 단계` **이름 둘 다** 보낸다
- `파이프라인`만 단독 변경은 **불가** — 단계가 없어 `파이프라인 단계` 필수 오류
- 비우기는 `rewrite:true` + `null`, 둘 다 함께 해제된다

**사용자 필드(§B-4)에 이어 두 번째 어휘 역전이다.** v2 경로가 남는 한 양방향 변환이 필요하다.
🔑 계산 필드는 **우리 사전 차단(스키마 `formula` 타입 확인)이 유일한 방어다.** 백엔드도
"400이 더 안전, 개선 요청 대상"이라 동의.

### A-5. `association` 규칙

| objectType | system 관계 | 카디널리티 |
|---|---|---|
| 회사 | `메인 고객` · `메인 딜` · `메인 리드` | 역방향 FK, 전부 복수 |
| 고객 | `메인 회사` | 단방향 FK, **단일(0~1)** |
| 고객 | `메인 딜` · `메인 리드` | 역방향 FK, 복수 |

값은 **RecordId 배열만** (이름·이메일·유니크값 불가). 커스텀 관계도 지원(개수 제한 적용).
system 관계 연결/해제는 요청당 최대 100건.

**리드(딜도 열리면 동일 예상)** — 2026-08-05 확인:
- 관계를 **안 보내고 필드만 수정하는 건 된다** (실측 확인)
- 단 **최종 상태 기준**으로 `메인 고객`/`메인 회사` 중 하나는 남아야 한다.
  `rewrite:true`로 마지막 하나를 해제하면 400 `REQUIRED_FIELD`
- **`메인 견적서`는 update에서도 지정 불가.** `null`로 보내도 400 `PROPERTY_DOESNT_EXIST`

🔑 **`data`에 관계 필드명을 넣으면 400** (`PROPERTY_DOESNT_EXIST`).
관계 타입(MultiPeople·MultiDeal 등)은 `validateInputObjectData`의
`allowedDataFieldNameSet`에서 사전 제외된다.
**조용한 무시가 아니라 다행이지만, 우리 실사용의 49%(1,994회)가 정확히 그 형태**라
자동 분리(§B-3) 없이는 절반이 깨진다.

### A-6. 응답

| 상황 | HTTP | 본문 |
|---|---|---|
| 성공 | 200 | `{objectList:[{id}]}` |
| 필드 성공 + 관계 일부 실패 | **207** | `{success:false, message:"Partial success", objectList, errors}` |
| 검증 실패 | 400 | `{success:false, message:"Validation failed", errors}` |

`errors[]` = `{code, inputIndex?, fieldName?, message, context?}`
— **create보다 구조화가 낫다** (`inputIndex`로 몇 번째 항목인지 특정 가능).
⚠️ `inputIndex`·`fieldName`은 **optional**이다. 없을 수 있으니 그 전제로 파싱한다.

**에러 코드 카탈로그** (2026-08-05 백엔드 회신):

| 분류 | code |
|---|---|
| 공통 | `INVALID_OPTION` · `REQUIRED_FIELD` · `PROPERTY_DOESNT_EXIST` |
| 유니크 | `STORAGE_UNIQUE_CONFLICT` · `CONFLICTING_UNIQUE_VALUE` |
| 숫자 | `INVALID_NUMBER` |
| 사용자 | `NOT_FOUND_USER` · `AMBIGUOUS_USER` · `INACTIVE_USER` |
| 파이프라인 | `NOT_FOUND_PIPELINE` · `AMBIGUOUS_PIPELINE` · `NOT_FOUND_PIPELINE_STAGE` · `AMBIGUOUS_PIPELINE_STAGE` |
| 관계 | `NOT_FOUND_ASSOCIATION_TARGET` · `CONFLICTING_ASSOCIATION_TARGET` · `ASSOCIATION_COUNT_LIMIT_EXCEEDED` · `ASSOCIATION_FAILED` · `INVALID_RECORD_ID` |

**207의 유일한 사례**: 딜·리드가 고객도 회사도 없는 **orphan**이 되는 관계 해제.
필드는 이미 반영됐으므로 **단순 재시도 금지**.
`client.ts:132-143`의 207 처리가 공통 경로라 자동 적용된다 (힌트 문구만 §B-5 참조).

### A-6-1. 구성 상품(`productElementList`) — 쓰기만 되고 읽기가 없다

2026-08-05 실측. **백엔드 회신("지원됩니다")과 실동작이 갈린 항목이라 실측을 기준으로 적는다.**

**위치가 `data`가 아니라 `inputList` 항목의 top-level이다:**

```jsonc
{ "objectType": "상품", "inputList": [ {
    "id": "…", "data": {},
    "productElementList": [ { "name": "구성B", "amount": 1, "price": 5000 } ]   // ← data 밖
} ] }
```

```
data 안에 넣으면  → 400 PROPERTY_DOESNT_EXIST
{name, amount}만  → 400 REQUIRED_FIELD  ("「구성A」 구성 상품이 없어 새로 만들어야…")
{name, amount, price} → ✅ 수용
```

`GET /v2/field/product` 스키마에도 `productElementList`가 **없다** — 그래서 `data`로는
애초에 못 보내는 구조다. v2의 top-level-split과 같은 계열.

**동작** (백엔드 회신): 상품에서만 허용 · 기본 병합 · `rewrite:true`면 보낸 목록이 최종 구성
(빈 배열이면 전체 해제) · 구성 상품은 **이름으로 찾고 없으면 새로 만든다** · 같은 이름이면
`price`는 무시되고 기존 금액 유지 · 한 상품 안에서 같은 구성 이름을 두 번 보내면 거부.

#### 🔴 그래서 MCP는 계속 미지원으로 둔다

읽을 수단이 **여전히 없다** (2026-08-05 실측):

```
POST /v3/object/read  fieldList:["productElementList"]  → 400 "필드를 찾을 수 없습니다"
GET  /v2/product                                        → 응답에 없음
GET  /v2/field/product                                  → 스키마에 없음
```

쓰기만 되고 읽기가 없으면 **"뭘 덮어쓰는지 모르고 덮어쓰는" 도구**가 된다. AI가 구성을
바꾸려면 현재 구성을 먼저 봐야 하고, `rewrite:true` 전체 교체는 기존 목록을 알아야 성립한다.
게다가 `price`가 필수인데 기존 이름이면 조용히 버려지므로, 호출자는 자기가 값을 바꾼 건지
아닌지도 알 수 없다.

**읽기 경로가 생기면 그때 넣는다.** 백엔드에 계획을 물어둔 상태
(이슈 「상품 구성(productElementList) 읽기 API 부재」).

### A-7. Rate limit ⚠️ — **배치 mutation만 별도 쿼타**

재확인 2026-08-04 (백엔드 2인, prod main `v2026.08.03` 코드 기준).
**핵심: "배치라서" 느린 게 아니라 "쓰기 배치라서" 느리다.** 읽기 배치는 일반 버킷이다.

| 엔드포인트 | 버킷 | 한도 | 1회 최대 |
|---|---|---|---|
| 일반 v2/v3 (조회·단건 쓰기) | **일반** | 100 req / 10s | — |
| `POST /v3/object/read` | **일반** ← 같은 버킷 | 〃 | idList 500 |
| `POST /v3/object/list` | **일반** | 〃 | limit 500 (기본 50) |
| **`POST /v3/object/create`** | **배치 mutation 전용** | **1 req / 1s, 버스트 없음** | inputList 100 |
| **`POST /v3/object/update`** | 〃 | 〃 | inputList 100 |

분기 지점: `authenticateApi.ts`가 **`/api/v\d+/object/(create|update)`만** 배치 전용 limiter로
보내고 나머지는 전부 일반 limiter를 탄다.

- **두 버킷은 완전히 분리된다** — 배치가 429여도 조회·read는 안 깎이고, 반대도 마찬가지
- **가중치 없음** — 1건 보내든 100건 보내든 요청 1번 = 1 point.
  즉 **배치화 이득이 rate limit 관점에서 100배**다
  (`read`도 마찬가지: idList 500개를 한 번에 보내도 1 point)
- 왜 이렇게 빡센가: 요청 1건이 레코드 100개 × 백그라운드 잡(히스토리·워크플로우·임베딩)으로
  팬아웃돼 Redis 큐에 쌓인다. **2026-06-26 dev 장애 이후** 별도 버킷으로 분리하고 1 req/s 고정.
  코드 주석에 *"⚠️ 올리지 말 것 — OOM 위험"* 명시. 배치 상한 100도 같은 이유
- 429 본문 `{"success":false,"message":"Too Many Requests","reason":"N초 후 재시도해주세요."}`
  → **현행 정규식 파싱(`client.ts:108-118`) 그대로 유효.** `Retry-After` 헤더는 **없음**
- 2,000건이면 100×20요청, **1.1~1.2초 간격** 권장 (이론상 최소는 1s)
- 참고: 상품 `productElementList`는 create/update 공통으로 **상품 1개당 최대 50개**
  (우리는 구성 상품 미지원 — 이슈 「상품 구성(productElementList) 읽기 API 부재」)

**쿼타 단위: 워크스페이스(room)당.** 일반 버킷도 배치 버킷도 동일 (2026-08-04 확인).
사용자당이 아니다 — 같은 워크스페이스를 쓰는 **다른 사람·다른 MCP 클라이언트·API를 직접
쓰는 연동**이 전부 같은 1 req/s를 나눠 쓴다.

### A-7-1. 우리 쪽 대응 — ✅ **구현 완료** (2026-08-04, `d1c84a1`)

> 이관을 기다릴 이유가 없어 먼저 처리했다. 아래는 적용된 설계다.

이전 (`client.ts`): 버킷이 **하나**고 워크스페이스 구분도 없었다.

```ts
let lastRequestTime = 0;              // 전 엔드포인트 공용
const MIN_INTERVAL_MS = 120;          // 100req/10s 기준
```

**적용된 모양** — 버킷을 둘로 쪼개고 **워크스페이스별로 키를 건다**:

| 버킷 | 대상 | 간격 |
|---|---|---|
| `batch` | `/api/v\d+/object/(create\|update)` | **1,100ms** |
| `general` | 나머지 전부 | 120ms (현행) |

- 키는 `` `${client.fingerprint}:${bucket}` `` — `fingerprint`는 토큰 SHA-256이라 이미
  워크스페이스 식별자다(캐시 키·텔레메트리와 같은 값). **키를 안 걸면 A 워크스페이스의 배치
  생성이 B 워크스페이스를 1.1초 지연시킨다.** 120ms일 땐 안 보이던 문제가 1.1초에선 보인다
- 판정 정규식은 **백엔드 `authenticateApi.ts`와 같은 패턴**을 쓴다.
  ⚠️ `/v3/object/read`·`list`를 같이 묶으면 **배치 조회가 100배 느려진다** — 여기가 함정
- 고립된 단발 호출은 안 느려진다 (`elapsed` 비교라 직전 호출이 1.1초 이내일 때만 대기)
- 맵은 무한정 자라지 않게 상한을 둔다 (워크스페이스 수 × 2 엔트리)

**⚠️ 이걸로 429가 사라지지는 않는다.** 우리는 stateless 서버리스라
`lastRequestTime`은 **람다 인스턴스 안에서만** 사는 값이다:

- 인스턴스가 2개 뜨면 각자 "1초 지켰다"고 판단 → 합치면 초당 2회 → 429
- 콜드 스타트마다 리셋
- 쿼타가 워크스페이스당이라 **우리 서버 밖의 호출자**(다른 클라이언트·직접 연동)와도
  공유한다. 그 존재를 우리는 알 수 없다

→ **429 백오프(`client.ts:108-118`)가 최종 방어선이다.** 다행히 응답 본문의
`"N초 후 재시도해주세요"`를 파싱해 정확히 그만큼 기다리므로 추측이 아니라 한 번에 복구된다.
스로틀의 목적은 **429를 없애는 것이 아니라 왕복을 아끼는 것** — 어차피 기다릴 거면
거부당하기 전에 기다리는 편이 싸고 로그도 깨끗하다.

**실측 검증** (발신 시각 기준, 테스트 워크스페이스):

| | 측정 |
|---|---|
| 일반 조회 연속 3회 | 121~132ms |
| 배치 생성 연속 2회 | **1,102ms** |
| 조회 → 배치 전환 | 132ms (버킷 독립 확인) |
| 다른 지문의 배치 호출 | 36ms (워크스페이스 격리 확인) |

⚠️ 측정할 땐 **완료 시각이 아니라 발신 시각**을 봐야 한다. 스로틀은 요청 시작을 벌리므로
완료-완료 간격은 `interval - (첫 요청 소요시간)`으로 짧게 나온다(실제로 989ms가 나와
오판할 뻔했다). `globalThis.fetch`를 감싸 발신 시각을 찍는 게 정확하다.

### A-8. Idempotency-Key

`apiAction` 공통 미들웨어 → `/v3/object/create`·`/v3/object/update` **둘 다 지원**.

- TTL **24h** · key ≤255자 · scope = `roomId + userId + method + path + key`
- body+query fingerprint 비교
  - 같은 키 + 같은 body → **첫 응답 전문 replay** + `Idempotent-Replayed: true` 헤더
  - 같은 키 + **다른 body → 422** Unprocessable Entity
  - 처리 중 재요청 → 최대 15초 폴링 후 **409** Conflict
- **2xx만 캐시. 207도 캐시 대상**
  ← 부분 성공이 24h 고정되므로 **실패한 관계의 후속 처리는 반드시 다른 키로**
- 400/500은 캐시 안 함, lock 해제 → 같은 키로 재시도 가능

create의 미도입 결정(본문 해시로 자동 생성하면 **의도적** 중복 생성이 24h 조용히 막힘)은
여전히 유효. update는 같은 body 재전송이 멱등이라 도입 가치 있음.

### A-9. SAL-9582 — 시스템 관계 우선 → **실영향 0**

`/v3/object/{list,read,create,update}`, `/v3/association/list`에서 이름 충돌 시 항상 system
관계가 이기고, 동명 커스텀 관계는 응답에서 제외·입력에서 무시된다. **id 기반 우회 없음**
(object API는 관계를 이름으로만 받는다).

**운영 DB 직접 확인 (2026-07-31, 읽기 전용):**

```sql
SELECT cf.name, count(DISTINCT ca."roomId")
FROM "customFieldAssociation" ca
JOIN "customField" cf ON cf._id::text = ca."firstCustomFieldId"
WHERE ca."systemAssociationType" IS NULL AND cf.name LIKE '메인%'
GROUP BY 1;
```

```
커스텀 관계 정의                                       600건 / 138 워크스페이스
그중 '메인 고객·메인 회사·메인 딜·메인 리드'와 동명       0건
'메인'으로 시작하는 커스텀 관계 이름 자체                 0건
```

→ **영향받는 워크스페이스 없음.** `list-associations`(사용량 2위, 5,506회)에 주의 문구를
넣지 않는다. 실체 없는 경고를 최다 호출 도구에 얹지 않는다.
(워크스페이스가 생기면 재평가 — 위 쿼리를 다시 돌리면 된다.)

---

## §B. 착수 시 설계

### B-1. 실사용 근거 (텔레메트리 2026-06-01~07-29)

`salesmap-update-object` = **4,067회 / 도구 3위**, 성공률 98.8%(실패 47).
(1위 `list-engagements` 6,815 · 2위 `list-associations` 5,506)

| objectType | 호출 | v3 update |
|---|---:|---|
| organization | 2,333 (57%) | ✅ |
| people | 1,477 (36%) | ✅ |
| deal | 186 (4.6%) | ❌ |
| lead | 58 (1.4%) | ❌ |
| custom-object | 12 (0.3%) | ❌ |

**회사+고객 = 93.6%.** 착수 조건이 충족되면 나머지 6.4%도 같이 들어온다.

- `update-object → update-object` **연속 전이 3,752회 (92%)** → batch update 도입으로 해소할 대상
  (구 #1「Batch Update API 부재」는 원장 재구성 때 이 항목으로 흡수됐다)
- 리뉴어스랩 7/27~7/28 이틀간 **2,318회를 1초 간격 순차 호출** → 100건 배치면 24회
- `peopleId`/`organizationId` 전용 파라미터 실사용 88회
- **관계 배열을 `properties`에 넣는 호출 1,994회 (49%)** ← 최대 위험 (§B-3)

### B-2. 도구 개편 — `salesmap-update-object` → `salesmap-batch-update-objects`

2026-07-28 create 개편(`create-object` 삭제 → `batch-create-objects` 하나로 통일)과
정확히 같은 패턴. 도구 2개를 병존시키면 "어느 걸 쓰지"가 생기고, 그건 create에서 이미
겪고 폐기한 구조다.

```ts
salesmap-batch-update-objects({
  objectType: string,          // create와 동일 어휘: 한/영 별칭 + 커오 정의 이름
  inputList: [{                // 1~100건
    id: string,
    properties?: Record<string, string|number|boolean|null|string[]>,
    associations?: Record<string, string[] | null>,
  }],
  replace?: boolean,           // = v3 rewrite. 기본 false (A-3 근거)
})
```

- 도구 수 29 유지 (1 빠지고 1 들어옴)
- `objectId`(단수) → `inputList[].id`. **이름을 `id`로 맞춘다** (v3 와이어와 동일)
- `peopleId`/`organizationId` **제거** → `associations:{"메인 고객"/"메인 회사":[id]}`.
  create가 7/28에 같은 이유로 이미 제거했다 (`CLAUDE.md` 생성 도구 섹션).
  기존 v2의 **연결 문법 이중성**
  (기본 연결 = top-level `peopleId`/`organizationId`, 커스텀 연결 = fieldList 관계 키)의
  마지막 미구현 항목 해소
- 롤백 플래그 `V3_OBJECT_UPDATE`를 `generic.ts` 상단에 신설, v2 경로를 폴백으로 보존
  (관례: `V3_OBJECT_READ`·`V3_PIPELINES`·`V2_ACTIVITY`)

### B-3. 🔴 `properties` → `data` / `association` 자동 분리 (필수)

v2에서는 커스텀 연결도 `fieldList`의 관계 키로 넣는 게 **정상 문법**이다
(원장: *"커스텀 연결관계도 위 관계 키로 설정합니다"*). 그래서 실사용 49%가 그 형태다.
v3 `data`에 넣으면 **400**이므로 우리가 옮겨야 한다.

```
properties의 각 필드
  → GET /v2/field/{type} 스키마에서 타입 조회 (getFieldSchema, 토큰별 5분 캐시)
      ├ 관계형 (TYPE_TO_VALUE_KEY의 …ValueId / …ValueIdList 계열) → association
      └ 그 외                                                      → data
```

- `메인 고객`·`메인 회사`는 v2 필드 스키마에 **존재하지 않으므로**(딜·리드·고객·회사 4종 실측)
  이름 화이트리스트로 별도 처리
- 이동 사실은 create의 `warnings.normalizedInput`과 같은 방식으로 응답에 남긴다 —
  **조용히 고치지 않는다**
- **역방향도 필요** (v2 경로): `메인 고객`/`메인 회사` → top-level `peopleId`/`organizationId`,
  그 외 관계명 → `fieldList`의 관계 키

### B-4. 사용자 필드 — 경로별로 변환 방향이 뒤집힌다

**입력면은 하나로 — 이름이든 ID든 받고 내부에서 목적지에 맞춘다.**

| | v2 경로 (딜·리드·커오) | v3 경로 (회사·고객) |
|---|---|---|
| API가 받는 것 | `userValueId` = **UUID만** | `data` = **이름만** |
| 이름 입력 | 이름→UUID (현행 `getUserMap`) | 그대로 통과 |
| **UUID 입력** | 그대로 통과 | **UUID→이름 역변환** ← 신규 |

`fetchUserMap`이 이미 `/v2/user`를 전 페이지 순회하므로 역맵(`id→name`)은 같은 응답에서
만들 수 있다 — **추가 호출 0회.**

**에러도 방향을 맞춰 번역한다** (백엔드 코드를 그대로 흘리지 않는다):

| 백엔드 | 내려줄 문구 |
|---|---|
| `NOT_FOUND_USER` | *"'{입력값}'에 해당하는 사용자가 없습니다. `salesmap-list-users`로 확인하세요."* — v3가 UUID를 못 읽는다는 내부 사정은 노출하지 않음 |
| `AMBIGUOUS_USER` | 방어적 API 코드가 남아 있어도 제품 정책상 사용자 이름 중복 생성이 불가하므로 정상 입력에서는 도달하지 않음 |
| `INACTIVE_USER` | *"'{이름}'은 비활성·취소 상태입니다. 사용 중(Active)이거나 초대 대기(Pending)인 사용자만 가능합니다."* |

사용자와 팀 이름은 제품 정책상 중복 생성할 수 있으므로, 이름 기반 해석에서 별도 동명이인
분기 처리는 필요하지 않습니다.
v3는 400으로 막으므로 **v2 경로에도 같은 검사를 넣어 두 경로를 맞춘다.**

### B-5. 곁다리 수정 대상

1. ✅ **완료** (`d1c84a1`) — `needsUserLookup` 판정이 `canonicalFieldName` 교정 **이전의
   raw name**으로 스키마를 조회해, 자모가 깨진 user 필드(`"딥 담당자"` 실발생 3회)의
   **이름 문자열이 그대로 `userValueId`에 실려** 400이 나던 버그. 판정에 `canonicalFieldName`을
   태우고, 그러려면 `hasField`가 먼저 필요해 `TOP_LEVEL_ONLY`/`selectInput`/`hasField` 정의를
   위로 옮겼다. 실측 대조: `{"담당쟈":"양시열"}` → 전 `"userValueId":"양시열"` / 후 UUID
2. **`client.ts:462`** — user 배열 분기의 `if (errors.length > 0) continue`가 **전역** `errors`를
   본다. 앞선 다른 필드의 에러만으로 정상인 필드가 누락된다
3. **`client.ts` 207 힌트가 create 전용으로 하드코딩** — 두 군데가 틀렸다.
   ① *"레코드는 **생성**됐으나…"* → update에서 207이 나도 "생성됐다"고 말한다.
   ② *"실패한 연결만 `salesmap-update-object`로 처리하세요"* → update가 임의 association을
   못 받으므로 **실행 불가능한 안내**다. 새 도구가 association을 받으면 ②는 처음으로
   실행 가능해지고, ①은 요청 경로에 따라 문구를 갈라야 한다
4. **따옴표 필드명 교정** — `normalizeWrappedName`이 v3 create 경로 전용이라 update는 무방비.
   `api-quirks.ts`의 `ai-field-name-correction` `affects`에 update-object가 적혀 있는데
   실제로는 안 걸린다 (**문서-코드 어긋남**)
5. **커오 어휘 충돌** — update는 `"custom-object"` 리터럴을 **강제**하고,
   create/read는 리터럴을 **금지**하고 정의 이름을 요구한다. 정면 충돌.
   새 도구는 create 쪽에 맞추되 **v2 URL용 역변환**(정의 이름 → 리터럴)이 내부에 필요
6. ✅ **완료** (`d1c84a1`) — `batch-create-objects`의 *"활성 사용자 이름"* 이 부정확했다.
   Pending(초대 대기)도 지정 가능하므로 "사용 중이거나 초대 대기 중인 사용자"로 교정,
   `tool-spec.md` 재생성
7. **배치 오류의 구조가 문자열로 접힌다** (`client.ts` — `errors.map(JSON.stringify).join("\n")`).
   백엔드는 `{code, inputIndex, fieldName, message}`를 항목별로 주는데 MCP를 지나면
   줄바꿈으로 이어붙인 문자열 하나가 된다.

   실측 2026-08-05 (샌드박스, 없는 필드 2건 배치 생성):
   ```
   API  → errors:[{code:"PROPERTY_DOESNT_EXIST", inputIndex:0, fieldName:"없는필드1", …},
                  {…, inputIndex:1, …}]
   MCP  → {"error":"{\"code\":\"PROPERTY_DOESNT_EXIST\",\"inputIndex\":0,…}\n{…}"}
   ```

   **우선순위 낮음 — 정보 손실은 없다.** `JSON.stringify`라 `inputIndex`·`fieldName`이
   문자열 안에 살아 있고, 400은 **저장 전 전체 거부**라 "성공분 빼고 재시도"라는 상황이
   아예 안 생긴다(통째로 다시 보내면 된다). 부분 성공이 생기는 건 207뿐인데
   **207은 이미 `errors`를 객체 배열 그대로 넘긴다** — 평탄화는 400 경로에만 해당한다.

   고친다면 `{error, errors:[…원형], hint}` 형태로. 이스케이프 범벅을 LLM이 헛읽을
   여지를 없애는 가독성 개선이 실익이다.

### B-6. 내부 분기 시 주의

**v2 순회는 `Promise.all` 병렬 금지.** 스로틀의 `lastRequestAt`은 호출 **시작 시점**에
기록되므로, 동시 진입하면 모두 같은 `elapsed`를 읽고 같은 시각에 깨어나는 thundering herd가
된다 (`V3_OBJECT_READ`의 v2 폴백 경로에 남아 있는 취약점 — 여기서 재현하지 않는다).
순차 호출이면 `MIN_INTERVAL_MS`(120ms) 스로틀이 이미 간격을 벌려준다.

v2 순회의 부분 실패는 **v3의 207과 같은 모양으로 정규화**해 돌려준다 —
`{partialSuccess:true, objectList:[…성공 id], errors:[{inputIndex, message}], hint}`.
**"성공한 건 재시도하지 마라"가 응답만 보고 판명돼야 한다.**

### B-7. quirks / 문서

- `top-level-split` — `affects`에서 update-object 제거, `removeWhen` 축소.
  **완전 제거는 아직 아님** (딜·리드·커오 v2 경로가 남으면; 전 타입 지원 시엔 제거)
- `fieldlist-type-key`·`system-select-input-value`·`ai-field-name-correction`의
  `affects` 갱신 — v2 잔존 구간 표기
- 전 타입 지원 전에 착수하는 경우에만: 신규 quirk `v3-update-partial-type-support`
- 관계 대량 처리는 batch update 반영 후 readiness 원장에 별도 이슈로 남기지 않으며,
  「v2 Top-level 파라미터 분리」(L-2)는 기본 연결 항목 해소 표시
- `docs/tool-spec.md` 재생성 (`npx tsx scripts/tool-spec.mts`), `CLAUDE.md` 입력 규약 표 갱신
- **오버레이는 건드리지 않는다** — v3는 비공개 API라 공개 문서에 실을 수 없다
  (`api-ref-overlay.md` 비공개 API 배제 방침, 실었다 제거한 선례 있음)

### B-8. 검증

테스트 워크스페이스(`MCP 테스트`, room `d3427862-daee-44ec-a66d-73e07e9b3f72`) 실측.
테스트 레코드 정리 불필요. **실계정은 조회만.**

1. **v3 경로** — 단건/100건 배치 / `rewrite` false·true 각각의 다중값·관계 거동 /
   `null` 해제 / 207(orphan 유발) / 무효 id 섞기(전체 거부 확인) / 중복 id / **UUID 형식 불량(500 여부)**
2. **🔴 관계 필드 자동 이동** — `properties:{"상위 협력사":[id]}`(실사용 49% 패턴)가
   정확히 반영되는지. **수정 후 `batch-read-objects`로 전 필드 역확인**
   (2026-07-29 `da4de0a`의 "top-level만 보내면 나머지가 조용히 사라짐" 재발 방지와 같은 검사)
3. **사용자 필드 양방향** — 이름 입력·UUID 입력 각각 / 비활성 / Pending
4. **날짜** — `date`의 `2026-07-29`는 KST 자정, `dateTime`의 같은 입력은 400, offset 포함
   date-time은 그대로 저장되는지 확인
5. **v2 잔존 경로** — 부분 실패 정규화 / 커오 정의 이름 ↔ 리터럴 역변환
6. **회귀** — `npx tsx scripts/tool-spec.mts --check`, `npm run build`,
   `node scripts/quirks.mjs`(제거한 quirk가 매니페스트에서도 빠졌는지)

---

## §C. 백엔드에 남은 요청 (다음 피드백 리포트에 포함)

1. **UUID 형식 불량 시 500 → 400** — `inputList[].id` 입력 스키마에 형식 검증이 없어
   PG UUID 파싱 오류로 샌다. 500은 재시도를 유발한다
2. **계산 필드를 보내면 400 또는 207 `errors`** — 현재 완전 무음(200). 백엔드도 동의
3. **429에 `Retry-After` 헤더** — 현재 본문 문구를 정규식으로 파싱 중
4. **딜·리드·커오·상품 update 로드맵** — 제품 담당자 확인 필요 (**이 문서의 착수 조건**)
5. **상품 update 지원 범위** — 예정된 batch update에 상품을 포함해야 함. 현재 v2·v3에는
   수정 경로가 없어 생성만 되고 고칠 수 없음
