# Training MCP Server

A minimal TypeScript [Model Context Protocol](https://modelcontextprotocol.io/) server using the standard `@modelcontextprotocol/sdk` package and the Streamable HTTP transport.

## Included examples

- `add` tool — adds two numbers.
- `greet` tool — generates a greeting with optional enthusiasm.
- `get-current-time` tool — returns the current ISO timestamp.
- `info://server` resource — static Markdown server information.
- `greeting://{name}` resource template — a parameterized plain-text greeting.

## Run it

```bash
npm install
npm run build
npm start
```

During development, run `npm run dev`. The server listens on `http://127.0.0.1:3000/mcp` by default.

## HTTP transport

The MCP endpoint is `http://127.0.0.1:3000/mcp` by default. It uses server-managed sessions via the standard `Mcp-Session-Id` HTTP header and returns JSON responses, which IntelliJ IDEA can pretty-print. `GET /health` returns `{ "status": "ok" }` for deployment health checks. Set `PORT` and `HOST` to override the listening address. With the server running, use `npm run inspect` to launch the MCP Inspector against it.

## Example HTTP client configuration

Point an MCP client at the running server:

```json
{
  "mcpServers": {
    "training": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```
