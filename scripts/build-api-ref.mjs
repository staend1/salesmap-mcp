#!/usr/bin/env node
/**
 * api-ref 빌드 — 최신 병합본 마크다운을 TS 상수로 감싼다. 그게 전부다.
 *
 *   docs/internal/api-ref-merged-<날짜>.md  (가장 최신)  →  src/tools/api-ref.ts
 *
 * 병합(원장 + 오버레이)은 이 스크립트가 하지 않는다.
 * 원장은 섹션 구조·문구가 통째로 바뀔 수 있어 기계적 앵커 매칭이 성립하지 않는다.
 * 병합은 LLM이 `.claude/skills/api-ref-sync` 절차에 따라 수행하고,
 * 그 결과를 날짜 붙인 병합본으로 저장한 뒤 이 스크립트를 돌린다.
 *
 * 사용법:
 *   node scripts/build-api-ref.mjs                 최신 병합본 사용
 *   node scripts/build-api-ref.mjs 2026-07-28      특정 날짜 병합본 사용 (롤백용)
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const MERGED_DIR = "docs/internal";
const MERGED_RE = /^api-ref-merged-(\d{4}-\d{2}-\d{2})\.md$/;
const OUT = "src/tools/api-ref.ts";

const versions = readdirSync(MERGED_DIR)
  .map((f) => ({ file: f, date: f.match(MERGED_RE)?.[1] }))
  .filter((v) => v.date)
  .sort((a, b) => a.date.localeCompare(b.date));

if (versions.length === 0) {
  console.error(`❌ ${MERGED_DIR}에 병합본(api-ref-merged-YYYY-MM-DD.md)이 없습니다.`);
  process.exit(1);
}

const want = process.argv[2];
const picked = want ? versions.find((v) => v.date === want) : versions[versions.length - 1];
if (!picked) {
  console.error(`❌ ${want} 병합본이 없습니다. 사용 가능: ${versions.map((v) => v.date).join(", ")}`);
  process.exit(1);
}

const path = `${MERGED_DIR}/${picked.file}`;
const md = readFileSync(path, "utf8");

// JS 템플릿 리터럴 이스케이프 (역슬래시 → 백틱 → ${ 순서를 지킬 것)
const escaped = md
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

// 왕복 검증 — 되돌렸을 때 원본과 정확히 같아야 한다
const back = escaped.replace(/\\\$\{/g, "${").replace(/\\`/g, "`").replace(/\\\\/g, "\\");
if (back !== md) {
  console.error("❌ 이스케이프 왕복 검증 실패 — 생성물이 원본과 다릅니다.");
  process.exit(1);
}

writeFileSync(OUT,
  `// AI용 세일즈맵 REST API 레퍼런스 — salesmap-get-api-ref 도구용\n` +
  `// 생성물입니다. 직접 수정하지 마세요.\n` +
  `//   원장:     docs/salesmap-api-reference-${picked.date}.md  (그대로 보관 — 수정 금지)\n` +
  `//   오버레이: docs/internal/api-ref-overlay.md                (우리 지식 — 여기에 씀)\n` +
  `//   병합본:   ${path}\n` +
  `//   빌드:     node scripts/build-api-ref.mjs\n` +
  `export const SALESMAP_API_REF = \`${escaped}\`;\n`);

const others = versions.filter((v) => v !== picked).map((v) => v.date);
console.log(`병합본 ${picked.date} 사용 (${md.split("\n").length}줄, ${md.length.toLocaleString()}자)`);
if (others.length) console.log(`보관 중인 이전 버전: ${others.join(", ")}`);
console.log(`→ ${OUT} 재생성 완료 · 왕복 검증 통과`);
