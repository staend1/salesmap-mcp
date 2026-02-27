import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

export function registerHistoryTools(server: McpServer) {
  server.tool(
    "salesmap_get_history",
    "오브젝트 필드 변경 이력(히스토리). '이름이 언제 바뀌었지?', '담당자가 누구에서 누구로?' 같은 변경 추적/감사(audit). type: editField(필드변경), editOrganizationConnect(회사연결), editPeopleConnection(고객연결). fieldValue 형태: 텍스트/숫자/불린/{_id,name} 등.",
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
        return ok(await client.get(`/v2/${entityType}/history`, query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
