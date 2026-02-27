import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SalesMapClient, ok, err } from "../client.js";

export function registerPipelineTools(server: McpServer, client: SalesMapClient) {
  server.tool(
    "salesmap_list_pipelines",
    "파이프라인 목록 조회. 딜/리드의 진행 단계를 정의. 각 파이프라인에 pipelineStageList(단계 배열, index 순서). 딜 생성 시 pipelineId + pipelineStageId 필수이므로 이 도구로 먼저 확인.",
    {
      entityType: z.enum(["deal", "lead"]).describe("딜 파이프라인 또는 리드 파이프라인"),
    },
    async ({ entityType }) => {
      try {
        return ok(await client.get(`/v2/${entityType}/pipeline`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
