// OAuth 토큰 교환 — code(암호화 티켓) + PKCE verifier → access_token(세일즈맵 토큰 verbatim).
// access_token이 세일즈맵 토큰 그대로라 기존 MCP Bearer 처리 경로 무변경.
import { oauthEnabled, decryptCode, verifyPkce, clientIdHash, CORS_HEADERS, corsPreflight, oauthError } from "../../../../src/oauth";

async function readParams(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  const out: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === "string") out[k] = v; });
  return out;
}

export async function POST(request: Request) {
  if (!oauthEnabled()) return oauthError("temporarily_unavailable", "OAuth is not configured on this server.", 503);

  const p = await readParams(request);

  if (p.grant_type !== "authorization_code") {
    return oauthError("unsupported_grant_type", "authorization_code만 지원합니다.");
  }
  if (!p.code || !p.code_verifier || !p.client_id) {
    return oauthError("invalid_request", "code, code_verifier, client_id는 필수입니다.");
  }

  const payload = decryptCode(p.code);
  if (!payload) return oauthError("invalid_grant", "code가 유효하지 않습니다.");
  if (Date.now() > payload.exp) return oauthError("invalid_grant", "code가 만료되었습니다 (5분). 처음부터 다시 연결해주세요.");
  if (clientIdHash(p.client_id) !== payload.ch) return oauthError("invalid_grant", "client_id가 code 발급 시점과 다릅니다.");
  if (p.redirect_uri && p.redirect_uri !== payload.r) return oauthError("invalid_grant", "redirect_uri가 code 발급 시점과 다릅니다.");
  if (!verifyPkce(p.code_verifier, payload.c)) return oauthError("invalid_grant", "PKCE 검증 실패.");

  return Response.json(
    { access_token: payload.t, token_type: "Bearer" },
    { headers: { ...CORS_HEADERS, "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
