#!/usr/bin/env node
/**
 * Properties 변환 레이어 검증 스크립트
 *
 * resolveProperties()의 타입 매핑, user 이름 해석,
 * top-level 파라미터 분리, search propertyName 변환을 실서버에서 검증.
 *
 * 사용법:
 *   npm run dev
 *   node scripts/test-properties.mjs
 *
 * 환경변수:
 *   SALESMAP_TOKEN  (선택) 기본: 테스트용 토큰
 *   MCP_URL         (선택) 기본: http://localhost:3000/api/mcp
 */

const SALESMAP_TOKEN = process.env.SALESMAP_TOKEN || "869a924b-61a9-4b06-a77f-5a3f7900f3fe";
const MCP_URL = process.env.MCP_URL || "http://localhost:3000/api/mcp";

// ── MCP 호출 헬퍼 ─────────────────────────────────────
let sessionId = null;

async function mcpPost(method, params) {
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
  sessionId = newSession;

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
  return data;
}

async function initialize() {
  await mcpPost("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test-properties", version: "1.0" },
  });
  await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SALESMAP_TOKEN}`,
      "Mcp-Session-Id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
}

async function callTool(name, args) {
  // Each tool call needs a fresh session (stateless server)
  sessionId = null;
  await initialize();
  const res = await mcpPost("tools/call", { name, arguments: args });
  if (res.error) return { error: res.error };
  const content = res.result?.content?.[0]?.text;
  const isError = res.result?.isError;
  try {
    return { data: JSON.parse(content), isError };
  } catch {
    return { data: content, isError };
  }
}

// ── 테스트 러너 ──────────────────────────────────────
const results = [];
let createdIds = []; // cleanup 용

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log(`  ✅ ${name}`);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// ── 테스트 케이스 ────────────────────────────────────

async function runTests() {
  console.log("\n📋 Properties 변환 레이어 검증\n");

  // ─── 0. 스키마 조회 (list-properties) ───────────────
  console.log("── 0. 기본 동작 확인 ──");

  await test("list-properties 호출", async () => {
    const { data } = await callTool("salesmap-list-properties", { objectType: "people" });
    assert(data.fieldList, "fieldList가 없음");
    assert(Array.isArray(data.fieldList), "fieldList가 배열이 아님");
    // 필드 타입 확인
    const types = new Set(data.fieldList.map(f => f.type));
    console.log(`    필드 타입: ${[...types].join(", ")}`);
  });

  // ─── 1. 기본 타입 매핑 (people create) ──────────────
  console.log("\n── 1. 기본 타입: people 생성 ──");

  await test("string 필드 (properties 사용)", async () => {
    const { data, isError } = await callTool("salesmap-create-object", {
      objectType: "people",
      name: "속성변환테스트",
      properties: { "이메일": `prop-test-${Date.now()}@verify.com` },
    });
    assert(!isError, `에러: ${JSON.stringify(data)}`);
    const created = data.id ? data : (data.people || data.deal || data.lead || data.organization || {});
    const id = created.id || (Array.isArray(created) ? created[0]?.id : undefined);
    if (id) createdIds.push({ type: "people", id });
    console.log(`    생성됨: ${id}`);
  });

  // ─── 2. 검색 (propertyName) ────────────────────────
  console.log("\n── 2. search: propertyName → fieldName 변환 ──");

  await test("propertyName으로 검색", async () => {
    const { data, isError } = await callTool("salesmap-search-objects", {
      targetType: "people",
      filterGroupList: [{
        filters: [{ propertyName: "이름", operator: "CONTAINS", value: "속성변환테스트" }],
      }],
    });
    assert(!isError, `에러: ${JSON.stringify(data)}`);
    const count = data.people?.length ?? data.objectList?.length ?? 0;
    console.log(`    검색 결과: ${count}건`);
  });

  await test("관계 필드 UUID 검증 (propertyName)", async () => {
    const { data, isError } = await callTool("salesmap-search-objects", {
      targetType: "people",
      filterGroupList: [{
        filters: [{ propertyName: "담당자", operator: "EQ", value: "not-a-uuid" }],
      }],
    });
    assert(isError, "UUID가 아닌 값인데 에러가 안 남");
    assert(JSON.stringify(data).includes("UUID"), "UUID 관련 에러 메시지 없음");
    console.log(`    pre-validation 작동 확인`);
  });

  // ─── 3. user 이름 해석 ─────────────────────────────
  console.log("\n── 3. user 이름 자동 해석 ──");

  // 먼저 user 목록에서 이름 하나 가져오기
  let testUserName = null;
  let testUserId = null;
  await test("list-users로 테스트 사용자 확인", async () => {
    const { data } = await callTool("salesmap-list-users", {});
    assert(data.userList?.length > 0, "사용자 없음");
    testUserName = data.userList[0].name;
    testUserId = data.userList[0].id;
    console.log(`    테스트 사용자: "${testUserName}" (${testUserId})`);
  });

  if (testUserName) {
    await test("이름으로 담당자 설정 (create)", async () => {
      const { data, isError } = await callTool("salesmap-create-object", {
        objectType: "people",
        name: "이름해석테스트",
        properties: { "담당자": testUserName },
      });
      assert(!isError, `에러: ${JSON.stringify(data)}`);
      const id = data.id || data.people?.[0]?.id;
      if (id) createdIds.push({ type: "people", id });
      console.log(`    생성됨: ${id}`);

      // read-back으로 담당자 확인
      if (id) {
        const { data: record } = await callTool("salesmap-read-object", {
          objectType: "people", id, properties: ["담당자"],
        });
        const owner = record["담당자"];
        console.log(`    담당자 확인: ${JSON.stringify(owner)}`);
        assert(owner, "담당자 필드가 비어있음");
        // 응답은 { id, name } 객체
        if (typeof owner === "object") {
          assert(owner.id === testUserId, `담당자 ID 불일치: ${owner.id} ≠ ${testUserId}`);
        }
      }
    });

    await test("존재하지 않는 사용자 이름 에러", async () => {
      const { data, isError } = await callTool("salesmap-create-object", {
        objectType: "people",
        name: "에러테스트",
        properties: { "담당자": "존재하지않는사람12345" },
      });
      assert(isError, "에러가 나야 하는데 성공함");
      assert(JSON.stringify(data).includes("찾을 수 없습니다"), "사용자 못찾음 에러 없음");
      console.log(`    에러 확인: ${JSON.stringify(data).slice(0, 100)}`);
    });

    await test("UUID로 담당자 설정 (기존 방식 호환)", async () => {
      const { data, isError } = await callTool("salesmap-create-object", {
        objectType: "people",
        name: "UUID담당자테스트",
        properties: { "담당자": testUserId },
      });
      assert(!isError, `에러: ${JSON.stringify(data)}`);
      const id = data.id || data.people?.[0]?.id;
      if (id) createdIds.push({ type: "people", id });
      console.log(`    UUID 직접 전달 성공: ${id}`);
    });
  }

  // ─── 4. 에러 케이스 ────────────────────────────────
  console.log("\n── 4. 에러 케이스 ──");

  await test("존재하지 않는 필드명", async () => {
    const { data, isError } = await callTool("salesmap-create-object", {
      objectType: "people",
      name: "에러테스트2",
      properties: { "완전없는필드XYZ": "값" },
    });
    assert(isError, "에러가 나야 함");
    assert(JSON.stringify(data).includes("존재하지 않는 필드"), "필드 없음 에러 없음");
    console.log(`    에러 확인`);
  });

  await test("deal 생성 — pipelineId 없이 (pre-validation)", async () => {
    const { data, isError } = await callTool("salesmap-create-object", {
      objectType: "deal",
      name: "파이프라인누락테스트",
      peopleId: "00000000-0000-0000-0000-000000000001",
    });
    assert(isError, "에러가 나야 함");
    assert(JSON.stringify(data).includes("pipelineId"), "pipelineId 에러 없음");
    console.log(`    pre-validation 작동 확인`);
  });

  // ─── 5. deal 생성 (top-level + properties 분리) ────
  console.log("\n── 5. deal 생성: top-level + properties ──");

  // 파이프라인 ID 가져오기
  let pipelineId = null;
  let stageId = null;
  let testPeopleId = null;

  await test("파이프라인 조회", async () => {
    const { data } = await callTool("salesmap-get-pipelines", { entityType: "deal" });
    assert(data.pipelineList?.length > 0, "파이프라인 없음");
    pipelineId = data.pipelineList[0].id;
    stageId = data.pipelineList[0].pipelineStageList[0].id;
    console.log(`    파이프라인: ${pipelineId}, 스테이지: ${stageId}`);
  });

  // people 하나 검색
  await test("테스트 고객 검색", async () => {
    const { data } = await callTool("salesmap-search-objects", {
      targetType: "people",
      filterGroupList: [{ filters: [{ propertyName: "이름", operator: "EXISTS" }] }],
    });
    const list = data.people ?? data.objectList ?? [];
    assert(list.length > 0, "고객 없음");
    testPeopleId = list[0].id;
    console.log(`    테스트 고객: ${testPeopleId}`);
  });

  if (pipelineId && stageId && testPeopleId) {
    await test("deal 생성 (price top-level + properties)", async () => {
      const { data, isError } = await callTool("salesmap-create-object", {
        objectType: "deal",
        name: "속성변환딜테스트",
        price: 1000000,
        pipelineId,
        pipelineStageId: stageId,
        status: "In progress",
        peopleId: testPeopleId,
        properties: testUserName ? { "담당자": testUserName } : undefined,
      });
      assert(!isError, `에러: ${JSON.stringify(data)}`);
      const dealCreated = data.id ? data : (data.deal || {});
      const id = dealCreated.id || (Array.isArray(dealCreated) ? dealCreated[0]?.id : undefined);
      if (id) createdIds.push({ type: "deal", id });
      console.log(`    딜 생성 성공: ${id}`);

      // read-back
      if (id) {
        const { data: record } = await callTool("salesmap-read-object", {
          objectType: "deal", id,
        });
        console.log(`    금액: ${record["금액"]}, 담당자: ${JSON.stringify(record["담당자"])}`);
      }
    });
  }

  // ─── 6. 읽기전용 필드 ──────────────────────────────
  console.log("\n── 6. 읽기전용 필드 차단 ──");

  // people의 formula 필드 있는지 확인
  await test("읽기전용 타입 필드 차단", async () => {
    // 딜 개수 같은 건 formula일 수 있음 — 스키마에서 확인
    const { data: schema } = await callTool("salesmap-list-properties", { objectType: "people" });
    const formulaField = schema.fieldList?.find(f => f.type === "formula");
    if (!formulaField) {
      console.log(`    formula 필드 없음 — 스킵`);
      return;
    }
    const { data, isError } = await callTool("salesmap-create-object", {
      objectType: "people",
      name: "읽기전용테스트",
      properties: { [formulaField.name]: "값" },
    });
    assert(isError, "읽기전용 필드인데 에러 안 남");
    console.log(`    읽기전용 차단 확인: ${formulaField.name} (${formulaField.type})`);
  });

  // ─── 7. update (properties) ────────────────────────
  console.log("\n── 7. update: properties 사용 ──");

  if (createdIds.length > 0 && createdIds[0].type === "people") {
    const targetId = createdIds[0].id;
    await test("people update with properties", async () => {
      const { data, isError } = await callTool("salesmap-update-object", {
        objectType: "people",
        id: targetId,
        properties: { "이메일": `updated-${Date.now()}@verify.com` },
      });
      assert(!isError, `에러: ${JSON.stringify(data)}`);
      console.log(`    업데이트 성공`);

      // read-back
      const { data: record } = await callTool("salesmap-read-object", {
        objectType: "people", id: targetId, properties: ["이메일"],
      });
      console.log(`    이메일 확인: ${record["이메일"]}`);
    });
  }

  // ─── 결과 요약 ─────────────────────────────────────
  console.log("\n" + "═".repeat(50));
  const pass = results.filter(r => r.status === "PASS").length;
  const fail = results.filter(r => r.status === "FAIL").length;
  console.log(`결과: ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL`);

  if (fail > 0) {
    console.log("\n실패 항목:");
    for (const r of results.filter(r => r.status === "FAIL")) {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    }
  }

  // ─── 정리 (생성된 테스트 데이터 삭제) ──────────────
  if (createdIds.length > 0) {
    console.log(`\n🧹 테스트 데이터 정리 (${createdIds.length}건)...`);
    for (const { type, id } of createdIds) {
      if (type === "deal") {
        // deal은 delete-object 사용 가능
        await callTool("salesmap-delete-object", { objectType: type, id, confirmed: true });
        console.log(`  삭제: ${type}/${id}`);
      } else {
        console.log(`  건너뜀 (삭제 미지원): ${type}/${id}`);
      }
    }
  }

  console.log("\n완료.\n");
  process.exit(fail > 0 ? 1 : 0);
}

runTests().catch((e) => {
  console.error("치명적 에러:", e);
  process.exit(1);
});
