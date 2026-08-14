/**
 * v3.1.0: Authentication providers — ChatGPT OAuth + GitHub Copilot OAuth.
 *
 * ChatGPT: PKCE flow against auth.openai.com → uses ChatGPT subscription.
 * GitHub Copilot: device-code flow → uses Copilot subscription.
 *
 * Both let users use their EXISTING subscriptions instead of buying API credits.
 */

import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";

// ════════════════════════════════════════════════════════════════════════════
// ChatGPT OAuth (PKCE flow)
// ════════════════════════════════════════════════════════════════════════════

const CHATGPT_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CHATGPT_AUTH_URL = "https://auth.openai.com/oauth/authorize";
const CHATGPT_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CHATGPT_API_URL = "https://chatgpt.com/backend-api/codex/responses";
const CHATGPT_CALLBACK_PORT = 1455;
const CHATGPT_SCOPES = "openid profile email offline_access";
const CHATGPT_ALLOWED_MODELS = ["gpt-5.5", "gpt-5.3-codex-spark", "gpt-5.4", "gpt-5.4-mini"];

/** Generate PKCE code verifier + challenge. */
function generatePKCE() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Start ChatGPT OAuth login flow. Returns { url, codeVerifier, waitForCode }. */
export function startChatGPTLogin() {
  const { verifier, challenge } = generatePKCE();
  const state = randomBytes(16).toString("hex");
  const redirectUri = `http://127.0.0.1:${CHATGPT_CALLBACK_PORT}/callback`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CHATGPT_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: CHATGPT_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const url = `${CHATGPT_AUTH_URL}?${params}`;

  /** Wait for the OAuth callback. Returns { code, state }. */
  const waitForCode = () => new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const parsed = new URL(req.url, `http://127.0.0.1:${CHATGPT_CALLBACK_PORT}`);
      if (parsed.pathname !== "/callback") { res.writeHead(404); res.end("Not found"); return; }

      const code = parsed.searchParams.get("code");
      const returnedState = parsed.searchParams.get("state");
      const error = parsed.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<html><body><h1>Login failed</h1><p>${error}</p><script>window.close()</script></body></html>`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><body><h1>State mismatch</h1><script>window.close()</script></body></html>");
        server.close();
        reject(new Error("OAuth state mismatch"));
        return;
      }

      if (code) {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><body><h1>✓ Login successful!</h1><p>You can close this window.</p><script>window.close()</script></body></html>");
        server.close();
        resolve({ code, state: returnedState });
      } else {
        res.writeHead(400);
        res.end("No code received");
        server.close();
        reject(new Error("No authorization code received"));
      }
    });

    server.listen(CHATGPT_CALLBACK_PORT, "127.0.0.1", () => {
      console.log(`[chatgpt-auth] Listening on port ${CHATGPT_CALLBACK_PORT}`);
    });

    server.on("error", (err) => {
      reject(new Error(`Callback server error: ${err.message}`));
    });

    // Timeout after 5 minutes
    setTimeout(() => { server.close(); reject(new Error("OAuth timeout — no response in 5 minutes")); }, 300_000).unref();
  });

  return { url, codeVerifier: verifier, waitForCode };
}

/** Exchange authorization code for access token. */
export async function exchangeChatGPTToken(code, codeVerifier) {
  const redirectUri = `http://127.0.0.1:${CHATGPT_CALLBACK_PORT}/callback`;
  const response = await fetch(CHATGPT_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CHATGPT_CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${text}`);
  }

  const tokens = await response.json();
  // Parse the id_token JWT to extract chatgpt_account_id
  let accountId = null;
  if (tokens.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64").toString());
      accountId = payload.chatgpt_account_id || null;
    } catch {}
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in * 1000),
    accountId,
  };
}

/** Refresh an expired ChatGPT token. */
export async function refreshChatGPTToken(refreshToken) {
  const response = await fetch(CHATGPT_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CHATGPT_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`);
  const tokens = await response.json();
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || refreshToken,
    expiresAt: Date.now() + (tokens.expires_in * 1000),
  };
}

/** Get ChatGPT models available to the user. */
export function getChatGPTModels() {
  return CHATGPT_ALLOWED_MODELS.map((id) => ({
    id,
    provider: "chatgpt",
    label: `ChatGPT — ${id}`,
    description: "Uses your ChatGPT subscription (not API credits)",
  }));
}

/** Check if ChatGPT access token is still valid. */
export function isChatGPTTokenValid(auth) {
  return auth && auth.expiresAt > Date.now();
}

// ════════════════════════════════════════════════════════════════════════════
// GitHub Copilot OAuth (device-code flow)
// ════════════════════════════════════════════════════════════════════════════

const COPILOT_CLIENT_ID = "Ov23li9d8NfXq8mRrA7c";
const COPILOT_DEVICE_URL = "https://github.com/login/device/code";
const COPILOT_TOKEN_URL = "https://github.com/login/oauth/access_token";
const COPILOT_MODELS_URL = "https://api.githubcopilot.com/models";

/** Start GitHub Copilot device-code login. Returns { userCode, verificationUri, waitForApproval }. */
export async function startCopilotLogin() {
  const response = await fetch(COPILOT_DEVICE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
    },
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      scope: "read:user",
    }),
  });

  if (!response.ok) throw new Error(`Device code request failed: ${response.status}`);
  const data = await response.json();

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
    interval: data.interval || 5,
    deviceCode: data.device_code,
    /** Poll for token approval. Returns { accessToken }. */
    waitForApproval: () => pollCopilotApproval(data.device_code, data.interval || 5, data.expires_in),
  };
}

/** Poll GitHub for token approval. */
async function pollCopilotApproval(deviceCode, interval, expiresIn) {
  const startTime = Date.now();
  const timeoutMs = expiresIn * 1000;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, interval * 1000));

    const response = await fetch(COPILOT_TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify({
        client_id: COPILOT_CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    if (!response.ok) throw new Error(`Token poll failed: ${response.status}`);
    const data = await response.json();

    if (data.access_token) {
      return {
        accessToken: data.access_token,
        tokenType: data.token_type,
        scope: data.scope,
      };
    }

    if (data.error === "authorization_pending") continue;
    if (data.error === "slow_down") { interval += 5; continue; }
    if (data.error === "expired_token") throw new Error("Device code expired. Please try again.");
    if (data.error === "access_denied") throw new Error("User denied the authorization request.");
    throw new Error(`Unknown OAuth error: ${data.error}`);
  }

  throw new Error("Device code expired. Please try again.");
}

/** Fetch available Copilot models. */
export async function getCopilotModels(accessToken) {
  const response = await fetch(COPILOT_MODELS_URL, {
    headers: {
      "authorization": `Bearer ${accessToken}`,
      "editor-version": "vscode/1.95.0",
      "editor-plugin-version": "mooncode/3.1.0",
      "accept": "application/json",
    },
  });

  if (!response.ok) throw new Error(`Failed to fetch Copilot models: ${response.status}`);
  const data = await response.json();

  // Filter models that are enabled in the picker
  const models = (data.models || data.data || [])
    .filter((m) => m.picker_enabled !== false && m.capabilities?.type === "chat")
    .map((m) => ({
      id: m.id || m.name,
      provider: "copilot",
      label: `Copilot — ${m.id || m.name}`,
      description: "Uses your GitHub Copilot subscription",
    }));

  return models;
}

// ════════════════════════════════════════════════════════════════════════════
// Credential storage (in-memory + optional persistence)
// ════════════════════════════════════════════════════════════════════════════

/** @type {Map<string, any>} — provider → credentials */
const credentials = new Map();

export function storeCredentials(provider, creds) {
  credentials.set(provider, creds);
}

export function getCredentials(provider) {
  return credentials.get(provider) || null;
}

export function clearCredentials(provider) {
  credentials.delete(provider);
}

export function listAuthenticatedProviders() {
  return [...credentials.keys()];
}

export function isAuthenticated(provider) {
  const creds = credentials.get(provider);
  if (!creds) return false;
  if (creds.expiresAt) return creds.expiresAt > Date.now();
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// Full ChatGPT login flow (one function)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Complete ChatGPT login flow:
 * 1. Start PKCE + callback server
 * 2. Return URL for user to open
 * 3. Wait for callback
 * 4. Exchange code for token
 * 5. Store credentials
 * Returns { url, promise } — open url, await promise.
 */
export function loginWithChatGPT() {
  const { url, codeVerifier, waitForCode } = startChatGPTLogin();

  const promise = (async () => {
    const { code } = await waitForCode();
    const creds = await exchangeChatGPTToken(code, codeVerifier);
    storeCredentials("chatgpt", creds);
    return { ok: true, provider: "chatgpt", models: getChatGPTModels() };
  })();

  return { url, promise };
}

/**
 * Complete Copilot login flow:
 * 1. Request device code
 * 2. Return userCode + verificationUri for user to visit
 * 3. Poll for approval
 * 4. Fetch available models
 * 5. Store credentials
 */
export async function loginWithCopilot() {
  const { userCode, verificationUri, waitForApproval } = await startCopilotLogin();

  const promise = (async () => {
    const tokens = await waitForApproval();
    storeCredentials("copilot", tokens);
    const models = await getCopilotModels(tokens.accessToken).catch(() => []);
    return { ok: true, provider: "copilot", models };
  })();

  return { userCode, verificationUri, promise };
}
