/**
 * v3.1.0: ACP (Agent Client Protocol) — basic support.
 * Allows Moon Code to be driven by ACP-compatible clients (Zed, etc.).
 */
export const ACP_VERSION = "0.1";
export const ACP_CAPABILITIES = { agent: true, tool: true, permission: true, directory: true, content: true, event: true, usage: true };
export function createACPResponse(type, data) { return { jsonrpc: "2.0", result: { type, data } }; }
export function createACPError(code, message) { return { jsonrpc: "2.0", error: { code, message } }; }
export async function handleACPRequest(request, context) {
  const { method, params, id } = request;
  switch (method) {
    case "initialize": return { jsonrpc: "2.0", id, result: { protocolVersion: ACP_VERSION, capabilities: ACP_CAPABILITIES, serverInfo: { name: "mooncode", version: "3.1.0" } } };
    case "agent/list": return { jsonrpc: "2.0", id, result: { agents: context.agents || [] } };
    case "session/create": return { jsonrpc: "2.0", id, result: { sessionId: crypto.randomUUID() } };
    case "session/prompt": return { jsonrpc: "2.0", id, result: { accepted: true } };
    case "tool/list": return { jsonrpc: "2.0", id, result: { tools: context.tools || [] } };
    case "permission/request": return { jsonrpc: "2.0", id, result: { action: "allow" } };
    default: return createACPError(-32601, `Method not found: ${method}`);
  }
}
