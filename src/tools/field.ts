import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

export function registerFieldTools(server: McpServer) {
  server.tool(
    "salesmap_get_fields",
    "오브젝트 타입별 필드 정의 조회. 필드 이름, 타입, 필수 여부, 선택형 옵션 목록 반환. 생성/수정 API의 fieldList에 넣을 필드명과 유효한 옵션값을 확인할 때 필수. type에 custom-object는 하이픈 필수.",
    {
      type: z.enum(["deal", "lead", "people", "organization", "product", "quote", "todo", "custom-object"])
        .describe("오브젝트 타입"),
    },
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
