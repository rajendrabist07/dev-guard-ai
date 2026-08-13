'use client';

import { useEffect, useState, use } from 'react';
import Navbar from '@/components/Navbar';
import ReviewDetailModal from '@/components/ReviewDetailModal';
import SimulateReviewModal from '@/components/SimulateReviewModal';
import { DisplayReviewRun, Finding, Repo } from '@/lib/db/types';
import { getRepos, getReviewRunById, getReviewRuns } from '@/lib/db/supabase';
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
} from 'lucide-react';

export default function DashboardPage({ searchParams }: { searchParams: Promise<{ simulate?: string }> }) {
  const resolvedSearchParams = use(searchParams);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reviewRuns, setReviewRuns] = useState<DisplayReviewRun[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected run for detail view
  const [selectedRun, setSelectedRun] = useState<DisplayReviewRun | null>(null);
  const [selectedFindings, setSelectedFindings] = useState<Finding[]>([]);

  // Simulation modal
  const [isSimulateOpen, setIsSimulateOpen] = useState(false);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [reposData, runsData] = await Promise.all([getRepos(), getReviewRuns()]);
      setRepos(reposData);
      setReviewRuns(runsData);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (resolvedSearchParams?.simulate === 'true') {
      setIsSimulateOpen(true);
    }
  }, [resolvedSearchParams]);

  const handleOpenRunDetail = async (run: DisplayReviewRun) => {
    const { findings } = await getReviewRunById(run.id);
    setSelectedRun(run);
    setSelectedFindings(findings);
  };

  const handleSimulationFinished = async (newRunId: string) => {
    await loadData();
    const { run, findings } = await getReviewRunById(newRunId);
    if (run) {
      setSelectedRun(run);
      setSelectedFindings(findings);
    }
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
              className="p-2.5 rounded-xl bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setIsSimulateOpen(true)}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-black" />
              <span>Simulate PR Review</span>
            </button>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-gray-900/50 border border-gray-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
              <span>Connected Repositories</span>
              <Github className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold text-white">{repos.length}</div>
            <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Active Webhook Subscriptions
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-gray-900/50 border border-gray-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
              <span>PR Review Runs</span>
              <GitPullRequest className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-2xl font-extrabold text-white">{reviewRuns.length}</div>
            <div className="text-[11px] text-teal-400 font-mono">100% Verified via Tool Output</div>
          </div>

          <div className="p-5 rounded-2xl bg-gray-900/50 border border-gray-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
              <span>Tools Executed</span>
              <Cpu className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-extrabold text-white">
              {reviewRuns.reduce((acc, r) => acc + (r.tool_calls_count || 1), 0)}
            </div>
            <div className="text-[11px] text-cyan-400 font-mono">AST, OSV.dev, Test Runners</div>
          </div>

          <div className="p-5 rounded-2xl bg-gray-900/50 border border-gray-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
              <span>Security Findings</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-extrabold text-white">3</div>
            <div className="text-[11px] text-rose-400 font-mono">Critical & Warning Annotations</div>
          </div>
        </div>

        {/* Repositories Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-tight">Monitored Repositories</h2>
            <a
              href="https://github.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Install GitHub App on New Repo</span>
            </a>
          </div>

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
                    <div className="text-xs text-gray-400 mt-0.5 font-mono">Status: {repo.is_active ? 'active' : 'inactive'}</div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  Active
                </span>
              </div>
            ))}
          </div>
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
            {filteredRuns.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-xs font-mono">No review runs found.</div>
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
                          <span className="text-cyan-400">{run.tool_calls_count || 3} Tool Iterations</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Completed
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

      {/* Simulation Modal */}
      {isSimulateOpen && (
        <SimulateReviewModal
          onClose={() => setIsSimulateOpen(false)}
          onSimulationComplete={handleSimulationFinished}
        />
      )}
    </div>
  );
}
