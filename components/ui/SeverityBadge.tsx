import React from 'react';
import { ShieldAlert, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

export type SeverityType = 'critical' | 'warning' | 'info' | 'clean' | 'none';

export function SeverityBadge({
  severity,
  className = '',
  showIcon = true,
}: {
  severity: SeverityType | string;
  className?: string;
  showIcon?: boolean;
}) {
  const normalized = (severity || 'info').toLowerCase();

  switch (normalized) {
    case 'critical':
      return (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold font-mono tracking-wider bg-rose-500/15 border border-rose-500/40 text-rose-300 ${className}`}
        >
          {showIcon && <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-rose-400 shrink-0" aria-hidden="true" />}
          CRITICAL
        </span>
      );
    case 'warning':
      return (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold font-mono tracking-wider bg-amber-500/15 border border-amber-500/40 text-amber-300 ${className}`}
        >
          {showIcon && <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-amber-400 shrink-0" aria-hidden="true" />}
          WARNING
        </span>
      );
    case 'clean':
    case 'none':
      return (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold font-mono tracking-wider bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 ${className}`}
        >
          {showIcon && <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-400 shrink-0" aria-hidden="true" />}
          PASSED
        </span>
      );
    case 'info':
    default:
      return (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold font-mono tracking-wider bg-sky-500/15 border border-sky-500/40 text-sky-300 ${className}`}
        >
          {showIcon && <Info className="w-3.5 h-3.5 mr-1.5 text-sky-400 shrink-0" aria-hidden="true" />}
          INFO
        </span>
      );
  }
}
