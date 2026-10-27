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

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}
