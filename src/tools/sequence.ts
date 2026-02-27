import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SalesMapClient, ok, err } from "../client.js";

export function registerSequenceTools(server: McpServer, client: SalesMapClient) {
  server.tool(
    "salesmap_list_sequences",
    "시퀀스 목록. 자동화된 이메일 캠페인. 콜드메일, 팔로우업, 리텐션 등. 주의: ID 필드가 _id (id 아님).",
    {},
    async () => {
      try {
        return ok(await client.get("/v2/sequence"));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_sequence",
    "시퀀스 단일 조회. 이름, 설명, 생성일.",
    { sequenceId: z.string().describe("시퀀스 ID (_id 값)") },
    async ({ sequenceId }) => {
      try {
        return ok(await client.get(`/v2/sequence/${sequenceId}`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_sequence_steps",
    "시퀀스 단계(Step) 조회. 각 단계의 type(sendEmail/createTodo), 대기 영업일(businessDay), 실행 시각(executionTime). 예: index:0 sendEmail 3영업일 후 → index:1 sendEmail 6영업일 후 → index:2 createTodo 1영업일 후 = '3일 후 첫 메일, 6일 후 후속 메일, 다음 날 전화 리마인더'.",
    { sequenceId: z.string().describe("시퀀스 ID") },
    async ({ sequenceId }) => {
      try {
        return ok(await client.get(`/v2/sequence/${sequenceId}/step`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_sequence_enrollments",
    "시퀀스에 등록된 고객 목록. _id(enrollment ID), peopleId, createdAt 반환. 주의: status/currentStepOrder 필드는 없음.",
    {
      sequenceId: z.string().describe("시퀀스 ID"),
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    async ({ sequenceId, cursor }) => {
      try {
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
    "시퀀스 등록 고객의 이벤트 타임라인. 이메일 발송/오픈/클릭/회신 추적. eventType: sendEmail(발송), emailOpen(관심 시그널), emailLinkClick(강한 관심-CTA 효과적), emailReply(가장 강한 시그널-즉시 개인화 follow-up 필요). stepIndex로 어느 단계 이메일인지 확인. emailLinkClick은 linkUrl/linkName 포함.",
    {
      enrollmentId: z.string().describe("등록 ID (_id 값)"),
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    async ({ enrollmentId, cursor }) => {
      try {
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get(`/v2/sequence/enrollment/${enrollmentId}/timeline`, query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
