/**
 * Zetora's internal event vocabulary. The Web, Desktop and TUI clients consume
 * the same events, which keeps presentation separate from agent execution.
 */
export const EventType = Object.freeze({
  RUN_STARTED: "run.started",
  RUN_FINISHED: "run.finished",
  RUN_RESUMED: "run.resumed",
  TEXT_DELTA: "text.delta",
  TEXT_DONE: "text.done",
  TOOL_STARTED: "tool.started",
  TOOL_FINISHED: "tool.finished",
  APPROVAL_REQUIRED: "approval.required",
  APPROVAL_RESOLVED: "approval.resolved",
  USAGE: "usage",
  CONTEXT_COMPACTED: "context.compacted",
  ERROR: "error",
});

export function createEvent(type, payload = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    at: new Date().toISOString(),
    ...payload,
  };
}
