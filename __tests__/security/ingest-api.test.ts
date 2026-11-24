import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/ingest/route';
import { setMockGitHubJwks, JwkKey } from '@/lib/security/github-oidc';
import { getIngestedCiData, storeIngestedCiData } from '@/lib/ingest/store';

describe('GitHub Actions CI Ingest API (/api/ingest & devguard-action)', () => {
  let testKeyPair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };
  let testJwk: JwkKey;
  const keyId = 'test-github-key-1';

  beforeEach(() => {
    testKeyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rawJwk = testKeyPair.publicKey.export({ format: 'jwk' });
    testJwk = {
      kty: String(rawJwk.kty || 'RSA'),
      kid: keyId,
      alg: 'RS256',
      n: String(rawJwk.n || ''),
      e: String(rawJwk.e || ''),
    };

    setMockGitHubJwks([testJwk]);
  });

  afterEach(() => {
    setMockGitHubJwks(null);
    vi.restoreAllMocks();
  });

  function createSignedOidcJwt(
    claims: Record<string, unknown>,
    kid = keyId,
    privateKey = testKeyPair.privateKey
  ): string {
    const header = { alg: 'RS256', kid, typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'https://token.actions.githubusercontent.com',
      aud: 'devguard-ai',
      exp: now + 3600,
      nbf: now - 10,
      ...claims,
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const data = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = crypto.sign('RSA-SHA256', data, privateKey).toString('base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  it('rejects request missing Authorization header with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/ingest', {
      method: 'POST',
      body: JSON.stringify({ repository: 'org/repo', sha: 'abc1234' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Authorization');
  });

  it('rejects invalid cryptographic signature with 401', async () => {
    // Generate a different key that does not match JWKS
    const rogueKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rogueJwt = createSignedOidcJwt(
      { repository: 'org/repo', sha: 'abc1234' },
      keyId,
      rogueKey.privateKey
    );

    const req = new NextRequest('http://localhost:3000/api/ingest', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${rogueJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ repository: 'org/repo', sha: 'abc1234' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('OIDC verification failed');
  });

  it('rejects token when repository claim does not match body with 401', async () => {
    const jwt = createSignedOidcJwt({ repository: 'attacker/malicious', sha: 'abc1234' });

    const req = new NextRequest('http://localhost:3000/api/ingest', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ repository: 'victim/repo', sha: 'abc1234' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.details).toContain('Repository mismatch');
  });

  it('accepts valid OIDC token, normalizes Semgrep & test results, and returns 200', async () => {
    const repository = 'devguard-org/secure-service';
    const sha = 'e1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0';
    const jwt = createSignedOidcJwt({ repository, sha });

    const req = new NextRequest('http://localhost:3000/api/ingest', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repository,
        sha,
        ref: 'refs/pull/42/merge',
        runId: '987654321',
        semgrep: {
          results: [
            {
              check_id: 'rules.security.owasp.sql-injection',
              path: 'src/db.ts',
              start: { line: 15, col: 3 },
              extra: {
                message: 'SQL Injection detected in raw query call',
                severity: 'ERROR',
                fix: 'Use parameterized queries',
              },
            },
          ],
        },
        tests: {
          command: 'npm test',
          exitCode: 0,
          passed: true,
          durationMs: 3450,
          outputSnippet: '25 passed, 0 failed',
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.ingestedFindingsCount).toBe(1);
    expect(body.testsExecuted).toBe(true);
    expect(body.testsPassed).toBe(true);

    // Verify data was stored in ingest store
    const stored = await getIngestedCiData(repository, sha);
    expect(stored).toBeDefined();
    expect(stored?.repository).toBe(repository);
    expect(stored?.findings.length).toBe(1);
    expect(stored?.findings[0].source).toBe('semgrep');
    expect(stored?.tests?.passed).toBe(true);
    expect(stored?.tests?.command).toBe('npm test');
  });

  it('proves honest test status reporting: executed vs not executed', async () => {
    const repoWithAction = 'sample-org/with-action';
    const shaWithAction = 'sha-with-action-1111';

    await storeIngestedCiData({
      repository: repoWithAction,
      sha: shaWithAction,
      ref: 'refs/heads/main',
      runId: '1',
      ingestedAt: new Date().toISOString(),
      tests: {
        command: 'npm test',
        exitCode: 0,
        passed: true,
        durationMs: 1200,
      },
      findings: [],
      semgrepCount: 0,
      osvCount: 0,
    });

    // 1. Repo with action has real test data
    const withActionData = await getIngestedCiData(repoWithAction, shaWithAction);
    expect(withActionData?.tests).toBeDefined();
    expect(withActionData?.tests?.passed).toBe(true);

    // 2. Repo without action has null test data (honestly reports "tests: not executed")
    const withoutActionData = await getIngestedCiData('sample-org/without-action', 'sha-without-action-2222');
    expect(withoutActionData).toBeNull();
  });
});
