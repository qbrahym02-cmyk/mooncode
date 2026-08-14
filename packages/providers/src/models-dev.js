/**
 * v3.5.0: Models.dev integration — fetch model pricing + capabilities.
 */
const MODELS_DEV_URL = "https://models.dev/api/models";
let cache = null;
let cacheAt = 0;

export async function fetchModelsCatalog() {
  if (cache && Date.now() - cacheAt < 3600000) return cache;
  try {
    const res = await fetch(MODELS_DEV_URL, { headers: { "user-agent": "mooncode/3.5.0" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cache = await res.json();
    cacheAt = Date.now();
    return cache;
  } catch { return cache || []; }
}

export async function getModelInfo(modelId) {
  const catalog = await fetchModelsCatalog();
  return catalog.find((m) => m.id === modelId || m.name === modelId) || null;
}

export async function getModelsByProvider(providerId) {
  const catalog = await fetchModelsCatalog();
  return catalog.filter((m) => m.provider === providerId);
}

export async function getCheapestModel(capability = "chat") {
  const catalog = await fetchModelsCatalog();
  return catalog.filter((m) => m.capabilities?.[capability]).sort((a, b) => (a.pricing?.input || 0) - (b.pricing?.input || 0))[0] || null;
}
