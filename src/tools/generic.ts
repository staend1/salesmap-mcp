import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, errWithSchemaHint, compactRecord, pickProperties } from "../client";
import { getClient } from "../types";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false } as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── pre-validation ────────────────────────────────────
function validateCreate(type: string, params: Record<string, unknown>): string | null {
  if (type === "deal") {
    if (!params.pipelineId) return "deal 생성에는 pipelineId가 필요합니다. salesmap-get-pipelines로 조회하세요.";
    if (!params.pipelineStageId) return "deal 생성에는 pipelineStageId가 필요합니다. salesmap-get-pipelines로 조회하세요.";
    if (!params.status) return "deal 생성에는 status가 필요합니다. ('Won', 'Lost', 'In progress')";
  }
  if ((type === "deal" || type === "lead") && !params.peopleId && !params.organizationId) {
    return `${type} 생성에는 peopleId 또는 organizationId가 필요합니다.`;
  }
  return validateIdParams(params);
}

function validateIdParams(params: Record<string, unknown>): string | null {
  // Validate top-level ID params are UUIDs
  const idFields: Array<[string, string]> = [
    ["pipelineId", "salesmap-get-pipelines"],
    ["pipelineStageId", "salesmap-get-pipelines"],
    ["peopleId", "salesmap-search-objects (people)"],
    ["organizationId", "salesmap-search-objects (organization)"],
  ];
  for (const [key, tool] of idFields) {
    const v = params[key];
    if (typeof v === "string" && !UUID_RE.test(v)) {
      return `${key}는 UUID여야 합니다. ${tool}로 ID를 확인하세요. (입력값: "${v}")`;
    }
  }
  // Validate relation field values in fieldList are UUIDs
  const fieldList = params.fieldList;
  if (Array.isArray(fieldList)) {
    for (const field of fieldList) {
      const f = field as Record<string, unknown>;
      for (const vk of ["userValueId", "organizationValueId", "peopleValueId"]) {
        const v = f[vk];
        if (typeof v === "string" && !UUID_RE.test(v)) {
          const tool = vk === "userValueId" ? "salesmap-list-users" : "salesmap-search-objects";
          return `fieldList의 "${f.name}" → ${vk}는 UUID여야 합니다. ${tool}로 ID를 확인하세요. (입력값: "${v}")`;
        }
      }
    }
  }
  return null;
}

function summarizeFields(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ["name", "status", "pipelineId", "pipelineStageId", "price"]) {
    if (params[key] !== undefined) parts.push(`${key}=${JSON.stringify(params[key])}`);
  }
  const fieldList = params.fieldList;
  if (Array.isArray(fieldList)) {
    for (const f of fieldList) {
      const field = f as Record<string, unknown>;
      const val = field.stringValue ?? field.numberValue ?? field.booleanValue ?? field.dateValue
        ?? field.stringValueList ?? field.userValueId ?? field.organizationValueId ?? field.peopleValueId;
      parts.push(`${field.name}=${JSON.stringify(val)}`);
    }
  }
  return parts.join(", ");
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
  // ── Read ───────────────────────────────────────────────
  server.tool(
    "salesmap-read-object",
    "레코드 상세 조회. null 필드는 응답에서 생략됨 — 응답에 없는 필드 = 값 없음.",
    {
      objectType: z.enum(["people", "organization", "deal", "lead", "custom-object", "email"])
        .describe("오브젝트 타입"),
      id: z.string().describe("레코드 UUID"),
      properties: z.array(z.string()).optional()
        .describe("반환할 필드 이름 목록 (한글). 생략 시 전체 필드 반환."),
    },
    READ,
    async ({ objectType, id, properties }, extra) => {
      try {
        const client = getClient(extra);
        const path = `/v2/${objectType}/${id}`;
        let data: unknown;
        if (GET_ONE_TYPES.has(objectType)) {
          data = await client.getOne(path, objectType);
        } else {
          data = await client.get(path);
        }
        let record = compactRecord(data as Record<string, unknown>);
        if (properties && properties.length > 0) {
          record = pickProperties(record, properties);
        }
        return ok(record);
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Batch Read ────────────────────────────────────────
  server.tool(
    "salesmap-batch-read-objects",
    "여러 레코드 일괄 조회 (최대 20개). null 필드는 응답에서 생략됨 — 응답에 없는 필드 = 값 없음. 다건 조회 시 properties로 필요한 필드만 지정 권장.",
    {
      objectType: z.enum(["people", "organization", "deal", "lead", "custom-object"])
        .describe("오브젝트 타입 (모든 ID가 같은 타입이어야 함)"),
      ids: z.array(z.string()).min(1).max(20).describe("레코드 ID 배열 (최대 20개)"),
      properties: z.array(z.string()).optional()
        .describe("반환할 필드 이름 목록 (한글). 생략 시 전체 필드 반환. 다건 조회 시 지정 권장."),
    },
    READ,
    async ({ objectType, ids, properties }, extra) => {
      try {
        const client = getClient(extra);
        const useGetOne = GET_ONE_TYPES.has(objectType);
        const results: Array<{ id: string; data?: Record<string, unknown>; error?: string }> = [];

        for (const id of ids) {
          try {
            const path = `/v2/${objectType}/${id}`;
            let data: unknown;
            if (useGetOne) {
              data = await client.getOne(path, objectType);
            } else {
              data = await client.get(path);
            }
            let record = compactRecord(data as Record<string, unknown>);
            if (properties && properties.length > 0) {
              record = pickProperties(record, properties);
            }
            results.push({ id, data: record });
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
    "salesmap-create-object",
    "레코드 생성.",
    {
      objectType: z.enum(["people", "organization", "deal", "lead", "custom-object", "product"])
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
    async ({ objectType, ...rest }, extra) => {
      const createErr = validateCreate(objectType, rest);
      if (createErr) return err(createErr);

      try {
        const client = getClient(extra);
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        return ok(await client.post(`/v2/${objectType}`, body));
      } catch (e: unknown) {
        return errWithSchemaHint((e as Error).message, objectType, summarizeFields(rest));
      }
    },
  );

  // ── Update ────────────────────────────────────────────
  server.tool(
    "salesmap-update-object",
    "레코드 수정.",
    {
      objectType: z.enum(["people", "organization", "deal", "lead", "custom-object"])
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
    async ({ objectType, id, ...rest }, extra) => {
      const idErr = validateIdParams(rest);
      if (idErr) return err(idErr);

      try {
        const client = getClient(extra);
        const body = Object.fromEntries(
          Object.entries(rest).filter(([, v]) => v !== undefined),
        );
        return ok(await client.post(`/v2/${objectType}/${id}`, body));
      } catch (e: unknown) {
        return errWithSchemaHint((e as Error).message, objectType, summarizeFields(rest));
      }
    },
  );

  // ── Delete ───────────────────────────────────────────
  server.tool(
    "salesmap-delete-object",
    `🛡️ Guardrails: 되돌릴 수 없는 영구 삭제. 반드시 사용자가 명시적으로 삭제를 요청한 경우에만 사용. 첫 호출은 confirmed=false로 레코드 정보를 보여주고, 사용자 확인 후 confirmed=true로 재호출.
🎯 Purpose: deal/lead 레코드 영구 삭제. 시퀀스에 등록된 레코드는 삭제 불가 — 시퀀스 해제 후 재시도.`,
    {
      objectType: z.enum(["deal", "lead"])
        .describe("오브젝트 타입 (deal, lead만 지원)"),
      id: z.string().describe("삭제할 레코드 UUID"),
      confirmed: z.boolean().default(false)
        .describe("false=삭제 대상 미리보기만, true=실제 삭제 실행. 반드시 사용자 확인 후 true로 호출"),
    },
    DESTRUCTIVE,
    async ({ objectType, id, confirmed }, extra) => {
      if (!UUID_RE.test(id)) {
        return err("id는 UUID 형식이어야 합니다.");
      }

      const client = getClient(extra);

      // Preview mode — show record without deleting
      if (!confirmed) {
        try {
          const path = `/v2/${objectType}/${id}`;
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
                description: `${objectType} ${id} 를 정말 삭제하시겠습니까?`,
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
        await client.post(`/v2/${objectType}/${id}/delete`);
        return ok({ deleted: true, type: objectType, id });
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
