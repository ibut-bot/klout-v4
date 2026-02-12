/**
 * In-memory rate limiter.
 *
 * WARNING: This rate limiter uses a process-local Map. In serverless environments
 * (Vercel, AWS Lambda) or multi-instance deployments, each instance has its own
 * store, so rate limits are not shared across instances.
 *
 * For production, replace with a distributed store such as:
 *   - @upstash/ratelimit (Redis-backed, serverless-friendly)
 *   - Redis INCR/EXPIRE pattern
 *   - Vercel KV
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes
if (typeof globalThis !== 'undefined') {
  const cleanup = () => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.resetAt < now) store.delete(key)
    }
  }
  // Avoid duplicate intervals in hot-reload (dev)
  const globalStore = globalThis as unknown as { _rateLimitCleanup?: ReturnType<typeof setInterval> }
  if (!globalStore._rateLimitCleanup) {
    globalStore._rateLimitCleanup = setInterval(cleanup, 5 * 60 * 1000)
  }
}

export interface RateLimitConfig {
  /** Max requests in the window */
  limit: number
  /** Window duration in seconds */
  windowSeconds: number
}

export const RATE_LIMITS = {
  auth: { limit: 10, windowSeconds: 60 } as RateLimitConfig,
  taskCreate: { limit: 10, windowSeconds: 3600 } as RateLimitConfig,
  bidCreate: { limit: 10, windowSeconds: 3600 } as RateLimitConfig,
  message: { limit: 60, windowSeconds: 3600 } as RateLimitConfig,
  upload: { limit: 30, windowSeconds: 3600 } as RateLimitConfig,
  campaignSubmit: { limit: 20, windowSeconds: 3600 } as RateLimitConfig,
  profileUpdate: { limit: 10, windowSeconds: 3600 } as RateLimitConfig,
  disputeAction: { limit: 5, windowSeconds: 3600 } as RateLimitConfig,
  default: { limit: 60, windowSeconds: 60 } as RateLimitConfig,
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * Check rate limit for a given key (usually `action:walletAddress`).
 * Returns whether the request is allowed.
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + config.windowSeconds * 1000 })
    return { allowed: true, remaining: config.limit - 1, resetAt: now + config.windowSeconds * 1000 }
  }

  if (entry.count >= config.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt }
}

/** Helper to apply rate limit headers and return 429 if exceeded */
export function rateLimitResponse(key: string, config: RateLimitConfig): Response | null {
  const result = checkRateLimit(key, config)

  if (!result.allowed) {
    return Response.json(
      {
        success: false,
        error: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  return null // allowed
}
