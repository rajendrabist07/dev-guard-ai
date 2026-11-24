import { IngestedCiData } from './types';
import { getCachedValue, setCachedValue } from '@/lib/cache/redis';
import { logger } from '@/lib/observability/logger';

// In-memory fallback cache for serverless environments when Redis is not provisioned
const fallbackIngestCache = new Map<string, IngestedCiData>();

function buildIngestKey(repository: string, sha: string): string {
  const safeRepo = encodeURIComponent(repository.toLowerCase());
  const safeSha = encodeURIComponent(sha.toLowerCase());
  return `devguard:ingest:${safeRepo}:${safeSha}`;
}

/**
 * Persists normalized ingested CI findings from devguard-action.
 */
export async function storeIngestedCiData(data: IngestedCiData): Promise<void> {
  const key = buildIngestKey(data.repository, data.sha);
  fallbackIngestCache.set(key, data);

  try {
    // Retain ingested CI data for 7 days (604800 seconds)
    await setCachedValue(key, data, 604800);
  } catch (err: unknown) {
    logger.warn('Failed to cache ingested CI data in Redis, using memory store fallback', {
      repository: data.repository,
      sha: data.sha,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Retrieves ingested CI findings for a given repository and commit SHA.
 */
export async function getIngestedCiData(
  repository: string,
  sha: string
): Promise<IngestedCiData | null> {
  const key = buildIngestKey(repository, sha);

  try {
    const cached = await getCachedValue<IngestedCiData>(key);
    if (cached) return cached;
  } catch {
    // Proceed to fallback
  }

  return fallbackIngestCache.get(key) || null;
}
