'use client';

import React, { useEffect, useState, useMemo } from 'react';
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
  Search,
  Database,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  ObservabilityHealthState,
  getHealthStatusDisplay,
} from '@/lib/observability/health';

interface ObservabilityData {
  systemStatus: ObservabilityHealthState;
  statusReason?: string;
  timestamp: string;
  sentryConfigured: boolean;
  services?: {
    database: { configured: boolean; status: string; latencyMs?: number; error?: string };
    redis: { configured: boolean; status: string; latencyMs?: number };
  };
  metrics: {
    totalRunsProcessed: number;
    activeWebhooks: number;
    interactiveTryRuns: number;
    modelFallbacksTriggered: number;
    failedRunsCount: number;
    errorRatePercentage?: number;
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
  const [logSearch, setLogSearch] = useState('');
  const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');

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

  const filteredLogs = useMemo(() => {
    if (!data?.recentLogs) return [];
    return data.recentLogs.filter((log) => {
      const matchesLevel = logLevelFilter === 'all' || log.level === logLevelFilter;
      const matchesSearch =
        !logSearch ||
        log.message.toLowerCase().includes(logSearch.toLowerCase()) ||
        (log.error && log.error.toLowerCase().includes(logSearch.toLowerCase())) ||
        (log.context && JSON.stringify(log.context).toLowerCase().includes(logSearch.toLowerCase()));
      return matchesLevel && matchesSearch;
    });
  }, [data?.recentLogs, logLevelFilter, logSearch]);

  const healthDisplay = getHealthStatusDisplay(data?.systemStatus || 'no_data');

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-300">
      <Navbar />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 outline-none">
        {/* Operator Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              <h1 className="text-xl font-bold text-white tracking-tight">System Observability &amp; Operator Telemetry</h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                LIVE
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Real-time runtime state, database ping, queue health, model fallbacks, and ring buffer logs.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              onClick={fetchTelemetry}
              disabled={loading}
              className="text-xs font-semibold min-h-[44px]"
              aria-label="Refresh telemetry data"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            <a
              href="https://sentry.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              <Button variant="secondary" className="text-xs font-semibold min-h-[44px]">
                <span>Sentry Console</span>
                <ExternalLink className="w-3.5 h-3.5 ml-1.5 text-slate-400" />
              </Button>
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
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>System Health</span>
              <Server className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full animate-pulse ${healthDisplay.dotClass}`} />
              <span className={healthDisplay.colorClass}>{healthDisplay.label}</span>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              {data?.metrics?.totalRunsProcessed ?? 0} total reviews processed
            </div>
            {data?.statusReason && (
              <div className="text-xs text-slate-400 font-mono truncate">
                {data.statusReason}
              </div>
            )}
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Model Fallbacks</span>
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-extrabold text-amber-400 font-mono">
              {data?.metrics.modelFallbacksTriggered ?? 0}
            </div>
            <div className="text-xs text-slate-400 font-mono">Groq ➡️ Gemini Circuit Breaker</div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>OSV Cache Hit Rate</span>
              <Flame className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-extrabold text-cyan-400 font-mono">
              {data?.metrics.osvCacheHitRate ?? 0}%
            </div>
            <div className="text-xs text-slate-400 font-mono">
              {data?.metrics.totalCacheHits ?? 0} / {data?.metrics.totalCacheLookups ?? 0} cached
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Error Tracking</span>
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
                  <span className="text-cyan-400 text-lg">Local Ring Buffer</span>
                </>
              )}
            </div>
            <div className="text-xs text-slate-400 font-mono">
              {data?.errorCount ?? 0} errors logged in buffer
            </div>
          </div>
        </div>

        {/* Database & Redis Microservice Latencies */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-slate-800 text-emerald-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-white">Postgres (Supabase)</div>
                <div className="text-xs text-slate-400 font-mono">
                  Status: {data?.services?.database.status || 'Checking...'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono font-bold text-emerald-400">
                {data?.services?.database.latencyMs !== undefined ? `${data.services.database.latencyMs}ms` : 'Healthy'}
              </span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-slate-800 text-cyan-400">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-white">Redis (Upstash / Memory)</div>
                <div className="text-xs text-slate-400 font-mono">
                  Status: {data?.services?.redis.status || 'Checking...'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono font-bold text-cyan-400">
                {data?.services?.redis.latencyMs !== undefined ? `${data.services.redis.latencyMs}ms` : 'Healthy'}
              </span>
            </div>
          </div>
        </div>

        {/* Model Fallbacks Log */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white">Multi-Tier Model Fallback Log</h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">Auto Rate-Limit Recovery</span>
          </div>

          {!data?.fallbackEvents || data.fallbackEvents.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 font-mono bg-slate-950/40 rounded-xl border border-slate-800/50">
              {(data?.metrics?.totalRunsProcessed ?? 0) === 0
                ? 'No reviews processed yet. Model fallback events will be recorded here when primary provider encounters rate limits or errors.'
                : `0 model fallbacks triggered across ${data?.metrics?.totalRunsProcessed} review runs. Primary model handled all synthesis requests.`}
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60 font-mono text-xs">
              {data.fallbackEvents.map((fb, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-slate-200 font-semibold">{fb.pr}</span>
                    <p className="text-slate-400 text-xs">{fb.reason}</p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 text-xs font-bold">
                      {fb.provider}
                    </span>
                    <div className="text-xs text-slate-400 mt-0.5">{new Date(fb.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Searchable Structured Logs Stream */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white">Searchable Ring Buffer Logs</h2>
              <span className="text-xs text-slate-400 font-mono">Redacted credentials</span>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-48">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 min-h-[44px] text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-400"
                  aria-label="Filter logs by keyword"
                />
              </div>

              <select
                value={logLevelFilter}
                onChange={(e) => setLogLevelFilter(e.target.value as 'all' | 'error' | 'warn' | 'info')}
                className="px-2.5 py-1.5 min-h-[44px] text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-cyan-400"
                aria-label="Filter logs by severity level"
              >
                <option value="all">All Levels</option>
                <option value="error">Errors Only</option>
                <option value="warn">Warnings</option>
                <option value="info">Info</option>
              </select>
            </div>
          </div>

          {!filteredLogs || filteredLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 font-mono bg-slate-950/40 rounded-xl border border-slate-800/50">
              No matching logs in buffer.
            </div>
          ) : (
            <div className="space-y-2 font-mono text-xs max-h-96 overflow-y-auto pr-2">
              {filteredLogs.map((log) => {
                const badgeColor =
                  log.level === 'error'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : log.level === 'warn'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';

                return (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded border text-xs uppercase font-bold ${badgeColor}`}>
                          {log.level}
                        </span>
                        <span className="text-slate-200 font-semibold">{log.message}</span>
                      </div>
                      <span className="text-slate-400 text-xs">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>

                    {log.error && (
                      <div className="text-rose-400 text-xs pl-2 border-l border-rose-500/40 mt-1">
                        {log.error}
                      </div>
                    )}

                    {log.context && Object.keys(log.context).length > 0 && (
                      <div className="text-xs text-slate-400 bg-slate-900/60 p-1.5 rounded-lg overflow-x-auto mt-1">
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
