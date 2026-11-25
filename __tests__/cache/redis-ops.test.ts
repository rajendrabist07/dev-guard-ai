import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  pingRedis,
  getCachedValue,
  setCachedValue,
  getCacheStats,
  resetCacheStats,
  setRedisClientForTesting,
} from '@/lib/cache/redis';

describe('lib/cache/redis.ts operations and fallback', () => {
  beforeEach(() => {
    resetCacheStats();
    setRedisClientForTesting(null);
  });

  it('reports stats correctly and calculates hit rate', () => {
    resetCacheStats();
    const stats0 = getCacheStats();
    expect(stats0.lookups).toBe(0);
    expect(stats0.hits).toBe(0);
    expect(stats0.hitRatePercentage).toBe(0);
  });

  it('stores and retrieves values from in-memory cache fallback', async () => {
    await setCachedValue('test-key-1', { foo: 'bar' }, 10);
    const value = await getCachedValue<{ foo: string }>('test-key-1');
    expect(value).toEqual({ foo: 'bar' });

    const stats = getCacheStats();
    expect(stats.lookups).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.hitRatePercentage).toBe(100);
  });

  it('returns null on cache miss and calculates fractional hit rate', async () => {
    const miss = await getCachedValue('non-existent-key-999');
    expect(miss).toBeNull();

    await setCachedValue('test-key-2', 42, 10);
    const hit = await getCachedValue<number>('test-key-2');
    expect(hit).toBe(42);

    const stats = getCacheStats();
    expect(stats.lookups).toBe(2);
    expect(stats.hits).toBe(1);
    expect(stats.hitRatePercentage).toBe(50);
  });

  it('handles expired cache entries correctly', async () => {
    await setCachedValue('expired-key', 'old-data', -1);
    const result = await getCachedValue('expired-key');
    expect(result).toBeNull();
  });

  it('returns unconfigured status when pinging without redis connection', async () => {
    const ping = await pingRedis();
    expect(ping.configured).toBe(false);
    expect(ping.ok).toBe(false);
  });

  it('pings and retrieves from active Redis client', async () => {
    const mockRedis = {
      ping: vi.fn().mockResolvedValue('PONG'),
      get: vi.fn().mockResolvedValue({ cached: 'from-redis' }),
      set: vi.fn().mockResolvedValue('OK'),
    };
    setRedisClientForTesting(mockRedis as any);

    const ping = await pingRedis();
    expect(ping.ok).toBe(true);
    expect(ping.configured).toBe(true);

    await setCachedValue('redis-k', { cached: 'from-redis' });
    expect(mockRedis.set).toHaveBeenCalledWith('redis-k', { cached: 'from-redis' }, { ex: 86400 });

    const value = await getCachedValue('redis-k');
    expect(value).toEqual({ cached: 'from-redis' });
  });

  it('handles Redis client errors gracefully and falls back to memory', async () => {
    const mockFailingRedis = {
      ping: vi.fn().mockRejectedValue(new Error('Connection timed out')),
      get: vi.fn().mockRejectedValue(new Error('Redis GET timeout')),
      set: vi.fn().mockRejectedValue(new Error('Redis SET timeout')),
    };
    setRedisClientForTesting(mockFailingRedis as any);

    const ping = await pingRedis();
    expect(ping.ok).toBe(false);
    expect(ping.configured).toBe(true);

    // set falls back to memoryCache
    await setCachedValue('fallback-k', 'memory-val', 60);

    // get falls back to memoryCache
    const val = await getCachedValue('fallback-k');
    expect(val).toBe('memory-val');
  });
});
