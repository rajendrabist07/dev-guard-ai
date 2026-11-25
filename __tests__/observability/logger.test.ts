import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, scrubSecrets, fetchStructuredLogs, getRecentStructuredLogs } from '@/lib/observability/logger';
import * as Sentry from '@sentry/nextjs';

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  withScope: vi.fn((cb) => {
    const scope = {
      setExtras: vi.fn(),
      setTag: vi.fn(),
    };
    cb(scope);
  }),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

describe('Observability & Structured Logger (lib/observability/logger.ts)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('scrubs sensitive credentials, API keys, and JWT tokens from strings', () => {
    const rawMessage = 'Failed with token: ghp_12345678901234567890 and stripe key sk_live_99999888887777766666';
    const scrubbed = scrubSecrets(rawMessage) as string;

    expect(scrubbed).not.toContain('ghp_12345678901234567890');
    expect(scrubbed).not.toContain('sk_live_99999888887777766666');
    expect(scrubbed).toContain('[REDACTED_SECRET]');
  });

  it('scrubs sensitive fields from structured context objects recursively', () => {
    const rawContext = {
      user: 'alice',
      secretKey: 'my_super_secret_value',
      headers: {
        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M',
      },
    };

    const sanitized = scrubSecrets(rawContext) as Record<string, unknown>;
    expect(sanitized.user).toBe('alice');
    expect(sanitized.secretKey).toBe('[REDACTED_SECRET]');
    expect(JSON.stringify(sanitized)).not.toContain('my_super_secret_value');
  });

  it('outputs valid JSON formatted logs without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.info('Test structured message', {
      module: 'unit-test',
      action: 'assert-logger',
      count: 42,
    });

    expect(consoleSpy).toHaveBeenCalled();
    const loggedStr = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(loggedStr);

    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('Test structured message');
    expect(parsed.module).toBe('unit-test');
    expect(parsed.timestamp).toBeDefined();

    consoleSpy.mockRestore();
  });

  it('handles debug level logs when NODE_ENV is development', () => {
    (process.env as any).NODE_ENV = 'development';
    const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger.debug('Debug detail message', { trace: 'step-1' });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('handles warn logs and sends breadcrumb to Sentry when configured', () => {
    process.env.SENTRY_DSN = 'https://fake@sentry.io/123';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('High latency detected', { module: 'database', latencyMs: 2500 });

    expect(warnSpy).toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'database',
        level: 'warning',
      })
    );

    warnSpy.mockRestore();
  });

  it('handles error logs with Error instance and reports to Sentry', () => {
    process.env.SENTRY_DSN = 'https://fake@sentry.io/123';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const err = new Error('Database connection failed');
    logger.error('Failed to query database', err, {
      module: 'database',
      action: 'connect',
    });

    expect(errorSpy).toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(err);

    errorSpy.mockRestore();
  });

  it('handles error logs with string error message and reports to Sentry', () => {
    process.env.SENTRY_DSN = 'https://fake@sentry.io/123';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.error('Something went wrong', 'String error message', {
      module: 'auth',
      action: 'login',
    });

    expect(errorSpy).toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('maintains in-memory ring buffer of recent logs and provides retrieval methods', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('Ring buffer entry 1');
    logger.info('Ring buffer entry 2');

    const logs = getRecentStructuredLogs(10);
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs.some((l) => l.message === 'Ring buffer entry 1')).toBe(true);

    const fetched = await fetchStructuredLogs(10);
    expect(fetched.length).toBeGreaterThanOrEqual(2);
    logSpy.mockRestore();
  });
});
