import React from 'react';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  className = '',
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={title}
      className={`p-10 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 text-center flex flex-col items-center justify-center max-w-lg mx-auto ${className}`}
    >
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center mb-4 text-emerald-400">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-slate-100 tracking-tight">{title}</h3>
      <p className="text-sm text-slate-400 mt-1.5 leading-relaxed max-w-md">{description}</p>
      {actionLabel && (actionHref || onAction) && (
        <div className="mt-6">
          {actionHref ? (
            <a
              href={actionHref}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm inline-flex items-center justify-center hover:bg-emerald-400 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              {actionLabel}
            </a>
          ) : (
            <Button variant="primary" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
