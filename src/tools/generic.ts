import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, errWithSchemaHint, compactRecord } from "../client";
import { getClient } from "../types";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── pre-validation ────────────────────────────────────
function validateCreate(type: string, params: Record<string, unknown>): string | null {
  if (type === "deal") {
    if (!params.pipelineId) return "deal 생성에는 pipelineId가 필요합니다. salesmap_get_pipeline_ids로 조회하세요.";
    if (!params.pipelineStageId) return "deal 생성에는 pipelineStageId가 필요합니다. salesmap_get_pipeline_ids로 조회하세요.";
    if (!params.status) return "deal 생성에는 status가 필요합니다. ('Won', 'Lost', 'In progress')";
  }
  if ((type === "deal" || type === "lead") && !params.peopleId && !params.organizationId) {
    return `${type} 생성에는 peopleId 또는 organizationId가 필요합니다.`;
  }
  return validateIdParams(params);
}

function validateIdParams(params: Record<string, unknown>): string | null {
  // top-level ID 파라미터 UUID 검증
  const idFields: Array<[string, string]> = [
    ["pipelineId", "salesmap_get_pipeline_ids"],
    ["pipelineStageId", "salesmap_get_pipeline_ids"],
    ["peopleId", "salesmap_search_records (people)"],
    ["organizationId", "salesmap_search_records (organization)"],
  ];
  for (const [key, tool] of idFields) {
    const v = params[key];
    if (typeof v === "string" && !UUID_RE.test(v)) {
      return `${key}는 UUID여야 합니다. ${tool}로 ID를 확인하세요. (입력값: "${v}")`;
    }
  }
  // fieldList 내 relation 값 UUID 검증
  const fieldList = params.fieldList;
  if (Array.isArray(fieldList)) {
    for (const field of fieldList) {
      const f = field as Record<string, unknown>;
      for (const vk of ["userValueId", "organizationValueId", "peopleValueId"]) {
        const v = f[vk];
        if (typeof v === "string" && !UUID_RE.test(v)) {
          const tool = vk === "userValueId" ? "salesmap_list_users" : "salesmap_search_records";
          return `fieldList의 "${f.name}" → ${vk}는 UUID여야 합니다. ${tool}로 ID를 확인하세요. (입력값: "${v}")`;
        }
      }
    }
  }
  return null;
}

const fieldListItem = z.object({
  name: z.string(),
  stringValue: z.string().optional(),
  numberValue: z.number().optional(),
  booleanValue: z.boolean().optional(),
  dateValue: z.string().optional(),
  stringValueList: z.array(z.string()).optional(),
  userValueId: z.string().optional(),
  organizationValueId: z.string().optional(),
  peopleValueId: z.string().optional(),
}).passthrough();

const GET_ONE_TYPES = new Set(["people", "organization", "deal", "lead"]);

export function registerGenericTools(server: McpServer) {
  // ── Get ───────────────────────────────────────────────
  server.tool(
    "salesmap_get_record",
    "레코드 상세 조회. null 필드는 응답에서 생략됨 — 응답에 없는 필드 = 값 없음.",
    {
      type: z.enum(["people", "organization", "deal", "lead", "custom-object", "email"])
        .describe("오브젝트 타입"),
      id: z.string().describe("레코드 UUID"),
    },
    READ,
    async ({ type, id }, extra) => {
      try {
        const client = getClient(extra);
        const path = `/v2/${type}/${id}`;
        let data: unknown;
        if (GET_ONE_TYPES.has(type)) {
          data = await client.getOne(path, type);
        } else {
          data = await client.get(path);
        }
        return ok(compactRecord(data as Record<string, unknown>));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Batch Get ────────────────────────────────────────
  server.tool(
    "salesmap_batch_get_records",
    "여러 레코드 일괄 조회 (최대 20개). null 필드는 응답에서 생략됨 — 응답에 없는 필드 = 값 없음.",
    {
      type: z.enum(["people", "organization", "deal", "lead", "custom-object"])
        .describe("오브젝트 타입 (모든 ID가 같은 타입이어야 함)"),
      ids: z.array(z.string()).min(1).max(20).describe("레코드 ID 배열 (최대 20개)"),
    },
    READ,
    async ({ type, ids }, extra) => {
      try {
        const client = getClient(extra);
        const useGetOne = GET_ONE_TYPES.has(type);
        const results: Array<{ id: string; data?: Record<string, unknown>; error?: string }> = [];

        for (const id of ids) {
          try {
            const path = `/v2/${type}/${id}`;
            let data: unknown;
            if (useGetOne) {
              data = await client.getOne(path, type);
            } else {
              data = await client.get(path);
            }
            results.push({ id, data: compactRecord(data as Record<string, unknown>) });
          } catch (e: unknown) {
            results.push({ id, error: (e as Error).message });
          }
        }

        return ok({ total: results.length, records: results });
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Create ────────────────────────────────────────────
  server.tool(
    "salesmap_create_record",
    "레코드 생성.",
    {
      type: z.enum(["people", "organization", "deal", "lead", "custom-object", "product"])
        .describe("오브젝트 타입"),
      name: z.string().optional().describe("이름 (custom-object 제외 필수)"),
      memo: z.string().optional().describe("초기 메모"),
      fieldList: z.array(fieldListItem).optional().describe("커스텀 필드"),
      peopleId: z.string().optional().describe("고객 ID (deal/lead는 peopleId 또는 organizationId 중 하나 필수)"),
      organizationId: z.string().optional().describe("회사 ID (deal/lead는 peopleId 또는 organizationId 중 하나 필수)"),
      pipelineId: z.string().optional().describe("파이프라인 ID (deal 필수)"),
      pipelineStageId: z.string().optional().describe("단계 ID (deal 필수)"),
      status: z.enum(["Won", "Lost", "In progress"]).optional().describe("딜 상태 (deal 필수)"),
      price: z.number().optional().describe("금액 (deal)"),
      customObjectDefinitionId: z.string().optional().describe("Definition ID (custom-object 필수)"),
    },
    WRITE,
    async ({ type, ...rest }, extra) => {
      const createErr = validateCreate(type, rest);
      if (createErr) return err(createErr);

      try {
        const client = getClient(extra);
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        return ok(await client.post(`/v2/${type}`, body));
      } catch (e: unknown) {
        return errWithSchemaHint((e as Error).message, type);
      }
    },
  );

  // ── Update ────────────────────────────────────────────
  server.tool(
    "salesmap_update_record",
    "레코드 수정.",
    {
      type: z.enum(["people", "organization", "deal", "lead", "custom-object"])
        .describe("오브젝트 타입"),
      id: z.string().describe("레코드 UUID"),
      name: z.string().optional(),
      fieldList: z.array(fieldListItem).optional().describe("커스텀 필드"),
      peopleId: z.string().optional(),
      organizationId: z.string().optional(),
      pipelineId: z.string().optional(),
      pipelineStageId: z.string().optional(),
      status: z.enum(["Won", "Lost", "In progress"]).optional(),
      price: z.number().optional().describe("금액 (deal)"),
    },
    WRITE,
    async ({ type, id, ...rest }, extra) => {
      const idErr = validateIdParams(rest);
      if (idErr) return err(idErr);

      try {
        const client = getClient(extra);
        const body = Object.fromEntries(
          Object.entries(rest).filter(([, v]) => v !== undefined),
        );
        return ok(await client.post(`/v2/${type}/${id}`, body));
      } catch (e: unknown) {
        return errWithSchemaHint((e as Error).message, type);
      }
    },
  );
}
