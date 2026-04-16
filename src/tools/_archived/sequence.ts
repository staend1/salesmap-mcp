import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

export function registerSequenceTools(server: McpServer) {
  server.tool(
    "salesmap_list_sequences",
    "시퀀스 목록. ID 필드가 _id.",
    {},
    async (_params, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get("/v2/sequence"));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_sequence",
    "시퀀스 상세 조회.",
    { sequenceId: z.string().describe("시퀀스 ID (_id 값)") },
    async ({ sequenceId }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get(`/v2/sequence/${sequenceId}`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_sequence_steps",
    "시퀀스 단계 조회. type·대기 영업일·실행 시각.",
    { sequenceId: z.string().describe("시퀀스 ID") },
    async ({ sequenceId }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get(`/v2/sequence/${sequenceId}/step`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_sequence_enrollments",
    "시퀀스 등록 고객 목록.",
    {
      sequenceId: z.string().describe("시퀀스 ID"),
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    async ({ sequenceId, cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get(`/v2/sequence/${sequenceId}/enrollment`, query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_enrollment_timeline",
    "시퀀스 이벤트 타임라인. 발송/오픈/클릭/회신 추적.",
    {
      enrollmentId: z.string().describe("등록 ID (_id 값)"),
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    async ({ enrollmentId, cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get(`/v2/sequence/enrollment/${enrollmentId}/timeline`, query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
