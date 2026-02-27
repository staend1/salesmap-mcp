import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { SalesMapClient } from "./client.js";
import type { Env } from "./types.js";

import { registerPeopleTools } from "./tools/people.js";
import { registerOrganizationTools } from "./tools/organization.js";
import { registerDealTools } from "./tools/deal.js";
import { registerLeadTools } from "./tools/lead.js";
import { registerCustomObjectTools } from "./tools/custom-object.js";
import { registerSearchTools } from "./tools/search.js";
import { registerSequenceTools } from "./tools/sequence.js";
import { registerFieldTools } from "./tools/field.js";
import { registerPipelineTools } from "./tools/pipeline.js";
import { registerProductTools } from "./tools/product.js";
import { registerWebformTools } from "./tools/webform.js";
import { registerTodoTools } from "./tools/todo.js";
import { registerMemoTools } from "./tools/memo.js";
import { registerUserTools } from "./tools/user.js";
import { registerEmailTools } from "./tools/email.js";
import { registerHistoryTools } from "./tools/history.js";
import { registerActivityTools } from "./tools/activity.js";
import { registerAssociationTools } from "./tools/association.js";
import { registerQuoteTools } from "./tools/quote.js";

function createServer(env: Env): McpServer {
  const server = new McpServer({
    name: "salesmap-mcp",
    version: "1.0.0",
  });

  const client = new SalesMapClient(env);

  // Phase 2: 핵심 CRUD (20 tools)
  registerPeopleTools(server, client);        // 5 tools (list, get, create, update, find-by-email)
  registerOrganizationTools(server, client);  // 4 tools
  registerDealTools(server, client);          // 5 tools (list, get, create, update, quotes)
  registerLeadTools(server, client);          // 5 tools (list, get, create, update, quotes)
  registerCustomObjectTools(server, client);  // 4 tools

  // Phase 3: 검색/조회 + 시퀀스 (9 tools)
  registerSearchTools(server, client);        // 1 tool
  registerSequenceTools(server, client);      // 5 tools
  registerFieldTools(server, client);         // 1 tool
  registerPipelineTools(server, client);      // 1 tool
  registerQuoteTools(server, client);         // 1 tool

  // Phase 4: 지원 엔티티 (8 tools)
  registerProductTools(server, client);       // 2 tools
  registerWebformTools(server, client);       // 2 tools
  registerTodoTools(server, client);          // 1 tool
  registerMemoTools(server, client);          // 1 tool
  registerUserTools(server, client);          // 3 tools (list, me, teams)

  // Phase 5: 나머지 (5 tools)
  registerEmailTools(server, client);         // 1 tool
  registerHistoryTools(server, client);       // 1 tool
  registerActivityTools(server, client);      // 1 tool
  registerAssociationTools(server, client);   // 2 tools

  return server;
}

export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", name: "salesmap-mcp", version: "1.0.0" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // MCP endpoint
    const server = createServer(env);
    return createMcpHandler(server, { route: "/mcp" })(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
