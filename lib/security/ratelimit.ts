import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// In-memory token bucket fallback when Upstash Redis credentials are not set
const memoryStore = new Map<string, { count: number; resetAt: number }>();

function inMemoryRateLimit(identifier: string, limit = 5, windowMs = 600000): { success: boolean; limit: number; remaining: number; reset: number } {
  const now = Date.now();
  const record = memoryStore.get(identifier);

  if (!record || now > record.resetAt) {
    memoryStore.set(identifier, { count: 1, resetAt: now + windowMs });
    return { success: true, limit, remaining: limit - 1, reset: now + windowMs };
  }

  if (record.count >= limit) {
    return { success: false, limit, remaining: 0, reset: record.resetAt };
  }

  record.count += 1;
  return { success: true, limit, remaining: limit - record.count, reset: record.resetAt };
}

let redisClient: Redis | null = null;
let ratelimitInstance: Ratelimit | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redisClient = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  ratelimitInstance = new Ratelimit({
    redis: redisClient,
    // 10 requests per 10 minutes sliding window
    limiter: Ratelimit.slidingWindow(10, '10 m'),
    analytics: true,
    prefix: '@devguard/try_ratelimit',
  });
}

// Global Daily LLM demonstration budget circuit breaker
let globalDailyLlmCalls = 0;
let lastResetDate = new Date().toISOString().slice(0, 10);

export async function checkGlobalLlmBudget(maxDailyBudget = 500): Promise<{
  budgetExceeded: boolean;
  currentCount: number;
  maxBudget: number;
}> {
  const today = new Date().toISOString().slice(0, 10);

  if (redisClient) {
    try {
      const key = `@devguard:daily_budget:${today}`;
      const count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, 86400);
      }
      return {
        budgetExceeded: count > maxDailyBudget,
        currentCount: count,
        maxBudget: maxDailyBudget,
      };
    } catch (err) {
      console.warn('Redis global daily budget check error:', err);
    }
  }

  // Fallback for tests / offline dev
  if (lastResetDate !== today) {
    globalDailyLlmCalls = 0;
    lastResetDate = today;
  }
  globalDailyLlmCalls += 1;

  return {
    budgetExceeded: globalDailyLlmCalls > maxDailyBudget,
    currentCount: globalDailyLlmCalls,
    maxBudget: maxDailyBudget,
  };
}

/**
 * Checks rate limits per IP/client identifier.
 * Uses Upstash Redis if configured, or gracefully falls back to structured in-memory rate limiting.
 */
export async function checkRateLimit(identifier: string) {
  if (ratelimitInstance) {
    try {
      const result = await ratelimitInstance.limit(identifier);
      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
      };
    } catch (err) {
      console.warn('Upstash rate limiting failed, falling back to in-memory store:', err);
    }
  }

  return inMemoryRateLimit(identifier, 5, 10 * 60 * 1000);
}
