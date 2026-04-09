import type { SalesMapResponse } from "./types";

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

  constructor(token: string) {
    this.token = token;
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
        const msg = json.reason || json.message || `HTTP ${res.status}`;
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
async function fetchUserMap(client: SalesMapClient): Promise<Map<string, string>> {
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
): Promise<{ fieldList: Array<Record<string, unknown>>; errors: string[] }> {
  const schemaData = await client.get<{ fieldList: SchemaField[] }>(`/v2/field/${objectType}`);
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
    userMap = await fetchUserMap(client);
  }

  const fieldList: Array<Record<string, unknown>> = [];
  const errors: string[] = [];

  // Fields that must be passed as top-level parameters, not in properties
  const TOP_LEVEL_ONLY: Record<string, string> = { "금액": "price" };

  for (const [name, value] of Object.entries(properties)) {
    if (value === undefined || value === null) continue;

    if (TOP_LEVEL_ONLY[name]) {
      errors.push(`"${name}"은(는) properties가 아닌 top-level ${TOP_LEVEL_ONLY[name]} 파라미터로 전달하세요.`);
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
        fieldList.push({ name, [valueKey]: userId });
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

    fieldList.push({ name, [valueKey]: value });
  }

  return { fieldList, errors };
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

export function errWithSchemaHint(message: string, objectType: string, filterSummary?: string) {
  let hint: string;
  if (message.includes("정의 되지 않은 값")) {
    hint = `선택형 필드에 미등록 옵션값이 입력되었습니다. salesmap-list-properties(objectType: "${objectType}")로 허용 옵션을 확인하세요.`;
  } else if (message.includes("Invalid fieldName")) {
    hint = `필드명은 한글입니다 (예: 'name' → '이름'). salesmap-list-properties(objectType: "${objectType}") 결과를 다시 확인하세요.`;
  } else if (message.includes("relation field")) {
    hint = `relation 필드는 UUID만 허용합니다. salesmap-get-pipelines 또는 salesmap-list-users로 UUID를 확인하세요.`;
  } else if (message.includes("userValueId가 없습니다")) {
    hint = `담당자 필드는 userValueId(UUID)로 지정해야 합니다. salesmap-list-users로 ID를 확인하세요.`;
  } else if (message.includes("fieldList이 아닌 파라메터")) {
    hint = `금액(price)은 properties가 아닌 top-level price 파라미터로 전달하세요.`;
  } else {
    hint = `필드명 또는 옵션값이 잘못되었을 수 있습니다. salesmap-list-properties(objectType: "${objectType}")로 정확한 필드명과 허용 옵션을 확인하세요.`;
  }
  if (filterSummary) {
    hint += `\n사용된 필드: ${filterSummary}`;
  }
  return err(`${message}\n\n[힌트] ${hint}`);
}
