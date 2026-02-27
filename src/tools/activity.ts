import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

export function registerActivityTools(server: McpServer) {
  server.tool(
    "salesmap_get_activity",
    "오브젝트 활동 타임라인(액티비티). '이 고객에게 이메일 보낸 적 있나?', '최근 활동이 뭐야?' 파악. type: create(생성), email(이메일), emailOpen(오픈추적), memoCreate(메모), todoCreate(TODO), webFormSubmit(웹폼), meeting(미팅). emailId가 있으면 salesmap_get_email로 상세 조회.",
    {
      entityType: z.enum(["people", "organization", "deal", "lead", "custom-object"])
        .describe("오브젝트 타입"),
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    async ({ entityType, cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get(`/v2/${entityType}/activity`, query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
