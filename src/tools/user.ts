import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

export function registerUserTools(server: McpServer) {
  server.tool(
    "salesmap_list_users",
    "CRM 사용자(영업 담당자) 목록. id, name, status, email, role. 고객/딜의 '담당자'로 할당되는 주체.",
    { cursor: z.string().optional().describe("페이지네이션 커서") },
    async ({ cursor }, extra) => {
      try {
        const client = getClient(extra);
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
    async (_params, extra) => {
      try {
        const client = getClient(extra);
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
    async ({ cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get("/v2/team", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
