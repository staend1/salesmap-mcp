import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

const fieldListItem = z.object({
  name: z.string().describe("필드 한글 이름 (세일즈맵 UI와 정확히 일치)"),
  stringValue: z.string().optional(),
  numberValue: z.number().optional(),
  booleanValue: z.boolean().optional(),
  dateValue: z.string().optional(),
  stringValueList: z.array(z.string()).optional(),
  userValueId: z.string().optional(),
  organizationValueId: z.string().optional(),
  peopleValueId: z.string().optional(),
}).passthrough();

export function registerPeopleTools(server: McpServer) {
  server.tool(
    "salesmap_list_people",
    "고객(People) 목록 조회. B2B 영업 대상 담당자 목록. 한글 필드명으로 이메일, 전화, 담당자, 딜 개수, 시퀀스 등록 여부 등 포함.",
    { cursor: z.string().optional().describe("페이지네이션 커서. 다음 페이지 조회 시 이전 응답의 nextCursor 값 전달") },
    async ({ cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        const data = await client.get("/v2/people", query);
        return ok(data);
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_person",
    "고객 단일 상세 조회. 이메일, 전화, 소속 회사, 담당자, 딜/리드 개수, 시퀀스 상태, 최근 메모, 웹폼 제출 이력 등 전체 필드 반환.",
    { peopleId: z.string().describe("고객 UUID") },
    async ({ peopleId }, extra) => {
      try {
        const client = getClient(extra);
        const data = await client.getOne(`/v2/people/${peopleId}`, "people");
        return ok(data);
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_create_person",
    "신규 고객 생성. 이메일 중복 시 isDuplicate로 알림. memo 파라미터로 초기 메모도 동시 생성 가능. 커스텀 필드는 fieldList로 전달 — 필드명은 salesmap_get_fields로 먼저 확인 권장.",
    {
      name: z.string().describe("고객 이름 (필수)"),
      organizationId: z.string().optional().describe("소속 회사 ID"),
      memo: z.string().optional().describe("초기 메모 텍스트"),
      fieldList: z.array(fieldListItem).optional().describe("커스텀 필드 배열"),
    },
    async ({ name, organizationId, memo, fieldList }, extra) => {
      try {
        const client = getClient(extra);
        const body: Record<string, unknown> = { name };
        if (organizationId) body.organizationId = organizationId;
        if (memo) body.memo = memo;
        if (fieldList) body.fieldList = fieldList;
        const data = await client.post("/v2/people", body);
        return ok(data);
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_update_person",
    "고객 정보 수정. memo 파라미터에 텍스트를 넣으면 해당 고객에 새 메모가 생성됨 (메모 생성 유일한 방법). fieldList로 커스텀 필드 수정 가능. 주의: 시스템 자동 필드(딜 개수, 총 매출, TODO 집계, 시퀀스 집계 등)와 수식(formula) 필드는 읽기전용 — fieldList에 넣으면 에러.",
    {
      peopleId: z.string().describe("고객 UUID"),
      name: z.string().optional().describe("이름 변경"),
      email: z.string().optional().describe("이메일 변경"),
      phone: z.string().optional().describe("전화번호 변경"),
      ownerId: z.string().optional().describe("담당자(User) ID 변경"),
      organizationId: z.string().optional().describe("소속 회사 ID 변경"),
      memo: z.string().optional().describe("새 메모 생성 (기존 메모에 추가됨)"),
      fieldList: z.array(fieldListItem).optional().describe("커스텀 필드 수정"),
    },
    async ({ peopleId, ...body }, extra) => {
      try {
        const client = getClient(extra);
        const cleanBody = Object.fromEntries(
          Object.entries(body).filter(([, v]) => v !== undefined),
        );
        const data = await client.post(`/v2/people/${peopleId}`, cleanBody);
        return ok(data);
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_find_people_by_email",
    "이메일 주소로 고객 검색. people-temp API 사용. 전체 필드(이름, 전화, 회사, 딜, 시퀀스 등) 반환. 동일 이메일 고객이 여러 명일 수 있음(배열). Search Record API는 id+name만 반환하지만 이 도구는 전체 정보 반환.",
    { email: z.string().describe("검색할 이메일 주소 (완전 일치)") },
    async ({ email }, extra) => {
      try {
        const client = getClient(extra);
        const data = await client.get(`/v2/people-temp/${encodeURIComponent(email)}`);
        return ok(data);
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
