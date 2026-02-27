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
}).passthrough();

export function registerCustomObjectTools(server: McpServer) {
  server.tool(
    "salesmap_list_custom_objects",
    "커스텀 오브젝트 목록. 워크스페이스별 맞춤 데이터(계약, 프로젝트 등). 각 레코드에 customObjectDefinitionId로 어떤 타입인지 구분. 필드 정의는 salesmap_get_fields('custom-object')로 조회.",
    { cursor: z.string().optional().describe("페이지네이션 커서") },
    async ({ cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get("/v2/custom-object", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_custom_object",
    "커스텀 오브젝트 단일 조회.",
    { customObjectId: z.string().describe("커스텀 오브젝트 UUID") },
    async ({ customObjectId }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get(`/v2/custom-object/${customObjectId}`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_create_custom_object",
    "커스텀 오브젝트 생성. customObjectDefinitionId 필수 — 기존 레코드에서 확인하거나 목록 조회로 파악.",
    {
      customObjectDefinitionId: z.string().describe("커스텀 오브젝트 Definition ID (타입/스키마 식별자)"),
      fieldList: z.array(fieldListItem).optional().describe("필드 값 배열"),
    },
    async ({ customObjectDefinitionId, fieldList }, extra) => {
      try {
        const client = getClient(extra);
        const body: Record<string, unknown> = { customObjectDefinitionId };
        if (fieldList) body.fieldList = fieldList;
        return ok(await client.post("/v2/custom-object", body));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_update_custom_object",
    "커스텀 오브젝트 수정.",
    {
      customObjectId: z.string().describe("커스텀 오브젝트 UUID"),
      ownerId: z.string().optional().describe("담당자 변경"),
      fieldList: z.array(fieldListItem).optional().describe("필드 수정"),
    },
    async ({ customObjectId, ...body }, extra) => {
      try {
        const client = getClient(extra);
        const cleanBody = Object.fromEntries(
          Object.entries(body).filter(([, v]) => v !== undefined),
        );
        return ok(await client.post(`/v2/custom-object/${customObjectId}`, cleanBody));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
