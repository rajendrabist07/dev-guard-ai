import React from 'react';

export interface StepItem {
  id: string;
  label: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  durationMs?: number;
}

interface StepperProps {
  steps: StepItem[];
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function Stepper({ steps, orientation = 'horizontal', className = '' }: StepperProps) {
  return (
    <nav aria-label="Progress" className={className}>
      <ol
        className={
          orientation === 'horizontal'
            ? 'flex items-center w-full gap-2 overflow-x-auto py-2'
            : 'flex flex-col space-y-4'
        }
      >
        {steps.map((step, idx) => {
          const isCompleted = step.status === 'completed';
          const isInProgress = step.status === 'in_progress';
          const isFailed = step.status === 'failed';
          const isLast = idx === steps.length - 1;

          return (
            <li
              key={step.id}
              className={
                orientation === 'horizontal'
                  ? 'flex items-center gap-2 flex-1 min-w-[140px]'
                  : 'flex items-start gap-3'
              }
              aria-current={isInProgress ? 'step' : undefined}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    isCompleted
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : isInProgress
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500 animate-pulse'
                      : isFailed
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                  aria-hidden="true"
                >
                  {isCompleted ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isFailed ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : isInProgress ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </span>

                <div className="flex flex-col">
                  <span
                    className={`text-sm font-medium ${
                      isInProgress
                        ? 'text-sky-300 font-semibold'
                        : isCompleted
                        ? 'text-slate-200'
                        : isFailed
                        ? 'text-rose-300'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                    <span className="sr-only">
                      {isCompleted ? ' (Completed)' : isInProgress ? ' (In progress)' : isFailed ? ' (Failed)' : ' (Pending)'}
                    </span>
                  </span>
                  {step.description && (
                    <span className="text-xs text-slate-400">{step.description}</span>
                  )}
                  {step.durationMs !== undefined && step.durationMs > 0 && (
                    <span className="text-[11px] font-mono text-slate-400 mt-0.5">
                      {step.durationMs > 1000 ? `${(step.durationMs / 1000).toFixed(1)}s` : `${step.durationMs}ms`}
                    </span>
                  )}
                </div>
              </div>

              {orientation === 'horizontal' && !isLast && (
                <div
                  className={`h-0.5 flex-1 mx-2 min-w-[20px] transition-colors ${
                    isCompleted ? 'bg-emerald-500/50' : 'bg-slate-800'
                  }`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
