import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

export function registerTodoTools(server: McpServer) {
  server.tool(
    "salesmap_list_todos",
    "TODO 목록 (읽기 전용, 생성 API 없음). 영업 담당자의 할 일. 유형(전화/미팅/업무/이메일), 완료 여부, 시작일/종료일, 연결된 고객/딜/리드. 시퀀스 createTodo step이나 UI에서만 생성됨.",
    { cursor: z.string().optional().describe("페이지네이션 커서") },
    async ({ cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get("/v2/todo", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
