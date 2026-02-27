import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

const fieldListItem = z.object({
  name: z.string(),
  stringValue: z.string().optional(),
  numberValue: z.number().optional(),
}).passthrough();

export function registerProductTools(server: McpServer) {
  server.tool(
    "salesmap_list_products",
    "상품 목록. 판매하는 제품/서비스. 금액, 코드, 브랜드, 유형(일반/구독 월간/구독 연간), 상태(active/inactive).",
    { cursor: z.string().optional().describe("페이지네이션 커서") },
    async ({ cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get("/v2/product", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_create_product",
    "신규 상품 생성.",
    {
      name: z.string().describe("상품 이름 (필수)"),
      fieldList: z.array(fieldListItem).optional().describe("커스텀 필드"),
    },
    async ({ name, fieldList }, extra) => {
      try {
        const client = getClient(extra);
        const body: Record<string, unknown> = { name };
        if (fieldList) body.fieldList = fieldList;
        return ok(await client.post("/v2/product", body));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
