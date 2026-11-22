import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, scrubSecrets, getRecentStructuredLogs } from '@/lib/observability/logger';

describe('Centralized Secret Redaction & Log Sanitization (lib/observability/logger.ts)', () => {
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockClear();
    consoleWarnSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  it('redacts Authorization headers and Bearer tokens from string logs', () => {
    const rawMessage = 'Inbound request failed with header Authorization: Bearer secret-jwt-token-value-12345';
    const scrubbed = scrubSecrets(rawMessage) as string;

    expect(scrubbed).not.toContain('secret-jwt-token-value-12345');
    expect(scrubbed).toContain('[REDACTED_SECRET]');
  });

  it('redacts GitHub PATs, Groq API keys, Google Gemini keys, and Stripe keys', () => {
    const secrets = [
      'ghp_mock_github_personal_token_12345',
      'github_pat_mock_github_token_finegrained',
      'gsk_mock_groq_api_key_test_12345',
      'AIzaSyMockGeminiKeyForUnitTests12345',
      'sk_live_mock_example_test_key_123',
      'sk_test_mock_example_test_key_123',
      ['eyJhbGciOi', 'mockJwtHeader', '.', 'eyJzdWIiOi', 'mockPayload', '.', 'mockSignaturePart'].join(''),
    ];

    for (const secret of secrets) {
      const logText = `Error occurred during API exchange: key=${secret}`;
      const scrubbed = scrubSecrets(logText) as string;

      expect(scrubbed).not.toContain(secret);
      expect(scrubbed).toContain('[REDACTED_SECRET]');
    }
  });

  it('redacts sensitive keys from deeply nested structured objects and context dictionaries', () => {
    const sensitivePayload = {
      user: {
        id: 'usr_123',
        email: 'dev@example.com',
        auth: {
          token: 'sensitive-auth-token',
          apiKey: 'AIzaSySecretApiKeyHere12345678901234',
        },
      },
      headers: {
        authorization: 'Bearer super-secret-bearer-token',
        cookie: 'session_id=confidential_session_cookie',
        'x-hub-signature-256': 'sha256=1234567890abcdef',
      },
      safeMetadata: {
        repo: 'owner/repo',
        pr: 42,
      },
    };

    const scrubbed = scrubSecrets(sensitivePayload) as typeof sensitivePayload;

    expect(scrubbed.user.auth.token).toBe('[REDACTED_SECRET]');
    expect(scrubbed.user.auth.apiKey).toBe('[REDACTED_SECRET]');
    expect(scrubbed.headers.authorization).toBe('[REDACTED_SECRET]');
    expect(scrubbed.headers.cookie).toBe('[REDACTED_SECRET]');
    expect(scrubbed.headers['x-hub-signature-256']).toBe('[REDACTED_SECRET]');

    // Non-sensitive data remains preserved
    expect(scrubbed.safeMetadata.repo).toBe('owner/repo');
    expect(scrubbed.safeMetadata.pr).toBe(42);
  });

  it('proves that logger methods never emit secrets to console or in-memory structured logs', () => {
    const leakAttemptKey = 'gsk_superSecretGroqKey1234567890123456';
    const bearerAttempt = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitivePayload123.sig';

    logger.info('Attempting webhook dispatch', {
      apiKey: leakAttemptKey,
      authHeader: bearerAttempt,
      repo: 'my-org/my-repo',
    });

    const recentLogs = getRecentStructuredLogs(5);
    const matchedLog = recentLogs.find((l) => l.message.includes('Attempting webhook dispatch'));

    expect(matchedLog).toBeDefined();

    const serializedLog = JSON.stringify(matchedLog);
    expect(serializedLog).not.toContain(leakAttemptKey);
    expect(serializedLog).not.toContain(bearerAttempt);
    expect(serializedLog).not.toContain('sensitivePayload123');

    // Also assert console.log call was sanitized
    expect(consoleLogSpy).toHaveBeenCalled();
    const lastConsoleCall = consoleLogSpy.mock.calls[consoleLogSpy.mock.calls.length - 1][0];
    expect(lastConsoleCall).not.toContain(leakAttemptKey);
    expect(lastConsoleCall).not.toContain(bearerAttempt);
  });
});
