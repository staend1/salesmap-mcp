import { createHash } from "crypto";
import type { SalesMapResponse } from "./types";
import { cached, TTL } from "./cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_ID_RE = /^[0-9a-f]{24}$/i; // MongoDB ObjectId
function isValidId(v: string): boolean { return UUID_RE.test(v) || HEX_ID_RE.test(v); }

const BASE_URL = "https://salesmap.kr/api";
const MIN_INTERVAL_MS = 120; // 100req/10s = 100ms + safety margin
const MAX_RETRIES = 3;

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export class SalesMapClient {
  private token: string;
  /** 토큰 SHA-256 앞 16자 — 캐시 키의 워크스페이스 분리용 (telemetry fingerprint와 동일) */
  readonly fingerprint: string;

  constructor(token: string) {
    this.token = token;
    this.fingerprint = createHash("sha256").update(token).digest("hex").slice(0, 16);
  }

  private async request<T = unknown>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string>,
  ): Promise<T> {
    await rateLimit();

    const url = new URL(`${BASE_URL}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") {
          url.searchParams.set(k, v);
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.status === 429) {
        const wait = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, wait));
        lastError = new Error("Rate limit exceeded (429)");
        continue;
      }

      const json = (await res.json()) as SalesMapResponse<T>;

      if (!res.ok || json.success === false) {
        let msg = json.reason || json.message || `HTTP ${res.status}`;
        if (res.status === 404) {
          throw new Error(`레코드를 찾을 수 없습니다 (${path}). ID를 확인하세요.`);
        }
        // 유니크 중복 에러는 API가 충돌한 기존 레코드(data:{id,name})를 함께 반환 → 힌트에서 쓰도록 보존
        if (json.reason?.includes("이미 존재하는") && json.data && typeof json.data === "object") {
          const dup = json.data as { id?: string; name?: string };
          if (dup.id) msg += ` (기존 레코드 — id: ${dup.id}${dup.name ? `, 이름: "${dup.name}"` : ""})`;
        }
        throw new Error(msg);
      }

      return json.data as T;
    }

    throw lastError || new Error("Max retries exceeded");
  }

  async get<T = unknown>(path: string, query?: Record<string, string>): Promise<T> {
    return this.request<T>("GET", path, undefined, query);
  }

  async post<T = unknown>(path: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> {
    return this.request<T>("POST", path, body, query);
  }

  /** Get single record — auto-unwraps SalesMap's array-wrapped responses */
  async getOne<T = unknown>(path: string, key: string): Promise<T> {
    const data = await this.get<Record<string, unknown[]>>(path);
    const arr = data[key];
    if (Array.isArray(arr) && arr.length > 0) {
      return arr[0] as T;
    }
    throw new Error(`${key}를 찾을 수 없습니다.`);
  }
}

// ── Response filtering (for list/search) ──────────────────────
const PIPELINE_SUFFIXES = [
  "로 진입한 날짜",
  "에서 보낸 누적 시간",
  "에서 퇴장한 날짜",
];

export function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === null) continue;
    if (PIPELINE_SUFFIXES.some((s) => key.endsWith(s))) continue;
    result[key] = value;
  }
  return result;
}

/** list/search 응답에서 null 필드 + 파이프라인 자동생성 필드 제거 */
export function compactRecords(data: unknown): unknown {
  if (data == null || typeof data !== "object") return data;
  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") {
      result[key] = value.map((r) => compactRecord(r as Record<string, unknown>));
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** compactRecord 결과에서 지정된 필드만 남김. id/name은 항상 포함. */
export function pickProperties(
  record: Record<string, unknown>,
  properties: string[],
): Record<string, unknown> {
  const always = new Set(["id", "name", "이름"]);
  const wanted = new Set([...properties, ...always]);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(key)) result[key] = value;
  }
  return result;
}

// ── Property → fieldList conversion ──────────────────────────
// Schema type → fieldList value key mapping
const TYPE_TO_VALUE_KEY: Record<string, string> = {
  string: "stringValue",
  number: "numberValue",
  boolean: "booleanValue",
  date: "dateValue",
  dateTime: "dateValue",
  singleSelect: "stringValue",
  multiSelect: "stringValueList",
  user: "userValueId",
  multiUser: "userValueIdList",
  people: "peopleValueId",
  multiPeople: "peopleValueIdList",
  organization: "organizationValueId",
  multiOrganization: "organizationValueIdList",
  deal: "dealValueId",
  multiDeal: "dealValueIdList",
  multiLead: "leadValueIdList",
  pipeline: "pipelineValueId",
  pipelineStage: "pipelineStageValueId",
  team: "teamValueIdList",
  multiTeam: "teamValueIdList",
  webForm: "webformValueId",
  multiWebForm: "webformValueIdList",
  multiProduct: "productValueIdList",
  multiCustomObject: "customObjectValueIdList",
  sequence: "sequenceValueId",
  multiSequence: "sequenceValueIdList",
};

// Read-only types that cannot be set via fieldList
const READONLY_TYPES = new Set(["formula", "multiAttachment", "multiPeopleGroup", "multiLeadGroup"]);

interface SchemaField {
  name: string;
  type: string;
}

/** 필드 스키마 조회 (토큰별 5분 캐시). search·create·update·quote·batch-read 공용 진입점. */
export function getFieldSchema(
  client: SalesMapClient,
  objectType: string,
): Promise<{ fieldList: Array<{ name: string; type: string; required?: boolean }> }> {
  return cached(`${client.fingerprint}:field:${objectType}`, TTL.schema,
    () => client.get(`/v2/field/${objectType}`));
}

// User types that accept name-to-UUID auto-resolution
const USER_VALUE_KEYS = new Set(["userValueId", "userValueIdList"]);

interface UserRecord {
  id: string;
  name: string;
}

interface UserListResponse {
  userList: UserRecord[];
  nextCursor?: string;
}

/**
 * Fetches all CRM users and builds a name→UUID map.
 * Called lazily only when a user-type field has a non-UUID value.
 */
export async function fetchUserMap(client: SalesMapClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const query: Record<string, string> = {};
    if (cursor) query.cursor = cursor;
    const data = await client.get<UserListResponse>("/v2/user", query);
    for (const u of data.userList ?? []) {
      map.set(u.name, u.id);
    }
    cursor = data.nextCursor;
  } while (cursor);
  return map;
}

interface TeamListResponse { teamList?: Array<{ id: string; name: string }>; nextCursor?: string; }

/** Fetches all teams and builds a name→UUID map. */
export async function fetchTeamMap(client: SalesMapClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const query: Record<string, string> = {};
    if (cursor) query.cursor = cursor;
    const data = await client.get<TeamListResponse>("/v2/team", query);
    for (const t of data.teamList ?? []) {
      map.set(t.name, t.id);
    }
    cursor = data.nextCursor;
  } while (cursor);
  return map;
}

/** 사용자 이름→UUID 맵 (토큰별 5분 캐시). 반환 Map은 읽기 전용으로 취급. */
export function getUserMap(client: SalesMapClient): Promise<Map<string, string>> {
  return cached(`${client.fingerprint}:users`, TTL.map, () => fetchUserMap(client));
}

/** 팀 이름→UUID 맵 (토큰별 5분 캐시). 반환 Map은 읽기 전용으로 취급. */
export function getTeamMap(client: SalesMapClient): Promise<Map<string, string>> {
  return cached(`${client.fingerprint}:teams`, TTL.map, () => fetchTeamMap(client));
}

/** 워크스페이스 roomId (토큰별 30분 캐시). get-link의 URL 생성용. */
export function getRoomId(client: SalesMapClient): Promise<string> {
  return cached(`${client.fingerprint}:room`, TTL.room, async () => {
    const me = await client.get<{ user: { room: { id: string } } }>("/v2/user/me");
    return me.user.room.id;
  });
}

/** 커스텀 오브젝트 definitionId→이름 맵 (토큰별 5분 캐시). 읽기 전용으로 취급. */
export function getDefinitionMap(client: SalesMapClient): Promise<Map<string, string>> {
  return cached(`${client.fingerprint}:defs`, TTL.schema, async () => {
    const data = await client.get<{ customObjectDefinitionList?: Array<{ id: string; name: string }> }>(
      "/v2/custom-object-definitions",
    );
    return new Map((data.customObjectDefinitionList ?? []).map(d => [d.id, d.name]));
  });
}

/**
 * Converts a simplified properties object into SalesMap's fieldList format.
 * Fetches the schema to determine the correct value key for each property.
 * For user fields, accepts name strings and auto-resolves to UUIDs.
 *
 *   Input:  { "담당자": "김철수", "금액": 50000 }
 *   Output: [{ name: "담당자", userValueId: "uuid" }, { name: "금액", numberValue: 50000 }]
 */
export async function resolveProperties(
  client: SalesMapClient,
  objectType: string,
  properties: Record<string, unknown>,
): Promise<{ fieldList: Array<Record<string, unknown>>; errors: string[]; extractedTopLevel: Record<string, unknown> }> {
  const schemaData = await getFieldSchema(client, objectType);
  const fieldMap = new Map<string, string>();
  for (const f of schemaData.fieldList) {
    fieldMap.set(f.name, f.type);
  }

  // Check if any user-type fields need name→UUID resolution
  let userMap: Map<string, string> | null = null;
  const needsUserLookup = Object.entries(properties).some(([name, value]) => {
    const ft = fieldMap.get(name);
    if (!ft) return false;
    const vk = TYPE_TO_VALUE_KEY[ft];
    if (!vk || !USER_VALUE_KEYS.has(vk)) return false;
    // If value is a non-UUID string, we need user lookup
    if (typeof value === "string" && !isValidId(value)) return true;
    // If value is an array with non-UUID strings
    if (Array.isArray(value) && value.some(v => typeof v === "string" && !isValidId(v))) return true;
    return false;
  });
  if (needsUserLookup) {
    userMap = await getUserMap(client);
  }

  const fieldList: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  const extractedTopLevel: Record<string, unknown> = {};

  // Fields that SalesMap API requires as top-level body params — auto-extracted from properties
  const TOP_LEVEL_ONLY: Record<string, string> = {
    "금액": "price",
    "이름": "name",
    "파이프라인": "pipelineId",
    "파이프라인 단계": "pipelineStageId",
    "상태": "status",
  };

  for (const [name, value] of Object.entries(properties)) {
    if (value === undefined || value === null) continue;

    if (TOP_LEVEL_ONLY[name]) {
      const topKey = TOP_LEVEL_ONLY[name];
      // Pipeline/stage IDs need format validation
      if ((topKey === "pipelineId" || topKey === "pipelineStageId")
          && typeof value === "string" && !isValidId(value)) {
        errors.push(`"${name}" — ID 형식이어야 합니다. salesmap-get-pipelines로 조회하세요. (입력값: "${value}")`);
        continue;
      }
      extractedTopLevel[topKey] = value;
      continue;
    }

    const fieldType = fieldMap.get(name);
    if (!fieldType) {
      errors.push(`"${name}" — 존재하지 않는 필드. salesmap-list-properties로 확인하세요.`);
      continue;
    }
    if (READONLY_TYPES.has(fieldType)) {
      errors.push(`"${name}" (${fieldType}) — 읽기 전용 필드라 설정할 수 없습니다.`);
      continue;
    }

    const valueKey = TYPE_TO_VALUE_KEY[fieldType];
    if (!valueKey) {
      errors.push(`"${name}" (${fieldType}) — 지원하지 않는 필드 타입.`);
      continue;
    }

    // Auto-resolve user names to UUIDs
    if (USER_VALUE_KEYS.has(valueKey) && userMap) {
      if (typeof value === "string" && !isValidId(value)) {
        const userId = userMap.get(value);
        if (!userId) {
          errors.push(`"${name}" — "${value}" 사용자를 찾을 수 없습니다.`);
          continue;
        }
        fieldList.push({ name, [valueKey]: valueKey.endsWith("List") ? [userId] : userId });
        continue;
      }
      if (Array.isArray(value)) {
        const resolved = [];
        for (const v of value) {
          if (typeof v === "string" && !isValidId(v)) {
            const userId = userMap.get(v);
            if (!userId) {
              errors.push(`"${name}" — "${v}" 사용자를 찾을 수 없습니다.`);
              continue;
            }
            resolved.push(userId);
          } else {
            resolved.push(v);
          }
        }
        if (errors.length > 0) continue;
        fieldList.push({ name, [valueKey]: resolved });
        continue;
      }
    }

    // 리스트 타입(...List) 키인데 단일 값이면 배열로 감싼다 (multiSelect·multiUser 등에 단건 입력 허용)
    fieldList.push({ name, [valueKey]: valueKey.endsWith("List") && !Array.isArray(value) ? [value] : value });
  }

  return { fieldList, errors, extractedTopLevel };
}

// ── Default properties (core fields per object type) ─────────────
const COMMON_DEFAULTS = ["이름", "담당자", "팀", "생성 날짜", "수정 날짜"];

const DEFAULT_PROPERTIES: Record<string, string[]> = {
  deal: [...COMMON_DEFAULTS, "금액", "파이프라인", "파이프라인 단계", "상태", "수주 예정일", "마감일"],
  lead: [...COMMON_DEFAULTS, "금액", "파이프라인", "파이프라인 단계"],
  people: [...COMMON_DEFAULTS, "이메일", "전화"],
  organization: [...COMMON_DEFAULTS],
};

/**
 * Returns the default property names for a given object type.
 * For custom-object: fetches schema and finds the "name" field dynamically
 * (string + required + not RecordId).
 */
export async function getDefaultProperties(
  client: SalesMapClient,
  objectType: string,
): Promise<string[]> {
  if (objectType !== "custom-object") {
    return DEFAULT_PROPERTIES[objectType] ?? COMMON_DEFAULTS;
  }

  // Custom object: dynamic name field detection
  const schema = await getFieldSchema(client, "custom-object");
  const nameFields = schema.fieldList
    .filter(f => f.type === "string" && f.required && f.name !== "RecordId")
    .map(f => f.name);

  return [...nameFields, "담당자", "팀", "생성 날짜", "수정 날짜", "파이프라인", "파이프라인 단계"];
}

// Tool response helpers
export function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function err(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

// 검색 연산자 × 필드 타입 허용 매트릭스 (백엔드 getAvailableOperationList 기준, 2026-06)
// "Invalid operator … (type: X)" 에러 시 그 타입의 유효 연산자 목록을 AI에게 안내.
const SEARCH_OPS_BY_TYPE: Record<string, string[]> = {
  string: ["EQ", "NEQ", "CONTAINS", "NOT_CONTAINS", "EXISTS", "NOT_EXISTS"],
  number: ["EQ", "GT", "GTE", "LT", "LTE", "EXISTS", "NOT_EXISTS"],
  boolean: ["EQ", "NEQ", "EXISTS", "NOT_EXISTS"],
  singleSelect: ["EQ", "NEQ", "IN", "NOT_IN", "EXISTS", "NOT_EXISTS"],
  multiSelect: ["LIST_CONTAIN", "LIST_NOT_CONTAIN", "IN", "NOT_IN", "EXISTS", "NOT_EXISTS"],
  singleRelation: ["EQ", "NEQ", "IN", "NOT_IN", "EXISTS", "NOT_EXISTS"],
  multiRelation: ["IN", "NOT_IN", "EXISTS", "NOT_EXISTS"], // LIST_CONTAIN/LIST_NOT_CONTAIN은 백엔드 버그로 차단 → IN/NOT_IN 사용
};
const DATE_SEARCH_OPS = ["EXISTS", "NOT_EXISTS", "DATE_ON_OR_AFTER", "DATE_ON_OR_BEFORE", "DATE_IS_SPECIFIC_DAY", "DATE_BETWEEN", "DATE_MORE_THAN_DAYS_AGO", "DATE_LESS_THAN_DAYS_AGO", "DATE_LESS_THAN_DAYS_LATER", "DATE_MORE_THAN_DAYS_LATER", "DATE_AGO", "DATE_LATER"];
const SINGLE_RELATION_TYPES = new Set(["user", "people", "organization", "deal", "lead", "pipeline", "pipelineStage", "webForm", "sequence", "customObject"]);

/** columnType("Invalid operator … (type: X)"의 X) → 허용 연산자 목록. 미지 타입은 null. */
function allowedSearchOperators(columnType: string): string[] | null {
  if (columnType === "date" || columnType === "dateTime") return DATE_SEARCH_OPS;
  if (SEARCH_OPS_BY_TYPE[columnType]) return SEARCH_OPS_BY_TYPE[columnType];
  if (SINGLE_RELATION_TYPES.has(columnType)) return SEARCH_OPS_BY_TYPE.singleRelation;
  if (columnType.startsWith("multi") || columnType === "team") return SEARCH_OPS_BY_TYPE.multiRelation;
  return null;
}

export function errWithSchemaHint(message: string, objectType: string, filterSummary?: string) {
  let hint: string | null = null;
  if (message.includes("정의 되지 않은 값")) {
    hint = `선택형 필드에 미등록 옵션값이 입력되었습니다. salesmap-list-properties(objectType: "${objectType}")로 허용 옵션을 확인하세요.`;
  } else if (message.includes("is not supported for relation field")) {
    hint = `관계 필드 검색에는 IN/NOT_IN 연산자만 지원됩니다 (LIST_CONTAIN/LIST_NOT_CONTAIN 등 미지원). 값(UUID)은 그대로 두고 연산자만 IN/NOT_IN으로 바꾸세요.`;
  } else if (message.includes("Invalid operator")) {
    // (type: X) 파싱 → 매트릭스로 그 타입의 정확한 허용 연산자 목록 안내 (API는 유효 목록을 안 줌)
    const m = message.match(/Invalid operator "([^"]+)" for field "[^"]+" \(type: ([^)]+)\)/);
    const allowed = m ? allowedSearchOperators(m[2]) : null;
    if (m && allowed) {
      hint = `'${m[2]}' 타입 필드에는 '${m[1]}' 연산자를 쓸 수 없습니다. 허용 연산자: ${allowed.join(", ")}.`;
    } else {
      hint = `해당 필드 타입에 맞지 않는 연산자입니다. 에러의 (type: ...)를 참고해 연산자를 바꾸세요 — 관계 필드는 IN/NOT_IN, 숫자/날짜는 비교 연산자(GT/LT 등).`;
    }
  } else if (message.includes("relation field")) {
    hint = `relation 필드는 UUID만 허용합니다. salesmap-get-pipelines 또는 salesmap-list-users로 UUID를 확인하세요.`;
  } else if (message.includes("userValueId가 없습니다")) {
    // resolveProperties가 user 필드를 항상 올바른 userValueId 키로 변환하므로 사실상 도달 불가.
    // 스키마 미식별 등 만약을 대비해 잔존.
    hint = `담당자 필드는 userValueId(UUID)로 지정해야 합니다. salesmap-list-users로 ID를 확인하세요.`;
  } else if (message.includes("fieldList이 아닌 파라메터")) {
    // TOP_LEVEL_ONLY가 금액 등을 미리 top-level로 추출하므로 사실상 도달 불가.
    // 목록에 없는 다른 top-level 전용 필드를 대비해 잔존.
    hint = `금액(price)은 properties가 아닌 top-level price 파라미터로 전달하세요.`;
  } else if (message.includes("이미 존재하는")) {
    hint = `유니크 필드 중복 — 같은 값을 가진 레코드가 이미 있습니다. 에러의 '기존 레코드 id'를 salesmap-update-object로 수정하거나(salesmap-batch-read-objects로 확인), 다른 값을 사용하세요.`;
  } else if (message.includes("Invalid fieldName") || message.includes("정의되있지 않은 데이터 필드")) {
    // 진짜 필드명 오류일 때만 list-properties 안내.
    hint = `필드명이 잘못되었습니다. salesmap-list-properties(objectType: "${objectType}")로 정확한 필드명을 확인하세요.`;
  }
  // 매칭되는 패턴이 없으면 hint=null → 원본 API 메시지만 그대로 전달.
  // (백엔드 에러가 충분히 구체적이라, 모호한 "필드명/옵션 확인" 추측은 오히려 방해 → else 제거)
  if (hint && filterSummary) {
    hint += `\n사용된 필드: ${filterSummary}`;
  }
  return hint ? err(`${message}\n\n[힌트] ${hint}`) : err(message);
}
