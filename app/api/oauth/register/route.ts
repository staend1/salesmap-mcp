// RFC 7591 Dynamic Client Registration — 무저장.
// client_id 자체에 redirect_uris를 서명해 내장 → 등록 DB 불필요.
import { oauthEnabled, issueClientId, redirectUriAllowed, CORS_HEADERS, corsPreflight, oauthError } from "../../../../src/oauth";

export async function POST(request: Request) {
  if (!oauthEnabled()) return oauthError("temporarily_unavailable", "OAuth is not configured on this server.", 503);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const uris = body?.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every(u => typeof u === "string")) {
    return oauthError("invalid_client_metadata", "redirect_uris (non-empty string array) is required.");
  }
  const blocked = (uris as string[]).filter(u => !redirectUriAllowed(u));
  if (blocked.length > 0) {
    return oauthError("invalid_redirect_uri", `허용되지 않는 redirect_uri: ${blocked.join(", ")}`);
  }

  const clientName = typeof body?.client_name === "string" ? body.client_name : undefined;
  const clientId = issueClientId(uris as string[], clientName);

  return Response.json(
    {
      client_id: clientId,
      redirect_uris: uris,
      ...(clientName ? { client_name: clientName } : {}),
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    },
    { status: 201, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
