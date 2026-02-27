import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

export function registerWebformTools(server: McpServer) {
  server.tool(
    "salesmap_list_webforms",
    "웹폼 목록. 외부 리드 수집 폼. 이름, 상태(active/inactive), 조회수(viewCount), 제출수(submitCount).",
    { cursor: z.string().optional().describe("페이지네이션 커서") },
    async ({ cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get("/v2/webForm", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_webform_submits",
    "웹폼 제출 내역. 폼 입력값(contents: [{label, value}]), 자동 생성된 고객/회사/딜/리드 ID 포함. '이 웹폼으로 어떤 문의가 들어왔지?' 확인.",
    {
      webFormId: z.string().describe("웹폼 UUID"),
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    async ({ webFormId, cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get(`/v2/webForm/${webFormId}/submit`, query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
