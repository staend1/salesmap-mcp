#!/usr/bin/env node
/**
 * 텔레메트리 구글시트를 TSV로 내려받는다.
 *
 *   node scripts/telemetry-pull.mjs            전체 탭 → docs/_internal/telemetry-<탭>.tsv
 *   node scripts/telemetry-pull.mjs --list     탭 목록·행수만 확인
 *   node scripts/telemetry-pull.mjs tool_call  특정 탭만
 *
 * google-sheets MCP가 죽어도(uvx @latest가 종종 깨진다) 이건 동작한다 —
 * `~/.config/gcp/sheets-token.json`의 refresh_token으로 직접 액세스 토큰을 받는다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SHEET_ID = "1ytfczhPVIvhfXwc0xUH5iePqPkzuEGHJ0CnPREWudCc";  // 세일즈맵 MCP 로그
const TOKEN_PATH = join(homedir(), ".config/gcp/sheets-token.json");
const OUT_DIR = "docs/_internal";

async function accessToken() {
  const t = JSON.parse(readFileSync(TOKEN_PATH, "utf8"));
  // 저장된 access token은 만료돼 있을 확률이 높으니 항상 refresh 한다.
  const res = await fetch(t.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: t.client_id, client_secret: t.client_secret,
      refresh_token: t.refresh_token, grant_type: "refresh_token",
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`토큰 갱신 실패: ${JSON.stringify(j)}\n→ mcp-google-sheets를 한 번 실행해 재인증하세요.`);
  return j.access_token;
}

const api = async (tok, path) => {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`,
    { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text().then(s => s.slice(0, 200))}`);
  return r.json();
};

const tok = await accessToken();
const meta = await api(tok, "?fields=sheets.properties");
const tabs = meta.sheets.map(s => s.properties.title);

if (process.argv.includes("--list")) {
  for (const t of tabs) {
    const { values = [] } = await api(tok, `/values/${encodeURIComponent(t)}?majorDimension=ROWS`);
    console.log(`  ${t.padEnd(16)} ${values.length}행 × ${values[0]?.length ?? 0}열`);
  }
  process.exit(0);
}

const want = process.argv[2] ? tabs.filter(t => t === process.argv[2]) : tabs;
if (!want.length) { console.error(`탭 '${process.argv[2]}' 없음. 있는 탭: ${tabs.join(", ")}`); process.exit(1); }

mkdirSync(OUT_DIR, { recursive: true });
for (const tab of want) {
  const { values = [] } = await api(tok, `/values/${encodeURIComponent(tab)}?majorDimension=ROWS`);
  const width = Math.max(...values.map(r => r.length));
  // 셀 안의 탭·개행은 TSV를 깨뜨린다. 로그 파서가 한 행=한 줄을 전제하므로 여기서 눕힌다.
  const tsv = values
    .map(r => Array.from({ length: width }, (_, i) => String(r[i] ?? "").replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
  const path = `${OUT_DIR}/telemetry-${tab}.tsv`;
  writeFileSync(path, tsv);
  console.log(`✅ ${path} — ${values.length}행 × ${width}열`);
}
