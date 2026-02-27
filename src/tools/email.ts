import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

export function registerEmailTools(server: McpServer) {
  server.tool(
    "salesmap_get_email",
    "이메일 단일 조회. 메타데이터만 반환(본문 없음). subject, from, to, cc, bcc, status, messageId, date. 이메일 ID는 액티비티에서 type:'email' 항목의 emailId로 확보. 목록 조회 API는 없음.",
    { emailId: z.string().describe("이메일 UUID (액티비티에서 확보)") },
    async ({ emailId }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get(`/v2/email/${emailId}`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
