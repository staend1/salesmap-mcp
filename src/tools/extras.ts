import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, errWithSchemaHint, compactRecord, resolveProperties, getRoomId } from "../client";
import { getClient } from "../types";
import { fingerprint, logFeedback } from "../telemetry";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;

const objectTypeEnum = z.enum(["people", "organization", "deal", "lead", "note", "custom-object"]);
const timelineObjectType = z.enum(["people", "organization", "deal", "lead"]);

// ── Changelog noise filter ────────────────────────────────────
const HISTORY_NOISE_FIELDS = new Set([
  "RecordId", "생성 날짜", "수정 날짜", "매출(억)", "링크드인", "프로필 사진",
  "완료 TODO", "미완료 TODO", "전체 TODO", "다음 TODO 날짜",
  "현재 진행중인 시퀀스 여부", "누적 시퀀스 등록수",
  "등록된 시퀀스 목록", "제출된 웹폼 목록",
  "종료까지 걸린 시간", "성사까지 걸린 시간", "실패까지 걸린 시간",
  "종료된 파이프라인 단계",
]);
const HISTORY_NOISE_PREFIXES = ["최근 "];
const HISTORY_NOISE_SUFFIXES = ["개수", " 수"];
const PIPELINE_NOISE_SUFFIXES = ["로 진입한 날짜", "에서 보낸 누적 시간", "에서 퇴장한 날짜"];

function isNoiseField(fieldName: string): boolean {
  if (HISTORY_NOISE_FIELDS.has(fieldName)) return true;
  if (HISTORY_NOISE_PREFIXES.some(p => fieldName.startsWith(p))) return true;
  if (HISTORY_NOISE_SUFFIXES.some(s => fieldName.endsWith(s))) return true;
  if (PIPELINE_NOISE_SUFFIXES.some(s => fieldName.endsWith(s))) return true;
  return false;
}

const quoteProductSchema = z.object({
  name: z.string().describe("상품 이름"),
  productId: z.string().optional().describe("상품 ID"),
  price: z.number().optional().describe("단가"),
  amount: z.number().optional().describe("수량"),
  paymentCount: z.number().optional().describe("결제 횟수 (구독)"),
  paymentStartAt: z.string().optional().describe("시작 결제일 (구독)"),
  fieldList: z.array(z.object({ name: z.string() }).passthrough()).optional(),
});

// ── salesmap-get-docs content ─────────────────────────────────
const SALESMAP_DOCS = `# 세일즈맵 MCP 도메인 지식

## 계산 유형 필드 (Formula)

### 개요
\`formula\` 파라미터에 수식을 입력하면 **계산 유형 필드**가 됩니다.
다른 필드의 값을 참조해 자동 계산 결과를 채웁니다.
\`type\`은 수식의 최종 출력 타입으로 지정해야 합니다.

**변수 참조 형식:** \`{{오브젝트명.필드명}}\`
예: \`{{딜.금액}}\`, \`{{고객.나이}}\`, \`{{회사.직원수}}\`

**제약:** \`formula\` 사용 시 \`options\`, \`showInCreateForm\`, \`required\`, \`preventDuplicates\` 설정 불가.

> ⚠️ \`date_comp\`는 두 날짜 차이를 **분(minute) 단위**로 반환합니다.
> 일 단위로 쓰려면 \`minute_to_day(date_comp(...))\` 로 감싸세요.

---

### 연산자

#### 산술 연산자 — 숫자 전용

| 연산자 | 설명 | 예시 |
|--------|------|------|
| \`+\` | 더하기 | \`1 + 1\`, \`{{상품.금액}} + 32\` |
| \`-\` | 빼기 | \`2 - 1\` |
| \`*\` | 곱하기 | \`2 * 3\` |
| \`/\` | 나누기 | \`6 / 3\` |

#### 비교 연산자 — 반환: boolean

| 연산자 | 설명 | 지원 타입 | 예시 |
|--------|------|-----------|------|
| \`<\` | 왼쪽이 더 작음 | 숫자 | \`3 < 10\` → true |
| \`>\` | 왼쪽이 더 큼 | 숫자 | \`10 > 3\` → true |
| \`<=\` | 작거나 같음 | 숫자 | \`10 <= 10\` → true |
| \`>=\` | 크거나 같음 | 숫자 | \`10 >= 13\` → false |
| \`==\` | 같음 | 숫자, 문자, 날짜 | \`{{딜.상태}} == "Won"\` |
| \`!=\` | 다름 | 숫자, 문자, 날짜 | \`123 != 321\` → true |

#### 논리 연산자 — 반환: boolean

| 연산자 | 설명 | 예시 |
|--------|------|------|
| \`||\` | OR — 하나라도 참이면 참 | \`3 > 2 || "22" == "33"\` → true |
| \`&&\` | AND — 둘 다 참이어야 참 | \`3 > 2 && "22" != "33"\` → true |

---

### 함수

#### 수치 연산

| 함수 | 시그니처 | 반환 | 설명 | 예시 |
|------|----------|------|------|------|
| \`min\` | \`min(숫자, 숫자)\` | 숫자 | 더 작은 값 | \`min(20, 10)\` = 10 |
| \`max\` | \`max(숫자, 숫자)\` | 숫자 | 더 큰 값 | \`max(20, 10)\` = 20 |
| \`abs\` | \`abs(숫자)\` | 숫자 | 절댓값 | \`abs(-20)\` = 20 |
| \`round_down\` | \`round_down(숫자1, 숫자2)\` | 숫자 | 숫자2 자리로 내림. 음수=정수 자리 | \`round_down(20.151, 2)\` = 20.15, \`round_down(1356.9, -2)\` = 1300 |
| \`round_up\` | \`round_up(숫자1, 숫자2)\` | 숫자 | 숫자2 자리로 올림. 음수=정수 자리 | \`round_up(20.5, 0)\` = 21, \`round_up(1356.9, -2)\` = 1400 |
| \`round\` | \`round(숫자1, 숫자2)\` | 숫자 | 숫자2 자리로 반올림. 음수=정수 자리 | \`round(20.151, 2)\` = 20.15 |

#### 문자열

| 함수 | 시그니처 | 반환 | 설명 | 예시 |
|------|----------|------|------|------|
| \`concat\` | \`concat(문자, 문자)\` | 문자 | 두 문자열 이어붙이기 | \`concat("안", "녕하세요")\` = "안녕하세요" |
| \`contains\` | \`contains(문자열, 문자열)\` | boolean | 포함 여부 확인 | \`contains("CRM 솔루션", "CRM")\` = true |
| \`length\` | \`length(문자열)\` | 숫자 | 문자 수 (공백 포함) | \`length({{회사.이름}})\` |
| \`lowercase\` | \`lowercase(문자열)\` | 문자 | 영문 소문자 변환 | \`lowercase("Salesmap")\` = "salesmap" |
| \`uppercase\` | \`uppercase(문자열)\` | 문자 | 영문 대문자 변환 | \`uppercase("Salesmap")\` = "SALESMAP" |
| \`to_string\` | \`to_string(숫자\|날짜\|날짜시간)\` | 문자 | 타입을 문자열로 변환 | \`to_string({{고객.최근 수정날짜}})\` = "2024-12-20 14:33" |
| \`sub_string\` | \`sub_string(문자열, 숫자1, 숫자2)\` | 문자 | 숫자1번째부터 숫자2 길이 추출 (0-indexed) | \`sub_string("가나다라", 1, 2)\` = "나다" |

#### 날짜/시간 생성·추출

| 함수 | 시그니처 | 반환 | 설명 | 예시 |
|------|----------|------|------|------|
| \`new_date\` | \`new_date(연도, 월, 일)\` | 날짜 | 날짜 생성 | \`new_date(2025, 1, 1)\` |
| \`new_datetime\` | \`new_datetime(연도, 월, 일, 시, 분)\` | 날짜시간 | 날짜+시간 생성 | \`new_datetime(2025, 1, 1, 9, 0)\` |
| \`year\` | \`year(날짜\|날짜시간)\` | 숫자 | 연도 추출 | \`year(new_date(2025, 1, 1))\` = 2025 |
| \`month\` | \`month(날짜\|날짜시간)\` | 숫자 | 월 추출 | \`month(new_date(2025, 1, 1))\` = 1 |
| \`day\` | \`day(날짜\|날짜시간)\` | 숫자 | 일 추출 | \`day(new_date(2025, 1, 1))\` = 1 |
| \`hour\` | \`hour(날짜시간)\` | 숫자 | 시 추출 | \`hour(new_datetime(2025,1,1,9,0))\` = 9 |
| \`minute\` | \`minute(날짜시간)\` | 숫자 | 분 추출 | \`minute(new_datetime(2025,1,1,9,0))\` = 0 |
| \`minute_to_hour\` | \`minute_to_hour(숫자)\` | 숫자 | 분 → 시간 | \`minute_to_hour(date_comp(...))\` |
| \`minute_to_day\` | \`minute_to_day(숫자)\` | 숫자 | 분 → 일 | \`minute_to_day(date_comp(...))\` |

#### 날짜 연산

| 함수 | 시그니처 | 반환 | 설명 | 예시 |
|------|----------|------|------|------|
| \`add_year\` | \`add_year(날짜, 숫자)\` | 날짜 | 연도 더하기 | \`add_year(new_date(2025,1,1), 10)\` = 2035-01-01 |
| \`sub_year\` | \`sub_year(날짜, 숫자)\` | 날짜 | 연도 빼기 | \`sub_year(new_date(2025,1,1), 10)\` = 2015-01-01 |
| \`add_month\` | \`add_month(날짜, 숫자)\` | 날짜 | 월 더하기 | \`add_month(new_date(2025,1,1), 10)\` = 2025-11-01 |
| \`sub_month\` | \`sub_month(날짜, 숫자)\` | 날짜 | 월 빼기 | \`sub_month({{딜.구독 종료일}}, 1)\` |
| \`add_day\` | \`add_day(날짜, 숫자)\` | 날짜 | 일 더하기 | \`add_day(new_date(2025,1,1), 10)\` = 2025-01-11 |
| \`sub_day\` | \`sub_day(날짜, 숫자)\` | 날짜 | 일 빼기 | \`sub_day(new_date(2025,1,1), 10)\` = 2024-12-22 |
| \`add_hour\` | \`add_hour(날짜시간, 숫자)\` | 날짜시간 | 시 더하기 | \`add_hour(new_datetime(2025,1,1,9,0), 5)\` = 13:00 |
| \`sub_hour\` | \`sub_hour(날짜시간, 숫자)\` | 날짜시간 | 시 빼기 | \`sub_hour(new_datetime(2025,1,1,9,0), 5)\` = 04:00 |
| \`add_min\` | \`add_min(날짜시간, 숫자)\` | 날짜시간 | 분 더하기 | \`add_min(new_datetime(2025,1,1,9,0), 5)\` = 09:05 |
| \`sub_min\` | \`sub_min(날짜시간, 숫자)\` | 날짜시간 | 분 빼기 | \`sub_min(new_datetime(2025,1,1,9,0), 5)\` = 08:55 |
| \`date_comp\` | \`date_comp(날짜\|날짜시간, 날짜\|날짜시간)\` | 숫자(분) | 두 날짜 차이 (분 단위 반환) | \`date_comp({{고객.고객생일}}, new_date(2025,10,25))\` |
| \`weekday\` | \`weekday(날짜\|날짜시간)\` | 숫자 | 요일 (일=0, 월=1, …, 토=6) | \`weekday({{고객.생성 일자}})\` |

#### 논리

| 함수 | 시그니처 | 반환 | 설명 | 예시 |
|------|----------|------|------|------|
| \`if\` | \`if(논리식, 결과1, 결과2)\` | 결과1 또는 결과2 | 조건 분기. 중첩 가능 | \`if({{고객.나이}} > 20, "미성년자", "성인")\` |
| \`is_null\` | \`is_null(변수)\` | boolean | 값 없으면 true | \`is_null({{고객.나이}})\` |

---

### 수식 예시

\`\`\`
// 딜 금액의 80%
{{딜.금액}} * 0.8

// 구독 만료 30일 전 날짜
sub_day({{딜.구독 종료일}}, 30)

// 나이대 분류 (중첩 if)
if({{회사.직원수}} == 20, "적정 규모", if({{회사.직원수}} > 20, "규모 초과", "규모 미달"))

// 두 날짜 차이를 일 단위로
minute_to_day(date_comp({{고객.가입일}}, new_date(2025, 10, 25)))

// Won 여부 확인
{{딜.상태}} == "Won"

// 이름에 "님" 붙이기
concat({{고객.이름}}, "님")
\`\`\`
`;

export function registerExtrasTools(server: McpServer) {
  // ── Lead Time ───────────────────────────────────────────
  const SUFFIXES = [
    { key: "enteredAt", suffix: "로 진입한 날짜" },
    { key: "durationSeconds", suffix: "에서 보낸 누적 시간" },
    { key: "exitedAt", suffix: "에서 퇴장한 날짜" },
  ] as const;

  server.tool(
    "salesmap-get-lead-time",
    "🎯 딜/리드의 파이프라인 스테이지별 체류 시간 분석.\n📦 파이프라인별 진입·퇴장 시각과 누적 체류 시간.",
    {
      objectType: z.enum(["deal", "lead"]).describe("딜 또는 리드"),
      objectId: z.string().describe("레코드 ID"),
    },
    READ,
    async ({ objectType, objectId }, extra) => {
      try {
        const client = getClient(extra);
        const path = `/v2/${objectType}/${objectId}`;
        const data = await client.getOne<Record<string, unknown>>(path, objectType);

        // Extract pipeline auto-fields (non-null only)
        const stageMap = new Map<string, Record<string, unknown>>();

        for (const [fieldName, value] of Object.entries(data)) {
          if (value === null) continue;
          for (const { key, suffix } of SUFFIXES) {
            if (!fieldName.endsWith(suffix)) continue;
            const stageKey = fieldName.slice(0, -suffix.length);
            if (!stageMap.has(stageKey)) stageMap.set(stageKey, {});
            stageMap.get(stageKey)![key] = value;
            break;
          }
        }

        // Group by pipeline — stageKey format: "StageName(PipelineName)"
        const pipelines = new Map<string, Array<{ stage: string; enteredAt?: unknown; durationSeconds?: unknown; exitedAt?: unknown }>>();

        for (const [stageKey, values] of stageMap) {
          const lastParen = stageKey.lastIndexOf("(");
          const pipeline = lastParen > 0 ? stageKey.slice(lastParen + 1, -1) : "unknown";
          const stage = lastParen > 0 ? stageKey.slice(0, lastParen) : stageKey;

          if (!pipelines.has(pipeline)) pipelines.set(pipeline, []);
          pipelines.get(pipeline)!.push({ stage, ...values });
        }

        // Sort by entry time
        for (const stages of pipelines.values()) {
          stages.sort((a, b) => {
            const ta = a.enteredAt ? String(a.enteredAt) : "";
            const tb = b.enteredAt ? String(b.enteredAt) : "";
            return ta.localeCompare(tb);
          });
        }

        return ok({
          id: data.id,
          name: data["이름"],
          currentStage: data["파이프라인 단계"],
          currentPipeline: data["파이프라인"],
          pipelines: Object.fromEntries(pipelines),
        });
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Link ─────────────────────────────────────────
  const URL_PATH_MAP: Record<string, string> = {
    people: "contact/people",
    organization: "organization",
    deal: "deal",
    lead: "lead",
    "custom-object": "custom-object",
    product: "product",
    quote: "quote",
  };

  server.tool(
    "salesmap-get-link",
    "🎯 레코드의 CRM 웹 URL 생성.",
    {
      objectType: z.enum(["people", "organization", "deal", "lead", "custom-object", "product", "quote"])
        .describe("오브젝트 타입"),
      objectId: z.string().describe("레코드 ID"),
    },
    READ,
    async ({ objectType, objectId }, extra) => {
      try {
        const client = getClient(extra);
        const roomId = await getRoomId(client);
        const path = URL_PATH_MAP[objectType];
        return ok({ url: `https://salesmap.kr/${roomId}/${path}/${objectId}` });
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Association ───────────────────────────────────────
  server.tool(
    "salesmap-list-associations",
    "🎯 레코드 간 연결 관계 조회 (primary+custom 병합).\n📦 ID 목록. 상세 조회는 salesmap-batch-read-objects.",
    {
      objectType: objectTypeEnum.describe("출발 오브젝트 타입"),
      objectId: z.string().describe("출발 오브젝트 ID"),
      toObjectType: objectTypeEnum.describe("도착 오브젝트 타입"),
    },
    READ,
    async ({ objectType, objectId, toObjectType }, extra) => {
      try {
        const client = getClient(extra);
        const apiType = (t: string) => t === "note" ? "memo" : t;
        const basePath = `/v2/object/${apiType(objectType)}/${objectId}/association/${apiType(toObjectType)}`;
        const [primary, custom] = await Promise.all([
          client.get(basePath + "/primary").catch(() => null),
          client.get(basePath + "/custom").catch(() => null),
        ]);

        // Primary returns associationIdList (string[]), custom returns associationItemList ({id,label}[])
        const primaryIds: string[] = (primary as Record<string, unknown>)?.associationIdList as string[] ?? [];
        const customItems: Array<{ id: string; label?: string }> =
          (custom as Record<string, unknown>)?.associationItemList as Array<{ id: string; label?: string }> ?? [];

        // Merge: normalize primary IDs to objects, deduplicate
        const seen = new Set<string>();
        const merged: Array<{ id: string; label?: string; source: string }> = [];
        for (const id of primaryIds) {
          if (id && !seen.has(id)) {
            seen.add(id);
            merged.push({ id, source: "primary" });
          }
        }
        for (const item of customItems) {
          if (item.id && !seen.has(item.id)) {
            seen.add(item.id);
            merged.push({ id: item.id, label: item.label, source: "custom" });
          }
        }

        return ok({ total: merged.length, records: merged });
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Note ────────────────────────────────────────
  server.tool(
    "salesmap-create-note",
    "🎯 레코드에 노트 추가.",
    {
      objectType: z.enum(["people", "organization", "deal", "lead", "custom-object"])
        .describe("대상 오브젝트 타입"),
      objectId: z.string().describe("대상 레코드 UUID"),
      note: z.string().describe("노트 내용"),
    },
    WRITE,
    async ({ objectType, objectId, note }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.post(`/v2/${objectType}/${objectId}`, { memo: note }));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Quote (get) ───────────────────────────────────────
  server.tool(
    "salesmap-get-quotes",
    "🎯 딜/리드에 연결된 견적서 목록 조회.",
    {
      objectType: z.enum(["deal", "lead"]).describe("딜 또는 리드"),
      objectId: z.string().describe("딜/리드 UUID"),
    },
    READ,
    async ({ objectType, objectId }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get(`/v2/${objectType}/${objectId}/quote`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Quote (create) ────────────────────────────────────
  server.tool(
    "salesmap-create-quote",
    "🎯 견적서 생성. dealId 또는 leadId 중 하나 필수.\n📋 salesmap-get-quotes로 기존 견적서 확인.",
    {
      name: z.string().describe("견적서 이름"),
      dealId: z.string().optional().describe("딜 ID"),
      leadId: z.string().optional().describe("리드 ID"),
      note: z.string().optional().describe("견적서 노트"),
      isMainQuote: z.boolean().optional().describe("메인 견적서 여부"),
      quoteProductList: z.array(quoteProductSchema).optional().describe("상품 목록"),
      properties: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
        .optional()
        .describe("견적서 커스텀 필드 key-value"),
    },
    WRITE,
    async ({ name, note, properties, ...rest }, extra) => {
      if (!rest.dealId && !rest.leadId) {
        return err("dealId 또는 leadId 중 하나는 필수입니다.");
      }

      try {
        const client = getClient(extra);
        const body: Record<string, unknown> = { name };
        if (note !== undefined) body.memo = note;
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }

        // Convert properties → fieldList
        if (properties && Object.keys(properties).length > 0) {
          const { fieldList, errors } = await resolveProperties(client, "quote", properties);
          if (errors.length > 0) return err(errors.join("\n"));
          if (fieldList.length > 0) body.fieldList = fieldList;
        }

        return ok(await client.post("/v2/quote", body));
      } catch (e: unknown) {
        return errWithSchemaHint((e as Error).message, "quote", undefined);
      }
    },
  );

  // ── Pipeline ──────────────────────────────────────────
  server.tool(
    "salesmap-get-pipelines",
    "🎯 파이프라인 목록과 각 단계(stage) ID 조회.",
    {
      objectType: z.enum(["deal", "lead"]).describe("딜 또는 리드"),
    },
    READ,
    async ({ objectType }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get(`/v2/${objectType}/pipeline`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Users ───────────────────────────────────────────
  server.tool(
    "salesmap-list-users",
    "🎯 CRM 사용자 목록 조회. 전체 사용자 확인이나 ID 직접 참조가 필요할 때 사용.",
    {
      after: z.string().optional().describe("페이지네이션 커서"),
    },
    READ,
    async ({ after }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (after) query.cursor = after;
        return ok(await client.get("/v2/user", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Teams ──────────────────────────────────────────
  server.tool(
    "salesmap-list-teams",
    "🎯 팀 목록 + 소속 멤버 조회. 전체 팀 구성 확인이 필요할 때 사용.",
    {
      after: z.string().optional().describe("페이지네이션 커서"),
    },
    READ,
    async ({ after }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (after) query.cursor = after;
        return ok(await client.get("/v2/team", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Current User ──────────────────────────────────────
  server.tool(
    "salesmap-get-user-details",
    "🎯 현재 API 토큰 소유자 정보 조회.",
    {},
    READ,
    async (_params, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get("/v2/user/me"));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Read Email (비활성화) ──────────────────────────────────
  // API가 이메일 본문을 반환하지 않아 실질 가치 없음 (api-mcp-readiness #10).
  // list-engagements가 subject를 이미 인라인.
  // API가 본문 제공 시 활성화 예정 — 타임라인에 본문 인라인은 비효율적이므로 별도 도구로 필요.
  // server.tool(
  //   "salesmap-read-email",
  //   "🎯 이메일 상세 조회 (제목·발신자·수신자·날짜 등 메타데이터).\n📦 본문 없음 — API 제한.",
  //   { emailId: z.string().describe("이메일 UUID") },
  //   READ,
  //   async ({ emailId }, extra) => {
  //     try {
  //       const client = getClient(extra);
  //       const data = await client.get<{ email: Record<string, unknown> }>(`/v2/email/${emailId}`);
  //       return ok(data.email);
  //     } catch (e: unknown) {
  //       return err((e as Error).message);
  //     }
  //   },
  // );

  // ── Read Note ───────────────────────────────────────────
  server.tool(
    "salesmap-read-note",
    "🎯 노트 상세 조회.",
    { noteId: z.string().describe("노트 UUID") },
    READ,
    async ({ noteId }, extra) => {
      try {
        const client = getClient(extra);
        const data = await client.get<{ memo: Record<string, unknown> }>(`/v2/memo/${noteId}`);
        return ok(data.memo);
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Changelog ───────────────────────────────────────────
  server.tool(
    "salesmap-list-changelog",
    "🎯 레코드의 필드 변경 이력 조회.\n📦 자동계산·시스템 필드는 자동 제거됨.",
    {
      objectType: timelineObjectType.describe("오브젝트 타입"),
      objectId: z.string().describe("레코드 UUID"),
      after: z.string().optional().describe("페이지네이션 커서"),
    },
    READ,
    async ({ objectType, objectId, after }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = { [`${objectType}Id`]: objectId };
        if (after) query.cursor = after;
        const data = await client.get<Record<string, unknown>>(`/v2/${objectType}/history`, query);
        const key = `${objectType}HistoryList`;
        const items = (data[key] as Array<Record<string, unknown>>) ?? [];
        const filtered = items.filter(item => {
          if (item.fieldValue === null) return false;
          const fn = item.fieldName as string;
          return fn ? !isNoiseField(fn) : true;
        });
        return ok({ [key]: filtered, nextCursor: data.nextCursor ?? null });
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Create Property ──────────────────────────────────────
  server.tool(
    "salesmap-create-property",
    "🎯 오브젝트에 커스텀 필드 생성.\n📋 salesmap-list-properties로 기존 필드 확인.",
    {
      objectType: z.enum(["people", "organization", "deal", "lead", "product", "quote", "quote-product", "todo", "custom-object"])
        .describe("오브젝트 타입. custom-object는 customObjectDefinitionName 또는 customObjectDefinitionId로 대상 커오 종류 지정 (기존 커오에 필드 추가만 가능)"),
      name: z.string().describe("필드 이름"),
      type: z.enum(["string", "number", "date", "dateTime", "boolean", "singleSelect", "multiSelect", "multiAttachment", "user", "multiUser"])
        .describe("필드 타입. 계산 유형 필드를 만들 때는 formula에 계산 결과의 타입을 지정"),
      customObjectDefinitionName: z.string().optional()
        .describe("custom-object에 필드 생성 시 대상 커오 종류 이름. salesmap-list-objects 참조 (ID 대신 사용 가능)"),
      customObjectDefinitionId: z.string().optional()
        .describe("custom-object에 필드 생성 시 대상 커오 종류 ID (salesmap-list-objects의 customObjectDefinitionId)"),
      description: z.string().optional().describe("필드 설명"),
      showInCreateForm: z.boolean().optional().describe("레코드 생성 모달에 표시 여부 (기본 false)"),
      required: z.boolean().optional().describe("GUI에서 필수 입력 여부 (기본 false). true여도 API/MCP에서는 제한 없음. true로 설정 시 showInCreateForm도 true 필요"),
      options: z.array(z.object({ value: z.string() })).optional()
        .describe("선택지 목록. singleSelect 1개 이상·multiSelect 2개 이상 필수"),
      preventDuplicates: z.boolean().optional()
        .describe("유니크 필드 기능. 사업자등록번호, 전화번호 등 키 역할 필드에 제한적으로 사용. type이 string/number일때만 가능"),
      formula: z.string().optional()
        .describe("formula에 수식을 입력하면 필드는 계산 유형 필드가 되며, type은 계산 결과의 타입을 지정해야 함. options·showInCreateForm·required·preventDuplicates 설정 불가. 자세한 내용은 salesmap-get-docs 호출하면 확인 가능"),
    },
    WRITE,
    async ({ objectType, name, type, ...rest }, extra) => {
      if (objectType === "custom-object" && !rest.customObjectDefinitionName && !rest.customObjectDefinitionId) {
        return err("custom-object에 필드를 생성하려면 customObjectDefinitionName 또는 customObjectDefinitionId가 필요합니다. salesmap-list-objects로 확인하세요.");
      }
      try {
        const client = getClient(extra);
        const body: Record<string, unknown> = { name, type };
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        return ok(await client.post(`/v2/field/${objectType}`, body));
      } catch (e: unknown) {
        const msg = (e as Error).message;
        if (msg.includes("이미 존재")) {
          return err(`${msg}\n[힌트] salesmap-list-properties로 기존 필드를 확인하세요.`);
        }
        if (objectType === "custom-object" && msg.includes("찾을 수 없")) {
          return err("커스텀 오브젝트 종류를 찾을 수 없습니다. salesmap-list-objects로 정확한 customObjectDefinitionName 또는 customObjectDefinitionId를 확인하세요.");
        }
        return err(msg);
      }
    },
  );

  // ── Docs ─────────────────────────────────────────────────
  server.tool(
    "salesmap-get-docs",
    "🎯 세일즈맵 MCP 도메인 지식 전체 조회.",
    {},
    READ,
    async (_params, _extra) => {
      return { content: [{ type: "text" as const, text: SALESMAP_DOCS }] };
    },
  );

  // ── Feedback ─────────────────────────────────────────────
  server.tool(
    "salesmap-report-feedback",
    "🎯 이 MCP의 문제·한계·기능 요청을 개발팀에 전달.\n🧭 필요한 도구가 없거나·도구가 부족하거나·한 작업에 연속 호출이 과도하거나·버그를 발견했을 때 사용.\n💡 작업을 막지 않음 — 전달 후 원래 작업을 계속하세요.",
    {
      category: z.enum(["bug", "missing-tool", "tool-limitation", "friction", "feature-request"])
        .describe("bug=기존 도구가 잘못 동작/에러. missing-tool=필요한 작업을 할 도구가 아예 없음. tool-limitation=도구는 있으나 기능이 부족해 목표 미달(toolName 명시). friction=되긴 하나 연속 호출 등 비효율. feature-request=지금 막히진 않지만 개선 아이디어. ※지금 막혀있으면 feature-request 아님"),
      summary: z.string().describe("한 줄 요약"),
      detail: z.string().describe("무엇을 하려 했고 왜 막혔는지 구체적으로 (파라미터 실값·고객 데이터는 넣지 말 것)"),
      attempted: z.string().optional().describe("시도한 도구나 접근 (선택)"),
      toolName: z.string().optional().describe("관련된 기존 도구 이름 (있으면)"),
      severity: z.enum(["low", "medium", "high"]).optional().describe("체감 심각도"),
    },
    WRITE,
    async ({ category, summary, detail, attempted, toolName, severity }, extra) => {
      const workspaceId = fingerprint(extra.authInfo?.token);
      logFeedback({ workspaceId, category, summary, detail, attempted, toolName, severity });
      return ok({
        reported: true,
        message: "피드백이 개발팀에 전달되었습니다. 감사합니다. 원래 작업을 계속하세요.",
      });
    },
  );

  // ── Engagements ─────────────────────────────────────────
  server.tool(
    "salesmap-list-engagements",
    "🎯 레코드의 활동 타임라인 조회 (이메일·노트·TODO·웹폼·미팅 등).\n📦 이메일 제목과 메모 본문을 자동 포함.",
    {
      objectType: timelineObjectType.describe("오브젝트 타입"),
      objectId: z.string().describe("레코드 UUID"),
      after: z.string().optional().describe("페이지네이션 커서"),
    },
    READ,
    async ({ objectType, objectId, after }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = { [`${objectType}Id`]: objectId };
        if (after) query.cursor = after;
        const data = await client.get<Record<string, unknown>>(`/v2/${objectType}/activity`, query);
        const key = `${objectType}ActivityList`;
        const items = (data[key] as Array<Record<string, unknown>>) ?? [];

        const compacted = items.map(item => compactRecord(item));

        // Auto-inline email subjects and memo texts (with caching)
        const emailCache = new Map<string, string | null>();
        const memoCache = new Map<string, string | null>();

        for (const item of compacted) {
          const emailId = item.emailId as string | undefined;
          if (emailId) {
            if (!emailCache.has(emailId)) {
              try {
                const data = await client.get<{ email: Record<string, unknown> }>(`/v2/email/${emailId}`);
                emailCache.set(emailId, (data.email?.subject as string) ?? null);
              } catch { emailCache.set(emailId, null); }
            }
            const subject = emailCache.get(emailId);
            if (subject) item.emailSubject = subject;
          }

          const memoId = item.memoId as string | undefined;
          if (memoId) {
            if (!memoCache.has(memoId)) {
              try {
                const data = await client.get<{ memo: Record<string, unknown> }>(`/v2/memo/${memoId}`);
                memoCache.set(memoId, (data.memo?.text as string) ?? null);
              } catch { memoCache.set(memoId, null); }
            }
            const text = memoCache.get(memoId);
            if (text) item.noteText = text;
          }
        }

        return ok({ [key]: compacted, nextCursor: data.nextCursor ?? null });
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
