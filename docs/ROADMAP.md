# Roadmap to a production product

## Phase 0 — completed foundation

- Original brand shell and responsive Web UI.
- Shared agent/provider/tool packages.
- Local storage and project sandbox.
- NDJSON run events and approval flow.
- Independent TUI and Electron shell.
- Reference analysis and provenance policy.

## Phase 1 — reliable coding agent

- [x] Provider streaming for OpenAI, Anthropic, Google, Ollama (added in v0.2).
- [x] Token/cost accounting per session (added in v0.2).
- [x] Diff snapshot on every write/replace operation (added in v0.2).
- [x] Durable session event log that survives restart (added in v0.2).
- [x] Automatic resume of the agent loop after an approval (added in v0.2).
- [x] Git checkpoints, undo, branches and log (added in v0.3).
- [x] Persistent PTY terminal sessions (added in v0.3).
- [x] Multimodal image inputs (vision) for OpenAI, Anthropic, Google (added in v0.3).
- [x] File watcher with SSE live updates (added in v0.3).
- [x] Artifact renderer registry: HTML, image, SVG, markdown, JSON, code (added in v0.3).
- [x] Context files injected into the system prompt (added in v0.4).
- [x] Compaction for long-running sessions (added in v0.4).
- [x] MCP client for connecting external tools (added in v0.4).
- [x] Advanced tools: grep, fetch_url, run_tests, parse_ast (added in v0.5).
- [x] Auto-fix: built-in fixers + ESLint/Prettier integration + verification + rollback (added in v0.5).
- [x] Error diagnosis: pattern-based hints for common failures (added in v0.5).
- [x] Subagents: spawn_subagent for parallel subtask execution (added in v0.5).
- [x] Skill CRUD: create/edit/delete + composition chains + execution history (added in v0.5).
- [ ] Reasoning parts and robust partial-tool-JSON recovery.
- [ ] Permission matrix tests.

**Exit:** safely complete multi-file coding tasks and recover after restart.

## Phase 2 — design workspace

- [x] Skill manifests with template inputs (added in v0.4).
- [x] Design-system tokens (colors, typography, spacing, radii, shadows) (added in v0.4).
- [x] Isolated preview workers (stricter iframe sandbox) (added in v0.4).
- [x] Skill editor: create/edit/delete workspace skills (added in v0.5).
- [x] Skill composition: chain skills via `compose` field (added in v0.5).
- [ ] HTML, React, SVG, image, video, audio, deck and document artifacts beyond HTML.
- [ ] Screenshot comparison.
- [ ] Export pipeline.
- [ ] Reproduducible snapshots.
- [ ] Design critique and accessibility evaluators.

**Exit:** brief → design variants → review → export without leaving Moon Code.

## Phase 3 — product clients

- Production Desktop packaging, keychain, updater and signing.
- Installable TUI binaries for all major platforms.
- PWA plus remote encrypted connection to a local daemon.
- Arabic/English complete localization, RTL visual tests and accessibility AA.

**Exit:** separately downloadable TUI and Desktop, plus Web client parity.

## Phase 4 — plugins and ecosystem

- Capability-scoped plugin runtime.
- Signed manifests, lockfiles, provenance and trust levels.
- Local/federated registries for skills, tools and design systems.
- CLI/API/UI parity and plugin conformance suite.

## Phase 5 — teams and hosted mode

- Accounts, organizations, encrypted sync and role policy.
- Remote runners, container isolation and secrets broker.
- Audit log, OpenTelemetry, budgets and enterprise policy packs.
- Optional self-hosted control plane.

## Release gates

Every phase requires unit/integration/E2E tests, threat-model update, dependency license report, migration/rollback test, accessibility audit, performance budget and signed release provenance.
