import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SalesMapClient, ok, err } from "../client.js";

const fieldListItem = z.object({
  name: z.string(),
  stringValue: z.string().optional(),
  numberValue: z.number().optional(),
  booleanValue: z.boolean().optional(),
  dateValue: z.string().optional(),
  stringValueList: z.array(z.string()).optional(),
}).passthrough();

export function registerDealTools(server: McpServer, client: SalesMapClient) {
  server.tool(
    "salesmap_list_deals",
    "딜(Deal) 목록 조회. 검증된 영업 기회. 매출 예측의 기반. 파이프라인명/단계명으로 필터 가능. 금액, 상태(Won/Lost/In progress), 파이프라인 단계, 견적 상품 등 포함.",
    {
      cursor: z.string().optional().describe("페이지네이션 커서"),
      pipelineName: z.string().optional().describe("파이프라인명으로 필터"),
      pipelineStageName: z.string().optional().describe("파이프라인 단계명으로 필터"),
    },
    async ({ cursor, pipelineName, pipelineStageName }) => {
      try {
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        if (pipelineName) query.pipelineName = pipelineName;
        if (pipelineStageName) query.pipelineStageName = pipelineStageName;
        return ok(await client.get("/v2/deal", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_deal",
    "딜 단일 상세 조회. 금액, 파이프라인 단계, 관련 고객/회사, 견적 상품, 시퀀스, TODO 등 전체 필드. 파이프라인 단계별 진입/퇴장/누적시간 자동 필드도 포함.",
    { dealId: z.string().describe("딜 UUID") },
    async ({ dealId }) => {
      try {
        return ok(await client.getOne(`/v2/deal/${dealId}`, "deal"));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_create_deal",
    "신규 딜 생성. 금액은 반드시 price 파라미터로 (fieldList에 넣으면 에러). pipelineId/pipelineStageId 필수. status: 'Won'|'Lost'|'In progress'. peopleId 또는 organizationId 중 하나 이상 필수.",
    {
      name: z.string().describe("딜 이름 (필수)"),
      pipelineId: z.string().describe("파이프라인 ID (필수 — salesmap_list_pipelines로 확인)"),
      pipelineStageId: z.string().describe("파이프라인 단계 ID (필수 — 해당 파이프라인의 단계만 가능)"),
      status: z.enum(["Won", "Lost", "In progress"]).describe("딜 상태 (필수)"),
      peopleId: z.string().optional().describe("고객 ID (peopleId 또는 organizationId 중 하나 이상)"),
      organizationId: z.string().optional().describe("회사 ID"),
      price: z.number().optional().describe("금액 (top-level 파라미터, fieldList 아님!)"),
      memo: z.string().optional().describe("초기 메모"),
      fieldList: z.array(fieldListItem).optional().describe("커스텀 필드 (금액 제외)"),
    },
    async ({ name, pipelineId, pipelineStageId, status, peopleId, organizationId, price, memo, fieldList }) => {
      try {
        const body: Record<string, unknown> = { name, pipelineId, pipelineStageId, status };
        if (peopleId) body.peopleId = peopleId;
        if (organizationId) body.organizationId = organizationId;
        if (price !== undefined) body.price = price;
        if (memo) body.memo = memo;
        if (fieldList) body.fieldList = fieldList;
        return ok(await client.post("/v2/deal", body));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_update_deal",
    "딜 정보 수정. 파이프라인 단계 이동, 금액 변경, 상태 변경(Won/Lost), 메모 추가 등. pipelineStageId 변경 시 pipelineId도 필요.",
    {
      dealId: z.string().describe("딜 UUID"),
      name: z.string().optional(),
      status: z.enum(["Won", "Lost", "In progress"]).optional(),
      pipelineId: z.string().optional(),
      pipelineStageId: z.string().optional(),
      peopleId: z.string().optional(),
      organizationId: z.string().optional(),
      price: z.number().optional().describe("금액 (top-level)"),
      memo: z.string().optional().describe("새 메모 생성"),
      fieldList: z.array(fieldListItem).optional(),
    },
    async ({ dealId, ...body }) => {
      try {
        const cleanBody = Object.fromEntries(
          Object.entries(body).filter(([, v]) => v !== undefined),
        );
        return ok(await client.post(`/v2/deal/${dealId}`, cleanBody));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_deal_quotes",
    "딜에 연결된 견적서 목록. 메인 견적서 여부, 금액, 할인, 견적 구성 상품(단가/수량/부가세/할인) 포함. '이 딜에 견적서 보냈나? 총액이 얼마지?' 확인.",
    { dealId: z.string().describe("딜 UUID") },
    async ({ dealId }) => {
      try {
        return ok(await client.get(`/v2/deal/${dealId}/quote`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
