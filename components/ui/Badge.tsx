import React from 'react';

export type BadgeVariant =
  | 'emerald'
  | 'blue'
  | 'amber'
  | 'rose'
  | 'slate'
  | 'purple'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'outline';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

export function Badge({
  children,
  variant = 'slate',
  size = 'md',
  className = '',
  ...props
}: BadgeProps) {
  const variantClasses: Record<BadgeVariant, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    blue: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    danger: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    slate: 'bg-slate-800 text-slate-300 border-slate-700',
    outline: 'bg-transparent text-slate-300 border-slate-700 hover:border-slate-600',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 rounded-md font-medium font-mono',
    md: 'text-xs px-2.5 py-1 rounded-full font-semibold font-mono',
  };

  return (
    <span
      className={`inline-flex items-center border tracking-wide select-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
