import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as githubWebhookPOST } from '@/app/api/webhooks/github/route';
import { POST as reviewWorkerPOST } from '@/app/api/jobs/review-worker/route';
import * as githubClient from '@/lib/github/client';
import * as supabaseDb from '@/lib/db/supabase';
import * as qstash from '@/lib/queue/qstash';
import * as reviewPipeline from '@/lib/jobs/review-pipeline';

vi.mock('@/lib/github/client');
vi.mock('@/lib/db/supabase');
vi.mock('@/lib/queue/qstash');
vi.mock('@/lib/jobs/review-pipeline');
vi.mock('@/lib/observability/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Integration — Webhook Pipeline, Concurrency & Queue Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPayload = {
    action: 'opened',
    pull_request: {
      number: 42,
      title: 'Fix auth vulnerability',
      user: { login: 'octocat' },
      head: { sha: '6dcb09b5b57875f334f61aebed695e2e4193db5e' },
    },
    repository: {
      name: 'hello-world',
      full_name: 'octocat/hello-world',
      owner: { login: 'octocat' },
    },
    installation: { id: 1337 },
  };

  const payloadString = JSON.stringify(validPayload);

  describe('GitHub Webhook Handler (End-to-End)', () => {
    it('verifies HMAC signature, deduplicates delivery, ensures repo, enqueues job, and returns 202', async () => {
      vi.mocked(githubClient.verifyGitHubWebhook).mockResolvedValue(true);
      vi.mocked(supabaseDb.recordWebhookDelivery).mockResolvedValue(true);
      vi.mocked(supabaseDb.ensureRepoForInstallation).mockResolvedValue({
        id: 'repo-uuid-42',
        full_name: 'octocat/hello-world',
        installation_id: '1337',
        is_active: true,
        created_at: new Date().toISOString(),
      });
      vi.mocked(supabaseDb.createReviewRunOnConflictDoNothing).mockResolvedValue({
        created: true,
        reviewRun: {
          id: 'run-uuid-101',
          repo_id: 'repo-uuid-42',
          pr_number: 42,
          commit_sha: '6dcb09b5b57875f334f61aebed695e2e4193db5e',
          status: 'queued',
          tool_calls_count: 0,
          created_at: new Date().toISOString(),
        } as any,
      });
      vi.mocked(qstash.enqueueReviewJob).mockResolvedValue({
        enqueued: true,
        messageId: 'msg-qstash-101',
        provider: 'qstash',
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=validsig',
          'x-github-delivery': 'delivery-uuid-001',
          'x-github-event': 'pull_request',
        },
        body: payloadString,
      });

      const res = await githubWebhookPOST(req);
      expect(res.status).toBe(202);

      const json = await res.json();
      expect(json.status).toBe('accepted');
      expect(json.reviewRunId).toBe('run-uuid-101');
      expect(json.message).toContain('review job enqueued');

      expect(githubClient.verifyGitHubWebhook).toHaveBeenCalledWith(payloadString, 'sha256=validsig');
      expect(supabaseDb.recordWebhookDelivery).toHaveBeenCalledWith('delivery-uuid-001', 'pull_request');
      expect(supabaseDb.ensureRepoForInstallation).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'octocat/hello-world',
          githubInstallationId: '1337',
        })
      );
      expect(qstash.enqueueReviewJob).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewRunId: 'run-uuid-101',
          repoFullName: 'octocat/hello-world',
          prNumber: 42,
        })
      );
    });

    it('rejects concurrent duplicate deliveries with 200 duplicate skipped', async () => {
      vi.mocked(githubClient.verifyGitHubWebhook).mockResolvedValue(true);
      // Delivery already recorded -> returns false
      vi.mocked(supabaseDb.recordWebhookDelivery).mockResolvedValue(false);

      const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=validsig',
          'x-github-delivery': 'delivery-uuid-001',
          'x-github-event': 'pull_request',
        },
        body: payloadString,
      });

      const res = await githubWebhookPOST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.message).toContain('Duplicate webhook delivery ignored');
      expect(supabaseDb.createReviewRunOnConflictDoNothing).not.toHaveBeenCalled();
      expect(qstash.enqueueReviewJob).not.toHaveBeenCalled();
    });

    it('handles concurrent duplicate PR webhook where review run already exists in DB', async () => {
      vi.mocked(githubClient.verifyGitHubWebhook).mockResolvedValue(true);
      vi.mocked(supabaseDb.recordWebhookDelivery).mockResolvedValue(true);
      vi.mocked(supabaseDb.ensureRepoForInstallation).mockResolvedValue({
        id: 'repo-uuid-42',
        full_name: 'octocat/hello-world',
        installation_id: '1337',
        is_active: true,
        created_at: new Date().toISOString(),
      });
      // Run already created by another worker/thread -> created: false
      vi.mocked(supabaseDb.createReviewRunOnConflictDoNothing).mockResolvedValue({
        created: false,
        reviewRun: {
          id: 'existing-run-uuid',
          status: 'running',
        } as any,
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=validsig',
          'x-github-delivery': 'delivery-uuid-diff',
          'x-github-event': 'pull_request',
        },
        body: payloadString,
      });

      const res = await githubWebhookPOST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('duplicate');
      expect(json.message).toContain('Duplicate event ignored');
      expect(qstash.enqueueReviewJob).not.toHaveBeenCalled();
    });
  });

  describe('Queue Review Worker Endpoint (/api/jobs/review-worker)', () => {
    const workerPayload = {
      reviewRunId: 'run-worker-999',
      installationId: 1337,
      repoFullName: 'octocat/hello-world',
      prNumber: 42,
      commitSha: '6dcb09b5b57875f334f61aebed695e2e4193db5e',
      prTitle: 'Fix auth',
      prAuthor: 'octocat',
      correlationId: 'corr-worker-1',
      attempt: 1,
    };

    it('rejects worker requests with invalid queue signature (401)', async () => {
      vi.mocked(qstash.verifyQStashSignature).mockResolvedValue(false);

      const req = new NextRequest('http://localhost:3000/api/jobs/review-worker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'upstash-signature': 'invalid-sig',
        },
        body: JSON.stringify(workerPayload),
      });

      const res = await reviewWorkerPOST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Invalid queue signature');
      expect(reviewPipeline.executeReviewJob).not.toHaveBeenCalled();
    });

    it('successfully executes review job on valid signature and returns 200', async () => {
      vi.mocked(qstash.verifyQStashSignature).mockResolvedValue(true);
      vi.mocked(reviewPipeline.executeReviewJob).mockResolvedValue({
        success: true,
        reviewRunId: 'run-worker-999',
        findingsCount: 3,
        durationMs: 420,
      });

      const req = new NextRequest('http://localhost:3000/api/jobs/review-worker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'upstash-signature': 'valid-qstash-signature',
        },
        body: JSON.stringify(workerPayload),
      });

      const res = await reviewWorkerPOST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('success');
      expect(json.reviewRunId).toBe('run-worker-999');
      expect(json.findingsCount).toBe(3);
      expect(reviewPipeline.executeReviewJob).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewRunId: 'run-worker-999',
          repoFullName: 'octocat/hello-world',
        })
      );
    });

    it('returns 500 on worker exception to trigger QStash queue retry backoff', async () => {
      vi.mocked(qstash.verifyQStashSignature).mockResolvedValue(true);
      vi.mocked(reviewPipeline.executeReviewJob).mockRejectedValue(new Error('Transient network error'));

      const req = new NextRequest('http://localhost:3000/api/jobs/review-worker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'upstash-signature': 'valid-qstash-signature',
        },
        body: JSON.stringify(workerPayload),
      });

      const res = await reviewWorkerPOST(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Transient network error');
    });
  });
});
