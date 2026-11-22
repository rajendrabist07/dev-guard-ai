import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as webhookRoute } from '@/app/api/webhooks/github/route';
import * as clientModule from '@/lib/github/client';
import * as supabaseModule from '@/lib/db/supabase';

describe('P0 Security — Webhook Hardening & Idempotency (app/api/webhooks/github/route.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Signature Verification with crypto.timingSafeEqual', () => {
    it('rejects webhooks with missing x-hub-signature-256 header with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'pull_request',
          'x-github-delivery': 'delivery-uuid-1',
        },
        body: JSON.stringify({ action: 'opened' }),
      });

      const res = await webhookRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Missing');
    });

    it('rejects webhooks with invalid HMAC-SHA256 signature with 401', async () => {
      vi.spyOn(clientModule, 'verifyGitHubWebhook').mockResolvedValue(false);

      const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'pull_request',
          'x-github-delivery': 'delivery-uuid-2',
          'x-hub-signature-256': 'sha256=tampered_or_invalid_signature',
        },
        body: JSON.stringify({ action: 'opened' }),
      });

      const res = await webhookRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Invalid webhook signature');
    });
  });

  describe('2. Delivery ID Replay Prevention', () => {
    it('rejects missing x-github-delivery header with 400 Bad Request', async () => {
      vi.spyOn(clientModule, 'verifyGitHubWebhook').mockResolvedValue(true);

      const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'pull_request',
          'x-hub-signature-256': 'sha256=valid_signature',
        },
        body: JSON.stringify({ action: 'opened' }),
      });

      const res = await webhookRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('x-github-delivery');
    });

    it('rejects replayed x-github-delivery ID with 200 or 409 and does not trigger review', async () => {
      vi.spyOn(clientModule, 'verifyGitHubWebhook').mockResolvedValue(true);
      // Mock delivery id already seen / unique constraint violation
      vi.spyOn(supabaseModule, 'recordWebhookDelivery').mockResolvedValue(false);

      const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'pull_request',
          'x-github-delivery': 'replayed-delivery-uuid-999',
          'x-hub-signature-256': 'sha256=valid_signature',
        },
        body: JSON.stringify({ action: 'opened', pull_request: { number: 1, head: { sha: 'abc' } } }),
      });

      const res = await webhookRoute(req);
      expect([200, 409]).toContain(res.status);
      const json = await res.json();
      expect(json.message).toContain('replay');
    });
  });

  describe('3. Max Payload Size Capping', () => {
    it('rejects oversized webhook payload (>5MB) with 413 Payload Too Large', async () => {
      vi.spyOn(clientModule, 'verifyGitHubWebhook').mockResolvedValue(true);

      const largeBody = 'a'.repeat(6 * 1024 * 1024); // 6MB
      const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'pull_request',
          'x-github-delivery': 'delivery-uuid-large',
          'x-hub-signature-256': 'sha256=valid',
        },
        body: largeBody,
      });

      const res = await webhookRoute(req);
      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.error).toContain('Payload too large');
    });
  });

  describe('4. Unsupported Event Handling', () => {
    it('returns 202 Accepted with a log line for unsupported event types like ping, push, issues', async () => {
      vi.spyOn(clientModule, 'verifyGitHubWebhook').mockResolvedValue(true);
      vi.spyOn(supabaseModule, 'recordWebhookDelivery').mockResolvedValue(true);

      const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'star',
          'x-github-delivery': 'delivery-uuid-star',
          'x-hub-signature-256': 'sha256=valid',
        },
        body: JSON.stringify({ action: 'created' }),
      });

      const res = await webhookRoute(req);
      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.message).toContain('ignored');
    });
  });

  describe('5. Database Idempotency ON CONFLICT DO NOTHING', () => {
    it('handles duplicate PR commit sha idempotently via database constraint', async () => {
      vi.spyOn(clientModule, 'verifyGitHubWebhook').mockResolvedValue(true);
      vi.spyOn(supabaseModule, 'recordWebhookDelivery').mockResolvedValue(true);
      vi.spyOn(supabaseModule, 'ensureRepoForInstallation').mockResolvedValue({
        id: 'repo-1',
        installation_id: 'inst-1',
        full_name: 'test-org/test-repo',
        is_active: true,
        created_at: new Date().toISOString(),
      });

      // Mock createReviewRun returning duplicate status from ON CONFLICT DO NOTHING
      vi.spyOn(supabaseModule, 'createReviewRunOnConflictDoNothing').mockResolvedValue({
        created: false,
        reviewRun: {
          id: 'existing-run-id',
          repo_id: 'repo-1',
          pr_number: 10,
          commit_sha: 'abc1234',
          status: 'completed',
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          pr_title: 'PR #10',
          pr_author: 'dev',
          tool_calls_count: 1,
          agent_trace: [],
          error_message: null,
          is_simulation: false,
          created_at: new Date().toISOString(),
        },
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'pull_request',
          'x-github-delivery': 'delivery-uuid-dup',
          'x-hub-signature-256': 'sha256=valid',
        },
        body: JSON.stringify({
          action: 'opened',
          installation: { id: 12345 },
          pull_request: {
            number: 10,
            title: 'PR #10',
            head: { sha: 'abc1234' },
            user: { login: 'dev' },
          },
          repository: {
            full_name: 'test-org/test-repo',
            owner: { login: 'test-org' },
          },
        }),
      });

      const res = await webhookRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('duplicate');
      expect(json.reviewRunId).toBe('existing-run-id');
    });
  });
});
