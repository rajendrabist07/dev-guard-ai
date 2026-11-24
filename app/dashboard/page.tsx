'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import ReviewDetailModal from '@/components/ReviewDetailModal';
import { DashboardData, DashboardStats, DisplayReviewRun, Finding } from '@/lib/db/types';
import { NEXT_PUBLIC_GITHUB_APP_INSTALL_URL, getGitHubAppInstallUrl } from '@/lib/github/config';
import AnalyticsSection from '@/components/AnalyticsSection';
import BadgeGeneratorSection from '@/components/BadgeGeneratorSection';
import { Button } from '@/components/ui/Button';
import { Stepper, StepItem } from '@/components/ui/Stepper';
import {
  ShieldAlert,
  GitPullRequest,
  CheckCircle2,
  Cpu,
  Search,
  ExternalLink,
  Plus,
  RefreshCw,
  ChevronRight,
  Clock,
  Sparkles,
} from 'lucide-react';
import GithubIcon from '@/components/icons/GithubIcon';

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const repos = useMemo(() => dashboardData?.repos ?? [], [dashboardData?.repos]);
  const reviewRuns = useMemo(() => dashboardData?.reviewRuns ?? [], [dashboardData?.reviewRuns]);
  const analytics = dashboardData?.analytics;
  const stats: DashboardStats = dashboardData?.stats ?? {
    connectedRepos: 0,
    reviewRuns: 0,
    toolsExecuted: 0,
    securityFindings: 0,
    avgReviewTimeSeconds: null,
    avgCostPerReviewUsd: 0,
    baselineCostWithoutRoutingUsd: 0,
    adaptiveRoutingCostSavingsPercentage: 0,
    p50LatencySeconds: 0,
    p95LatencySeconds: 0,
    osvCacheHitRatePercentage: 0,
  };

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Selected run for modal preview
  const [selectedRun, setSelectedRun] = useState<DisplayReviewRun | null>(null);
  const [selectedFindings, setSelectedFindings] = useState<Finding[]>([]);

  // Search & Filter & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'failed' | 'running' | 'queued'>('all');
  const [repoFilter, setRepoFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      const data = (await res.json()) as DashboardData | { error: string };
      if (!res.ok) {
        throw new Error('error' in data ? data.error : 'Dashboard data could not be loaded.');
      }
      setDashboardData(data as DashboardData);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setLoadError(err instanceof Error ? err.message : 'Dashboard data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenRunDetail = async (run: DisplayReviewRun, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    try {
      const res = await fetch(`/api/reviews/${run.id}`, { cache: 'no-store' });
      const data = (await res.json()) as { run?: DisplayReviewRun; findings?: Finding[]; error?: string };
      setSelectedRun(run);
      setSelectedFindings(data.findings ?? []);
    } catch {
      setSelectedRun(run);
      setSelectedFindings([]);
    }
  };

  // Filtered runs
  const filteredRuns = useMemo(() => {
    return reviewRuns.filter((run) => {
      const matchesSearch =
        (run.pr_title ?? `PR #${run.pr_number}`).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (run.pr_author ?? 'unknown').toLowerCase().includes(searchTerm.toLowerCase()) ||
        run.commit_sha.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || run.status === statusFilter;
      const matchesRepo = repoFilter === 'all' || run.repo_id === repoFilter;

      return matchesSearch && matchesStatus && matchesRepo;
    });
  }, [reviewRuns, searchTerm, statusFilter, repoFilter]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredRuns.length / pageSize) || 1;
  const paginatedRuns = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRuns.slice(start, start + pageSize);
  }, [filteredRuns, currentPage, pageSize]);

  // Onboarding steps
  const hasInstalled = repos.length > 0;
  const hasRuns = reviewRuns.length > 0;
  const hasCompletedRun = reviewRuns.some((r) => r.status === 'completed');

  const onboardingSteps: StepItem[] = [
    {
      id: 'step-1',
      label: 'Install GitHub App',
      description: hasInstalled ? `${repos.length} repository connected` : 'Grant permissions on your GitHub repositories',
      status: hasInstalled ? 'completed' : 'in_progress',
    },
    {
      id: 'step-2',
      label: 'Select Repositories',
      description: hasInstalled ? 'Repositories monitored by webhooks' : 'Choose which repos to monitor',
      status: hasInstalled ? 'completed' : 'pending',
    },
    {
      id: 'step-3',
      label: 'Open a Pull Request',
      description: hasRuns ? `${reviewRuns.length} PRs received` : 'Create a PR on GitHub to trigger review',
      status: hasRuns ? 'completed' : hasInstalled ? 'in_progress' : 'pending',
    },
    {
      id: 'step-4',
      label: 'Verify Review Findings',
      description: hasCompletedRun ? 'Automated checks and fixes posted' : 'Inspect AST & CVE findings inline',
      status: hasCompletedRun ? 'completed' : hasRuns ? 'in_progress' : 'pending',
    },
  ];

  const installUrl = dashboardData?.installUrl || NEXT_PUBLIC_GITHUB_APP_INSTALL_URL || getGitHubAppInstallUrl();

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-300">
      <Navbar />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 outline-none">
        {/* Top Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              DevGuard AI Security Dashboard
            </h1>
            <p className="text-sm text-slate-400">
              Autonomous PR security reviews verified by AST rules, OSV.dev dependency scans, and test invariants.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              onClick={loadData}
              disabled={loading}
              className="p-2.5 min-h-[44px] min-w-[44px]"
              aria-label="Refresh Dashboard Data"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            <Link href="/try">
              <Button variant="primary" className="font-bold">
                <Sparkles className="w-4 h-4 mr-2" />
                <span>Try Agent Live</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* First-Run Onboarding Checklist (when 0 repos or 0 runs) */}
        {(!hasInstalled || !hasRuns) && (
          <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/20 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  Quick Setup &amp; Onboarding
                </h2>
                <p className="text-xs text-slate-400">
                  Follow these 4 steps to activate autonomous security reviews on your pull requests.
                </p>
              </div>
              <a
                href={installUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >
                <span>Install GitHub App</span>
                <ExternalLink className="w-3.5 h-3.5 ml-1" />
              </a>
            </div>

            <Stepper steps={onboardingSteps} orientation="horizontal" />
          </div>
        )}

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Connected Repos</span>
              <GithubIcon className="w-4 h-4 text-emerald-400" />
            </div>
            {loading ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded-lg my-1" />
            ) : (
              <div className="text-2xl font-extrabold text-white">{stats.connectedRepos}</div>
            )}
            <div className="text-xs font-mono flex items-center gap-1">
              {stats.connectedRepos > 0 ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Installed &amp; Monitored</span>
                </>
              ) : (
                <span className="text-slate-400">No repositories yet</span>
              )}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>PR Review Runs</span>
              <GitPullRequest className="w-4 h-4 text-teal-400" />
            </div>
            {loading ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded-lg my-1" />
            ) : (
              <div className="text-2xl font-extrabold text-white">{stats.reviewRuns}</div>
            )}
            <div className="text-xs text-teal-400 font-mono">Total PRs processed</div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Tools Executed</span>
              <Cpu className="w-4 h-4 text-cyan-400" />
            </div>
            {loading ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded-lg my-1" />
            ) : (
              <div className="text-2xl font-extrabold text-white">{stats.toolsExecuted}</div>
            )}
            <div className="text-xs text-cyan-400 font-mono">AST rules &amp; CVE scans</div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Security Findings</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            {loading ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded-lg my-1" />
            ) : (
              <div className="text-2xl font-extrabold text-white">{stats.securityFindings}</div>
            )}
            <div className="text-xs text-rose-400 font-mono">Verified advisories</div>
          </div>
        </div>

        {/* Cost & Latency & Cache Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Avg Cost / Review</span>
              {stats.adaptiveRoutingCostSavingsPercentage !== null && stats.adaptiveRoutingCostSavingsPercentage > 0 && (
                <span className="text-emerald-400 font-mono text-xs font-bold">
                  {stats.adaptiveRoutingCostSavingsPercentage}% savings
                </span>
              )}
            </div>
            {stats.avgCostPerReviewUsd !== null && stats.avgCostPerReviewUsd !== undefined ? (
              <div className="text-xl font-extrabold text-white font-mono flex items-baseline gap-2">
                <span>${stats.avgCostPerReviewUsd.toFixed(6)}</span>
                {stats.baselineCostWithoutRoutingUsd !== null && (
                  <span className="text-xs text-slate-400 line-through font-normal">
                    ${stats.baselineCostWithoutRoutingUsd.toFixed(6)}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-sm font-semibold text-slate-400 font-mono py-0.5">
                No data yet
              </div>
            )}
            <div className="text-xs text-slate-400">
              {stats.avgCostPerReviewUsd !== null
                ? 'Adaptive complexity routing (Llama 70B ➡️ Flash ➡️ Fast)'
                : 'Awaiting PR reviews to record actual token cost.'}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Pipeline Latency (p50 / p95)</span>
              <Clock className="w-3.5 h-3.5 text-amber-400" />
            </div>
            {stats.p50LatencySeconds !== null && stats.p95LatencySeconds !== null ? (
              <div className="text-xl font-extrabold text-white font-mono">
                {stats.p50LatencySeconds}s <span className="text-slate-400 text-sm font-normal">/</span> {stats.p95LatencySeconds}s
              </div>
            ) : (
              <div className="text-sm font-semibold text-slate-400 font-mono py-0.5">
                No data yet
              </div>
            )}
            <div className="text-xs text-slate-400">
              {stats.p50LatencySeconds !== null
                ? 'End-to-end diagnostic runtime'
                : 'Awaiting completed reviews to compute latency percentiles.'}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>OSV.dev Cache Hit Rate</span>
              <span className="text-cyan-400 font-mono text-xs">Upstash Redis</span>
            </div>
            <div className="text-xl font-extrabold text-cyan-400 font-mono">
              {stats.osvCacheHitRatePercentage ?? 0}%
            </div>
            <div className="text-xs text-slate-400">24-hour TTL manifest deduplication</div>
          </div>
        </div>

        {loadError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
            {loadError}
          </div>
        )}

        {/* Visual Intelligence: Findings Analytics & Trends */}
        <AnalyticsSection analytics={analytics} loading={loading} />

        {/* Monitored Repositories Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-tight">Monitored Repositories</h2>
            <a
              href={installUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 transition-colors p-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Install GitHub App on New Repo</span>
            </a>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-8 text-center text-sm text-slate-400 space-y-3">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <div>Fetching connected repositories...</div>
            </div>
          ) : repos.length === 0 ? (
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-8 text-center text-sm text-slate-400 space-y-3">
              <GithubIcon className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <div className="font-semibold text-slate-300">No repositories connected yet</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Install your GitHub App on a repository or click <strong>Try Agent Live</strong> to test the autonomous review loop.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {repos.map((repo) => (
                <div
                  key={repo.id}
                  className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-xl bg-slate-800 text-slate-300">
                      <GithubIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white flex items-center gap-2">
                        <span>{repo.full_name}</span>
                        <a
                          href={`https://github.com/${repo.full_name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-white"
                          title="View on GitHub"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 font-mono">
                        Webhook Deliveries: {repo.is_active ? 'Healthy & Active' : 'Inactive'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        repo.is_active
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-slate-500/10 border-slate-500/30 text-slate-400'
                      }`}
                    >
                      {repo.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Public README Badge Generator Section */}
        <BadgeGeneratorSection repos={repos} />

        {/* Review Runs History Table with Filters & Pagination */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Recent PR Review Runs</h2>
              <p className="text-xs text-slate-400">Click any run to view the step-by-step tool trace &amp; code findings</p>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search PR or author..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-4 py-2 min-h-[44px] text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:border-emerald-500 focus:outline-none"
                  aria-label="Search pull requests"
                />
              </div>

              {/* Repo Filter */}
              {repos.length > 0 && (
                <select
                  value={repoFilter}
                  onChange={(e) => {
                    setRepoFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 min-h-[44px] text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-300 focus:border-emerald-500 focus:outline-none"
                  aria-label="Filter runs by repository"
                >
                  <option value="all">All Repositories</option>
                  {repos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.full_name}
                    </option>
                  ))}
                </select>
              )}

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'all' | 'completed' | 'failed' | 'running' | 'queued');
                  setCurrentPage(1);
                }}
                className="px-3 py-2 min-h-[44px] text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-300 focus:border-emerald-500 focus:outline-none"
                aria-label="Filter runs by status"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="running">Running</option>
                <option value="queued">Queued</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="text-center py-12 text-slate-400 text-xs font-mono space-y-3">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <div>Loading review runs...</div>
              </div>
            ) : paginatedRuns.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs space-y-3">
                <GitPullRequest className="w-8 h-8 text-slate-600 mx-auto" />
                <div className="font-semibold text-slate-300">No review runs match your criteria</div>
                <p className="text-slate-400 max-w-sm mx-auto">
                  {reviewRuns.length === 0
                    ? 'Create a pull request on your repository or click Try Agent Live to test the review loop.'
                    : 'Try clearing your search query or status filter.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {paginatedRuns.map((run) => (
                  <div
                    key={run.id}
                    className="p-4 sm:px-6 flex items-center justify-between hover:bg-slate-800/40 transition-colors group"
                  >
                    <div
                      onClick={() => handleOpenRunDetail(run)}
                      className="flex items-center space-x-4 cursor-pointer flex-1 min-w-0"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') handleOpenRunDetail(run);
                      }}
                      aria-label={`View details for PR #${run.pr_number}`}
                    >
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
                        <GitPullRequest className="w-5 h-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs text-emerald-400 font-bold shrink-0">
                            #{run.pr_number}
                          </span>
                          <span className="font-bold text-sm text-white group-hover:text-emerald-300 transition-colors truncate">
                            {run.pr_title ?? `PR #${run.pr_number}`}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-1 font-mono">
                          <span>Author: {run.pr_author ?? 'unknown'}</span>
                          <span>•</span>
                          <span>Commit: {run.commit_sha.substring(0, 7)}</span>
                          <span>•</span>
                          <span className="text-cyan-400">{run.tool_calls_count} Tools</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 shrink-0 ml-4">
                      {run.status === 'completed' && (
                        <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          completed
                        </span>
                      )}
                      {run.status === 'running' && (
                        <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                          <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                          running
                        </span>
                      )}
                      {run.status === 'failed' && (
                        <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-400">
                          <ShieldAlert className="w-3 h-3 mr-1" />
                          failed
                        </span>
                      )}
                      {(run.status === 'queued' || run.status === 'pending') && (
                        <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                          <Clock className="w-3 h-3 mr-1" />
                          queued
                        </span>
                      )}

                      <Link
                        href={`/dashboard/runs/${run.id}`}
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        title="Open Dedicated Run Detail Page"
                        aria-label={`Open dedicated page for PR #${run.pr_number}`}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-6 py-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span>
                  Showing {(currentPage - 1) * pageSize + 1} -{' '}
                  {Math.min(currentPage * pageSize, filteredRuns.length)} of {filteredRuns.length} runs
                </span>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  >
                    Previous
                  </Button>
                  <span className="font-mono text-slate-300 px-2">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Quick Preview Detail Modal */}
      {selectedRun && (
        <ReviewDetailModal
          run={selectedRun}
          findings={selectedFindings}
          onClose={() => setSelectedRun(null)}
        />
      )}
    </div>
  );
}
