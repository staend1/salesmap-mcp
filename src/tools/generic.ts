import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

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
    "레코드 상세 조회.",
    {
      type: z.enum(["people", "organization", "deal", "lead", "custom-object", "email"])
        .describe("오브젝트 타입"),
      id: z.string().describe("레코드 UUID"),
    },
    async ({ type, id }, extra) => {
      try {
        const client = getClient(extra);
        const path = `/v2/${type}/${id}`;
        if (GET_ONE_TYPES.has(type)) {
          return ok(await client.getOne(path, type));
        }
        return ok(await client.get(path));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── List ──────────────────────────────────────────────
  server.tool(
    "salesmap_list_records",
    "레코드 목록 조회.",
    {
      type: z.enum(["people", "organization", "deal", "lead", "custom-object", "product", "todo", "memo"])
        .describe("오브젝트 타입"),
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    async ({ type, cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get(`/v2/${type}`, query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Create ────────────────────────────────────────────
  server.tool(
    "salesmap_create_record",
    "레코드 생성. salesmap_describe_object로 필드 구조 확인 후 사용.",
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
    async ({ type, ...rest }, extra) => {
      try {
        const client = getClient(extra);
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        return ok(await client.post(`/v2/${type}`, body));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Update ────────────────────────────────────────────
  server.tool(
    "salesmap_update_record",
    "레코드 수정. salesmap_describe_object로 필드명/타입 확인 후 사용.",
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
    async ({ type, id, ...rest }, extra) => {
      try {
        const client = getClient(extra);
        const body = Object.fromEntries(
          Object.entries(rest).filter(([, v]) => v !== undefined),
        );
        return ok(await client.post(`/v2/${type}/${id}`, body));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
