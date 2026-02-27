import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

const objectType = z.enum(["people", "organization", "deal", "lead", "memo", "custom-object"]);

const quoteProductSchema = z.object({
  name: z.string().describe("상품 이름"),
  productId: z.string().optional().describe("상품 ID"),
  price: z.number().optional().describe("단가"),
  amount: z.number().optional().describe("수량"),
  paymentCount: z.number().optional().describe("결제 횟수 (구독)"),
  paymentStartAt: z.string().optional().describe("시작 결제일 (구독)"),
  fieldList: z.array(z.object({ name: z.string() }).passthrough()).optional(),
});

export function registerExtrasTools(server: McpServer) {
  // ── Association ───────────────────────────────────────
  server.tool(
    "salesmap_get_association",
    "오브젝트 간 연관관계 조회. primary=FK 직접 연결(회사↔고객, 딜↔고객 등), custom=커스텀 필드 참조 연결.",
    {
      targetType: objectType.describe("출발 오브젝트 타입"),
      targetId: z.string().describe("출발 오브젝트 ID"),
      toTargetType: objectType.describe("도착 오브젝트 타입"),
      associationType: z.enum(["primary", "custom"]).describe("primary=FK 직접, custom=커스텀 필드"),
      cursor: z.string().optional(),
    },
    async ({ targetType, targetId, toTargetType, associationType, cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get(
          `/v2/object/${targetType}/${targetId}/association/${toTargetType}/${associationType}`,
          query,
        ));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Memo (Note) ────────────────────────────────────────
  server.tool(
    "salesmap_create_memo",
    "레코드에 노트(메모) 추가.",
    {
      type: z.enum(["people", "organization", "deal", "lead", "custom-object"])
        .describe("대상 오브젝트 타입"),
      id: z.string().describe("대상 레코드 UUID"),
      memo: z.string().describe("메모 내용"),
    },
    async ({ type, id, memo }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.post(`/v2/${type}/${id}`, { memo }));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Pipeline ──────────────────────────────────────────
  server.tool(
    "salesmap_list_pipelines",
    "파이프라인 목록. 딜/리드 생성 시 pipelineId 확인용.",
    {
      entityType: z.enum(["deal", "lead"]).describe("딜 또는 리드"),
    },
    async ({ entityType }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get(`/v2/${entityType}/pipeline`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Quote (create) ────────────────────────────────────
  server.tool(
    "salesmap_create_quote",
    "견적서 생성. 딜 또는 리드에 연결.",
    {
      name: z.string().describe("견적서 이름"),
      dealId: z.string().optional().describe("딜 ID"),
      leadId: z.string().optional().describe("리드 ID"),
      memo: z.string().optional(),
      isMainQuote: z.boolean().optional().describe("메인 견적서 여부"),
      quoteProductList: z.array(quoteProductSchema).optional().describe("상품 목록"),
      fieldList: z.array(z.object({ name: z.string() }).passthrough()).optional(),
    },
    async ({ name, ...rest }, extra) => {
      try {
        const client = getClient(extra);
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

  // ── Quote (get) ───────────────────────────────────────
  server.tool(
    "salesmap_get_quotes",
    "딜/리드에 연결된 견적서 조회.",
    {
      type: z.enum(["deal", "lead"]).describe("딜 또는 리드"),
      id: z.string().describe("딜/리드 UUID"),
    },
    async ({ type, id }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get(`/v2/${type}/${id}/quote`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Users / Teams ─────────────────────────────────────
  server.tool(
    "salesmap_list_users",
    "사용자 또는 팀 목록.",
    {
      type: z.enum(["user", "team"]).describe("사용자 또는 팀"),
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

  // ── Current User ──────────────────────────────────────
  server.tool(
    "salesmap_get_current_user",
    "현재 API 토큰 소유자 정보.",
    {},
    async (_params, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get("/v2/user/me"));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
