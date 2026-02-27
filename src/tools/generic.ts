import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, errWithSchemaHint, compactRecord, compactRecords } from "../client";
import { getClient } from "../types";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;

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
    "레코드 상세 조회. 모든 필드 포함 (값 없으면 null).",
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
    "여러 레코드 일괄 조회 (최대 20개). 모든 필드 포함 (값 없으면 null).",
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

  // ── List ──────────────────────────────────────────────
  server.tool(
    "salesmap_list_records",
    "레코드 목록 조회 (커서 페이지네이션). null 필드와 파이프라인 자동생성 필드는 응답에서 제거됨.",
    {
      type: z.enum(["people", "organization", "deal", "lead", "custom-object", "product", "todo", "memo"])
        .describe("오브젝트 타입"),
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    READ,
    async ({ type, cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(compactRecords(await client.get(`/v2/${type}`, query)));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Create ────────────────────────────────────────────
  server.tool(
    "salesmap_create_record",
    "레코드 생성.\n선행 필수: salesmap_describe_object로 필드명·타입 확인. deal/lead는 salesmap_get_pipeline_ids로 pipelineId도 필요.",
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
    "레코드 수정.\n선행 필수: salesmap_describe_object로 필드명·타입 확인. 담당자 변경은 salesmap_list_users로 userValueId 확인.",
    {
      type: z.enum(["people", "organization", "deal", "lead", "custom-object"])
        .describe("오브젝트 타입"),
      id: z.string().describe("레코드 UUID"),
      name: z.string().optional(),
      fieldList: z.array(fieldListItem).optional().describe("커스텀 필드. 담당자 변경은 userValueId 사용 (salesmap_list_users로 ID 확인)"),
      peopleId: z.string().optional(),
      organizationId: z.string().optional(),
      pipelineId: z.string().optional(),
      pipelineStageId: z.string().optional(),
      status: z.enum(["Won", "Lost", "In progress"]).optional(),
      price: z.number().optional().describe("금액 (deal)"),
    },
    WRITE,
    async ({ type, id, ...rest }, extra) => {
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
