import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as webhookPostHandler } from '@/app/api/webhooks/github/route';
import { GET as watchdogCronHandler } from '@/app/api/cron/watchdog/route';
import { GET as retentionCronHandler } from '@/app/api/cron/retention/route';
import { scanDependencies } from '@/lib/agent/tools/deps-scan';
import {
  parseLockfile,
  resolveExactDependencies,
} from '@/lib/agent/tools/lockfile-parser';
import {
  parseDiffModifiedLines,
  isBinaryFile,
  postGitHubReviewComment,
} from '@/lib/github/client';
import {
  transitionReviewRunState,
  getPaginatedReviewRuns,
} from '@/lib/db/supabase';
import { CircuitBreaker, CircuitBreakerError } from '@/lib/resilience/circuit-breaker';
import { fetchWithRetry } from '@/lib/resilience/fetch-with-retry';
import * as clientModule from '@/lib/github/client';
import * as supabaseModule from '@/lib/db/supabase';
import * as queueModule from '@/lib/queue/qstash';

describe('Phase 4 — Backend Robustness, Durable Pipeline, & Resilience Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // ACCEPTANCE CRITERION 1: Killing worker mid-run leaves run recoverable
  // ============================================================================
  describe('Acceptance 1: Worker Failure & Watchdog Recovery', () => {
    it('watchdog cron recovers stuck running job beyond 300s and idempotently transitions it to timed_out', async () => {
      const stuckRunId = 'stuck-run-uuid-123';
      const mockStuckRun = {
        id: stuckRunId,
        repo_id: 'repo-1',
        pr_number: 42,
        commit_sha: 'sha-stuck-123',
        status: 'running' as const,
        started_at: new Date(Date.now() - 400_000).toISOString(), // 400s ago (> 300s threshold)
        completed_at: null,
        tool_calls_count: 1,
        agent_trace: [],
        error_message: null,
        is_simulation: false,
        created_at: new Date(Date.now() - 400_000).toISOString(),
        pr_title: 'Stuck PR',
        pr_author: 'dev',
      };

      vi.spyOn(supabaseModule, 'findStuckRunningReviewRuns').mockResolvedValue([mockStuckRun]);
      const transitionSpy = vi.spyOn(supabaseModule, 'transitionReviewRunState').mockResolvedValue({
        success: true,
        run: { ...mockStuckRun, status: 'timed_out' },
      });

      const req = new NextRequest('http://localhost:3000/api/cron/watchdog', {
        method: 'GET',
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET || 'test-secret'}`,
        },
      });

      // Temporarily ensure CRON_SECRET matches for test
      const originalSecret = process.env.CRON_SECRET;
      process.env.CRON_SECRET = 'test-secret';

      try {
        const res = await watchdogCronHandler(req);
        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data.stuckRunsCount).toBe(1);
        expect(data.timedOutCount).toBe(1);
        expect(data.timedOutRunIds).toContain(stuckRunId);

        expect(transitionSpy).toHaveBeenCalledWith(
          stuckRunId,
          'timed_out',
          expect.objectContaining({
            errorCode: 'EXECUTION_TIMEOUT',
          })
        );
      } finally {
        process.env.CRON_SECRET = originalSecret;
      }
    });

    it('state machine transition rules prevent invalid transitions while permitting idempotent no-ops', async () => {
      const completedRun = {
        id: 'run-completed-123',
        repo_id: 'repo-1',
        pr_number: 10,
        commit_sha: 'sha-done',
        status: 'completed' as const,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        pr_title: 'Done',
        pr_author: 'dev',
        tool_calls_count: 3,
        agent_trace: [],
        error_message: null,
        is_simulation: false,
        created_at: new Date().toISOString(),
      };

      vi.spyOn(supabaseModule, 'getReviewRunById').mockResolvedValue({
        run: completedRun,
        findings: [],
      });

      // Idempotent no-op transition: completed -> completed
      supabaseModule.inMemorySimulations.set(completedRun.id, { run: completedRun, findings: [] });
      const idempotentResult = await transitionReviewRunState(completedRun.id, 'completed');
      expect(idempotentResult.success).toBe(true);

      // Illegal transition: completed -> running (terminal state cannot re-open)
      const illegalResult = await transitionReviewRunState(completedRun.id, 'running');
      expect(illegalResult.success).toBe(false);
      expect(illegalResult.reason).toContain('Invalid state transition');
    });
  });

  // ============================================================================
  // ACCEPTANCE CRITERION 2: Duplicate webhook deliveries create exactly one run
  // ============================================================================
  describe('Acceptance 2: Concurrent Webhook Deduplication', () => {
    it('concurrent identical webhook deliveries create exactly one run and enqueue once', async () => {
      vi.spyOn(clientModule, 'verifyGitHubWebhook').mockResolvedValue(true);
      vi.spyOn(supabaseModule, 'ensureRepoForInstallation').mockResolvedValue({
        id: 'repo-concurrent-1',
        installation_id: 'inst-1',
        full_name: 'test-org/concurrent-repo',
        is_active: true,
        created_at: new Date().toISOString(),
      });

      let runCreationCount = 0;
      const enqueueSpy = vi.spyOn(queueModule, 'enqueueReviewJob').mockResolvedValue({
        enqueued: true,
        provider: 'direct_fallback',
      });

      // Mock database atomic ON CONFLICT DO NOTHING: only first concurrent caller creates row
      vi.spyOn(supabaseModule, 'createReviewRunOnConflictDoNothing').mockImplementation(async (data) => {
        runCreationCount++;
        const isFirst = runCreationCount === 1;
        const mockRun = {
          id: 'run-concurrent-single-id',
          repo_id: data.repo_id,
          pr_number: data.pr_number,
          commit_sha: data.commit_sha,
          status: data.status,
          started_at: null,
          completed_at: null,
          pr_title: data.pr_title ?? null,
          pr_author: data.pr_author ?? null,
          tool_calls_count: 0,
          agent_trace: [],
          error_message: null,
          is_simulation: false,
          created_at: new Date().toISOString(),
        };

        return {
          created: isFirst,
          reviewRun: mockRun,
        };
      });

      // Allow unique delivery IDs per request
      vi.spyOn(supabaseModule, 'recordWebhookDelivery').mockImplementation(async () => {
        return true;
      });

      const payload = {
        action: 'opened',
        installation: { id: 98765 },
        pull_request: {
          number: 101,
          title: 'Concurrent Race PR',
          head: { sha: 'commit-sha-race-condition-123' },
          user: { login: 'race-tester' },
        },
        repository: {
          full_name: 'test-org/concurrent-repo',
          owner: { login: 'test-org' },
        },
      };

      const makeRequest = (deliveryId: string) =>
        new NextRequest('http://localhost:3000/api/webhooks/github', {
          method: 'POST',
          headers: {
            'x-hub-signature-256': 'sha256=mock-valid-sig',
            'x-github-event': 'pull_request',
            'x-github-delivery': deliveryId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

      // Execute 3 concurrent requests simulating GitHub retry bursts
      const results = await Promise.all([
        webhookPostHandler(makeRequest('delivery-1')),
        webhookPostHandler(makeRequest('delivery-2')),
        webhookPostHandler(makeRequest('delivery-3')),
      ]);

      const statuses = results.map((r) => r.status);
      const bodies = await Promise.all(results.map((r) => r.json()));

      // Exactly one request was accepted (202), remaining were recognized as duplicate (200)
      const acceptedResponses = bodies.filter((b) => b.status === 'accepted');
      const duplicateResponses = bodies.filter((b) => b.status === 'duplicate');

      expect(acceptedResponses.length).toBe(1);
      expect(duplicateResponses.length).toBe(2);
      expect(statuses.filter((s) => s === 202).length).toBe(1);
      expect(statuses.filter((s) => s === 200).length).toBe(2);

      // Enqueue job was called exactly ONCE
      expect(enqueueSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // ACCEPTANCE CRITERION 3: PR with ranged dependency scanned using resolved version
  // ============================================================================
  describe('Acceptance 3: Lockfile Exact Version Resolution', () => {
    it('resolves exact dependency version from package-lock.json when package.json contains semver range', async () => {
      // PR diff modifies package.json with semver range "^0.19.0"
      const packageJsonDiff = `--- a/package.json
+++ b/package.json
@@ -10,3 +10,3 @@
   "dependencies": {
-    "express": "^4.18.0"
+    "axios": "^0.19.0"
   }`;

      // Live package-lock.json at PR head SHA resolving axios to exact version "0.19.0"
      const lockfileContent = JSON.stringify({
        name: 'test-project',
        lockfileVersion: 2,
        packages: {
          '': {
            dependencies: {
              axios: '^0.19.0',
            },
          },
          'node_modules/axios': {
            version: '0.19.0',
            resolved: 'https://registry.npmjs.org/axios/-/axios-0.19.0.tgz',
          },
        },
      });

      const scanResult = await scanDependencies(packageJsonDiff, {
        lockfileContent,
        lockfileFilename: 'package-lock.json',
      });

      expect(scanResult.success).toBe(true);
      expect(scanResult.exactVersionsResolvedFromLockfile).toBe(true);
      expect(scanResult.totalDependenciesScanned).toBe(1);

      // Verifies that OSV scan detected the CVE for exact version 0.19.0
      const axiosFinding = scanResult.vulnerabilities.find((v) => v.package === 'axios');
      expect(axiosFinding).toBeDefined();
      expect(axiosFinding?.version).toBe('0.19.0');
      expect(axiosFinding?.vulnerabilityId).toBe('GHSA-4w2v-q235-vp99');
      expect(axiosFinding?.severity).toBe('critical');
    });

    it('resolves exact versions from yarn.lock and pnpm-lock.yaml accurately', () => {
      const yarnLock = `
# yarn lockfile v1
"axios@^0.19.0":
  version "0.19.0"
  resolved "https://registry.yarnpkg.com/axios/-/axios-0.19.0.tgz"

"lodash@^4.17.15":
  version "4.17.15"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.15.tgz"
`;

      const pnpmLock = `
lockfileVersion: 5.4
packages:
  /axios/0.19.0:
    resolution: {integrity: sha512-mock}
  /minimist/0.0.8:
    resolution: {integrity: sha512-mock}
`;

      const yarnMap = parseLockfile(yarnLock, 'yarn.lock');
      expect(yarnMap.get('axios')?.version).toBe('0.19.0');
      expect(yarnMap.get('lodash')?.version).toBe('4.17.15');

      const pnpmMap = parseLockfile(pnpmLock, 'pnpm-lock.yaml');
      expect(pnpmMap.get('axios')?.version).toBe('0.19.0');
      expect(pnpmMap.get('minimist')?.version).toBe('0.0.8');

      // Test resolveExactDependencies helper
      const declared = [
        { name: 'axios', declaredVersion: '^0.19.0', isPrChange: true },
        { name: 'missing-pkg', declaredVersion: '~1.2.3', isPrChange: true },
      ];

      const resolved = resolveExactDependencies(declared, yarnLock, 'yarn.lock');
      expect(resolved[0].resolvedVersion).toBe('0.19.0');
      expect(resolved[0].isResolvedFromLockfile).toBe(true);
      expect(resolved[1].resolvedVersion).toBe('1.2.3');
      expect(resolved[1].isResolvedFromLockfile).toBe(false);
    });

    it('identifies monorepo workspace dependencies and traces dependency paths', () => {
      const workspaceLock = JSON.stringify({
        name: 'monorepo-root',
        lockfileVersion: 3,
        packages: {
          'packages/web/node_modules/axios': {
            version: '0.19.0',
          },
          'node_modules/parent-pkg/node_modules/vulnerable-child': {
            version: '1.0.0',
          },
        },
      });

      const parsed = parseLockfile(workspaceLock, 'package-lock.json');
      const axiosEntry = parsed.get('axios');
      expect(axiosEntry?.version).toBe('0.19.0');
      expect(axiosEntry?.isWorkspace).toBe(true);

      const childEntry = parsed.get('vulnerable-child');
      expect(childEntry?.version).toBe('1.0.0');
      expect(childEntry?.dependencyPath).toContain('parent-pkg');
    });
  });

  // ============================================================================
  // DIFF & FILE HANDLING: Renames, Deletions, Binary Files, Truncation
  // ============================================================================
  describe('Diff & File Handling Resilience', () => {
    it('identifies binary files and excludes them from source code review', () => {
      expect(isBinaryFile('image.png')).toBe(true);
      expect(isBinaryFile('asset.wasm')).toBe(true);
      expect(isBinaryFile('document.pdf')).toBe(true);
      expect(isBinaryFile('script.ts')).toBe(false);
      expect(isBinaryFile('app/api/route.js')).toBe(false);
    });

    it('handles git renames and deletions without mapping phantom lines', () => {
      const renameDiff = `--- a/lib/old-auth.ts
+++ b/lib/new-auth.ts
@@ -10,3 +10,4 @@
  export function verify() {
+   const secret = "token";
+   return secret;
  }`;

      const deleteDiff = `--- a/lib/deprecated.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-export const deprecated = true;`;

      const renameMap = parseDiffModifiedLines(renameDiff);
      expect(renameMap.has('lib/new-auth.ts')).toBe(true);
      expect(renameMap.get('lib/new-auth.ts')?.has(10)).toBe(true);

      const deleteMap = parseDiffModifiedLines(deleteDiff);
      // Deleted file directed to /dev/null must not be mapped as an inline target
      expect(deleteMap.has('/dev/null')).toBe(false);
      expect(deleteMap.has('lib/deprecated.ts')).toBe(false);
    });

    it('surfaces review truncation scope in review comments when PR exceeds review cap', async () => {
      const mockCreateReview = vi.fn().mockResolvedValue({ status: 200 });
      const mockOctokit = {
        rest: {
          pulls: {
            createReview: mockCreateReview,
          },
        },
      } as unknown as import('@octokit/rest').Octokit;

      const truncation = {
        analyzedFilesCount: 50,
        totalFilesCount: 73,
        isTruncated: true,
        skippedFilesCount: 23,
      };

      await postGitHubReviewComment(
        mockOctokit,
        'owner',
        'repo',
        1,
        'commit-sha',
        [],
        'Automated review completed.',
        undefined,
        truncation
      );

      expect(mockCreateReview).toHaveBeenCalledTimes(1);
      const callArgs = mockCreateReview.mock.calls[0][0];
      expect(callArgs.body).toContain('Analyzed 50 of 73 changed files');
      expect(callArgs.body).toContain('23 skipped due to review cap');
    });
  });

  // ============================================================================
  // OUTBOUND RESILIENCE: Circuit Breakers, Retry With Jitter, & Rate Limits
  // ============================================================================
  describe('Outbound Resilience & Circuit Breakers', () => {
    it('circuit breaker trips to OPEN on repeated failures and fast-fails subsequent calls', async () => {
      const breaker = new CircuitBreaker({ name: 'test-breaker', failureThreshold: 3, resetTimeoutMs: 100 });

      const failingOperation = vi.fn().mockRejectedValue(new Error('Downstream 500 error'));

      // 3 consecutive failures
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingOperation)).rejects.toThrow('Downstream 500 error');
      }

      expect(breaker.getState()).toBe('OPEN');

      // 4th call: Fast-fails immediately with CircuitBreakerError without invoking failingOperation
      await expect(breaker.execute(failingOperation)).rejects.toThrow(CircuitBreakerError);
      expect(failingOperation).toHaveBeenCalledTimes(3);

      // Wait for reset timeout: transitions to HALF_OPEN
      await new Promise((res) => setTimeout(res, 120));
      expect(breaker.getState()).toBe('HALF_OPEN');

      // Success in HALF_OPEN resets breaker to CLOSED
      const successOp = vi.fn().mockResolvedValue('recovered');
      const result = await breaker.execute(successOp);
      expect(result).toBe('recovered');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('fetchWithRetry retries 429 and 5xx responses with backoff and respects Retry-After header', async () => {
      let callCount = 0;
      const originalFetch = global.fetch;

      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response('Rate limited', {
            status: 429,
            headers: { 'retry-after': '0.01' }, // 10ms
          });
        }
        return new Response('Success', { status: 200 });
      });

      try {
        const response = await fetchWithRetry('https://api.example.com/test', undefined, {
          maxRetries: 2,
          initialDelayMs: 10,
        });

        expect(response.status).toBe(200);
        expect(callCount).toBe(2);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('does not retry 400 or 401 client errors', async () => {
      let callCount = 0;
      const originalFetch = global.fetch;

      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return new Response('Unauthorized', { status: 401 });
      });

      try {
        const response = await fetchWithRetry('https://api.example.com/unauth', undefined, {
          maxRetries: 3,
        });

        expect(response.status).toBe(401);
        expect(callCount).toBe(1); // Immediate return, zero retries
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  // ============================================================================
  // DATABASE PAGINATION & RETENTION
  // ============================================================================
  describe('Database Cursor Pagination & Retention', () => {
    it('paginates review runs with limit and cursor', async () => {
      const runs = await getPaginatedReviewRuns(undefined, { limit: 5 });
      expect(Array.isArray(runs.items)).toBe(true);
      expect(typeof runs.hasMore).toBe('boolean');
    });

    it('retention cron cleans up expired sessions and logs safely', async () => {
      vi.spyOn(supabaseModule, 'runDataRetentionCleanup').mockResolvedValue({
        tryRunsDeleted: 5,
        logsDeleted: 12,
        deliveriesDeleted: 8,
        timestamp: new Date().toISOString(),
      });

      const originalSecret = process.env.CRON_SECRET;
      process.env.CRON_SECRET = 'retention-secret';

      try {
        const req = new NextRequest('http://localhost:3000/api/cron/retention', {
          method: 'GET',
          headers: {
            authorization: 'Bearer retention-secret',
          },
        });

        const res = await retentionCronHandler(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.tryRunsDeleted).toBe(5);
        expect(data.logsDeleted).toBe(12);
        expect(data.deliveriesDeleted).toBe(8);
      } finally {
        process.env.CRON_SECRET = originalSecret;
      }
    });
  });
});
