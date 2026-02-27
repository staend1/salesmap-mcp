import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerFieldTools } from "./tools/field";
import { registerSearchTools } from "./tools/search";
import { registerGenericTools } from "./tools/generic";
import { registerExtrasTools } from "./tools/extras";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "salesmap-mcp",
    version: "2.0.0",
  });

  // 스키마 탐색 + 검색 (2 tools)
  registerFieldTools(server);    // 1: salesmap_get_fields
  registerSearchTools(server);   // 2: salesmap_search_records

  // 범용 CRUD (4 tools)
  registerGenericTools(server);  // 3-6: list, get, create, update

  // 지원 도구 (6 tools)
  registerExtrasTools(server);   // 7-12: pipeline, quote, quotes, users, me, association

  return server;
}
