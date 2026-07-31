import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../client";
import { getClient } from "../types";
import { FIELD_SCHEMA_TYPES, canonicalFieldSchemaType } from "../api-quirks";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

// System field hints — added to fields where the name alone is ambiguous
const FIELD_HINTS: Record<string, Record<string, string>> = {
  deal: {
    "마감일": "상태가 Won/Lost로 변경 시 자동 업데이트되는 종료 날짜",
    "종료까지 걸린 시간": "생성부터 Won/Lost까지 소요 시간",
    "담당자": "메인 담당자. 생성·수정·검색 입력은 사용자 이름 사용 가능",
    "팔로워": "서브 담당자들. 사용자 이름 사용 가능",
    "팀": "메인 담당자의 소속 팀 (자동). 검색 입력은 팀 이름 사용 가능",
    "파이프라인": "생성·검색 입력은 파이프라인 이름 사용 가능",
    "파이프라인 단계": "생성·검색 입력은 단계 이름 사용 가능. 단계명이 중복되면 파이프라인도 함께 지정",
    "종료된 파이프라인 단계": "Won/Lost 시점의 단계. 검색 입력은 단계 이름 사용 가능",
    "최근 파이프라인 수정 날짜": "파이프라인 자체가 변경된 날짜",
    "최근 파이프라인 단계 수정 날짜": "파이프라인 단계가 변경된 날짜",
    "리드 목록": "연결된 리드 목록",
    "메인 견적 상품 리스트": "읽기 전용. 메인 견적서의 상품 목록",
    "RecordId": "레코드 고유 ID",
  },
  lead: {
    "총 매출": "성사된 딜 금액 합계 (자동)",
    "담당자": "메인 담당자. 생성·수정·검색 입력은 사용자 이름 사용 가능",
    "팔로워": "서브 담당자들. 사용자 이름 사용 가능",
    "팀": "메인 담당자의 소속 팀 (자동). 검색 입력은 팀 이름 사용 가능",
    "파이프라인": "생성·검색 입력은 파이프라인 이름 사용 가능",
    "파이프라인 단계": "생성·검색 입력은 단계 이름 사용 가능. 단계명이 중복되면 파이프라인도 함께 지정",
    "최근 딜의 파이프라인 단계": "연결된 딜 중 최신 딜의 파이프라인 단계 (자동). 검색 입력은 단계 이름 사용 가능",
    "최근 파이프라인 수정 날짜": "파이프라인 자체가 변경된 날짜",
    "최근 파이프라인 단계 수정 날짜": "파이프라인 단계가 변경된 날짜",
    "딜 목록": "연결된 딜 목록",
    "메인 견적 상품 리스트": "읽기 전용. 메인 견적서의 상품 목록",
    "RecordId": "레코드 고유 ID",
  },
  people: {
    "담당자": "메인 담당자. 생성·수정·검색 입력은 사용자 이름 사용 가능",
    "팀": "메인 담당자의 소속 팀 (자동). 검색 입력은 팀 이름 사용 가능",
    "딜 개수": "연결된 전체 딜 수 (자동)",
    "리드 개수": "연결된 전체 리드 수 (자동)",
    "진행중 딜 개수": "In progress 딜 수 (자동)",
    "성사된 딜 개수": "Won 딜 수 (자동)",
    "실패된 딜 개수": "Lost 딜 수 (자동)",
    "총 매출": "성사된 딜 금액 합계 (자동)",
    "RecordId": "레코드 고유 ID",
  },
  organization: {
    "담당자": "메인 담당자. 생성·수정·검색 입력은 사용자 이름 사용 가능",
    "팀": "메인 담당자의 소속 팀 (자동). 검색 입력은 팀 이름 사용 가능",
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

// 기본 오브젝트: objectType(영문, API/도구 호출용) + label(한글, 가독성)
const BUILTIN_OBJECTS = [
  { objectType: "people", label: "고객" },
  { objectType: "organization", label: "회사" },
  { objectType: "lead", label: "리드" },
  { objectType: "deal", label: "딜" },
  { objectType: "product", label: "상품" },
  { objectType: "quote", label: "견적서" },
] as const;

export function registerFieldTools(server: McpServer) {
  server.tool(
    "salesmap-list-objects",
    "🎯 워크스페이스의 오브젝트 목록 조회.",
    {},
    READ,
    async (_params, extra) => {
      try {
        const client = getClient(extra);
        const data = await client.get<{ customObjectDefinitionList?: Array<{ id: string; name: string }> }>(
          "/v2/custom-object-definitions",
        );
        const customObjects = (data.customObjectDefinitionList ?? []).map(d => ({
          objectType: "custom-object" as const,
          label: d.name,
          customObjectDefinitionId: d.id,
        }));
        return ok({ builtin: BUILTIN_OBJECTS, customObjects });
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap-list-properties",
    "🎯 오브젝트의 필드 스키마(이름·타입·옵션) 조회.\n🧭 필드 이름이나 허용 값이 불확실할 때 사용.",
    {
      objectType: z.string()
        .describe(`오브젝트 타입: ${FIELD_SCHEMA_TYPES.join(" | ")}. 견적서 상품은 'quote-product'(에러 메시지의 'QuoteProduct' 표기도 받습니다).`),
    },
    READ,
    async ({ objectType }, extra) => {
      // @quirk quoteproduct-type-name-split — 표기 흔들림을 정식 값으로 모은다
      const type = canonicalFieldSchemaType(objectType);
      if (!(FIELD_SCHEMA_TYPES as readonly string[]).includes(type)) {
        return err(`알 수 없는 오브젝트 타입 '${objectType}'. 사용 가능: ${FIELD_SCHEMA_TYPES.join(", ")}.`
          + `\n커스텀 오브젝트는 'custom-object'로 조회한 뒤 salesmap-list-objects로 정의를 확인하세요.`);
      }
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
