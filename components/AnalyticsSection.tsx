'use client';

import { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { AnalyticsData, ToolSourceBreakdown } from '@/lib/db/types';
import { TrendingUp, PieChart as PieIcon, ShieldCheck, Sparkles } from 'lucide-react';

interface AnalyticsSectionProps {
  analytics?: AnalyticsData;
  loading?: boolean;
}

export default function AnalyticsSection({ analytics, loading = false }: AnalyticsSectionProps) {
  const [activeChartTab, setActiveChartTab] = useState<'timeline' | 'sources'>('timeline');

  const timeline = analytics?.timeline ?? [];
  const toolSources = analytics?.toolSources ?? [];
  const hasEnoughData = Boolean(analytics?.hasEnoughData && (timeline.length > 0 || toolSources.length > 0));

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-950/95 border border-gray-800 p-3 rounded-xl shadow-xl font-mono text-xs space-y-1.5 backdrop-blur-md">
          <p className="text-gray-200 font-bold mb-1 border-b border-gray-800 pb-1">{label}</p>
          {payload.map((entry, index) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="capitalize">{entry.name}:</span>
              </span>
              <span className="font-bold text-white">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const CustomPieTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ToolSourceBreakdown }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-gray-950/95 border border-gray-800 p-3 rounded-xl shadow-xl font-mono text-xs space-y-1 backdrop-blur-md">
          <p className="text-white font-bold">{data.name}</p>
          <div className="flex items-center justify-between gap-4 text-gray-300">
            <span>Findings:</span>
            <span className="font-bold text-emerald-400">{data.count}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-gray-300">
            <span>Share:</span>
            <span className="font-bold text-cyan-400">{data.percentage}%</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">Security Findings Analytics & Trends</h2>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Empirical telemetry showing vulnerability frequency, AST linter flags, and review velocity over time
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-gray-900 border border-gray-800 rounded-xl p-1 self-start sm:self-center">
          <button
            onClick={() => setActiveChartTab('timeline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeChartTab === 'timeline'
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Timeline</span>
          </button>
          <button
            onClick={() => setActiveChartTab('sources')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeChartTab === 'sources'
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <PieIcon className="w-3.5 h-3.5" />
            <span>Tool Breakdown</span>
          </button>
        </div>
      </div>

      {/* Main Analytics Container */}
      <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-5 sm:p-6 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-xs font-mono space-y-3">
            <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <div>Aggregating review analytics & trend data...</div>
          </div>
        ) : !hasEnoughData ? (
          <div className="py-12 px-4 text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">Collecting Telemetry for Visual Analytics</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Charts automatically plot severity trends (Critical, Warning, Info) and tool attribution (AST Linter vs OSV CVEs vs Tests) as PR reviews are processed on your connected repositories.
            </p>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400/90 bg-emerald-950/40 border border-emerald-800/50 px-3 py-1.5 rounded-xl">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Real-time Supabase telemetry tracking enabled</span>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Chart Render */}
            {activeChartTab === 'timeline' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
                  <span>Findings by Severity (30-Day Window)</span>
                  <div className="flex items-center space-x-3 text-[11px]">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded bg-rose-500" /> Critical
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded bg-amber-500" /> Warning
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded bg-cyan-500" /> Info
                    </span>
                  </div>
                </div>

                <div className="w-full h-64 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                      <XAxis dataKey="date" stroke="#6b7280" fontSize={11} tickLine={false} />
                      <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="critical" name="Critical" fill="#f43f5e" stackId="a" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="warning" name="Warning" fill="#f59e0b" stackId="a" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="info" name="Info" fill="#06b6d4" stackId="a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
                  <span>Empirical Findings Attribution by Tool</span>
                  <span>{analytics?.totalFindingsAnalyzed ?? 0} Total Verified Findings</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="w-full h-56 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={toolSources}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={4}
                          dataKey="count"
                        >
                          {toolSources.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="#111827" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomPieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Tool Source Legend & Percentages */}
                  <div className="space-y-3">
                    {toolSources.map((item) => (
                      <div
                        key={item.tool}
                        className="p-3 rounded-xl bg-gray-950/60 border border-gray-800/80 flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-2.5">
                          <span className="w-3 h-3 rounded-md flex-shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-xs font-semibold text-gray-200">{item.name}</span>
                        </div>
                        <div className="flex items-center space-x-3 text-xs font-mono">
                          <span className="text-gray-400">{item.count} findings</span>
                          <span className="font-bold px-2 py-0.5 rounded bg-gray-800" style={{ color: item.color }}>
                            {item.percentage}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
