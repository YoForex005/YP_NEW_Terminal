/**
 * Simple in-memory sliding-window rate limiter for Next.js API routes.
 * Suitable for single-node / sticky-session deploys. For multi-node, replace
 * with Redis later using the same interface.
 */

type RateLimitBucket = {
  count: number;
  windowStartedAt: number;
};

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
  resetAt: number;
};

const globalBuckets = globalThis as typeof globalThis & {
  __yopipsRateLimitBuckets?: Map<string, RateLimitBucket>;
};

if (!globalBuckets.__yopipsRateLimitBuckets) {
  globalBuckets.__yopipsRateLimitBuckets = new Map();
}

const buckets = globalBuckets.__yopipsRateLimitBuckets;

const pruneExpiredBuckets = (now: number, windowMs: number) => {
  // Opportunistic prune to avoid unbounded growth under attack.
  if (buckets.size < 2_000) {
    return;
  }
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStartedAt >= windowMs * 2) {
      buckets.delete(key);
    }
  }
};

export function consumeRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): RateLimitResult {
  const limit = Math.max(1, Math.trunc(options.limit));
  const windowMs = Math.max(1_000, Math.trunc(options.windowMs));
  const now = Date.now();
  pruneExpiredBuckets(now, windowMs);

  const existing = buckets.get(key);
  if (!existing || now - existing.windowStartedAt >= windowMs) {
    buckets.set(key, { count: 1, windowStartedAt: now });
    return {
      ok: true,
      limit,
      remaining: Math.max(0, limit - 1),
      retryAfterSec: 0,
      resetAt: now + windowMs,
    };
  }

  existing.count += 1;
  const resetAt = existing.windowStartedAt + windowMs;
  if (existing.count > limit) {
    return {
      ok: false,
      limit,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      resetAt,
    };
  }

  return {
    ok: true,
    limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSec: 0,
    resetAt,
  };
}

export function getClientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

export function applyRateLimitHeaders(
  headers: Headers,
  result: RateLimitResult,
): void {
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  if (!result.ok && result.retryAfterSec > 0) {
    headers.set("Retry-After", String(result.retryAfterSec));
  }
}
