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
| **Schema** | `salesmap_describe_object` | Get field names, types, and options for any object |
| **Search** | `salesmap_search_records` | Filter-based search with OR/AND group logic |
| **CRUD** | `salesmap_get_record` | Get a single record |
| | `salesmap_batch_get_records` | Get up to 20 records at once |
| | `salesmap_create_record` | Create a record |
| | `salesmap_update_record` | Update a record |
| | `salesmap_delete_record` | Delete a deal/lead (2-step confirmation) |
| **Relations** | `salesmap_get_association` | Get linked records (primary + custom) |
| **Notes** | `salesmap_create_memo` | Add a note to any record |
| **Pipeline** | `salesmap_get_pipeline_ids` | List pipelines and stages |
| | `salesmap_get_lead_time` | Analyze stage dwell times |
| **Quotes** | `salesmap_get_quotes` | List quotes for a deal/lead |
| | `salesmap_create_quote` | Create and link a quote |
| **Users** | `salesmap_list_users` | List CRM users |
| | `salesmap_list_teams` | List teams |
| | `salesmap_get_current_user` | Get current token owner |
| **Utility** | `salesmap_get_record_url` | Generate CRM web URL |

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
