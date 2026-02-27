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

export function registerOrganizationTools(server: McpServer) {
  server.tool(
    "salesmap_list_organizations",
    "회사(Organization) 목록 조회. B2B 거래 대상 기업. 딜 개수, 총 매출, 최근 노트, 최근 웹폼 등 집계 필드 포함.",
    { cursor: z.string().optional().describe("페이지네이션 커서") },
    async ({ cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get("/v2/organization", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_organization",
    "회사 단일 상세 조회. 딜 개수/총 매출/진행중 딜/최근 노트 등 전체 필드.",
    { organizationId: z.string().describe("회사 UUID") },
    async ({ organizationId }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.getOne(`/v2/organization/${organizationId}`, "organization"));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_create_organization",
    "신규 회사 생성. 이름 중복 시 에러 + 기존 회사 ID 반환 (재활용 가능). memo로 초기 메모 생성.",
    {
      name: z.string().describe("회사 이름 (필수)"),
      memo: z.string().optional().describe("초기 메모"),
      fieldList: z.array(fieldListItem).optional().describe("커스텀 필드"),
    },
    async ({ name, memo, fieldList }, extra) => {
      try {
        const client = getClient(extra);
        const body: Record<string, unknown> = { name };
        if (memo) body.memo = memo;
        if (fieldList) body.fieldList = fieldList;
        return ok(await client.post("/v2/organization", body));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_update_organization",
    "회사 정보 수정. memo 파라미터로 새 메모 생성 가능. 주의: 시스템 자동 필드(딜 개수, 총 매출, TODO 집계, 연결된 고객 수 등)와 수식(formula) 필드는 읽기전용 — fieldList에 넣으면 에러.",
    {
      organizationId: z.string().describe("회사 UUID"),
      name: z.string().optional().describe("회사명 변경"),
      phone: z.string().optional().describe("전화번호 변경 (유효한 전화번호 포맷 필요)"),
      industry: z.string().optional().describe("업종/종목 변경"),
      parentOrganizationId: z.string().optional().describe("모회사 ID 변경"),
      memo: z.string().optional().describe("새 메모 생성"),
      fieldList: z.array(fieldListItem).optional().describe("커스텀 필드 수정"),
    },
    async ({ organizationId, ...body }, extra) => {
      try {
        const client = getClient(extra);
        const cleanBody = Object.fromEntries(
          Object.entries(body).filter(([, v]) => v !== undefined),
        );
        return ok(await client.post(`/v2/organization/${organizationId}`, cleanBody));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
