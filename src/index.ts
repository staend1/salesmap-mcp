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

  // Schema + Search (2 tools)
  registerFieldTools(server);
  registerSearchTools(server);

  // CRUD (5 tools)
  registerGenericTools(server);

  // Supporting tools (14 tools)
  registerExtrasTools(server);

  return server;
}
