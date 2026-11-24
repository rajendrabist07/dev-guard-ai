import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    // 44px minimum touch target
    const sizeClasses = {
      sm: 'min-h-[44px] px-3.5 py-2 text-xs',
      md: 'min-h-[44px] px-5 py-2.5 text-sm',
      lg: 'min-h-[48px] px-6 py-3 text-base',
    };

    const variantClasses = {
      primary:
        'bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 active:bg-emerald-600 shadow-sm shadow-emerald-950/40 border border-emerald-400/30',
      secondary:
        'bg-slate-800 text-slate-100 font-semibold hover:bg-slate-700 active:bg-slate-900 border border-slate-700 hover:border-slate-600',
      outline:
        'bg-transparent text-slate-200 font-semibold border border-slate-700 hover:bg-slate-800/60 hover:border-slate-500 active:bg-slate-800',
      ghost:
        'bg-transparent text-slate-300 font-medium hover:text-slate-100 hover:bg-slate-800/50 active:bg-slate-800',
      danger:
        'bg-rose-500/15 text-rose-300 font-semibold border border-rose-500/30 hover:bg-rose-500/25 active:bg-rose-500/30',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={`inline-flex items-center justify-center rounded-xl font-sans tracking-wide transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090d16] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin text-current" aria-hidden="true" />
        ) : leftIcon ? (
          <span className="mr-2 inline-flex items-center" aria-hidden="true">
            {leftIcon}
          </span>
        ) : null}
        <span>{children}</span>
        {!isLoading && rightIcon ? (
          <span className="ml-2 inline-flex items-center" aria-hidden="true">
            {rightIcon}
          </span>
        ) : null}
      </button>
    );
  }
);

Button.displayName = 'Button';
