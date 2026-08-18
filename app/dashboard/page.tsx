'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import ReviewDetailModal from '@/components/ReviewDetailModal';
import { DashboardData, DisplayReviewRun, Finding } from '@/lib/db/types';
import { NEXT_PUBLIC_GITHUB_APP_INSTALL_URL, getGitHubAppInstallUrl } from '@/lib/github/config';
import AnalyticsSection from '@/components/AnalyticsSection';
import {
  ShieldAlert,
  GitPullRequest,
  CheckCircle2,
  Cpu,
  Github,
  Play,
  Search,
  ExternalLink,
  Plus,
  RefreshCw,
  ChevronRight,
  Clock,
} from 'lucide-react';

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const repos = dashboardData?.repos ?? [];
  const reviewRuns = dashboardData?.reviewRuns ?? [];
  const analytics = dashboardData?.analytics;
  const stats = dashboardData?.stats ?? {
    connectedRepos: 0,
    reviewRuns: 0,
    toolsExecuted: 0,
    securityFindings: 0,
    avgReviewTimeSeconds: null,
  };
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Selected run for detail view
  const [selectedRun, setSelectedRun] = useState<DisplayReviewRun | null>(null);
  const [selectedFindings, setSelectedFindings] = useState<Finding[]>([]);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');

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

  const handleOpenRunDetail = async (run: DisplayReviewRun) => {
    const res = await fetch(`/api/reviews/${run.id}`, { cache: 'no-store' });
    const data = (await res.json()) as { run?: DisplayReviewRun; findings?: Finding[]; error?: string };
    const findings = data.findings ?? [];
    setSelectedRun(run);
    setSelectedFindings(findings);
  };

  const filteredRuns = reviewRuns.filter(
    (run) =>
      (run.pr_title ?? `PR #${run.pr_number}`).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (run.pr_author ?? 'unknown').toLowerCase().includes(searchTerm.toLowerCase()) ||
      run.commit_sha.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-gray-100 selection:bg-emerald-500/30 selection:text-emerald-300">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gray-900/60 border border-gray-800/80 p-6 rounded-2xl">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              DevGuard AI Security Dashboard
            </h1>
            <p className="text-xs text-gray-400 mt-1">
              Autonomous pull request reviews powered by multi-step tool execution (ESLint AST, OSV.dev, Jest/Vitest)
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={loadData}
              aria-label="Refresh Dashboard Data"
              className="p-2.5 rounded-xl bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Link
              href="/try"
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <Play className="w-3.5 h-3.5 fill-black" />
              <span>Try Agent Live</span>
            </Link>
          </div>
        </div>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="p-5 rounded-2xl bg-gray-900/50 border border-gray-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
              <span>Connected Repos</span>
              <Github className="w-4 h-4 text-emerald-400" />
            </div>
            {loading ? (
              <div className="h-8 w-16 bg-gray-800/80 animate-pulse rounded-lg my-1" />
            ) : (
              <div className="text-2xl font-extrabold text-white">{stats.connectedRepos}</div>
            )}
            <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Webhooks Active
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-gray-900/50 border border-gray-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
              <span>PR Review Runs</span>
              <GitPullRequest className="w-4 h-4 text-teal-400" />
            </div>
            {loading ? (
              <div className="h-8 w-16 bg-gray-800/80 animate-pulse rounded-lg my-1" />
            ) : (
              <div className="text-2xl font-extrabold text-white">{stats.reviewRuns}</div>
            )}
            <div className="text-[11px] text-teal-400 font-mono">PRs reviewed</div>
          </div>

          <div className="p-5 rounded-2xl bg-gray-900/50 border border-gray-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
              <span>Tools Executed</span>
              <Cpu className="w-4 h-4 text-cyan-400" />
            </div>
            {loading ? (
              <div className="h-8 w-16 bg-gray-800/80 animate-pulse rounded-lg my-1" />
            ) : (
              <div className="text-2xl font-extrabold text-white">{stats.toolsExecuted}</div>
            )}
            <div className="text-[11px] text-cyan-400 font-mono">AST, CVE & test runs</div>
          </div>

          <div className="p-5 rounded-2xl bg-gray-900/50 border border-gray-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
              <span>Security Findings</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            {loading ? (
              <div className="h-8 w-16 bg-gray-800/80 animate-pulse rounded-lg my-1" />
            ) : (
              <div className="text-2xl font-extrabold text-white">{stats.securityFindings}</div>
            )}
            <div className="text-[11px] text-rose-400 font-mono">Verified advisories</div>
          </div>

          <div className="p-5 rounded-2xl bg-gray-900/50 border border-gray-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
              <span>Avg Review Time</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            {loading ? (
              <div className="h-8 w-16 bg-gray-800/80 animate-pulse rounded-lg my-1" />
            ) : (
              <div className="text-2xl font-extrabold text-white">
                {stats.avgReviewTimeSeconds !== null ? `${stats.avgReviewTimeSeconds}s` : '—'}
              </div>
            )}
            <div className="text-[11px] text-amber-400 font-mono">Webhook to PR comment</div>
          </div>
        </div>

        {loadError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
            {loadError}
          </div>
        )}

        {/* Visual Intelligence: Findings Analytics & Trends */}
        <AnalyticsSection analytics={analytics} loading={loading} />

        {/* Repositories Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-tight">Monitored Repositories</h2>
            <a
              href={dashboardData?.installUrl || NEXT_PUBLIC_GITHUB_APP_INSTALL_URL || getGitHubAppInstallUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Install GitHub App on New Repo</span>
            </a>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-gray-900/60 border border-gray-800/80 p-8 text-center text-sm text-gray-400 space-y-3">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <div>Fetching connected repositories...</div>
            </div>
          ) : repos.length === 0 ? (
            <div className="rounded-2xl bg-gray-900/60 border border-gray-800/80 p-8 text-center text-sm text-gray-400 space-y-3">
              <Github className="w-10 h-10 text-gray-600 mx-auto mb-2" />
              <div className="font-semibold text-gray-300">No repositories connected yet</div>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Install your GitHub App on a repository or click <strong>Try Agent Live</strong> to test the autonomous review loop.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {repos.map((repo) => (
                <div
                  key={repo.id}
                  className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800/80 hover:border-gray-700 transition-all flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-xl bg-gray-800 text-gray-300">
                      <Github className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white flex items-center gap-2">
                        <span>{repo.full_name}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 font-mono">
                        Status: {repo.is_active ? 'Active' : 'Inactive'}
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    Active
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Review Runs History Table */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Recent PR Review Runs</h2>
              <p className="text-xs text-gray-400">Click any run to view the step-by-step tool trace & code findings</p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search PR title or author..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-gray-900 border border-gray-800 text-gray-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="text-center py-12 text-gray-400 text-xs font-mono space-y-3">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <div>Loading review runs...</div>
              </div>
            ) : filteredRuns.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-xs space-y-3">
                <GitPullRequest className="w-8 h-8 text-gray-600 mx-auto" />
                <div className="font-semibold text-gray-300">No review runs recorded yet</div>
                <p className="text-gray-500 max-w-sm mx-auto">
                  Create a pull request on your repository or click <strong>Try Agent Live</strong> to test the agentic loop live!
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800/80">
                {filteredRuns.map((run) => (
                  <div
                    key={run.id}
                    onClick={() => handleOpenRunDetail(run)}
                    className="p-4 sm:px-6 flex items-center justify-between hover:bg-gray-800/40 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 group-hover:scale-105 transition-transform">
                        <GitPullRequest className="w-5 h-5" />
                      </div>

                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs text-emerald-400 font-bold">#{run.pr_number}</span>
                          <span className="font-bold text-sm text-white group-hover:text-emerald-300 transition-colors">
                            {run.pr_title ?? `PR #${run.pr_number}`}
                          </span>
                        </div>
                        <div className="flex items-center space-x-3 text-xs text-gray-400 mt-1 font-mono">
                          <span>Author: {run.pr_author ?? 'unknown'}</span>
                          <span>•</span>
                          <span>Commit: {run.commit_sha.substring(0, 7)}</span>
                          <span>•</span>
                          <span className="text-cyan-400">{run.tool_calls_count} Tool Iterations</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {run.status}
                      </span>
                      <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Detail Modal */}
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
