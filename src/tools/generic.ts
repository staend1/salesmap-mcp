import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, errWithSchemaHint, compactRecord, pickProperties, resolveProperties, getDefaultProperties } from "../client";
import { getClient } from "../types";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false } as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_ID_RE = /^[0-9a-f]{24}$/i; // MongoDB ObjectId

// ── pre-validation ────────────────────────────────────
function validateCreate(type: string, params: Record<string, unknown>): string | null {
  if (type === "deal") {
    if (!params.pipelineId) return "deal 생성에는 파이프라인 ID가 필요합니다. properties에 \"파이프라인\" 추가 또는 salesmap-get-pipelines로 조회하세요.";
    if (!params.pipelineStageId) return "deal 생성에는 파이프라인 단계 ID가 필요합니다. properties에 \"파이프라인 단계\" 추가 또는 salesmap-get-pipelines로 조회하세요.";
    if (!params.status) return "deal 생성에는 상태가 필요합니다. properties에 \"상태\" 추가 ('Won', 'Lost', 'In progress')";
  }
  if ((type === "deal" || type === "lead") && !params.peopleId && !params.organizationId) {
    return `${type} 생성에는 peopleId 또는 organizationId가 필요합니다.`;
  }
  return validateIdParams(params);
}

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

const GET_ONE_TYPES = new Set(["people", "organization", "deal", "lead"]);

// Association targets by object type — used for auto-count in read-object
const ASSOCIATION_TARGETS: Record<string, string[]> = {
  people: ["deal", "organization", "lead"],
  organization: ["deal", "people", "lead"],
  deal: ["people", "organization"],
  lead: ["people", "organization"],
};

async function fetchAssociationCounts(
  client: { get: (path: string, query?: Record<string, string>) => Promise<unknown> },
  objectType: string,
  objectId: string,
): Promise<Record<string, number>> {
  const targets = ASSOCIATION_TARGETS[objectType];
  if (!targets) return {};

  const results = await Promise.all(
    targets.map(async (toType) => {
      try {
        const data = await client.get(
          `/v2/object/${objectType}/${objectId}/association/${toType}/primary`,
        ) as { associationIdList?: string[] };
        return [toType, (data.associationIdList ?? []).length] as const;
      } catch {
        return [toType, 0] as const;
      }
    }),
  );

  return Object.fromEntries(results);
}

export function registerGenericTools(server: McpServer) {
  // ── Batch Read ────────────────────────────────────────
  server.tool(
    "salesmap-batch-read-objects",
    "🎯 여러 레코드 일괄 조회 (최대 20개).\n📦 생략 시 코어 필드만 반환. properties로 추가 필드 지정 가능. _associations(연관 카운트) 자동 포함.",
    {
      objectType: z.enum(["people", "organization", "deal", "lead", "custom-object"])
        .describe("오브젝트 타입 (모든 ID가 같은 타입이어야 함)"),
      objectIds: z.array(z.string()).min(1).max(20).describe("레코드 ID 배열 (최대 20개)"),
      properties: z.array(z.string()).optional()
        .describe("반환할 필드 이름 목록 (한글). 생략 시 코어 필드만 반환."),
    },
    READ,
    async ({ objectType, objectIds, properties }, extra) => {
      try {
        const client = getClient(extra);
        const useGetOne = GET_ONE_TYPES.has(objectType);
        const results: Array<{ id: string; data?: Record<string, unknown>; error?: string }> = [];

        // Determine which properties to return
        const effectiveProps = (properties && properties.length > 0)
          ? properties
          : await getDefaultProperties(client, objectType);

        // Fetch all records + associations in parallel
        const tasks = objectIds.map(async (id) => {
          try {
            const path = `/v2/${objectType}/${id}`;
            const [rawData, associations] = await Promise.all([
              useGetOne ? client.getOne(path, objectType) : client.get(path),
              fetchAssociationCounts(client, objectType, id),
            ]);
            const record = pickProperties(rawData as Record<string, unknown>, effectiveProps);
            if (Object.keys(associations).length > 0) {
              record._associations = associations;
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

  // ── Create ────────────────────────────────────────────
  server.tool(
    "salesmap-create-object",
    "🎯 레코드 생성. 필드 값은 모두 properties에 한글 이름으로 전달.\n📋 salesmap-list-properties로 필드 확인. deal은 salesmap-get-pipelines로 파이프라인·단계 ID 확인.",
    {
      objectType: z.enum(["people", "organization", "deal", "lead", "custom-object", "product"])
        .describe("오브젝트 타입"),
      properties: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
        .optional()
        .describe("필드 key-value. 예: { \"이름\": \"홍길동\", \"금액\": 50000, \"파이프라인\": \"pipeline-id\" }"),
      note: z.string().optional().describe("초기 노트"),
      peopleId: z.string().optional().describe("고객 ID (deal/lead는 peopleId 또는 organizationId 중 하나 필수)"),
      organizationId: z.string().optional().describe("회사 ID"),
      customObjectDefinitionName: z.string().optional()
        .describe("custom-object 생성 시 대상 커오 종류 이름. 사용자가 말한 이름으로 시도; 틀리면 salesmap-list-objects로 확인 (ID 대신 사용 가능)"),
      customObjectDefinitionId: z.string().optional()
        .describe("custom-object 생성 시 대상 커오 종류 ID (salesmap-list-objects의 customObjectDefinitionId). 이름과 ID 중 하나만"),
    },
    WRITE,
    async ({ objectType, properties, note, ...rest }, extra) => {
      try {
        const client = getClient(extra);
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        if (note !== undefined) body.memo = note;

        // Convert simplified properties → fieldList + extract top-level params
        if (properties && Object.keys(properties).length > 0) {
          const { fieldList, errors, extractedTopLevel } = await resolveProperties(client, objectType, properties);
          if (errors.length > 0) return err(errors.join("\n"));
          Object.assign(body, extractedTopLevel);
          if (fieldList.length > 0) body.fieldList = fieldList;
        }

        // Validate after extractedTopLevel merge
        const createErr = validateCreate(objectType, body);
        if (createErr) return err(createErr);

        return ok(await client.post(`/v2/${objectType}`, body));
      } catch (e: unknown) {
        const msg = (e as Error).message;
        // custom-object 종류를 못 찾으면 → list-objects로 자가교정 유도
        if (objectType === "custom-object" && msg.includes("찾을 수 없")) {
          return err("커스텀 오브젝트 종류를 찾을 수 없습니다. salesmap-list-objects로 정확한 customObjectDefinitionName 또는 customObjectDefinitionId를 확인하세요.");
        }
        return errWithSchemaHint(msg, objectType, summarizeFields({ ...rest, properties }));
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
    `🛡️ Guardrails: 되돌릴 수 없는 영구 삭제. 반드시 사용자가 명시적으로 삭제를 요청한 경우에만 사용. 첫 호출은 confirmed=false로 레코드 정보를 보여주고, 사용자 확인 후 confirmed=true로 재호출.\n🎯 deal/lead 레코드 영구 삭제.`,
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
