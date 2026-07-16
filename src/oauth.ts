// OAuth 2.1 셤(shim) 유틸 — 커스텀 커넥터(Claude·ChatGPT·Gemini) 대응.
// 설계: docs/oauth-shim-design.md
// 핵심: DB 없이(stateless) OAuth를 돌린다 — client_id는 서명된 메타데이터,
// authorization code는 암호화된 5분 티켓, access_token은 세일즈맵 토큰 verbatim.
import {
  createHash, createHmac, randomBytes,
  createCipheriv, createDecipheriv, timingSafeEqual,
} from "node:crypto";

const SECRET = process.env.OAUTH_SHIM_SECRET;

/** OAUTH_SHIM_SECRET 미설정 시 OAuth 엔드포인트 전체 비활성 (기존 Bearer 경로는 무관) */
export function oauthEnabled(): boolean {
  return typeof SECRET === "string" && SECRET.length >= 16;
}

function key(): Buffer {
  if (!oauthEnabled()) throw new Error("OAUTH_SHIM_SECRET not configured");
  return createHash("sha256").update(SECRET as string).digest();
}

const b64url = (buf: Buffer): string => buf.toString("base64url");
const fromB64url = (s: string): Buffer => Buffer.from(s, "base64url");

function hmac(data: string): string {
  return b64url(createHmac("sha256", key()).update(data).digest());
}

// ── client_id: 서명된 클라이언트 메타데이터 (무저장 DCR) ──────────
export interface ClientMeta {
  /** redirect_uris */ r: string[];
  /** client_name */ n?: string;
  /** issued at (ms) */ iat: number;
}

export function issueClientId(redirectUris: string[], clientName?: string): string {
  const meta: ClientMeta = { r: redirectUris, iat: Date.now() };
  if (clientName) meta.n = clientName.slice(0, 60);
  const payload = b64url(Buffer.from(JSON.stringify(meta)));
  return `${payload}.${hmac(payload)}`;
}

export function verifyClientId(clientId: string): ClientMeta | null {
  const dot = clientId.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = clientId.slice(0, dot);
  const sig = clientId.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const meta = JSON.parse(fromB64url(payload).toString()) as ClientMeta;
    return Array.isArray(meta.r) && meta.r.every(u => typeof u === "string") ? meta : null;
  } catch {
    return null;
  }
}

/** code 페이로드에 client_id 전문 대신 넣을 축약 해시 */
export function clientIdHash(clientId: string): string {
  return b64url(createHash("sha256").update(clientId).digest()).slice(0, 22);
}

// ── redirect_uri 허용 목록 ──────────────────────────────────────
// 플랫폼 콜백 도메인 + 로컬 개발(mcp-remote·Claude Code·Inspector)만 허용.
const ALLOWED_REDIRECT_DOMAINS = [
  "claude.ai", "claude.com", "anthropic.com", // Claude 웹·데스크톱
  "chatgpt.com", "openai.com",                // ChatGPT 개발자 모드
  "google.com",                               // Gemini Connected Apps
];

export function redirectUriAllowed(uri: string): boolean {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  const host = u.hostname;
  // 로컬 클라이언트(CLI·Inspector)는 http 허용
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (u.protocol !== "https:") return false;
  return ALLOWED_REDIRECT_DOMAINS.some(d => host === d || host.endsWith("." + d));
}

// ── authorization code: AES-256-GCM 5분 티켓 ────────────────────
export interface CodePayload {
  /** 세일즈맵 API 토큰 */ t: string;
  /** PKCE code_challenge (S256) */ c: string;
  /** clientIdHash */ ch: string;
  /** redirect_uri */ r: string;
  /** 만료 (ms epoch) */ exp: number;
}

export const CODE_TTL_MS = 5 * 60 * 1000;

export function encryptCode(payload: CodePayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return b64url(Buffer.concat([iv, cipher.getAuthTag(), enc]));
}

export function decryptCode(code: string): CodePayload | null {
  try {
    const buf = fromB64url(code);
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString()) as CodePayload;
  } catch {
    return null;
  }
}

// ── PKCE (S256 전용 — plain 거부) ───────────────────────────────
export function verifyPkce(verifier: string, challenge: string): boolean {
  const computed = b64url(createHash("sha256").update(verifier).digest());
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── 요청 origin — vercel.app·salesmap.kr 이중 도메인 자동 대응 ────
// 메타데이터의 모든 URL을 "요청받은 호스트" 기준으로 생성 → 도메인 추가 시 코드 변경 불필요.
export function getOrigin(request: Request): string {
  const h = (name: string) => request.headers.get(name);
  const host = h("x-forwarded-host") ?? h("host") ?? new URL(request.url).host;
  const proto = h("x-forwarded-proto")?.split(",")[0].trim()
    ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

// ── CORS (브라우저 기반 MCP 클라이언트·Inspector 대응) ─────────────
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
};

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** OAuth 표준 에러 응답 (RFC 6749 §5.2) */
export function oauthError(error: string, description: string, status = 400): Response {
  return Response.json(
    { error, error_description: description },
    { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } },
  );
}
