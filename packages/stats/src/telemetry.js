/**
 * v3.5.0: OpenTelemetry integration — distributed tracing for Moon Code.
 *
 * Tracks: LLM calls, tool execution, session lifecycle, compaction events.
 * Exports to OTLP collector (configurable via MOONCODE_OTEL_ENDPOINT).
 */

const SPAN_KIND = { INTERNAL: 0, SERVER: 1, CLIENT: 2, PRODUCER: 3, CONSUMER: 4 };
const STATUS_CODE = { OK: 0, ERROR: 2 };

let enabled = false;
let endpoint = null;
let serviceName = "mooncode";
const spans = [];
const maxSpans = 1000;

export function initTelemetry(config = {}) {
  enabled = config.enabled ?? Boolean(process.env.MOONCODE_OTEL_ENDPOINT);
  endpoint = config.endpoint || process.env.MOONCODE_OTEL_ENDPOINT;
  serviceName = config.serviceName || "mooncode";
  if (enabled) console.log(`[otel] Telemetry enabled → ${endpoint}`);
}

export function isEnabled() { return enabled; }

/**
 * Start a span. Returns { end, setAttribute, setError }.
 */
export function startSpan(name, attributes = {}) {
  if (!enabled) return { end: () => {}, setAttribute: () => {}, setError: () => {} };

  const span = {
    traceId: crypto.randomUUID().replace(/-/g, "").slice(0, 32),
    spanId: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    name,
    kind: SPAN_KIND.INTERNAL,
    startTime: Date.now(),
    attributes: { "service.name": serviceName, ...attributes },
    status: { code: STATUS_CODE.OK },
    events: [],
  };

  return {
    setAttribute(key, value) { span.attributes[key] = value; },
    setError(error) { span.status = { code: STATUS_CODE.ERROR, message: error.message }; span.events.push({ name: "exception", time: Date.now(), attributes: { "exception.message": error.message } }); },
    end() {
      span.endTime = Date.now();
      span.durationMs = span.endTime - span.startTime;
      spans.push(span);
      if (spans.length > maxSpans) spans.shift();
      exportSpan(span);
    },
  };
}

async function exportSpan(span) {
  if (!endpoint) return;
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceSpans: [{
          resource: { attributes: [{ key: "service.name", value: { stringValue: serviceName } }] },
          scopeSpans: [{ scope: { name: "mooncode" }, spans: [{
            traceId: span.traceId, spanId: span.spanId, name: span.name,
            kind: span.kind, startTimeUnixNano: span.startTime * 1e6, endTimeUnixNano: span.endTime * 1e6,
            attributes: Object.entries(span.attributes).map(([k, v]) => ({ key: k, value: { stringValue: String(v) } })),
            status: span.status,
          }] }],
        }],
      }),
    });
  } catch {}
}

/**
 * Get local span history (for debugging).
 */
export function getSpans(limit = 50) {
  return spans.slice(-limit);
}

/**
 * Wrap an async function with tracing.
 */
export function traced(name, fn, attributes = {}) {
  return async (...args) => {
    const span = startSpan(name, attributes);
    try {
      const result = await fn(...args);
      span.end();
      return result;
    } catch (error) {
      span.setError(error);
      span.end();
      throw error;
    }
  };
}
