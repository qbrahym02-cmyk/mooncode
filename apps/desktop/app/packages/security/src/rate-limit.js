/**
 * Simple in-memory rate limiter using a sliding-window counter per identifier
 * (typically IP or session id). No external dependency.
 *
 * Usage:
 *   const limiter = new RateLimiter({ windowMs: 60_000, max: 100 });
 *   const result = limiter.check(ip);
 *   if (!result.allowed) return respond(429, result);
 */
export class RateLimiter {
  constructor(options = {}) {
    this.windowMs = Number(options.windowMs ?? 60_000);
    this.max = Number(options.max ?? 100);
    this.buckets = new Map(); // id -> { count, resetAt }
    // Periodically prune expired buckets to avoid memory leaks.
    this.pruneTimer = setInterval(() => this.#prune(), this.windowMs).unref();
  }

  check(id, weight = 1) {
    const now = Date.now();
    let bucket = this.buckets.get(id);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(id, bucket);
    }
    bucket.count += weight;
    const remaining = Math.max(0, this.max - bucket.count);
    const allowed = bucket.count <= this.max;
    return {
      allowed,
      count: bucket.count,
      limit: this.max,
      remaining,
      resetAt: bucket.resetAt,
      retryAfterMs: allowed ? 0 : bucket.resetAt - now,
    };
  }

  #prune() {
    const now = Date.now();
    for (const [id, bucket] of this.buckets) {
      if (now > bucket.resetAt) this.buckets.delete(id);
    }
  }

  close() {
    clearInterval(this.pruneTimer);
    this.buckets.clear();
  }
}

/**
 * Apply rate limiting to an HTTP request. Returns the limiter result so the
 * caller can include the headers in the response.
 */
export function applyRateLimit(limiter, request, response, options = {}) {
  // Identify by IP (fall back to session id header if present).
  const ip = request.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || request.socket?.remoteAddress
    || "unknown";
  const weight = Number(options.weight ?? 1);
  const result = limiter.check(ip, weight);
  response.setHeader("x-ratelimit-limit", result.limit);
  response.setHeader("x-ratelimit-remaining", result.remaining);
  response.setHeader("x-ratelimit-reset", Math.ceil(result.resetAt / 1000));
  if (!result.allowed) {
    response.setHeader("retry-after", Math.ceil(result.retryAfterMs / 1000));
  }
  return result;
}
