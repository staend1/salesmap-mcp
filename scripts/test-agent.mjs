#!/usr/bin/env node
/**
 * 멀티턴 에이전트 테스트 — 실제 사용자처럼 대화하며 tool 사용 패턴 관찰
 *
 * 사용법:
 *   npm run dev
 *   ANTHROPIC_API_KEY=sk-... node scripts/test-agent.mjs
 *
 * 환경변수:
 *   ANTHROPIC_API_KEY  (필수)
 *   SALESMAP_TOKEN     (선택) 기본: 테스트용 토큰
 *   MCP_URL            (선택) 기본: http://localhost:3000/api/mcp
 *   MODEL              (선택) 기본: claude-sonnet-4-20250514
 *   MAX_TURNS          (선택) 시나리오당 최대 턴 수 (기본: 8)
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SALESMAP_TOKEN = process.env.SALESMAP_TOKEN || "869a924b-61a9-4b06-a77f-5a3f7900f3fe";
const MCP_URL = process.env.MCP_URL || "http://localhost:3000/api/mcp";
const MODEL = process.env.MODEL || "claude-sonnet-4-20250514";
const MAX_TURNS = parseInt(process.env.MAX_TURNS || "8");

if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY 환경변수를 설정하세요.");
  process.exit(1);
}

// ── MCP 통신 ────────────────────────────────────────────

async function mcpPost(method, params) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SALESMAP_TOKEN}`,
    Accept: "application/json, text/event-stream",
  };

  const body = { jsonrpc: "2.0", method, id: crypto.randomUUID() };
  if (params) body.params = params;

  const res = await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`MCP ${method}: HTTP ${res.status}`);

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/event-stream")) {
    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
    if (!dataLine) throw new Error(`SSE 파싱 실패`);
    return JSON.parse(dataLine.slice(6));
  }
  return res.json();
}

async function getTools() {
  await mcpPost("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test-agent", version: "1.0" },
  });
  const res = await mcpPost("tools/list", {});
  return res.result.tools;
}

async function callMCPTool(name, args) {
  // 매 호출마다 새 세션 (stateless 서버)
  await mcpPost("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test-agent", version: "1.0" },
  });
  const res = await mcpPost("tools/call", { name, arguments: args });
  if (res.error) return { content: [{ type: "text", text: JSON.stringify({ error: res.error.message }) }], isError: true };
  return res.result;
}

function mcpToClaudeTools(mcpTools) {
  return mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

// ── Claude API ──────────────────────────────────────────

async function callClaude(tools, messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 4096, tools, messages }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── 페르소나 & 시나리오 ─────────────────────────────────

const SCENARIOS = [
  // 영업사원 페르소나
  {
    persona: "영업사원",
    name: "딜 현황 파악",
    prompt: "내 딜 현황 좀 알려줘",
  },
  {
    persona: "영업사원",
    name: "고객 검색",
    prompt: "김 대표님 연락처 좀 찾아줘",
  },
  {
    persona: "영업사원",
    name: "미팅 메모 작성",
    prompt: "방금 미팅한 내용 메모 남기고 싶어. 딜 ID는 019c8e79-ec35-7cc1-b9fe-cc64309c3486이야. 내용은 '2차 미팅 완료, 다음 주 견적 전달 예정'",
  },
  {
    persona: "영업사원",
    name: "견적 확인",
    prompt: "딜 019c8e79-ec35-7cc1-b9fe-cc64309c3486에 붙은 견적서 있어?",
  },

  // 매니저 페르소나
  {
    persona: "매니저",
    name: "팀 영업 현황",
    prompt: "우리 팀 영업 현황 어때?",
  },
  {
    persona: "매니저",
    name: "리드타임 분석",
    prompt: "딜 019c8e79-ec35-7cc1-b9fe-cc64309c3486 왜 이렇게 오래 걸려?",
  },
  {
    persona: "매니저",
    name: "파이프라인 분석",
    prompt: "딜 파이프라인 현황 분석해줘",
  },
  {
    persona: "매니저",
    name: "특정 단계 딜 조회",
    prompt: "제안서 보낸 딜들 뭐 있어?",
  },

  // 시나리오 v2 — 쓰기·연관·복합 선행조건·날짜 필터
  {
    persona: "영업사원",
    name: "담당자 변경",
    prompt: "딜 019c8e79-ec35-7cc1-b9fe-cc64309c3486 담당자를 최재원으로 바꿔줘",
  },
  {
    persona: "영업사원",
    name: "연관 레코드 탐색",
    prompt: "그립컴퍼니 딜에 연결된 고객이랑 회사 정보 알려줘",
  },
  {
    persona: "매니저",
    name: "신규 딜 생성",
    prompt: "새 딜 만들어줘. 고객은 김성수, 파이프라인은 new 딜 파이프라인, 단계는 미팅 일정 확정, 금액 500만원",
  },
  {
    persona: "매니저",
    name: "월간 매출 분석",
    prompt: "이번 달 성사된 딜 총 매출 얼마야?",
  },
];

// ── 에이전트 루프 ───────────────────────────────────────

async function runScenario(tools, scenario) {
  const trace = {
    persona: scenario.persona,
    name: scenario.name,
    prompt: scenario.prompt,
    turns: [],
    toolCalls: [],
    errors: [],
    finalAnswer: "",
    totalTokens: { input: 0, output: 0 },
  };

  const messages = [{ role: "user", content: scenario.prompt }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await callClaude(tools, messages);
    trace.totalTokens.input += response.usage?.input_tokens || 0;
    trace.totalTokens.output += response.usage?.output_tokens || 0;

    const toolUses = response.content.filter((c) => c.type === "tool_use");
    const textBlocks = response.content.filter((c) => c.type === "text");

    // 턴 기록
    trace.turns.push({
      turn: turn + 1,
      toolCalls: toolUses.map((t) => ({ name: t.name, input: t.input })),
      text: textBlocks.map((t) => t.text).join(" "),
    });

    // tool 호출 기록
    for (const t of toolUses) {
      trace.toolCalls.push({ turn: turn + 1, name: t.name, input: t.input });
    }

    // 대화 종료
    if (response.stop_reason === "end_turn") {
      trace.finalAnswer = textBlocks.map((t) => t.text).join(" ");
      break;
    }

    // tool 실행 & 결과 반환
    if (toolUses.length > 0) {
      messages.push({ role: "assistant", content: response.content });

      const toolResults = [];
      for (const toolUse of toolUses) {
        try {
          const result = await callMCPTool(toolUse.name, toolUse.input);
          const text = result.content?.map((c) => c.text).join("") || "{}";

          // 에러 체크
          if (result.isError) {
            trace.errors.push({ turn: turn + 1, tool: toolUse.name, error: text });
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: text.slice(0, 10000), // 응답 크기 제한
          });
        } catch (e) {
          trace.errors.push({ turn: turn + 1, tool: toolUse.name, error: e.message });
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: e.message }),
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  return trace;
}

// ── 분석 ────────────────────────────────────────────────

function analyzeTrace(trace) {
  const issues = [];
  const toolNames = trace.toolCalls.map((t) => t.name);

  // 1. describe_object 선행 체크
  const needsSchema = ["salesmap-search-objects", "salesmap-create-object", "salesmap-update-object"];
  const firstSchemaNeeded = toolNames.findIndex((n) => needsSchema.includes(n));
  const firstDescribe = toolNames.indexOf("salesmap-list-properties");

  if (firstSchemaNeeded !== -1 && (firstDescribe === -1 || firstDescribe > firstSchemaNeeded)) {
    issues.push({
      type: "MISSING_PREREQUISITE",
      detail: `${toolNames[firstSchemaNeeded]}를 describe_object 없이 호출`,
    });
  }

  // 2. N+1 문제 체크
  const getRecordCalls = toolNames.filter((n) => n === "salesmap-read-object");
  if (getRecordCalls.length >= 3) {
    const usedBatch = toolNames.includes("salesmap-batch-read-objects");
    if (!usedBatch) {
      issues.push({
        type: "N_PLUS_1",
        detail: `get_record ${getRecordCalls.length}회 개별 호출 (batch_get 미사용)`,
      });
    }
  }

  // 3. 과도한 tool 호출
  if (trace.toolCalls.length > 10) {
    issues.push({
      type: "EXCESSIVE_CALLS",
      detail: `총 ${trace.toolCalls.length}회 tool 호출`,
    });
  }

  // 4. 에러 후 자기 교정
  for (const err of trace.errors) {
    const laterCalls = trace.toolCalls.filter((t) => t.turn > err.turn);
    const recovered = laterCalls.some((t) => t.name === "salesmap-list-properties");
    if (!recovered && err.error.includes("[힌트]")) {
      issues.push({
        type: "NO_RECOVERY",
        detail: `${err.tool} 에러 후 describe_object 미호출`,
      });
    }
  }

  return issues;
}

// ── 메인 ────────────────────────────────────────────────

async function main() {
  console.log("MCP 서버에서 tool 정의 가져오는 중...");
  let tools;
  try {
    const mcpTools = await getTools();
    console.log(`  ${mcpTools.length}개 tool 발견`);
    tools = mcpToClaudeTools(mcpTools);
  } catch (e) {
    console.error(`  MCP 연결 실패: ${e.message}`);
    process.exit(1);
  }

  // SCENARIO_RANGE=8,12 → index 8~11만 실행
  const range = process.env.SCENARIO_RANGE;
  const scenarios = range
    ? SCENARIOS.slice(...range.split(",").map(Number))
    : SCENARIOS;

  console.log(`\n${scenarios.length}개 시나리오 테스트 (model: ${MODEL}, max_turns: ${MAX_TURNS})\n`);
  console.log("=".repeat(70));

  const allResults = [];

  for (const scenario of scenarios) {
    console.log(`\n[${scenario.persona}] ${scenario.name}`);
    console.log(`  Q: "${scenario.prompt}"`);

    try {
      const trace = await runScenario(tools, scenario);
      const issues = analyzeTrace(trace);
      trace.issues = issues;
      allResults.push(trace);

      // tool 호출 시퀀스
      const callSeq = trace.toolCalls.map((t) => `T${t.turn}:${t.name.replace("salesmap-", "")}`);
      console.log(`  Tools: ${callSeq.join(" → ")}`);
      console.log(`  Turns: ${trace.turns.length}, Calls: ${trace.toolCalls.length}, Errors: ${trace.errors.length}`);
      console.log(`  Tokens: ${trace.totalTokens.input}in + ${trace.totalTokens.output}out`);

      if (issues.length > 0) {
        for (const issue of issues) {
          console.log(`  ⚠ [${issue.type}] ${issue.detail}`);
        }
      } else {
        console.log(`  OK`);
      }

      // 최종 답변 미리보기
      if (trace.finalAnswer) {
        console.log(`  A: "${trace.finalAnswer.slice(0, 120)}..."`);
      }
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
      allResults.push({ name: scenario.name, error: e.message });
    }
  }

  // 요약
  console.log("\n" + "=".repeat(70));
  console.log("\n## 종합 분석\n");

  const withIssues = allResults.filter((r) => r.issues?.length > 0);
  const clean = allResults.filter((r) => r.issues?.length === 0);
  console.log(`정상: ${clean.length}/${allResults.length}`);
  console.log(`이슈: ${withIssues.length}/${allResults.length}`);

  // 이슈 유형별 집계
  const issueTypes = {};
  for (const r of allResults) {
    for (const issue of r.issues || []) {
      issueTypes[issue.type] = (issueTypes[issue.type] || 0) + 1;
    }
  }
  if (Object.keys(issueTypes).length > 0) {
    console.log("\n이슈 유형:");
    for (const [type, count] of Object.entries(issueTypes)) {
      console.log(`  ${type}: ${count}건`);
    }
  }

  // 총 토큰
  const totalIn = allResults.reduce((s, r) => s + (r.totalTokens?.input || 0), 0);
  const totalOut = allResults.reduce((s, r) => s + (r.totalTokens?.output || 0), 0);
  console.log(`\n총 토큰: ${totalIn.toLocaleString()}in + ${totalOut.toLocaleString()}out`);

  // 결과 저장
  const { writeFile } = await import("fs/promises");
  const outPath = new URL("../test-agent-results.json", import.meta.url).pathname;
  await writeFile(outPath, JSON.stringify({ model: MODEL, timestamp: new Date().toISOString(), results: allResults }, null, 2));
  console.log(`\n상세 결과: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
