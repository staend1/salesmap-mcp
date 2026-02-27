import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "../../../src/index";

export async function POST(request: Request) {
  // Bearer 토큰 추출
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Authorization: Bearer <SalesMap API Token> 헤더가 필요합니다." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Stateless: 요청마다 새 서버+트랜스포트 생성
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
  // Stateless — session 관리 없음
  return new Response(null, { status: 204 });
}
