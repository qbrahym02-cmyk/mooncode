# Zetora product specification v0.1

## Promise

A local-first workspace where one agent can understand, design, implement and review a digital product while the human retains control over every consequential action.

## Primary users

- Developers who want a transparent multi-provider agent.
- Designers who need generated artifacts and production handoff.
- Solo builders who move between specification, interface and code.
- Teams requiring local data, audit history and explicit approvals.

## Core surfaces

1. **Home / projects** — recent local workspaces and new-project intent.
2. **Session** — chronological user, model, tool and approval events.
3. **Files** — searchable project tree and source viewer.
4. **Review** — file changes, comments, accept/revert and checkpoints.
5. **Artifacts** — isolated previews and exports for visual outputs.
6. **Terminal** — project PTY with policy-aware approvals.
7. **Settings** — providers, models, permissions, appearance and locale.
8. **Command palette** — keyboard-first access to every action.

## Modes

- **Plan**: inspect and propose; no mutation.
- **Build**: code and run tools with approval policy.
- **Design**: generate and critique artifacts with design-system context.
- **Review**: explain diffs, test and suggest corrections.

## Non-negotiables

- User data is local by default.
- No hidden filesystem or command execution.
- Every model/provider is replaceable.
- Run history is inspectable and exportable.
- Artifacts never receive host filesystem or credential access.
- First-party identity and source remain independent of reference products.
