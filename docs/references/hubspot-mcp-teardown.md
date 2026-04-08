# HubSpot MCP Server 해체 분석

> 분석 기준: `@hubspot/mcp-server` v0.4.0 (npm 패키지 소스 분석, 2026-03-20)

---

## 기본 정보
- **패키지**: `@hubspot/mcp-server` v0.4.0 (npm, 소스 비공개 but 빌드 분석 가능)
- **Tool 21개**, Prompt 1개, Resource 0개
- **Transport**: Stdio (로컬) / OAuth 2.1 + Streamable HTTP (리모트)

---

## 아키텍처

```
index.js (서버 엔트리)
├── toolsRegistry.js (사이드이펙트 import → 21개 tool 자동 등록)
├── baseTool.js (추상 클래스 — Zod 검증 + 에러 포맷 통일)
├── tools/
│   ├── objects/ (6개) — list, search, batch-read/create/update, get-schemas
│   ├── properties/ (4개) — list, get, create, update
│   ├── associations/ (3개) — list, batch-create, get-definitions
│   ├── engagements/ (3개) — create, get, update
│   ├── workflows/ (2개) — list, get
│   ├── oauth/ (1개) — get-user-details
│   └── links/ (2개) — get-link, generate-feedback-link
└── prompts/ — HubSpot Sales Coach (At-Risk 딜 식별)
```

---

## 핵심 설계 패턴

### 1. 단건 CRUD가 없다 — 전부 Batch
- `batch-read`, `batch-create`, `batch-update` (최대 100건)
- 1건 조회도 `batch-read`에 ID 1개 넣는 방식
- 세일즈맵은 단건 중심 + MCP에서 for 루프 batch 우회

### 2. `properties[]` 파라미터로 응답 필드 선택
- 모든 조회 tool에 `properties` 파라미터 있음
- API 레벨에서 지원 → 네트워크 낭비 없음
- 세일즈맵 API는 미지원 → MCP에서 `pickProperties` 후처리

### 3. Description 4단계 구조 (이모지 섹션)
```
🛡️ Guardrails — 쓰기 tool에만. "사용자가 명시적으로 요청한 경우에만 사용"
🎯 Purpose — 이 tool의 목적
📋 Prerequisites — 선행 호출 tool (예: get-user-details → list-objects → 본 tool)
🧭 Usage Guidance — 이 tool vs 다른 tool 선택 기준
📦 Returns — 반환 데이터 설명
```

### 4. 응답 필터링 — tool별 수동
```js
results: response.results.map(item => ({
    id, properties, createdAt, updatedAt  // 이것만 추출
}))
```
- 중앙화된 필터 없이 각 tool에서 직접. 중복 코드 있지만 tool별 커스터마이징 자유
- 세일즈맵은 `compactRecords`로 중앙화 (더 DRY)

### 5. 에러 처리 — 단순
```js
catch(e) { return { content: [{ type: 'text', text: e.message }], isError: true } }
```
- 별도 힌트/보정 안내 없음
- 세일즈맵 `errWithSchemaHint`가 훨씬 발전된 패턴 (필드명 추천, relation UUID 안내 등)

### 6. BaseTool 클래스 상속 패턴
- `BaseTool.handleRequest()` — Zod 검증 (미들웨어 역할)
- 하위 클래스 `process(validatedArgs)` — 비즈니스 로직
- 검증 에러 vs 비즈니스 에러 분리

### 7. MCP Annotations 전체 적용
```js
{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
```
- 모든 tool에 4개 annotation 포함
- 세일즈맵은 3개 (openWorldHint 미사용)

---

## Tool별 특이사항

| Tool | 특이점 |
|------|--------|
| `list-objects` | limit max 500 (search는 100) |
| `search-objects` | filterGroups(OR) > filters(AND), 최대 5그룹×6필터=18개. default limit 10 |
| `batch-read` | `propertiesWithHistory` — 필드 변경 이력까지 조회 |
| `batch-update` | `idProperty` — UUID 대신 email 등 고유속성으로 대상 지정 가능 |
| `create-engagement` | `z.superRefine()`로 NOTE/TASK 타입별 조건부 스키마 검증 |
| `list-properties` | 응답을 name/label/type/description/groupName 5개로 축소 — 토큰 절약 |
| `get-link` | 잘못된 objectTypeId 시 유효값 목록 반환 — 자가 교정 |
| `generate-feedback-link` | "사용자 불만 감지 시 선제적 사용" — 감정 인식 트리거 |
| `get-user-details` | **모든 쓰기 tool의 공통 선행 조건** — ownerId/portalId 확보 |

---

## Prompts — Sales Coach

```
역할: At-Risk 딜 식별 AI 세일즈 코치
워크플로우:
1. 사용자에게 "At Risk" 기준 질문
2. list-properties로 딜 속성 조회 → 사용자가 검색 속성 선택
3. search-objects로 기준에 맞는 딜 검색
4. 테이블 + HubSpot 링크 포함 서머리 생성

가드레일: 데이터 읽기만, 정보 만들어내지 마라, 공유 전 동의 받아라
```

---

## 세일즈맵 MCP와 비교

| 항목 | HubSpot | 세일즈맵 | 평가 |
|------|---------|---------|------|
| Tool 수 | 21 | 16 | 비슷 |
| CRUD 패턴 | batch 전용 (API 지원) | 단건 + MCP batch 우회 | HubSpot 우위 |
| 필드 선택 | `properties[]` (API 네이티브) | `pickProperties` (후처리) | HubSpot 우위 |
| 응답 필터링 | tool별 수동 | `compactRecords` 중앙화 | 세일즈맵 더 DRY |
| 에러 힌트 | 단순 e.message | `errWithSchemaHint` 6패턴 | 세일즈맵 우위 |
| pre-validation | 없음 | relation UUID, 필수 필드 등 | 세일즈맵 우위 |
| Description | 이모지 4단계 구조 | 한글 간결 + 선행 명시 | 비슷 (스타일 차이) |
| Annotations | 4개 전체 | 3개 (openWorldHint 없음) | 비슷 |
| 멀티테넌트 | 싱글 (env 토큰) | 멀티 (요청별 Bearer) | 세일즈맵 우위 |
| Prompts | Sales Coach 1개 | 없음 | HubSpot에만 |
| Rate limit | 없음 | 120ms + 429 retry | 세일즈맵만 필요 |

---

## Tool Description 원문 (v0.4.0)

### Objects (6개)

**hubspot-list-objects**
```
🎯 Purpose:
  1. Retrieves a paginated list of objects of a specified type from HubSpot.
📦 Returns:
  1. Collection of objects with their properties and metadata, plus pagination information.
🧭 Usage Guidance:
  1. Use for initial data exploration to understand the data structure of a HubSpot object type.
  2. Helps list objects when the search criteria or filter criteria is not clear.
  3. Use hubspot-search-objects for targeted queries when the data structure is known.
  4. Use hubspot-batch-read-objects to retrieve specific objects by their IDs.
  5. Use hubspot-list-associations to list associations between objects.
```
`{ readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true }`

**hubspot-search-objects**
```
🎯 Purpose:
  1. Performs advanced filtered searches across HubSpot object types using complex criteria.
📋 Prerequisites:
  1. Use the hubspot-list-objects tool to sample existing objects for the object type.
  2. If hubspot-list-objects tool's response isn't helpful, use hubspot-list-properties tool.
📦 Returns:
  1. Filtered collection matching specific criteria with pagination information.
🧭 Usage Guidance:
  1. Preferred for targeted data retrieval when exact filtering criteria are known.
  2. Use hubspot-list-objects when filter criteria is not specified or clear or when a search fails.
  3. Use hubspot-batch-read-objects to retrieve specific objects by their IDs.
  4. Use hubspot-list-associations to get the associations between objects.
🔍 Filtering Capabilities:
  1. "filterGroups" = OR logic (ANY can match)
  2. Same filters list = AND logic (ALL must match)
  3. Max 5 filterGroups × 6 filters = 18 total
```
`{ readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true }`

**hubspot-batch-read-objects**
```
🎯 Purpose:
  1. Retrieves multiple HubSpot objects of the same object type by their IDs in a single batch operation.
🧭 Usage Guidance:
  1. Use this tool to retrieve objects when the object IDs are known.
```
`{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }`

**hubspot-batch-create-objects**
```
🛡️ Guardrails:
  1. Data Modification Warning: This tool modifies HubSpot data. Only use when the user has explicitly requested to update their CRM.
🎯 Purpose:
  1. Creates multiple HubSpot objects of the same objectType in a single API call.
📋 Prerequisites:
  1. Use hubspot-get-user-details to get OwnerId and UserId.
  2. Use hubspot-list-objects to sample existing objects.
  3. Use hubspot-get-association-definitions for valid association types.
```
`{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }`

**hubspot-batch-update-objects**
```
🛡️ Guardrails:
  1. Data Modification Warning: This tool modifies HubSpot data. Only use when the user has explicitly requested to update their CRM.
🎯 Purpose:
  1. Updates multiple existing HubSpot objects of the same objectType in a single API call.
📋 Prerequisites:
  1. Use hubspot-get-user-details to get OwnerId and UserId.
  2. Use hubspot-list-objects to sample existing objects.
  3. If not helpful, use hubspot-list-properties tool.
```
`{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }`

**hubspot-get-schema**
```
🎯 Purpose:
  1. Retrieves all custom object schemas defined in the HubSpot account.
🧭 Usage Guidance:
  1. Before working with custom objects to understand available object types.
📦 Returns:
  1. objectTypeId and objectType for each schema.
  2. Use these instead of "custom" in subsequent requests.
```
`{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }`

### Properties (4개)

**hubspot-list-properties**
```
🎯 Purpose:
  1. Retrieves a complete catalog of properties for any HubSpot object type.
🧭 Usage Guidance:
  1. This API has a large response that can consume a lot of tokens. Use hubspot-list-objects first.
  2. Try to use hubspot-get-property for a specific property.
  3. Use at the beginning of workflows to understand available data structures.
```
`{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }`

**hubspot-get-property**
```
🎯 Purpose:
  1. Retrieves detailed information about a specific property for a HubSpot object type.
  2. Get all metadata related to a property, including type, options, and configuration.
```
`{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }`

**hubspot-create-property**
```
🛡️ Guardrails:
  1. Data Modification Warning: Only use when user has explicitly requested.
🎯 Purpose:
  1. Creates new custom properties for HubSpot object types.
📋 Prerequisites:
  1. hubspot-get-user-details → hubspot-list-objects → hubspot-list-properties
🧭 Usage Guidance:
  1. Make sure user wants to create a property, not an object.
  2. Use list-properties first to check property doesn't already exist.
```
`{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }`

**hubspot-update-property**
```
🛡️ Guardrails:
  1. Data Modification Warning: Only use when user has explicitly requested.
🎯 Purpose:
  1. Updates existing custom properties for HubSpot object types.
🧭 Usage Guidance:
  1. Use hubspot-list-objects to sample existing objects first.
  2. If not helpful, use hubspot-list-properties.
```
`{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }`

### Associations (3개)

**hubspot-list-associations**
```
🎯 Purpose:
  1. Retrieves existing relationships between a specific object and other objects.
  2. E.g., find all companies a contact is associated with, all deals related to a company.
📦 Returns:
  1. Collection of associated object IDs and relationship metadata.
  2. Use hubspot-batch-read-objects to get more info about the associated objects.
🧭 Usage Guidance:
  1. Use when mapping relationships between different HubSpot objects.
  2. Ideal when you know a record's ID and need to discover its relationships.
  3. Prefer over hubspot-search-objects when exploring connections rather than filtering by properties.
```
`{ readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true }`

**hubspot-batch-create-associations**
```
🛡️ Guardrails:
  1. Data Modification Warning: Only use when user has explicitly requested.
🎯 Purpose:
  1. Establishes relationships between HubSpot objects, linking records across different object types.
📋 Prerequisites:
  1. hubspot-get-user-details → hubspot-get-association-definitions
```
`{ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }`

**hubspot-get-association-definitions**
```
🎯 Purpose:
  1. Retrieves valid association types between specific HubSpot object types.
📦 Returns:
  1. Array of valid association definitions with type IDs, labels, and categories.
🧭 Usage Guidance:
  1. Always use before creating associations to ensure valid relationship types.
```
`{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }`

### Engagements (3개)

**hubspot-create-engagement**
```
🛡️ Guardrails:
  1. Data Modification Warning: Only use when user has explicitly requested.
🎯 Purpose:
  1. Creates a HubSpot engagement (Note or Task) associated with contacts, companies, deals, or tickets.
📋 Prerequisites:
  1. Use hubspot-get-user-details to get OwnerId and UserId.
🧭 Usage Guidance:
  1. Use NOTE type for adding notes to records
  2. Use TASK type for creating tasks with subject, status, and assignment
  3. EMAIL, CALL, MEETING are NOT supported yet.
  4. HubSpot notes support HTML but headings (<h1>, <h2>) look ugly. Use sparingly.
```
`{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }`

**hubspot-get-engagement**
```
🎯 Purpose:
  1. Retrieves a HubSpot engagement by ID.
```
`{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }`

**hubspot-update-engagement**
```
🛡️ Guardrails:
  1. Data Modification Warning: Only use when user has explicitly requested.
🎯 Purpose:
  1. Updates an existing HubSpot engagement (Note or Task).
📋 Prerequisites:
  1. Need engagement ID. Use hubspot-get-engagement for current details.
  2. Use hubspot-get-user-details for owner ID.
🧭 Usage Guidance:
  1. Only include fields you want to update — others remain unchanged.
  2. HTML headings look ugly in CRM. Use sparingly.
```
`{ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }`

### Workflows (2개)

**hubspot-list-workflows**
```
🎯 Purpose:
  1. Retrieves a paginated list of workflows from the HubSpot account.
🧭 Usage Guidance:
  1. Use "limit" to control results per page.
  2. Use "after" for pagination with previous response's paging.next.after.
```
`{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }`

**hubspot-get-workflow**
```
🎯 Purpose:
  1. Retrieves detailed information about a specific workflow.
🧭 Usage Guidance:
  1. Use hubspot-list-workflows first to identify the workflow ID.
  2. Returns complete info including actions, enrollment criteria, and scheduling.
```
`{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }`

### Utility (2개)

**hubspot-get-user-details**
```
🎯 Purpose:
  1. Authenticates and analyzes the current HubSpot access token.
🧭 Usage Guidance:
  1. Must be used before performing any operations with HubSpot tools.
📦 Returns:
  1. User ID, Hub ID, App ID, token type, API scopes, owner info, account info.
  2. uiDomain and hubId can construct URLs to HubSpot UI.
  3. ownerId helps identify objects owned by the user.
```
`{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }`

**hubspot-feedback-link**
```
🎯 Purpose:
  1. Use when user wants to submit feedback about HubSpot MCP tool.
  2. Use proactively when other tools are unable to solve user's tasks effectively.
  3. Use when you sense dissatisfaction from the user.
```
`{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`

### Description 설계 포인트 요약

1. **Delete/Archive tool 없음** — 21개 중 삭제 기능 0개. 완전히 회피
2. **쓰기 tool 전부 `destructiveHint: false`** — create/update 모두. "수정은 파괴가 아니다"
3. **🛡️ Guardrails** — 모든 쓰기 tool에 "Only use when the user has explicitly requested" 명시. Claude 시스템 프롬프트 우회가 아니라 description으로 LLM 행동 제어
4. **`openWorldHint: true`** — 거의 전부 true. "이 tool 외에도 방법이 있을 수 있다"
5. **Prerequisites 체인** — `get-user-details` → `list-objects` → 본 tool 순서를 description에 명시

---

## 우리가 가져갈 것

1. **`idProperty` 패턴** — UUID 대신 email/이름 같은 고유속성으로 대상 지정. 미래 방향 E 섹션(String 기반 입력)과 직결
2. **Prompts 등록** — 영업 컨설팅 시나리오별 프롬프트 (리드 분석, 파이프라인 리뷰 등)
3. **`propertiesWithHistory`** — 필드 변경 이력 조회. 세일즈맵 history API 있으면 구현 가능
4. **피드백 tool** — 재미있는 패턴이긴 한데 우선순위 낮음
5. **Description에 Returns 섹션 추가** — 현재 우리는 Purpose + Prerequisites 위주
