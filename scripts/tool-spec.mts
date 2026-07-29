#!/usr/bin/env npx tsx
/**
 * 도구 명세를 코드에서 뽑아 docs/tool-spec.md로 생성한다.
 *
 *   npx tsx scripts/tool-spec.mts          docs/tool-spec.md 갱신
 *   npx tsx scripts/tool-spec.mts --check   갱신 필요 여부만 확인 (CI용)
 *
 * 도구를 추가·변경하면 이걸 다시 돌린다. 손으로 고치지 말 것 — 생성물이다.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { z } from "zod";
import { registerFieldTools } from "../src/tools/field";
import { registerSearchTools } from "../src/tools/search";
import { registerGenericTools } from "../src/tools/generic";
import { registerExtrasTools } from "../src/tools/extras";

type Param = { name: string; type: string; required: boolean; desc: string };
type Tool = { name: string; group: string; desc: string; params: Param[]; annotations: Record<string, unknown> };

const tools: Tool[] = [];
let group = "";
const server = {
  tool(name: string, desc: string, schema: Record<string, z.ZodTypeAny>, annotations: Record<string, unknown>) {
    tools.push({ name, group, desc, annotations: annotations ?? {}, params: paramsOf(schema) });
  },
} as never;

/** zod 스키마 → 사람이 읽는 타입 이름. 래퍼(optional/default)를 벗겨가며 안쪽을 본다. */
function typeName(s: z.ZodTypeAny): string {
  const d = s._def as Record<string, unknown>;
  const t = d.typeName as string;
  switch (t) {
    case "ZodOptional": case "ZodDefault": case "ZodNullable":
      return typeName((d.innerType ?? d.type) as z.ZodTypeAny);
    case "ZodString": return "string";
    case "ZodNumber": return "number";
    case "ZodBoolean": return "boolean";
    case "ZodEnum": return `enum(${(d.values as string[]).join("|")})`;
    case "ZodArray": return `${typeName(d.type as z.ZodTypeAny)}[]`;
    case "ZodRecord": return `record<${typeName(d.valueType as z.ZodTypeAny)}>`;
    case "ZodUnion": return (d.options as z.ZodTypeAny[]).map(typeName).join("|");
    case "ZodObject": {
      const shape = (d.shape as () => Record<string, z.ZodTypeAny>)();
      return `{${Object.keys(shape).join(", ")}}`;
    }
    default: return t?.replace(/^Zod/, "").toLowerCase() ?? "unknown";
  }
}

function paramsOf(schema: Record<string, z.ZodTypeAny>): Param[] {
  if (!schema) return [];
  return Object.entries(schema).map(([name, s]) => ({
    name,
    type: typeName(s),
    required: !s.isOptional(),
    desc: (s.description ?? "").replace(/\n/g, " ").trim(),
  }));
}

group = "field";   registerFieldTools(server);
group = "search";  registerSearchTools(server);
group = "generic"; registerGenericTools(server);
group = "extras";  registerExtrasTools(server);

// ── 중첩 오브젝트 파라미터의 안쪽 필드까지 펼쳐 보여준다 ──
function nestedOf(schema: Record<string, z.ZodTypeAny>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, s] of Object.entries(schema ?? {})) {
    let cur = s as z.ZodTypeAny;
    for (;;) {
      const d = cur._def as Record<string, unknown>;
      const t = d.typeName as string;
      if (t === "ZodOptional" || t === "ZodDefault" || t === "ZodNullable") { cur = (d.innerType ?? d.type) as z.ZodTypeAny; continue; }
      if (t === "ZodArray") { cur = d.type as z.ZodTypeAny; continue; }
      break;
    }
    const d = cur._def as Record<string, unknown>;
    if (d.typeName === "ZodObject") {
      const shape = (d.shape as () => Record<string, z.ZodTypeAny>)();
      out[name] = Object.entries(shape).map(([k, v]) => `${k}${v.isOptional() ? "?" : ""}: ${typeName(v)}`);
    }
  }
  return out;
}

const schemas = new Map<string, Record<string, z.ZodTypeAny>>();
{
  let g = "";
  const capture = { tool(name: string, _d: string, schema: Record<string, z.ZodTypeAny>) { schemas.set(name, schema); } } as never;
  g = ""; void g;
  registerFieldTools(capture); registerSearchTools(capture);
  registerGenericTools(capture); registerExtrasTools(capture);
}

const mode = (a: Record<string, unknown>) =>
  a.readOnlyHint ? "읽기" : a.destructiveHint ? "삭제" : "쓰기";

const lines: string[] = [];
lines.push("# MCP 도구 명세");
lines.push("");
lines.push("> ⚠️ **생성물입니다. 직접 수정하지 마세요.**");
lines.push("> 도구를 추가·변경한 뒤 `npx tsx scripts/tool-spec.mts`로 다시 만드세요.");
lines.push("> 소스: `src/tools/{field,search,generic,extras}.ts`");
lines.push("");
lines.push(`총 **${tools.length}개** 도구.`);
lines.push("");

lines.push("## 한눈에");
lines.push("");
lines.push("| 도구 | 성격 | 파라미터 |");
lines.push("|---|:---:|---|");
for (const t of tools) {
  const ps = t.params.map(p => `\`${p.name}\`${p.required ? "" : "?"}`).join(" ");
  lines.push(`| \`${t.name}\` | ${mode(t.annotations)} | ${ps || "—"} |`);
}
lines.push("");

lines.push("---");
lines.push("");
lines.push("## 상세");
for (const t of tools) {
  lines.push("");
  lines.push(`### \`${t.name}\``);
  lines.push("");
  lines.push(`- 성격: **${mode(t.annotations)}** · 정의: \`src/tools/${t.group}.ts\``);
  lines.push("");
  lines.push("```");
  for (const l of t.desc.split("\n")) lines.push(l);
  lines.push("```");
  lines.push("");
  if (t.params.length === 0) {
    lines.push("파라미터 없음.");
    continue;
  }
  lines.push("| 파라미터 | 타입 | 필수 | 설명 |");
  lines.push("|---|---|:---:|---|");
  for (const p of t.params) {
    lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.required ? "✅" : "" } | ${p.desc.replace(/\|/g, "\\|")} |`);
  }
  const nested = nestedOf(schemas.get(t.name) ?? {});
  for (const [k, fields] of Object.entries(nested)) {
    lines.push("");
    lines.push(`\`${k}\` 항목 구조: ${fields.map(f => `\`${f}\``).join(", ")}`);
  }
}
lines.push("");

const out = lines.join("\n");
const path = "docs/tool-spec.md";
if (process.argv.includes("--check")) {
  const cur = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (cur !== out) { console.error(`❌ ${path}가 코드와 다릅니다. npx tsx scripts/tool-spec.mts 로 갱신하세요.`); process.exit(1); }
  console.log(`✅ ${path} 최신`);
} else {
  writeFileSync(path, out);
  console.log(`✅ ${path} 생성 — 도구 ${tools.length}개`);
}
