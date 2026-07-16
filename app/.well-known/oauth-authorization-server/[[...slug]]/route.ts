// RFC 8414 Authorization Server Metadata — 우리 서버가 인증 서버 역할까지 겸함(셤).
// 모든 URL은 요청 origin 기준 → vercel.app·salesmap.kr 이중 도메인 자동 대응.
import { getOrigin, CORS_HEADERS, corsPreflight, oauthEnabled } from "../../../../src/oauth";

export function GET(request: Request) {
  if (!oauthEnabled()) return new Response(null, { status: 404 });
  const origin = getOrigin(request);
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    },
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" } },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
