#!/usr/bin/env node
/**
 * LLM 행동 테스트 — MCP tool description이 Claude의 tool 선택을 올바르게 유도하는지 검증
 *
 * 사용법:
 *   npm run dev                          # 먼저 MCP 서버 시작
 *   ANTHROPIC_API_KEY=sk-... node scripts/test-llm-behavior.mjs
 *
 * 환경변수:
 *   ANTHROPIC_API_KEY  (필수) Anthropic API 키
 *   SALESMAP_TOKEN     (선택) SalesMap API 토큰 (기본: 테스트용 토큰)
 *   MCP_URL            (선택) MCP 서버 URL (기본: http://localhost:3000/api/mcp)
 *   MODEL              (선택) Claude 모델 (기본: claude-sonnet-4-20250514)
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SALESMAP_TOKEN = process.env.SALESMAP_TOKEN || "869a924b-61a9-4b06-a77f-5a3f7900f3fe";
const MCP_URL = process.env.MCP_URL || "http://localhost:3000/api/mcp";
const MODEL = process.env.MODEL || "claude-sonnet-4-20250514";

if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY 환경변수를 설정하세요.");
  process.exit(1);
}

// ── MCP 서버에서 tool 정의 가져오기 ─────────────────────

async function mcpPost(method, params, sessionId) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SALESMAP_TOKEN}`,
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const body = { jsonrpc: "2.0", method, id: crypto.randomUUID() };
  if (params) body.params = params;

  const res = await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`MCP ${method}: HTTP ${res.status}`);

  const newSession = res.headers.get("mcp-session-id") || sessionId;
  const ct = res.headers.get("content-type") || "";

  let data;
  if (ct.includes("text/event-stream")) {
    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
    if (!dataLine) throw new Error(`MCP ${method}: SSE 응답에 data 라인 없음`);
    data = JSON.parse(dataLine.slice(6));
  } else {
    data = await res.json();
  }

  return { data, sessionId: newSession };
}

async function getToolsFromMCP() {
  // Initialize
  const { sessionId } = await mcpPost("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test-runner", version: "1.0" },
  });

  // Initialized notification
  await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SALESMAP_TOKEN}`,
      "Mcp-Session-Id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });

  // tools/list
  const { data } = await mcpPost("tools/list", {}, sessionId);
  if (data.error) throw new Error(`tools/list 실패: ${JSON.stringify(data.error)}`);
  return data.result.tools;
}

function mcpToClaudeTools(mcpTools) {
  return mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

// ── Claude API 호출 ─────────────────────────────────────

async function callClaude(tools, prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      tools,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err}`);
  }

  return res.json();
}

// ── 테스트 시나리오 ─────────────────────────────────────

const TESTS = [
  // PREREQUISITE: describe_object가 첫 응답에 포함되어야 함
  {
    name: "영업 현황 조회",
    prompt: "우리 영업 사원들 영업 잘 하고 있나? 현황 분석해줘",
    type: "prerequisite",
    expected: "salesmap-list-properties",
  },
  {
    name: "딜 검색 (필터)",
    prompt: "진행 중인 딜 목록 보여줘",
    type: "prerequisite",
    expected: "salesmap-list-properties",
  },
  {
    name: "고객 검색",
    prompt: "김철수라는 고객 찾아줘",
    type: "prerequisite",
    expected: "salesmap-list-properties",
  },
  {
    name: "고객 등록",
    prompt: "새 고객 등록해줘. 이름은 테스트회사, 업종은 IT",
    type: "prerequisite",
    expected: "salesmap-list-properties",
  },

  // DIRECT: 특정 도구가 직접 호출되어야 함
  {
    name: "리드타임 분석",
    prompt: "딜 019c8e79-ec35-7cc1-b9fe-cc64309c3486의 리드타임 분석해줘",
    type: "direct",
    expected: "salesmap-get-lead-time",
  },
  {
    name: "레코드 URL",
    prompt: "딜 019c8e79-ec35-7cc1-b9fe-cc64309c3486의 CRM 링크 줘",
    type: "direct",
    expected: "salesmap-get-link",
  },
  {
    name: "파이프라인 조회",
    prompt: "딜 파이프라인 구조 보여줘",
    type: "direct",
    expected: "salesmap-get-pipelines",
  },
];

// ── 실행 ────────────────────────────────────────────────

async function runTest(tools, test) {
  const response = await callClaude(tools, test.prompt);
  const toolUses = response.content.filter((c) => c.type === "tool_use");
  const firstTools = toolUses.map((t) => t.name);
  const textBlocks = response.content.filter((c) => c.type === "text").map((c) => c.text);

  let pass;
  if (test.type === "prerequisite") {
    // describe_object가 첫 응답의 tool 호출에 포함되어야 함
    pass = firstTools.includes(test.expected);
  } else {
    // 첫 tool 호출이 expected와 일치
    pass = firstTools[0] === test.expected;
  }

  return {
    name: test.name,
    type: test.type,
    pass,
    expected: test.expected,
    actual: firstTools,
    text: textBlocks.join(" ").slice(0, 100),
    inputSummary: toolUses.map(
      (t) => `${t.name}(${JSON.stringify(t.input).slice(0, 80)})`
    ),
  };
}

async function main() {
  console.log("MCP 서버에서 tool 정의 가져오는 중...");

  let tools;
  try {
    const mcpTools = await getToolsFromMCP();
    console.log(`  ${mcpTools.length}개 tool 발견\n`);
    tools = mcpToClaudeTools(mcpTools);
  } catch (e) {
    console.error(`  MCP 연결 실패: ${e.message}`);
    console.error("  npm run dev 로 서버가 실행 중인지 확인하세요.\n");
    process.exit(1);
  }

  console.log(`${TESTS.length}개 시나리오 테스트 (model: ${MODEL})\n`);
  console.log("─".repeat(60));

  const results = [];
  for (const test of TESTS) {
    process.stdout.write(`  [${test.type}] ${test.name}... `);
    try {
      const result = await runTest(tools, test);
      results.push(result);

      if (result.pass) {
        console.log("PASS");
      } else {
        console.log(`FAIL (got: ${result.actual.join(", ") || "no tool call"})`);
      }
      console.log(`    calls: ${result.inputSummary.join(" -> ")}`);
      if (result.text) console.log(`    text: "${result.text}..."`);
      console.log();
    } catch (e) {
      console.log(`ERROR: ${e.message}\n`);
      results.push({ name: test.name, pass: false, error: e.message });
    }
  }

  // 결과 요약
  console.log("─".repeat(60));
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`\n결과: ${passed}/${results.length} 통과`);

  if (failed.length > 0) {
    console.log("\n실패 케이스:");
    for (const r of failed) {
      console.log(`  - ${r.name}: expected ${r.expected}, got ${r.actual?.join(", ") || r.error}`);
    }
  }

  // JSON 결과 저장
  const outPath = new URL("../test-results.json", import.meta.url).pathname;
  const { writeFile } = await import("fs/promises");
  await writeFile(
    outPath,
    JSON.stringify({ model: MODEL, timestamp: new Date().toISOString(), results }, null, 2)
  );
  console.log(`\n상세 결과: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
