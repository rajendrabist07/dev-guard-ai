import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { verify } from '@octokit/webhooks-methods';
import { NewFinding } from '../db/types';

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
    console.error('GITHUB_WEBHOOK_SECRET is not set; rejecting webhook request.');
    return false;
  }
  try {
    return await verify(webhookSecret, body, signature);
  } catch (err) {
    console.error('Error verifying GitHub webhook signature:', err);
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
 * Formats and posts an empirical review comment with one-click fix patches to GitHub.
 * 
 * @param octokit - Authenticated Octokit client
 * @param owner - Repository owner login
 * @param repo - Repository name
 * @param pullNumber - Pull request number
 * @param commitSha - Latest commit SHA of the pull request
 * @param findings - Array of identified security and quality findings
 * @param summaryText - Synthesized summary of review findings
 */
export async function postGitHubReviewComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  commitSha: string,
  findings: NewFinding[],
  summaryText: string
): Promise<boolean> {
  try {
    const comments = findings.map((finding) => ({
      path: finding.file_path,
      line: finding.line > 0 ? finding.line : 1,
      body: `**[DevGuard AI - ${finding.severity.toUpperCase()}]** (${finding.tool_source ?? 'agent'})
${finding.message}

${finding.suggested_fix ? `\`\`\`suggestion\n${finding.suggested_fix}\n\`\`\`` : ''}`,
    }));

    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitSha,
      event: findings.some((f) => f.severity === 'critical') ? 'REQUEST_CHANGES' : 'COMMENT',
      body: `## DevGuard AI Security & Code Quality Review

${summaryText}

---
*Reviewed by DevGuard AI Autonomous Agent. Capped 5-step iteration check.*`,
      comments: comments.slice(0, 10), // Limit to top 10 inline comments to avoid API overflow
    });

    return true;
  } catch (error) {
    console.error('Error posting GitHub review comment:', error);
    return false;
  }
}
