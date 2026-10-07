import { randomUUID } from "node:crypto";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

function createMcpServer() {
  const server = new McpServer({ name: "training-mcp-server", version: "1.0.0" });

  server.registerResource("server-info", "info://server", {
    title: "Server information", description: "A short introduction to this example MCP server.", mimeType: "text/markdown",
  }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: "# Training MCP server\n\nThis server exposes sample tools and resources over Streamable HTTP." }],
  }));

  server.registerResource("greeting", new ResourceTemplate("greeting://{name}", { list: undefined }), {
    title: "Personal greeting", description: "Returns a greeting for the name embedded in the resource URI.", mimeType: "text/plain",
  }, async (uri, variables) => ({
    contents: [{ uri: uri.href, mimeType: "text/plain", text: `Hello, ${variables.name || "friend"}! Welcome to MCP.` }],
  }));

  server.registerTool("add", {
    title: "Add numbers", description: "Add two numbers together.", inputSchema: { a: z.number(), b: z.number() },
  }, async ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] }));
  server.registerTool("greet", {
    title: "Greet a person", description: "Create a friendly greeting. Pass an optional enthusiasm level from 1 to 3.",
    inputSchema: { name: z.string().min(1).describe("Name of the person to greet"), enthusiasm: z.number().int().min(1).max(3).optional() },
  }, async ({ name, enthusiasm = 1 }) => ({ content: [{ type: "text", text: `Hello, ${name}${"!".repeat(enthusiasm)}` }] }));
  server.registerTool("get-current-time", {
    title: "Get current time", description: "Return the current time in ISO 8601 format.", inputSchema: {},
  }, async () => ({ content: [{ type: "text", text: new Date().toISOString() }] }));

  return server;
}

type Session = { transport: StreamableHTTPServerTransport };
const sessions = new Map<string, Session>();
const MAX_BODY_BYTES = 1_000_000;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse) {
  const header = req.headers["mcp-session-id"];
  const sessionId = Array.isArray(header) ? header[0] : header;
  let body: unknown;
  if (req.method === "POST") {
    try { body = await readJsonBody(req); }
    catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request body";
      sendJson(res, 400, { jsonrpc: "2.0", error: { code: -32700, message }, id: null });
      return;
    }
  }

  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (session) return session.transport.handleRequest(req, res, body);
  if (sessionId) {
    sendJson(res, 404, { jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null });
    return;
  }
  if (req.method !== "POST" || !isInitializeRequest(body)) {
    sendJson(res, 400, { jsonrpc: "2.0", error: { code: -32000, message: "Initialize the MCP session with a POST request first" }, id: null });
    return;
  }

  let transport: StreamableHTTPServerTransport;
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    enableJsonResponse: true,
    onsessioninitialized: (id) => { sessions.set(id, { transport }); },
  });
  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };
  await createMcpServer().connect(transport);
  await transport.handleRequest(req, res, body);
}

async function startHttpServer() {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";
  const httpServer = createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") return sendJson(res, 200, { status: "ok" });
    if (req.url !== "/mcp") return sendJson(res, 404, { error: "Not found" });
    handleMcpRequest(req, res).catch((error: unknown) => {
      console.error("MCP HTTP request failed:", error);
      if (!res.headersSent) sendJson(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    });
  });
  await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));
  console.error(`MCP HTTP server listening at http://${host}:${port}/mcp`);
}

async function main() {
  await startHttpServer();
}

main().catch((error: unknown) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
