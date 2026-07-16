import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "../../../src/index";
import { oauthEnabled, getOrigin } from "../../../src/oauth";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    // OAuth 셤 활성 시 WWW-Authenticate로 디스커버리 안내 → 커스텀 커넥터가 OAuth 플로우 시작.
    // 기존 Bearer 직접 전달(JSON/mcp-remote) 경로는 이 헤더와 무관하게 그대로 동작.
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (oauthEnabled()) {
      headers["WWW-Authenticate"] =
        `Bearer resource_metadata="${getOrigin(request)}/.well-known/oauth-protected-resource"`;
    }
    return new Response(
      JSON.stringify({ error: "Authorization: Bearer <SalesMap API Token> header is required." }),
      { status: 401, headers },
    );
  }

  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  await server.connect(transport);

  return transport.handleRequest(request, {
    authInfo: { token, clientId: "salesmap-user", scopes: [] },
  });
}

export async function GET() {
  return Response.json({ status: "ok", name: "salesmap-mcp", version: "1.0.0" });
}

export async function DELETE() {
  return new Response(null, { status: 204 });
}
