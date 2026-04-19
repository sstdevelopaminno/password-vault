type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const LOCAL_BUCKET_CLEANUP_INTERVAL_MS = 60_000;
const LOCAL_BUCKET_MAX_SIZE = 20_000;
let lastCleanupAt = 0;

function normalizeConfig(config: RateLimitConfig) {
  const limit = Number(config.limit);
  const windowMs = Number(config.windowMs);

  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? Math.floor(windowMs) : 1000,
  };
}

function cleanupLocalBuckets(now: number) {
  if (now - lastCleanupAt < LOCAL_BUCKET_CLEANUP_INTERVAL_MS && buckets.size < LOCAL_BUCKET_MAX_SIZE) {
    return;
  }

  lastCleanupAt = now;
  for (const [key, value] of buckets) {
    if (value.resetAt <= now) buckets.delete(key);
  }

  if (buckets.size <= LOCAL_BUCKET_MAX_SIZE) return;

  const overflow = buckets.size - LOCAL_BUCKET_MAX_SIZE;
  const oldest = Array.from(buckets.entries())
    .sort((a, b) => a[1].resetAt - b[1].resetAt)
    .slice(0, overflow);

  for (const [key] of oldest) {
    buckets.delete(key);
  }
}

function takeRateLimitLocal(key: string, config: RateLimitConfig): RateLimitDecision {
  const normalized = normalizeConfig(config);
  const now = Date.now();
  cleanupLocalBuckets(now);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + normalized.windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, normalized.limit - 1),
      retryAfterSec: Math.ceil(normalized.windowMs / 1000),
    };
  }

  if (current.count >= normalized.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  buckets.set(key, current);
  return {
    allowed: true,
    remaining: Math.max(0, normalized.limit - current.count),
    retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export async function takeRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitDecision> {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: 1,
    };
  }

  const normalized = normalizeConfig(config);

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const windowSec = Math.max(1, Math.ceil(normalized.windowMs / 1000));

    const rpcResult = await admin.rpc("take_rate_limit", {
      p_key: normalizedKey,
      p_limit: normalized.limit,
      p_window_seconds: windowSec,
    });

    if (!rpcResult.error && rpcResult.data) {
      const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
      if (row && typeof row === "object" && "allowed" in row) {
        return {
          allowed: Boolean((row as { allowed?: unknown }).allowed),
          remaining: Math.max(0, Number((row as { remaining?: unknown }).remaining ?? 0) || 0),
          retryAfterSec: Math.max(1, Number((row as { retry_after_sec?: unknown }).retry_after_sec ?? 1) || 1),
        };
      }
    }
  } catch {
    // Fallback to local memory limiter when distributed limiter is unavailable.
  }

  return takeRateLimitLocal(normalizedKey, normalized);
}

export function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}
