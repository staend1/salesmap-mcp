import type { SalesMapResponse } from "./types";

const BASE_URL = "https://salesmap.kr/api";
const MIN_INTERVAL_MS = 120; // 100req/10sec = 100ms, 안전마진 포함 120ms
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

  async post<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  // 단일 조회 헬퍼 — 배열 래핑 자동 추출
  async getOne<T = unknown>(path: string, key: string): Promise<T> {
    const data = await this.get<Record<string, unknown[]>>(path);
    const arr = data[key];
    if (Array.isArray(arr) && arr.length > 0) {
      return arr[0] as T;
    }
    throw new Error(`${key}를 찾을 수 없습니다.`);
  }
}

// Tool 응답 헬퍼
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
