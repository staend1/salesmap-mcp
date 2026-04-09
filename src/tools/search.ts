import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, errWithSchemaHint, compactRecords, fetchUserMap } from "../client";
import { getClient } from "../types";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

// ── Relation field pre-validation ──────────────────────
const USER_FIELDS = new Set(["담당자", "팔로워", "최근 노트 작성자"]);

const ID_FIELDS: Record<string, string> = {
  "파이프라인": "salesmap-get-pipelines",
  "파이프라인 단계": "salesmap-get-pipelines",
  "종료된 파이프라인 단계": "salesmap-get-pipelines",
  "최근 딜의 파이프라인 단계": "salesmap-get-pipelines",
  "담당자": "salesmap-list-users",
  "팔로워": "salesmap-list-users",
  "최근 노트 작성자": "salesmap-list-users",
  "팀": "salesmap-list-teams",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_ID_RE = /^[0-9a-f]{24}$/i; // MongoDB ObjectId

function isValidId(v: string): boolean { return UUID_RE.test(v) || HEX_ID_RE.test(v); }

type FilterGroup = { filters: Array<{ propertyName: string; operator: string; value?: string | number | string[] }> };

import type { SalesMapClient } from "../client";

/**
 * Validate relation fields and auto-resolve user names to UUIDs.
 * Returns { error } if non-user relation field has invalid ID,
 * or { resolved } with user names converted to UUIDs.
 */
async function resolveFilterIds(
  groups: FilterGroup[],
  client: SalesMapClient,
): Promise<{ error?: string; resolved: FilterGroup[] }> {
  // Check if any user fields have non-UUID values (need name resolution)
  let userMap: Map<string, string> | null = null;
  const needsLookup = groups.some(g =>
    g.filters.some(f => {
      if (!USER_FIELDS.has(f.propertyName)) return false;
      if (f.operator === "EXISTS" || f.operator === "NOT_EXISTS") return false;
      const vals = Array.isArray(f.value) ? f.value : typeof f.value === "string" ? [f.value] : [];
      return vals.some(v => !isValidId(v));
    }),
  );
  if (needsLookup) {
    userMap = await fetchUserMap(client);
  }

  const resolved: FilterGroup[] = [];
  for (const group of groups) {
    const filters: FilterGroup["filters"] = [];
    for (const f of group.filters) {
      const tool = ID_FIELDS[f.propertyName];
      if (!tool || f.operator === "EXISTS" || f.operator === "NOT_EXISTS") {
        filters.push(f);
        continue;
      }

      const vals = Array.isArray(f.value) ? f.value : typeof f.value === "string" ? [f.value] : [];
      const bad = vals.filter(v => !isValidId(v));

      if (bad.length === 0) {
        filters.push(f);
        continue;
      }

      // User fields: auto-resolve names to UUIDs
      if (USER_FIELDS.has(f.propertyName) && userMap) {
        const resolvedVals: string[] = [];
        for (const v of vals) {
          if (isValidId(v)) {
            resolvedVals.push(v);
          } else {
            const uid = userMap.get(v);
            if (!uid) {
              return { error: `"${f.propertyName}" — "${v}" 사용자를 찾을 수 없습니다. salesmap-list-users로 확인하세요.`, resolved: [] };
            }
            resolvedVals.push(uid);
          }
        }
        const resolvedValue = Array.isArray(f.value) ? resolvedVals : resolvedVals[0];
        filters.push({ ...f, value: resolvedValue });
        continue;
      }

      // Non-user relation fields: must be UUIDs
      return { error: `"${f.propertyName}" 필드는 이름이 아닌 ID(UUID)로 검색해야 합니다. ${tool}로 ID를 먼저 조회하세요. (입력값: "${bad[0]}")`, resolved: [] };
    }
    resolved.push({ filters });
  }

  return { resolved };
}

// ── schema ─────────────────────────────────────────────
const filterSchema = z.object({
  propertyName: z.string().describe("필드 한글 이름 (salesmap-list-properties 참조)"),
  operator: z.enum([
    "EQ", "NEQ", "EXISTS", "NOT_EXISTS",
    "CONTAINS", "NOT_CONTAINS",
    "LT", "LTE", "GT", "GTE",
    "IN", "NOT_IN", "LIST_CONTAIN", "LIST_NOT_CONTAIN",
    "DATE_ON_OR_AFTER", "DATE_ON_OR_BEFORE", "DATE_IS_SPECIFIC_DAY", "DATE_BETWEEN",
    "DATE_MORE_THAN_DAYS_AGO", "DATE_LESS_THAN_DAYS_AGO",
    "DATE_LESS_THAN_DAYS_LATER", "DATE_MORE_THAN_DAYS_LATER",
    "DATE_AGO", "DATE_LATER",
  ]),
  value: z.union([z.string(), z.number(), z.array(z.string())]).optional()
    .describe("검색 값. EXISTS/NOT_EXISTS는 생략. DATE_BETWEEN은 ['시작','끝'] 배열. relation 필드(파이프라인, 담당자 등)는 UUID만 허용. 빈 문자열 불가"),
});

const filterGroupSchema = z.object({
  filters: z.array(filterSchema).min(1).max(3).describe("필터 간 AND. 최대 3개"),
});

export function registerSearchTools(server: McpServer) {
  server.tool(
    "salesmap-search-objects",
    "필터 조건으로 레코드 검색 (그룹 간 OR, 그룹 내 AND). null 필드는 응답에서 생략됨.",
    {
      targetType: z.enum(["people", "organization", "deal", "lead"]).describe("검색 대상 오브젝트"),
      filterGroupList: z.array(filterGroupSchema).min(1).max(3).describe("필터 그룹 (그룹 간 OR)"),
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    READ,
    async ({ targetType, filterGroupList, cursor }, extra) => {
      try {
        const client = getClient(extra);

        // Pre-validate + auto-resolve user names to UUIDs
        const { error: idErr, resolved } = await resolveFilterIds(filterGroupList as FilterGroup[], client);
        if (idErr) return err(idErr);

        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;

        // Convert propertyName → fieldName for SalesMap API
        const apiFilterGroups = resolved.map(g => ({
          filters: g.filters.map(f => ({
            fieldName: f.propertyName,
            operator: f.operator,
            ...(f.value !== undefined ? { value: f.value } : {}),
          })),
        }));

        const data = await client.post(`/v2/object/${targetType}/search`, { filterGroupList: apiFilterGroups }, query);
        return ok(compactRecords(data));
      } catch (e: unknown) {
        const filters = (filterGroupList as FilterGroup[]).flatMap(g =>
          g.filters.map(f => `${f.propertyName} ${f.operator} ${JSON.stringify(f.value)}`),
        );
        return errWithSchemaHint((e as Error).message, targetType, filters.join(", "));
      }
    },
  );
}
