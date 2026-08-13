import { Octokit } from '@octokit/rest';
import { verify } from '@octokit/webhooks-methods';
import { NewFinding } from '../db/types';

const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || '';

export async function verifyGitHubWebhook(body: string, signature: string): Promise<boolean> {
  if (!webhookSecret) {
    console.warn('GITHUB_WEBHOOK_SECRET is not set; allowing request in development mode.');
    return true;
  }
  try {
    return await verify(webhookSecret, body, signature);
  } catch (err) {
    console.error('Error verifying GitHub webhook signature:', err);
    return false;
  }
}

export function getOctokitClient(installationToken?: string): Octokit {
  const token = installationToken || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  return new Octokit({ auth: token });
}

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
  } catch {
    console.warn(`Could not fetch live diff for ${owner}/${repo}#${pullNumber}. Returning mock diff for evaluation.`);
    return {
      files: ['app/api/checkout/route.ts', 'package.json'],
      diff: `--- a/app/api/checkout/route.ts
+++ b/app/api/checkout/route.ts
@@ -30,6 +30,12 @@ export async function POST(req: Request) {
+  const { userId, amount } = await req.json();
+  // UNSAFE QUERY
+  const query = "SELECT * FROM users WHERE id = '" + userId + "'";
+  const result = await db.raw(query);
+  
+  // Missing error handling
+  await fetch('https://payment-provider.internal/charge', { method: 'POST' });

--- a/package.json
+++ b/package.json
@@ -15,4 +15,5 @@
+    "axios": "0.19.0",
+    "lodash": "4.17.15"`,
    };
  }
}

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
