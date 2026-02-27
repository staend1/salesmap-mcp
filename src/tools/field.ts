import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

export function registerFieldTools(server: McpServer) {
  server.tool(
    "salesmap_get_fields",
    "CRM 탐색의 시작점. 오브젝트별 필드 이름·타입·옵션 반환. 이 도구로 구조 파악 → salesmap_search_records로 조건 검색 → 개별 CRUD 순서를 권장.",
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
