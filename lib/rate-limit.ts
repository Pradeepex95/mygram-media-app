type Bucket = {
  count: number;
  resetAt: number;
};

const memoryStore = new Map<string, Bucket>();

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Sliding fixed-window rate limiter.
 * Uses Upstash REST when configured; otherwise an in-memory fallback
 * suitable for single-instance / local development.
 */
export async function rateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    return upstashLimit(url, token, params);
  }

  return memoryLimit(params);
}

async function upstashLimit(
  url: string,
  token: string,
  params: { key: string; limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const redisKey = `rl:${params.key}`;
  const now = Date.now();
  const windowSec = Math.ceil(params.windowMs / 1000);

  const incrRes = await fetch(`${url}/incr/${encodeURIComponent(redisKey)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const incrJson = (await incrRes.json()) as { result?: number };
  const count = incrJson.result ?? 1;

  if (count === 1) {
    await fetch(
      `${url}/expire/${encodeURIComponent(redisKey)}/${windowSec}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
  }

  return {
    success: count <= params.limit,
    remaining: Math.max(0, params.limit - count),
    resetAt: now + params.windowMs,
  };
}

function memoryLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  const existing = memoryStore.get(params.key);

  if (!existing || existing.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + params.windowMs };
    memoryStore.set(params.key, bucket);
    return {
      success: true,
      remaining: params.limit - 1,
      resetAt: bucket.resetAt,
    };
  }

  existing.count += 1;
  memoryStore.set(params.key, existing);
  return {
    success: existing.count <= params.limit,
    remaining: Math.max(0, params.limit - existing.count),
    resetAt: existing.resetAt,
  };
}
