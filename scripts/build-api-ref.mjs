#!/usr/bin/env node
/**
 * api-ref 빌드 — 병합본 마크다운을 TS 상수로 감싼다. 그게 전부다.
 *
 *   docs/internal/api-ref-merged.md → src/tools/api-ref.ts
 *
 * 병합(원장 + 오버레이)은 이 스크립트가 하지 않는다.
 * 원장은 섹션 구조·문구가 통째로 바뀔 수 있어 기계적 앵커 매칭이 성립하지 않는다.
 * 병합은 LLM이 `.claude/skills/api-ref-sync` 절차에 따라 수행하고,
 * 그 결과를 api-ref-merged.md로 저장한 뒤 이 스크립트를 돌린다.
 */
import { readFileSync, writeFileSync } from "node:fs";

const MERGED = "docs/internal/api-ref-merged.md";
const OUT = "src/tools/api-ref.ts";

const md = readFileSync(MERGED, "utf8");

// JS 템플릿 리터럴 이스케이프 (역슬래시 → 백틱 → ${ 순서를 지킬 것)
const escaped = md
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

writeFileSync(OUT,
  `// AI용 세일즈맵 REST API 레퍼런스 — salesmap-get-api-ref 도구용\n` +
  `// 생성물입니다. 직접 수정하지 마세요.\n` +
  `//   원장:     docs/internal/api-ref-upstream.md  (그대로 보관 — 수정 금지)\n` +
  `//   오버레이: docs/internal/api-ref-overlay.md   (우리 지식 — 여기에 씀)\n` +
  `//   병합본:   ${MERGED}                          (LLM 병합 결과)\n` +
  `//   빌드:     node scripts/build-api-ref.mjs\n` +
  `export const SALESMAP_API_REF = \`${escaped}\`;\n`);

// 왕복 검증 — 생성물을 되돌렸을 때 원본과 정확히 같아야 한다
const back = escaped.replace(/\\\$\{/g, "${").replace(/\\`/g, "`").replace(/\\\\/g, "\\");
if (back !== md) {
  console.error("❌ 이스케이프 왕복 검증 실패 — 생성물이 원본과 다릅니다.");
  process.exit(1);
}

console.log(`${MERGED} (${md.split("\n").length}줄, ${md.length.toLocaleString()}자)`);
console.log(`→ ${OUT} 재생성 완료 · 왕복 검증 통과`);
