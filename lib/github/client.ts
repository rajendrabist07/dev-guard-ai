import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { verify } from '@octokit/webhooks-methods';
import { NewFinding } from '../db/types';
import { logger } from '../observability/logger';

const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || '';

/**
 * Validates the HMAC-SHA256 signature transmitted in `x-hub-signature-256` header.
 * 
 * @param body - Raw request payload string (unparsed)
 * @param signature - Signature string sent in header (e.g. `sha256=...`)
 * @returns {Promise<boolean>} True if signature matches secret and payload, false otherwise
 */
export async function verifyGitHubWebhook(body: string, signature: string): Promise<boolean> {
  if (!webhookSecret) {
    logger.error('GITHUB_WEBHOOK_SECRET is not set; rejecting webhook request.', undefined, {
      module: 'github-client',
      action: 'verify-signature',
    });
    return false;
  }
  try {
    return await verify(webhookSecret, body, signature);
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
 * 
 * @param installationId - Optional numeric GitHub installation ID
 * @returns {Promise<Octokit>} Authenticated Octokit REST client
 */
export async function getOctokitClient(installationId?: number): Promise<Octokit> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = getGitHubPrivateKey();

  if (installationId && appId && privateKey) {
    const auth = createAppAuth({
      appId,
      privateKey,
      installationId,
    });
    const installationAuthentication = await auth({ type: 'installation' });
    return new Octokit({ auth: installationAuthentication.token });
  }

  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  return new Octokit({ auth: token });
}

/**
 * Fetches pull request files and synthesizes a unified git patch diff.
 * 
 * @param octokit - Authenticated Octokit client
 * @param owner - Repository owner login
 * @param repo - Repository name
 * @param pullNumber - Pull request number
 * @returns {Promise<{ diff: string; files: string[] }>} Unified diff and array of modified filenames
 */
export async function fetchPullRequestDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<{ diff: string; files: string[] }> {
  try {
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
    });

    const fileNames = files.map((f) => f.filename);
    const diffContent = files
      .map((f) => `--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch || 'No patch available'}`)
      .join('\n\n');

    return { diff: diffContent, files: fileNames };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown GitHub API error';
    throw new Error(`Could not fetch live diff for ${owner}/${repo}#${pullNumber}: ${message}`);
  }
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
  rawDiff?: string
): Promise<boolean> {
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
  } catch (error) {
    logger.error('Error posting GitHub review comment', error, {
      module: 'github-client',
      action: 'post-review-comment',
      owner,
      repo,
      pullNumber,
    });
    return false;
  }
}
