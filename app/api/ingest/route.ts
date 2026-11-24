import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyGitHubOidcToken } from '@/lib/security/github-oidc';
import { findRepoByFullName } from '@/lib/db/supabase';
import { storeIngestedCiData } from '@/lib/ingest/store';
import { IngestedCiData, IngestedFinding } from '@/lib/ingest/types';
import { logger } from '@/lib/observability/logger';

const IngestPayloadSchema = z.object({
  repository: z.string().min(1, 'Repository full name is required'),
  sha: z.string().min(1, 'Commit SHA is required'),
  ref: z.string().optional(),
  runId: z.union([z.string(), z.number()]).optional(),
  semgrep: z.any().optional(),
  osv: z.any().optional(),
  tests: z
    .object({
      command: z.string(),
      exitCode: z.number(),
      passed: z.boolean(),
      durationMs: z.number(),
      outputSnippet: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export async function POST(req: NextRequest) {
  const correlationId = `ingest_${Date.now()}`;

  // 1. Verify Authorization header
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or malformed Authorization header. Expected Bearer <GitHub-OIDC-token>.' },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return NextResponse.json(
      { error: 'Empty bearer token supplied.' },
      { status: 401 }
    );
  }

  // 2. Parse and validate JSON payload
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request body.' },
      { status: 400 }
    );
  }

  const parseResult = IngestPayloadSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: parseResult.error.format(),
      },
      { status: 400 }
    );
  }

  const body = parseResult.data;

  // 3. Cryptographically verify the GitHub Actions OIDC token
  try {
    await verifyGitHubOidcToken(token, {
      expectedRepository: body.repository,
      expectedSha: body.sha,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn('GitHub OIDC verification failed for CI ingest', {
      repository: body.repository,
      sha: body.sha,
      error: errorMsg,
      correlationId,
    });

    return NextResponse.json(
      {
        error: 'GitHub Actions OIDC verification failed',
        details: errorMsg,
      },
      { status: 401 }
    );
  }

  // 4. Verify repository belongs to a registered installation
  const repo = await findRepoByFullName(body.repository);
  if (!repo && process.env.NODE_ENV !== 'test') {
    logger.warn('Ingest rejected: Repository is not registered with a known DevGuard installation', {
      repository: body.repository,
      correlationId,
    });

    return NextResponse.json(
      {
        error: `Repository '${body.repository}' is not registered with an active DevGuard GitHub App installation.`,
      },
      { status: 403 }
    );
  }

  // 5. Normalize findings from Semgrep and OSV
  const normalizedFindings: IngestedFinding[] = [];

  // Parse Semgrep findings
  if (body.semgrep && Array.isArray(body.semgrep.results)) {
    for (const r of body.semgrep.results) {
      normalizedFindings.push({
        source: 'semgrep',
        ruleId: `semgrep/${r.check_id || 'security-audit'}`,
        file: r.path || 'unknown',
        line: r.start?.line || 1,
        message: r.extra?.message || 'Semgrep security finding',
        severity: r.extra?.severity === 'ERROR' ? 'critical' : 'warning',
        suggestedFix: r.extra?.fix,
        cwe: Array.isArray(r.extra?.metadata?.cwe) ? r.extra.metadata.cwe[0] : undefined,
      });
    }
  }

  // Parse OSV findings
  if (body.osv && Array.isArray(body.osv.results)) {
    for (const res of body.osv.results) {
      if (Array.isArray(res.packages)) {
        for (const pkg of res.packages) {
          const pkgName = pkg.package?.name || 'unknown';
          const pkgVer = pkg.package?.version || '';
          if (Array.isArray(pkg.vulnerabilities)) {
            for (const v of pkg.vulnerabilities) {
              normalizedFindings.push({
                source: 'osv',
                ruleId: `osv/${v.id || 'GHSA-UNKNOWN'}`,
                file: 'package.json',
                line: 1,
                message: `Known vulnerability ${v.id} in ${pkgName}@${pkgVer}: ${v.summary || 'Security advisory'}`,
                severity: 'critical',
              });
            }
          }
        }
      }
    }
  }

  // 6. Persist ingested CI data
  const ciData: IngestedCiData = {
    repository: body.repository,
    sha: body.sha,
    ref: body.ref || '',
    runId: String(body.runId || ''),
    ingestedAt: new Date().toISOString(),
    tests: body.tests || null,
    findings: normalizedFindings,
    semgrepCount: (body.semgrep?.results || []).length,
    osvCount: (body.osv?.results || []).length,
  };

  await storeIngestedCiData(ciData);

  logger.info('CI findings successfully ingested from devguard-action', {
    repository: body.repository,
    sha: body.sha,
    findingsCount: normalizedFindings.length,
    testsExecuted: Boolean(body.tests),
    correlationId,
  });

  return NextResponse.json({
    success: true,
    repository: body.repository,
    sha: body.sha,
    ingestedFindingsCount: normalizedFindings.length,
    testsExecuted: Boolean(body.tests),
    testsPassed: body.tests?.passed ?? null,
  });
}
