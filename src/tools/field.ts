import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

export function registerFieldTools(server: McpServer) {
  server.tool(
    "salesmap_describe_object",
    "CRM 스키마 파악. 작업 전 반드시 먼저 실행하여 필드 구조 확인.",
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
