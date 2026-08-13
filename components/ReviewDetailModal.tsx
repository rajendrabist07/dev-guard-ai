'use client';

import { useState } from 'react';
import { DisplayReviewRun, Finding } from '@/lib/db/types';
import { X, ShieldAlert, AlertTriangle, Info, Terminal, CheckCircle2, Copy, Check, Cpu, Code2 } from 'lucide-react';

interface ReviewDetailModalProps {
  run: DisplayReviewRun | null;
  findings: Finding[];
  onClose: () => void;
}

export default function ReviewDetailModal({ run, findings, onClose }: ReviewDetailModalProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'findings' | 'trace'>('findings');

  if (!run) return null;

  const copyFix = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getSeverityBadge = (severity: string) => {
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
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 border border-blue-500/30 text-blue-400">
            <Info className="w-3 h-3 mr-1 text-blue-400" />
            INFO
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between bg-gray-950/60">
          <div>
            <div className="flex items-center space-x-3">
              <span className="font-mono text-xs px-2.5 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700">
                PR #{run.pr_number}
              </span>
              <h2 className="text-lg font-bold text-white tracking-tight">{run.pr_title ?? `PR #${run.pr_number}`}</h2>
            </div>
            <p className="text-xs text-gray-400 mt-1 font-mono">
              Author: <span className="text-emerald-400 font-semibold">{run.pr_author ?? 'unknown'}</span> - Commit: {run.commit_sha.substring(0, 7)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-gray-800 bg-gray-900/50 flex space-x-6">
          <button
            onClick={() => setActiveTab('findings')}
            className={`py-3 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
              activeTab === 'findings'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Findings ({findings.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('trace')}
            className={`py-3 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
              activeTab === 'trace'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Agent Tool Execution Trace ({run.agent_trace?.length || 0} steps)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'findings' && (
            <div>
              {findings.length === 0 ? (
                <div className="text-center py-12 bg-gray-950/40 rounded-xl border border-gray-800">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                  <h3 className="text-base font-medium text-white">All Checks Passed Cleanly!</h3>
                  <p className="text-xs text-gray-400 mt-1">No security vulnerabilities or AST lint errors detected.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {findings.map((f) => (
                    <div
                      key={f.id}
                      className="p-4 rounded-xl bg-gray-950/60 border border-gray-800 hover:border-gray-700 transition-all space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          {getSeverityBadge(f.severity)}
                          <span className="font-mono text-xs text-emerald-300 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900">
                            {f.file_path}:{f.line}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-500 font-mono">Source: {f.tool_source}</span>
                      </div>

                      <p className="text-sm text-gray-200 font-medium leading-relaxed">{f.message}</p>

                      {f.suggested_fix && (
                        <div className="mt-2 rounded-lg bg-gray-900 border border-gray-800 p-3 space-y-2">
                          <div className="flex items-center justify-between text-xs text-emerald-400 font-mono font-medium">
                            <span className="flex items-center gap-1.5">
                              <Code2 className="w-3.5 h-3.5" /> Suggested Fix:
                            </span>
                            <button
                              onClick={() => copyFix(f.id, f.suggested_fix!)}
                              className="flex items-center space-x-1 text-gray-400 hover:text-emerald-300 transition-colors"
                            >
                              {copiedId === f.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              <span>{copiedId === f.id ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                          <pre className="text-xs font-mono text-emerald-200 bg-black/50 p-2.5 rounded overflow-x-auto border border-emerald-950/50">
                            {f.suggested_fix}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'trace' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-900/50 text-xs text-emerald-300 font-mono">
                The agent autonomous loop executed {run.agent_trace?.length || 0} tool calls to gather empirical evidence before outputting review decisions.
              </div>

              {run.agent_trace?.map((step, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-gray-950/70 border border-gray-800 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between text-gray-300 border-b border-gray-800/80 pb-2">
                    <span className="flex items-center space-x-2 font-bold text-emerald-400">
                      <Terminal className="w-4 h-4 text-emerald-400" />
                      <span>Step {step.step}: Invoked tool [{step.tool}]</span>
                    </span>
                    <span className="text-[10px] text-gray-500">{new Date(step.timestamp).toLocaleTimeString()}</span>
                  </div>

                  <div>
                    <span className="text-gray-400 font-semibold block mb-1">Tool Input:</span>
                    <pre className="p-2 rounded bg-black/60 text-gray-300 overflow-x-auto border border-gray-800">
                      {JSON.stringify(step.input, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <span className="text-emerald-400 font-semibold block mb-1">Tool Execution Output:</span>
                    <pre className="p-2 rounded bg-black/60 text-emerald-200 overflow-x-auto border border-emerald-950">
                      {JSON.stringify(step.output, null, 2)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-gray-950 border-t border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-800 text-gray-200 text-xs font-semibold hover:bg-gray-700 transition-colors"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
