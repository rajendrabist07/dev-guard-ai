import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyGitHubWebhook } from '@/lib/github/client';
import { POST as webhookPostHandler } from '@/app/api/webhooks/github/route';
import { GET as getResultHandler } from '@/app/api/try/result/[id]/route';
import { GET as getHistoryHandler } from '@/app/api/try/history/route';
import { synthesizeReviewWithLLM } from '@/lib/agent/llm';
import { logger, getRecentStructuredLogs } from '@/lib/observability/logger';
import * as clientModule from '@/lib/github/client';
import * as supabaseModule from '@/lib/db/supabase';

describe('Sprint 9 — Full Backend Hardening & Cross-Cutting Resilience Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. HMAC-SHA256 GitHub Webhook Signature Verification', () => {
    it('rejects webhooks with missing or invalid HMAC-SHA256 signature with HTTP 401', async () => {
      vi.spyOn(clientModule, 'verifyGitHubWebhook').mockResolvedValue(false);

      const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'pull_request',
          'x-hub-signature-256': 'sha256=invalid_signature_hash_value',
        },
        body: JSON.stringify({ action: 'opened' }),
      });

      const res = await webhookPostHandler(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Invalid webhook signature');
    });

    it('rejects verification if GITHUB_WEBHOOK_SECRET environment variable is missing', async () => {
      const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;
      delete process.env.GITHUB_WEBHOOK_SECRET;

      const isValid = await verifyGitHubWebhook('{}', 'sha256=mock');
      expect(isValid).toBe(false);

      process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
    });
  });

  describe('2. Structured Error Responses Across API Endpoints', () => {
    it('returns consistent structured JSON errors without leaking stack traces on 404', async () => {
      vi.spyOn(supabaseModule, 'getTryRunById').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/try/result/nonexistent-id');
      const res = await getResultHandler(req, { params: Promise.resolve({ id: 'nonexistent-id' }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Test run not found or expired');
      expect(json.stack).toBeUndefined();
    });

    it('returns structured JSON with 500 status when database throws uncaught error', async () => {
      vi.spyOn(supabaseModule, 'getTryRunById').mockRejectedValue(new Error('Connection failure'));

      const req = new NextRequest('http://localhost:3000/api/try/result/test-err-id');
      const res = await getResultHandler(req, { params: Promise.resolve({ id: 'test-err-id' }) });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Connection failure');
      expect(json.stack).toBeUndefined();
    });

    it('gracefully handles empty session queries in history endpoint', async () => {
      const req = new NextRequest('http://localhost:3000/api/try/history');
      const res = await getHistoryHandler(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.runs).toEqual([]);
    });
  });

  describe('3. Multi-tier LLM Timeout & Fallback Execution', () => {
    it('triggers fallback when primary LLM provider times out or fails', async () => {
      const originalGroq = process.env.GROQ_API_KEY;
      const originalGemini = process.env.GEMINI_API_KEY;

      process.env.GROQ_API_KEY = 'mock_groq_trigger_fallback';
      process.env.GEMINI_API_KEY = 'mock_gemini_key';

      const result = await synthesizeReviewWithLLM({
        prTitle: 'Fix database query',
        diffSummary: 'SELECT * FROM users WHERE id = ' + 1,
        toolOutputs: [
          {
            tool: 'runLinter',
            summary: 'SQL injection vulnerability detected',
            findingsCount: 1,
          },
        ],
      });

      expect(result.summary).toBeDefined();
      expect(result.provider).toBeDefined();
      expect(result.telemetry).toBeDefined();

      process.env.GROQ_API_KEY = originalGroq;
      process.env.GEMINI_API_KEY = originalGemini;
    });
  });

  describe('4. End-to-End Structured Logging Observability', () => {
    it('records structured JSON log entries for pipeline lifecycle events', () => {
      logger.info('Pipeline execution step completed', {
        module: 'webhook-handler',
        action: 'review-completed',
        reviewRunId: 'test-obs-run-123',
        findingsCount: 2,
      });

      const logs = getRecentStructuredLogs(10);
      const targetLog = logs.find((l) => l.message === 'Pipeline execution step completed');

      expect(targetLog).toBeDefined();
      expect(targetLog?.level).toBe('info');
      expect(targetLog?.context?.module).toBe('webhook-handler');
      expect(targetLog?.context?.reviewRunId).toBe('test-obs-run-123');
    });
  });
});
