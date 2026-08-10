/**
 * Fixed-window rate limiter.
 *
 * When RATE_LIMIT_REDIS_URL + RATE_LIMIT_REDIS_TOKEN are set it uses the
 * Upstash-compatible Redis REST API (zero extra dependencies) so the counters
 * are shared across every server instance. Otherwise it falls back to an
 * in-memory map, which is correct for a single process. On a Redis outage it
 * transparently degrades to the in-memory store for a short period.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60 * 1000;

/** Hard cap on tracked buckets so a flood of unique IPs can't exhaust memory. */
const MAX_BUCKETS = 25_000;

function evictStale() {
  if (buckets.size < MAX_BUCKETS) return;
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function checkInMemory(key: string, limit: number): Result {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    evictStale();
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

type Result = { allowed: boolean; retryAfterSec: number };

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.RATE_LIMIT_REDIS_URL?.trim();
  const token = process.env.RATE_LIMIT_REDIS_TOKEN?.trim();
  if (!url || !/^https?:\/\//u.test(url)) return null;
  return { url, token: token ?? "" };
}

const redis = redisConfig();
let redisDownUntil = 0;

/** Try the shared store; return null when unavailable so callers fall back. */
async function checkRedis(key: string, limit: number): Promise<Result | null> {
  if (!redis || Date.now() < redisDownUntil) return null;
  try {
    const res = await fetch(redis.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redis.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        commands: [
          // Fixed window: SET … NX EX sets the TTL only on the first request in
          // a 60s window; INCR then returns the running count for that window.
          ["SET", key, "1", "NX", "EX", Math.ceil(WINDOW_MS / 1000)],
          ["INCR", key],
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { result?: unknown[] };
    const count = Number(data.result?.[1]);
    if (!Number.isInteger(count) || count < 1) throw new Error("malformed response");
    return count > limit
      ? { allowed: false, retryAfterSec: Math.ceil(WINDOW_MS / 1000) }
      : { allowed: true, retryAfterSec: 0 };
  } catch (error) {
    console.warn("Rate-limit store unavailable, falling back to in-memory:", String(error).slice(0, 160));
    redisDownUntil = Date.now() + 10_000;
    return null;
  }
}

export async function checkRateLimit(key: string, limit: number): Promise<Result> {
  const remote = await checkRedis(key, limit);
  if (remote) return remote;
  return checkInMemory(key, limit);
}

export function clearRateLimits() {
  buckets.clear();
}

/**
 * Client-IP headers (cf-connecting-ip, x-real-ip, x-forwarded-for) are fully
 * attacker-controlled unless the hosting proxy overwrites them. They are only
 * consulted when the operator sets TRUSTED_PROXY_IP_HEADERS to confirm that
 * (e.g. Cloudflare, which strips inbound copies, or nginx proxy_set_header).
 * Otherwise every request falls into a shared "local" bucket, which prevents a
 * remote user from forging a fresh identity per request to bypass throttles.
 * No PII is kept.
 */
const TRUST_PROXY_IP_HEADERS =
  process.env.TRUSTED_PROXY_IP_HEADERS === "true" ||
  process.env.TRUSTED_PROXY_IP_HEADERS === "1";

export function rateLimitKey(
  c: { req: { header: (name: string) => string | undefined } },
  scope: string,
): string {
  if (TRUST_PROXY_IP_HEADERS) {
    const cfConnectingIp = c.req.header("cf-connecting-ip");
    if (cfConnectingIp?.trim()) return `${cfConnectingIp.trim()}|${scope}`;

    const realIp = c.req.header("x-real-ip");
    if (realIp?.trim()) return `${realIp.trim()}|${scope}`;

    const xff = c.req.header("x-forwarded-for");
    if (xff && xff.trim()) {
      const client = xff.split(",")[0]?.trim();
      if (client) return `${client}|${scope}`;
    }
  }

  return `local|${scope}`;
}