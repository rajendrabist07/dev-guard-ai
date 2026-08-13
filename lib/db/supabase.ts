import { createClient } from '@supabase/supabase-js';
import { DisplayReviewRun, Finding, NewFinding, NewReviewRun, Repo } from './types';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

const mockRepos: Repo[] = [
  {
    id: 'repo-1',
    installation_id: 'inst-1',
    full_name: 'devguard-labs/nextjs-e-commerce',
    is_active: true,
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
  {
    id: 'repo-2',
    installation_id: 'inst-1',
    full_name: 'devguard-labs/auth-microservice',
    is_active: true,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
];

const mockReviewRuns: DisplayReviewRun[] = [
  {
    id: 'run-101',
    repo_id: 'repo-1',
    pr_number: 42,
    pr_title: 'feat: add payment gateway webhook handler and user cart checkout',
    pr_author: 'alex-dev',
    commit_sha: 'a7b3f9d8e12c4b5a',
    status: 'completed',
    tool_calls_count: 3,
    started_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    completed_at: new Date(Date.now() - 3600000 * 2 + 18000).toISOString(),
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    agent_trace: [
      {
        step: 1,
        tool: 'runLinter',
        input: { files: ['app/api/checkout/route.ts'] },
        output: { errorsFound: 2, summary: 'Found unhandled Promise and unsafe innerHTML assignment.' },
        timestamp: new Date(Date.now() - 3600000 * 2 + 3000).toISOString(),
      },
      {
        step: 2,
        tool: 'scanDependencies',
        input: { manifest: 'package.json' },
        output: { vulnerabilities: 1, package: 'stripe-node', version: '8.0.0', severity: 'HIGH' },
        timestamp: new Date(Date.now() - 3600000 * 2 + 9000).toISOString(),
      },
      {
        step: 3,
        tool: 'runTests',
        input: { testFile: 'tests/checkout.test.ts' },
        output: { passed: false, failedTests: ['checkout signature verification'] },
        timestamp: new Date(Date.now() - 3600000 * 2 + 15000).toISOString(),
      },
    ],
  },
  {
    id: 'run-102',
    repo_id: 'repo-2',
    pr_number: 18,
    pr_title: 'fix: update JWT verification expiration check and refresh token rotation',
    pr_author: 'sarah-security',
    commit_sha: 'f2e9c1a4b8d7e3f0',
    status: 'completed',
    tool_calls_count: 2,
    started_at: new Date(Date.now() - 86400000).toISOString(),
    completed_at: new Date(Date.now() - 86400000 + 12000).toISOString(),
    created_at: new Date(Date.now() - 86400000).toISOString(),
    agent_trace: [
      {
        step: 1,
        tool: 'runLinter',
        input: { files: ['lib/auth/jwt.ts'] },
        output: { errorsFound: 0, summary: 'No AST linter errors detected.' },
        timestamp: new Date(Date.now() - 86400000 + 4000).toISOString(),
      },
      {
        step: 2,
        tool: 'scanDependencies',
        input: { manifest: 'package.json' },
        output: { vulnerabilities: 0, summary: 'All dependencies are clean.' },
        timestamp: new Date(Date.now() - 86400000 + 8000).toISOString(),
      },
    ],
  },
];

const mockFindings: Finding[] = [
  {
    id: 'find-1',
    review_run_id: 'run-101',
    severity: 'critical',
    file_path: 'app/api/checkout/route.ts',
    line: 34,
    message: 'Potential SQL Injection / Unsanitized Query Input detected in database transaction query.',
    suggested_fix: 'const user = await db.query("SELECT * FROM users WHERE id = $1", [req.body.userId]);',
    tool_source: 'runLinter (AST Security Scanner)',
  },
  {
    id: 'find-2',
    review_run_id: 'run-101',
    severity: 'warning',
    file_path: 'package.json',
    line: 18,
    message: 'High severity vulnerability found in dependency stripe@8.0.0 (CVE-2024-3891). Upgrade recommended.',
    suggested_fix: '"stripe": "^14.10.0"',
    tool_source: 'scanDependencies (OSV.dev Vulnerability API)',
  },
  {
    id: 'find-3',
    review_run_id: 'run-101',
    severity: 'info',
    file_path: 'app/api/checkout/route.ts',
    line: 82,
    message: 'Missing explicit try/catch block around external payment webhook API call.',
    suggested_fix: 'try {\n  await stripe.webhooks.constructEvent(body, sig, secret);\n} catch (err) {\n  return NextResponse.json({ error: err.message }, { status: 400 });\n}',
    tool_source: 'runLinter',
  },
];

export async function getRepos(): Promise<Repo[]> {
  if (supabase) {
    const { data, error } = await supabase.from('repos').select('*').order('created_at', { ascending: false });
    if (!error && data && data.length > 0) return data;
  }
  return mockRepos;
}

export async function getReviewRuns(): Promise<DisplayReviewRun[]> {
  if (supabase) {
    const { data, error } = await supabase.from('review_runs').select('*').order('started_at', { ascending: false });
    if (!error && data && data.length > 0) return data as DisplayReviewRun[];
  }
  return mockReviewRuns;
}

export async function getReviewRunById(id: string): Promise<{ run: DisplayReviewRun | null; findings: Finding[] }> {
  if (supabase) {
    const { data: run, error: runError } = await supabase.from('review_runs').select('*').eq('id', id).single();
    if (!runError && run) {
      const { data: findings } = await supabase.from('findings').select('*').eq('review_run_id', id);
      return { run: run as DisplayReviewRun, findings: findings || [] };
    }
  }

  const run = mockReviewRuns.find((r) => r.id === id) || null;
  const findings = mockFindings.filter((f) => f.review_run_id === id);
  return { run, findings };
}

export async function ensureRepoForInstallation(input: {
  githubInstallationId: string;
  accountLogin: string;
  fullName: string;
}): Promise<Repo> {
  if (supabaseAdmin) {
    const { data: existingInstallation } = await supabaseAdmin
      .from('installations')
      .select('*')
      .eq('github_installation_id', input.githubInstallationId)
      .maybeSingle();

    const installation =
      existingInstallation ??
      (
        await supabaseAdmin
          .from('installations')
          .insert({
            github_installation_id: input.githubInstallationId,
            account_login: input.accountLogin,
          })
          .select()
          .single()
      ).data;

    if (installation) {
      const { data: existingRepo } = await supabaseAdmin
        .from('repos')
        .select('*')
        .eq('installation_id', installation.id)
        .eq('full_name', input.fullName)
        .maybeSingle();

      if (existingRepo) return existingRepo as Repo;

      const { data: createdRepo } = await supabaseAdmin
        .from('repos')
        .insert({
          installation_id: installation.id,
          full_name: input.fullName,
          is_active: true,
        })
        .select()
        .single();

      if (createdRepo) return createdRepo as Repo;
    }
  }

  const existingMockRepo = mockRepos.find((repo) => repo.full_name === input.fullName);
  if (existingMockRepo) return existingMockRepo;

  const mockRepo: Repo = {
    id: `repo-${Date.now()}`,
    installation_id: 'inst-1',
    full_name: input.fullName,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  mockRepos.unshift(mockRepo);
  return mockRepo;
}

export async function createReviewRun(data: Partial<NewReviewRun>): Promise<DisplayReviewRun> {
  const newRun: DisplayReviewRun = {
    id: `run-${Date.now()}`,
    repo_id: data.repo_id || 'repo-1',
    pr_number: data.pr_number || Math.floor(Math.random() * 100) + 1,
    pr_title: data.pr_title || 'PR Review Run',
    pr_author: data.pr_author || 'developer',
    commit_sha: data.commit_sha || 'sha-' + Math.random().toString(36).substring(7),
    status: data.status || 'running',
    tool_calls_count: 0,
    agent_trace: [],
    started_at: new Date().toISOString(),
    completed_at: null,
    created_at: new Date().toISOString(),
  };

  if (supabaseAdmin) {
    const insertData = {
      repo_id: newRun.repo_id,
      pr_number: newRun.pr_number,
      commit_sha: newRun.commit_sha,
      status: newRun.status,
      started_at: newRun.started_at,
      completed_at: newRun.completed_at,
    };
    const { data: created } = await supabaseAdmin.from('review_runs').insert(insertData).select().single();
    if (created) return { ...newRun, ...created } as DisplayReviewRun;
  }

  mockReviewRuns.unshift(newRun);
  return newRun;
}

export async function saveFindings(findings: NewFinding[]): Promise<Finding[]> {
  const formatted: Finding[] = findings.map((f, i) => ({
    ...f,
    id: `find-${Date.now()}-${i}`,
  }));

  if (supabaseAdmin && formatted.length > 0) {
    const insertData = formatted.map((finding) => ({
      review_run_id: finding.review_run_id,
      severity: finding.severity,
      file_path: finding.file_path,
      line: finding.line,
      message: finding.message,
      suggested_fix: finding.suggested_fix,
      tool_source: finding.tool_source,
    }));
    const { data } = await supabaseAdmin.from('findings').insert(insertData).select();
    if (data) return data as Finding[];
  }

  mockFindings.unshift(...formatted);
  return formatted;
}
