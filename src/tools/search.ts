import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, errWithSchemaHint, getUserMap, getTeamMap, getFieldSchema, canonicalFieldName } from "../client";
import { getClient } from "../types";
import { REL_LIST_OP_MAP, GROUP_TYPES, V3_CORE_TYPE_MAP, toKstBoundary } from "../api-quirks";
import type { SalesMapClient } from "../client";

// @quirk date-only-timezone-split — 값이 "날짜"인 연산자만 KST 경계 변환 대상.
// 상대 연산자(DATE_MORE_THAN_DAYS_AGO 등)는 값이 숫자라 해당 없음.
const ABSOLUTE_DATE_OPS = new Set([
  "DATE_ON_OR_AFTER", "DATE_ON_OR_BEFORE", "DATE_IS_SPECIFIC_DAY", "DATE_BETWEEN",
]);


const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

// ── Relation field resolution (schema-based) ──────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_ID_RE = /^[0-9a-f]{24}$/i; // MongoDB ObjectId

function isValidId(v: string): boolean { return UUID_RE.test(v) || HEX_ID_RE.test(v); }

type FilterGroup = { filters: Array<{ propertyName: string; operator: string; value?: string | number | boolean | string[] }> };
type PipelineInfo = { id: string; name: string; stageList: Array<{ id: string; name: string }> };


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

const isRelationType = (t: string) => USER_TYPES.has(t) || TEAM_TYPES.has(t) || RELATION_TYPES.has(t);


// 비-id 값을 넣었을 때 "id를 어디서 조회하라"고 안내할 도구 (타입별)
const RELATION_TOOL_HINT: Record<string, string> = {
  sequence: "salesmap-list-sequences",
  multiSequence: "salesmap-list-sequences",
  multiProduct: "salesmap-list-products",
  webForm: "salesmap-list-webforms",
  multiWebForm: "salesmap-list-webforms",
  multiCustomObject: "salesmap-list-associations(연결 레코드 조회) 또는 해당 레코드 읽기",
};

function asStringValues(value: string | number | boolean | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return typeof value === "string" ? [value] : [];
}

async function getPipelineInfos(client: SalesMapClient, targetType: string): Promise<PipelineInfo[]> {
  const apiType = V3_CORE_TYPE_MAP[targetType] ?? targetType;
  const data = await client.post<{ pipelineList?: Array<Record<string, unknown>> }>(
    "/v3/pipeline/list",
    { objectType: apiType },
  );

  return (data.pipelineList ?? []).flatMap((p) => {
    const id = typeof p.id === "string" ? p.id : typeof p._id === "string" ? p._id : null;
    const name = typeof p.name === "string" ? p.name : null;
    if (!id || !name) return [];
    const rawStages = (Array.isArray(p.stageList) ? p.stageList : p.pipelineStageList) as Array<Record<string, unknown>> | undefined;
    const stageList = (rawStages ?? []).flatMap((s) => {
      const stageId = typeof s.id === "string" ? s.id : typeof s._id === "string" ? s._id : null;
      const stageName = typeof s.name === "string" ? s.name : null;
      return stageId && stageName ? [{ id: stageId, name: stageName }] : [];
    });
    return [{ id, name, stageList }];
  });
}

function matchOneByNameOrId<T extends { id: string; name: string }>(
  items: T[],
  value: string,
  label: string,
): { item?: T; error?: string } {
  if (isValidId(value)) {
    const item = items.find((x) => x.id === value);
    return item ? { item } : { error: `${label} ID "${value}"를 찾을 수 없습니다.` };
  }

  const matches = items.filter((x) => x.name === value);
  if (matches.length === 1) return { item: matches[0] };
  if (matches.length > 1) return { error: `${label} 이름 "${value}"이 여러 개입니다. 더 구체적인 조건을 함께 지정하세요.` };
  const sample = items.slice(0, 10).map((x) => x.name).join(", ");
  return { error: `${label} "${value}"를 찾을 수 없습니다. 사용 가능한 값 예: ${sample}` };
}

function resolvePipelineScope(
  group: FilterGroup,
  fieldTypeMap: Map<string, string>,
  pipelines: PipelineInfo[],
): { pipeline?: PipelineInfo; error?: string } {
  const pipelineFilter = group.filters.find((f) =>
    fieldTypeMap.get(f.propertyName) === "pipeline"
    && f.operator !== "EXISTS"
    && f.operator !== "NOT_EXISTS",
  );
  if (!pipelineFilter) return {};

  const values = asStringValues(pipelineFilter.value);
  if (values.length !== 1) return {};
  const match = matchOneByNameOrId(pipelines, values[0], "파이프라인");
  return match.error ? { error: match.error } : { pipeline: match.item };
}

function resolvePipelineValue(
  value: string | number | boolean | string[] | undefined,
  pipelines: PipelineInfo[],
): { value?: string | string[]; error?: string } {
  const values = asStringValues(value);
  if (value !== undefined && !values.length) return { error: "파이프라인 검색 값은 이름 또는 ID 문자열이어야 합니다." };
  if (!values.length) return { value: value as string | string[] | undefined };

  const resolved: string[] = [];
  for (const v of values) {
    const match = matchOneByNameOrId(pipelines, v, "파이프라인");
    if (match.error) return { error: match.error };
    resolved.push(match.item!.id);
  }
  return { value: Array.isArray(value) ? resolved : resolved[0] };
}

function resolvePipelineStageValue(
  value: string | number | boolean | string[] | undefined,
  pipelines: PipelineInfo[],
  scope?: PipelineInfo,
): { value?: string | string[]; error?: string } {
  const values = asStringValues(value);
  if (value !== undefined && !values.length) return { error: "파이프라인 단계 검색 값은 이름 또는 ID 문자열이어야 합니다." };
  if (!values.length) return { value: value as string | string[] | undefined };

  const resolved: string[] = [];
  for (const v of values) {
    if (isValidId(v)) {
      const exists = pipelines.some((p) => p.stageList.some((s) => s.id === v));
      if (!exists) return { error: `파이프라인 단계 ID "${v}"를 찾을 수 없습니다.` };
      resolved.push(v);
      continue;
    }

    const candidates = scope ? scope.stageList : pipelines.flatMap((p) => p.stageList);
    const matches = candidates.filter((s) => s.name === v);
    if (matches.length === 1) {
      resolved.push(matches[0].id);
      continue;
    }
    if (matches.length > 1) {
      return { error: `파이프라인 단계 "${v}"이 여러 파이프라인에 있습니다. 같은 필터 그룹에 "파이프라인" 조건도 함께 넣으세요.` };
    }
    const sample = candidates.slice(0, 10).map((s) => s.name).join(", ");
    return { error: `파이프라인 단계 "${v}"를 찾을 수 없습니다. 사용 가능한 값 예: ${sample}` };
  }
  return { value: Array.isArray(value) ? resolved : resolved[0] };
}

/**
 * Schema-based filter validation:
 * - user/multiUser, team/multiTeam, pipeline/pipelineStage → auto-resolve names to UUIDs
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

  // 이름 필드 별칭(회사명·딜 이름 등)을 `이름`으로 교정 — 스키마에 없는 이름일 때만.
  // 이후 로직·API 전송이 모두 propertyName을 그대로 쓰므로 여기서 한 번만 정규화한다.
  const hasField = (n: string) => fieldTypeMap.has(n);
  for (const group of groups) {
    for (const f of group.filters) {
      f.propertyName = canonicalFieldName(f.propertyName, hasField, fieldTypeMap.keys());
    }
  }

  // Identify user-type and team-type fields used in filters
  const userTypeNames = new Set<string>();
  const teamTypeNames = new Set<string>();
  const pipelineTypeNames = new Set<string>();
  const pipelineStageTypeNames = new Set<string>();
  for (const group of groups) {
    for (const f of group.filters) {
      const ft = fieldTypeMap.get(f.propertyName);
      if (ft && USER_TYPES.has(ft)) userTypeNames.add(f.propertyName);
      if (ft && TEAM_TYPES.has(ft)) teamTypeNames.add(f.propertyName);
      if (ft === "pipeline") pipelineTypeNames.add(f.propertyName);
      if (ft === "pipelineStage") pipelineStageTypeNames.add(f.propertyName);
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
  let pipelines: PipelineInfo[] | null = null;
  if (hasNameValues(userTypeNames)) userMap = await getUserMap(client);
  if (hasNameValues(teamTypeNames)) teamMap = await getTeamMap(client);
  if (hasNameValues(pipelineTypeNames) || hasNameValues(pipelineStageTypeNames)) {
    pipelines = await getPipelineInfos(client, targetType);
  }

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

      // @quirk date-only-timezone-split — 날짜 필드에 날짜만 오면 KST 하루 경계를 명시해 보낸다.
      // 검색 API는 date-only도 KST로 읽어 결과가 같지만(실측), 도구 전체가 같은 규칙을 쓰게
      // 통일해두면 memo처럼 해석이 다른 엔드포인트가 섞여도 사고가 안 난다.
      if ((fieldType === "date" || fieldType === "dateTime") && ABSOLUTE_DATE_OPS.has(f.operator)) {
        if (Array.isArray(f.value)) {
          // DATE_BETWEEN: [시작, 끝]
          const [s, e] = f.value;
          filters.push({ ...f, value: [
            typeof s === "string" ? toKstBoundary(s, "start") : s,
            typeof e === "string" ? toKstBoundary(e, "end") : e,
          ] });
          continue;
        }
        if (typeof f.value === "string") {
          // ON_OR_BEFORE만 하루의 끝, 나머지는 하루의 시작
          const edge = f.operator === "DATE_ON_OR_BEFORE" ? "end" : "start";
          filters.push({ ...f, value: toKstBoundary(f.value, edge) });
          continue;
        }
      }

      // boolean 필드에 문자열 "true"/"false"가 오면 실제 boolean으로 교정.
      // (백엔드는 boolean만 받는데 LLM이 습관적으로 따옴표를 붙인다 —
      //  이걸 못 넘겨서 AI가 조건 자체를 버리고 엉뚱한 답을 내던 원인)
      if (fieldType === "boolean" && typeof f.value === "string") {
        const v = f.value.trim().toLowerCase();
        if (v === "true" || v === "false") {
          filters.push({ ...f, value: v === "true" });
          continue;
        }
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

      // Pipeline type → auto-resolve pipeline names to UUIDs.
      // The v2 search API still requires IDs, but the MCP surface should accept names like v3 create.
      if (pipelineTypeNames.has(f.propertyName)) {
        if (!pipelines) {
          filters.push(f);
          continue;
        }
        const resolvedPipeline = resolvePipelineValue(f.value, pipelines);
        if (resolvedPipeline.error) return { error: resolvedPipeline.error, resolved: [] };
        filters.push({ ...f, value: resolvedPipeline.value });
        continue;
      }

      // Pipeline stage type → auto-resolve stage names to UUIDs. If a stage name is duplicated,
      // the caller can disambiguate by adding a "파이프라인" filter in the same group.
      if (pipelineStageTypeNames.has(f.propertyName)) {
        if (!pipelines) {
          filters.push(f);
          continue;
        }
        const scope = resolvePipelineScope(group, fieldTypeMap, pipelines);
        if (scope.error) return { error: scope.error, resolved: [] };
        const resolvedStage = resolvePipelineStageValue(f.value, pipelines, scope.pipeline);
        if (resolvedStage.error) return { error: resolvedStage.error, resolved: [] };
        filters.push({ ...f, value: resolvedStage.value });
        continue;
      }

      // Other relation type → require UUID
      // @quirk relation-search-500 — 백엔드가 관계 필드 값 검증을 스킵해 잘못된 id면 500이 나므로 사전 차단
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
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional()
    .describe("검색 값. EXISTS/NOT_EXISTS는 생략. boolean(체크박스) 필드는 따옴표 없는 true/false. DATE_BETWEEN은 ['시작','끝'] 배열. 빈 문자열 불가"),
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
        // @quirk relation-search-500
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
