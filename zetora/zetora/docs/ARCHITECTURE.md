# Moon Code architecture

## Product shape

One local-first service exposes a versioned event and resource contract. Web, Desktop and TUI are clients of the same domain rather than separate implementations.

```text
┌──────────┐  ┌────────────┐  ┌──────────┐
│ Web/PWA  │  │ Desktop    │  │ TUI      │
└────┬─────┘  └─────┬──────┘  └────┬─────┘
     └───────────────┼──────────────┘
                     ▼
          HTTP + NDJSON / in-process API
                     ▼
┌─────────────────────────────────────────┐
│ Agent runner                            │
│ context → provider → tool → approval   │
└──────┬──────────────┬────────────┬──────┘
       ▼              ▼            ▼
 providers        safe tools    local store
```

## Packages

### `kernel`

Stable event vocabulary and risk policy. Events are presentation-neutral so a terminal and a graphical client can render the same run.

### `providers`

Normalizes OpenAI chat-completions, Anthropic Messages, Google generateContent, OpenRouter, Ollama and custom OpenAI-compatible endpoints to:

```js
{ text, toolCalls: [{ id, name, input }], stopReason, usage }
```

Keys are accepted from process environment. Browser-entered keys are session-only and should be replaced by OS keychain storage in Desktop phase 2.

### `agent`

Owns system policy, bounded turn loop, event emission, tool selection and approval pauses. It does not know about HTML or TUI rendering.

### `tools`

All paths are resolved beneath one selected workspace. Current tools:

- `list_files`
- `read_file`
- `search_text`
- `write_file`
- `replace_text`
- `run_command`

Observe operations can run directly. Mutations pause for approval. Known destructive shell patterns are blocked even if requested.

### `storage`

The first version uses atomic JSON writes with a serialized write queue. Production migration is SQLite with WAL, schema migrations, event sequence numbers and recovery tests.

## API surface (v0.4)

- `GET /api/health`
- `GET /api/bootstrap` (includes git status, skills, design tokens, context files, mcp servers, artifactExtensions)
- `GET /api/tree` · `GET /api/file` · `PUT /api/file` · `GET /api/search`
- `GET /api/sessions` · `POST` · `GET /:id` · `DELETE /:id`
- `POST /api/chat` and `/api/agent/run` → NDJSON stream (multimodal `prompt` accepted)
- `GET /api/approvals` · `POST /:id`
- `GET /api/diff?path=...`
- `POST /api/terminal` (legacy one-shot)
- `POST /api/providers/test` (accepts optional `image` for vision test)
- `GET /api/git/{status,diff,log,branches,head}` · `POST /api/git/{init,checkpoint,undo}`
- `GET /api/terminal/sessions` · `POST` · `DELETE /:id` · `POST /:id/send`
- `POST /api/uploads` (multipart image → data URI)
- `GET /api/artifact?path=...` (rendered HTML for any supported file)
- `GET /api/events` (SSE file watcher)
- `GET /api/context` · `POST` · `DELETE` (manage standing context files)
- `POST /api/compact` (manually compact a session's history)
- `GET /api/mcp` · `POST /servers` · `DELETE /servers/:id` · `POST /connect/:id` · `GET /tools` (MCP registry)
- `GET /api/skills` · `POST /skills/invoke` (skill manifests)
- `GET /api/design-tokens` · `POST` · `GET /reference` · `GET /css` (design tokens)

## Security boundaries

1. **Workspace path boundary**: canonical path checks reject traversal.
2. **Mutation boundary**: writes and mutating shell operations require approval.
3. **Command deny rules**: obvious destructive commands are blocked.
4. **Preview boundary**: artifacts render in an iframe sandbox.
5. **Renderer boundary**: Desktop disables Node integration and enables context isolation and sandboxing.
6. **Secret boundary**: API responses never return environment keys.
7. **Payload limits**: request, file, search and process output sizes are bounded.
8. **Network default**: local service binds to localhost in Desktop; preview development can bind to `0.0.0.0` explicitly.

## Production changes still required

- OS keychain integration and encrypted credential migration.
- Fine-grained capability grants by tool, path, command and host.
- Process isolation/container profiles for agent commands.
- Streaming provider adapters with retry/backoff and partial tool JSON.
- Durable resume after approval and crash-safe run state.
- SQLite and full-text index.
- WebSocket/PTY protocol with terminal resize and backpressure.
- Plugin signature verification and registry trust tiers.
- CSP nonce, CSRF/origin checks, rate limits and security audit.
- Signed/notarized desktop builds and auto-update verification.
