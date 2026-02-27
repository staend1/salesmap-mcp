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

export function registerLeadTools(server: McpServer) {
  server.tool(
    "salesmap_list_leads",
    "리드(Lead) 목록 조회. 아직 검증되지 않은 잠재 영업 기회. 딜보다 앞 단계. 파이프라인은 선택사항.",
    { cursor: z.string().optional().describe("페이지네이션 커서") },
    async ({ cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get("/v2/lead", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_lead",
    "리드 단일 상세 조회.",
    { leadId: z.string().describe("리드 UUID") },
    async ({ leadId }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.getOne(`/v2/lead/${leadId}`, "lead"));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_create_lead",
    "신규 리드 생성. 딜과 달리 pipelineId/status 선택사항. peopleId 또는 organizationId 중 하나 이상 필수.",
    {
      name: z.string().describe("리드 이름 (필수)"),
      peopleId: z.string().optional().describe("고객 ID"),
      organizationId: z.string().optional().describe("회사 ID"),
      pipelineId: z.string().optional(),
      pipelineStageId: z.string().optional(),
      memo: z.string().optional(),
      fieldList: z.array(fieldListItem).optional(),
    },
    async ({ name, ...rest }, extra) => {
      try {
        const client = getClient(extra);
        const body: Record<string, unknown> = { name };
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        return ok(await client.post("/v2/lead", body));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_update_lead",
    "리드 정보 수정. memo로 메모 생성 가능. 주의: 시스템 자동 필드(TODO 집계, 시퀀스 집계, 파이프라인 단계별 진입/퇴장/누적시간 등)와 수식(formula) 필드는 읽기전용 — fieldList에 넣으면 에러.",
    {
      leadId: z.string().describe("리드 UUID"),
      name: z.string().optional(),
      peopleId: z.string().optional(),
      organizationId: z.string().optional(),
      pipelineId: z.string().optional(),
      pipelineStageId: z.string().optional(),
      memo: z.string().optional().describe("새 메모 생성"),
      fieldList: z.array(fieldListItem).optional(),
    },
    async ({ leadId, ...body }, extra) => {
      try {
        const client = getClient(extra);
        const cleanBody = Object.fromEntries(
          Object.entries(body).filter(([, v]) => v !== undefined),
        );
        return ok(await client.post(`/v2/lead/${leadId}`, cleanBody));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_lead_quotes",
    "리드에 연결된 견적서 목록. 딜 견적서와 동일 스키마.",
    { leadId: z.string().describe("리드 UUID") },
    async ({ leadId }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get(`/v2/lead/${leadId}/quote`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
