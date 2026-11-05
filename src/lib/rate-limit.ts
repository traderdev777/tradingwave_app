/**
 * Small in-memory sliding-window rate limiter, keyed per IP + action.
 * Good enough for a single local/server process. Swap for Redis when scaling out.
 */
type Bucket = number[];
const store = new Map<string, Bucket>();

export type RateResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateResult {
  const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const oldest = hits[0] ?? now;
    store.set(key, hits);
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }
  hits.push(now);
  store.set(key, hits);
  if (store.size > 10_000) {
    for (const [k, v] of store) if (!v.some((t) => now - t < windowMs)) store.delete(k);
  }
  return { ok: true, remaining: limit - hits.length, retryAfterSeconds: 0 };
}

export function resetRateLimits() {
  store.clear();
}
