import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as tryRoute } from '@/app/api/try/route';
import { GET as getResultRoute } from '@/app/api/try/result/[id]/route';
import * as ratelimitModule from '@/lib/security/ratelimit';
import * as supabaseModule from '@/lib/db/supabase';

describe('P0 Security — Try Playground API Hardening (app/api/try & /try/result/[id])', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Zod Schema Strict Property Limits', () => {
    it('rejects payload with extra/unallowed fields (strict mode) with 400', async () => {
      vi.spyOn(ratelimitModule, 'checkRateLimit').mockResolvedValue({
        success: true,
        limit: 10,
        remaining: 9,
        reset: Date.now() + 60000,
      });

      const req = new NextRequest('http://localhost:3000/api/try', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prTitle: 'Valid PR',
          diff: '+ console.log(1);',
          maliciousInjectedField: 'exploit_payload', // Not allowed by schema
        }),
      });

      const res = await tryRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid');
    });

    it('rejects oversized code snippet (>100KB) with 400', async () => {
      vi.spyOn(ratelimitModule, 'checkRateLimit').mockResolvedValue({
        success: true,
        limit: 10,
        remaining: 9,
        reset: Date.now() + 60000,
      });

      const oversizedDiff = 'a'.repeat(101 * 1024); // 101KB
      const req = new NextRequest('http://localhost:3000/api/try', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          diff: oversizedDiff,
        }),
      });

      const res = await tryRoute(req);
      expect(res.status).toBe(400);
    });
  });

  describe('2. Rate Limiting with Retry-After Header', () => {
    it('returns HTTP 429 with Retry-After header when rate limit is exceeded', async () => {
      vi.spyOn(ratelimitModule, 'checkRateLimit').mockResolvedValue({
        success: false,
        limit: 10,
        remaining: 0,
        reset: Date.now() + 30000, // 30s reset
      });

      const req = new NextRequest('http://localhost:3000/api/try', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          diff: '+ let x = 1;',
        }),
      });

      const res = await tryRoute(req);
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBeDefined();
    });
  });

  describe('3. Unguessable UUIDv4 IDs and Noindex Header for /try/result/[id]', () => {
    it('returns 404 for invalid sequential/non-UUID run IDs', async () => {
      const req = new NextRequest('http://localhost:3000/api/try/result/try-123456');
      const res = await getResultRoute(req, { params: Promise.resolve({ id: 'try-123456' }) });
      expect(res.status).toBe(404);
    });

    it('returns X-Robots-Tag: noindex, nofollow for valid UUID results', async () => {
      const validUuid = '12345678-1234-4234-8234-123456789abc';
      vi.spyOn(supabaseModule, 'getTryRunById').mockResolvedValue({
        id: validUuid,
        session_id: 'session-1',
        input_type: 'pasted',
        input_snippet: 'const x = 1;',
        pr_title: 'Test',
        pr_author: 'visitor',
        findings: [],
        agent_trace: [],
        tool_calls_count: 0,
        summary: 'Clean',
        provider_used: 'Deterministic Linter',
        status: 'completed',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });

      const req = new NextRequest(`http://localhost:3000/api/try/result/${validUuid}`);
      const res = await getResultRoute(req, { params: Promise.resolve({ id: validUuid }) });
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    });

    it('returns 404 if result has expired (>30 days)', async () => {
      const validUuid = '12345678-1234-4234-8234-123456789def';
      vi.spyOn(supabaseModule, 'getTryRunById').mockResolvedValue({
        id: validUuid,
        session_id: 'session-1',
        input_type: 'pasted',
        input_snippet: 'const x = 1;',
        pr_title: 'Expired test',
        pr_author: 'visitor',
        findings: [],
        agent_trace: [],
        tool_calls_count: 0,
        summary: 'Clean',
        provider_used: 'Deterministic Linter',
        status: 'completed',
        created_at: new Date(Date.now() - 35 * 86400000).toISOString(),
        expires_at: new Date(Date.now() - 5 * 86400000).toISOString(), // Expired 5 days ago
      });

      const req = new NextRequest(`http://localhost:3000/api/try/result/${validUuid}`);
      const res = await getResultRoute(req, { params: Promise.resolve({ id: validUuid }) });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain('expired');
    });
  });

  describe('4. Global Daily LLM Budget Circuit Breaker', () => {
    it('degrades to deterministic engine when global daily LLM budget is exceeded', async () => {
      vi.spyOn(ratelimitModule, 'checkRateLimit').mockResolvedValue({
        success: true,
        limit: 10,
        remaining: 9,
        reset: Date.now() + 60000,
      });
      vi.spyOn(ratelimitModule, 'checkGlobalLlmBudget').mockResolvedValue({
        budgetExceeded: true,
        currentCount: 501,
        maxBudget: 500,
      });

      const req = new NextRequest('http://localhost:3000/api/try', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          diff: '+ const apiKey = "1234567890123456";',
          inputType: 'pasted',
        }),
      });

      const res = await tryRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.circuitBreakerTriggered).toBe(true);
      expect(json.providerUsed).toContain('Deterministic');
    });
  });
});
