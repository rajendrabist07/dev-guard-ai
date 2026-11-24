'use client';

import React, { useState } from 'react';
import { ShieldAlert, CheckCircle2, Copy, Check } from 'lucide-react';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { Badge } from '@/components/ui/Badge';

export function PrCommentPreview() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`### 🛡️ DevGuard AI Review Summary
**Verdict:** 🛑 Changes Requested (1 Critical, 0 Warnings)

#### 🚨 Finding 1: SQL Injection via Dynamic Template String Interpolation
- **Rule / CWE:** [CWE-89](https://cwe.mitre.org/data/definitions/89.html) (SQL Injection)
- **Severity:** CRITICAL
- **Location:** \`lib/db/queries.ts:24\`
- **Tool Evidence:** \`ast_security_analyzer\` (Identifier \`tableName\` interpolated into raw SQL template)

\`\`\`diff
- const query = \`SELECT * FROM users WHERE status = '\${status}'\`;
+ const query = 'SELECT * FROM users WHERE status = $1';
+ const params = [status];
\`\`\`
`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto rounded-xl border border-slate-700/80 bg-slate-900/90 shadow-2xl overflow-hidden font-sans text-left">
      {/* GitHub PR Comment Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-slate-700">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="font-semibold text-sm text-slate-100">devguard-ai</span>
            <span className="text-xs px-1.5 py-0.5 rounded text-slate-300 bg-slate-700/60 font-mono">bot</span>
            <span className="text-xs text-slate-400">commented on pull request #42</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center space-x-1 px-2.5 py-1 rounded text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            aria-label="Copy markdown review comment"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Markdown'}</span>
          </button>
        </div>
      </div>

      {/* Comment Body */}
      <div className="p-5 sm:p-6 space-y-6 text-sm text-slate-200">
        {/* Executive Verdict Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-rose-950/30 border border-rose-900/50">
          <div className="flex items-center space-x-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
            <div>
              <p className="font-semibold text-rose-200 text-base">Verdict: Changes Requested</p>
              <p className="text-xs text-slate-400">1 Critical vulnerability detected by deterministic static rules.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SeverityBadge severity="critical" />
            <Badge variant="outline" className="text-xs text-slate-300">
              Verified by AST Linter
            </Badge>
          </div>
        </div>

        {/* Individual Finding Card */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <SeverityBadge severity="critical" />
              <span className="font-mono text-xs font-semibold text-rose-300">CWE-89: SQL Injection</span>
            </div>
            <span className="text-xs font-mono text-slate-400">lib/db/queries.ts:24</span>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed">
            Raw string interpolation inside database query allows untrusted SQL fragment execution. Parameterized queries or query-builder arguments must be used.
          </p>

          {/* Code Diff Box */}
          <div className="rounded-md border border-slate-800 bg-[#060911] p-3 font-mono text-xs overflow-x-auto">
            <div className="text-slate-400 text-[11px] pb-1 mb-1 border-b border-slate-800 flex justify-between">
              <span>lib/db/queries.ts</span>
              <span className="text-emerald-400">Deterministic Tool Fix</span>
            </div>
            <div className="text-rose-400 bg-rose-950/20 px-2 py-0.5 rounded">
              - const query = `SELECT * FROM users WHERE status = &apos;${'${status}'}&apos;`;
            </div>
            <div className="text-emerald-400 bg-emerald-950/20 px-2 py-0.5 rounded mt-0.5">
              + const query = &apos;SELECT * FROM users WHERE status = $1&apos;;
            </div>
            <div className="text-emerald-400 bg-emerald-950/20 px-2 py-0.5 rounded">
              + const result = await client.query(query, [status]);
            </div>
          </div>
        </div>

        {/* Passing Checks List */}
        <div className="pt-2 border-t border-slate-800/80">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Verified Invariants &amp; Deterministic Scans
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="flex items-center space-x-2 p-2 rounded bg-slate-800/40 border border-slate-800 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>OSV.dev Dependencies: Clean</span>
            </div>
            <div className="flex items-center space-x-2 p-2 rounded bg-slate-800/40 border border-slate-800 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Hardcoded Secrets: 0 Found</span>
            </div>
            <div className="flex items-center space-x-2 p-2 rounded bg-slate-800/40 border border-slate-800 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>CI Verification: Invariant OK</span>
            </div>
          </div>
        </div>

        {/* Footer Meta */}
        <div className="text-[11px] text-slate-400 pt-2 flex flex-wrap items-center justify-between gap-2">
          <span>Engine: AST Security Analyzer • Nonce-Isolated Prompt • Referential Validation</span>
          <span className="font-mono text-slate-400">Run latency: 284ms</span>
        </div>
      </div>
    </div>
  );
}
