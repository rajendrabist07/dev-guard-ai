'use client';

import { useState, useEffect } from 'react';
import { X, Play, Loader2, Cpu, CheckCircle2, AlertCircle } from 'lucide-react';
import { AgentTraceStep, DisplayReviewRun, Finding } from '@/lib/db/types';

interface SimulateReviewModalProps {
  onClose: () => void;
  onSimulationComplete: (reviewRunId: string, findings?: Finding[], run?: DisplayReviewRun) => void;
  autoRun?: boolean;
}

const PRESET_DIFFS = [
  {
    name: '🚨 SQL Injection & Vulnerable Axios Dependency',
    prTitle: 'feat: add payment checkout handler and update network client',
    author: 'developer-alex',
    files: ['app/api/checkout/route.ts', 'package.json'],
    diff: `--- a/app/api/checkout/route.ts
+++ b/app/api/checkout/route.ts
@@ -34,6 +34,8 @@ export async function POST(req: Request) {
+  const { userId } = await req.json();
+  // UNSAFE QUERY
+  const user = await db.raw("SELECT * FROM users WHERE id = '" + userId + "'");
+  await fetch('http://payment-gateway.internal/charge');

--- a/package.json
+++ b/package.json
@@ -12,3 +12,4 @@
+    "axios": "0.19.0",
+    "lodash": "4.17.15"`,
  },
  {
    name: '⚠️ Unhandled Promises & Missing Auth Token Check',
    prTitle: 'fix: refresh auth session and invoke user profile sync',
    author: 'dev-sarah',
    files: ['lib/auth/session.ts'],
    diff: `--- a/lib/auth/session.ts
+++ b/lib/auth/session.ts
@@ -18,4 +18,6 @@ export async function refreshSession() {
+  // Missing try/catch around external fetch
+  const res = await fetch('/api/v1/auth/refresh');
+  const token = await res.json();
+  document.cookie = "token=" + token;`,
  },
];

interface SimulationResult {
  success?: boolean;
  reviewRunId?: string;
  providerUsed?: string;
  toolCallsCount?: number;
  trace?: AgentTraceStep[];
  findings?: Finding[];
  summary?: string;
  error?: string;
}

export default function SimulateReviewModal({
  onClose,
  onSimulationComplete,
  autoRun = false,
}: SimulateReviewModalProps) {
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customTitle, setCustomTitle] = useState(PRESET_DIFFS[0].prTitle);
  const [customAuthor, setCustomAuthor] = useState(PRESET_DIFFS[0].author);
  const [customDiff, setCustomDiff] = useState(PRESET_DIFFS[0].diff);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('Initializing Agent Orchestrator...');
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);

  const handleSelectPreset = (idx: number) => {
    setSelectedPreset(idx);
    setCustomTitle(PRESET_DIFFS[idx].prTitle);
    setCustomAuthor(PRESET_DIFFS[idx].author);
    setCustomDiff(PRESET_DIFFS[idx].diff);
  };

  const executeSimulation = async () => {
    setIsLoading(true);
    setSimulationResult(null);
    setLoadingStep('Step 1/4: Initializing Agent Loop & AST Linter...');

    const stepTimer1 = setTimeout(() => {
      setLoadingStep('Step 2/4: Querying OSV.dev Dependency Vulnerability Database...');
    }, 2500);

    const stepTimer2 = setTimeout(() => {
      setLoadingStep('Step 3/4: Executing Programmatic Test Suite Engine...');
    }, 5500);

    const stepTimer3 = setTimeout(() => {
      setLoadingStep('Step 4/4: Synthesizing Findings & Generating Suggested Code Fixes...');
    }, 8500);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000); // Strict 30s timeout to guarantee no infinite hanging

    try {
      const res = await fetch('/api/simulate-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          prTitle: customTitle,
          prAuthor: customAuthor,
          diff: customDiff,
          fileNames: PRESET_DIFFS[selectedPreset]?.files || ['src/index.ts'],
        }),
      });

      clearTimeout(timeoutId);
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || `Simulation request failed with status ${res.status}`);
      }

      setSimulationResult(data);

      if (data.success && data.reviewRunId) {
        const completedRun: DisplayReviewRun = {
          id: data.reviewRunId,
          repo_id: 'sim-repo',
          pr_number: Math.floor(Math.random() * 90) + 10,
          pr_title: customTitle,
          pr_author: customAuthor,
          commit_sha: Math.random().toString(36).substring(2, 10),
          status: 'completed',
          tool_calls_count: data.toolCallsCount || 3,
          agent_trace: data.trace || [],
          error_message: null,
          is_simulation: true,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };

        onSimulationComplete(data.reviewRunId, data.findings, completedRun);
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);

      console.error('Simulation execution error:', err);
      let errorMsg = 'Simulation execution encountered an error.';
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMsg = 'Simulation timed out after 30 seconds. Please check network connection and try again.';
        } else {
          errorMsg = err.message;
        }
      }
      setSimulationResult({ error: errorMsg });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (autoRun) {
      executeSimulation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between bg-gray-950/80">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Simulate Autonomous Agent PR Review</h2>
              <p className="text-xs text-gray-400">Live multi-step linter, vulnerability scanner, and test runner loop</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Presets */}
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-2">Select Code Scenario Preset:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRESET_DIFFS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectPreset(idx)}
                  disabled={isLoading}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedPreset === idx
                      ? 'bg-emerald-950/40 border-emerald-500/60 text-white shadow-sm'
                      : 'bg-gray-950/40 border-gray-800 text-gray-400 hover:border-gray-700'
                  } disabled:opacity-50`}
                >
                  <div className="text-xs font-bold text-emerald-300 mb-1">{preset.name}</div>
                  <div className="text-[11px] text-gray-400 truncate">{preset.prTitle}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 block mb-1">PR Title:</label>
              <input
                type="text"
                value={customTitle}
                disabled={isLoading}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-gray-950 border border-gray-800 text-gray-200 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 block mb-1">PR Author:</label>
              <input
                type="text"
                value={customAuthor}
                disabled={isLoading}
                onChange={(e) => setCustomAuthor(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-gray-950 border border-gray-800 text-gray-200 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>

          {/* Diff Editor */}
          <div>
            <label className="text-xs font-semibold text-gray-400 block mb-1">PR Diff Content:</label>
            <textarea
              rows={6}
              value={customDiff}
              disabled={isLoading}
              onChange={(e) => setCustomDiff(e.target.value)}
              className="w-full p-3 text-xs font-mono rounded-lg bg-gray-950 border border-gray-800 text-emerald-300 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Active Loading Progress Indicator */}
          {isLoading && (
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/60 space-y-3">
              <div className="flex items-center space-x-3 text-emerald-400 font-bold text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Agent Execution in Progress:</span>
              </div>
              <p className="text-xs text-gray-300 font-mono pl-7">{loadingStep}</p>
              <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full animate-pulse w-3/4" />
              </div>
            </div>
          )}

          {/* Results preview if finished or failed */}
          {simulationResult && !isLoading && (
            simulationResult.error ? (
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/80 space-y-2 font-mono text-xs">
                <div className="flex items-center space-x-2 text-rose-400 font-bold">
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                  <span>Simulation Error</span>
                </div>
                <p className="text-rose-200">{simulationResult.error}</p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/80 space-y-2 font-mono text-xs">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Simulation Complete! Provider: [{simulationResult.providerUsed}]</span>
                </div>
                <p className="text-gray-300">
                  Executed <span className="text-emerald-300 font-bold">{simulationResult.toolCallsCount}</span> tool iterations. Identified{' '}
                  <span className="text-rose-400 font-bold">{simulationResult.findings?.length || 0}</span> empirical code findings.
                </p>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-950 border-t border-gray-800 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={executeSimulation}
            disabled={isLoading}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-500 transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Running Agent Loop (Max 30s)...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 text-white fill-white" />
                <span>Run Agentic Review Loop</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
