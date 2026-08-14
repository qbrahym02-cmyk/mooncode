/**
 * v3.4.0: MCP OAuth — PKCE flow + client registration + token storage.
 *
 * Enables connecting to remote MCP servers that require OAuth authentication.
 * Supports: PKCE, dynamic client registration, token refresh, browser flow.
 */

import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:http";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";

/** @type {Map<string, OAuthTokens>} — serverId → tokens */
const tokenStore = new Map();

/**
 * Generate PKCE verifier + challenge.
 */
function generatePKCE() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * Dynamic client registration with an MCP server.
 * @returns {Promise<{clientId, clientSecret, redirectUri}>}
 */
export async function registerClient(authServerUrl, redirectUri) {
  const response = await fetch(`${authServerUrl}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "Moon Code",
      scope: "mcp:tools mcp:resources",
    }),
  });

  if (!response.ok) throw new Error(`Client registration failed: ${response.status}`);
  const data = await response.json();
  return {
    clientId: data.client_id,
    clientSecret: data.client_secret,
    redirectUri,
  };
}

/**
 * Start OAuth flow for an MCP server.
 * @returns {{ url, codeVerifier, waitForCode }}
 */
export function startMcpOAuth(authServerUrl, clientId, redirectUri, scopes = "mcp:tools") {
  const { verifier, challenge } = generatePKCE();
  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const url = `${authServerUrl}/authorize?${params}`;

  const waitForCode = () => new Promise((resolve, reject) => {
    const port = new URL(redirectUri).port || 8080;
    const server = createServer((req, res) => {
      const parsed = new URL(req.url, `http://127.0.0.1:${port}`);
      if (parsed.pathname !== new URL(redirectUri).pathname) { res.writeHead(404); res.end(); return; }
      const code = parsed.searchParams.get("code");
      const error = parsed.searchParams.get("error");
      if (error) { res.writeHead(200, { "content-type": "text/html" }); res.end(`<h1>Auth failed</h1><p>${error}</p>`); server.close(); reject(new Error(error)); return; }
      if (code) { res.writeHead(200, { "content-type": "text/html" }); res.end("<h1>✓ MCP connected!</h1><script>window.close()</script>"); server.close(); resolve({ code, state }); return; }
      res.writeHead(400); res.end("No code"); server.close(); reject(new Error("No code"));
    });
    server.listen(port, "127.0.0.1");
    setTimeout(() => { server.close(); reject(new Error("OAuth timeout")); }, 300_000).unref();
  });

  return { url, codeVerifier: verifier, waitForCode };
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeMcpToken(tokenUrl, code, redirectUri, codeVerifier, clientId) {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: clientId,
    }),
  });

  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
  return response.json();
}

/**
 * Refresh an expired MCP token.
 */
export async function refreshMcpToken(tokenUrl, refreshToken, clientId) {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });

  if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`);
  return response.json();
}

/**
 * Store tokens for an MCP server.
 */
export function storeMcpTokens(serverId, tokens) {
  tokenStore.set(serverId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in * 1000),
    scope: tokens.scope,
  });
}

/**
 * Get stored tokens for an MCP server.
 */
export function getMcpTokens(serverId) {
  return tokenStore.get(serverId) || null;
}

/**
 * Check if tokens are valid (not expired).
 */
export function areTokensValid(serverId) {
  const tokens = tokenStore.get(serverId);
  return tokens && tokens.expiresAt > Date.now();
}

/**
 * Get auth status for an MCP server.
 */
export function getMcpAuthStatus(serverId) {
  const tokens = tokenStore.get(serverId);
  if (!tokens) return "not_authenticated";
  if (tokens.expiresAt <= Date.now()) return "expired";
  return "authenticated";
}

/**
 * Remove stored tokens (logout).
 */
export function removeMcpTokens(serverId) {
  tokenStore.delete(serverId);
}
