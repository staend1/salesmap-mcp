// OAuth authorize — "로그인 페이지" 자리에 세일즈맵 API 토큰 입력 페이지를 놓는 셤의 핵심.
// GET: 토큰 입력 폼 렌더 / POST: 토큰 검증(/v2/user/me) → code 발급 → redirect_uri로 회송.
import {
  oauthEnabled, verifyClientId, clientIdHash,
  encryptCode, CODE_TTL_MS, oauthError,
} from "../../../src/oauth";

const SALESMAP_ME = "https://salesmap.kr/api/v2/user/me";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

interface AuthReq {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  clientName: string;
}

/** 쿼리/폼 공통 검증. 실패 시 사용자에게 보여줄 에러 문자열 반환. */
function validateAuthReq(p: URLSearchParams | FormData): AuthReq | string {
  const get = (k: string) => {
    const v = p.get(k);
    return typeof v === "string" ? v : "";
  };
  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");
  const challenge = get("code_challenge");
  const method = get("code_challenge_method") || "S256";

  if (!clientId) return "client_id가 없습니다.";
  const meta = verifyClientId(clientId);
  if (!meta) return "client_id가 유효하지 않습니다. 커넥터를 다시 추가해주세요.";
  if (!redirectUri || !meta.r.includes(redirectUri)) return "redirect_uri가 등록된 값과 다릅니다.";
  if (!challenge) return "code_challenge(PKCE)가 없습니다. 이 서버는 PKCE(S256)를 요구합니다.";
  if (method !== "S256") return "code_challenge_method는 S256만 지원합니다.";

  return {
    clientId,
    redirectUri,
    state: get("state"),
    challenge,
    clientName: meta.n ?? "AI 어시스턴트",
  };
}

function page(inner: string): Response {
  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>세일즈맵 MCP 연결</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans KR",sans-serif;background:#f6f7f9;margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh}
  .card{background:#fff;border:1px solid #e4e7ec;border-radius:16px;padding:36px;max-width:420px;width:calc(100% - 40px);box-shadow:0 4px 24px rgba(16,24,40,.06)}
  h1{font-size:19px;margin:0 0 6px}
  p{font-size:14px;color:#475467;line-height:1.6;margin:8px 0}
  label{display:block;font-size:13px;font-weight:600;margin:20px 0 6px;color:#344054}
  input[type=password]{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #d0d5dd;border-radius:8px;font-size:14px;font-family:monospace}
  input[type=password]:focus{outline:2px solid #2e90fa;border-color:#2e90fa}
  button{width:100%;margin-top:20px;padding:12px;background:#101828;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
  button:hover{background:#1d2939}
  .hint{font-size:12.5px;color:#667085;margin-top:8px}
  .hint a{color:#2e90fa;text-decoration:none}
  .error{background:#fef3f2;border:1px solid #fda29b;color:#b42318;border-radius:8px;padding:10px 12px;font-size:13px;margin-top:14px}
  .client{font-weight:700;color:#101828}
</style></head><body><div class="card">${inner}</div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function renderForm(req: AuthReq, errorMsg?: string): Response {
  return page(`
  <h1>세일즈맵 MCP 연결</h1>
  <p><span class="client">${esc(req.clientName)}</span>이(가) 세일즈맵 데이터 접근을 요청합니다.</p>
  ${errorMsg ? `<div class="error">${esc(errorMsg)}</div>` : ""}
  <form method="POST">
    <input type="hidden" name="client_id" value="${esc(req.clientId)}">
    <input type="hidden" name="redirect_uri" value="${esc(req.redirectUri)}">
    <input type="hidden" name="state" value="${esc(req.state)}">
    <input type="hidden" name="code_challenge" value="${esc(req.challenge)}">
    <input type="hidden" name="code_challenge_method" value="S256">
    <label for="token">세일즈맵 API 토큰</label>
    <input type="password" id="token" name="token" autocomplete="off" required placeholder="토큰을 붙여넣으세요">
    <div class="hint">토큰 위치: 세일즈맵 → 설정 → 개인 → 연동 → API</div>
    <div class="hint"><a href="https://salesmap.kr" target="_blank" rel="noopener">세일즈맵 열기 ↗</a></div>
    <button type="submit">연결 승인</button>
  </form>`);
}

function renderFatal(message: string): Response {
  return page(`<h1>연결할 수 없습니다</h1><div class="error">${esc(message)}</div>
  <p class="hint">커넥터 설정에서 서버 URL을 확인하고 다시 시도해주세요.</p>`);
}

export async function GET(request: Request) {
  if (!oauthEnabled()) return renderFatal("이 서버에 OAuth가 설정되어 있지 않습니다.");
  const params = new URL(request.url).searchParams;
  const req = validateAuthReq(params);
  if (typeof req === "string") return renderFatal(req);
  return renderForm(req);
}

export async function POST(request: Request) {
  if (!oauthEnabled()) return oauthError("temporarily_unavailable", "OAuth is not configured.", 503);
  const form = await request.formData().catch(() => null);
  if (!form) return renderFatal("잘못된 요청입니다.");
  const req = validateAuthReq(form);
  if (typeof req === "string") return renderFatal(req);

  // 구 JSON 가이드 습관으로 "Bearer <토큰>"째로 붙여넣는 경우 방어 — 접두사 자동 제거
  const token = ((form.get("token") as string | null)?.trim() ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return renderForm(req, "API 토큰을 입력해주세요.");

  // 세일즈맵에 실제 토큰 검증 — 무효 토큰으로는 code가 발급되지 않음
  let failMsg: string | null = null;
  try {
    const res = await fetch(SALESMAP_ME, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json().catch(() => null)) as { success?: boolean; reason?: string; message?: string } | null;
    if (!res.ok || json?.success === false) {
      const reason = json?.reason ?? json?.message ?? `HTTP ${res.status}`;
      failMsg = reason.includes("IP")
        ? `${reason} — 세일즈맵 워크스페이스 관리에서 IP 제한을 확인해주세요.`
        : "토큰이 유효하지 않습니다. 세일즈맵 → 설정 → 개인 → 연동 → API에서 토큰을 다시 확인해주세요.";
    }
  } catch {
    failMsg = "세일즈맵 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.";
  }
  if (failMsg) return renderForm(req, failMsg);

  const code = encryptCode({
    t: token,
    c: req.challenge,
    ch: clientIdHash(req.clientId),
    r: req.redirectUri,
    exp: Date.now() + CODE_TTL_MS,
  });

  const dest = new URL(req.redirectUri);
  dest.searchParams.set("code", code);
  if (req.state) dest.searchParams.set("state", req.state);
  return Response.redirect(dest.toString(), 302);
}
