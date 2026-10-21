/**
 * Best-effort throttle for the unauthenticated auth endpoints.
 *
 * Isolate state is local to one isolate, so this is a first line of defence
 * against scripted abuse, not a quota. The authoritative limit for a public
 * deployment is Cloudflare rate limiting (or a Durable Object) in front of the
 * Worker.
 */
type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type ThrottleResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function throttle(
  key: string,
  limit: number,
  windowMs: number,
): ThrottleResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count <= limit) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Cloudflare sets this header; it is the only trustworthy client address. */
export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
}
