import { describe, it, expect, vi } from 'vitest';
import { logger, scrubSecrets } from '@/lib/observability/logger';

describe('Observability & Structured Logger (lib/observability/logger.ts)', () => {
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
});
