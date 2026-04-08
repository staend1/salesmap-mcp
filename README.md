# SalesMap MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that connects AI assistants to [SalesMap](https://salesmap.kr) CRM. Enables natural-language access to CRM data — search records, manage deals, create notes, and more.

## Features

- **17 tools** covering schema discovery, CRUD, search, associations, pipeline analytics, and more
- **Multi-tenant** — each user authenticates with their own SalesMap API token
- **Streamable HTTP transport** — deployed on Vercel, no local build required
- **Smart responses** — null fields stripped, pipeline noise removed, context-aware error hints
- **LLM-optimized** — structured descriptions guide tool selection; pre-validation catches errors before API calls

## Quick Start

### Connect with Claude Code

```bash
claude mcp add salesmap-mcp \
  --transport http \
  --url https://salesmap-mcp.vercel.app/api/mcp \
  --header "Authorization: Bearer YOUR_SALESMAP_API_TOKEN"
```

### Connect with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "salesmap-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://salesmap-mcp.vercel.app/api/mcp",
        "--header",
        "Authorization: Bearer YOUR_SALESMAP_API_TOKEN"
      ]
    }
  }
}
```

### Connect with Cursor / VS Code

Use the same HTTP URL with the MCP extension settings for your editor.

## Tools

| Category | Tool | Description |
|----------|------|-------------|
| **Schema** | `salesmap-list-properties` | Get field names, types, and options for any object |
| **Search** | `salesmap-search-objects` | Filter-based search with OR/AND group logic |
| **CRUD** | `salesmap-read-object` | Get a single record |
| | `salesmap-batch-read-objects` | Get up to 20 records at once |
| | `salesmap-create-object` | Create a record |
| | `salesmap-update-object` | Update a record |
| | `salesmap-delete-object` | Delete a deal/lead (2-step confirmation) |
| **Relations** | `salesmap-list-associations` | Get linked records (primary + custom) |
| **Notes** | `salesmap-create-note` | Add a note to any record |
| **Pipeline** | `salesmap-get-pipelines` | List pipelines and stages |
| | `salesmap-get-lead-time` | Analyze stage dwell times |
| **Quotes** | `salesmap-get-quotes` | List quotes for a deal/lead |
| | `salesmap-create-quote` | Create and link a quote |
| **Users** | `salesmap-list-users` | List CRM users |
| | `salesmap-list-teams` | List teams |
| | `salesmap-get-user-details` | Get current token owner |
| **Utility** | `salesmap-get-link` | Generate CRM web URL |

## Architecture

```
Client (Claude, Cursor, etc.)
  → MCP over Streamable HTTP
    → Vercel (Next.js App Router, ICN region)
      → SalesMap REST API v2
```

- **Stateless** — each request creates a fresh server and transport
- **No env vars needed** — the client passes the API token via `Authorization` header
- **Rate-limited** — 120ms minimum interval between API calls, automatic 429 retry

## Supported Objects

`organization` · `people` · `deal` · `lead`

## Development

```bash
npm install
npm run dev    # http://localhost:3000/api/mcp
```

```bash
npm run build      # Type-check + build
npm run typecheck   # Type-check only
```

## Deploy

```bash
npx vercel deploy --prod
```

## License

MIT
