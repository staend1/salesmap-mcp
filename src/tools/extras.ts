import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, errWithSchemaHint, compactRecord, resolveProperties, getRoomId, getUserMap } from "../client";
import { cached, TTL } from "../cache";
import { getClient } from "../types";
import { fingerprint, logFeedback } from "../telemetry";
import { SALESMAP_API_REF } from "./api-ref";
import { V3_CORE_TYPE_MAP, QUOTE_PRODUCT_TOP_LEVEL, QUOTE_PRODUCT_ALIAS, QUOTE_PRODUCT_SCHEMA_TYPE, toKstBoundary, V2_ACTIVITY_TYPES, ACTIVITY_TYPE_ALIAS, ACTIVITY_KEY_BASE } from "../api-quirks";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;

const objectTypeEnum = z.enum(["people", "organization", "deal", "lead", "note", "custom-object"]);
const timelineObjectType = z.enum(["people", "organization", "deal", "lead"]);

// ── v3 마이그레이션 플래그 ──────────────────────────────────────
// false로 바꾸면 v2 동작으로 즉시 롤백. 안정화 목표: 2026-07-31
const V3_PIPELINES = true; // v2 차이: deal/lead만 지원, 커스텀 오브젝트 파이프라인 없음
const V3_ACTIVITY = true;

// ── v2 activity 이관 (2026-07-31) ──────────────────────────────
// v2가 15종 + 유형/기간 필터를 갖추면서 v3를 추월했다. false로 바꾸면 v3로 즉시 롤백.
// v3 차이: 유형 7종만, 날짜 필터 없음, 대신 유형별 cursor·limit
const V2_ACTIVITY = true;

const ALL_ACTIVITY_TYPES = ["todo", "note", "recording", "meeting", "email", "alimtalk", "sms"] as const;
type ActivityType = typeof ALL_ACTIVITY_TYPES[number];

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

const PROPERTY_VALUE = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);

/**
 * 필드는 전부 `properties` 하나로만 받는다.
 *
 * 전용 파라미터(name·price·amount…)를 함께 두면 같은 값을 넣을 자리가 둘이 되고,
 * "둘 다 오면 누가 이기나"라는 규칙이 생긴다. 그 규칙은 어느 표면에도 안 보이므로
 * 넣은 값이 조용히 무시되는 사고로 이어진다. 입구가 하나면 충돌할 자리가 없다.
 *
 * 여기 남는 건 **필드가 아닌 것**뿐이다 — productId는 레코드 참조다.
 */
const quoteProductSchema = z.object({
  productId: z.string().optional().describe("연결할 상품 ID (salesmap-list-products). 필드가 아니라 레코드 참조."),
  properties: z.record(PROPERTY_VALUE)
    .describe("견적서 상품 필드 전부를 { 필드명: 값 }으로. '이름'(필수)·'금액'(단가)·'수량'·'할인'·'할인 유형' 등.\n⚠️ 상품 유형이 '구독 (월간)'·'구독 (연간)'이면 '결제 횟수'와 '시작 결제일'(YYYY-MM-DD)이 **필수** (누락 시 400). 유형은 salesmap-list-products로 확인.\n📋 필드 목록: salesmap-list-properties(objectType: 'quote-product')."),
  fieldList: z.array(z.object({ name: z.string() }).passthrough()).optional()
    .describe("(호환) 원시 fieldList. properties에 합쳐 처리하니 properties를 쓰세요."),
});
type QuoteProductInput = z.infer<typeof quoteProductSchema>;

/**
 * @quirk quoteproduct-flat-input
 *
 * 평탄한 properties를 견적서 상품의 top-level 파라미터 + fieldList로 분리한다.
 * 원시 fieldList로 들어온 것도 같은 통에 부어 함께 처리한다 — 별도 경로가 아니라 합류다.
 *
 * 필드 타입별 값 키는 `quote-product` 스키마를 조회해 정한다
 * (@quirk quoteproduct-type-name-split — `quoteProduct`로 조회하면 404).
 */
async function resolveQuoteProduct(
  client: ReturnType<typeof getClient>,
  input: QuoteProductInput,
  index: number,
): Promise<{ body: Record<string, unknown>; errors: string[] }> {
  const errors: string[] = [];
  const body: Record<string, unknown> = {};
  if (input.productId !== undefined) body.productId = input.productId;

  // properties와 원시 fieldList를 한 통에 합친다.
  // fieldList에 top-level 전용 필드가 와도 400을 내지 않고 제자리로 옮겨준다 —
  // 백엔드 에러가 원인을 가리는 자리라(위 quirk 주석), 막기보다 고쳐 보내는 게 낫다.
  const merged: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.properties ?? {})) {
    merged[QUOTE_PRODUCT_ALIAS[k] ?? k] = v;
  }
  for (const entry of input.fieldList ?? []) {
    const { name, ...rest } = entry as { name: string } & Record<string, unknown>;
    merged[QUOTE_PRODUCT_ALIAS[name] ?? name] = Object.values(rest)[0];
  }

  if (Object.keys(merged).length > 0) {
    const r = await resolveProperties(client, QUOTE_PRODUCT_SCHEMA_TYPE, merged, QUOTE_PRODUCT_TOP_LEVEL);
    errors.push(...r.errors.map(e => `quoteProductList[${index}] ${e}`));
    Object.assign(body, r.extractedTopLevel);
    if (r.fieldList.length > 0) body.fieldList = r.fieldList;
  }

  if (!body.name) errors.push(`quoteProductList[${index}] properties['이름']은 필수입니다.`);
  return { body, errors };
}

const msToClock = (ms: number) => {
  const t = Math.floor(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * activity 인라인과 read-engagement가 **같은 응답을 공유**하도록 캐시를 태운다.
 * list-engagements가 제목을 채우려고 부른 상세를, 뒤이은 read-engagement가 본문 때문에
 * 다시 부르면 API를 두 번 쓴다. 같은 대화 안에서 여는 경우가 대부분이라 적중률이 높다.
 */
const getEmailRaw = (client: ReturnType<typeof getClient>, id: string) =>
  cached(`${client.fingerprint}:email:${id}`, TTL.detail,
    () => client.get<{ email: Record<string, unknown> }>(`/v2/email/${id}`).then(d => d.email ?? {}));

const getMemoRaw = (client: ReturnType<typeof getClient>, id: string) =>
  cached(`${client.fingerprint}:memo:${id}`, TTL.detail,
    () => client.get<{ memo: Record<string, unknown> }>(`/v2/memo/${id}`).then(d => d.memo ?? {}));

const getRecordingRaw = (client: ReturnType<typeof getClient>, id: string) =>
  cached(`${client.fingerprint}:rec:${id}`, TTL.detail,
    () => client.get<{ recording: Record<string, unknown> }>(`/v2/recording/${id}`).then(d => d.recording ?? {}));

/**
 * 이메일 전문. `text` 우선, 없을 때만 `htmlBody`.
 *
 * 실측 2026-07-31 — 같은 메일에서 `htmlBody` 9,398자 vs `text` 339자로 **마크업이 96%**다.
 * 둘 다 실으면 응답이 28배가 되는데 AI가 읽을 내용은 같다. v3에서 `note.htmlBody`를
 * 중복이라 제거한 것과 같은 판단이다. 첨부 정보는 응답에 없다 (원장 #3 잔여 항목).
 */
async function readEmail(client: ReturnType<typeof getClient>, id: string) {
  const { htmlBody, text, ...rest } = await getEmailRaw(client, id);
  const hasText = typeof text === "string" && text.trim().length > 0;
  const body = hasText ? (text as string)
    : (typeof htmlBody === "string" && htmlBody.trim() ? htmlBody : null);
  return {
    ...compactRecord(rest),
    ...(body !== null
      ? { body, bodyFormat: hasText ? "text" : "html" }
      : { body: null, hint: "이 메일은 본문이 비어 있습니다 (text·htmlBody 모두 없음)." }),
  };
}

/**
 * 녹취 전문. 요약(`coreSummary`)은 list-engagements가 이미 인라인하므로,
 * 이 도구를 부른다는 건 **전문을 원한다**는 뜻이다 — transcript를 항상 함께 준다.
 *
 * ⚠️ 상한도 페이지네이션도 없다(백엔드 확인). 실측 59분 회의 = 404 세그먼트 / 85KB / 20,687자.
 * 3시간이면 250KB라 우리가 자른다. 자를 땐 **몇 개 중 몇 개까지 봤는지** 반드시 밝힌다.
 */
const TRANSCRIPT_CHAR_LIMIT = 40_000; // ≈2시간 분량

type TranscriptData = {
  transcriptSegmentList?: Array<Record<string, unknown>>;
  speakerInfoList?: Array<{ speakerId: string; label?: string | null }>;
};

async function readRecording(client: ReturnType<typeof getClient>, id: string) {
  const base = compactRecord(await getRecordingRaw(client, id));

  let tr: TranscriptData;
  try {
    const d = await client.get<{ recordingTranscript: TranscriptData }>(`/v2/recording/${id}/transcript`);
    tr = d.recordingTranscript ?? {};
  } catch {
    return { ...base, transcript: null, hint: "녹취 전문을 가져오지 못했습니다 (아직 변환 전이거나 없음)." };
  }

  // speakerId를 라벨로 치환 — 사용자가 UI에서 실명을 매핑했으면 실명이 내려온다.
  const label = new Map((tr.speakerInfoList ?? []).map(s => [s.speakerId, s.label || s.speakerId]));
  const segs = tr.transcriptSegmentList ?? [];

  const lines: string[] = [];
  let chars = 0;
  for (const s of segs) {
    const who = label.get(String(s.speakerId)) ?? String(s.speakerId);
    const line = `[${msToClock(Number(s.startTime) || 0)}] ${who}: ${s.text ?? ""}`;
    if (chars + line.length > TRANSCRIPT_CHAR_LIMIT) break;
    lines.push(line);
    chars += line.length;
  }

  const used = lines.length;
  if (used >= segs.length) {
    return { ...base, speakers: [...label.values()], transcript: lines.join("\n") };
  }
  const until = msToClock(Number(segs[used - 1]?.endTime) || 0);
  return {
    ...base,
    speakers: [...label.values()],
    transcript: lines.join("\n"),
    truncated: true,
    segments: `${used}/${segs.length}`,
    hint: `녹취가 길어 앞부분만 실었습니다 (${used}/${segs.length} 세그먼트, ${until}까지). 전체 흐름은 coreSummary를 참고하세요.`,
  };
}

/**
 * v2 activity 조회 + 얕은 인라인.
 *
 * ── 왜 v2로 되돌렸나 ──
 * v2는 15종을 다 주지만 필터가 없었고 v3는 필터는 되지만 7종만 줬다. 2026-07-29 릴리즈로
 * **v2가 15종 + 유형/기간 필터를 모두 갖췄다**(v3엔 날짜 필터가 아예 없다). v2에만 있는
 * webFormSubmit·emailOpen·emailLinkClick·documentView가 "고객 액션 감지"의 재료다.
 *
 * ── 얕은 인라인은 회귀 방지 요건이다 ──
 * v3는 email 제목·note 본문·recording 요약을 인라인해줬다. v2는 id만 준다.
 * 그대로 두면 6,815회 쓰이는 도구가 UUID 목록으로 퇴화한다. 제목 없는 id를 받은 AI는
 * 반드시 N번 되묻는데, **그건 N번의 LLM 턴이라 우리 내부 N+1(120ms)보다 훨씬 비싸다.**
 *
 * 본문·녹취 전문은 read-engagement로 미룬다. 상세 조회는 캐시를 공유하므로
 * 뒤이은 read-engagement가 API를 다시 부르지 않는다.
 */
// 서버 페이지가 50건 고정이므로 50이면 **페이지 전체**를 덮는다.
// 20이던 시절엔 21번째부터 내용이 안 붙어, 같은 목록 안에서 앞은 보이고 뒤는 id만 남는
// 절단면이 생겼다 — 방금 없앤 limit 절단과 같은 계열의 문제였다.
// 비용(실측, 테스트 워크스페이스): 목록 85ms + 인라인 50건 5,940ms ≒ 6.0초.
// 건당 119ms로 client.ts의 일반 버킷 스로틀(120ms)에 묶여 있어 서버가 빨라져도 안 줄어든다.
const INLINE_FETCH_LIMIT = 50;   // 한 응답에서 상세를 열어볼 최대 건수 = 서버 페이지 전체
const NOTE_PREVIEW_CHARS = 300;  // 실측 분포상 64%가 이 안에 통째로 들어간다

type ActivityQuery = {
  objectType: string; objectId: string;
  types?: string[]; startDate?: string; endDate?: string;
  after?: string;
};

async function listActivityV2(client: ReturnType<typeof getClient>, q: ActivityQuery) {
  // @quirk activity-type-v2-v3-names — 구 v3 이름을 v2 정식 이름으로
  const types = q.types?.map(t => ACTIVITY_TYPE_ALIAS[t] ?? t);
  const unknown = types?.filter(t => !(V2_ACTIVITY_TYPES as readonly string[]).includes(t)) ?? [];
  if (unknown.length) {
    // 백엔드가 잘못된 types에 **본문 없는 400**을 주므로(Activity 유형 계약) 우리가 먼저 막는다
    throw new Error(`알 수 없는 활동 유형: ${unknown.join(", ")}\n사용 가능: ${V2_ACTIVITY_TYPES.join(", ")}`);
  }

  // @quirk activity-custom-object-key-case — 커오만 경로와 키의 표기가 갈린다
  // 경로는 kebab(`/v2/custom-object/activity`)인데 쿼리 파라미터와 응답 키는
  // camel(`customObjectId`, `customObjectActivityList`)이다. 나머지 4종은 둘이 같다.
  const keyBase = ACTIVITY_KEY_BASE[q.objectType] ?? q.objectType;

  const query: Record<string, string> = { [`${keyBase}Id`]: q.objectId };
  if (types?.length) query.types = types.join(",");
  // @quirk date-only-timezone-split — 날짜만 오면 KST 경계를 찍어 보낸다
  if (q.startDate) query.startDate = toKstBoundary(q.startDate, "start");
  if (q.endDate) query.endDate = toKstBoundary(q.endDate, "end");
  if (q.after) query.cursor = q.after;

  const data = await client.get<Record<string, unknown>>(`/v2/${q.objectType}/activity`, query);
  const key = `${keyBase}ActivityList`;
  const raw = (data[key] as Array<Record<string, unknown>>) ?? [];
  // 서버가 준 페이지를 **그대로** 반환한다. 여기서 자르면 안 된다 —
  // nextCursor는 다음 *서버* 페이지(51번째)를 가리키므로, 앞 N건만 남기고 커서를 그대로
  // 넘기면 잘라낸 나머지가 영영 조회되지 않는다. 200으로 성공해 보이는 조용한 유실이다.
  // (실측: 활동 55건 레코드에 limit=10 → 15건만 수집, 40건 유실)
  const items = raw.map(i => compactRecord(i));

  // 상세 인라인 — 같은 id는 한 번만, 전체 상한 20건
  let budget = INLINE_FETCH_LIMIT;
  let skipped = 0;
  for (const it of items) {
    const emailId = it.emailId as string | undefined;
    const memoId = it.memoId as string | undefined;
    const recordingId = it.recordingId as string | undefined;
    if (!emailId && !memoId && !recordingId) continue;
    if (budget <= 0) { skipped++; continue; }
    budget--;
    try {
      if (emailId) {
        const e = await getEmailRaw(client, emailId);
        if (e.subject) it.subject = e.subject;
        if (e.snippet) it.snippet = e.snippet;
      } else if (memoId) {
        const m = await getMemoRaw(client, memoId);
        const text = typeof m.text === "string" ? m.text : "";
        if (text) {
          it.note = text.slice(0, NOTE_PREVIEW_CHARS);
          // 잘렸다는 사실을 AI가 추측하게 두지 않는다 — 안 잘린 항목엔 플래그가 없다
          if (text.length > NOTE_PREVIEW_CHARS) { it.truncated = true; it.fullLength = text.length; }
        }
      } else if (recordingId) {
        const r = await getRecordingRaw(client, recordingId);
        if (r.title) it.title = r.title;
        if (r.duration) it.duration = r.duration;
        if (r.coreSummary) it.summary = r.coreSummary;
      }
    } catch { /* 상세 조회 실패는 목록 자체를 막지 않는다 */ }
  }

  const hints: string[] = [];
  if (items.some(i => i.truncated)) {
    hints.push("본문이 잘린 항목이 있습니다(truncated: true). 전문은 salesmap-read-engagement(type, id)로 확인하세요.");
  }
  if (skipped) {
    hints.push(`상세를 열지 않은 항목 ${skipped}건이 있습니다(한 응답당 ${INLINE_FETCH_LIMIT}건까지만 조회). types나 기간을 좁히거나 salesmap-read-engagement로 개별 조회하세요.`);
  }
  return {
    [key]: items,
    nextCursor: data.nextCursor ?? null,
    ...(hints.length ? { hint: hints.join(" ") } : {}),
  };
}

// ── salesmap-get-guide content (MCP 사용 가이드) ──────────────────
const SALESMAP_DOCS = `# 세일즈맵 MCP 가이드

> 세션 시작 시 또는 어떤 도구를 써야 할지 모를 때 참조하세요.

---

## 오브젝트 모델

세일즈맵은 B2B 영업 CRM입니다.

### 관계 구조

\`\`\`
고객 (people) ──┐
                ├──→ 리드 (lead) ──→ 딜 (deal)
회사 (org)    ──┘
고객 ↔ 회사 (N:N 연결)
커스텀 오브젝트 — 어떤 오브젝트에도 자유롭게 연결 가능
\`\`\`

**핵심:** 리드에서 딜을 생성해도 리드는 사라지지 않고 공존합니다. 딜·리드 모두 고객·회사에 직접 연결됩니다.

### 오브젝트 정의

| 오브젝트 | 정의 |
|---|---|
| 고객 (people) | 잠재 고객부터 기존 고객까지 모든 개인의 연락처·이력. 회사 없이 독립 존재 가능 |
| 회사 (organization) | 여러 고객이 소속된 법인체 정보. B2B 계약 주체 |
| 리드 (lead) | **마케팅 단계** 영업 기회. 웹폼·콘텐츠 다운로드 등 초기 관심 단계. 리드 파이프라인으로 MQL 육성 |
| 딜 (deal) | **세일즈 단계** 영업 기회. 계약 성사 목표, 협상 상태·금액·파이프라인 관리 |
| 커스텀 오브젝트 | 워크스페이스별 맞춤 데이터. 예: 티켓(회사 연결), 정산(딜 연결), 수업(딜+강사+수강생 연결) |
| 메모 (memo) | 고객·딜 등에 남기는 내부 기록. 미팅 노트·상담 내용 등 |
| TODO | 영업 담당자의 할 일. 전화·미팅·업무 등 follow-up 관리 |
| 견적서 (quote) | 딜·리드에 연결된 가격 제안서. 상품×수량×할인 |
| 상품 (product) | 판매하는 제품/서비스. 일반형 또는 구독형(월간·연간) |
| 시퀀스 (sequence) | 자동화된 이메일 캠페인. 단계별 발송·오픈/클릭/회신 추적 |

**전형적인 흐름:** 웹폼 → 고객·회사 생성 → 리드(마케팅 육성) → 딜 생성(리드 유지) → 파이프라인 진행 → 견적서 발송 → 성사/실패

---

## MCP 도구 맵

| 카테고리 | 도구 |
|---|---|
| 탐색·메타 | \`list-objects\`, \`get-user-details\`, \`list-users\`, \`list-teams\` |
| 레코드 조회 | \`search-objects\`, \`batch-read-objects\` |
| 관계 탐색 | \`list-associations\` |
| 타임라인·노트 | \`list-engagements\`, \`list-notes\`, \`read-engagement\` |
| 이력·변경 | \`list-changelog\`, \`get-lead-time\` |
| 레코드 생성·수정·삭제 | \`batch-create-objects\`, \`update-object\`, \`delete-object\` |
| 노트 생성 | \`create-note\` |
| 필드 관리 | \`list-properties\`, \`create-property\` |
| 파이프라인·견적 | \`get-pipelines\`, \`list-products\`, \`create-quote\`, \`get-quotes\`, \`get-link\` |
| 시퀀스·웹폼 | \`list-sequences\`, \`list-webforms\` |
| 서버 실행 | \`run-script\` |

---

## 시나리오별 도구 조합

### 레코드 조회·분석
\`\`\`
search-objects(objectType, filterGroups)
  → batch-read-objects(objectIds, fieldList?)     # 상세 필드 조회
  → list-engagements(objectId, types?)            # 타임라인 (이메일·노트·미팅 등)
  → list-notes(leadId | dealId | ...)             # 메모 목록
\`\`\`

### 연결 레코드 함께 읽기
\`\`\`
list-associations(objectType)                     # 사용 가능한 관계명 확인
  → batch-read-objects(objectIds, associationList) # 관계 레코드 인라인 포함
\`\`\`

### 레코드 생성 (연결된 상태로)
생성 순서 엄수: **회사 → 고객 → 딜/리드** (부모 ID가 먼저 존재해야 함)
\`\`\`
batch-create-objects(objectType: "organization", inputList)
  → batch-create-objects(objectType: "people", inputList + associations{"메인 회사":[organizationId]})
  → batch-create-objects(objectType: "deal" | "lead", inputList + associations{"메인 고객":[peopleId], "메인 회사":[organizationId]})
\`\`\`
⚠️ 딜·리드 생성 시 associations의 \`메인 고객\` 또는 \`메인 회사\` 중 하나 **필수**.
순서를 지키지 않아도 각각 독립 생성 후 update-object로 나중에 연결 가능.

### 레코드 수정
\`\`\`
search-objects(objectType, filterGroups)          # ID 확인
  → list-properties(objectType)                   # 정확한 필드명·옵션 확인
  → update-object(id, objectType, properties)
\`\`\`

### 필드 추가
\`\`\`
list-properties(objectType)                       # 기존 필드 확인
  → create-property(objectType, name, type, ...)
\`\`\`
formula(계산 유형) 필드는 아래 **계산 유형 필드** 섹션 참조.

### 견적서 생성
\`\`\`
get-pipelines(objectType: "deal")                 # 파이프라인·단계 ID 확인
  → list-products()                               # 상품 ID·가격 확인
  → create-quote(dealId OR leadId, properties{이름…}, quoteProductList[{productId, properties{이름,금액,수량…}}])
\`\`\`
⚠️ 구독형 상품 포함 시: \`quoteProductList[].properties["결제 횟수"]\`·\`quoteProductList[].properties["시작 결제일"]\` 필수.

### 파이프라인 체류 시간 분석
\`\`\`
search-objects(objectType, filterGroups)
  → get-lead-time(objectType, objectId)           # 단계별 진입일·체류시간·퇴장일
\`\`\`

### 대량 집계·멀티홉 작업 (run-script)
전용 도구로 답을 못 내는 대량 조회·분석의 최후수단.
N건 루프·집계처럼 도구를 여러 번 연달아 호출해야 할 때만 사용.
중간 데이터가 컨텍스트에 쌓이지 않고 결과만 반환됨.

**🚫 전용 도구로 가능하면 run-script를 쓰지 말 것.** 단건·소수 검색 → \`search-objects\`,
레코드 조회 → \`batch-read-objects\`, 생성·수정 → \`batch-create-objects\`·\`update-object\`,
필드 확인 → \`list-properties\`. 전용 도구는 경로·입력 검증·에러 힌트가 내장돼 있어
raw API 경로를 직접 다루는 run-script보다 실패율이 훨씬 낮음.
run-script는 **루프·집계·전체 페이지 수집** 등 전용 도구 조합으로 불가능할 때만.
\`\`\`
run-script(script: \`
  const { dealList } = await salesmap.getAll('/v2/deal');   // 전 페이지 자동 순회
  const results = [];
  for (const deal of dealList) {
    const timeline = await salesmap.post('/v3/object/activity', { objectType: '딜', objectId: deal.id, note: {} });
    results.push({ dealId: deal.id, noteCount: timeline.note?.data?.length ?? 0 });
  }
  return results;
\`)
\`\`\`
⚠️ 최대 120초. 쓰기(create·update·delete) API도 호출 가능하므로 신중하게.

**run-script 필수 규칙**
- \`salesmap.get/post\`는 응답의 \`success\`/\`data\` 래퍼를 **벗겨서** 반환 — \`r.dealList\`로 접근 (\`r.data.dealList\` 아님). api-ref의 응답 예시는 래핑 형태이므로 주의.
- 목록은 \`salesmap.getAll(path, query?)\` 사용 — \`nextCursor\`를 자동 순회해 전 페이지를 합쳐 반환. 수동 \`get\`은 첫 페이지만 나와 조용히 잘림.
- **결과가 전부 0·빈 배열이면 데이터가 없는 게 아니라 접근 경로가 틀렸을 가능성부터 의심** — 샘플 1건을 raw로 \`return\`해서 실제 구조를 먼저 확인.
- N건 각각 상세 조회하기 전에, 필터 파라미터를 생략하면 전체를 한 번에 받을 수 있는 엔드포인트인지 확인 — N번 호출을 1번으로 줄일 수 있음.


---

## 필드 입력 핵심 규칙

\`batch-create-objects\`, \`update-object\`, \`create-quote\` 모두 MCP 입력은 \`properties\`에 필드명→값 형태로 지정한다.
내부에서 필요한 경우 v2 API의 \`fieldList\`/top-level 파라미터로 변환한다.
필드명은 세일즈맵 UI의 **한글 필드명과 정확히 일치**해야 함 (\`list-properties\`로 확인).

**기본 입력 원칙**
- 사용자 필드(\`담당자\`, \`팔로워\`)는 사용자 이름을 넣는다. MCP가 필요한 경우 userId로 변환한다.
- 팀 필드는 팀 이름을 넣는다. 검색 시 MCP가 teamId로 변환한다.
- 파이프라인·파이프라인 단계는 생성·검색에서 이름을 넣는다. 단계명이 여러 파이프라인에 중복되면 파이프라인 이름도 함께 넣는다.
- 고객·회사·딜·리드·상품·웹폼·시퀀스 등 다른 레코드를 가리키는 관계 값은 레코드 ID가 필요하다.
- \`batch-create-objects\`에서 관계는 \`properties\`가 아니라 \`associations\`에 넣는다.

### 내부 변환 참고 (raw API를 직접 쓸 때만)

| 타입 | 값 키 | 예시 |
|---|---|---|
| 텍스트·단일 선택 | \`stringValue\` | \`{ "name": "상태", "stringValue": "활성" }\` |
| 숫자 | \`numberValue\` | \`{ "name": "직원수", "numberValue": 50 }\` |
| 복수 선택 | \`stringValueList\` | \`{ "name": "관심 제품", "stringValueList": ["CRM"] }\` |
| 날짜 | \`dateValue\` | \`{ "name": "계약일", "dateValue": "2026-01-15" }\` |
| 불리언 | \`booleanValue\` | \`{ "name": "동의 여부", "booleanValue": true }\` |
| 사용자(단일) | \`userValueId\` | \`{ "name": "담당자", "userValueId": "<userId>" }\` |
| 사용자(복수) | \`userValueIdList\` | \`{ "name": "팔로워", "userValueIdList": ["<id>"] }\` |
| 고객 | \`peopleValueId\` / \`peopleValueIdList\` | \`{ "name": "담당 고객", "peopleValueId": "<id>" }\` |
| 회사 | \`organizationValueId\` | \`{ "name": "거래처", "organizationValueId": "<id>" }\` |

### 자주 틀리는 패턴

| 잘못된 방법 | 올바른 방법 |
|---|---|
| top-level \`ownerId\` 전달 | MCP 도구의 \`properties.담당자\`에 사용자 이름 입력 |
| \`fieldList\`에 \`{ name: "금액" }\` (딜) | top-level \`price\` 파라미터 사용 |
| 담당자 UUID를 batch-create에 입력 | 사용자 이름 입력 |
| 파이프라인/단계 UUID를 batch-create에 입력 | 파이프라인/단계 이름 입력 |
| 선택 필드에 미등록 옵션 값 | \`list-properties\`에서 정확한 옵션 확인 후 사용 |
| \`stringValue: ""\` (빈 문자열) | 필드 초기화는 해당 항목을 \`fieldList\`에서 생략 |

---

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
  // @quirk leadtime-fieldname-parse — 단계 이력 API가 없어 자동 생성 필드명을 역파싱한다
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
    "🎯 오브젝트에 어떤 연결 관계가 있는지 스키마 조회.\n🧭 batch-read-objects의 associationList에 넣을 관계명 확인용. '메인 X'가 기본 연결(primary).",
    {
      objectType: z.string().describe("오브젝트 타입. 'deal' | 'lead' | 'people' | 'organization' 또는 커스텀 오브젝트 이름"),
    },
    READ,
    async ({ objectType }, extra) => {
      try {
        const client = getClient(extra);

        // v3: association schema (마이그레이션: 2026-06-30)
        const apiType = V3_CORE_TYPE_MAP[objectType] ?? objectType;
        return ok(await client.post("/v3/association/list", { objectType: apiType }));
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
    "🎯 lead, deal에 연결된 견적서 조회.",
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
    "🎯 견적서 생성. dealId 또는 leadId 중 하나 필수.\n📋 필드는 견적서·상품 모두 properties에 { 필드명: 값 }으로만 넣습니다 (전용 파라미터 없음). '이름'은 양쪽 다 필수.\n📋 salesmap-get-quotes로 기존 견적서 확인.",
    {
      // 필드가 아닌 것만 전용 파라미터 — dealId·leadId는 레코드 참조, note는 memo(필드 아님).
      // '이름'·'메인 견적서 여부'는 top-level로 나가지만 입력은 properties 하나로 받는다.
      dealId: z.string().optional().describe("연결할 딜 ID (dealId 또는 leadId 중 하나 필수)"),
      leadId: z.string().optional().describe("연결할 리드 ID (dealId 또는 leadId 중 하나 필수)"),
      note: z.string().optional().describe("견적서 노트 (필드가 아닌 메모)"),
      properties: z.record(PROPERTY_VALUE)
        .describe("견적서 필드 전부를 { 필드명: 값 }으로. '이름'(필수)·'할인'·'할인 유형'·'담당자'·'메인 견적서 여부' 등.\n📋 필드 목록: salesmap-list-properties(objectType: 'quote')."),
      quoteProductList: z.array(quoteProductSchema).optional().describe("견적서 상품 목록"),
    },
    WRITE,
    async ({ note, properties, ...rest }, extra) => {
      if (!rest.dealId && !rest.leadId) {
        return err("dealId 또는 leadId 중 하나는 필수입니다.");
      }

      try {
        const client = getClient(extra);
        const body: Record<string, unknown> = {};
        if (note !== undefined) body.memo = note;
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined && k !== "quoteProductList") body[k] = v;
        }

        // properties → fieldList + top-level 추출 (@quirk top-level-split)
        const { fieldList, errors, extractedTopLevel } = await resolveProperties(client, "quote", properties);
        if (errors.length > 0) return err(errors.join("\n"));
        Object.assign(body, extractedTopLevel);
        if (fieldList.length > 0) body.fieldList = fieldList;
        if (!body.name) return err("properties['이름']은 필수입니다.");

        // @quirk quoteproduct-flat-input — 상품도 같은 방식으로 분리
        if (rest.quoteProductList) {
          const resolved = await Promise.all(rest.quoteProductList.map((p, i) => resolveQuoteProduct(client, p, i)));
          const qpErrors = resolved.flatMap(r => r.errors);
          if (qpErrors.length > 0) return err(qpErrors.join("\n"));
          body.quoteProductList = resolved.map(r => r.body);
        }

        return ok(await client.post("/v2/quote", body));
      } catch (e: unknown) {
        return errWithSchemaHint((e as Error).message, "quote", undefined);
      }
    },
  );

  // ── Notes ─────────────────────────────────────────────
  server.tool(
    "salesmap-list-notes",
    "🎯 노트 목록 조회. 담당자·유형·날짜·연결 레코드 기준으로 필터 가능.",
    {
      after: z.string().optional().describe("페이지네이션 커서"),
      startDate: z.string().optional().describe("작성일 시작. 날짜만 쓰면 한국시간 그날 00:00부터 (예: 2026-01-01). 시각까지 지정하려면 오프셋 포함 ISO"),
      endDate: z.string().optional().describe("작성일 종료. 날짜만 쓰면 한국시간 그날 23:59:59까지 — 종료일 당일이 포함됩니다 (예: 2026-06-30)"),
      owner: z.string().optional().describe("노트를 작성한 담당자. 사용자 이름 또는 userId 모두 허용"),
      type: z.string().optional().describe("노트 유형 이름 (예: '미팅', '콜')"),
      leadId: z.string().optional().describe("연결된 리드 ID"),
      dealId: z.string().optional().describe("연결된 딜 ID"),
      peopleId: z.string().optional().describe("연결된 고객 ID"),
      organizationId: z.string().optional().describe("연결된 회사 ID"),
    },
    READ,
    async ({ after, startDate, endDate, owner, type, leadId, dealId, peopleId, organizationId }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};

        if (after) query.cursor = after;
        // @quirk date-only-timezone-split — memo는 date-only를 UTC로 읽어 종료일 당일이 통째로 빠진다.
        // KST 경계를 명시해 보내면 어느 구현에서도 같은 결과가 된다.
        if (startDate) query.startDate = toKstBoundary(startDate, "start");
        if (endDate) query.endDate = toKstBoundary(endDate, "end");
        if (leadId) query.leadId = leadId;
        if (dealId) query.dealId = dealId;
        if (peopleId) query.peopleId = peopleId;
        if (organizationId) query.organizationId = organizationId;

        // owner: 이름이면 userId로 변환
        if (owner) {
          const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const HEX_ID_RE = /^[0-9a-f]{24}$/i;
          if (UUID_RE.test(owner) || HEX_ID_RE.test(owner)) {
            query.ownerId = owner;
          } else {
            const userMap = await getUserMap(client);
            const userId = userMap.get(owner);
            if (!userId) {
              const names = [...userMap.keys()].join(", ");
              return err(`담당자 "${owner}"를 찾을 수 없습니다. 사용 가능한 이름: ${names}`);
            }
            query.ownerId = userId;
          }
        }

        // type: 이름으로 typeId 조회 (@quirk underscore-id-key — 유형 목록도 id 키가 _id)
        if (type) {
          const typeData = await client.get<{ typeList: Array<{ _id: string; value: string }> }>("/v2/memo/type-list");
          const typeList = typeData.typeList ?? [];
          const found = typeList.find(t => t.value === type);
          if (!found) {
            const names = typeList.map(t => t.value).join(", ");
            return err(`노트 유형 "${type}"을 찾을 수 없습니다. 사용 가능한 유형: ${names}`);
          }
          query.typeId = found._id;
        }

        return ok(await client.get("/v2/memo", query));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Pipeline ──────────────────────────────────────────
  server.tool(
    "salesmap-get-pipelines",
    "🎯 파이프라인 목록과 각 단계(stage) ID 조회. 딜·리드·커스텀 오브젝트 모두 지원.\n🧭 커스텀 오브젝트 이름은 salesmap-list-objects로 확인.",
    {
      objectType: z.string().describe("'deal', 'lead', 또는 커스텀 오브젝트 이름 (예: '티켓(CRM)')"),
    },
    READ,
    async ({ objectType }, extra) => {
      try {
        const client = getClient(extra);
        if (V3_PIPELINES) {
          // 마이그레이션: 2026-06-30 | 개선: 커스텀 오브젝트 파이프라인 지원 추가
          // @quirk objecttype-v2-v3-duality — 인라인 재작성 금지, 공용 맵 재사용
          const apiObjectType = V3_CORE_TYPE_MAP[objectType] ?? objectType;
          return ok(await client.post("/v3/pipeline/list", { objectType: apiObjectType }));
        }
        // v2 fallback (롤백 시 사용) — deal/lead만 지원
        if (objectType !== "deal" && objectType !== "lead") {
          return err("v2에서는 deal, lead만 지원됩니다.");
        }
        return ok(await client.get(`/v2/${objectType}/pipeline`));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Users ───────────────────────────────────────────
  server.tool(
    "salesmap-list-users",
    "🎯 CRM 사용자 목록 조회.",
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

  // ── Products / Sequences / WebForms (관계 필드 검색에 쓸 id 조회용) ──
  // search 필터의 multiProduct·sequence·multiSequence·webForm·multiWebForm 필드는
  // id로만 검색되므로, 유저가 이름으로 지시하면 이 목록에서 id를 찾아 검색에 사용한다.
  server.tool(
    "salesmap-list-products",
    "🎯 상품 목록 조회 (id·이름). 상품 관계 필드(예: 메인 견적 상품 리스트) 검색 시 id 확인용.",
    { after: z.string().optional().describe("페이지네이션 커서") },
    READ,
    async ({ after }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (after) query.cursor = after;
        const data = await client.get<Record<string, unknown>>("/v2/product", query);
        const list = (data.productList as Array<Record<string, unknown>>) ?? [];
        return ok({ products: list.map(p => ({ id: p.id, name: p["이름"] })), nextCursor: data.nextCursor ?? null });
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap-list-sequences",
    "🎯 시퀀스 목록 조회 (id·이름). 시퀀스 관계 필드(예: 등록된 시퀀스 목록) 검색 시 id 확인용.",
    { after: z.string().optional().describe("페이지네이션 커서") },
    READ,
    async ({ after }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (after) query.cursor = after;
        const data = await client.get<Record<string, unknown>>("/v2/sequence", query);
        const list = (data.sequenceList as Array<Record<string, unknown>>) ?? [];
        // @quirk underscore-id-key — 시퀀스 목록만 id 키가 _id (원장 #8)
        return ok({ sequences: list.map(s => ({ id: s._id, name: s.name })), nextCursor: data.nextCursor ?? null });
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  server.tool(
    "salesmap-list-webforms",
    "🎯 웹폼 목록 조회 (id·이름). 웹폼 관계 필드(예: 제출된 웹폼 목록·최근 제출된 웹폼) 검색 시 id 확인용.",
    { after: z.string().optional().describe("페이지네이션 커서") },
    READ,
    async ({ after }, extra) => {
      try {
        const client = getClient(extra);
        const query: Record<string, string> = {};
        if (after) query.cursor = after;
        const data = await client.get<Record<string, unknown>>("/v2/webForm", query);
        const list = (data.webFormList as Array<Record<string, unknown>>) ?? [];
        return ok({ webForms: list.map(w => ({ id: w.id, name: w.name })), nextCursor: data.nextCursor ?? null });
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


  // ── Read Note ───────────────────────────────────────────
  server.tool(
    "salesmap-read-engagement",
    "🎯 활동 단건의 **전문** 조회 — 이메일 본문 · 녹취 전체 · 노트 전문.\n🧭 salesmap-list-engagements가 준 emailId·recordingId·memoId를 그대로 넣습니다.\n📦 목록엔 미리보기만 실립니다. `truncated: true`인 항목이나 본문이 필요할 때 이 도구로 엽니다.",
    {
      type: z.enum(["email", "recording", "note"])
        .describe("활동 유형. list-engagements 응답의 emailId→'email', recordingId→'recording', memoId→'note'"),
      id: z.string().describe("해당 활동의 UUID"),
    },
    READ,
    async ({ type, id }, extra) => {
      try {
        const client = getClient(extra);
        if (type === "note") return ok(await getMemoRaw(client, id));
        if (type === "email") return ok(await readEmail(client, id));
        return ok(await readRecording(client, id));
      } catch (e: unknown) {
        return err((e as Error).message);
      }
    },
  );

  // ── Changelog ───────────────────────────────────────────
  server.tool(
    "salesmap-list-changelog",
    "🎯 필드 값이 언제 누가 무엇에 의해서 바뀌었는지 추적 (시스템 필드 제외).\n🧭 \"이 필드 언제 바뀌었어?\", \"담당자 언제 바뀜?\", \"이 값 언제 체크됐어?\" 같은 질문에 사용.",
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
        .describe("formula에 수식을 입력하면 필드는 계산 유형 필드가 되며, type은 계산 결과의 타입을 지정해야 함. options·showInCreateForm·required·preventDuplicates 설정 불가. 자세한 내용은 salesmap-get-guide 호출하면 확인 가능"),
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

  // ── Guide ─────────────────────────────────────────────────
  server.tool(
    "salesmap-get-guide",
    "🎯 세일즈맵 MCP 사용 가이드 조회. 오브젝트 모델·시나리오별 도구 조합·필드 입력 규칙·formula 문법 수록.\n🧭 세션 시작 시, 어떤 MCP 도구를 써야 할지 모를 때, batch-create-objects·update-object·create-property 전에 참조.",
    {},
    READ,
    async (_params, _extra) => {
      return { content: [{ type: "text" as const, text: SALESMAP_DOCS }] };
    },
  );

  // ── API Ref ───────────────────────────────────────────────
  server.tool(
    "salesmap-get-api-ref",
    "🎯 세일즈맵 REST API 레퍼런스 조회. 엔드포인트·요청/응답 형식·에러 코드 수록.\n🧭 run-script로 직접 API를 호출하기 전에 참조. MCP 도구 사용 가이드는 salesmap-get-guide 참조.",
    {},
    READ,
    async (_params, _extra) => {
      return { content: [{ type: "text" as const, text: SALESMAP_API_REF }] };
    },
  );

  // ── Run Script ───────────────────────────────────────────
  server.tool(
    "salesmap-run-script",
    "🚫 최후수단: 다른 전용 도구로 가능한 작업엔 사용 금지. 단건·소수 검색은 search-objects, 레코드 조회는 batch-read-objects, 생성은 batch-create-objects, 수정은 update-object, 필드 확인은 list-properties를 먼저 사용. 전용 도구로 되는 일을 이 도구로 하면 실패율이 오히려 몇 배 높고, API 경로·파라미터를 헛짚으며 헤매는 시간만 늘어남.\n🎯 반드시 멀티홉 복잡 작업에만: 전용 도구 조합으로 불가능한 대량 조회·분석 — N건 루프 순회, 집계·변환, 페이지네이션 전체 수집 등. 중간 데이터가 컨텍스트에 쌓이지 않음.\n💡 salesmap.get(path, query?)·salesmap.post(path, body?)로 세일즈맵 API 직접 호출.\n🔑 응답은 success/data 래퍼가 벗겨진 상태로 반환 — r.data.dealList가 아니라 r.dealList로 접근.\n📄 목록 전체가 필요하면 salesmap.getAll(path, query?) — nextCursor를 자동 순회해 전 페이지를 합쳐 반환.\n⏱️ 대기 필요 시 await sleep(ms) 또는 setTimeout 사용 가능.\n⚠️ 최대 120초. create·update·delete도 가능하므로 신중하게.\n📌 에러는 첫 번째 발생 시 즉시 중단. 루프에서 다중 에러를 수집하려면 스크립트 내에서 try/catch로 직접 처리 후 return.",
    {
      script: z.string().describe("실행할 JavaScript 코드 (async 지원). salesmap.get(path, query?)·salesmap.post(path, body?)·salesmap.getAll(path, query?)로 API 호출. return 값이 결과로 반환됨.\n예: const { dealList } = await salesmap.getAll('/v2/deal'); return dealList.map(d => d.dealId);\n※ 응답은 data 언랩 상태 — r.dealList로 접근 (r.data.dealList 아님)"),
    },
    WRITE,
    async ({ script }, extra) => {
      const client = getClient(extra);

      const salesmap = {
        get: async (path: string, query?: Record<string, string>) => {
          try { return await client.get(path, query); }
          catch (e: unknown) { throw new Error(`[GET ${path}] ${(e as Error).message}`); }
        },
        post: async (path: string, body?: Record<string, unknown>) => {
          try { return await client.post(path, body); }
          catch (e: unknown) { throw new Error(`[POST ${path}] ${(e as Error).message}`); }
        },
        // nextCursor 자동 순회 — 전 페이지 배열을 합쳐 반환 (활동 많은 레코드의 조용한 잘림 방지)
        getAll: async (path: string, query?: Record<string, string>) => {
          const merged: Record<string, unknown> = {};
          let cursor: string | undefined;
          const MAX_PAGES = 100;
          for (let page = 0; page < MAX_PAGES; page++) {
            const q = cursor ? { ...query, cursor } : query;
            let res: Record<string, unknown>;
            try { res = await client.get<Record<string, unknown>>(path, q); }
            catch (e: unknown) { throw new Error(`[GET ${path}${cursor ? " (page " + (page + 1) + ")" : ""}] ${(e as Error).message}`); }
            for (const [k, v] of Object.entries(res)) {
              if (Array.isArray(v)) merged[k] = [...((merged[k] as unknown[]) ?? []), ...v];
              else if (k !== "nextCursor") merged[k] = v;
            }
            const next = res.nextCursor as string | null | undefined;
            if (!next) break;
            cursor = next;
          }
          return merged;
        },
      };

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const { createContext, runInContext } = await import("node:vm");
      const context = createContext({ salesmap, Promise, setTimeout, clearTimeout, sleep });
      const wrapped = `(async () => {\n${script}\n})()`;

      // 안내는 120초, 실제 컷은 125초 — AI가 상한에 딱 맞춰 짠 스크립트의 오차를 흡수하는 그레이스 5초.
      // Vercel maxDuration(130초)보다 먼저 끊어야 힌트 있는 에러로 반환됨.
      const timeoutMs = 125_000;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) =>
        timeoutHandle = setTimeout(() => reject(new Error("스크립트 실행 제한 시간(120초) 초과")), timeoutMs)
      );

      try {
        const result = await Promise.race([
          runInContext(wrapped, context, { filename: "salesmap-script" }) as Promise<unknown>,
          timeoutPromise,
        ]);
        if (result === undefined) {
          return err("스크립트가 값을 반환하지 않았습니다. 결과를 반환하려면 스크립트 마지막에 return <값>을 추가하세요.");
        }
        return ok(result);
      } catch (e: unknown) {
        const error = e as Error;
        // 스택에서 스크립트 줄 번호 추출 (wrapped 첫 줄 보정 -1)
        const match = error.stack?.match(/salesmap-script:(\d+)/);
        const lineNo = match ? parseInt(match[1]) - 1 : null;
        const failLine = lineNo && lineNo > 0 ? script.split("\n")[lineNo - 1]?.trim() : null;

        let msg = error.message ?? String(e);
        if (lineNo && failLine) msg += `\n[스크립트 ${lineNo}번째 줄] ${failLine}`;
        const isApiError = msg.startsWith("[GET ") || msg.startsWith("[POST ");
        msg += isApiError
          ? "\n[힌트] 엔드포인트·요청 형식 확인: salesmap-get-api-ref"
          : "\n[힌트] 스크립트 로직 오류 — 변수명·타입·null 체크 확인";
        return err(msg);
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    },
  );

  // ── Feedback ─────────────────────────────────────────────
  server.tool(
    "salesmap-report-feedback",
    "🎯 이 MCP의 문제·한계·기능 요청을 개발팀에 전달.\n🧭 필요한 도구가 없거나·도구가 부족하거나·한 작업에 연속 호출이 과도하거나·버그를 발견했을 때 사용.\n💡 작업을 막지 않음 — 전달 후 원래 작업을 계속하세요.",
    {
      category: z.enum(["bug", "missing-tool", "tool-limitation", "friction", "feature-request"])
        .describe("bug=기존 도구가 잘못 동작/에러. missing-tool=필요한 작업을 할 도구가 아예 없음. tool-limitation=도구는 있으나 기능이 부족해 목표 미달. friction=되긴 하나 연속 호출 등 비효율. feature-request=지금 막히진 않지만 개선 아이디어. ※지금 막혀있으면 feature-request 아님"),
      summary: z.string().describe("한 줄 요약"),
      detail: z.string().describe("무엇을 하려 했고 왜 막혔는지 구체적으로. 관련 도구명·시도한 접근도 여기에 포함 (파라미터 실값·고객 데이터는 넣지 말 것)"),
    },
    WRITE,
    async ({ category, summary, detail }, extra) => {
      const workspaceId = fingerprint(extra.authInfo?.token);
      logFeedback({ workspaceId, category, summary, detail });
      return ok({
        reported: true,
        message: "피드백이 개발팀에 전달되었습니다. 감사합니다. 원래 작업을 계속하세요.",
      });
    },
  );

  // ── Engagements ─────────────────────────────────────────
  server.tool(
    "salesmap-list-engagements",
    "🎯 레코드 활동 타임라인 조회 — 웹폼 제출·이메일 열람·링크 클릭·문서 열람까지 15종.\n📦 types로 유형 필터, startDate·endDate로 기간 필터.\n⏱️ **오래된 순으로 한 페이지 50건 고정.** 최근 활동을 보려면 startDate로 범위를 좁히세요.\n📖 본문·녹취 전문은 salesmap-read-engagement(type, id)로 엽니다 — 목록엔 제목·미리보기만 실립니다.",
    {
      objectType: z.enum(["people", "organization", "deal", "lead", "custom-object"])
        .describe("오브젝트 타입"),
      objectId: z.string().describe("레코드 UUID"),
      types: z.array(z.string()).optional()
        .describe(`조회할 활동 유형. 생략 시 전체. 사용 가능: ${V2_ACTIVITY_TYPES.join(", ")}. (구 이름 note·todo·recording·alimtalk·sms도 받습니다)`),
      startDate: z.string().optional()
        .describe("시작일. 날짜만 쓰면 한국시간 그날 00:00부터 (예: 2026-07-01). **최근 활동을 볼 땐 꼭 지정하세요** — 정렬이 오래된 순이라 안 주면 옛날 것부터 나옵니다"),
      endDate: z.string().optional()
        .describe("종료일. 날짜만 쓰면 한국시간 그날 23:59:59까지 — 종료일 당일이 포함됩니다"),
      after: z.string().optional()
        .describe("페이지네이션 커서. 이전 응답의 nextCursor 값. 더 볼 게 없으면 nextCursor가 null입니다."),
    },
    READ,
    async ({ objectType, objectId, types, startDate, endDate, after }, extra) => {
      try {
        const client = getClient(extra);

        if (V2_ACTIVITY) {
          return ok(await listActivityV2(client, { objectType, objectId, types, startDate, endDate, after }));
        }

        if (V3_ACTIVITY) {
          // ── v3: 유형별 분리 응답, 이메일/레코딩 데이터 인라인 포함 (마이그레이션: 2026-06-30) ──
          const apiType = V3_CORE_TYPE_MAP[objectType] ?? objectType;
          const activeTypes: ActivityType[] = (types as ActivityType[]) ?? [...ALL_ACTIVITY_TYPES];
          const body: Record<string, unknown> = { objectType: apiType, objectId };
          for (const t of activeTypes) {
            const opt: Record<string, unknown> = {};
            if (after) opt.cursor = after;
            body[t] = opt;
          }
          const res = await client.post<Record<string, unknown>>("/v3/object/activity", body);
          // note.htmlBody는 text와 내용 중복인 렌더링용 HTML — AI 분석엔 불필요하므로 제거
          const noteGroup = res.note as { data?: Array<Record<string, unknown>> } | undefined;
          if (noteGroup?.data) {
            for (const n of noteGroup.data) delete n.htmlBody;
          }
          return ok(res);
        }

        // ── v2 fallback (롤백 시 사용) ──────────────────────
        const query: Record<string, string> = { [`${objectType}Id`]: objectId };
        if (after) query.cursor = after;
        const data = await client.get<Record<string, unknown>>(`/v2/${objectType}/activity`, query);
        const key = `${objectType}ActivityList`;
        const items = (data[key] as Array<Record<string, unknown>>) ?? [];
        const compacted = items.map(item => compactRecord(item));

        const emailCache = new Map<string, string | null>();
        const memoCache = new Map<string, string | null>();
        for (const item of compacted) {
          const emailId = item.emailId as string | undefined;
          if (emailId) {
            if (!emailCache.has(emailId)) {
              try {
                const d = await client.get<{ email: Record<string, unknown> }>(`/v2/email/${emailId}`);
                emailCache.set(emailId, (d.email?.subject as string) ?? null);
              } catch { emailCache.set(emailId, null); }
            }
            const subject = emailCache.get(emailId);
            if (subject) item.emailSubject = subject;
          }
          const memoId = item.memoId as string | undefined;
          if (memoId) {
            if (!memoCache.has(memoId)) {
              try {
                const d = await client.get<{ memo: Record<string, unknown> }>(`/v2/memo/${memoId}`);
                memoCache.set(memoId, (d.memo?.text as string) ?? null);
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
