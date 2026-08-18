'use client';

import { useEffect, useState, use } from 'react';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import {
  ShieldAlert,
  AlertTriangle,
  Info,
  Terminal,
  Copy,
  Check,
  Code2,
  Share2,
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Clock,
  CheckCheck,
  Loader2,
  FileCode,
} from 'lucide-react';
import { TryRun, Severity } from '@/lib/db/types';
import ExportReportMenu from '@/components/ExportReportMenu';
import ModelTransparencyPanel from '@/components/ModelTransparencyPanel';

export default function TryResultPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const runId = resolvedParams.id;

  const [run, setRun] = useState<TryRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'findings' | 'trace' | 'snippet'>('findings');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    async function loadRun() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/try/result/${runId}`);
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Test run not found');
        }
        setRun(data.run);
      } catch (err: unknown) {
        console.error('Error loading result:', err);
        setError(err instanceof Error ? err.message : 'Failed to load test run');
      } finally {
        setLoading(false);
      }
    }

    if (runId) {
      loadRun();
    }
  }, [runId]);

  const copyShareLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }
  };

  const copyFix = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getSeverityBadge = (severity: Severity | string) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-400">
            <ShieldAlert className="w-3 h-3 mr-1 text-rose-400" />
            CRITICAL
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <AlertTriangle className="w-3 h-3 mr-1 text-amber-400" />
            WARNING
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Info className="w-3 h-3 mr-1 text-cyan-400" />
            INFO
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-gray-100 selection:bg-emerald-500/30 selection:text-emerald-300">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation back bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href="/try"
            className="inline-flex items-center space-x-2 text-xs font-semibold text-gray-400 hover:text-emerald-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Live Playground</span>
          </Link>

          {run && (
            <div className="flex items-center gap-3">
              <button
                onClick={copyShareLink}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold transition-all shadow-sm shadow-emerald-950"
              >
                {shareCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Share Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copy Shareable Link</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="p-16 rounded-2xl bg-gray-900/60 border border-gray-800 text-center space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mx-auto" />
            <div className="text-sm font-semibold text-gray-300">Loading test run results...</div>
            <p className="text-xs text-gray-500 font-mono">Retrieving review findings and tool traces</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-12 rounded-2xl bg-gray-900/60 border border-rose-900/40 text-center space-y-4">
            <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
            <h2 className="text-lg font-bold text-white">Test Run Not Found</h2>
            <p className="text-xs text-gray-400 max-w-md mx-auto">{error}</p>
            <div className="pt-2">
              <Link
                href="/try"
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all"
              >
                <span>Run a New Test on /try</span>
              </Link>
            </div>
          </div>
        )}

        {/* Run Details */}
        {run && !loading && (
          <div className="space-y-6 animate-fade-in">
            {/* Header Card */}
            <div className="p-6 rounded-2xl bg-gray-900/70 border border-gray-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono uppercase font-bold">
                      {run.input_type === 'sample' ? 'Sample Buggy File' : 'Pasted Code Snippet'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      ID: {run.id.slice(0, 16)}
                    </span>
                  </div>
                  <h1 className="text-xl font-bold text-white tracking-tight">{run.pr_title}</h1>
                  <div className="flex items-center gap-3 text-xs text-gray-400 font-mono pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-gray-500" />
                      {new Date(run.created_at).toLocaleString()}
                    </span>
                    <span>•</span>
                    <span className="text-cyan-400">{run.tool_calls_count} Tool Iterations</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-semibold">{run.provider_used || 'DevGuard Agent'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-start sm:self-center flex-wrap">
                  <ExportReportMenu
                    reportData={{
                      title: run.pr_title,
                      author: run.pr_author,
                      timestamp: run.created_at,
                      status: run.status,
                      reviewType: run.input_type === 'sample' ? 'Sample Playground Preset' : 'Custom Pasted Code',
                      toolCallsCount: run.tool_calls_count,
                      providerUsed: run.provider_used || 'DevGuard Local Orchestrator',
                      summary: run.summary || undefined,
                      findings: run.findings,
                    }}
                    size="sm"
                  />
                  <button
                    onClick={copyShareLink}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-xs font-semibold transition-all"
                  >
                    {shareCopied ? (
                      <>
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">Link Copied!</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Share Result</span>
                      </>
                    )}
                  </button>
                  <Link
                    href="/try"
                    className="px-3.5 py-1.5 text-xs font-bold text-black bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-all shadow-md shadow-emerald-500/20"
                  >
                    Test Your Own Code
                  </Link>
                </div>
              </div>

              {/* Severity Breakdown */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-3">
                <div className="p-2.5 sm:p-3 rounded-xl bg-rose-950/20 border border-rose-900/40 flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs text-rose-400 font-medium">Critical</span>
                  <span className="text-sm sm:text-base font-bold text-rose-300">
                    {run.findings.filter((f) => f.severity === 'critical').length}
                  </span>
                </div>
                <div className="p-2.5 sm:p-3 rounded-xl bg-amber-950/20 border border-amber-900/40 flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs text-amber-400 font-medium">Warnings</span>
                  <span className="text-sm sm:text-base font-bold text-amber-300">
                    {run.findings.filter((f) => f.severity === 'warning').length}
                  </span>
                </div>
                <div className="p-2.5 sm:p-3 rounded-xl bg-cyan-950/20 border border-cyan-900/40 flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs text-cyan-400 font-medium">Info</span>
                  <span className="text-sm sm:text-base font-bold text-cyan-300">
                    {run.findings.filter((f) => f.severity === 'info').length}
                  </span>
                </div>
              </div>

              {/* Model Transparency & Reasoning Bar */}
              <ModelTransparencyPanel
                providerUsed={run.provider_used || 'Groq Llama 3.3 70B'}
                agentTrace={run.agent_trace}
                toolCallsCount={run.tool_calls_count}
              />
            </div>

            {/* Tabbed Results Body */}
            <div className="rounded-2xl bg-gray-900/60 border border-gray-800 overflow-hidden">
              <div className="px-4 sm:px-6 border-b border-gray-800 bg-gray-950/60 flex space-x-4 sm:space-x-6 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('findings')}
                  className={`py-3.5 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
                    activeTab === 'findings'
                      ? 'border-emerald-400 text-emerald-400'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Findings ({run.findings.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('trace')}
                  className={`py-3.5 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
                    activeTab === 'trace'
                      ? 'border-emerald-400 text-emerald-400'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Cpu className="w-4 h-4" />
                  <span>Agent Trace ({run.agent_trace?.length || 0} Steps)</span>
                </button>
                <button
                  onClick={() => setActiveTab('snippet')}
                  className={`py-3.5 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
                    activeTab === 'snippet'
                      ? 'border-emerald-400 text-emerald-400'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <FileCode className="w-4 h-4" />
                  <span>Inspected Code</span>
                </button>
              </div>

              {/* Findings Content */}
              {activeTab === 'findings' && (
                <div className="p-6 space-y-4">
                  {run.findings.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-emerald-950/20 border border-emerald-800/40 space-y-4">
                      <div className="flex items-center space-x-3 text-emerald-400">
                        <CheckCheck className="w-6 h-6 text-emerald-400" />
                        <h3 className="text-base font-bold text-white">
                          No issues found — here&apos;s what was checked:
                        </h3>
                      </div>
                      <div className="space-y-2.5 text-xs font-mono text-gray-300 pl-9">
                        <div className="flex items-center space-x-2 text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span>
                            <strong>AST Static Linter:</strong> Passed cleanly (no SQL injection, eval/XSS, unhandled async promises, or dead code detected).
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span>
                            <strong>OSV.dev Vulnerability Scanner:</strong> Passed cleanly (0 known CVE / security advisory matches in dependencies).
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span>
                            <strong>Programmatic Test Assertions:</strong> Passed (syntax and execution safety verified).
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    run.findings.map((f, idx) => (
                      <div
                        key={f.id || idx}
                        className="p-5 rounded-xl bg-gray-950/80 border border-gray-800 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center space-x-2.5">
                            {getSeverityBadge(f.severity)}
                            <span className="font-mono text-xs text-emerald-300 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900">
                              {f.file_path}:{f.line}
                            </span>
                          </div>
                          <span className="text-[11px] text-gray-500 font-mono">
                            Tool: <span className="text-gray-300">{f.tool_source || 'orchestrator'}</span>
                          </span>
                        </div>

                        <p className="text-sm text-gray-200 font-medium leading-relaxed">{f.message}</p>

                        {f.suggested_fix && (
                          <div className="mt-3 rounded-lg bg-gray-900 border border-gray-800 p-3.5 space-y-2">
                            <div className="flex items-center justify-between text-xs text-emerald-400 font-mono font-medium">
                              <span className="flex items-center gap-1.5">
                                <Code2 className="w-3.5 h-3.5" /> Suggested Code Fix:
                              </span>
                              <button
                                onClick={() => copyFix(f.id || `${idx}`, f.suggested_fix!)}
                                className="flex items-center space-x-1 text-gray-400 hover:text-emerald-300 transition-colors px-2 py-1 rounded bg-black/40 border border-gray-800"
                              >
                                {copiedId === (f.id || `${idx}`) ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                                <span>{copiedId === (f.id || `${idx}`) ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>
                            <pre className="text-xs font-mono text-emerald-200 bg-black/70 p-3 rounded-lg overflow-x-auto border border-emerald-950/60">
                              {f.suggested_fix}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Trace Content */}
              {activeTab === 'trace' && (
                <div className="p-6 space-y-4">
                  <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-900/50 text-xs text-emerald-300 font-mono">
                    The autonomous agent loop executed {run.agent_trace?.length || 0} tool calls during this test review.
                  </div>

                  {run.agent_trace?.map((step, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-gray-950/80 border border-gray-800 space-y-3 font-mono text-xs"
                    >
                      <div className="flex items-center justify-between text-gray-300 border-b border-gray-800/80 pb-2">
                        <span className="flex items-center space-x-2 font-bold text-emerald-400">
                          <Terminal className="w-4 h-4 text-emerald-400" />
                          <span>Step {step.step}: Invoked Tool [{step.tool}]</span>
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {new Date(step.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      <div>
                        <span className="text-gray-400 font-semibold block mb-1">Tool Input:</span>
                        <pre className="p-2.5 rounded-lg bg-black/70 text-gray-300 overflow-x-auto border border-gray-800">
                          {JSON.stringify(step.input, null, 2)}
                        </pre>
                      </div>

                      <div>
                        <span className="text-emerald-400 font-semibold block mb-1">Tool Execution Output:</span>
                        <pre className="p-2.5 rounded-lg bg-black/70 text-emerald-200 overflow-x-auto border border-emerald-950">
                          {JSON.stringify(step.output, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Snippet Content */}
              {activeTab === 'snippet' && (
                <div className="p-6">
                  <div className="rounded-xl bg-black/70 border border-gray-800 p-4 font-mono text-xs overflow-x-auto">
                    <pre className="text-emerald-300 leading-relaxed whitespace-pre-wrap">
                      {run.input_snippet}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-gray-800/80 py-6 text-center text-xs text-gray-500 font-mono">
        DevGuard AI • Autonomous PR Review & Security Agent
      </footer>
    </div>
  );
}
