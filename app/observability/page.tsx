'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import {
  Activity,
  CheckCircle2,
  RefreshCw,
  Server,
  Zap,
  Flame,
  Bug,
  ShieldCheck,
  Terminal,
  ExternalLink,
} from 'lucide-react';

interface ObservabilityData {
  systemStatus: 'healthy' | 'degraded';
  timestamp: string;
  sentryConfigured: boolean;
  metrics: {
    totalRunsProcessed: number;
    activeWebhooks: number;
    interactiveTryRuns: number;
    modelFallbacksTriggered: number;
    failedRunsCount: number;
    osvCacheHitRate: number;
    totalCacheLookups: number;
    totalCacheHits: number;
  };
  fallbackEvents: Array<{
    id: string;
    pr: string;
    provider: string;
    reason: string;
    timestamp: string;
  }>;
  recentLogs: Array<{
    id: string;
    timestamp: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    error?: string;
    context?: Record<string, unknown>;
  }>;
  errorCount: number;
  warnCount: number;
}

export default function ObservabilityPage() {
  const [data, setData] = useState<ObservabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTelemetry = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/observability');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect to observability telemetry endpoint');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#080b11] text-gray-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-300">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Operator Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gray-900/80 border border-gray-800 p-6 rounded-2xl">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              <h1 className="text-xl font-bold text-white tracking-tight">System Observability & Operator Telemetry</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                LIVE
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Real-time runtime state, structured logs, model rate-limit fallbacks, and Sentry error health.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchTelemetry}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-300 flex items-center space-x-1.5 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <a
              href="https://sentry.io"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white flex items-center space-x-1.5 shadow-lg shadow-indigo-600/20 transition-all"
            >
              <span>Open Sentry Console</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Operational Health Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
              <span>System Health</span>
              <Server className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold text-white flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <span>{data?.systemStatus === 'healthy' ? 'Operational' : 'Degraded'}</span>
            </div>
            <div className="text-[11px] text-gray-400 font-mono">
              {data?.metrics.totalRunsProcessed ?? 0} total reviews processed
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
              <span>Model Fallbacks Triggered</span>
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-extrabold text-amber-400 font-mono">
              {data?.metrics.modelFallbacksTriggered ?? 0}
            </div>
            <div className="text-[11px] text-gray-400 font-mono">Groq 429 ➡️ Gemini 2.5 Flash</div>
          </div>

          <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
              <span>OSV.dev Cache Hit Rate</span>
              <Flame className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-extrabold text-cyan-400 font-mono">
              {data?.metrics.osvCacheHitRate ?? 0}%
            </div>
            <div className="text-[11px] text-gray-400 font-mono">
              {data?.metrics.totalCacheHits ?? 0} / {data?.metrics.totalCacheLookups ?? 0} lookups cached
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
              <span>Sentry Error Tracking</span>
              <Bug className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-extrabold text-white flex items-center gap-1.5">
              {data?.sentryConfigured ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="text-emerald-400 text-lg">Active</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5 text-cyan-400" />
                  <span className="text-cyan-400 text-lg">Standby</span>
                </>
              )}
            </div>
            <div className="text-[11px] text-gray-400 font-mono">
              {data?.errorCount ?? 0} errors logged in buffer
            </div>
          </div>
        </div>

        {/* Model Fallbacks Log */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white">Multi-Tier Model Fallback Log</h2>
            </div>
            <span className="text-[11px] text-gray-400 font-mono">Auto Rate-Limit Recovery</span>
          </div>

          {(!data?.fallbackEvents || data.fallbackEvents.length === 0) ? (
            <div className="py-8 text-center text-xs text-gray-500 font-mono bg-gray-950/40 rounded-xl border border-gray-800/50">
              0 model fallbacks triggered in current session. Groq Llama 3.3 70B operating smoothly within rate limits.
            </div>
          ) : (
            <div className="divide-y divide-gray-800/60 font-mono text-xs">
              {data.fallbackEvents.map((fb, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-gray-200 font-semibold">{fb.pr}</span>
                    <p className="text-gray-500 text-[11px]">{fb.reason}</p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 text-[10px] font-bold">
                      {fb.provider}
                    </span>
                    <div className="text-[10px] text-gray-500 mt-0.5">{new Date(fb.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Structured Logs Stream */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white">Live Structured JSON Ring Buffer Logs</h2>
            </div>
            <span className="text-[11px] text-gray-500 font-mono">Auto-redacted credentials</span>
          </div>

          {(!data?.recentLogs || data.recentLogs.length === 0) ? (
            <div className="py-8 text-center text-xs text-gray-500 font-mono bg-gray-950/40 rounded-xl border border-gray-800/50">
              No recent logs in buffer. Run a review on /try or trigger a webhook to stream events.
            </div>
          ) : (
            <div className="space-y-2 font-mono text-xs max-h-96 overflow-y-auto pr-2">
              {data.recentLogs.map((log) => {
                const badgeColor =
                  log.level === 'error'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : log.level === 'warn'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';

                return (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-gray-950/80 border border-gray-800/80 space-y-1 hover:border-gray-700 transition-colors"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-bold ${badgeColor}`}>
                          {log.level}
                        </span>
                        <span className="text-gray-300 font-semibold">{log.message}</span>
                      </div>
                      <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>

                    {log.error && (
                      <div className="text-rose-400 text-[11px] pl-2 border-l border-rose-500/40 mt-1">
                        {log.error}
                      </div>
                    )}

                    {log.context && Object.keys(log.context).length > 0 && (
                      <div className="text-[10px] text-gray-500 bg-gray-900/60 p-1.5 rounded-lg overflow-x-auto mt-1">
                        {JSON.stringify(log.context)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
