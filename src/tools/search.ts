import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, errWithSchemaHint, getUserMap, getTeamMap, getFieldSchema } from "../client";
import { getClient } from "../types";
import type { SalesMapClient } from "../client";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

// ── Relation field resolution (schema-based) ──────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_ID_RE = /^[0-9a-f]{24}$/i; // MongoDB ObjectId

function isValidId(v: string): boolean { return UUID_RE.test(v) || HEX_ID_RE.test(v); }

type FilterGroup = { filters: Array<{ propertyName: string; operator: string; value?: string | number | string[] }> };


// Auto-resolve types: accept name strings, auto-resolve to UUIDs
const USER_TYPES = new Set(["user", "multiUser"]);
const TEAM_TYPES = new Set(["team", "multiTeam"]);

// Non-auto relation types: require UUIDs
const RELATION_TYPES = new Set([
  "pipeline", "pipelineStage",
  "people", "multiPeople", "organization", "multiOrganization",
  "deal", "multiDeal", "multiLead", "multiCustomObject",
  "webForm", "multiWebForm", "multiProduct",
  "sequence", "multiSequence",
]);

// 관계 필드는 LIST_CONTAIN/LIST_NOT_CONTAIN을 지원하지 않음 → 동등한 IN/NOT_IN으로 매핑
const REL_LIST_OP_MAP: Record<string, string> = { LIST_CONTAIN: "IN", LIST_NOT_CONTAIN: "NOT_IN" };
const isRelationType = (t: string) => USER_TYPES.has(t) || TEAM_TYPES.has(t) || RELATION_TYPES.has(t);

// 그룹 필드: list API가 없어 유효 id를 구할 방법이 없음 → 값 검색 원천 불가(EXISTS/NOT_EXISTS만)
const GROUP_TYPES = new Set(["multiLeadGroup", "multiPeopleGroup"]);

// 비-id 값을 넣었을 때 "id를 어디서 조회하라"고 안내할 도구 (타입별)
const RELATION_TOOL_HINT: Record<string, string> = {
  pipeline: "salesmap-get-pipelines",
  pipelineStage: "salesmap-get-pipelines",
  sequence: "salesmap-list-sequences",
  multiSequence: "salesmap-list-sequences",
  multiProduct: "salesmap-list-products",
  webForm: "salesmap-list-webforms",
  multiWebForm: "salesmap-list-webforms",
  multiCustomObject: "salesmap-list-associations(연결 레코드 조회) 또는 해당 레코드 읽기",
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
  // Fetch schema to determine field types (토큰별 캐시 경유)
  const schemaData = await getFieldSchema(client, targetType);
  const fieldTypeMap = new Map<string, string>();
  for (const f of schemaData.fieldList) {
    fieldTypeMap.set(f.name, f.type);
  }

  // Identify user-type and team-type fields used in filters
  const userTypeNames = new Set<string>();
  const teamTypeNames = new Set<string>();
  for (const group of groups) {
    for (const f of group.filters) {
      const ft = fieldTypeMap.get(f.propertyName);
      if (ft && USER_TYPES.has(ft)) userTypeNames.add(f.propertyName);
      if (ft && TEAM_TYPES.has(ft)) teamTypeNames.add(f.propertyName);
    }
  }

  // Helper: check if any filter has non-UUID values for given field names
  const hasNameValues = (fieldNames: Set<string>) => groups.some(g =>
    g.filters.some(f => {
      if (!fieldNames.has(f.propertyName)) return false;
      if (f.operator === "EXISTS" || f.operator === "NOT_EXISTS") return false;
      const vals = Array.isArray(f.value) ? f.value : typeof f.value === "string" ? [f.value] : [];
      return vals.some(v => !isValidId(v));
    }),
  );

  // Lazy-load maps only if needed
  let userMap: Map<string, string> | null = null;
  let teamMap: Map<string, string> | null = null;
  if (hasNameValues(userTypeNames)) userMap = await getUserMap(client);
  if (hasNameValues(teamTypeNames)) teamMap = await getTeamMap(client);

  const resolved: FilterGroup[] = [];
  for (const group of groups) {
    const filters: FilterGroup["filters"] = [];
    for (const f of group.filters) {
      const relType = fieldTypeMap.get(f.propertyName);
      // 그룹 필드(리드/고객 그룹)는 id 조회 수단이 없어 값 검색 불가 → EXISTS/NOT_EXISTS 외 사전 차단
      if (relType && GROUP_TYPES.has(relType) && f.operator !== "EXISTS" && f.operator !== "NOT_EXISTS") {
        return { error: `"${f.propertyName}" 그룹 필드는 값 검색이 불가합니다 (id 조회 수단 없음). EXISTS/NOT_EXISTS만 사용하세요.`, resolved: [] };
      }
      // 관계 필드는 LIST_CONTAIN/LIST_NOT_CONTAIN 미지원 → IN/NOT_IN으로 자동 변환 (API 거부 방지)
      if (relType && isRelationType(relType) && REL_LIST_OP_MAP[f.operator]) {
        f.operator = REL_LIST_OP_MAP[f.operator];
      }

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

      // Team type → auto-resolve names to UUIDs
      if (teamTypeNames.has(f.propertyName)) {
        const vals = Array.isArray(f.value) ? f.value : typeof f.value === "string" ? [f.value] : [];
        const bad = vals.filter(v => !isValidId(v));
        if (bad.length === 0) {
          filters.push(f);
          continue;
        }
        if (!teamMap) { filters.push(f); continue; }
        const resolvedVals: string[] = [];
        for (const v of vals) {
          if (isValidId(v)) {
            resolvedVals.push(v);
          } else {
            const tid = teamMap.get(v);
            if (!tid) {
              return { error: `"${f.propertyName}" — "${v}" 팀을 찾을 수 없습니다. salesmap-list-teams로 확인하세요.`, resolved: [] };
            }
            resolvedVals.push(tid);
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
    "🎯 레코드 필터 검색 (그룹 간 OR, 내 AND, 3×3). id·name만 반환.\n📦 상세는 salesmap-batch-read-objects로 후속 조회.",
    {
      objectType: z.enum(["people", "organization", "deal", "lead"]).describe("검색 대상 오브젝트"),
      filterGroups: z.array(filterGroupSchema).min(1).max(3).describe("필터 그룹 (그룹 간 OR)"),
      after: z.string().optional().describe("페이지네이션 커서"),
    },
    READ,
    async ({ objectType, filterGroups, after }, extra) => {
      try {
        const client = getClient(extra);

        // Pre-validate + auto-resolve user/team names to UUIDs
        const { error: idErr, resolved } = await resolveFilterIds(filterGroups as FilterGroup[], client, objectType);
        if (idErr) return err(idErr);

        const query: Record<string, string> = {};
        if (after) query.cursor = after;

        // Convert propertyName → fieldName for SalesMap API
        const apiFilterGroups = resolved.map(g => ({
          filters: g.filters.map(f => ({
            fieldName: f.propertyName,
            operator: f.operator,
            ...(f.value !== undefined ? { value: f.value } : {}),
          })),
        }));

        const data = await client.post(`/v2/object/${objectType}/search`, { filterGroupList: apiFilterGroups }, query);

        return ok(data);
      } catch (e: unknown) {
        const message = (e as Error).message;
        // 관계 필드(id 참조)는 search API가 값 검증을 스킵하는 경우가 있어, id가 아니거나 없는 id면
        // 500 또는 빈 결과를 냄 (백엔드 known issue). 500이면 아래 힌트로 list 도구 안내.
        if (message.includes("Internal Server Error")) {
          return err(`${message}\n\n[힌트] 관계 필드(최근 등록한 시퀀스·등록된 시퀀스 목록·최근 제출된 웹폼·제출된 웹폼 목록·메인 견적 상품 리스트·팀·담당자 등 — 다른 레코드를 id로 참조하는 필드)는 id 형식이 아니거나 존재하지 않는 id로 검색하면 500 또는 빈 결과가 납니다. salesmap-list-sequences/list-webforms/list-products/list-teams/list-users로 정확한 id를 확인하거나, EXISTS/NOT_EXISTS를 사용하세요.`);
        }
        const filters = (filterGroups as FilterGroup[]).flatMap(g =>
          g.filters.map(f => `${f.propertyName} ${f.operator} ${JSON.stringify(f.value)}`),
        );
        return errWithSchemaHint(message, objectType, filters.join(", "));
      }
    },
  );
}
