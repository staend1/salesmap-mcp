#!/usr/bin/env node
/**
 * API 레거시 우회 목록 조회.
 *
 *   node scripts/quirks.mjs                 전체 목록
 *   node scripts/quirks.mjs <검색어>         id·요약·영향도구로 필터
 *
 * API 개선 소식이 오면 이걸로 **어디를 지워야 하는지** 먼저 확인한다.
 */
import { readFileSync } from "node:fs";

const src = readFileSync("src/api-quirks.ts", "utf8");

// TS를 실행하지 않고 매니페스트만 뽑는다 (빌드 의존성 없이 어디서나 실행되도록)
const block = src.match(/export const QUIRKS[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1];
if (!block) {
  console.error("❌ QUIRKS 매니페스트를 찾지 못했습니다. src/api-quirks.ts 구조를 확인하세요.");
  process.exit(1);
}

const quirks = [];
for (const m of block.matchAll(/\{([\s\S]*?)\n  \}/g)) {
  const body = m[1];
  const get = (k) => body.match(new RegExp(`${k}:\\s*"((?:[^"\\\\]|\\\\.)*)"`))?.[1]?.replace(/\\"/g, '"');
  const arr = (k) => {
    const raw = body.match(new RegExp(`${k}:\\s*\\[([^\\]]*)\\]`))?.[1] ?? "";
    return [...raw.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  };
  const id = get("id");
  if (id) quirks.push({ id, summary: get("summary"), evidence: get("evidence"),
    removeWhen: get("removeWhen"), location: get("location"), ledger: get("ledger"), affects: arr("affects") });
}

const q = (process.argv[2] ?? "").toLowerCase();
const hits = q
  ? quirks.filter((x) => [x.id, x.summary, x.removeWhen, ...x.affects].join(" ").toLowerCase().includes(q))
  : quirks;

console.log(`\nAPI 레거시 우회 ${hits.length}건${q ? ` (검색: "${q}")` : ` / 전체 ${quirks.length}건`}\n`);

for (const x of hits) {
  console.log(`● ${x.id}${x.ledger ? `   [원장 ${x.ledger}]` : ""}`);
  console.log(`  ${x.summary}`);
  console.log(`  근거   ${x.evidence}`);
  console.log(`  제거   ${x.removeWhen}`);
  console.log(`  위치   ${x.location}`);
  console.log(`  영향   ${x.affects.join(", ")}`);
  console.log();
}

// 도구별 역인덱스 — "이 도구를 건드릴 때 어떤 우회가 걸려 있나"
if (!q) {
  const byTool = new Map();
  for (const x of quirks) for (const t of x.affects) {
    byTool.set(t, [...(byTool.get(t) ?? []), x.id]);
  }
  console.log("─".repeat(72));
  console.log("도구별 (이 도구를 수정할 때 함께 볼 것)\n");
  for (const [tool, ids] of [...byTool].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${tool.padEnd(28)} ${ids.join(", ")}`);
  }
  console.log();
}
