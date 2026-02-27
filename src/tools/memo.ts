import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SalesMapClient, ok, err } from "../client.js";

export function registerMemoTools(server: McpServer, client: SalesMapClient) {
  server.tool(
    "salesmap_list_memos",
    "메모 목록. 고객/딜/회사에 남긴 내부 기록. htmlBody(HTML), text(평문), 연결된 오브젝트 ID 포함. 정렬: 오래된 순(createdAt ASC). 메모 생성은 이 도구가 아니라 salesmap_update_person 등의 memo 파라미터 사용.",
    { cursor: z.string().optional().describe("페이지네이션 커서") },
    async ({ cursor }) => {
      try {
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get("/v2/memo", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
