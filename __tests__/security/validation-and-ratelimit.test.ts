import { describe, it, expect } from 'vitest';
import { TryApiSchema, BadgeParamsSchema } from '@/lib/validation/schemas';
import { checkRateLimit } from '@/lib/security/ratelimit';

describe('Security Hardening & Input Validation (lib/validation & lib/security)', () => {
  it('validates and accepts legitimate /api/try payload', () => {
    const validPayload = {
      inputType: 'pasted' as const,
      prTitle: 'Fix authentication flow',
      prAuthor: 'dev-alice',
      diff: '+ const token = process.env.AUTH_SECRET;',
      fileNames: ['lib/auth.ts'],
    };

    const result = TryApiSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects oversized code snippets exceeding 100KB', () => {
    const oversizedPayload = {
      inputType: 'pasted',
      diff: 'A'.repeat(105000), // Exceeds 100KB
    };

    const result = TryApiSchema.safeParse(oversizedPayload);
    expect(result.success).toBe(false);
  });

  it('rejects malformed badge parameter', () => {
    const badParam = { repoId: '' };
    const result = BadgeParamsSchema.safeParse(badParam);
    expect(result.success).toBe(false);
  });

  it('enforces 5-request rate limiting sliding window', async () => {
    const testIp = `test-ip-${Date.now()}-${Math.random()}`;

    // 5 requests within limit
    for (let i = 0; i < 5; i++) {
      const res = await checkRateLimit(testIp);
      expect(res.success).toBe(true);
      expect(res.remaining).toBe(4 - i);
    }

    // 6th request blocked
    const blockedRes = await checkRateLimit(testIp);
    expect(blockedRes.success).toBe(false);
    expect(blockedRes.remaining).toBe(0);
  });
});
