import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, errWithSchemaHint, compactRecord, resolveProperties } from "../client";
import { getClient } from "../types";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;

const objectTypeEnum = z.enum(["people", "organization", "deal", "lead", "memo", "custom-object"]);
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

export function registerExtrasTools(server: McpServer) {
  // ── Lead Time ───────────────────────────────────────────
  const SUFFIXES = [
    { key: "enteredAt", suffix: "로 진입한 날짜" },
    { key: "durationSeconds", suffix: "에서 보낸 누적 시간" },
    { key: "exitedAt", suffix: "에서 퇴장한 날짜" },
  ] as const;

  server.tool(
    "salesmap-get-lead-time",
    "딜/리드의 파이프라인 스테이지별 체류 시간 분석. 진입·퇴장 시각과 누적 체류 시간을 파이프라인별로 그룹핑하여 반환.",
    {
      objectType: z.enum(["deal", "lead"]).describe("딜 또는 리드"),
      id: z.string().describe("레코드 ID"),
    },
    READ,
    async ({ objectType, id }, extra) => {
      try {
        const client = getClient(extra);
        const path = `/v2/${objectType}/${id}`;
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
    "레코드의 CRM 웹 URL 생성.",
    {
      objectType: z.enum(["people", "organization", "deal", "lead", "custom-object", "product", "quote"])
        .describe("오브젝트 타입"),
      id: z.string().describe("레코드 ID"),
    },
    READ,
    async ({ objectType, id }, extra) => {
      try {
        const client = getClient(extra);
        const me = await client.get<{ user: { room: { id: string } } }>("/v2/user/me");
        const roomId = me.user.room.id;
        const path = URL_PATH_MAP[objectType];
        return ok({ url: `https://salesmap.kr/${roomId}/${path}/${id}` });
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Association ───────────────────────────────────────
  server.tool(
    "salesmap-list-associations",
    "레코드에 연결된 다른 레코드들 조회 (primary+custom 병합). 반환은 ID 목록 — 상세 정보는 salesmap-batch-read-objects로 조회.",
    {
      targetType: objectTypeEnum.describe("출발 오브젝트 타입"),
      targetId: z.string().describe("출발 오브젝트 ID"),
      toTargetType: objectTypeEnum.describe("도착 오브젝트 타입"),
    },
    READ,
    async ({ targetType, targetId, toTargetType }, extra) => {
      try {
        const client = getClient(extra);
        const basePath = `/v2/object/${targetType}/${targetId}/association/${toTargetType}`;
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
    "레코드에 노트 추가.",
    {
      objectType: z.enum(["people", "organization", "deal", "lead", "custom-object"])
        .describe("대상 오브젝트 타입"),
      id: z.string().describe("대상 레코드 UUID"),
      note: z.string().describe("노트 내용"),
    },
    WRITE,
    async ({ objectType, id, note }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.post(`/v2/${objectType}/${id}`, { memo: note }));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Quote (get) ───────────────────────────────────────
  server.tool(
    "salesmap-get-quotes",
    "딜/리드에 연결된 견적서 목록 조회.",
    {
      objectType: z.enum(["deal", "lead"]).describe("딜 또는 리드"),
      id: z.string().describe("딜/리드 UUID"),
    },
    READ,
    async ({ objectType, id }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get(`/v2/${objectType}/${id}/quote`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Quote (create) ────────────────────────────────────
  server.tool(
    "salesmap-create-quote",
    "견적서 생성. dealId 또는 leadId 중 하나 필수.",
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
    "딜/리드의 파이프라인 목록과 각 단계(stage) ID 조회. deal 생성 전 반드시 호출하여 pipelineId/pipelineStageId를 확인해야 함.",
    {
      entityType: z.enum(["deal", "lead"]).describe("딜 또는 리드"),
    },
    READ,
    async ({ entityType }, extra) => {
      try {
        const client = getClient(extra);
        return ok(await client.get(`/v2/${entityType}/pipeline`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Users ───────────────────────────────────────────
  server.tool(
    "salesmap-list-users",
    "CRM 사용자 목록 조회. 검색 시 담당자(userValueId) 확인용. 생성/수정 시에는 사용자 이름을 properties에 직접 전달하면 자동 변환됨.",
    {
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    READ,
    async ({ cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get("/v2/user", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Teams ──────────────────────────────────────────
  server.tool(
    "salesmap-list-teams",
    "팀 목록 조회. 검색 시 팀 필드는 teamId(UUID) 필요.",
    {
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    READ,
    async ({ cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        return ok(await client.get("/v2/team", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Current User ──────────────────────────────────────
  server.tool(
    "salesmap-get-user-details",
    "현재 API 토큰 소유자 정보 조회.",
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

  // ── Read Email ──────────────────────────────────────────
  server.tool(
    "salesmap-read-email",
    "이메일 상세 조회 (제목·발신자·수신자·날짜 등 메타데이터만, 본문 없음).",
    { emailId: z.string().describe("이메일 UUID") },
    READ,
    async ({ emailId }, extra) => {
      try {
        const client = getClient(extra);
        const data = await client.get<{ email: Record<string, unknown> }>(`/v2/email/${emailId}`);
        return ok(data.email);
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Read Memo ───────────────────────────────────────────
  server.tool(
    "salesmap-read-memo",
    "메모(노트) 상세 조회.",
    { memoId: z.string().describe("메모 UUID") },
    READ,
    async ({ memoId }, extra) => {
      try {
        const client = getClient(extra);
        const data = await client.get<{ memo: Record<string, unknown> }>(`/v2/memo/${memoId}`);
        return ok(compactRecord(data.memo));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Changelog ───────────────────────────────────────────
  server.tool(
    "salesmap-list-changelog",
    "레코드의 필드 변경 이력 조회. 자동계산·시스템 필드는 자동 제거됨.",
    {
      objectType: timelineObjectType.describe("오브젝트 타입"),
      id: z.string().describe("레코드 UUID"),
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    READ,
    async ({ objectType, id, cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = { [`${objectType}Id`]: id };
        if (cursor) query.cursor = cursor;
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

  // ── Engagements ─────────────────────────────────────────
  server.tool(
    "salesmap-list-engagements",
    "레코드의 활동 타임라인 조회 (이메일·노트·TODO·웹폼·미팅 등). 이메일 제목과 메모 본문을 자동 포함.",
    {
      objectType: timelineObjectType.describe("오브젝트 타입"),
      id: z.string().describe("레코드 UUID"),
      cursor: z.string().optional().describe("페이지네이션 커서"),
    },
    READ,
    async ({ objectType, id, cursor }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = { [`${objectType}Id`]: id };
        if (cursor) query.cursor = cursor;
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
            if (text) item.memoText = text;
          }
        }

        return ok({ [key]: compacted, nextCursor: data.nextCursor ?? null });
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );
}
