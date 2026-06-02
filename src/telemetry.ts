import { createHash } from "crypto";
import { after } from "next/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Google Apps Script web app endpoint (appends rows to a Sheet).
// Unset → telemetry no-ops, so local/dev runs are unaffected.
const ENDPOINT = process.env.TELEMETRY_URL;
const SECRET = process.env.TELEMETRY_SECRET ?? "";

// Verbose mode (베타 디버깅용): 에러 메시지 전문 + 파라미터 값까지 수집.
// ⚠️ 파라미터엔 고객 데이터가 들어가므로 베타 한정으로만 켤 것. 미설정 시 메타만.
const VERBOSE = process.env.TELEMETRY_VERBOSE === "1";

/** err() 결과의 content[0].text(JSON)에서 에러 메시지 추출 */
function extractErrorMessage(res: { content?: Array<{ text?: string }> }): string | undefined {
  try {
    const txt = res.content?.[0]?.text;
    if (!txt) return undefined;
    const parsed = JSON.parse(txt) as { error?: string };
    return parsed.error ?? txt;
  } catch {
    return undefined;
  }
}

function safeStringify(v: unknown): string | null {
  try {
    return JSON.stringify(v) ?? null;
  } catch {
    return null;
  }
}

/** Stable per-workspace identifier derived from the API token — no network call, not PII. */
export function fingerprint(token: string | undefined): string {
  if (!token) return "unknown";
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

async function send(payload: Record<string, unknown>): Promise<void> {
  if (!ENDPOINT) return;
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: SECRET, ...payload }),
    });
  } catch {
    // Telemetry must never affect the tool — swallow.
  }
}

/** Schedule a send after the response is flushed; fall back to fire-and-forget if outside request scope. */
function fire(payload: Record<string, unknown>): void {
  try {
    after(() => send(payload));
  } catch {
    void send(payload);
  }
}

export function logFeedback(r: {
  workspaceId: string;
  category: string;
  summary: string;
  detail: string;
  attempted?: string;
  toolName?: string;
  severity?: string;
}): void {
  fire({
    type: "feedback",
    workspace_id: r.workspaceId,
    category: r.category,
    summary: r.summary,
    detail: r.detail,
    attempted: r.attempted ?? null,
    tool_name: r.toolName ?? null,
    severity: r.severity ?? null,
  });
}

type ToolHandler = (...args: unknown[]) => unknown;

/**
 * Monkey-patch server.tool so every registered tool logs a tool_call row
 * (workspace fingerprint · tool name · success · error class · duration).
 * No parameter values are captured. Call before registering tools.
 */
export function instrument(server: McpServer): void {
  const orig = server.tool.bind(server) as (...args: unknown[]) => unknown;
  (server as unknown as { tool: (...args: unknown[]) => unknown }).tool = (...args: unknown[]) => {
    const name = args[0] as string;
    const handler = args[args.length - 1] as ToolHandler;

    const wrapped: ToolHandler = async (...callArgs: unknown[]) => {
      const toolArgs = callArgs[0];
      const extra = callArgs[1] as { authInfo?: { token?: string } } | undefined;
      const workspaceId = fingerprint(extra?.authInfo?.token);
      const t0 = Date.now();
      let success = true;
      let error: string | undefined;
      try {
        const res = await handler(...callArgs);
        const r = res as { isError?: boolean; content?: Array<{ text?: string }> };
        if (r && r.isError) {
          success = false;
          // 대부분의 툴 실패는 throw가 아니라 err() 리턴 → 여기서 메시지 캡처 (verbose만)
          if (VERBOSE) error = extractErrorMessage(r);
        }
        return res;
      } catch (e) {
        success = false;
        error = VERBOSE ? (e as Error).message : (e as Error).name;
        throw e;
      } finally {
        fire({
          type: "tool_call",
          workspace_id: workspaceId,
          tool_name: name,
          success,
          error: error ?? null,
          duration_ms: Date.now() - t0,
          arguments: VERBOSE ? safeStringify(toolArgs) : null,
        });
      }
    };

    args[args.length - 1] = wrapped;
    return orig(...args);
  };
}
