'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CodeBlock({
  code,
  language = 'typescript',
  filename,
  highlightLines = [],
  className = '',
}: {
  code: string;
  language?: string;
  filename?: string;
  highlightLines?: number[];
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.trim().split('\n');

  return (
    <div className={`rounded-xl border border-slate-800 bg-[#060911] overflow-hidden ${className}`}>
      {filename && (
        <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-950/80 flex items-center justify-between text-xs font-mono text-slate-300">
          <span className="font-semibold">{filename}</span>
          <span className="text-[11px] text-slate-500 uppercase">{language}</span>
        </div>
      )}
      <div className="relative group">
        <button
          onClick={handleCopy}
          aria-label={copied ? 'Code copied' : 'Copy code to clipboard'}
          className="min-h-[44px] min-w-[44px] absolute top-2 right-2 p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white opacity-80 group-hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 flex items-center justify-center"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
        <pre className="p-4 overflow-x-auto text-xs font-mono leading-relaxed text-slate-200">
          <code>
            {lines.map((line, idx) => {
              const lineNum = idx + 1;
              const isHighlighted = highlightLines.includes(lineNum);
              return (
                <div
                  key={idx}
                  className={`flex ${isHighlighted ? 'bg-rose-500/15 -mx-4 px-4 border-l-2 border-rose-500' : ''}`}
                >
                  <span className="select-none text-slate-600 w-8 inline-block text-right pr-4 shrink-0 font-mono text-[11px]">
                    {lineNum}
                  </span>
                  <span className="flex-1 whitespace-pre">{line}</span>
                </div>
              );
            })}
          </code>
        </pre>
      </div>
    </div>
  );
}
