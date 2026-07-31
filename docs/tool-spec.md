# MCP 도구 명세

> ⚠️ **생성물입니다. 직접 수정하지 마세요.**
> 도구를 추가·변경한 뒤 `npx tsx scripts/tool-spec.mts`로 다시 만드세요.
> 소스: `src/tools/{field,search,generic,extras}.ts`

총 **29개** 도구.

## 한눈에

| 도구 | 성격 | 파라미터 |
|---|:---:|---|
| `salesmap-list-objects` | 읽기 | — |
| `salesmap-list-properties` | 읽기 | `objectType` |
| `salesmap-search-objects` | 읽기 | `objectType` `filterGroups` `after`? |
| `salesmap-batch-read-objects` | 읽기 | `objectType` `objectIds` `fieldList`? `associationList`? |
| `salesmap-batch-create-objects` | 쓰기 | `objectType` `inputList` |
| `salesmap-update-object` | 쓰기 | `objectType` `objectId` `properties`? `peopleId`? `organizationId`? |
| `salesmap-delete-object` | 삭제 | `objectType` `objectId` `confirmed`? |
| `salesmap-get-lead-time` | 읽기 | `objectType` `objectId` |
| `salesmap-get-link` | 읽기 | `objectType` `objectId` |
| `salesmap-list-associations` | 읽기 | `objectType` |
| `salesmap-create-note` | 쓰기 | `objectType` `objectId` `note` |
| `salesmap-get-quotes` | 읽기 | `objectType` `objectId` |
| `salesmap-create-quote` | 쓰기 | `dealId`? `leadId`? `note`? `properties` `quoteProductList`? |
| `salesmap-list-notes` | 읽기 | `after`? `startDate`? `endDate`? `owner`? `type`? `leadId`? `dealId`? `peopleId`? `organizationId`? |
| `salesmap-get-pipelines` | 읽기 | `objectType` |
| `salesmap-list-users` | 읽기 | `after`? |
| `salesmap-list-teams` | 읽기 | `after`? |
| `salesmap-list-products` | 읽기 | `after`? |
| `salesmap-list-sequences` | 읽기 | `after`? |
| `salesmap-list-webforms` | 읽기 | `after`? |
| `salesmap-get-user-details` | 읽기 | — |
| `salesmap-read-engagement` | 읽기 | `type` `id` |
| `salesmap-list-changelog` | 읽기 | `objectType` `objectId` `after`? |
| `salesmap-create-property` | 쓰기 | `objectType` `name` `type` `customObjectDefinitionName`? `customObjectDefinitionId`? `description`? `showInCreateForm`? `required`? `options`? `preventDuplicates`? `formula`? |
| `salesmap-get-guide` | 읽기 | — |
| `salesmap-get-api-ref` | 읽기 | — |
| `salesmap-run-script` | 쓰기 | `script` |
| `salesmap-report-feedback` | 쓰기 | `category` `summary` `detail` |
| `salesmap-list-engagements` | 읽기 | `objectType` `objectId` `types`? `startDate`? `endDate`? `limit`? `after`? |

---

## 상세

### `salesmap-list-objects`

- 성격: **읽기** · 정의: `src/tools/field.ts`

```
🎯 워크스페이스의 오브젝트 목록 조회.
```

파라미터 없음.

### `salesmap-list-properties`

- 성격: **읽기** · 정의: `src/tools/field.ts`

```
🎯 오브젝트의 필드 스키마(이름·타입·옵션) 조회.
🧭 필드 이름이나 허용 값이 불확실할 때 사용.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `string` | ✅ | 오브젝트 타입: deal \| lead \| people \| organization \| product \| quote \| quote-product \| todo \| custom-object. 견적서 상품은 'quote-product'(에러 메시지의 'QuoteProduct' 표기도 받습니다). |

### `salesmap-search-objects`

- 성격: **읽기** · 정의: `src/tools/search.ts`

```
🎯 레코드 필터 검색 (그룹 간 OR, 내 AND, 3×3). id·name만 반환.
📦 상세는 salesmap-batch-read-objects로 후속 조회.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `enum(people|organization|deal|lead)` | ✅ | 검색 대상 오브젝트 |
| `filterGroups` | `{filters}[]` | ✅ | 필터 그룹 (그룹 간 OR) |
| `after` | `string` |  | 페이지네이션 커서 |

`filterGroups` 항목 구조: `filters: {propertyName, operator, value}[]`

### `salesmap-batch-read-objects`

- 성격: **읽기** · 정의: `src/tools/generic.ts`

```
🎯 레코드 일괄 조회(최대 500).
📦 fieldList로 원하는 필드만, associationList로 연결 레코드를 인라인으로 포함 가능.
🔗 다른 레코드를 참조하는 관계형 필드(고객·회사·딜 연결 등)는 fieldList가 아닌 associationList에 지정.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `string` | ✅ | 오브젝트 타입. 기본값: 'people' \| 'organization' \| 'deal' \| 'lead' \| 'quote' \| 'product'. 커스텀 오브젝트는 정의 이름을 그대로 (예: '티켓(CRM)', salesmap-list-objects로 확인) — 'custom-object' 리터럴은 사용 불가. |
| `objectIds` | `string[]` | ✅ | 레코드 ID 배열 (최대 500개) |
| `fieldList` | `string[]` |  | 반환할 필드명 목록 (한글). 생략 시 전체 필드 반환. |
| `associationList` | `string[]` |  | 인라인으로 포함할 연결 관계명 목록. 사용 가능한 관계명은 salesmap-list-associations로 먼저 확인. |

### `salesmap-batch-create-objects`

- 성격: **쓰기** · 정의: `src/tools/generic.ts`

```
🎯 레코드 생성 전용 도구 (1~100건). 1건이든 여러 건이든 생성은 이 도구를 사용. 견적서만 salesmap-create-quote.
📋 properties는 필드명→값 그대로. 사용자 필드는 활성 사용자 이름, 관계는 associations에 관계명→레코드 ID(UUID) 배열.
⚠️ 딜·리드: associations["메인 고객"] 또는 ["메인 회사"] 필수. 딜은 properties["파이프라인 단계"](단계 이름) 필수, 리드는 선택. "메인 견적서"는 생성 시 지정 불가.
🧩 커스텀 오브젝트: objectType에 정의 이름을 그대로 넣음(예: '티켓(CRM)'). '이름' 필드가 없고 정의별 대표 필드가 필수이며, system 관계 없이 워크스페이스에 정의한 관계만 사용.
📦 상품: properties에는 salesmap-list-properties(product)에 나오는 데이터 필드만 넣음. '이름'(필수)·'금액'(숫자, 필수)은 API 필수라 허용. 생성 메모/노트(memo)는 지원하지 않음. '설명'은 실제 상품 커스텀 필드가 있을 때만 사용. associations 미지원.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `string` | ✅ | 오브젝트 타입. 기본값: 'people' \| 'organization' \| 'deal' \| 'lead' \| 'product'. 커스텀 오브젝트는 정의 이름을 그대로 (예: '티켓(CRM)', salesmap-list-objects로 확인) — 'custom-object' 리터럴은 사용 불가. 견적서는 salesmap-create-quote 사용. |
| `inputList` | `{properties, associations}[]` | ✅ | 생성할 레코드 목록. v3 API 제한: 1~100건. |

`inputList` 항목 구조: `properties: record<string|number|boolean|null|string[]>`, `associations?: record<string[]>`

### `salesmap-update-object`

- 성격: **쓰기** · 정의: `src/tools/generic.ts`

```
🎯 레코드 수정. properties에 변경할 필드만 전달 (보낸 것만 바뀌고 나머지는 유지).
🔗 메인 고객·메인 회사 연결만 peopleId·organizationId로 — 필드가 아니라 관계라 properties에 없습니다.
📋 salesmap-list-properties로 필드 확인.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `enum(people|organization|deal|lead|custom-object)` | ✅ | 오브젝트 타입 |
| `objectId` | `string` | ✅ | 레코드 ID |
| `properties` | `record<string|number|boolean|string[]>` |  | 변경할 필드 key-value. 예: { "담당자": "홍길동", "상태": "Won" } |
| `peopleId` | `string` |  | 메인 고객으로 연결할 고객 레코드 ID(UUID). 필드가 아닌 관계라 properties로는 지정할 수 없습니다. ID는 salesmap-search-objects(objectType: 'people')로 확인. 딜·리드·회사에 사용. |
| `organizationId` | `string` |  | 메인 회사로 연결할 회사 레코드 ID(UUID). 필드가 아닌 관계라 properties로는 지정할 수 없습니다. ID는 salesmap-search-objects(objectType: 'organization')로 확인. 딜·리드·고객에 사용. |

### `salesmap-delete-object`

- 성격: **삭제** · 정의: `src/tools/generic.ts`

```
🎯 레코드 삭제.
🛡️ 영구 삭제 (confirmed=false 미리보기 → true).
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `enum(deal|lead)` | ✅ | 오브젝트 타입 (deal, lead만 지원) |
| `objectId` | `string` | ✅ | 삭제할 레코드 ID |
| `confirmed` | `boolean` |  | false=삭제 대상 미리보기만, true=실제 삭제 실행 |

### `salesmap-get-lead-time`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 딜/리드의 파이프라인 스테이지별 체류 시간 분석.
📦 파이프라인별 진입·퇴장 시각과 누적 체류 시간.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `enum(deal|lead)` | ✅ | 딜 또는 리드 |
| `objectId` | `string` | ✅ | 레코드 ID |

### `salesmap-get-link`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 레코드의 CRM 웹 URL 생성.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `enum(people|organization|deal|lead|custom-object|product|quote)` | ✅ | 오브젝트 타입 |
| `objectId` | `string` | ✅ | 레코드 ID |

### `salesmap-list-associations`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 오브젝트에 어떤 연결 관계가 있는지 스키마 조회.
🧭 batch-read-objects의 associationList에 넣을 관계명 확인용. '메인 X'가 기본 연결(primary).
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `string` | ✅ | 오브젝트 타입. 'deal' \| 'lead' \| 'people' \| 'organization' 또는 커스텀 오브젝트 이름 |

### `salesmap-create-note`

- 성격: **쓰기** · 정의: `src/tools/extras.ts`

```
🎯 레코드에 노트 추가.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `enum(people|organization|deal|lead|custom-object)` | ✅ | 대상 오브젝트 타입 |
| `objectId` | `string` | ✅ | 대상 레코드 UUID |
| `note` | `string` | ✅ | 노트 내용 |

### `salesmap-get-quotes`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 lead, deal에 연결된 견적서 조회.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `enum(deal|lead)` | ✅ | 딜 또는 리드 |
| `objectId` | `string` | ✅ | 딜/리드 UUID |

### `salesmap-create-quote`

- 성격: **쓰기** · 정의: `src/tools/extras.ts`

```
🎯 견적서 생성. dealId 또는 leadId 중 하나 필수.
📋 필드는 견적서·상품 모두 properties에 { 필드명: 값 }으로만 넣습니다 (전용 파라미터 없음). '이름'은 양쪽 다 필수.
📋 salesmap-get-quotes로 기존 견적서 확인.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `dealId` | `string` |  | 연결할 딜 ID (dealId 또는 leadId 중 하나 필수) |
| `leadId` | `string` |  | 연결할 리드 ID (dealId 또는 leadId 중 하나 필수) |
| `note` | `string` |  | 견적서 노트 (필드가 아닌 메모) |
| `properties` | `record<string|number|boolean|string[]>` | ✅ | 견적서 필드 전부를 { 필드명: 값 }으로. '이름'(필수)·'할인'·'할인 유형'·'담당자'·'메인 견적서 여부' 등. 📋 필드 목록: salesmap-list-properties(objectType: 'quote'). |
| `quoteProductList` | `{productId, properties, fieldList}[]` |  | 견적서 상품 목록 |

`quoteProductList` 항목 구조: `productId?: string`, `properties: record<string|number|boolean|string[]>`, `fieldList?: {name}[]`

### `salesmap-list-notes`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 노트 목록 조회. 담당자·유형·날짜·연결 레코드 기준으로 필터 가능.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `after` | `string` |  | 페이지네이션 커서 |
| `startDate` | `string` |  | 작성일 시작. 날짜만 쓰면 한국시간 그날 00:00부터 (예: 2026-01-01). 시각까지 지정하려면 오프셋 포함 ISO |
| `endDate` | `string` |  | 작성일 종료. 날짜만 쓰면 한국시간 그날 23:59:59까지 — 종료일 당일이 포함됩니다 (예: 2026-06-30) |
| `owner` | `string` |  | 노트를 작성한 담당자. 사용자 이름 또는 userId 모두 허용 |
| `type` | `string` |  | 노트 유형 이름 (예: '미팅', '콜') |
| `leadId` | `string` |  | 연결된 리드 ID |
| `dealId` | `string` |  | 연결된 딜 ID |
| `peopleId` | `string` |  | 연결된 고객 ID |
| `organizationId` | `string` |  | 연결된 회사 ID |

### `salesmap-get-pipelines`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 파이프라인 목록과 각 단계(stage) ID 조회. 딜·리드·커스텀 오브젝트 모두 지원.
🧭 커스텀 오브젝트 이름은 salesmap-list-objects로 확인.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `string` | ✅ | 'deal', 'lead', 또는 커스텀 오브젝트 이름 (예: '티켓(CRM)') |

### `salesmap-list-users`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 CRM 사용자 목록 조회.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `after` | `string` |  | 페이지네이션 커서 |

### `salesmap-list-teams`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 팀 목록 + 소속 멤버 조회. 전체 팀 구성 확인이 필요할 때 사용.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `after` | `string` |  | 페이지네이션 커서 |

### `salesmap-list-products`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 상품 목록 조회 (id·이름). 상품 관계 필드(예: 메인 견적 상품 리스트) 검색 시 id 확인용.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `after` | `string` |  | 페이지네이션 커서 |

### `salesmap-list-sequences`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 시퀀스 목록 조회 (id·이름). 시퀀스 관계 필드(예: 등록된 시퀀스 목록) 검색 시 id 확인용.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `after` | `string` |  | 페이지네이션 커서 |

### `salesmap-list-webforms`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 웹폼 목록 조회 (id·이름). 웹폼 관계 필드(예: 제출된 웹폼 목록·최근 제출된 웹폼) 검색 시 id 확인용.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `after` | `string` |  | 페이지네이션 커서 |

### `salesmap-get-user-details`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 현재 API 토큰 소유자 정보 조회.
```

파라미터 없음.

### `salesmap-read-engagement`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 활동 단건의 **전문** 조회 — 이메일 본문 · 녹취 전체 · 노트 전문.
🧭 salesmap-list-engagements가 준 emailId·recordingId·memoId를 그대로 넣습니다.
📦 목록엔 미리보기만 실립니다. `truncated: true`인 항목이나 본문이 필요할 때 이 도구로 엽니다.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `type` | `enum(email|recording|note)` | ✅ | 활동 유형. list-engagements 응답의 emailId→'email', recordingId→'recording', memoId→'note' |
| `id` | `string` | ✅ | 해당 활동의 UUID |

### `salesmap-list-changelog`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 필드 값이 언제 누가 무엇에 의해서 바뀌었는지 추적 (시스템 필드 제외).
🧭 "이 필드 언제 바뀌었어?", "담당자 언제 바뀜?", "이 값 언제 체크됐어?" 같은 질문에 사용.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `enum(people|organization|deal|lead)` | ✅ | 오브젝트 타입 |
| `objectId` | `string` | ✅ | 레코드 UUID |
| `after` | `string` |  | 페이지네이션 커서 |

### `salesmap-create-property`

- 성격: **쓰기** · 정의: `src/tools/extras.ts`

```
🎯 오브젝트에 커스텀 필드 생성.
📋 salesmap-list-properties로 기존 필드 확인.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `enum(people|organization|deal|lead|product|quote|quote-product|todo|custom-object)` | ✅ | 오브젝트 타입. custom-object는 customObjectDefinitionName 또는 customObjectDefinitionId로 대상 커오 종류 지정 (기존 커오에 필드 추가만 가능) |
| `name` | `string` | ✅ | 필드 이름 |
| `type` | `enum(string|number|date|dateTime|boolean|singleSelect|multiSelect|multiAttachment|user|multiUser)` | ✅ | 필드 타입. 계산 유형 필드를 만들 때는 formula에 계산 결과의 타입을 지정 |
| `customObjectDefinitionName` | `string` |  | custom-object에 필드 생성 시 대상 커오 종류 이름. salesmap-list-objects 참조 (ID 대신 사용 가능) |
| `customObjectDefinitionId` | `string` |  | custom-object에 필드 생성 시 대상 커오 종류 ID (salesmap-list-objects의 customObjectDefinitionId) |
| `description` | `string` |  | 필드 설명 |
| `showInCreateForm` | `boolean` |  | 레코드 생성 모달에 표시 여부 (기본 false) |
| `required` | `boolean` |  | GUI에서 필수 입력 여부 (기본 false). true여도 API/MCP에서는 제한 없음. true로 설정 시 showInCreateForm도 true 필요 |
| `options` | `{value}[]` |  | 선택지 목록. singleSelect 1개 이상·multiSelect 2개 이상 필수 |
| `preventDuplicates` | `boolean` |  | 유니크 필드 기능. 사업자등록번호, 전화번호 등 키 역할 필드에 제한적으로 사용. type이 string/number일때만 가능 |
| `formula` | `string` |  | formula에 수식을 입력하면 필드는 계산 유형 필드가 되며, type은 계산 결과의 타입을 지정해야 함. options·showInCreateForm·required·preventDuplicates 설정 불가. 자세한 내용은 salesmap-get-guide 호출하면 확인 가능 |

`options` 항목 구조: `value: string`

### `salesmap-get-guide`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 세일즈맵 MCP 사용 가이드 조회. 오브젝트 모델·시나리오별 도구 조합·필드 입력 규칙·formula 문법 수록.
🧭 세션 시작 시, 어떤 MCP 도구를 써야 할지 모를 때, batch-create-objects·update-object·create-property 전에 참조.
```

파라미터 없음.

### `salesmap-get-api-ref`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 세일즈맵 REST API 레퍼런스 조회. 엔드포인트·요청/응답 형식·에러 코드 수록.
🧭 run-script로 직접 API를 호출하기 전에 참조. MCP 도구 사용 가이드는 salesmap-get-guide 참조.
```

파라미터 없음.

### `salesmap-run-script`

- 성격: **쓰기** · 정의: `src/tools/extras.ts`

```
🚫 최후수단: 다른 전용 도구로 가능한 작업엔 사용 금지. 단건·소수 검색은 search-objects, 레코드 조회는 batch-read-objects, 생성은 batch-create-objects, 수정은 update-object, 필드 확인은 list-properties를 먼저 사용. 전용 도구로 되는 일을 이 도구로 하면 실패율이 오히려 몇 배 높고, API 경로·파라미터를 헛짚으며 헤매는 시간만 늘어남.
🎯 반드시 멀티홉 복잡 작업에만: 전용 도구 조합으로 불가능한 대량 조회·분석 — N건 루프 순회, 집계·변환, 페이지네이션 전체 수집 등. 중간 데이터가 컨텍스트에 쌓이지 않음.
💡 salesmap.get(path, query?)·salesmap.post(path, body?)로 세일즈맵 API 직접 호출.
🔑 응답은 success/data 래퍼가 벗겨진 상태로 반환 — r.data.dealList가 아니라 r.dealList로 접근.
📄 목록 전체가 필요하면 salesmap.getAll(path, query?) — nextCursor를 자동 순회해 전 페이지를 합쳐 반환.
⏱️ 대기 필요 시 await sleep(ms) 또는 setTimeout 사용 가능.
⚠️ 최대 120초. create·update·delete도 가능하므로 신중하게.
📌 에러는 첫 번째 발생 시 즉시 중단. 루프에서 다중 에러를 수집하려면 스크립트 내에서 try/catch로 직접 처리 후 return.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `script` | `string` | ✅ | 실행할 JavaScript 코드 (async 지원). salesmap.get(path, query?)·salesmap.post(path, body?)·salesmap.getAll(path, query?)로 API 호출. return 값이 결과로 반환됨. 예: const { dealList } = await salesmap.getAll('/v2/deal'); return dealList.map(d => d.dealId); ※ 응답은 data 언랩 상태 — r.dealList로 접근 (r.data.dealList 아님) |

### `salesmap-report-feedback`

- 성격: **쓰기** · 정의: `src/tools/extras.ts`

```
🎯 이 MCP의 문제·한계·기능 요청을 개발팀에 전달.
🧭 필요한 도구가 없거나·도구가 부족하거나·한 작업에 연속 호출이 과도하거나·버그를 발견했을 때 사용.
💡 작업을 막지 않음 — 전달 후 원래 작업을 계속하세요.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `category` | `enum(bug|missing-tool|tool-limitation|friction|feature-request)` | ✅ | bug=기존 도구가 잘못 동작/에러. missing-tool=필요한 작업을 할 도구가 아예 없음. tool-limitation=도구는 있으나 기능이 부족해 목표 미달. friction=되긴 하나 연속 호출 등 비효율. feature-request=지금 막히진 않지만 개선 아이디어. ※지금 막혀있으면 feature-request 아님 |
| `summary` | `string` | ✅ | 한 줄 요약 |
| `detail` | `string` | ✅ | 무엇을 하려 했고 왜 막혔는지 구체적으로. 관련 도구명·시도한 접근도 여기에 포함 (파라미터 실값·고객 데이터는 넣지 말 것) |

### `salesmap-list-engagements`

- 성격: **읽기** · 정의: `src/tools/extras.ts`

```
🎯 레코드 활동 타임라인 조회 — 웹폼 제출·이메일 열람·링크 클릭·문서 열람까지 15종.
📦 types로 유형 필터, startDate·endDate로 기간 필터.
⏱️ **오래된 순으로 한 페이지 50건 고정.** 최근 활동을 보려면 startDate로 범위를 좁히세요.
📖 본문·녹취 전문은 salesmap-read-engagement(type, id)로 엽니다 — 목록엔 제목·미리보기만 실립니다.
```

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `objectType` | `enum(people|organization|deal|lead|custom-object)` | ✅ | 오브젝트 타입 |
| `objectId` | `string` | ✅ | 레코드 UUID |
| `types` | `string[]` |  | 조회할 활동 유형. 생략 시 전체. 사용 가능: create, webFormView, webFormSubmit, email, emailOpen, emailLinkClick, smsSend, memoCreate, todoCreate, meeting, documentView, kakaoAlimtalkSend, merge, modusignContractCreated, recordingCreate. (구 이름 note·todo·recording·alimtalk·sms도 받습니다) |
| `startDate` | `string` |  | 시작일. 날짜만 쓰면 한국시간 그날 00:00부터 (예: 2026-07-01). **최근 활동을 볼 땐 꼭 지정하세요** — 정렬이 오래된 순이라 안 주면 옛날 것부터 나옵니다 |
| `endDate` | `string` |  | 종료일. 날짜만 쓰면 한국시간 그날 23:59:59까지 — 종료일 당일이 포함됩니다 |
| `limit` | `number` |  | 반환 건수 상한 (1~50). API는 항상 50건을 주므로 응답 크기만 줄입니다. |
| `after` | `string` |  | 페이지네이션 커서. 이전 응답의 nextCursor 값. |
