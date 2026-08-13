# Changelog

## v0.9.0 — 2026-08-13

### Security (critical)
- **ED25519 plugin signing** replaces the v0.6-0.8 SHA-256 self-hash that was misleadingly named "verified". Real public-key cryptography via `node:crypto`'s `sign()`/`verify()`. The Zetora team holds the private key; the public key ships with Zetora. Plugins signed by the private key can be verified by anyone. Malicious plugins cannot be "signed" by an attacker without the private key.
- New `PluginSigner` class in `packages/security/src/index.js` with `generateKeys()`, `sign()`, `verify()`.
- New `TrustRegistry` tracks trusted author public keys with trust levels (`trusted`/`first-party`).
- `PluginRegistry` (v0.9) uses honest naming:
  - `signedByAuthor`: true only when signature is valid AND author is trusted.
  - `signatureValid`: cryptographic validity of the signature.
  - `authorTrusted`: author is in the trust registry.
  - `verified`: forced to `false` for legacy SHA-256 hashes (breaks the misleading pattern).
  - `signatureType`: `ed25519` | `sha256-legacy` | `none`.
  - `warning` field clearly states when a plugin is NOT cryptographically verified.
- Migration: old `verified: true` (SHA-256) becomes `verified: false` with `trustLevel: "legacy_self_hash"`. Authors must re-sign with ED25519 to regain trust.

### Packages promoted to first-class
- `packages/collab` (added in v0.7): collaborative editing with Lamport timestamps, operation log replay, conflict detection.
- `packages/lsp` (added in v0.6): ESLint + TypeScript diagnostics in one-shot mode, auto-install ESLint.
- `packages/plugins` (added in v0.6, hardened in v0.9): plugin manifest registry with signature verification.
- `packages/search-index` (added in v0.6): trigram-based symbol search with ranking.
- `packages/todos` (added in v0.6): session-scoped todo list with priorities and progress summary.
- `packages/security` (added in v0.6, expanded in v0.9): ED25519, trust registry, audit log, rate limiter, secret redaction.

### Tests
- `tests/v6.test.js`: search-index, todos, plugin registry.
- `tests/v7.test.js`: plugin signing round-trip, tamper detection, collab sessions.
- `tests/security.test.js`: ED25519 sign/verify, trust registry, audit log, rate limiter, secret redaction (11 patterns).
- All 118 tests pass.

### Known gaps (documented for honesty)
- CHANGELOG was not updated for v0.6-0.8; this entry retroactively documents them.
- `subagent` forces `provider: "demo"` — should inherit parent's provider. (Fixed in v0.9.1.)
- `parseAST` is regex-based — fragile for TypeScript generics, decorators, multi-line functions. (Planned: migrate to `acorn`.)
- `server.js` is 55KB / ~1,800 lines — needs splitting into `routes/`. (Planned for v0.9.1.)
- `collab` is not a real CRDT — concurrent edits to the same line lose data. (Planned: migrate to Y.js or Automerge.)

## v0.8.0 — 2026-08-13

### Security hardening (interim)
- Continued refinement of the v0.6 plugin trust model in preparation for v0.9 ED25519.
- Internal audit of SHA-256 "verified" field — identified as misleading; queued for replacement.
- No new user-facing features; this was a stabilization release.

### Note
- This release was not publicly documented at the time. This entry is retroactive.

## v0.7.0 — 2026-08-13

### Collaborative editing (new `packages/collab`)
- `CollabSession` with operation-based merge using Lamport timestamps (logical clock).
- Each edit stamped with `max(local, message) + 1` for deterministic ordering across peers.
- Operation log is replayable: new peers reconstruct the document by replaying from the beginning.
- Conflict detection: operations from different peers targeting overlapping ranges are flagged.
- `CollabRegistry` tracks active sessions; `getSnapshot()` returns document, peers, operation count, vector clock, conflict count.
- **Limitation**: not a full CRDT (Y.js/Automerge). Concurrent edits to the same line use "last operation wins" — data loss is possible. Documented in code comments.

### Git worktrees and commit graph (new in `packages/git`)
- `listWorktrees()`, `addWorktree(name, { base })`, `removeWorktree(name)` for parallel agent work on separate branches.
- `graph({ limit })` returns structured commit graph (commits + edges + branches) for visual rendering.
- `readFileAtRef(ref, filePath)` for diffing current file against its last checkpointed version.

### Tests
- `tests/v7.test.js`: plugin install + verify + tamper detection, collab session SSE-style broadcast, collab registry join/leave, todo progress edge cases, search index stats.
- `tests/git2.test.js`: worktrees, graph.

### Note
- This release was not publicly documented at the time. This entry is retroactive.

## v0.6.0 — 2026-08-13

### Search index (new `packages/search-index`)
- `SearchIndex` builds a trigram-based inverted index over workspace files.
- `indexAll(files)` indexes up to 5,000 files; `search(query, { limit })` returns ranked results by trigram overlap.
- `stats()` returns `{ files, trigrams }` for monitoring.
- Min 3 chars for trigram match; empty queries return `[]` gracefully.
- New `search_index` tool in the agent catalog (`Risk.OBSERVE`).

### Session todos (new `packages/todos`)
- `TodoList` with `add`, `update`, `remove`, `clear`, `list`, `summary`.
- Priorities: `low` / `normal` / `high`. Statuses: `pending` / `in_progress` / `completed` / `skipped`.
- `summary()` returns `{ total, completed, pending, inProgress, skipped, progress }` (progress is 0-100 integer).
- New `todo_update` tool in the agent catalog (`Risk.OBSERVE`).

### LSP diagnostics (new `packages/lsp`)
- `LspDiagnostics` runs ESLint and `tsc --noEmit` in one-shot mode and parses output into a unified diagnostic format.
- `status()` reports which linters are available; `install()` attempts `npm install --save-dev eslint`.
- `diagnose(target)` combines ESLint + TypeScript diagnostics with a clear `installable: true` hint when ESLint is missing.
- New endpoints: `GET /api/lsp/status`, `POST /api/lsp/diagnose`, `POST /api/lsp/install`.

### Plugin registry (new `packages/plugins`, hardened in v0.9)
- `PluginRegistry` reads `plugin.json` manifests from `.zetora/plugins/<id>/`.
- `install()`, `uninstall()`, `list()`, `get()`, `hasCapability()`.
- Capabilities: `tools`, `ui`, `provider`, `skills`, `artifacts`.
- **v0.6 limitation** (fixed in v0.9): the `verified` field was a self-computed SHA-256 hash that anyone could forge. It was misleadingly named. v0.9 replaces it with ED25519 signing.

### Security package (new `packages/security`, expanded in v0.9)
- `AuditLog`: immutable NDJSON audit log at `.zetora/audit.log` with batching (50 entries or 2s).
- `RateLimiter`: sliding-window counter per identifier (IP or session). HTTP headers: `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, `retry-after`.
- `redactSecrets()`: 11 patterns for API keys, tokens, private keys, passwords. Returns `{ redacted, found }`.
- `detectSecrets()`: returns list of detected secret types without values.
- `withRedaction()`: middleware wrapper for log writers.
- New endpoints: `GET /api/audit`, `GET /api/audit/stats`.

### Tests
- `tests/v6.test.js`: search-index (build, rank, stats, empty query), todos (add/update/remove/summary), plugin registry install/list/uninstall, collab session join/edit/snapshot, collab registry create/list/close.
- All tests pass.

### Note
- This release was not publicly documented at the time. This entry is retroactive.

## v0.5.0 — 2026-08-13

### New tools
- **`grep`**: advanced regex search with glob filtering (`*.js`, `**/​*.ts`), configurable context lines before/after, case sensitivity, and max results. More powerful than `search_text`.
- **`fetch_url`**: HTTP(S) fetch with method, headers, body, maxBytes cap. HTML responses are stripped to readable text by default (`asText: false` preserves raw HTML). 30s timeout, 2MB max.
- **`run_tests`**: auto-detects the test runner from `package.json` (npm scripts → vitest → jest → `node --test` fallback) and returns structured output. Accepts an optional `pattern` to filter tests.
- **`parse_ast`**: lightweight regex-based JS/TS parser that extracts imports, exports, functions, and classes with their line positions. `detail: "summary"` returns names only; `"full"` includes params.
- **`read_file`**: now accepts optional `startLine` and `endLine` for reading a slice of a file without loading the whole thing.
- **`search_text`**: now accepts `contextLines` (0-5) to include surrounding lines with each match.

### Auto-fix (new `packages/autofix`)
- `AutoFix` class detects and repairs common issues in source files without external dependencies.
- **Built-in fixers**: `trailing-newline`, `tabs-to-spaces` (2-space), `json` (pretty-print with sorted keys).
- **External integration**: when ESLint or Prettier binaries exist in `node_modules/.bin/`, they are invoked for deeper fixes.
- **Verification**: after applying fixes, runs `node --check` on JS files. If verification fails, the original content is restored atomically.
- **Dry-run mode**: `dryRun: true` reports what would be fixed without writing.
- **Directory mode**: pass a directory path to fix all supported files (up to 50) recursively.
- New endpoints: `POST /api/autofix`, `POST /api/diagnose`.
- New `auto_fix` tool in the agent catalog (Risk.MODIFY, requires approval).

### Error diagnosis
- `diagnoseError(output)` scans command output for 8 known error patterns: missing module, syntax error, type error, reference error, missing file, permission denied, port conflict, test failure.
- Returns actionable hints the agent can use to self-correct.
- `POST /api/tests/run` automatically runs diagnosis on test output and includes `diagnostics` in the response.

### Subagents
- New `spawn_subagent` tool (Risk.EXTERNAL, requires approval). Spawns a nested agent loop with a fresh conversation, bounded steps (max 8), and returns the final text + step count + usage.
- Depth limit = 1: sub-agents cannot spawn further sub-agents, preventing runaway recursion.

### Skills v2
- **CRUD**: `POST /api/skills/create`, `PUT /api/skills/update`, `DELETE /api/skills/delete`. Validates id format (`^[a-z0-9-]+$`) and manifest schema (prompt required, mode must be one of build/plan/design/review).
- **Composition**: skills can declare `compose: ["skill-a", "skill-b"]` to chain their prompts. `resolveComposition` returns the ordered chain with cycle prevention.
- **Default values**: `{{name|fallback}}` syntax provides defaults when an input is not supplied.
- **Token cleanup**: unsubstituted `{{...}}` tokens are stripped from the final prompt.
- **Execution history**: `recordInvocation` + `getHistory` track the last 100 invocations. `GET /api/skills/history`.
- **Two new builtins**: `auto-fix` (uses the auto_fix tool) and `explain-code` (uses parse_ast).
- **listAll**: merges builtins with user skills, deduplicating by id.

### Updated tools
- `read_file` now supports line-range slicing.
- `search_text` now supports `contextLines` and `caseSensitive`.
- `run_command` now accepts a relative `cwd`.

### Tests
- New `tests/tools.test.js` (15 tests): grep, glob filtering, fetchUrl rejection, parseAST, runTests, AutoFix (newline, tabs, JSON, dryRun, verify), diagnoseError (3 patterns), FIXERS idempotency.
- Updated `tests/skills.test.js` (17 tests): CRUD, validation, composition, cycles, defaults, token cleanup, history, listAll.
- All 68 tests pass.

## v0.4.0 — 2026-08-13

### Context files (new `packages/context`)
- `ContextFiles` class manages a manifest of standing workspace files (up to 8, max 64KB each) that get prepended to the system prompt on every model call. Typical use: coding standards, project conventions, build instructions.
- Manifest stored at `.zetora/context.json`; the actual files live in the workspace so they can be edited with normal tools.
- Lazy pruning: missing files are silently dropped from the manifest on the next `assemble()`.
- New endpoints: `GET /api/context`, `POST /api/context`, `DELETE /api/context`.

### Compaction (new `packages/context/src/compactor.js`)
- `Compactor` replaces the older slice of a long conversation with a model-generated summary, preserving the most recent `keepRecent` (default 8) messages verbatim.
- Triggers automatically when history exceeds `threshold` (default 30 messages). Manual trigger via `POST /api/compact`.
- Falls back to a mechanical summary (count of user/assistant/tool messages) when the summarizer fails or is unavailable.
- New kernel event `CONTEXT_COMPACTED` exposes the summary and compacted count to clients.

### MCP client (new `packages/mcp`)
- `McpClient` speaks JSON-RPC 2.0 over stdio: `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, notifications.
- `McpRegistry` tracks multiple named clients by id. Config persists to `.zetora/mcp.json`.
- Tools from connected servers are namespaced as `mcp.<serverId>.<toolName>` to avoid collisions with native tools.
- The agent runner exposes MCP tools alongside native tools, but routes every MCP call through approval first (treated as `Risk.EXTERNAL`).
- Best-effort auto-connect on server startup.
- New endpoints: `GET /api/mcp`, `POST /api/mcp/servers`, `DELETE /api/mcp/servers/:id`, `POST /api/mcp/connect/:id`, `GET /api/mcp/tools`.

### Skill manifests (new `packages/skills`)
- `SkillRegistry` reads `workspace/skills/<id>/skill.json` manifests describing reusable skills: `name`, `description`, `mode`, `inputs[]`, `prompt` template.
- `renderPrompt` substitutes `{{inputName}}` and `{{inputs.inputName}}` tokens with provided values.
- `validateInputs` flags missing required fields.
- Three built-in skills ship in code (`analyze-project`, `design-artifact`, `quality-check`) and are always available even before any workspace manifest exists.
- Agent runner injects the skill list into the system prompt and exposes an `invoke_skill` tool the model can call.
- New endpoints: `GET /api/skills`, `POST /api/skills/invoke`.

### Design-system tokens (new `packages/design`)
- `DesignTokens` reads `workspace/design-tokens.json` containing `colors`, `typography`, `spacing`, `radii`, `shadows`.
- `toCss` emits a `:root { --name: value }` block.
- `toReferenceHtml` returns a self-contained visual reference sheet (swatches, font samples, spacing bars).
- `toPromptSummary` returns a compact plain-text summary injected into the system prompt in design mode.
- New endpoints: `GET /api/design-tokens`, `POST /api/design-tokens`, `GET /api/design-tokens/reference`, `GET /api/design-tokens/css`.

### Vision-aware provider test
- `POST /api/providers/test` now accepts an optional `image` (data URI) and `prompt`. When an image is present, the test exercises the full multimodal path against the configured provider so the user can confirm the model can see and respond to the image.

### Isolated preview workers
- The inspector iframe now uses a stricter `sandbox="allow-scripts allow-pointer-lock"` plus `referrerpolicy="no-referrer"`. `allow-same-origin` is intentionally omitted so scripts inside the preview cannot reach the parent document's cookies or storage.

### UI
- New "Resources" dialog (`Cmd/Ctrl+R`) with four tabs: Context files, Skills, MCP servers, Design tokens.
- Context tab: list standing context files, add by path+description, remove.
- Skills tab: discover built-in and workspace skills; click "تشغيل" to invoke, which fills the composer with the rendered prompt and switches the session mode if the skill requires it.
- MCP tab: shows connected servers with online/offline status.
- Design tokens tab: live-rendered reference sheet inside the dialog.
- New "Compact" header button (`Cmd/Ctrl+C`) triggers manual compaction of the current session.
- New rail button for Resources next to the existing nav.

### Agent runner
- `AgentRunner` constructor now accepts `contextFiles`, `compactor`, `mcpRegistry`, `skills`, `designTokens`.
- System prompt is now built per-run: base prompt + assembled context files + design tokens summary (in design mode) + skill descriptions.
- Before each run, if `Compactor.needsCompaction(messages)` returns true, the older slice is summarized and the conversation continues with the compact history.
- MCP tools are collected (cached 60 seconds) and exposed alongside `TOOL_DEFINITIONS`.
- Tool routing: native tools run inline, MCP tools route through the registry, `invoke_skill` returns the rendered prompt for the model to consume.
- All MCP and skill invocations are gated behind approval (Risk.EXTERNAL).

### Tests
- New `tests/context.test.js`: context assembly, missing-file pruning, compactor threshold, compactor summary.
- New `tests/skills.test.js`: empty registry, listing manifests, renderPrompt substitution, validateInputs, builtins.
- New `tests/design.test.js`: read/write round-trip, toCss, toReferenceHtml, toPromptSummary.
- New `tests/mcp.test.js`: client initialize + listTools + callTool, registry aggregation with namespacing, unknown server rejection.
- All 40 tests pass.

## v0.3.0 — 2026-08-13

### Git integration (new `packages/git`)
- New `Git` class wraps the local `git` binary for `init`, `status`, `diff`, `log`, `branches`, `checkpoint`, `undo`, `head`, `createBranch`, `checkout`, `readFileAtRef`.
- Every `write_file` and `replace_text` the agent executes now creates a checkpoint commit tagged `[zetora-checkpoint]` so the run is always undoable.
- `AgentRunner.undoLastCheckpoint()` exposes `git reset --hard HEAD~1` to the API surface.
- New endpoints: `GET /api/git/{status,diff,log,branches,head}`, `POST /api/git/{init,checkpoint,undo}`.

### Persistent PTY terminal (new `packages/pty`)
- `PtySession` keeps a single shell alive between commands, persisting cwd, env and history. Replaces the per-command `spawn` used in v0.2.
- Sentinel-based command completion: each `send()` writes a unique marker and resolves when the marker appears on stdout, returning the captured output and exit code.
- `resize(cols, rows)` sends `stty cols/rows` to the shell; `interrupt()` sends Ctrl+C; `write(data)` allows interactive prompts.
- `PtyRegistry` tracks multiple sessions by id. Idle sessions auto-close after 30 minutes.
- New endpoints: `GET /api/terminal/sessions`, `POST /api/terminal/sessions`, `DELETE /api/terminal/sessions/:id`, `POST /api/terminal/sessions/:id/send`.

### Multimodal image inputs (vision)
- Provider message format now accepts `content: [{type:"text",text}, {type:"image_url", image_url:{url}}]` arrays in addition to plain strings.
- Internal `toOpenAIMessages`, `toAnthropicMessages`, `toGoogleMessages` converters translate the unified shape into each provider's native multimodal schema (OpenAI image_url, Anthropic base64 image source, Google inlineData).
- New `POST /api/uploads` endpoint accepts multipart form-data, parses it without external dependencies, validates the media type is `image/*`, and returns a base64 data URI the browser can attach to the next message.
- Web composer now has a working attach button that surfaces the image as a removable chip and includes it in the next `/api/chat` request.

### Artifact renderer registry (new `packages/artifacts`)
- `renderArtifact(filePath)` returns a self-contained HTML document for any of 40+ extensions.
- HTML passes through unchanged. SVG/PNG/JPG/GIF/WEBP/AVIF render via `<img>` with data URIs. Markdown renders with a safe inline renderer. JSON is pretty-printed. Source code is escaped and wrapped in a styled `<pre>`.
- `detectKind(filePath)` returns the renderer id and kind for any path.
- New `GET /api/artifact?path=...` endpoint serves the rendered HTML directly to the inspector iframe.

### File watcher with SSE (new `packages/watcher`)
- `FileWatcher` uses Node's `fs.watch` (not `fs/promises.watch`) to recursively attach persistent watchers to every directory under the workspace.
- Skips `.git`, `node_modules`, `.next`, `dist`, `build`, `out`, `target`, `.cache`, `.zetora`.
- Debounces bursts of events at 120ms.
- New `GET /api/events` SSE endpoint streams `file.changed` events to all connected clients.
- The web client auto-refreshes the file tree and re-renders the inspector preview when the open file changes.

### Web UI
- New "Undo" header button reverts the last checkpoint after confirmation.
- Git status pill in the session header shows `clean · main` or `N modified · branch`.
- Attach-image chip in the composer context row.
- Image previews inline in user message bubbles.
- All file opens now go through `/api/artifact`, so images, SVGs, markdown, JSON and source code all render in the inspector without bespoke handling.

### Tests
- New `tests/git.test.js`: init + checkpoint + undo round trip; non-zetora commit protection; log ordering.
- New `tests/pty.test.js`: persistent cwd and env across commands; resize.
- New `tests/artifacts.test.js`: detectKind, HTML passthrough, markdown wrapping, image data URI, HTML escaping.
- New `tests/watcher.test.js`: change events on write; ignored directories.
- All 23 tests pass.

## v0.2.0 — 2026-08-13

### Streaming
- Added real SSE streaming for OpenAI, Anthropic, Google and Ollama providers.
- The demo provider now simulates streaming so the UI exercises the same path as live models.
- `text.delta` is emitted per-token as the model produces it; `text.done` carries the assembled message.
- Tool calls are assembled incrementally from partial JSON deltas.

### Agent
- New `AgentRunner.resume(approvalId, decision)` method. After the user approves a `write_file`, `replace_text` or mutating `run_command`, the runner re-enters the conversation loop automatically with the tool result.
- Pending runs are parked in an in-memory `Map` keyed by `runId` so `/api/approvals/:id` can wake them.
- `write_file` and `replace_text` now return a `diff: { previous, next, ... }` snapshot for the inspector.

### Kernel events
- Added `RUN_RESUMED`, `APPROVAL_RESOLVED` and `USAGE` event types.
- `USAGE` events carry cumulative `inputTokens`, `outputTokens`, `totalTokens` and estimated `costUsd`.

### API surface
- New `GET /api/sessions` for listing sessions with usage summaries.
- New `POST /api/sessions` for creating a session.
- New `GET /api/sessions/:id` for fetching a session with full event log.
- New `DELETE /api/sessions/:id` for deleting a session.
- New `GET /api/diff?path=...` for retrieving the last approved change to a file.

### Storage
- Sessions now store `events[]` alongside `messages[]`, enabling full session replay after restart.
- Cumulative `usage` is persisted per session.
- Approval list cap raised from 100 to 200 entries.

### Web UI
- Assistant messages render as safe Markdown (headings, lists, fenced code, inline code, https links).
- New `usage-pill` in the session header shows live token count and cost.
- Sessions list shows per-session token usage.
- Changes tab in the inspector now shows a real line-diff for the selected file when an approval touched it.
- Clicking an artifact row tracks the active file path.
- `text.delta` updates the assistant bubble live instead of waiting for `text.done`.

### Cost estimation
- New `estimateCost(model, usage)` helper in `packages/providers`. Built-in price table covers common GPT-5 / GPT-4.1 / GPT-4o / Claude Sonnet 4.5 / Opus 4.1 / Haiku 4.5 / Gemini 2.5 Flash / Pro models. Unknown models degrade gracefully to `costUsd: null` with token counts still tracked.

### Tests
- Added: streaming demo emits multiple deltas in order.
- Added: write_file pauses and resumes after approval / denial.
- Added: write_file returns a diff snapshot.
- Added: estimateCost normalizes unknown models.
- All 11 tests pass.

## v0.1.0 — 2026-08-12

Initial public source drop. See `docs/ANALYSIS_AR.md` for the original reference analysis and `docs/ROADMAP.md` for the multi-phase plan.
