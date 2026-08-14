/**
 * v3.3.0: Enterprise console — billing, auth, organizations, API gateway.
 *
 * Provides:
 *   - Organization management (create, invite, roles)
 *   - API key management (per-org, per-user)
 *   - Usage tracking + billing (Stripe integration)
 *   - Model gateway (proxy requests with rate limiting + budget)
 *   - Dashboard data API
 */

import { randomUUID, createHash } from "node:crypto";

// ─── Organization management ────────────────────────────────────────────────

export class Organization {
  constructor(data) {
    this.id = data.id || randomUUID();
    this.name = data.name;
    this.slug = data.slug || data.name?.toLowerCase().replace(/\s+/g, "-");
    this.plan = data.plan || "free"; // free | pro | enterprise
    this.createdAt = data.createdAt || new Date().toISOString();
    this.members = data.members || [];
    this.apiKeys = data.apiKeys || [];
    this.budget = data.budget || { monthly: 0, used: 0 };
    this.limits = data.limits || this.#defaultLimits();
  }

  #defaultLimits() {
    const limits = { free: { requestsPerDay: 100, tokensPerDay: 50_000, members: 3 },
                     pro: { requestsPerDay: 10_000, tokensPerDay: 5_000_000, members: 50 },
                     enterprise: { requestsPerDay: Infinity, tokensPerDay: Infinity, members: Infinity } };
    return limits[this.plan] || limits.free;
  }

  addMember(userId, role = "member") {
    if (this.members.length >= this.limits.members && role !== "owner") {
      throw new Error(`Member limit reached (${this.limits.members})`);
    }
    this.members.push({ userId, role, addedAt: new Date().toISOString() });
  }

  removeMember(userId) {
    this.members = this.members.filter((m) => m.userId !== userId);
  }

  generateApiKey(name) {
    const key = `mc_${createHash("sha256").update(randomUUID() + this.id).digest("hex").slice(0, 32)}`;
    this.apiKeys.push({ id: randomUUID(), name, key, createdAt: new Date().toISOString(), lastUsed: null });
    return key;
  }

  revokeApiKey(keyId) {
    this.apiKeys = this.apiKeys.filter((k) => k.id !== keyId);
  }

  trackUsage(tokens, cost = 0) {
    this.budget.used += cost;
    return { remaining: Math.max(0, this.budget.monthly - this.budget.used), exceeded: this.budget.used > this.budget.monthly };
  }

  toJSON() {
    return { ...this, apiKeys: this.apiKeys.map((k) => ({ ...k, key: k.key.slice(0, 8) + "..." })) };
  }
}

// ─── Rate limiter (per-org, per-model) ──────────────────────────────────────

export class RateLimiter {
  constructor() {
    this.buckets = new Map(); // `orgId:model` → { count, resetAt, tps, tpm }
  }

  check(orgId, model, limits = { requestsPerMinute: 60, tokensPerMinute: 100_000 }) {
    const key = `${orgId}:${model}`;
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, tokens: 0, resetAt: now + 60_000, limits };
      this.buckets.set(key, bucket);
    }

    bucket.count++;
    const allowed = bucket.count <= limits.requestsPerMinute;
    return { allowed, remaining: Math.max(0, limits.requestsPerMinute - bucket.count), resetAt: bucket.resetAt };
  }

  trackTokens(orgId, model, tokens) {
    const key = `${orgId}:${model}`;
    const bucket = this.buckets.get(key);
    if (bucket) bucket.tokens += tokens;
  }
}

// ─── Billing (Stripe integration) ───────────────────────────────────────────

export class BillingManager {
  constructor(stripeSecretKey) {
    this.stripeKey = stripeSecretKey;
    this.plans = {
      free: { priceId: null, amount: 0, currency: "usd", interval: "month" },
      pro: { priceId: "price_pro_monthly", amount: 2000, currency: "usd", interval: "month" }, // $20/mo
      enterprise: { priceId: "price_enterprise_monthly", amount: 10000, currency: "usd", interval: "month" }, // $100/mo
    };
  }

  async createCheckoutSession(orgId, plan, successUrl, cancelUrl) {
    const planConfig = this.plans[plan];
    if (!planConfig || !planConfig.priceId) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${this.stripeKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        mode: "subscription",
        "line_items[0][price]": planConfig.priceId,
        "line_items[0][quantity]": "1",
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: orgId,
        metadata: JSON.stringify({ orgId, plan }),
      }),
    });

    const session = await response.json();
    return { url: session.url, sessionId: session.id };
  }

  async handleWebhook(payload, signature) {
    // Verify webhook signature and return event type
    // In production, use stripe.webhooks.constructEvent
    return { type: payload?.type || "unknown", data: payload?.data?.object };
  }

  getPlanInfo(plan) {
    return this.plans[plan] || null;
  }
}

// ─── Model Gateway (OpenAI-compatible proxy) ────────────────────────────────

export class ModelGateway {
  constructor(config) {
    this.providers = config.providers || {}; // provider → { baseUrl, apiKey }
    this.rateLimiter = new RateLimiter();
    this.requestLog = [];
  }

  /**
   * Proxy a chat completion request with rate limiting + logging.
   */
  async proxy(request, orgId) {
    const { model, provider } = request;

    // Check rate limits
    const rateCheck = this.rateLimiter.check(orgId, model);
    if (!rateCheck.allowed) {
      return { error: "Rate limit exceeded", retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000) };
    }

    // Log the request
    this.requestLog.push({ orgId, model, provider, at: Date.now() });

    // In production, this would proxy to the actual provider
    return { ok: true, model, provider };
  }

  getUsageStats(orgId) {
    const orgRequests = this.requestLog.filter((r) => r.orgId === orgId);
    return {
      totalRequests: orgRequests.length,
      byModel: orgRequests.reduce((acc, r) => { acc[r.model] = (acc[r.model] || 0) + 1; return acc; }, {}),
      lastRequest: orgRequests[orgRequests.length - 1]?.at,
    };
  }
}

// ─── Dashboard data API ─────────────────────────────────────────────────────

export function getDashboardData(org) {
  return {
    organization: org.toJSON(),
    usage: org.budget,
    members: org.members.length,
    limits: org.limits,
    plan: org.plan,
  };
}
