import { NextRequest, NextResponse } from 'next/server';
import { fetchPullRequestDiff, getOctokitClient, postGitHubReviewComment, verifyGitHubWebhook } from '@/lib/github/client';
import { createReviewRun, ensureRepoForInstallation, saveFindings } from '@/lib/db/supabase';
import { runAgentOrchestrator } from '@/lib/agent/orchestrator';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256') || '';
    const eventType = req.headers.get('x-github-event') || '';

    // 1. Verify Webhook Signature
    const isValid = await verifyGitHubWebhook(rawBody, signature);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as {
      action?: string;
      installation?: { id?: number };
      pull_request?: {
        number: number;
        title?: string;
        head: { sha: string };
        user?: { login?: string };
      };
      repository?: {
        full_name: string;
        owner?: { login?: string };
      };
    };

    // Filter for pull_request events (opened, synchronize)
    if (eventType === 'pull_request') {
      const action = payload.action;
      if (action && ['opened', 'synchronize', 'reopened'].includes(action)) {
        const pr = payload.pull_request;
        const repo = payload.repository;

        if (!pr || !repo) {
          return NextResponse.json({ message: 'Malformed pull_request event ignored' }, { status: 200 });
        }

        const repoFullName = repo.full_name;
        const prNumber = pr.number;
        const commitSha = pr.head.sha;
        const prTitle = pr.title || '';
        const prAuthor = pr.user?.login || 'unknown';
        const githubInstallationId = String(payload.installation?.id ?? 'local-dev');

        const storedRepo = await ensureRepoForInstallation({
          githubInstallationId,
          accountLogin: repo.owner?.login ?? repoFullName.split('/')[0],
          fullName: repoFullName,
        });

        // 2. Create initial review_run row in Supabase DB
        const reviewRun = await createReviewRun({
          repo_id: storedRepo.id,
          pr_number: prNumber,
          pr_title: prTitle,
          pr_author: prAuthor,
          commit_sha: commitSha,
          status: 'running',
        });

        // 3. Fetch PR diff via Octokit
        const octokit = getOctokitClient();
        const [owner = '', repoName = ''] = repoFullName.split('/');
        if (!owner || !repoName) {
          return NextResponse.json({ message: 'Malformed repository name ignored' }, { status: 200 });
        }
        const { diff, files } = await fetchPullRequestDiff(octokit, owner, repoName, prNumber);

        // 4. Run Agentic Orchestrator
        const result = await runAgentOrchestrator(diff, files, reviewRun.id);

        // 5. Post review comment to GitHub PR
        await postGitHubReviewComment(
          octokit,
          owner,
          repoName,
          prNumber,
          commitSha,
          result.findings,
          result.summary
        );

        // 6. Save findings to DB
        await saveFindings(result.findings);

        return NextResponse.json({
          success: true,
          reviewRunId: reviewRun.id,
          status: 'completed',
          findingsCount: result.findings.length,
          toolCallsCount: result.toolCallsCount,
        });
      }
    }

    return NextResponse.json({ message: 'Event ignored' }, { status: 200 });
  } catch (err: unknown) {
    console.error('Error handling GitHub webhook:', err);
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 200 });
  }
}
