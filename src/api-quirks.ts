/**
 * ══════════════════════════════════════════════════════════════════════════
 *  API 레거시 우회 레지스트리
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 여기 모인 것은 전부 **"세일즈맵 API가 개선되면 지울 코드"** 다.
 * 정상 스펙을 준수하는 로직(READONLY_TYPES, 노이즈 필터 등)은 여기 두지 않는다.
 *
 * ── 왜 한곳에 모으나 ──
 * 우회 로직이 5개 파일에 흩어져 있으면, API가 개선돼도 **어디를 지워야 하는지**
 * 알 수 없다. 반대로 새 결함을 발견해도 **이미 우회 중인지** 확인이 어렵다.
 *
 * ── 사용법 ──
 *   1. 새 우회를 넣을 땐 QUIRKS에 항목을 먼저 추가한다 (removeWhen 필수).
 *   2. API 개선 소식이 오면 `node scripts/quirks.mjs`로 영향 범위를 본다.
 *   3. removeWhen이 충족되면 데이터와 매니페스트 항목을 함께 지운다.
 */

// ── 매니페스트 ────────────────────────────────────────────────────────────

export type Quirk = {
  /** 안정 식별자. 코드·문서·백엔드 대화에서 이 id로 지칭한다. */
  id: string;
  /** 무엇을 우회하는가 (한 줄) */
  summary: string;
  /** 근거 — 실측일·백엔드 확인 등 */
  evidence: string;
  /** 이 코드를 지울 수 있는 조건 */
  removeWhen: string;
  /** 영향받는 MCP 도구 */
  affects: string[];
  /** 구현 위치 */
  location: string;
  /** 원장(docs/salesmap-api-issues.md) 이슈 번호 */
  ledger?: string;
};

export const QUIRKS: readonly Quirk[] = [
  {
    id: "top-level-split",
    summary: "일부 필드는 fieldList가 아니라 top-level 파라미터로 보내야 한다. 목록은 오브젝트마다 다르다",
    evidence: "백엔드 전수 확인 2026-07-29. 목록에 없는 걸 top-level로 보내면 200을 주면서 조용히 무시 — 리드에 price 전송 시 금액이 null로 남는 것 실측",
    removeWhen: "쓰기 API가 모든 필드를 fieldList로 일괄 수용하면",
    affects: ["update-object", "batch-create-objects(상품)", "create-quote"],
    location: "api-quirks.ts › TOP_LEVEL_BY_TYPE",
    ledger: "#3",
  },
  {
    id: "system-select-input-value",
    summary: "시스템 select 4종은 조회값(영문)과 입력값(한글)이 다르다",
    evidence: "백엔드 전수 확인 2026-07-29. validateAPIV2FieldList가 표시값으로 변환해 비교하므로 조회값 그대로 넣으면 400",
    removeWhen: "v2 입력이 저장값(active·newBusiness…)을 그대로 받도록 통일되면",
    affects: ["update-object", "batch-create-objects(상품)", "create-quote"],
    location: "api-quirks.ts › SYSTEM_SELECT_INPUT",
  },
  {
    id: "fieldlist-type-key",
    summary: "fieldList 값을 필드 타입별로 다른 키(stringValue·numberValue…)에 담아야 한다",
    evidence: "API 스펙. 단순 key-value가 아니라 타입을 미리 알아야 쓰기가 가능",
    removeWhen: "쓰기 API가 { 필드명: 값 } 형태를 수용하면 (v3 create는 이미 그렇다)",
    affects: ["update-object", "create-quote", "batch-create-objects(상품)"],
    location: "api-quirks.ts › TYPE_TO_VALUE_KEY",
    ledger: "#2",
  },
  {
    id: "objecttype-v2-v3-duality",
    summary: "v2는 영문 경로(deal), v3는 한글(딜)을 받는다",
    evidence: "v3가 표시명을 채택. 백엔드 확인 2026-07-29 — 영문 별칭 미지원",
    removeWhen: "v3 getObjectModel이 영문 별칭(deal→딜)을 허용하면",
    affects: ["batch-read-objects", "batch-create-objects", "list-engagements", "list-associations", "get-pipelines"],
    location: "api-quirks.ts › V3_TYPE_MAP / V3_CREATE_TYPE_MAP",
  },
  {
    id: "custom-object-definition-name",
    summary: "커스텀 오브젝트는 리터럴이 아니라 워크스페이스의 정의 이름을 objectType으로 받는다",
    evidence: "백엔드 확인 2026-07-29. `커스텀 오브젝트` 리터럴은 그 이름의 정의가 실제로 있을 때만 우연히 동작",
    removeWhen: "v3가 `custom-object` 리터럴 + definitionId 조합을 받으면",
    affects: ["batch-read-objects", "batch-create-objects"],
    location: "api-quirks.ts › CUSTOM_OBJECT_LITERALS",
    ledger: "#13-b",
  },
  {
    id: "v3-create-unsupported-types",
    summary: "견적서·상품은 v3 create dispatcher에 없어 필드 검증을 통과한 뒤 400이 된다",
    evidence: "백엔드 확인 2026-07-28. getObjectModel은 인식하나 createObjectListForApiFunc에 case 없음",
    removeWhen: "v3 create가 견적서·상품을 지원하면",
    affects: ["batch-create-objects"],
    location: "api-quirks.ts › CREATE_UNSUPPORTED / PRODUCT_TYPES",
  },
  {
    id: "product-v2-fallback",
    summary: "상품 생성은 v3 미지원이라 v2 단건 API를 순회한다. 필드명도 흔한 표현으로 정규화",
    evidence: "실측 2026-07-29. 실제 필드명은 `금액`(가격 아님), fieldList로 유형·코드·단위·담당자 전달 가능(문서 미기재)",
    removeWhen: "v3 create가 상품을 지원하면 (v3-create-unsupported-types와 함께 제거)",
    affects: ["batch-create-objects"],
    location: "api-quirks.ts › PRODUCT_ALIAS",
    ledger: "#21",
  },
  {
    id: "relation-list-operator",
    summary: "관계 필드는 LIST_CONTAIN/LIST_NOT_CONTAIN 미지원 → IN/NOT_IN으로 변환",
    evidence: "실측. 관계 필드에 LIST_CONTAIN을 쓰면 400",
    removeWhen: "검색 API가 관계 필드에 리스트 연산자를 허용하면",
    affects: ["search-objects"],
    location: "api-quirks.ts › REL_LIST_OP_MAP",
    ledger: "#26",
  },
  {
    id: "group-field-unsearchable",
    summary: "고객/리드 그룹 필드는 id 조회 수단이 없어 값 검색 불가 → EXISTS/NOT_EXISTS 외 사전 차단",
    evidence: "그룹 목록 조회 API 부재. 4개 워크스페이스가 독립적으로 부딪힘",
    removeWhen: "그룹 목록 조회 API가 생기거나 이름으로 검색 가능해지면",
    affects: ["search-objects"],
    location: "api-quirks.ts › GROUP_TYPES",
  },
  {
    id: "boolean-string-coercion",
    summary: "boolean 필드는 문자열 \"true\"를 거부한다(number는 \"100\"을 수용) → 실제 boolean으로 교정",
    evidence: "백엔드 확인 2026-07-28. typeof 엄격 검증. 타입 간 일관성 없음",
    removeWhen: "백엔드가 boolean에도 문자열 관용 처리를 넣으면",
    affects: ["search-objects"],
    location: "search.ts › resolveFilterIds (인라인)",
  },
  {
    id: "ai-field-name-correction",
    summary: "AI가 지어낸 이름 별칭(회사명→이름)과 한글 자모 오생성(딥 담당자→딜 담당자)을 교정",
    evidence: "텔레메트리 2026-06~07. 별칭 51건, 자모 깨짐 22건/16종. 자모는 같은 요청 안에서 정상·깨짐이 공존",
    removeWhen: "영문 internal field name이 도입되면 (자모 축은 원천 소멸)",
    affects: ["search-objects", "update-object", "batch-create-objects", "batch-read-objects", "create-quote"],
    location: "field-aliases.ts › canonicalFieldName",
  },
];

// ══════════════════════════════════════════════════════════════════════════
//  데이터
// ══════════════════════════════════════════════════════════════════════════

/**
 * @quirk top-level-split
 *
 * 오브젝트별 top-level 파라미터. 여기 없는 필드를 top-level로 빼면
 * API가 200을 주면서 조용히 무시한다.
 *
 * ⚠️ 커스텀 오브젝트는 `이름`이 top-level이 **아니다** — 대표 필드는 fieldList로 들어간다.
 * ⚠️ 알 수 없는 타입(커오 정의 이름 등)은 아무것도 빼지 않는 쪽이 안전하다.
 */
export const TOP_LEVEL_BY_TYPE: Record<string, Record<string, string>> = {
  deal: { "이름": "name", "금액": "price", "상태": "status", "파이프라인": "pipelineId", "파이프라인 단계": "pipelineStageId" },
  lead: { "이름": "name", "파이프라인": "pipelineId", "파이프라인 단계": "pipelineStageId" },
  people: { "이름": "name" },
  organization: { "이름": "name" },
  product: { "이름": "name", "금액": "price" },
  quote: { "이름": "name" },
  "custom-object": { "파이프라인": "pipelineId", "파이프라인 단계": "pipelineStageId" },
};

/**
 * @quirk system-select-input-value
 *
 * 조회 API가 주는 값 ≠ 쓰기 API가 받는 값인 시스템 select.
 * `GET /v2/field/{type}`의 optionList는 DB 저장값(영문)을 주는데,
 * `validateAPIV2FieldList`가 표시값(한글)으로 변환해 비교하므로 조회값 그대로 넣으면 400.
 *
 * ⚠️ 커스텀 select는 해당 없음 — 조회값 = 입력값.
 * ⚠️ `quoteProduct.할인 유형`은 **대상이 아니다** — 같은 이름이지만 원값(percentage)을 받는다.
 *    isQuoteDefaultField가 model === "quote"만 보기 때문. 헷갈리기 쉬우니 주의.
 */
export const SYSTEM_SELECT_INPUT: Record<string, Record<string, Record<string, string>>> = {
  product: { "상태": { active: "활성", inactive: "비활성" } },
  deal: {
    "구독 시작 유형": { newBusiness: "신규", upgrade: "업그레이드", downgrade: "다운그레이드", renewal: "갱신" },
    "구독 종료 유형": { churned: "이탈", upgrade: "업그레이드", downgrade: "다운그레이드", renewal: "갱신" },
  },
  quote: { "할인 유형": { percentage: "%", fixed: "원" } },
};

/**
 * @quirk fieldlist-type-key
 * 필드 타입 → fieldList에서 쓸 값 키.
 */
export const TYPE_TO_VALUE_KEY: Record<string, string> = {
  string: "stringValue",
  number: "numberValue",
  boolean: "booleanValue",
  date: "dateValue",
  dateTime: "dateValue",
  singleSelect: "stringValue",
  multiSelect: "stringValueList",
  user: "userValueId",
  multiUser: "userValueIdList",
  people: "peopleValueId",
  multiPeople: "peopleValueIdList",
  organization: "organizationValueId",
  multiOrganization: "organizationValueIdList",
  deal: "dealValueId",
  multiDeal: "dealValueIdList",
  multiLead: "leadValueIdList",
  pipeline: "pipelineValueId",
  pipelineStage: "pipelineStageValueId",
  team: "teamValueIdList",
  multiTeam: "teamValueIdList",
  webForm: "webformValueId",
  multiWebForm: "webformValueIdList",
  multiProduct: "productValueIdList",
  multiCustomObject: "customObjectValueIdList",
  sequence: "sequenceValueId",
  multiSequence: "sequenceValueIdList",
};

/**
 * @quirk objecttype-v2-v3-duality
 * v2 영문 → v3 한글. read·create 모두 같은 getObjectModel을 쓰므로 규칙은 동일하다.
 * 커스텀 오브젝트는 정의 이름을 그대로 넘기므로 여기 두지 않는다.
 */
export const V3_TYPE_MAP: Record<string, string> = {
  deal: "딜", lead: "리드", people: "고객", organization: "회사",
  quote: "견적서", product: "상품",
};

/** @quirk objecttype-v2-v3-duality — create는 견적서·상품 미지원이라 더 좁다 */
export const V3_CREATE_TYPE_MAP: Record<string, string> = {
  deal: "딜", lead: "리드", people: "고객", organization: "회사",
};

/** @quirk custom-object-definition-name — objectType 자리에 오면 안 되는 리터럴 */
export const CUSTOM_OBJECT_LITERALS = new Set([
  "custom-object", "customObject", "커스텀 오브젝트", "커스텀오브젝트",
]);

/** @quirk v3-create-unsupported-types — 전용 도구로 안내할 타입 */
export const CREATE_UNSUPPORTED: Record<string, string> = {
  "견적서": "salesmap-create-quote",
  quote: "salesmap-create-quote",
};

/** @quirk product-v2-fallback — v2 POST /v2/product 순회로 처리할 타입 */
export const PRODUCT_TYPES = new Set(["상품", "product"]);

/**
 * @quirk product-v2-fallback
 * 상품의 실제 필드명은 `금액`이다(`가격` 아님). LLM이 흔히 쓰는 표현을 실제 이름으로 모은다.
 */
export const PRODUCT_ALIAS: Record<string, string> = {
  "가격": "금액", "단가": "금액", price: "금액", amount: "금액",
  name: "이름", "상품명": "이름", "제품명": "이름",
  code: "코드", type: "유형", status: "상태", owner: "담당자", unit: "단위",
};

/** @quirk relation-list-operator — 관계 필드에서 리스트 연산자를 동등한 IN/NOT_IN으로 */
export const REL_LIST_OP_MAP: Record<string, string> = {
  LIST_CONTAIN: "IN",
  LIST_NOT_CONTAIN: "NOT_IN",
};

/** @quirk group-field-unsearchable — 값 검색이 원천 불가한 필드 타입 */
export const GROUP_TYPES = new Set(["multiLeadGroup", "multiPeopleGroup"]);
