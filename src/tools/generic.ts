import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, errWithSchemaHint, compactRecord, pickProperties, resolveProperties, getDefaultProperties, getDefinitionMap } from "../client";
import { getClient } from "../types";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false } as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_ID_RE = /^[0-9a-f]{24}$/i; // MongoDB ObjectId

// ── v3 마이그레이션 플래그 ────────────────────────────────
// false로 바꾸면 v2 동작으로 즉시 롤백. 안정화 목표: 2026-07-31
const V3_OBJECT_READ = true;

// v2 영문 → v3 한글 objectType 매핑
const V3_TYPE_MAP: Record<string, string> = {
  deal: "딜", lead: "리드", people: "고객", organization: "회사",
  quote: "견적서", product: "상품", "quote-product": "상품변형",
};

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

export function registerGenericTools(server: McpServer) {
  // ── Batch Read ────────────────────────────────────────
  server.tool(
    "salesmap-batch-read-objects",
    "🎯 레코드 일괄 조회(최대 500).\n📦 fieldList로 원하는 필드만, associationList로 연결 레코드를 인라인으로 포함 가능.",
    {
      objectType: z.string()
        .describe("오브젝트 타입. 기본값: 'people' | 'organization' | 'deal' | 'lead'. 커스텀 오브젝트 이름도 가능 (예: '티켓(CRM)')"),
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
          const apiType = V3_TYPE_MAP[objectType] ?? objectType;
          const body: Record<string, unknown> = { objectType: apiType, idList: objectIds };
          if (fieldList?.length) body.fieldList = fieldList;
          if (associationList?.length) body.associationList = associationList;
          try {
            return ok(await client.post("/v3/object/read", body));
          } catch (e: unknown) {
            const msg = (e as Error).message;
            // fieldList 에러: 잘못된 필드명 + list-properties 안내
            if (msg.includes("필드를 찾을 수 없습니다")) {
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

  // ── Create ────────────────────────────────────────────
  server.tool(
    "salesmap-create-object",
    "🎯 레코드 생성.\n📋 list-properties로 필드 확인. lead, deal은 salesmap-get-pipelines로 파이프라인·단계 ID 확인.",
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
