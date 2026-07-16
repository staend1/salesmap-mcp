// RFC 9728 Protected Resource Metadata — MCP 클라이언트가 401 후 여기서 인증 서버를 발견.
// [[...slug]]: 클라이언트가 /.well-known/oauth-protected-resource/api/mcp 처럼
// 리소스 경로를 붙여 조회하는 변형까지 커버.
import { getOrigin, CORS_HEADERS, corsPreflight, oauthEnabled } from "../../../../src/oauth";

export function GET(request: Request) {
  if (!oauthEnabled()) return new Response(null, { status: 404 });
  const origin = getOrigin(request);
  return Response.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
    },
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" } },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
