type Bucket = { tokens: number; at: number };

/** In-memory token bucket per key; enough for one Cloud Run instance. */
export function createRateLimiter(perHour: number) {
  const buckets = new Map<string, Bucket>();
  const refillPerMs = perHour / 3_600_000;
  return {
    take(key: string): boolean {
      const now = Date.now();
      const bucket = buckets.get(key) ?? { tokens: perHour, at: now };
      bucket.tokens = Math.min(perHour, bucket.tokens + (now - bucket.at) * refillPerMs);
      bucket.at = now;
      buckets.set(key, bucket);
      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    },
  };
}

/**
 * The client address as seen by the platform proxy. Entries left of the ones our trusted proxies
 * appended are client-controlled, so count from the right (TRUSTED_PROXY_HOPS, default 1).
 */
export function clientKey(request: Request): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1);
  const chain = (request.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return chain[chain.length - hops] ?? chain[0] ?? "local";
}
