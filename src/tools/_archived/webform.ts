import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

export function registerWebformTools(server: McpServer) {
  server.tool(
    "salesmap_list_webforms",
    "웹폼 목록.",
    { cursor: z.string().optional().describe("페이지네이션 커서") },
    async ({ cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get("/v2/webForm", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_webform_submits",
    "웹폼 제출 내역.",
    {
      webFormId: z.string().describe("웹폼 UUID"),
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    async ({ webFormId, cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get(`/v2/webForm/${webFormId}/submit`, query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
