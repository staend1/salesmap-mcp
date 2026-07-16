// RFC 9728 Protected Resource Metadata — MCP 클라이언트가 401 후 여기서 인증 서버를 발견.
// [[...slug]]: 클라이언트가 /.well-known/oauth-protected-resource/mcp 처럼
// 리소스 경로를 붙여 조회하는 변형까지 커버 — 그 경우 해당 경로를 resource로 에코.
import { getOrigin, CORS_HEADERS, corsPreflight, oauthEnabled } from "../../../../src/oauth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  if (!oauthEnabled()) return new Response(null, { status: 404 });
  const origin = getOrigin(request);
  const { slug } = await params;
  // 기본(정식 안내) 경로는 /mcp — 클라이언트가 /api/mcp 등으로 조회하면 그 경로를 그대로 반영
  const resourcePath = slug?.length ? `/${slug.join("/")}` : "/mcp";
  return Response.json(
    {
      resource: `${origin}${resourcePath}`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
    },
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" } },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
