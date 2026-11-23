import crypto from 'crypto';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { NewFinding } from '../db/types';
import { logger } from '../observability/logger';
import { githubCircuitBreaker } from '../resilience/circuit-breaker';

const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || '';

// Token cache to avoid re-authenticating with GitHub on every tool execution
interface CachedInstallationToken {
  token: string;
  expiresAt: number;
}
const installationTokenCache = new Map<number, CachedInstallationToken>();

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'svg', 'wasm', 'pdf',
  'zip', 'tar', 'gz', 'tgz', 'woff', 'woff2', 'ttf', 'eot', 'mp4',
  'mp3', 'exe', 'bin', 'dmg', 'so', 'dylib', 'class', 'jar',
]);

export function isBinaryFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? BINARY_EXTENSIONS.has(ext) : false;
}

export const MAX_REVIEW_FILES = 50;
export const MAX_FILE_SIZE_BYTES = 250 * 1024; // 250KB

export interface PullRequestDetails {
  diff: string;
  files: string[];
  fullFiles: Map<string, string>;
  lockfileContent?: string;
  lockfileFilename?: string;
  truncation: {
    analyzedFilesCount: number;
    totalFilesCount: number;
    isTruncated: boolean;
    skippedFilesCount: number;
  };
}

/**
 * Validates the HMAC-SHA256 signature transmitted in `x-hub-signature-256` header
 * using constant-time comparison (crypto.timingSafeEqual).
 * 
 * @param body - Raw request payload string (unparsed)
 * @param signature - Signature string sent in header (e.g. `sha256=...`)
 * @returns {Promise<boolean>} True if signature matches secret and payload, false otherwise
 */
export async function verifyGitHubWebhook(body: string, signature: string): Promise<boolean> {
  if (!webhookSecret || !signature) {
    logger.error('GITHUB_WEBHOOK_SECRET is not set or signature is missing; rejecting webhook request.', undefined, {
      module: 'github-client',
      action: 'verify-signature',
    });
    return false;
  }
  try {
    const hmac = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
    const expected = `sha256=${hmac}`;

    const expectedBuf = Buffer.from(expected, 'utf8');
    const receivedBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch (err) {
    logger.error('Error verifying GitHub webhook signature', err, {
      module: 'github-client',
      action: 'verify-signature',
    });
    return false;
  }
}

function getGitHubPrivateKey(): string {
  return (process.env.GITHUB_APP_PRIVATE_KEY || process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

/**
 * Instantiates an authenticated Octokit client for the target GitHub App installation.
 * Caches tokens until 2 minutes prior to expiration.
 * 
 * @param installationId - Optional numeric GitHub installation ID
 * @returns {Promise<Octokit>} Authenticated Octokit REST client
 */
export async function getOctokitClient(installationId?: number): Promise<Octokit> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = getGitHubPrivateKey();

  if (installationId && appId && privateKey) {
    const now = Date.now();
    const cached = installationTokenCache.get(installationId);
    if (cached && now < cached.expiresAt - 120_000) {
      return new Octokit({ auth: cached.token });
    }

    const auth = createAppAuth({
      appId,
      privateKey,
      installationId,
    });
    const installationAuthentication = await auth({ type: 'installation' });
    
    // Default expiration is 1 hour (3600s)
    const expiresAt = installationAuthentication.expiresAt
      ? new Date(installationAuthentication.expiresAt).getTime()
      : now + 3_600_000;

    installationTokenCache.set(installationId, {
      token: installationAuthentication.token,
      expiresAt,
    });

    return new Octokit({ auth: installationAuthentication.token });
  }

  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  return new Octokit({ auth: token });
}

/**
 * Fetches pull request files, full file contents at head SHA, and repository lockfiles.
 * Enforces caps (MAX_REVIEW_FILES = 50, MAX_FILE_SIZE_BYTES = 250KB) and filters binary/deleted files.
 */
export async function fetchPullRequestDetails(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  commitSha?: string
): Promise<PullRequestDetails> {
  return await githubCircuitBreaker.execute(async () => {
    try {
      const { data: files } = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });

      const totalFilesCount = files.length;
      // Filter out deleted files and binary files for analysis
      const nonBinaryNonDeletedFiles = files.filter(
        (f) => f.status !== 'removed' && !isBinaryFile(f.filename)
      );

      const analyzedFiles = nonBinaryNonDeletedFiles.slice(0, MAX_REVIEW_FILES);
      const isTruncated = totalFilesCount > analyzedFiles.length;
      const skippedFilesCount = totalFilesCount - analyzedFiles.length;

      const fileNames = analyzedFiles.map((f) => f.filename);
      const diffContent = files
        .map((f) => `--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch || 'No patch available'}`)
        .join('\n\n');

      const fullFiles = new Map<string, string>();
      const refSha = commitSha;

      if (refSha) {
        await Promise.all(
          analyzedFiles.map(async (f) => {
            try {
              const res = await octokit.rest.repos.getContent({
                owner,
                repo,
                path: f.filename,
                ref: refSha,
              });
              if ('content' in res.data && typeof res.data.content === 'string') {
                const decoded = Buffer.from(res.data.content, 'base64').toString('utf8');
                if (Buffer.byteLength(decoded, 'utf8') <= MAX_FILE_SIZE_BYTES) {
                  fullFiles.set(f.filename, decoded);
                }
              }
            } catch {
              // Gracefully continue on individual file lookup error
            }
          })
        );
      }

      // Check for lockfiles to resolve exact dependency versions
      let lockfileContent: string | undefined;
      let lockfileFilename: string | undefined;

      const hasPackageManifest = files.some(
        (f) =>
          f.filename.endsWith('package.json') ||
          f.filename.endsWith('package-lock.json') ||
          f.filename.endsWith('pnpm-lock.yaml') ||
          f.filename.endsWith('yarn.lock')
      );

      if (hasPackageManifest && refSha) {
        const candidateLockfiles = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
        for (const lockfileName of candidateLockfiles) {
          try {
            const res = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: lockfileName,
              ref: refSha,
            });
            if ('content' in res.data && typeof res.data.content === 'string') {
              lockfileContent = Buffer.from(res.data.content, 'base64').toString('utf8');
              lockfileFilename = lockfileName;
              break;
            }
          } catch {
            // Try next candidate
          }
        }
      }

      return {
        diff: diffContent,
        files: fileNames,
        fullFiles,
        lockfileContent,
        lockfileFilename,
        truncation: {
          analyzedFilesCount: analyzedFiles.length,
          totalFilesCount,
          isTruncated,
          skippedFilesCount,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown GitHub API error';
      throw new Error(`Could not fetch PR details for ${owner}/${repo}#${pullNumber}: ${message}`);
    }
  });
}

/**
 * Fetches pull request files and synthesizes a unified git patch diff.
 */
export async function fetchPullRequestDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  commitSha?: string
): Promise<{ diff: string; files: string[]; truncation?: PullRequestDetails['truncation'] }> {
  const details = await fetchPullRequestDetails(octokit, owner, repo, pullNumber, commitSha);
  return {
    diff: details.diff,
    files: details.files,
    truncation: details.truncation,
  };
}

/**
 * Parses git patch hunks (@@ -l,s +l,s @@) to map exact line numbers present in the PR diff per file.
 * Lines inside @@ +start,count @@ hunks are valid targets for GitHub inline comments.
 */
export function parseDiffModifiedLines(diffText: string): Map<string, Set<number>> {
  const fileLinesMap = new Map<string, Set<number>>();
  if (!diffText) return fileLinesMap;

  const fileDiffs = diffText.split(/^--- a\//m);

  for (const fileDiff of fileDiffs) {
    if (!fileDiff.trim()) continue;

    // Extract filename from +++ b/filename
    const headerMatch = fileDiff.match(/^\+\+\+ b\/(.+)$/m);
    if (!headerMatch) continue;
    const fileName = headerMatch[1].trim();

    const validLines = new Set<number>();
    // Match hunk headers: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkRegex = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
    let match: RegExpExecArray | null;

    while ((match = hunkRegex.exec(fileDiff)) !== null) {
      const startLine = parseInt(match[2], 10);
      const lineCount = match[3] !== undefined ? parseInt(match[3], 10) : 1;

      for (let i = 0; i < lineCount; i++) {
        validLines.add(startLine + i);
      }
    }

    fileLinesMap.set(fileName, validLines);
  }

  return fileLinesMap;
}

/**
 * Formats and posts an empirical review comment with one-click fix patches to GitHub.
 * Protects against Octokit HTTP 422 errors by validating that inline comments only target
 * lines confirmed to exist within the PR diff's modified hunks.
 * Findings on lines outside the diff are appended as top-level review feedback.
 * 
 * @param octokit - Authenticated Octokit client
 * @param owner - Repository owner login
 * @param repo - Repository name
 * @param pullNumber - Pull request number
 * @param commitSha - Latest commit SHA of the pull request
 * @param findings - Array of identified security and quality findings
 * @param summaryText - Synthesized summary of review findings
 * @param rawDiff - Raw unified diff text (optional, used for hunk validation)
 */
export async function postGitHubReviewComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  commitSha: string,
  findings: NewFinding[],
  summaryText: string,
  rawDiff?: string,
  truncation?: PullRequestDetails['truncation']
): Promise<boolean> {
  return await githubCircuitBreaker.execute(async () => {
    try {
      const modifiedLinesMap = rawDiff ? parseDiffModifiedLines(rawDiff) : null;

      // Separate inline-eligible findings (within modified hunks) vs out-of-diff / low confidence
      const inlineFindings: NewFinding[] = [];
      const outOfDiffFindings: NewFinding[] = [];
      const lowConfidenceFindings: NewFinding[] = [];

      for (const finding of findings) {
        if (finding.confidence === 'low') {
          lowConfidenceFindings.push(finding);
          continue;
        }

        if (modifiedLinesMap) {
          const fileHunkLines = modifiedLinesMap.get(finding.file_path);
          const isLineInDiff = fileHunkLines ? fileHunkLines.has(finding.line) : true;

          if (isLineInDiff) {
            inlineFindings.push(finding);
          } else {
            outOfDiffFindings.push(finding);
          }
        } else {
          inlineFindings.push(finding);
        }
      }

      const comments = inlineFindings.map((finding) => {
        const confidenceBadge = finding.confidence === 'high' ? '🔥 HIGH CONFIDENCE' : '⚖️ MEDIUM CONFIDENCE';
        const corroborationText =
          finding.corroboration_sources && finding.corroboration_sources.length > 1
            ? `(Corroborated by: ${finding.corroboration_sources.join(', ')})`
            : `(${finding.tool_source ?? 'agent'})`;

        return {
          path: finding.file_path,
          line: finding.line > 0 ? finding.line : 1,
          body: `**[DevGuard AI - ${finding.severity.toUpperCase()}]** \`${confidenceBadge}\` ${corroborationText}

${finding.message}

${finding.suggested_fix ? `\`\`\`suggestion\n${finding.suggested_fix}\n\`\`\`` : ''}`,
        };
      });

      let additionalNotesSection = '';

      if (truncation?.isTruncated) {
        additionalNotesSection += `\n\n> ⚠️ **Review Scope Notice**: Analyzed ${truncation.analyzedFilesCount} of ${truncation.totalFilesCount} changed files (${truncation.skippedFilesCount} skipped due to review cap).`;
      }

      if (outOfDiffFindings.length > 0) {
        additionalNotesSection += `\n\n### 📌 Findings in Surrounding Code (Outside Modified Diff)\n*The following findings were detected in modified files but fall outside the changed diff lines:*\n\n` +
          outOfDiffFindings
            .map(
              (f) => `- **${f.file_path}:${f.line}** [${f.severity.toUpperCase()}]: ${f.message}`
            )
            .join('\n');
      }

      if (lowConfidenceFindings.length > 0) {
        additionalNotesSection += `\n\n### 🔍 Worth a Second Look (Heuristic / Low-Confidence Flags)\n*The following items were flagged by a single static heuristic without multi-tool corroboration. Human reviewer judgment recommended:*\n\n` +
          lowConfidenceFindings
            .map(
              (f) => `- **${f.file_path}:${f.line}** (${f.tool_source}): ${f.message}`
            )
            .join('\n');
      }

      const hasHighConfidenceCritical = findings.some(
        (f) => f.severity === 'critical' && f.confidence !== 'low'
      );

      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitSha,
        event: hasHighConfidenceCritical ? 'REQUEST_CHANGES' : 'COMMENT',
        body: `## 🛡️ DevGuard AI Security & Quality Review

${summaryText}${additionalNotesSection}

---
*Autonomous Review by DevGuard AI with Multi-Tool Corroboration & Confidence Calibration.*`,
        comments: comments.slice(0, 10), // Limit to top 10 inline comments to avoid API overflow
      });

      return true;
    } catch (error: unknown) {
      const err = error as { status?: number; response?: { headers?: Record<string, string> }; message?: string };
      const isSecondaryRateLimit =
        err?.status === 403 &&
        (err?.message?.includes('secondary rate limit') || err?.response?.headers?.['retry-after']);

      logger.error('Error posting GitHub review comment', error, {
        module: 'github-client',
        action: 'post-review-comment',
        owner,
        repo,
        pullNumber,
        isSecondaryRateLimit: Boolean(isSecondaryRateLimit),
        retryAfter: err?.response?.headers?.['retry-after'],
      });
      return false;
    }
  });
}
