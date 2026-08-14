/**
 * v3.3.0: Stats / Telemetry pipeline.
 *
 * Collects anonymous usage statistics for opt-in telemetry:
 *   - Model usage (which models, how many requests)
 *   - Tool usage (which tools, success/failure rates)
 *   - Session metrics (duration, tokens, cost)
 *   - Performance (response times, cache hit rates)
 *
 * All data is anonymous — no code content, no file paths, no user data.
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";

export class StatsCollector {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.enabled = false; // opt-in only
    this.buffer = [];
    this.flushTimer = null;
    this.maxBuffer = 100;
    this.flushInterval = 60_000; // 1 minute
  }

  enable() { this.enabled = true; this.#startFlushTimer(); }
  disable() { this.enabled = false; clearTimeout(this.flushTimer); }

  /**
   * Record a stat event.
   */
  record(event) {
    if (!this.enabled) return;
    this.buffer.push({
      ...event,
      timestamp: Date.now(),
      sessionId: event.sessionId ? this.#hash(event.sessionId) : null,
    });
    if (this.buffer.length >= this.maxBuffer) this.flush();
  }

  /**
   * Record model usage.
   */
  recordModelUsage(provider, model, tokens, cost, duration) {
    this.record({
      type: "model_usage",
      provider, model,
      inputTokens: tokens?.input || 0,
      outputTokens: tokens?.output || 0,
      cost: cost || 0,
      durationMs: duration || 0,
    });
  }

  /**
   * Record tool usage.
   */
  recordToolUsage(toolName, success, duration) {
    this.record({
      type: "tool_usage",
      tool: toolName,
      success,
      durationMs: duration || 0,
    });
  }

  /**
   * Record session metrics.
   */
  recordSessionMetrics(sessionId, metrics) {
    this.record({
      type: "session_metrics",
      sessionId,
      messages: metrics.messages || 0,
      toolsUsed: metrics.toolsUsed || 0,
      tokens: metrics.tokens || 0,
      cost: metrics.cost || 0,
      durationMs: metrics.durationMs || 0,
      filesChanged: metrics.filesChanged || 0,
    });
  }

  /**
   * Record performance metric.
   */
  recordPerformance(metric, value, unit = "ms") {
    this.record({ type: "performance", metric, value, unit });
  }

  /**
   * Flush buffer to disk.
   */
  async flush() {
    if (this.buffer.length === 0) return;
    const events = this.buffer.splice(0);
    const date = new Date().toISOString().slice(0, 10);
    const filePath = path.join(this.dataDir, `stats-${date}.ndjson`);

    try {
      await mkdir(path.dirname(filePath), { recursive: true });
      const lines = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
      await writeFile(filePath, lines, { flag: "a" });
    } catch (error) {
      console.error("[stats] Failed to flush:", error.message);
      // Put events back in buffer
      this.buffer.unshift(...events);
    }
  }

  /**
   * Read and aggregate stats.
   */
  async getStats(days = 7) {
    const stats = { modelUsage: {}, toolUsage: {}, sessions: { count: 0, totalTokens: 0, totalCost: 0 }, performance: {} };

    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const filePath = path.join(this.dataDir, `stats-${date}.ndjson`);

      try {
        const content = await readFile(filePath, "utf8");
        for (const line of content.split("\n").filter(Boolean)) {
          try {
            const event = JSON.parse(line);
            this.#aggregate(stats, event);
          } catch {}
        }
      } catch { /* file doesn't exist */ }
    }

    return stats;
  }

  #aggregate(stats, event) {
    switch (event.type) {
      case "model_usage":
        const key = `${event.provider}/${event.model}`;
        if (!stats.modelUsage[key]) stats.modelUsage[key] = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
        stats.modelUsage[key].requests++;
        stats.modelUsage[key].inputTokens += event.inputTokens;
        stats.modelUsage[key].outputTokens += event.outputTokens;
        stats.modelUsage[key].cost += event.cost;
        break;
      case "tool_usage":
        if (!stats.toolUsage[event.tool]) stats.toolUsage[event.tool] = { count: 0, success: 0, failure: 0, avgDurationMs: 0 };
        stats.toolUsage[event.tool].count++;
        if (event.success) stats.toolUsage[event.tool].success++;
        else stats.toolUsage[event.tool].failure++;
        break;
      case "session_metrics":
        stats.sessions.count++;
        stats.sessions.totalTokens += event.tokens;
        stats.sessions.totalCost += event.cost;
        break;
      case "performance":
        if (!stats.performance[event.metric]) stats.performance[event.metric] = { values: [], unit: event.unit };
        stats.performance[event.metric].values.push(event.value);
        break;
    }
  }

  #hash(value) {
    const { createHash } = require("node:crypto");
    return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
  }

  #startFlushTimer() {
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval).unref();
  }
}
