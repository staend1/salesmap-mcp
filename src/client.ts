import type { SalesMapResponse } from "./types";

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
    hint = `금액(price)은 fieldList가 아닌 top-level price 파라미터로 전달하세요.`;
  } else {
    hint = `필드명 또는 옵션값이 잘못되었을 수 있습니다. salesmap-list-properties(objectType: "${objectType}")로 정확한 필드명과 허용 옵션을 확인하세요.`;
  }
  if (filterSummary) {
    hint += `\n사용된 필드: ${filterSummary}`;
  }
  return err(`${message}\n\n[힌트] ${hint}`);
}
