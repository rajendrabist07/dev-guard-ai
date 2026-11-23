import crypto from 'crypto';
import { logger } from '../observability/logger';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: number;
  correlationId?: string;
  moduleName?: string;
}

export function generateCorrelationId(): string {
  return `corr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function extractCorrelationId(headers?: Headers | Record<string, string | null | undefined>): string {
  if (!headers) return generateCorrelationId();
  if ('get' in headers && typeof headers.get === 'function') {
    const existing = headers.get('x-correlation-id') || headers.get('x-request-id');
    return existing || generateCorrelationId();
  }
  const obj = headers as Record<string, string | null | undefined>;
  const found = obj['x-correlation-id'] || obj['x-request-id'] || obj['X-Correlation-Id'];
  return found || generateCorrelationId();
}

function parseRetryAfter(response: Response): number | null {
  const retryAfterHeader = response.headers.get('retry-after');
  if (!retryAfterHeader) return null;

  // Try parsing integer seconds
  const seconds = parseInt(retryAfterHeader, 10);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  // Try parsing HTTP date
  const dateMs = Date.parse(retryAfterHeader);
  if (!isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : null;
  }

  return null;
}

/**
 * Resilient outbound fetch wrapper with AbortController timeout, exponential backoff,
 * randomized jitter, and Retry-After header handling.
 * Only retries HTTP 429 and 5xx responses.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: RetryOptions
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? 2;
  const initialDelayMs = options?.initialDelayMs ?? 200;
  const backoffMultiplier = options?.backoffMultiplier ?? 2;
  const timeoutMs = options?.timeoutMs ?? 5000;
  const correlationId = options?.correlationId || generateCorrelationId();
  const moduleName = options?.moduleName || 'outbound-fetch';

  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    // Merge abort signals if caller supplied one
    const combinedSignal = controller.signal;
    if (init?.signal) {
      const callerSignal = init.signal;
      if (callerSignal.aborted) {
        clearTimeout(timeoutHandle);
        throw new Error('Caller request aborted');
      }
      callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const headers = new Headers(init?.headers);
    if (!headers.has('x-correlation-id')) {
      headers.set('x-correlation-id', correlationId);
    }

    try {
      const response = await fetch(url, {
        ...init,
        headers,
        signal: combinedSignal,
      });

      clearTimeout(timeoutHandle);

      // Check if retry is needed: HTTP 429 (Rate Limit) or 5xx (Server Error)
      const isRateLimited = response.status === 429;
      const isServerError = response.status >= 500 && response.status <= 599;

      if ((isRateLimited || isServerError) && attempt < maxRetries) {
        attempt++;
        const retryAfterMs = parseRetryAfter(response);
        // Exponential backoff with jitter: delay * factor^attempt * (0.8 + 0.4 * rand)
        const jitterMultiplier = 0.8 + Math.random() * 0.4;
        const calculatedDelayMs = Math.round(
          initialDelayMs * Math.pow(backoffMultiplier, attempt - 1) * jitterMultiplier
        );
        const delayMs = Math.min(retryAfterMs ?? calculatedDelayMs, 10_000); // Cap at 10s

        logger.warn(`Outbound fetch received HTTP ${response.status} from ${url}. Retrying (attempt ${attempt}/${maxRetries}) in ${delayMs}ms.`, {
          module: moduleName,
          status: response.status,
          attempt,
          delayMs,
          correlationId,
        });

        await new Promise((res) => setTimeout(res, delayMs));
        continue;
      }

      return response;
    } catch (err: unknown) {
      clearTimeout(timeoutHandle);

      const isAbortError = err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'));
      if (attempt < maxRetries) {
        attempt++;
        const jitterMultiplier = 0.8 + Math.random() * 0.4;
        const delayMs = Math.round(initialDelayMs * Math.pow(backoffMultiplier, attempt - 1) * jitterMultiplier);

        logger.warn(`Outbound fetch exception (${isAbortError ? 'timeout' : 'network failure'}) connecting to ${url}. Retrying (attempt ${attempt}/${maxRetries}) in ${delayMs}ms.`, {
          module: moduleName,
          attempt,
          delayMs,
          error: err instanceof Error ? err.message : String(err),
          correlationId,
        });

        await new Promise((res) => setTimeout(res, delayMs));
        continue;
      }

      throw err;
    }
  }
}
