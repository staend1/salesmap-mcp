# API 호출 효율화 — 전수조사 + 캐시 PRD

> 작성: 2026-06-04 / 대상: salesmap-mcp 내부
> 배경: MCP는 세일즈맵 API 위 얇은 래퍼라 여러 도구가 부가 API를 **조합 호출**한다. 일부는 매 호출 반복되어 ① rate limit(10초 100건) 압박 ② 지연(요청당 120ms 직렬화)을 키운다. 텔레메트리상 `batch-read`·`list-engagements`가 가장 느렸고, 원인이 이 반복/N+1 호출로 확인됨.

---

## 1. 전수조사 — 도구별 API 호출 패턴

| 도구 | 호출 패턴 | 호출 수 | 과잉 원인 |
|------|----------|:---:|------|
| `batch-read-objects` | (custom 시 스키마1) + **레코드당 (조회1 + 연관카운트3)** | **1 + 4N** | 🔴 N+1 |
| `list-engagements` | activity1 + **engagement당 email/memo 본문 fetch** | 1 + N | 🔴 N+1 |
| `search-objects` | **스키마1** + (이름필터 시 userMap/teamMap) + search1 | 2~4+ | 🟡 스키마·맵 |
| `create-object` | **스키마1** + (user이름 시 userMap) + create1 | 2~3+ | 🟡 스키마·맵 |
| `update-object` | **스키마1** + (userMap) + update1 | 2~3+ | 🟡 스키마·맵 |
| `create-quote` | **스키마1**(quote) + (userMap) + create1 | 2~3+ | 🟡 스키마·맵 |
| `get-link` | **/v2/user/me 1** (roomId만 얻으려고) | 1 | 🟡 매번 me |
| `list-associations` | primary1 + custom1 | 2 | 고정(OK) |
| 단순 도구(list-properties·list-objects·get-pipelines·list-users·list-teams·get-user-details·create-note·get-quotes·read-note·list-changelog·create-property·get-lead-time) | 각 1 | 1 | OK |
| `report-feedback` | 0 (텔레메트리만) | 0 | OK |

**텔레메트리 검증:** batch-read 평균 3초·p95 8.9초, engagements 평균 2.6초·p95 9초. 원인 = N+1 + rate-limit 120ms 직렬화 (예: 20레코드 batch-read = 1+80콜 × 120ms ≈ 9.6초).

---

## 2. 분류 — 캐시 가능 vs 불가

### 🟢 캐시로 풀리는 것 (반복되는 동일 조회)

| 대상 | 반복 호출 도구 | 안정성 | 캐시 키 |
|------|-------------|------|--------|
| **필드 스키마** `/v2/field/{type}` | search·create·update·create-quote·batch-read(custom) | 거의 안 변함 | `token + objectType` |
| **userMap** (전체 사용자, 페이지네이션) | search·create·update·quote (이름→UUID) | 가끔 변함 | `token` |
| **teamMap** (전체 팀) | search·create·update·quote (팀 이름→UUID) | 가끔 변함 | `token` |
| **roomId** (`/v2/user/me`) | get-link 매번 | 거의 불변 | `token` |
| **definition 목록** (`/v2/custom-object-definitions`) | Task #3(읽기 enrich) 시 | 거의 안 변함 | `token` |

→ **스키마 캐시가 최우선** (가장 많은 도구가 반복).

### 🔴 캐시로 못 푸는 것 (N+1 — 레코드마다 다른 데이터)

| 대상 | 문제 | 본질 |
|------|------|------|
| **batch-read 연관카운트** | 레코드당 연관 3종 조회 = N×3콜 | 레코드마다 다른 데이터라 캐시 불가 |
| **list-engagements 본문 inline** | engagement마다 email/memo 본문 fetch | 〃 |

→ 캐시 대상 아님. **"매번 다 가져올 필요 있나?"를 옵션화**(설계 수정)해야 함. 본 PRD 범위 밖, 부록 참조.

---

## 3. PRD — 캐시 솔루션

### 목표
반복되는 동일 조회(스키마·userMap·teamMap·roomId·definition)를 **토큰별 TTL 캐시**로 묶어, 버스트 시 중복 API 콜을 제거한다.

### 비목표 (이번 범위 아님)
- N+1(batch-read 연관, engagements 본문) — 설계 옵션화로 별도 처리 (부록)
- 전역(인스턴스 간) 공유 캐시 — 서버리스라 불가. per-instance로 충분.

### 설계 — `src/cache.ts` (per-token + TTL 모듈 캐시)

```ts
type Entry = { value: unknown; expires: number };
const store = new Map<string, Entry>();

/** 토큰별 TTL 캐시. cold/만료 시 그냥 재조회 → stateless 안전. */
export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;   // warm hit
  const value = await fetcher();
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}
```

래퍼 (토큰 지문은 `telemetry.fingerprint` 재사용):
```ts
const fp = fingerprint(token);
const schema  = await cached(`${fp}:field:${type}`, TTL.schema, () => client.get(`/v2/field/${type}`));
const userMap = await cached(`${fp}:users`,         TTL.map,    () => fetchUserMap(client));
const teamMap = await cached(`${fp}:teams`,         TTL.map,    () => fetchTeamMap(client));
const roomId  = await cached(`${fp}:room`,          TTL.room,   () => getRoomId(client));
const defs    = await cached(`${fp}:defs`,          TTL.schema, () => getDefinitions(client));
```

### 적용 대상 + TTL

| 대상 | 적용 위치 | TTL |
|------|----------|-----|
| 필드 스키마 | `resolveProperties`, `resolveFilterIds`, `getDefaultProperties` | 5분 |
| userMap / teamMap | `fetchUserMap`/`fetchTeamMap` 호출부 | 5분 |
| roomId | `get-link` | 30분 |
| definition 목록 | Task #3 / list-objects | 5분 |

### 안전장치 (필수)
1. **토큰별 분리** — 키에 토큰 지문 포함. 안 하면 워크스페이스 데이터가 섞임(다른 고객에게 노출). **절대 위반 금지.**
2. **TTL** — 서버리스라 무효화 불가 → 시간만료로 신선도. 필드/유저 추가가 최대 5분 지연 반영(허용 범위).
3. **stateless 유지** — 캐시는 최적화일 뿐. cold start나 만료 시 재조회로 정상 동작. 정확성은 캐시에 의존하지 않음.
4. **읽기 전용 취급** — 캐시된 값을 호출부가 **변형(mutate)하면 안 됨**(공유 객체 오염). 스키마는 새 Map으로 복사해 쓰고 원본 미변형. (주의: `list-properties`의 `injectHints`는 스키마를 변형하므로 캐시 미사용 또는 복사 후 사용.)

### 구현 단계
1. `src/cache.ts` — `cached()` + TTL 상수
2. 스키마 캐시: `resolveProperties`/`resolveFilterIds`/`getDefaultProperties`의 `/v2/field/{type}` 조회를 `cached`로 래핑 (토큰 필요 → 호출부에서 fp 전달)
3. userMap/teamMap 캐시: `fetchUserMap`/`fetchTeamMap` 호출부 래핑
4. roomId 캐시: `get-link`
5. (Task #3 시) definition 캐시

### 리스크 / 한계
- **베타 저트래픽 → warm 재사용 듬성듬성** → cross-call 히트율은 **버스트 시 주로** 발생. 단, rate-limit/지연이 아픈 게 정확히 버스트라 실질 효과 있음 (스키마 5콜→1콜 등).
- **staleness** — 5분 내 스키마/유저 변경 미반영. 허용 가능. 문제 시 TTL 단축.
- **메모리** — per-token 소량. 베타 규모 무시 가능. 필요 시 상한(LRU) 추가.

### 완료 조건 (AC)
- 같은 토큰으로 동일 objectType에 연속 create/search 시 `/v2/field/{type}` 호출이 **1회로** 수렴 (TTL 내)
- get-link 연속 호출 시 `/v2/user/me`가 **1회로** 수렴 (TTL 내)
- 서로 다른 토큰은 **절대 캐시 공유 안 함** (검증 필수)
- 캐시 미스/만료 시에도 결과 정상

---

## 부록 — 캐시 외 권고 (N+1, 설계로)

캐시로 못 푸는 N+1은 **옵션화**로 별도 개선 권고 (본 PRD 범위 밖, 임팩트는 더 큼):

| 대상 | 현재 | 제안 |
|------|------|------|
| `batch-read` 연관카운트 | `_associations`를 항상 자동 조회(N×3콜) | **옵션 파라미터**로 — 기본 off, 필요 시만 |
| `list-engagements` 본문 | email/memo 본문 항상 inline(N콜) | **옵션**으로 — 제목만 vs 본문까지 |

> 우선순위상 batch-read 연관 옵션화가 **단일 최대 절감**(텔레메트리 최장 지연 도구). 캐시 작업과 독립적으로 진행 가능.
