import { Redis } from '@upstash/redis';
import { logger } from '@/lib/observability/logger';

let redisClient: Redis | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redisClient = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// In-memory cache fallback for local/offline execution
const memoryCache = new Map<string, { value: unknown; expiresAt: number }>();

// Telemetry counters for OSV cache tracking
let totalCacheLookups = 0;
let totalCacheHits = 0;

export interface CacheStats {
  lookups: number;
  hits: number;
  hitRatePercentage: number;
}

export function getCacheStats(): CacheStats {
  const hitRate = totalCacheLookups === 0 ? 0 : (totalCacheHits / totalCacheLookups) * 100;
  return {
    lookups: totalCacheLookups,
    hits: totalCacheHits,
    hitRatePercentage: Number(hitRate.toFixed(1)),
  };
}

export function resetCacheStats(): void {
  totalCacheLookups = 0;
  totalCacheHits = 0;
}

/**
 * Retrieves a cached value by key from Upstash Redis or local memory fallback.
 */
export async function getCachedValue<T>(key: string): Promise<T | null> {
  totalCacheLookups++;

  if (redisClient) {
    try {
      const value = await redisClient.get<T>(key);
      if (value !== null && value !== undefined) {
        totalCacheHits++;
        return value;
      }
    } catch (err) {
      logger.warn('Redis cache get failed, checking memory fallback', { error: err });
    }
  }

  const memoryEntry = memoryCache.get(key);
  if (memoryEntry && Date.now() < memoryEntry.expiresAt) {
    totalCacheHits++;
    return memoryEntry.value as T;
  }

  return null;
}

/**
 * Caches a value with a 24-hour TTL (86400 seconds).
 */
export async function setCachedValue(key: string, value: unknown, ttlSeconds = 86400): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.set(key, value, { ex: ttlSeconds });
    } catch (err) {
      logger.warn('Redis cache set failed, saving to memory fallback', { error: err });
    }
  }

  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}
