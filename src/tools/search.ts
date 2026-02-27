import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

const filterSchema = z.object({
  fieldName: z.string().describe("필드 한글 이름"),
  operator: z.enum([
    "EQ", "NEQ", "EXISTS", "NOT_EXISTS",
    "CONTAINS", "NOT_CONTAINS",
    "LT", "LTE", "GT", "GTE",
    "IN", "NOT_IN", "LIST_CONTAIN", "LIST_NOT_CONTAIN",
    "DATE_ON_OR_AFTER", "DATE_ON_OR_BEFORE", "DATE_IS_SPECIFIC_DAY", "DATE_BETWEEN",
    "DATE_MORE_THAN_DAYS_AGO", "DATE_LESS_THAN_DAYS_AGO",
    "DATE_LESS_THAN_DAYS_LATER", "DATE_MORE_THAN_DAYS_LATER",
    "DATE_AGO", "DATE_LATER",
  ]),
  value: z.union([z.string(), z.number(), z.array(z.string())]).optional()
    .describe("검색 값. EXISTS/NOT_EXISTS는 생략. DATE_BETWEEN은 ['시작','끝'] 배열. 빈 문자열 불가"),
});

const filterGroupSchema = z.object({
  filters: z.array(filterSchema).min(1).max(3).describe("필터 간 AND. 최대 3개"),
});

export function registerSearchTools(server: McpServer) {
  server.tool(
    "salesmap_search_records",
    "조건 기반 검색. salesmap_get_fields로 필드명 확인 후 사용. 그룹 간 OR(최대 3), 필터 간 AND(최대 3). 응답은 id+name만.",
    {
      targetType: z.enum(["people", "organization", "deal", "lead"]).describe("검색 대상 오브젝트"),
      filterGroupList: z.array(filterGroupSchema).min(1).max(3).describe("필터 그룹 (그룹 간 OR)"),
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    async ({ targetType, filterGroupList, cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;

        const data = await client.post(`/v2/object/${targetType}/search`, { filterGroupList }, query);
        return ok(data);
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
