import { describe, it, expect, beforeEach } from 'vitest';
import { validateEnv, sanitizeServerEnvForClient } from '@/lib/env';

describe('P0 Security — Environment Variable Validation (lib/env.ts)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('rejects client exposure of server secrets prefixed with NEXT_PUBLIC_', () => {
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY = 'secret-service-key-leak';
    expect(() => validateEnv()).toThrow(/secret.*exposed.*NEXT_PUBLIC_/i);
  });

  it('rejects client exposure of GROQ_API_KEY or GEMINI_API_KEY', () => {
    process.env.NEXT_PUBLIC_GROQ_API_KEY = 'gsk_leak123';
    expect(() => validateEnv()).toThrow(/secret.*exposed.*NEXT_PUBLIC_/i);
  });

  it('validates proper URLs for Supabase and Upstash', () => {
    process.env.SUPABASE_URL = 'invalid-not-a-url';
    expect(() => validateEnv()).toThrow(/SUPABASE_URL/i);
  });

  it('parses ADMIN_GITHUB_LOGINS into an array of allowed logins', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY;
    delete process.env.NEXT_PUBLIC_GROQ_API_KEY;
    process.env.SUPABASE_URL = 'https://valid-supabase.supabase.co';
    process.env.ADMIN_GITHUB_LOGINS = 'rajendrabist07, octocat, admin-user';
    const parsed = validateEnv();
    expect(parsed.ADMIN_GITHUB_LOGINS).toEqual(['rajendrabist07', 'octocat', 'admin-user']);
  });

  it('sanitizeServerEnvForClient strips all non-NEXT_PUBLIC_ keys', () => {
    const safe = sanitizeServerEnvForClient({
      GROQ_API_KEY: 'secret-key',
      SUPABASE_SERVICE_KEY: 'super-secret',
      NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.co',
    });
    expect(safe).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.co',
    });
    expect((safe as Record<string, unknown>).GROQ_API_KEY).toBeUndefined();
    expect((safe as Record<string, unknown>).SUPABASE_SERVICE_KEY).toBeUndefined();
  });
});
