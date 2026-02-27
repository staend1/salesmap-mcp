import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SalesMapClient, ok, err } from "../client.js";

const quoteProductSchema = z.object({
  name: z.string().describe("상품 이름"),
  productId: z.string().optional().describe("상품 ID"),
  price: z.number().optional().describe("단가"),
  amount: z.number().optional().describe("수량"),
  paymentCount: z.number().optional().describe("결제 횟수 (구독 상품만)"),
  paymentStartAt: z.string().optional().describe("시작 결제일 (구독)"),
  fieldList: z.array(z.object({ name: z.string() }).passthrough()).optional(),
});

export function registerQuoteTools(server: McpServer, client: SalesMapClient) {
  server.tool(
    "salesmap_create_quote",
    "견적서 생성. 딜 또는 리드에 연결. quoteProductList로 상품 추가. isMainQuote로 메인 견적서 지정.",
    {
      name: z.string().describe("견적서 이름 (필수)"),
      dealId: z.string().optional().describe("연결할 딜 ID"),
      leadId: z.string().optional().describe("연결할 리드 ID"),
      memo: z.string().optional(),
      isMainQuote: z.boolean().optional().describe("메인 견적서 여부"),
      quoteProductList: z.array(quoteProductSchema).optional().describe("포함할 상품 목록"),
      fieldList: z.array(z.object({ name: z.string() }).passthrough()).optional(),
    },
    async ({ name, ...rest }) => {
      try {
        const body: Record<string, unknown> = { name };
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        return ok(await client.post("/v2/quote", body));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
