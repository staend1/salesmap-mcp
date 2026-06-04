// 토큰별 TTL 캐시 (per-instance, warm 인스턴스에서만 유효).
// 캐시는 순수 최적화 — cold start나 만료 시 그냥 재조회되므로 stateless 보장은 유지된다.
// ⚠️ 캐시된 값은 읽기 전용으로 취급할 것 (공유 객체 변형 금지).

type Entry = { value: unknown; expires: number };
const store = new Map<string, Entry>();

/**
 * key로 캐시 조회. 만료/미스 시 fetcher 실행 후 저장.
 * key는 반드시 토큰 지문을 포함해야 워크스페이스 간 섞임을 막는다.
 */
export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fetcher();
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

export const TTL = {
  schema: 5 * 60_000, // 필드 스키마 — 거의 안 변함
  map: 5 * 60_000, // userMap / teamMap
  room: 30 * 60_000, // roomId — 사실상 불변
} as const;
