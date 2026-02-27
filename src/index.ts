import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerPeopleTools } from "./tools/people";
import { registerOrganizationTools } from "./tools/organization";
import { registerDealTools } from "./tools/deal";
import { registerLeadTools } from "./tools/lead";
import { registerCustomObjectTools } from "./tools/custom-object";
import { registerSearchTools } from "./tools/search";
import { registerSequenceTools } from "./tools/sequence";
import { registerFieldTools } from "./tools/field";
import { registerPipelineTools } from "./tools/pipeline";
import { registerProductTools } from "./tools/product";
import { registerWebformTools } from "./tools/webform";
import { registerTodoTools } from "./tools/todo";
import { registerMemoTools } from "./tools/memo";
import { registerUserTools } from "./tools/user";
import { registerEmailTools } from "./tools/email";
import { registerHistoryTools } from "./tools/history";
import { registerActivityTools } from "./tools/activity";
import { registerAssociationTools } from "./tools/association";
import { registerQuoteTools } from "./tools/quote";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "salesmap-mcp",
    version: "1.0.0",
  });

  // 핵심 CRUD (23 tools)
  registerPeopleTools(server);        // 5 tools
  registerOrganizationTools(server);  // 4 tools
  registerDealTools(server);          // 5 tools
  registerLeadTools(server);          // 5 tools
  registerCustomObjectTools(server);  // 4 tools

  // 검색/조회 + 시퀀스 (9 tools)
  registerSearchTools(server);        // 1 tool
  registerSequenceTools(server);      // 5 tools
  registerFieldTools(server);         // 1 tool
  registerPipelineTools(server);      // 1 tool
  registerQuoteTools(server);         // 1 tool

  // 지원 엔티티 (8 tools)
  registerProductTools(server);       // 2 tools
  registerWebformTools(server);       // 2 tools
  registerTodoTools(server);          // 1 tool
  registerMemoTools(server);          // 1 tool
  registerUserTools(server);          // 3 tools

  // 나머지 (5 tools)
  registerEmailTools(server);         // 1 tool
  registerHistoryTools(server);       // 1 tool
  registerActivityTools(server);      // 1 tool
  registerAssociationTools(server);   // 2 tools

  return server;
}
