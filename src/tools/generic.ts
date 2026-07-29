import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, errWithSchemaHint, compactRecord, pickProperties, resolveProperties, getDefaultProperties, getDefinitionMap, getFieldSchema, canonicalFieldName } from "../client";
import { getClient } from "../types";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false } as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_ID_RE = /^[0-9a-f]{24}$/i; // MongoDB ObjectId

// ── v3 마이그레이션 플래그 ────────────────────────────────
// false로 바꾸면 v2 동작으로 즉시 롤백. 안정화 목표: 2026-07-31
const V3_OBJECT_READ = true;

// v2 영문 → v3 한글 objectType 매핑.
// read·create 모두 같은 getObjectModel을 쓰므로 규칙이 동일하다(백엔드 확인 2026-07-29).
// 커스텀 오브젝트는 **정의 이름**을 그대로 넣는다 — `커스텀 오브젝트` 리터럴은
// 그 이름의 정의가 실제로 있을 때만 우연히 동작하므로 매핑에 두지 않는다.
// (`상품변형`도 v3가 인식하지 못해 제거. 실측 2026-07-29)
const V3_TYPE_MAP: Record<string, string> = {
  deal: "딜", lead: "리드", people: "고객", organization: "회사",
  quote: "견적서", product: "상품",
};

// create는 상품·견적서를 지원하지 않아(dispatcher에 case 없음) 별도로 좁힌다.
const V3_CREATE_TYPE_MAP: Record<string, string> = {
  deal: "딜", lead: "리드", people: "고객", organization: "회사",
};

/** 커오 리터럴이 objectType에 온 경우, 워크스페이스의 실제 정의 이름을 붙여 안내한다. */
async function customObjectLiteralError(client: ReturnType<typeof getClient>, objectType: string) {
  let hint = "salesmap-list-objects로 확인하세요.";
  try {
    const defs = [...(await getDefinitionMap(client)).values()];
    if (defs.length) hint = `이 워크스페이스의 커스텀 오브젝트: ${defs.join(", ")}`;
  } catch { /* 조회 실패 시 기본 안내 */ }
  return err(`objectType에 "${objectType}"은(는) 쓸 수 없습니다. 커스텀 오브젝트는 정의 이름을 그대로 넣으세요 (예: objectType: "티켓(CRM)").\n\n[힌트] ${hint}`);
}

// 상품·견적서는 v3 create dispatcher에 case가 없어 필드 검증을 통과한 뒤
// 400 "지원하지 않는 오브젝트 유형"이 된다 (백엔드 확인 2026-07-28).
//
// 상품: 스키마가 단순(name·price·description)해 이 도구의 properties로 표현 가능 →
//       v2 POST /v2/product 루프로 내부 처리. 호출자는 v2/v3를 몰라도 된다.
// 견적서: quoteProductList(라인아이템 배열)·dealId XOR leadId 등 전용 스키마가 필요해
//        이 도구의 properties(scalar만 허용)로 표현할 수 없다 → 전용 도구로 안내.
const PRODUCT_TYPES = new Set(["상품", "product"]);
const CREATE_UNSUPPORTED: Record<string, string> = {
  "견적서": "salesmap-create-quote",
  quote: "salesmap-create-quote",
};

// 상품의 실제 필드명은 `금액`이다(`가격` 아님). LLM이 흔히 쓰는 표현을 실제 이름으로 모은다.
const PRODUCT_ALIAS: Record<string, string> = {
  "가격": "금액", "단가": "금액", price: "금액", amount: "금액",
  name: "이름", "상품명": "이름", "제품명": "이름",
  code: "코드", type: "유형", status: "상태", owner: "담당자", unit: "단위",
};


/**
 * 상품 생성 — v3 create 미지원이라 v2 단건 API를 순회한다.
 * `유형`·`상태`·`담당자`·`코드`·`단위` 등은 fieldList로 전달해야 저장된다
 * (top-level name/price만 보내면 나머지가 조용히 사라진다).
 */
async function createProducts(
  client: ReturnType<typeof getClient>,
  inputList: V3CreateInput[],
): Promise<{ objectList: Array<{ id: string; name: string }>; errors: unknown[]; warnings: string[] }> {
  const objectList: Array<{ id: string; name: string }> = [];
  const errors: unknown[] = [];
  const warnings: string[] = [];

  for (const [index, input] of inputList.entries()) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input.properties)) props[PRODUCT_ALIAS[k] ?? k] = v;

    if (typeof props["이름"] !== "string" || !props["이름"]) {
      errors.push({ code: "REQUIRED_FIELD", inputIndex: index, fieldName: "이름", message: "상품 이름은 필수입니다" });
      continue;
    }
    if (typeof props["금액"] !== "number") {
      errors.push({
        code: "REQUIRED_FIELD", inputIndex: index, fieldName: "금액",
        message: "상품 금액은 숫자로 필수입니다 (필드명은 '가격'이 아니라 '금액')",
      });
      continue;
    }

    // 나머지 필드는 스키마를 보고 타입별 값 키로 변환해 fieldList에 싣는다
    const { fieldList, errors: resolveErrors, extractedTopLevel } =
      await resolveProperties(client, "product", props);
    if (resolveErrors.length) {
      errors.push({ code: "INVALID_FIELD", inputIndex: index, message: resolveErrors.join(" / ") });
      continue;
    }

    try {
      const r = await client.post<{ product?: { id: string; name: string } }>("/v2/product", {
        ...extractedTopLevel,
        ...(fieldList.length ? { fieldList } : {}),
      });
      if (r.product) objectList.push({ id: r.product.id, name: r.product.name });
    } catch (e) {
      errors.push({ code: "CREATE_FAILED", inputIndex: index, message: (e as Error).message });
    }
  }
  return { objectList, errors, warnings };
}

// objectType 자리에 오면 안 되는 커오 리터럴 — 정의 이름으로 안내한다
const CUSTOM_OBJECT_LITERALS = new Set(["custom-object", "customObject", "커스텀 오브젝트", "커스텀오브젝트"]);

// 딜·리드는 메인 고객/메인 회사 중 하나 필수, 메인 견적서는 생성 시 지정 불가
const PRIMARY_RELATION_REQUIRED = new Set(["딜", "리드"]);

const V3_CREATE_PROPERTY_VALUE = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
]);

type V3CreateValue = z.infer<typeof V3_CREATE_PROPERTY_VALUE>;
type V3CreateInput = {
  properties: Record<string, V3CreateValue>;
  associations?: Record<string, string[]>;
};

function validateIdParams(params: Record<string, unknown>): string | null {
  for (const key of ["pipelineId", "pipelineStageId"]) {
    const v = params[key];
    if (typeof v === "string" && !UUID_RE.test(v) && !HEX_ID_RE.test(v)) {
      return `${key}는 ID 형식이어야 합니다. salesmap-get-pipelines로 조회하세요. (입력값: "${v}")`;
    }
  }
  const idFields: Array<[string, string]> = [
    ["peopleId", "salesmap-search-objects (people)"],
    ["organizationId", "salesmap-search-objects (organization)"],
  ];
  for (const [key, tool] of idFields) {
    const v = params[key];
    if (typeof v === "string" && !UUID_RE.test(v) && !HEX_ID_RE.test(v)) {
      return `${key}는 ID 형식이어야 합니다. ${tool}로 ID를 확인하세요. (입력값: "${v}")`;
    }
  }
  return null;
}

function summarizeFields(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ["name", "status", "pipelineId", "pipelineStageId", "price"]) {
    if (params[key] !== undefined) parts.push(`${key}=${JSON.stringify(params[key])}`);
  }
  const properties = params.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    for (const [k, v] of Object.entries(properties as Record<string, unknown>)) {
      parts.push(`${k}=${JSON.stringify(v)}`);
    }
  }
  return parts.join(", ");
}

function normalizeWrappedName(name: string): string {
  const trimmed = name.trim().replace(/\\"/g, "\"");
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeNamedRecord<T>(
  record: Record<string, T> | undefined,
  path: string,
): { record?: Record<string, T>; warnings: string[]; error?: string } {
  if (!record) return { warnings: [] };
  const normalized: Record<string, T> = {};
  const warnings: string[] = [];

  for (const [rawKey, value] of Object.entries(record)) {
    const key = normalizeWrappedName(rawKey);
    if (!key) return { warnings, error: `${path}에 빈 필드명이 있습니다.` };
    if (Object.prototype.hasOwnProperty.call(normalized, key)) {
      return { warnings, error: `${path}에 중복 필드명이 있습니다: "${key}"` };
    }
    normalized[key] = value;
    if (key !== rawKey) warnings.push(`${path}: "${rawKey}" → "${key}"`);
  }

  return { record: normalized, warnings };
}

function normalizeV3CreateInput(inputList: V3CreateInput[]): { inputList?: V3CreateInput[]; warnings: string[]; error?: string } {
  const warnings: string[] = [];
  const normalized: V3CreateInput[] = [];

  for (const [index, input] of inputList.entries()) {
    const data = normalizeNamedRecord(input.properties, `inputList[${index}].properties`);
    if (data.error) return { warnings, error: data.error };
    warnings.push(...data.warnings);

    const associations = normalizeNamedRecord(input.associations, `inputList[${index}].associations`);
    if (associations.error) return { warnings, error: associations.error };
    warnings.push(...associations.warnings);

    normalized.push({
      properties: data.record ?? {},
      ...(associations.record ? { associations: associations.record } : {}),
    });
  }

  return { inputList: normalized, warnings };
}

async function canonicalizeV3CreateProperties(
  client: ReturnType<typeof getClient>,
  objectType: string,
  inputList: V3CreateInput[],
): Promise<{ inputList: V3CreateInput[]; warnings: string[] }> {
  // 커스텀 오브젝트는 `이름` 시스템 필드가 없고 정의마다 대표 필드명이 다르다.
  // 별칭을 `이름`으로 보정하면 존재하지 않는 필드를 만들게 되므로 보정 자체를 건너뛴다.
  const V3_TO_V2_SCHEMA: Record<string, string> = {
    "고객": "people", "회사": "organization", "딜": "deal", "리드": "lead",
  };
  const schemaType = V3_TO_V2_SCHEMA[objectType] ?? (V3_CREATE_TYPE_MAP[objectType] ? objectType : null);
  if (!schemaType) return { inputList, warnings: [] };

  // 스키마 조회 실패(권한·미지원 타입 등)는 보정을 포기하고 API 검증에 맡긴다.
  let names: Set<string>;
  try {
    const schema = await getFieldSchema(client, V3_TO_V2_SCHEMA[objectType] ?? schemaType);
    names = new Set(schema.fieldList.map(f => f.name));
  } catch {
    return { inputList, warnings: [] };
  }

  // 보정·중복 검사는 try 밖에서 — 여기서 던지는 에러는 사용자에게 그대로 전달돼야 한다.
  const warnings: string[] = [];
  const fixed: V3CreateInput[] = [];
  for (const [index, input] of inputList.entries()) {
    const properties: Record<string, V3CreateValue> = {};
    for (const [rawName, value] of Object.entries(input.properties)) {
      const name = canonicalFieldName(rawName, n => n === "이름" || names.has(n), names);
      if (Object.prototype.hasOwnProperty.call(properties, name)) {
        throw new Error(
          `inputList[${index}].properties에 중복 필드명이 있습니다: "${name}"`
          + (name !== rawName ? ` ("${rawName}"이 "${name}"으로 교정되면서 충돌)` : ""),
        );
      }
      properties[name] = value;
      if (name !== rawName) warnings.push(`inputList[${index}].properties: "${rawName}" → "${name}"`);
    }
    fixed.push({ ...input, properties });
  }
  return { inputList: fixed, warnings };
}

function validateV3BatchCreate(objectType: string, apiType: string, inputList: V3CreateInput[]): string | null {
  for (const [index, input] of inputList.entries()) {
    const associations = input.associations ?? {};

    for (const [name, ids] of Object.entries(associations)) {
      for (const [idIndex, id] of ids.entries()) {
        if (!UUID_RE.test(id) && !HEX_ID_RE.test(id)) {
          return `inputList[${index}].associations["${name}"][${idIndex}]는 ID 형식이어야 합니다. salesmap-search-objects로 레코드 ID를 확인하세요.`;
        }
      }
    }

    // 딜만 "파이프라인 단계" 필수. 리드·커스텀 오브젝트는 선택 (백엔드 확인 2026-07-28)
    if (apiType === "딜" && input.properties["파이프라인 단계"] === undefined) {
      return `inputList[${index}] 딜 생성에는 properties["파이프라인 단계"]가 필요합니다. v3 create에서는 단계 ID가 아니라 단계 이름을 전달하세요.`;
    }

    // "파이프라인" 단독 지정 불가 — 단계명이 여러 파이프라인에 겹칠 때 구분용으로만 함께 쓴다
    if (input.properties["파이프라인"] !== undefined && input.properties["파이프라인 단계"] === undefined) {
      return `inputList[${index}] properties["파이프라인"]은 단독으로 쓸 수 없습니다. properties["파이프라인 단계"]를 함께 전달하세요 (파이프라인은 단계명이 여러 파이프라인에 중복될 때 구분용).`;
    }

    if (PRIMARY_RELATION_REQUIRED.has(apiType)) {
      if (!associations["메인 고객"]?.length && !associations["메인 회사"]?.length) {
        return `inputList[${index}] ${apiType} 생성에는 associations["메인 고객"] 또는 associations["메인 회사"]가 필요합니다. 관계 값은 레코드 ID 배열입니다.`;
      }
      if (associations["메인 견적서"]?.length) {
        return `inputList[${index}] ${apiType} 생성 시 associations["메인 견적서"]는 지정할 수 없습니다. 생성 후 salesmap-create-quote로 견적서를 만드세요.`;
      }
    }
  }

  return null;
}

const GET_ONE_TYPES = new Set(["people", "organization", "deal", "lead"]);

export function registerGenericTools(server: McpServer) {
  // ── Batch Read ────────────────────────────────────────
  server.tool(
    "salesmap-batch-read-objects",
    "🎯 레코드 일괄 조회(최대 500).\n📦 fieldList로 원하는 필드만, associationList로 연결 레코드를 인라인으로 포함 가능.\n🔗 다른 레코드를 참조하는 관계형 필드(고객·회사·딜 연결 등)는 fieldList가 아닌 associationList에 지정.",
    {
      objectType: z.string()
        .describe("오브젝트 타입. 기본값: 'people' | 'organization' | 'deal' | 'lead' | 'quote' | 'product'. 커스텀 오브젝트는 정의 이름을 그대로 (예: '티켓(CRM)', salesmap-list-objects로 확인) — 'custom-object' 리터럴은 사용 불가."),
      objectIds: z.array(z.string()).min(1).max(500).describe("레코드 ID 배열 (최대 500개)"),
      fieldList: z.array(z.string()).optional()
        .describe("반환할 필드명 목록 (한글). 생략 시 전체 필드 반환."),
      associationList: z.array(z.string()).optional()
        .describe("인라인으로 포함할 연결 관계명 목록. 사용 가능한 관계명은 salesmap-list-associations로 먼저 확인."),
    },
    READ,
    async ({ objectType, objectIds, fieldList, associationList }, extra) => {
      try {
        const client = getClient(extra);

        if (V3_OBJECT_READ) {
          // ── v3: 단일 배치 호출 (마이그레이션: 2026-06-30) ──
          // read도 create와 같은 규칙 — 커오는 정의 이름을 받는다 (백엔드 확인 2026-07-29)
          if (CUSTOM_OBJECT_LITERALS.has(objectType)) return customObjectLiteralError(client, objectType);
          const apiType = V3_TYPE_MAP[objectType] ?? objectType;
          const body: Record<string, unknown> = { objectType: apiType, idList: objectIds };
          if (fieldList?.length) body.fieldList = fieldList;
          if (associationList?.length) body.associationList = associationList;
          try {
            return ok(await client.post("/v3/object/read", body));
          } catch (e: unknown) {
            const msg = (e as Error).message;
            // fieldList 에러: 관계형 필드면 associationList로 안내, 아니면 list-properties 안내
            // (v3는 관계형 필드를 field가 아닌 association으로 취급 — list-properties엔 필드로 보여서 이름 재확인만으론 못 벗어남)
            if (msg.includes("필드를 찾을 수 없습니다")) {
              const missing = msg.match(/필드를 찾을 수 없습니다:\s*(.+)/)?.[1]?.trim();
              // 이름 필드 별칭(회사명·딜 이름 등)이면 `이름`으로 교정해 1회 재시도.
              // 정상 경로엔 스키마 조회를 넣지 않으려고 실패했을 때만 확인한다.
              if (missing && fieldList?.length) {
                try {
                  const schema = await getFieldSchema(client, objectType);
                  const names = new Set(schema.fieldList.map(f => f.name));
                  const fixed = fieldList.map(n => canonicalFieldName(n, x => names.has(x), names));
                  if (fixed.some((n, i) => n !== fieldList[i])) {
                    return ok(await client.post("/v3/object/read", { ...body, fieldList: fixed }));
                  }
                } catch { /* 교정 실패 시 아래 기본 힌트로 */ }
              }
              if (missing) {
                try {
                  const schema = await client.post<{ associationList: Array<{ name: string }> }>("/v3/association/list", { objectType: apiType });
                  const assocNames = new Set(schema.associationList.map((a) => a.name));
                  if (assocNames.has(missing)) {
                    return err(`${msg}\n\n[힌트] "${missing}"은(는) 관계형 필드입니다 — fieldList가 아닌 associationList: ["${missing}"]으로 조회하세요.`);
                  }
                } catch { /* association 조회 실패 시 아래 기본 힌트로 */ }
              }
              const hint = `salesmap-list-properties(objectType: "${objectType}")로 정확한 필드명을 확인하세요.\n요청한 fieldList: ${fieldList?.join(", ")}`;
              return err(`${msg}\n\n[힌트] ${hint}`);
            }
            // associationList 에러: 사용 가능한 관계명 자동 조회해서 함께 반환
            if (msg.includes("관계 이름을 찾을 수 없습니다")) {
              try {
                const schema = await client.post<{ associationList: Array<{ name: string }> }>("/v3/association/list", { objectType: apiType });
                const names = schema.associationList.map((a) => a.name).join(", ");
                return err(`${msg}\n\n[힌트] "${objectType}" 오브젝트의 사용 가능한 관계명: ${names}`);
              } catch {
                return err(`${msg}\n\n[힌트] salesmap-list-associations(objectType: "${objectType}")로 사용 가능한 관계명을 확인하세요.`);
              }
            }
            return err(msg);
          }
        }

        // ── v2 fallback (롤백 시 사용) ──────────────────────
        const useGetOne = GET_ONE_TYPES.has(objectType);
        const effectiveProps = (fieldList && fieldList.length > 0)
          ? fieldList
          : await getDefaultProperties(client, objectType);
        const defMap = objectType === "custom-object" ? await getDefinitionMap(client) : null;
        const results: Array<{ id: string; data?: Record<string, unknown>; error?: string }> = [];
        const tasks = objectIds.map(async (id) => {
          try {
            const path = `/v2/${objectType}/${id}`;
            const rawData = useGetOne ? await client.getOne(path, objectType) : await client.get(path);
            const record = pickProperties(rawData as Record<string, unknown>, effectiveProps);
            if (defMap) {
              const defId = (rawData as Record<string, unknown>).customObjectDefinitionId as string | undefined;
              const defName = defId ? defMap.get(defId) : undefined;
              if (defName) record.customObjectDefinition = defName;
            }
            return { id, data: record } as { id: string; data?: Record<string, unknown>; error?: string };
          } catch (e: unknown) {
            return { id, error: (e as Error).message } as { id: string; data?: Record<string, unknown>; error?: string };
          }
        });
        results.push(...await Promise.all(tasks));
        return ok({ total: results.length, records: results });
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Batch Create ──────────────────────────────────────
  server.tool(
    "salesmap-batch-create-objects",
    "🎯 레코드 생성 전용 도구 (1~100건). 1건이든 여러 건이든 생성은 이 도구를 사용. 견적서만 salesmap-create-quote.\n📋 properties는 필드명→값 그대로. 사용자 필드는 활성 사용자 이름, 관계는 associations에 관계명→레코드 ID(UUID) 배열.\n⚠️ 딜·리드: associations[\"메인 고객\"] 또는 [\"메인 회사\"] 필수. 딜은 properties[\"파이프라인 단계\"](단계 이름) 필수, 리드는 선택. \"메인 견적서\"는 생성 시 지정 불가.\n🧩 커스텀 오브젝트: objectType에 정의 이름을 그대로 넣음(예: '티켓(CRM)'). '이름' 필드가 없고 정의별 대표 필드가 필수이며, system 관계 없이 워크스페이스에 정의한 관계만 사용.\n📦 상품: properties에 '이름'(필수)·'금액'(숫자, 필수) + '유형'·'상태'·'담당자'·'코드'·'단위' 등. 금액 필드명은 '가격'이 아니라 '금액'. associations 미지원.",
    {
      objectType: z.string()
        .describe("오브젝트 타입. 기본값: 'people' | 'organization' | 'deal' | 'lead' | 'product'. 커스텀 오브젝트는 정의 이름을 그대로 (예: '티켓(CRM)', salesmap-list-objects로 확인) — 'custom-object' 리터럴은 사용 불가. 견적서는 salesmap-create-quote 사용."),
      inputList: z.array(z.object({
        properties: z.record(V3_CREATE_PROPERTY_VALUE)
          .describe("생성할 필드 key-value. text=string, number=number/string, singleSelect=option string, multiSelect=string[], checkbox=boolean, date=ISO string, user=활성 사용자 이름, 빈 값=null."),
        associations: z.record(z.array(z.string())).optional()
          .describe("관계명 → 레코드 ID(UUID) 배열. 예: { \"메인 고객\": [\"people-id\"], \"메인 회사\": [\"organization-id\"] }. 이름 문자열은 불가. 워크스페이스에 정의한 커스텀 관계도 생성 시점에 지정 가능."),
      })).min(1).max(100)
        .describe("생성할 레코드 목록. v3 API 제한: 1~100건."),
    },
    WRITE,
    async ({ objectType, inputList }, extra) => {
      try {
        const client = getClient(extra);

        // 커오는 리터럴이 아니라 정의 이름을 받는다 — 리터럴이 오면 사용 가능한 이름을 붙여 안내
        if (CUSTOM_OBJECT_LITERALS.has(objectType)) return customObjectLiteralError(client, objectType);

        // 견적서는 전용 스키마(quoteProductList 등)가 필요해 이 도구로 표현 불가
        const unsupported = CREATE_UNSUPPORTED[objectType];
        if (unsupported) {
          return err(`"${objectType}"은(는) 이 도구로 생성할 수 없습니다. 견적서는 상품 라인아이템·딜/리드 연결 등 전용 입력이 필요합니다.\n\n[힌트] ${unsupported}를 사용하세요.`);
        }

        const normalized = normalizeV3CreateInput(inputList);
        if (normalized.error) return err(normalized.error);

        // 상품은 v3 create 미지원 → v2 단건 API 순회로 처리 (호출자에겐 동일하게 보인다)
        if (PRODUCT_TYPES.has(objectType)) {
          const r = await createProducts(client, normalized.inputList ?? []);
          const allWarn = [...normalized.warnings, ...r.warnings];
          const warn = allWarn.length ? { normalizedInput: allWarn } : {};
          if (r.errors.length && !r.objectList.length) {
            return err(r.errors.map((e) => JSON.stringify(e)).join("\n"));
          }
          return ok({ ...warn, result: { objectList: r.objectList, ...(r.errors.length ? { errors: r.errors } : {}) } });
        }

        const apiType = V3_CREATE_TYPE_MAP[objectType] ?? objectType;
        const canonicalized = await canonicalizeV3CreateProperties(client, apiType, normalized.inputList ?? []);
        const records = canonicalized.inputList;
        const validationError = validateV3BatchCreate(objectType, apiType, records);
        if (validationError) return err(validationError);

        const body: Record<string, unknown> = {
          objectType: apiType,
          inputList: records.map((input) => ({
            data: input.properties,
            ...(input.associations ? { association: input.associations } : {}),
          })),
        };
        const result = await client.post("/v3/object/create", body);
        const allWarnings = [...normalized.warnings, ...canonicalized.warnings];
        const warnings = allWarnings.length ? { normalizedInput: allWarnings } : {};
        return ok({ ...warnings, result });
      } catch (e: unknown) {
        const msg = (e as Error).message;
        if (msg.includes("필드를 찾을 수 없습니다") || msg.includes("존재하지 않는 필드")) {
          return err(`${msg}\n\n[힌트] properties의 key는 필드 표시명 그대로 전달하세요. 사용 가능한 필드는 salesmap-list-properties로 확인하세요.`);
        }
        if (msg.includes("관계") || msg.includes("association")) {
          return err(`${msg}\n\n[힌트] associations의 key는 관계명, value는 레코드 ID 배열입니다. 사용 가능한 관계명은 salesmap-list-associations로 확인하세요.`);
        }
        return err(msg);
      }
    },
  );

  // ── Update ────────────────────────────────────────────
  server.tool(
    "salesmap-update-object",
    "🎯 레코드 수정. properties에 변경할 필드만 전달.\n📋 salesmap-list-properties로 필드 확인.",
    {
      objectType: z.enum(["people", "organization", "deal", "lead", "custom-object"])
        .describe("오브젝트 타입"),
      objectId: z.string().describe("레코드 ID"),
      properties: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
        .optional()
        .describe("변경할 필드 key-value. 예: { \"담당자\": \"홍길동\", \"상태\": \"Won\" }"),
      peopleId: z.string().optional(),
      organizationId: z.string().optional(),
    },
    WRITE,
    async ({ objectType, objectId, properties, ...rest }, extra) => {
      const idErr = validateIdParams(rest);
      if (idErr) return err(idErr);

      try {
        const client = getClient(extra);
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }

        // Convert simplified properties → fieldList + extract top-level params
        if (properties && Object.keys(properties).length > 0) {
          const { fieldList, errors, extractedTopLevel } = await resolveProperties(client, objectType, properties);
          if (errors.length > 0) return err(errors.join("\n"));
          Object.assign(body, extractedTopLevel);
          if (fieldList.length > 0) body.fieldList = fieldList;
        }

        return ok(await client.post(`/v2/${objectType}/${objectId}`, body));
      } catch (e: unknown) {
        return errWithSchemaHint((e as Error).message, objectType, summarizeFields({ ...rest, properties }));
      }
    },
  );

  // ── Delete ───────────────────────────────────────────
  server.tool(
    "salesmap-delete-object",
    `🎯 레코드 삭제.\n🛡️ 영구 삭제 (confirmed=false 미리보기 → true).`,
    {
      objectType: z.enum(["deal", "lead"])
        .describe("오브젝트 타입 (deal, lead만 지원)"),
      objectId: z.string().describe("삭제할 레코드 ID"),
      confirmed: z.boolean().default(false)
        .describe("false=삭제 대상 미리보기만, true=실제 삭제 실행"),
    },
    DESTRUCTIVE,
    async ({ objectType, objectId, confirmed }, extra) => {
      if (!UUID_RE.test(objectId) && !HEX_ID_RE.test(objectId)) {
        return err("objectId는 UUID 또는 ObjectId 형식이어야 합니다.");
      }

      const client = getClient(extra);

      // Preview mode — show record without deleting
      if (!confirmed) {
        try {
          const path = `/v2/${objectType}/${objectId}`;
          const data = await client.getOne(path, objectType);
          const record = compactRecord(data as Record<string, unknown>);
          return ok({
            action: "preview",
            message: `⚠️ 이 ${objectType} 레코드를 영구 삭제하려고 합니다. 되돌릴 수 없습니다. 삭제하려면 confirmed=true로 다시 호출하세요.`,
            record,
          });
        } catch (e: unknown) {
          return err((e as Error).message);
        }
      }

      // Attempt Elicitation (if client supports it)
      try {
        const elicitResult = await server.server.elicitInput({
          mode: "form",
          message: `⚠️ ${objectType} 레코드를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.`,
          requestedSchema: {
            type: "object",
            properties: {
              confirm: {
                type: "boolean",
                title: "삭제 확인",
                description: `${objectType} ${objectId} 를 정말 삭제하시겠습니까?`,
                default: false,
              },
            },
            required: ["confirm"],
          },
        });

        if (elicitResult.action === "decline" || elicitResult.action === "cancel") {
          return ok({ cancelled: true, message: "사용자가 삭제를 취소했습니다." });
        }
        if (elicitResult.action === "accept" && !elicitResult.content?.confirm) {
          return ok({ cancelled: true, message: "삭제 확인이 체크되지 않았습니다." });
        }
      } catch {
        // Client doesn't support elicitation — fall back to description guardrails
      }

      // Execute deletion
      try {
        await client.post(`/v2/${objectType}/${objectId}/delete`);
        return ok({ deleted: true, type: objectType, id: objectId });
      } catch (e: unknown) {
        const msg = (e as Error).message;
        if (msg.includes("시퀀스")) {
          return err(`${msg}\n\n[힌트] 시퀀스에 등록된 레코드는 삭제 불가 — 시퀀스 해제 후 재시도하세요.`);
        }
        return err(msg);
      }
    },
  );
}
