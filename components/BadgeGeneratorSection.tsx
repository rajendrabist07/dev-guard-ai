'use client';

import { useState } from 'react';
import { Repo } from '@/lib/db/types';
import { ShieldCheck, Copy, Check } from 'lucide-react';

interface BadgeGeneratorSectionProps {
  repos: Repo[];
}

export default function BadgeGeneratorSection({ repos }: BadgeGeneratorSectionProps) {
  const [selectedRepoId, setSelectedRepoId] = useState<string>(repos[0]?.id || 'demo');
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://dev-guard-ai.vercel.app';

  const selectedRepo = repos.find((r) => r.id === selectedRepoId);
  const repoSlug = selectedRepo ? selectedRepo.id : 'demo';

  const statusBadgeUrl = `${baseUrl}/api/badge/${repoSlug}`;
  const poweredByBadgeUrl = `${baseUrl}/api/badge/powered-by`;

  const statusMarkdown = `[![DevGuard AI Status](${statusBadgeUrl})](${baseUrl})`;
  const poweredByMarkdown = `[![Powered by DevGuard AI](${poweredByBadgeUrl})](${baseUrl})`;

  const copyToClipboard = async (text: string, typeKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(typeKey);
      setTimeout(() => setCopiedType(null), 2000);
    } catch (err) {
      console.error('Failed to copy badge snippet:', err);
    }
  };

  return (
    <div className="rounded-2xl bg-gray-900/60 border border-gray-800/80 p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Public README Badges</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Shields.io Compatible
              </span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Embed real-time security verification badges directly in your repository README files.
            </p>
          </div>
        </div>

        {repos.length > 1 && (
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400 font-mono">Select Repo:</span>
            <select
              value={selectedRepoId}
              onChange={(e) => setSelectedRepoId(e.target.value)}
              className="bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-500"
            >
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Badge Option 1: Live Status Badge */}
        <div className="p-4 rounded-xl bg-gray-950/70 border border-gray-800/80 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white font-mono">1. Live Security Status Badge</span>
              <span className="text-[10px] text-emerald-400 font-mono">Dynamic SVG</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Reflects live PR findings count (0 critical, warnings, or monitoring state).
            </p>
          </div>

          <div className="py-2 flex items-center justify-center bg-gray-900/50 rounded-lg border border-gray-800">
            {/* Direct preview of the SVG route */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={statusBadgeUrl} alt="DevGuard AI Badge Preview" className="h-5" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono">
              <span>Markdown Embed</span>
              <button
                onClick={() => copyToClipboard(statusMarkdown, 'status-md')}
                className="flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 font-semibold"
              >
                {copiedType === 'status-md' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Markdown</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-2.5 rounded-lg bg-black/60 border border-gray-800/80 text-[10px] text-gray-300 overflow-x-auto font-mono">
              {statusMarkdown}
            </pre>
          </div>
        </div>

        {/* Badge Option 2: Powered By Footer Badge */}
        <div className="p-4 rounded-xl bg-gray-950/70 border border-gray-800/80 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white font-mono">2. &quot;Powered by DevGuard&quot; Badge</span>
              <span className="text-[10px] text-cyan-400 font-mono">Footer / Brand</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Static verification badge for open-source project README footers.
            </p>
          </div>

          <div className="py-2 flex items-center justify-center bg-gray-900/50 rounded-lg border border-gray-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={poweredByBadgeUrl} alt="Powered by DevGuard AI" className="h-5" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono">
              <span>Markdown Embed</span>
              <button
                onClick={() => copyToClipboard(poweredByMarkdown, 'powered-md')}
                className="flex items-center space-x-1 text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                {copiedType === 'powered-md' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Markdown</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-2.5 rounded-lg bg-black/60 border border-gray-800/80 text-[10px] text-gray-300 overflow-x-auto font-mono">
              {poweredByMarkdown}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
