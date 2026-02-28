import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

// ── 시스템 필드 description (이름만으로 의미 파악이 어려운 것만) ──
const FIELD_HINTS: Record<string, Record<string, string>> = {
  deal: {
    "마감일": "상태가 Won/Lost로 변경 시 자동 업데이트되는 종료 날짜",
    "종료까지 걸린 시간": "생성부터 Won/Lost까지 소요 시간",
    "담당자": "메인 담당자. 검색 시 userValueId 사용 (salesmap_list_users)",
    "팔로워": "서브 담당자들. 검색 시 userValueId 사용",
    "팀": "메인 담당자의 소속 팀 (자동). 검색 시 teamId 사용 (salesmap_list_teams)",
    "파이프라인": "검색/생성 시 pipelineId 사용 (salesmap_get_pipeline_ids)",
    "파이프라인 단계": "검색/생성 시 pipelineStageId 사용 (salesmap_get_pipeline_ids)",
    "종료된 파이프라인 단계": "Won/Lost 시점의 단계. 검색 시 pipelineStageId 사용",
    "최근 파이프라인 수정 날짜": "파이프라인 자체가 변경된 날짜",
    "최근 파이프라인 단계 수정 날짜": "파이프라인 단계가 변경된 날짜",
    "리드 목록": "연결된 리드 목록",
    "메인 견적 상품 리스트": "읽기 전용. 메인 견적서의 상품 목록",
    "RecordId": "레코드 고유 ID",
  },
  lead: {
    "총 매출": "성사된 딜 금액 합계 (자동)",
    "담당자": "메인 담당자. 검색 시 userValueId 사용 (salesmap_list_users)",
    "팔로워": "서브 담당자들. 검색 시 userValueId 사용",
    "팀": "메인 담당자의 소속 팀 (자동). 검색 시 teamId 사용 (salesmap_list_teams)",
    "파이프라인": "검색 시 pipelineId 사용 (salesmap_get_pipeline_ids)",
    "파이프라인 단계": "검색 시 pipelineStageId 사용 (salesmap_get_pipeline_ids)",
    "최근 딜의 파이프라인 단계": "연결된 딜 중 최신 딜의 파이프라인 단계 (자동). 검색 시 pipelineStageId 사용",
    "최근 파이프라인 수정 날짜": "파이프라인 자체가 변경된 날짜",
    "최근 파이프라인 단계 수정 날짜": "파이프라인 단계가 변경된 날짜",
    "딜 목록": "연결된 딜 목록",
    "메인 견적 상품 리스트": "읽기 전용. 메인 견적서의 상품 목록",
    "RecordId": "레코드 고유 ID",
  },
  people: {
    "담당자": "메인 담당자. 검색 시 userValueId 사용 (salesmap_list_users)",
    "팀": "메인 담당자의 소속 팀 (자동). 검색 시 teamId 사용 (salesmap_list_teams)",
    "딜 개수": "연결된 전체 딜 수 (자동)",
    "리드 개수": "연결된 전체 리드 수 (자동)",
    "진행중 딜 개수": "In progress 딜 수 (자동)",
    "성사된 딜 개수": "Won 딜 수 (자동)",
    "실패된 딜 개수": "Lost 딜 수 (자동)",
    "총 매출": "성사된 딜 금액 합계 (자동)",
    "RecordId": "레코드 고유 ID",
  },
  organization: {
    "담당자": "메인 담당자. 검색 시 userValueId 사용 (salesmap_list_users)",
    "팀": "메인 담당자의 소속 팀 (자동). 검색 시 teamId 사용 (salesmap_list_teams)",
    "연결된 고객 수": "연결된 people 수 (자동)",
    "딜 개수": "연결된 전체 딜 수 (자동)",
    "리드 개수": "연결된 전체 리드 수 (자동)",
    "진행중 딜 개수": "In progress 딜 수 (자동)",
    "성사된 딜 개수": "Won 딜 수 (자동)",
    "실패된 딜 개수": "Lost 딜 수 (자동)",
    "종료된 딜 수": "Won + Lost 딜 수 (자동)",
    "총 매출": "성사된 딜 금액 합계 (자동)",
    "최근 딜 성사 날짜": "가장 최근 Won된 딜의 날짜 (자동)",
    "최근 성사된 딜 금액": "가장 최근 Won된 딜의 금액 (자동)",
    "RecordId": "레코드 고유 ID",
  },
};

interface FieldItem {
  name: string;
  [key: string]: unknown;
}

function injectHints(type: string, data: unknown): unknown {
  const hints = FIELD_HINTS[type];
  if (!hints) return data;

  const obj = data as Record<string, unknown>;
  const fieldList = obj.fieldList as FieldItem[] | undefined;
  if (!Array.isArray(fieldList)) return data;

  for (const field of fieldList) {
    const desc = hints[field.name];
    if (desc) field.description = desc;
  }
  return data;
}

export function registerFieldTools(server: McpServer) {
  server.tool(
    "salesmap_describe_object",
    "오브젝트의 필드 이름·타입·옵션 조회. 검색·생성·수정 전에 반드시 이 도구로 스키마를 확인해야 합니다.",
    {
      type: z.enum(["deal", "lead", "people", "organization", "product", "quote", "todo", "custom-object"])
        .describe("오브젝트 타입"),
    },
    READ,
    async ({ type }, extra) => {
      try {
        const client = getClient(extra);
        const data = await client.get(`/v2/field/${type}`);
        return ok(injectHints(type, data));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
