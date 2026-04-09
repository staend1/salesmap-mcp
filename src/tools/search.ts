import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, errWithSchemaHint, compactRecords, fetchUserMap } from "../client";
import { getClient } from "../types";
import type { SalesMapClient } from "../client";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

// ── Relation field resolution (schema-based) ──────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_ID_RE = /^[0-9a-f]{24}$/i; // MongoDB ObjectId

function isValidId(v: string): boolean { return UUID_RE.test(v) || HEX_ID_RE.test(v); }

type FilterGroup = { filters: Array<{ propertyName: string; operator: string; value?: string | number | string[] }> };

interface SchemaField { name: string; type: string; }

// User types: accept name strings, auto-resolve to UUIDs
const USER_TYPES = new Set(["user", "multiUser"]);

// Non-user relation types: require UUIDs
const RELATION_TYPES = new Set([
  "pipeline", "pipelineStage", "team", "multiTeam",
  "people", "multiPeople", "organization", "multiOrganization",
  "deal", "multiDeal", "multiLead", "multiCustomObject",
  "webForm", "multiWebForm", "multiProduct",
  "sequence", "multiSequence",
]);

const RELATION_TOOL_HINT: Record<string, string> = {
  pipeline: "salesmap-get-pipelines",
  pipelineStage: "salesmap-get-pipelines",
  team: "salesmap-list-teams",
  multiTeam: "salesmap-list-teams",
};

/**
 * Schema-based filter validation:
 * - user/multiUser fields → auto-resolve names to UUIDs
 * - other relation fields → require UUID, return error with tool hint
 * - unknown fields → pass through (API will validate)
 */
async function resolveFilterIds(
  groups: FilterGroup[],
  client: SalesMapClient,
  targetType: string,
): Promise<{ error?: string; resolved: FilterGroup[] }> {
  // Fetch schema to determine field types
  const schemaData = await client.get<{ fieldList: SchemaField[] }>(`/v2/field/${targetType}`);
  const fieldTypeMap = new Map<string, string>();
  for (const f of schemaData.fieldList) {
    fieldTypeMap.set(f.name, f.type);
  }

  // Identify user-type fields used in filters
  const userTypeNames = new Set<string>();
  for (const group of groups) {
    for (const f of group.filters) {
      const ft = fieldTypeMap.get(f.propertyName);
      if (ft && USER_TYPES.has(ft)) {
        userTypeNames.add(f.propertyName);
      }
    }
  }

  // Lazy-load user map only if needed
  let userMap: Map<string, string> | null = null;
  const needsLookup = groups.some(g =>
    g.filters.some(f => {
      if (!userTypeNames.has(f.propertyName)) return false;
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
      if (f.operator === "EXISTS" || f.operator === "NOT_EXISTS") {
        filters.push(f);
        continue;
      }

      const fieldType = fieldTypeMap.get(f.propertyName);

      // Unknown field → pass through
      if (!fieldType) {
        filters.push(f);
        continue;
      }

      // User type → auto-resolve names to UUIDs
      if (userTypeNames.has(f.propertyName)) {
        const vals = Array.isArray(f.value) ? f.value : typeof f.value === "string" ? [f.value] : [];
        const bad = vals.filter(v => !isValidId(v));
        if (bad.length === 0) {
          filters.push(f);
          continue;
        }
        if (!userMap) { filters.push(f); continue; }
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

      // Other relation type → require UUID
      if (RELATION_TYPES.has(fieldType)) {
        const vals = Array.isArray(f.value) ? f.value : typeof f.value === "string" ? [f.value] : [];
        const bad = vals.filter(v => !isValidId(v));
        if (bad.length > 0) {
          const hint = RELATION_TOOL_HINT[fieldType] || "salesmap-list-properties";
          return { error: `"${f.propertyName}" 필드는 이름이 아닌 ID(UUID)로 검색해야 합니다. ${hint}로 ID를 먼저 조회하세요. (입력값: "${bad[0]}")`, resolved: [] };
        }
      }

      filters.push(f);
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
    .describe("검색 값. EXISTS/NOT_EXISTS는 생략. DATE_BETWEEN은 ['시작','끝'] 배열. 빈 문자열 불가"),
});

const filterGroupSchema = z.object({
  filters: z.array(filterSchema).min(1).max(3).describe("필터 간 AND. 최대 3개"),
});

export function registerSearchTools(server: McpServer) {
  server.tool(
    "salesmap-search-objects",
    "필터 조건으로 레코드 검색 (그룹 간 OR, 그룹 내 AND, 최대 3그룹×3필터). null 필드는 응답에서 생략됨.",
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
        const { error: idErr, resolved } = await resolveFilterIds(filterGroupList as FilterGroup[], client, targetType);
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
