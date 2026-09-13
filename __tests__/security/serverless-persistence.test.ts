import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as simulateReviewRoute } from '@/app/api/simulate-review/route';
import { saveSimulationRun, getReviewRunById, inMemorySimulations } from '@/lib/db/supabase';
import * as redisModule from '@/lib/cache/redis';
import { DisplayReviewRun, Finding } from '@/lib/db/types';

describe('Sprint 3 & 4 — DoW Hardening & Cross-Instance Serverless State Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    inMemorySimulations.clear();
  });

  it('rejects payload exceeding 100KB with 400 Bad Request to prevent DoW memory abuse', async () => {
    const hugeDiff = 'a'.repeat(105000); // Exceeds 100KB Zod limit
    const req = new NextRequest('http://localhost:3000/api/simulate-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prTitle: 'Huge PR',
        diff: hugeDiff,
      }),
    });

    const res = await simulateReviewRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request payload');
  });

  it('rejects malformed non-JSON payloads with 400 Bad Request', async () => {
    const req = new NextRequest('http://localhost:3000/api/simulate-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid-json-{broken',
    });

    const res = await simulateReviewRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Malformed JSON payload');
  });

  it('verifies cross-instance state consistency: Instance B reads simulation created on Instance A via persistent cache', async () => {
    const runId = 'sim-run-cross-instance-999';
    const mockRun: DisplayReviewRun = {
      id: runId,
      repo_id: 'in-memory-simulation',
      pr_number: 42,
      pr_title: 'Cross-instance PR test',
      pr_author: 'staff-eng',
      commit_sha: 'c7d8e9f',
      status: 'completed',
      tool_calls_count: 2,
      agent_trace: [],
      error_message: null,
      is_simulation: true,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const mockFindings: Finding[] = [
      {
        id: 'f-sim-1',
        review_run_id: runId,
        severity: 'warning',
        file_path: 'lib/utils.ts',
        line: 12,
        message: 'Unvalidated input parameter',
        suggested_fix: null,
        tool_source: 'runLinter',
      },
    ];

    // Simulate persistent Redis store
    const persistentStore = new Map<string, unknown>();
    vi.spyOn(redisModule, 'setCachedValue').mockImplementation(async (key, value) => {
      persistentStore.set(key, value);
    });
    vi.spyOn(redisModule, 'getCachedValue').mockImplementation(async (key) => {
      return (persistentStore.get(key) as unknown) || null;
    });

    // 1. Instance A writes simulation run
    await saveSimulationRun(mockRun, mockFindings);

    // 2. Simulate Instance B: clear inMemorySimulations to mimic new cold-started serverless instance
    inMemorySimulations.clear();
    expect(inMemorySimulations.has(runId)).toBe(false);

    // 3. Instance B loads simulation run -> must resolve seamlessly from persistent store
    const retrieved = await getReviewRunById(runId);
    expect(retrieved.run).not.toBeNull();
    expect(retrieved.run?.id).toBe(runId);
    expect(retrieved.findings.length).toBe(1);
    expect(retrieved.findings[0].message).toBe('Unvalidated input parameter');
  });
});
