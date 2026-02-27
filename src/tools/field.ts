import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

export function registerFieldTools(server: McpServer) {
  server.tool(
    "salesmap_get_fields",
    "CRM 스키마 파악.",
    {
      type: z.enum(["deal", "lead", "people", "organization", "product", "quote", "todo", "custom-object"])
        .describe("오브젝트 타입"),
    },
    async ({ type }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get(`/v2/field/${type}`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
