# v3 `object/update` 이관 계획 — **보류 중**

> **상태**: 보류 (2026-07-31 결정) · **착수 조건 충족 시 이 문서만 보고 바로 시작할 수 있게 작성됨**

## 왜 보류했나

`POST /api/v3/object/update`가 2026-07-31에 열렸지만 **회사·고객 2종만** 지원한다.
지금 이관하면 도구 하나 안에 **v3 배치 경로와 v2 단건 순회 경로를 동시에 유지**해야 하고,
그 분기가 사용자 필드 변환 방향(§B-4)·관계 문법(§B-3)·커오 어휘(§B-5)에서 전부 갈린다.
딜·리드·커오·상품까지 열린 뒤에 한 번에 옮기는 편이 코드가 절반이다.

**착수 조건**: `POST /v3/object/update`가 **딜·리드·커스텀 오브젝트·상품**을 지원할 때.

> 백엔드 회신(2026-07-31): 코드·커밋 로그상 계획 확인 안 됨. 제품 담당자 확인 필요.
> 확인되면 이 문서의 §B대로 진행. §A는 그때 재질의 없이 그대로 쓸 수 있다.

**출처**: 백엔드 에이전트 2인(decode·bugman) 릴리즈 노트 + 13문항 추가 질의 회신
(2026-07-31, 양쪽 prod main 코드 실측 기준). 원장 `docs/salesmap-api-reference-2026-07-30.md`,
라이브 OpenAPI, 운영 DB와 교차 확인.

---

## §A. 확정된 사실

### A-1. 지원 범위 — 보류의 이유

| 오브젝트 | v3 배치 **생성** | v3 배치 **수정** | v2 단건 **수정** |
|---|:---:|:---:|:---:|
| 고객 · 회사 | ✅ | ✅ | ✅ |
| 딜 · 리드 · 커스텀 오브젝트 | ✅ | ❌ 400 | ✅ |
| 상품 | ✅ (2026-07-29) | ❌ | ❌ **경로 없음** |
| 견적서 | ❌ (`create-quote` 전용) | ❌ | ❌ |

코드 근거: `updateObjectListForApiFunc`에서 Organization·People 외는
`throw ApiError.badRequest('지원하지 않는 오브젝트 유형입니다')`.

**상품만 유일하게 수정 경로가 아예 없다** — 생성은 되는데 못 고친다 (이슈 #21).

**prod 배포 확인됨** — `HEAD /api/v3/object/update` → 204, 무인증 POST → 401(404 아님).

### A-2. 요청 형식

```jsonc
POST /api/v3/object/update
{
  "objectType": "회사" | "고객",          // 그 외 400
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
| 동명이인 | `AMBIGUOUS_USER` 400 |
| 비활성 | `INACTIVE_USER` 400. **Active + Pending 허용** (Active만이 아님) |
| `date` 타입 | 시각 버리고 KST 해당 날짜 00:00 저장 |
| `dateTime` 타입 | offset 명시 ISO는 그대로. **날짜만 보내면 현재 KST 시각 주입** (create와 동일 함정). bugman은 "분 단위 내림"도 언급 — decode 미언급, **미실측** |
| 계산 필드 | **완전 무음** — 200에 errors·warning 없이 버려짐 (`if (customField.astTree) return false;`). `allowedDataFieldNameSet`에는 포함돼 `PROPERTY_DOESNT_EXIST`도 안 남 |
| 값 타입 | string · number · boolean · string[] · null |
| 지원 시스템 필드 | `이름` · `프로필 사진` · `담당자` · `생성 날짜` |

🔑 **`toKstBoundary`(`T00:00:00.000+09:00`)가 v3 update에서도 그대로 유효하다.**
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

`errors[]` = `{code, inputIndex, fieldName, message, context}`
— **create보다 구조화가 낫다** (`inputIndex`로 몇 번째 항목인지 특정 가능).
코드: `INVALID_OPTION` · `STORAGE_UNIQUE_CONFLICT` · `REQUIRED_FIELD` · `ASSOCIATION_FAILED`.

**207의 유일한 사례**: 딜·리드가 고객도 회사도 없는 **orphan**이 되는 관계 해제.
필드는 이미 반영됐으므로 **단순 재시도 금지**.
`client.ts:132-143`의 207 처리가 공통 경로라 자동 적용된다 (힌트 문구만 §B-5 참조).

### A-7. Rate limit ⚠️

| 구분 | 한도 |
|---|---|
| 일반 v2/v3 | 100 req / 10s per room |
| **`/v3/object/{create,update}`** | **1 req / 1s, 버스트 없음, 전용 버킷** |

- **가중치 없음** — 100건 1요청 = 1건 1요청 = 1 point.
  **배치화 이득이 rate limit 관점에서 100배**
- 배치 버킷은 조회 버킷과 **분리** → 배치가 429여도 조회는 무영향
- 429 본문 `{"success":false,"message":"Too Many Requests","reason":"N초 후 재시도해주세요."}`
  → **현행 정규식 파싱(`client.ts:108-118`) 그대로 유효.** `Retry-After` 헤더는 **없음**
- 2,000건이면 100×20요청, **1.1~1.2초 간격** 권장

> ⚠️ **이건 v3 update를 안 해도 지금 문제다.** `client.ts:13`의 `MIN_INTERVAL_MS = 120`은
> 100req/10s 기준이라 **이미 배포된 `batch-create-objects`가 연속 호출되면 429가 난다.**
> 사용량이 아직 31회뿐이라 안 터졌을 뿐. 별도 안건으로 다룬다.

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

- `update-object → update-object` **연속 전이 3,752회 (92%)** → 이슈 **#1**·**#20** 해소 대상
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
  이슈 **#3「연결 문법 이중성」**의 마지막 미구현 항목
  (`salesmap-api-issues.md` — *"기본 연결만 아직 우회 미적용 … 코드 십수 줄"*) 해소
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
| `AMBIGUOUS_USER` | *"'{이름}' 사용자가 여러 명입니다. 레코드 ID로 지정하세요."* ← **ID를 권하는 게 맞는 방향**(우리가 이름으로 바꿔 보냄) |
| `INACTIVE_USER` | *"'{이름}'은 비활성·취소 상태입니다. 사용 중(Active)이거나 초대 대기(Pending)인 사용자만 가능합니다."* |

동명이인은 현재 **조용히 마지막 사용자가 이긴다** (`fetchUserMap`의 `map.set(u.name, u.id)`).
v3는 400으로 막으므로 **v2 경로에도 같은 검사를 넣어 두 경로를 맞춘다.**

### B-5. 곁다리 수정 대상

1. **`client.ts:366-381` 실질 버그** — `needsUserLookup` 판정이 `canonicalFieldName` 교정
   **이전의 raw name**으로 스키마를 조회한다. 자모가 깨진 user 필드(`"딥 담당자"` 실발생 3회)는
   `userMap`이 로드되지 않아 `client.ts:438`의 `&& userMap` 가드에 막히고, **이름 문자열이
   그대로 `userValueId`에 실려** 백엔드 400이 난다. v2 경로가 남으므로 반드시 고친다
2. **`client.ts:462`** — user 배열 분기의 `if (errors.length > 0) continue`가 **전역** `errors`를
   본다. 앞선 다른 필드의 에러만으로 정상인 필드가 누락된다
3. **`client.ts:141` 207 힌트** — *"실패한 연결만 `salesmap-update-object`로 처리하세요"* 가
   지금은 **실행 불가능한 안내**다(update가 임의 association을 못 받으므로).
   새 도구명으로 바꾸면 처음으로 실제 실행 가능해진다
4. **따옴표 필드명 교정** — `normalizeWrappedName`이 v3 create 경로 전용이라 update는 무방비.
   `api-quirks.ts`의 `ai-field-name-correction` `affects`에 update-object가 적혀 있는데
   실제로는 안 걸린다 (**문서-코드 어긋남**)
5. **커오 어휘 충돌** — update는 `"custom-object"` 리터럴을 **강제**하고,
   create/read는 리터럴을 **금지**하고 정의 이름을 요구한다. 정면 충돌.
   새 도구는 create 쪽에 맞추되 **v2 URL용 역변환**(정의 이름 → 리터럴)이 내부에 필요
6. **description 문구** — `batch-create-objects`의 *"활성 사용자 이름"* 은 부정확.
   Pending도 허용되므로 "사용 중인 사용자"가 맞다

### B-6. 내부 분기 시 주의

**v2 순회는 `Promise.all` 병렬 금지.** `client.ts`의 `lastRequestTime`이 모듈 전역이라
동시 진입 시 모두 같은 `elapsed`를 읽고 같은 시각에 깨어나는 thundering herd가 된다
(`V3_OBJECT_READ`의 v2 폴백 경로에 남아 있는 취약점 — 여기서 재현하지 않는다).
`MIN_INTERVAL_MS` 전역 스로틀이 순차 호출을 이미 직렬화한다.

v2 순회의 부분 실패는 **v3의 207과 같은 모양으로 정규화**해 돌려준다 —
`{partialSuccess:true, objectList:[…성공 id], errors:[{inputIndex, message}], hint}`.
**"성공한 건 재시도하지 마라"가 응답만 보고 판명돼야 한다.**

### B-7. quirks / 문서

- `top-level-split` — `affects`에서 update-object 제거, `removeWhen` 축소.
  **완전 제거는 아직 아님** (딜·리드·커오 v2 경로가 남으면; 전 타입 지원 시엔 제거)
- `fieldlist-type-key`·`system-select-input-value`·`ai-field-name-correction`의
  `affects` 갱신 — v2 잔존 구간 표기
- 전 타입 지원 전에 착수하는 경우에만: 신규 quirk `v3-update-partial-type-support`
- 이슈 **#1**·**#20** → 해결로 이동, **#3**은 기본 연결 항목 해소 표시
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
3. **사용자 필드 양방향** — 이름 입력·UUID 입력 각각 / 동명이인 / 비활성 / Pending
4. **날짜** — `2026-07-29` 입력이 KST 자정으로 저장되는지 (`date`·`dateTime` 각각)
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
5. **상품 수정 경로 부재** — v2·v3 모두 없음. 생성만 되고 못 고침 (이슈 #21)
