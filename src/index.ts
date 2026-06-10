import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerFieldTools } from "./tools/field";
import { registerSearchTools } from "./tools/search";
import { registerGenericTools } from "./tools/generic";
import { registerExtrasTools } from "./tools/extras";
import { instrument } from "./telemetry";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "salesmap-mcp",
    version: "2.0.0",
  });

  // Telemetry: log every tool call (must run before tools are registered)
  instrument(server);

  // Schema + Search (3 tools)
  registerFieldTools(server);
  registerSearchTools(server);

  // CRUD (4 tools)
  registerGenericTools(server);

  // Supporting tools (19 tools)
  registerExtrasTools(server);

  return server;
}
