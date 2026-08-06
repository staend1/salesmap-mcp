# 세일즈맵 MCP 가이드

> 세션 시작 시 또는 어떤 도구를 써야 할지 모를 때 참조하세요.

---

## 오브젝트 모델

세일즈맵은 B2B 영업 CRM입니다.

### 관계 구조

```
고객 (people) ──┐
                ├──→ 리드 (lead) ──→ 딜 (deal)
회사 (org)    ──┘
고객 ↔ 회사 (N:N 연결)
커스텀 오브젝트 — 어떤 오브젝트에도 자유롭게 연결 가능
```

**핵심:** 리드에서 딜을 생성해도 리드는 사라지지 않고 공존합니다. 딜·리드 모두 고객·회사에 직접 연결됩니다.

### 오브젝트 정의

| 오브젝트 | 정의 |
|---|---|
| 고객 (people) | 잠재 고객부터 기존 고객까지 모든 개인의 연락처·이력. 회사 없이 독립 존재 가능 |
| 회사 (organization) | 여러 고객이 소속된 법인체 정보. B2B 계약 주체 |
| 리드 (lead) | **마케팅 단계** 영업 기회. 웹폼·콘텐츠 다운로드 등 초기 관심 단계. 리드 파이프라인으로 MQL 육성 |
| 딜 (deal) | **세일즈 단계** 영업 기회. 계약 성사 목표, 협상 상태·금액·파이프라인 관리 |
| 커스텀 오브젝트 | 워크스페이스별 맞춤 데이터. 예: 티켓(회사 연결), 정산(딜 연결), 수업(딜+강사+수강생 연결) |
| 메모 (memo) | 고객·딜 등에 남기는 내부 기록. 미팅 노트·상담 내용 등 |
| TODO | 영업 담당자의 할 일. 전화·미팅·업무 등 follow-up 관리 |
| 견적서 (quote) | 딜·리드에 연결된 가격 제안서. 상품×수량×할인 |
| 상품 (product) | 판매하는 제품/서비스. 일반형 또는 구독형(월간·연간) |
| 시퀀스 (sequence) | 자동화된 이메일 캠페인. 단계별 발송·오픈/클릭/회신 추적 |

**전형적인 흐름:** 웹폼 → 고객·회사 생성 → 리드(마케팅 육성) → 딜 생성(리드 유지) → 파이프라인 진행 → 견적서 발송 → 성사/실패

---

## MCP 도구 맵

| 카테고리 | 도구 |
|---|---|
| 탐색·메타 | `list-objects`, `get-user-details`, `list-users`, `list-teams` |
| 레코드 조회 | `search-objects`, `batch-read-objects` |
| 관계 탐색 | `list-associations` |
| 타임라인·노트 | `list-engagements`, `list-notes`, `read-note` |
| 이력·변경 | `list-changelog`, `get-lead-time` |
| 레코드 생성·수정·삭제 | `create-object`, `update-object`, `delete-object` |
| 노트 생성 | `create-note` |
| 필드 관리 | `list-properties`, `create-property` |
| 파이프라인·견적 | `get-pipelines`, `list-products`, `create-quote`, `get-quotes`, `get-link` |
| 시퀀스·웹폼 | `list-sequences`, `list-webforms` |

---

## 시나리오별 도구 조합

### 레코드 조회·분석
```
search-objects(objectType, filterGroups)
  → batch-read-objects(objectIds, fieldList?)      # 상세 필드 조회
  → list-engagements(objectId, types?)             # 타임라인 (이메일·노트·미팅 등)
  → list-notes(leadId | dealId | ...)              # 메모 목록
```

### 연결 레코드 함께 읽기
```
list-associations(objectType)                      # 사용 가능한 관계명 확인
  → batch-read-objects(objectIds, associationList) # 관계 레코드 인라인 포함
```

### 레코드 생성 (연결된 상태로)
생성 순서 엄수: **회사 → 고객 → 딜/리드** (부모 ID가 먼저 존재해야 함)
```
create-object(objectType: "organization", properties)
  → create-object(objectType: "people", properties + organizationId)
  → create-object(objectType: "deal" | "lead", properties + peopleId + organizationId)
```
⚠️ 리드 생성 시 `peopleId` 또는 `organizationId` 중 하나 **필수**.  
순서를 지키지 않아도 각각 독립 생성 후 update-object로 나중에 연결 가능.

### 레코드 수정
```
search-objects(objectType, filterGroups)           # ID 확인
  → list-properties(objectType)                    # 정확한 필드명·옵션 확인
  → update-object(id, objectType, fieldList)
```

### 필드 추가
```
list-properties(objectType)                        # 기존 필드 확인
  → create-property(objectType, name, type, ...)
```
formula(계산 유형) 필드는 아래 **계산 유형 필드** 섹션 참조.

### 견적서 생성
```
get-pipelines(objectType: "deal")                  # 파이프라인·단계 ID 확인
  → list-products()                                # 상품 ID·가격 확인
  → create-quote(dealId OR leadId, quoteProductList)
```
⚠️ 구독형 상품 포함 시: `quoteProductList[].properties["결제 횟수"]`·`quoteProductList[].properties["시작 결제일"]` 필수.

### 파이프라인 체류 시간 분석
```
search-objects(objectType, filterGroups)
  → get-lead-time(objectType, objectId)            # 단계별 진입일·체류시간·퇴장일
```

---

## fieldList 핵심 규칙

`create-object`·`update-object`에서 커스텀 필드 값은 `fieldList` 배열로 지정.  
`name`은 세일즈맵 UI의 **한글 필드명과 정확히 일치**해야 함 (`list-properties`로 확인).

### 값 키 (필드 타입별)

| 타입 | 값 키 | 예시 |
|---|---|---|
| 텍스트·단일 선택 | `stringValue` | `{ "name": "상태", "stringValue": "활성" }` |
| 숫자 | `numberValue` | `{ "name": "직원수", "numberValue": 50 }` |
| 복수 선택 | `stringValueList` | `{ "name": "관심 제품", "stringValueList": ["CRM"] }` |
| 날짜 | `dateValue` | `{ "name": "계약일", "dateValue": "2026-01-15" }` |
| 불리언 | `booleanValue` | `{ "name": "동의 여부", "booleanValue": true }` |
| 사용자(단일) | `userValueId` | `{ "name": "담당자", "userValueId": "<userId>" }` |
| 사용자(복수) | `userValueIdList` | `{ "name": "팔로워", "userValueIdList": ["<id>"] }` |
| 고객 | `peopleValueId` / `peopleValueIdList` | `{ "name": "담당 고객", "peopleValueId": "<id>" }` |
| 회사 | `organizationValueId` | `{ "name": "거래처", "organizationValueId": "<id>" }` |

### 자주 틀리는 패턴

| 잘못된 방법 | 올바른 방법 |
|---|---|
| top-level `ownerId` 전달 | `fieldList`의 `userValueId` 사용 |
| `fieldList`에 `{ name: "금액" }` (딜) | top-level `price` 파라미터 사용 |
| 담당자 이름을 `stringValue`로 | `userValueId`에 userId 전달 (`list-users`로 확인) |
| 선택 필드에 미등록 옵션 값 | `list-properties`에서 정확한 옵션 확인 후 사용 |
| `stringValue: ""` (빈 문자열) | 필드 초기화는 해당 항목을 `fieldList`에서 생략 |

---

## 계산 유형 필드 (Formula)

### 개요
`formula` 파라미터에 수식을 입력하면 **계산 유형 필드**가 됩니다.  
다른 필드의 값을 참조해 자동 계산 결과를 채웁니다.  
`type`은 수식의 최종 출력 타입으로 지정해야 합니다.

**변수 참조 형식:** `{{오브젝트명.필드명}}`  
예: `{{딜.금액}}`, `{{고객.나이}}`, `{{회사.직원수}}`

**제약:** `formula` 사용 시 `options`, `showInCreateForm`, `required`, `preventDuplicates` 설정 불가.

> ⚠️ `date_comp`는 두 날짜 차이를 **분(minute) 단위**로 반환합니다.  
> 일 단위로 쓰려면 `minute_to_day(date_comp(...))` 로 감싸세요.

---

### 연산자

#### 산술 연산자 — 숫자 전용

| 연산자 | 설명 | 예시 |
|--------|------|------|
| `+` | 더하기 | `1 + 1`, `{{상품.금액}} + 32` |
| `-` | 빼기 | `2 - 1` |
| `*` | 곱하기 | `2 * 3` |
| `/` | 나누기 | `6 / 3` |

#### 비교 연산자 — 반환: boolean

| 연산자 | 설명 | 지원 타입 | 예시 |
|--------|------|-----------|------|
| `<` | 왼쪽이 더 작음 | 숫자 | `3 < 10` → true |
| `>` | 왼쪽이 더 큼 | 숫자 | `10 > 3` → true |
| `<=` | 작거나 같음 | 숫자 | `10 <= 10` → true |
| `>=` | 크거나 같음 | 숫자 | `10 >= 13` → false |
| `==` | 같음 | 숫자, 문자, 날짜 | `{{딜.상태}} == "Won"` |
| `!=` | 다름 | 숫자, 문자, 날짜 | `123 != 321` → true |

#### 논리 연산자 — 반환: boolean

| 연산자 | 설명 | 예시 |
|--------|------|------|
| `||` | OR — 하나라도 참이면 참 | `3 > 2 || "22" == "33"` → true |
| `&&` | AND — 둘 다 참이어야 참 | `3 > 2 && "22" != "33"` → true |

---

### 함수

#### 수치 연산

| 함수 | 시그니처 | 반환 | 설명 | 예시 |
|------|----------|------|------|------|
| `min` | `min(숫자, 숫자)` | 숫자 | 더 작은 값 | `min(20, 10)` = 10 |
| `max` | `max(숫자, 숫자)` | 숫자 | 더 큰 값 | `max(20, 10)` = 20 |
| `abs` | `abs(숫자)` | 숫자 | 절댓값 | `abs(-20)` = 20 |
| `round_down` | `round_down(숫자1, 숫자2)` | 숫자 | 숫자2 자리로 내림. 음수=정수 자리 | `round_down(20.151, 2)` = 20.15 |
| `round_up` | `round_up(숫자1, 숫자2)` | 숫자 | 숫자2 자리로 올림. 음수=정수 자리 | `round_up(20.5, 0)` = 21 |
| `round` | `round(숫자1, 숫자2)` | 숫자 | 숫자2 자리로 반올림. 음수=정수 자리 | `round(20.151, 2)` = 20.15 |

#### 문자열

| 함수 | 시그니처 | 반환 | 설명 | 예시 |
|------|----------|------|------|------|
| `concat` | `concat(문자, 문자)` | 문자 | 두 문자열 이어붙이기 | `concat("안", "녕하세요")` = "안녕하세요" |
| `contains` | `contains(문자열, 문자열)` | boolean | 포함 여부 확인 | `contains("CRM 솔루션", "CRM")` = true |
| `length` | `length(문자열)` | 숫자 | 문자 수 (공백 포함) | `length({{회사.이름}})` |
| `lowercase` | `lowercase(문자열)` | 문자 | 영문 소문자 변환 | `lowercase("Salesmap")` = "salesmap" |
| `uppercase` | `uppercase(문자열)` | 문자 | 영문 대문자 변환 | `uppercase("Salesmap")` = "SALESMAP" |
| `to_string` | `to_string(숫자\|날짜\|날짜시간)` | 문자 | 타입을 문자열로 변환 | `to_string({{고객.최근 수정날짜}})` = "2024-12-20 14:33" |
| `sub_string` | `sub_string(문자열, 숫자1, 숫자2)` | 문자 | 숫자1번째부터 숫자2 길이 추출 (0-indexed) | `sub_string("가나다라", 1, 2)` = "나다" |

#### 날짜/시간 생성·추출

| 함수 | 시그니처 | 반환 | 설명 | 예시 |
|------|----------|------|------|------|
| `new_date` | `new_date(연도, 월, 일)` | 날짜 | 날짜 생성 | `new_date(2025, 1, 1)` |
| `new_datetime` | `new_datetime(연도, 월, 일, 시, 분)` | 날짜시간 | 날짜+시간 생성 | `new_datetime(2025, 1, 1, 9, 0)` |
| `year` | `year(날짜\|날짜시간)` | 숫자 | 연도 추출 | `year(new_date(2025, 1, 1))` = 2025 |
| `month` | `month(날짜\|날짜시간)` | 숫자 | 월 추출 | `month(new_date(2025, 1, 1))` = 1 |
| `day` | `day(날짜\|날짜시간)` | 숫자 | 일 추출 | `day(new_date(2025, 1, 1))` = 1 |
| `hour` | `hour(날짜시간)` | 숫자 | 시 추출 | `hour(new_datetime(2025,1,1,9,0))` = 9 |
| `minute` | `minute(날짜시간)` | 숫자 | 분 추출 | `minute(new_datetime(2025,1,1,9,0))` = 0 |
| `minute_to_hour` | `minute_to_hour(숫자)` | 숫자 | 분 → 시간 | `minute_to_hour(date_comp(...))` |
| `minute_to_day` | `minute_to_day(숫자)` | 숫자 | 분 → 일 | `minute_to_day(date_comp(...))` |

#### 날짜 연산

| 함수 | 시그니처 | 반환 | 설명 | 예시 |
|------|----------|------|------|------|
| `add_year` | `add_year(날짜, 숫자)` | 날짜 | 연도 더하기 | `add_year(new_date(2025,1,1), 10)` = 2035-01-01 |
| `sub_year` | `sub_year(날짜, 숫자)` | 날짜 | 연도 빼기 | `sub_year(new_date(2025,1,1), 10)` = 2015-01-01 |
| `add_month` | `add_month(날짜, 숫자)` | 날짜 | 월 더하기 | `add_month(new_date(2025,1,1), 10)` = 2025-11-01 |
| `sub_month` | `sub_month(날짜, 숫자)` | 날짜 | 월 빼기 | `sub_month({{딜.구독 종료일}}, 1)` |
| `add_day` | `add_day(날짜, 숫자)` | 날짜 | 일 더하기 | `add_day(new_date(2025,1,1), 10)` = 2025-01-11 |
| `sub_day` | `sub_day(날짜, 숫자)` | 날짜 | 일 빼기 | `sub_day(new_date(2025,1,1), 10)` = 2024-12-22 |
| `add_hour` | `add_hour(날짜시간, 숫자)` | 날짜시간 | 시 더하기 | `add_hour(new_datetime(2025,1,1,9,0), 5)` = 13:00 |
| `sub_hour` | `sub_hour(날짜시간, 숫자)` | 날짜시간 | 시 빼기 | `sub_hour(new_datetime(2025,1,1,9,0), 5)` = 04:00 |
| `add_min` | `add_min(날짜시간, 숫자)` | 날짜시간 | 분 더하기 | `add_min(new_datetime(2025,1,1,9,0), 5)` = 09:05 |
| `sub_min` | `sub_min(날짜시간, 숫자)` | 날짜시간 | 분 빼기 | `sub_min(new_datetime(2025,1,1,9,0), 5)` = 08:55 |
| `date_comp` | `date_comp(날짜\|날짜시간, 날짜\|날짜시간)` | 숫자(분) | 두 날짜 차이 (분 단위 반환) | `date_comp({{고객.고객생일}}, new_date(2025,10,25))` |
| `weekday` | `weekday(날짜\|날짜시간)` | 숫자 | 요일 (일=0, 월=1, …, 토=6) | `weekday({{고객.생성 일자}})` |

#### 논리

| 함수 | 시그니처 | 반환 | 설명 | 예시 |
|------|----------|------|------|------|
| `if` | `if(논리식, 결과1, 결과2)` | 결과1 또는 결과2 | 조건 분기. 중첩 가능 | `if({{고객.나이}} > 20, "미성년자", "성인")` |
| `is_null` | `is_null(변수)` | boolean | 값 없으면 true | `is_null({{고객.나이}})` |

---

### 수식 예시

```
// 딜 금액의 80%
{{딜.금액}} * 0.8

// 구독 만료 30일 전 날짜
sub_day({{딜.구독 종료일}}, 30)

// 나이대 분류 (중첩 if)
if({{회사.직원수}} == 20, "적정 규모", if({{회사.직원수}} > 20, "규모 초과", "규모 미달"))

// 두 날짜 차이를 일 단위로
minute_to_day(date_comp({{고객.가입일}}, new_date(2025, 10, 25)))

// Won 여부 확인
{{딜.상태}} == "Won"

// 이름에 "님" 붙이기
concat({{고객.이름}}, "님")
```
