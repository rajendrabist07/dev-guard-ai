'use client';

import { useState } from 'react';
import { X, Play, Loader2, Cpu, CheckCircle2 } from 'lucide-react';
import { AgentTraceStep, Finding } from '@/lib/db/types';

interface SimulateReviewModalProps {
  onClose: () => void;
  onSimulationComplete: (reviewRunId: string) => void;
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
  error?: string;
}

export default function SimulateReviewModal({ onClose, onSimulationComplete }: SimulateReviewModalProps) {
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customTitle, setCustomTitle] = useState(PRESET_DIFFS[0].prTitle);
  const [customAuthor, setCustomAuthor] = useState(PRESET_DIFFS[0].author);
  const [customDiff, setCustomDiff] = useState(PRESET_DIFFS[0].diff);

  const [isLoading, setIsLoading] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);

  const handleSelectPreset = (idx: number) => {
    setSelectedPreset(idx);
    setCustomTitle(PRESET_DIFFS[idx].prTitle);
    setCustomAuthor(PRESET_DIFFS[idx].author);
    setCustomDiff(PRESET_DIFFS[idx].diff);
  };

  const handleRunSimulation = async () => {
    setIsLoading(true);
    setSimulationResult(null);

    try {
      const res = await fetch('/api/simulate-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prTitle: customTitle,
          prAuthor: customAuthor,
          diff: customDiff,
          fileNames: PRESET_DIFFS[selectedPreset]?.files || ['src/index.ts'],
        }),
      });

      const data = await res.json();
      setSimulationResult(data);
      if (data.success && data.reviewRunId) {
        onSimulationComplete(data.reviewRunId);
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

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
              <p className="text-xs text-gray-400">Test the multi-step linter, vulnerability scanner, and test runner loop</p>
            </div>
          </div>
          <button
            onClick={onClose}
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
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedPreset === idx
                      ? 'bg-emerald-950/40 border-emerald-500/60 text-white shadow-sm'
                      : 'bg-gray-950/40 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
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
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-gray-950 border border-gray-800 text-gray-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 block mb-1">PR Author:</label>
              <input
                type="text"
                value={customAuthor}
                onChange={(e) => setCustomAuthor(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-gray-950 border border-gray-800 text-gray-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Diff Editor */}
          <div>
            <label className="text-xs font-semibold text-gray-400 block mb-1">PR Diff Content:</label>
            <textarea
              rows={6}
              value={customDiff}
              onChange={(e) => setCustomDiff(e.target.value)}
              className="w-full p-3 text-xs font-mono rounded-lg bg-gray-950 border border-gray-800 text-emerald-300 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Results preview if finished */}
          {simulationResult && (
            simulationResult.error ? (
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/80 space-y-2 font-mono text-xs">
                <div className="flex items-center space-x-2 text-rose-400 font-bold">
                  <span>Simulation Error:</span>
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
                  <span className="text-rose-400 font-bold">{simulationResult.findings?.length || 0}</span> code & security findings.
                </p>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-950 border-t border-gray-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRunSimulation}
            disabled={isLoading}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-500 transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Agent Reasoning & Calling Tools...</span>
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
