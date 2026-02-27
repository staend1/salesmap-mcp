import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

export function registerFieldTools(server: McpServer) {
  server.tool(
    "salesmap_describe_object",
    "오브젝트의 필드 이름·타입·옵션 조회.\n필드명이 한글이며 고객 워크스페이스마다 다르므로, 검색·생성·수정 전에 반드시 이 도구로 스키마를 확인해야 합니다.",
    {
      type: z.enum(["deal", "lead", "people", "organization", "product", "quote", "todo", "custom-object"])
        .describe("오브젝트 타입"),
    },
    READ,
    async ({ type }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get(`/v2/field/${type}`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
