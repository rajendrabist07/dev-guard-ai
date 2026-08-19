import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

describe('GitHub Webhook Signature Verification (lib/github/client.ts)', () => {
  const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = 'test_webhook_secret_key_12345';
  });

  afterEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
    vi.resetModules();
  });

  it('accepts valid HMAC-SHA256 signatures matching payload and secret', async () => {
    const { verifyGitHubWebhook } = await import('@/lib/github/client');

    const secret = 'test_webhook_secret_key_12345';
    const payload = JSON.stringify({
      action: 'opened',
      number: 42,
      repository: { full_name: 'test-org/test-repo' },
    });

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload, 'utf8');
    const validSignature = `sha256=${hmac.digest('hex')}`;

    const isValid = await verifyGitHubWebhook(payload, validSignature);
    expect(isValid).toBe(true);
  });

  it('rejects forged or modified payloads with invalid signature', async () => {
    const { verifyGitHubWebhook } = await import('@/lib/github/client');

    const secret = 'test_webhook_secret_key_12345';
    const originalPayload = JSON.stringify({ action: 'opened', number: 1 });
    const forgedPayload = JSON.stringify({ action: 'opened', number: 999 });

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(originalPayload, 'utf8');
    const signature = `sha256=${hmac.digest('hex')}`;

    const isValid = await verifyGitHubWebhook(forgedPayload, signature);
    expect(isValid).toBe(false);
  });

  it('rejects signatures generated with wrong secret key', async () => {
    const { verifyGitHubWebhook } = await import('@/lib/github/client');

    const wrongSecret = 'attacker_secret_xyz';
    const payload = JSON.stringify({ action: 'opened', number: 1 });

    const hmac = crypto.createHmac('sha256', wrongSecret);
    hmac.update(payload, 'utf8');
    const forgedSignature = `sha256=${hmac.digest('hex')}`;

    const isValid = await verifyGitHubWebhook(payload, forgedSignature);
    expect(isValid).toBe(false);
  });

  it('rejects malformed signature strings safely without throwing unhandled exceptions', async () => {
    const { verifyGitHubWebhook } = await import('@/lib/github/client');

    const payload = JSON.stringify({ action: 'opened' });
    const malformedSignatures = [
      'invalid-signature-format',
      'sha256=xyz',
      '',
      'null',
      'sha1=1234567890abcdef',
    ];

    for (const sig of malformedSignatures) {
      const isValid = await verifyGitHubWebhook(payload, sig);
      expect(isValid).toBe(false);
    }
  });

  it('rejects all requests when GITHUB_WEBHOOK_SECRET is not configured', async () => {
    process.env.GITHUB_WEBHOOK_SECRET = '';
    const { verifyGitHubWebhook } = await import('@/lib/github/client');

    const isValid = await verifyGitHubWebhook('{}', 'sha256=1234');
    expect(isValid).toBe(false);
  });
});
