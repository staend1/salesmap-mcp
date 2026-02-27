import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SalesMapClient, ok, err } from "../client.js";

const objectType = z.enum(["people", "organization", "deal", "lead", "memo", "custom-object"]);

export function registerAssociationTools(server: McpServer, client: SalesMapClient) {
  server.tool(
    "salesmap_get_association_primary",
    "오브젝트 간 Primary(FK 직접) 연관관계 조회. associationIdList(ID 목록만) 반환. '이 고객이 어떤 회사에 속해있지?' 확인.",
    {
      targetType: objectType.describe("출발 오브젝트 타입"),
      targetId: z.string().describe("출발 오브젝트 ID"),
      toTargetType: objectType.describe("도착 오브젝트 타입"),
      cursor: z.string().optional(),
    },
    async ({ targetType, targetId, toTargetType, cursor }) => {
      try {
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get(
          `/v2/object/${targetType}/${targetId}/association/${toTargetType}/primary`, query,
        ));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap_get_association_custom",
    "오브젝트 간 Custom(커스텀 필드) 연관관계 조회. associationItemList({id, label}) 반환. label은 커스텀 필드 이름. Primary로 안 나오면 Custom으로도 시도.",
    {
      targetType: objectType.describe("출발 오브젝트 타입"),
      targetId: z.string().describe("출발 오브젝트 ID"),
      toTargetType: objectType.describe("도착 오브젝트 타입"),
      cursor: z.string().optional(),
    },
    async ({ targetType, targetId, toTargetType, cursor }) => {
      try {
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get(
          `/v2/object/${targetType}/${targetId}/association/${toTargetType}/custom`, query,
        ));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
