'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { Badge } from '@/components/ui/Badge';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { Tabs } from '@/components/ui/Tabs';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { DisplayReviewRun, Finding } from '@/lib/db/types';
import {
  ArrowLeft,
  ShieldAlert,
  Terminal,
  CheckCircle2,
  Copy,
  Check,
  Code2,
  AlertTriangle,
} from 'lucide-react';

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.id as string;

  const [run, setRun] = useState<DisplayReviewRun | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('findings');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchRun() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/reviews/${runId}`, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Failed to load review run (${res.status} ${res.statusText})`);
        }
        const data = await res.json();
        if (isMounted) {
          setRun(data.run);
          setFindings(data.findings || []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load run details');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (runId) {
      fetchRun();
    }

    return () => {
      isMounted = false;
    };
  }, [runId]);

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Skeleton className="h-6 w-48" />
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/50 space-y-4">
            <Skeleton className="h-8 w-96" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/50 space-y-4">
            <Skeleton className="h-64 w-full" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-16">
          <ErrorState
            title="Review Run Not Found"
            message={error || `Review run with ID "${runId}" does not exist or you do not have permission.`}
            onRetry={() => window.location.reload()}
          />
        </main>
      </div>
    );
  }

  const filteredFindings = findings.filter((f) => {
    if (severityFilter === 'all') return true;
    return f.severity === severityFilter;
  });

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const infoCount = findings.filter((f) => f.severity === 'info').length;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-300 flex flex-col">
      <Navbar />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 outline-none">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm font-medium text-slate-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded p-1"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Back to Dashboard
          </Link>

          <button
            type="button"
            onClick={() => copyText('run-id', run.id)}
            className="flex items-center space-x-1.5 text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors p-1"
            title="Copy Run ID"
          >
            <span>Run: {run.id.substring(0, 8)}</span>
            {copiedId === 'run-id' ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Run Summary Banner */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  PR #{run.pr_number}
                </span>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {run.pr_title || `Pull Request #${run.pr_number}`}
                </h1>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Author: <span className="text-emerald-400 font-semibold">{run.pr_author || 'unknown'}</span> • Commit: {run.commit_sha.substring(0, 7)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant={
                  run.status === 'completed'
                    ? 'success'
                    : run.status === 'failed'
                    ? 'danger'
                    : 'warning'
                }
                className="text-xs uppercase font-mono px-3 py-1"
              >
                {run.status}
              </Badge>
              {run.provider_used && (
                <Badge variant="outline" className="text-xs font-mono text-slate-300">
                  {run.provider_used}
                </Badge>
              )}
            </div>
          </div>

          {/* Metadata Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-800/80 text-xs text-slate-300">
            <div>
              <span className="text-slate-400 block mb-0.5">Created At</span>
              <span className="font-mono">{new Date(run.created_at).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Execution Duration</span>
              <span className="font-mono">
                {run.completed_at
                  ? `${((new Date(run.completed_at).getTime() - new Date(run.created_at).getTime()) / 1000).toFixed(1)}s`
                  : 'In Progress'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Deterministic Tool Calls</span>
              <span className="font-mono font-bold text-emerald-400">{run.tool_calls_count || 0} tools</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Total Findings</span>
              <span className="font-mono font-bold text-white">{findings.length} issues</span>
            </div>
          </div>

          {run.fallback_reason && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Provider Fallback Activated: {run.fallback_reason}</span>
            </div>
          )}

          {run.status === 'failed' && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
              <span>Failure: {run.error_message || 'Review execution failed.'}</span>
            </div>
          )}
        </div>

        {/* Tabs: Findings vs Agent Execution Trace */}
        <div className="space-y-4">
          <Tabs
            activeTab={activeTab}
            onChange={setActiveTab}
            tabs={[
              { id: 'findings', label: 'Security & Reliability Findings', count: findings.length },
              { id: 'trace', label: 'Agent Tool Trace', count: run.agent_trace?.length || 0 },
            ]}
          />

          {/* Findings Tab Content */}
          {activeTab === 'findings' && (
            <div className="space-y-4">
              {/* Severity Filter Pills */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/40 border border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Filter by Severity:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSeverityFilter('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      severityFilter === 'all'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white bg-slate-800/40'
                    }`}
                  >
                    All ({findings.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeverityFilter('critical')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      severityFilter === 'critical'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'text-slate-400 hover:text-rose-300 bg-slate-800/40'
                    }`}
                  >
                    Critical ({criticalCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeverityFilter('warning')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      severityFilter === 'warning'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-amber-300 bg-slate-800/40'
                    }`}
                  >
                    Warning ({warningCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeverityFilter('info')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      severityFilter === 'info'
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : 'text-slate-400 hover:text-sky-300 bg-slate-800/40'
                    }`}
                  >
                    Info ({infoCount})
                  </button>
                </div>
              </div>

              {filteredFindings.length === 0 ? (
                <div className="text-center py-12 rounded-xl bg-slate-900/40 border border-slate-800 space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                  <h2 className="text-base font-semibold text-white">No Matching Findings</h2>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {findings.length === 0
                      ? 'All automated AST security rules, OSV.dev checks, and test assertions passed cleanly.'
                      : 'No findings match the selected severity filter.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredFindings.map((f) => (
                    <div
                      key={f.id}
                      className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-3">
                          <SeverityBadge severity={f.severity as 'critical' | 'warning' | 'info'} />
                          <span className="font-mono text-xs text-emerald-300 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900">
                            {f.file_path}:{f.line}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 font-mono">Tool: {f.tool_source}</span>
                      </div>

                      <p className="text-sm text-slate-200 font-medium leading-relaxed">{f.message}</p>

                      {f.suggested_fix && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between text-xs text-emerald-400 font-mono">
                            <span className="flex items-center gap-1.5 font-semibold">
                              <Code2 className="w-4 h-4" /> Suggested Drop-in Patch:
                            </span>
                            <button
                              type="button"
                              onClick={() => copyText(f.id, f.suggested_fix!)}
                              className="flex items-center space-x-1 text-slate-400 hover:text-white transition-colors"
                            >
                              {copiedId === f.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              <span>{copiedId === f.id ? 'Copied' : 'Copy Patch'}</span>
                            </button>
                          </div>
                          <CodeBlock code={f.suggested_fix} language="diff" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Trace Tab Content */}
          {activeTab === 'trace' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-900/40 text-xs text-emerald-300 font-mono">
                The autonomous review loop invoked {run.agent_trace?.length || 0} tools to produce verifiable findings.
              </div>

              {!run.agent_trace || run.agent_trace.length === 0 ? (
                <div className="text-center py-10 rounded-xl bg-slate-900/40 border border-slate-800 text-xs text-slate-400 font-mono">
                  No trace recorded for this review run.
                </div>
              ) : (
                run.agent_trace.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between text-slate-300 border-b border-slate-800 pb-2">
                      <span className="flex items-center space-x-2 font-bold text-emerald-400">
                        <Terminal className="w-4 h-4" />
                        <span>Step {step.step}: {step.tool}</span>
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(step.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block mb-1">Input Arguments:</span>
                      <pre className="p-2.5 rounded bg-black/60 text-slate-300 overflow-x-auto border border-slate-800">
                        {JSON.stringify(step.input, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <span className="text-emerald-400 block mb-1">Execution Output:</span>
                      <pre className="p-2.5 rounded bg-black/60 text-emerald-200 overflow-x-auto border border-emerald-950/60">
                        {JSON.stringify(step.output, null, 2)}
                      </pre>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
