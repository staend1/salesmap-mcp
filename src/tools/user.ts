import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SalesMapClient, ok, err } from "../client.js";

export function registerUserTools(server: McpServer, client: SalesMapClient) {
  server.tool(
    "salesmap_list_users",
    "CRM 사용자(영업 담당자) 목록. id, name, status, email, role. 고객/딜의 '담당자'로 할당되는 주체.",
    { cursor: z.string().optional().describe("페이지네이션 커서") },
    async ({ cursor }) => {
      try {
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get("/v2/user", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_current_user",
    "현재 API 토큰 소유자 정보. id, name, status, room(워크스페이스). 주의: email/role 없음 (목록 조회와 스키마 다름).",
    {},
    async () => {
      try {
        return ok(await client.get("/v2/user/me"));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_list_teams",
    "팀 목록. 영업팀 그룹. id, name, description, teammateList(멤버 배열).",
    { cursor: z.string().optional().describe("페이지네이션 커서") },
    async ({ cursor }) => {
      try {
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get("/v2/team", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
