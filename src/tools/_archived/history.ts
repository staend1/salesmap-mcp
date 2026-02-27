import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

export function registerHistoryTools(server: McpServer) {
  server.tool(
    "salesmap_get_history",
    "필드 변경 이력.",
    {
      entityType: z.enum(["people", "organization", "deal", "lead", "custom-object"])
        .describe("오브젝트 타입"),
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    async ({ entityType, cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get(`/v2/${entityType}/history`, query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
