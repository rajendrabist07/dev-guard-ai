'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log client error with digest if available
    console.error('Unhandled route error in DevGuard AI:', error);
  }, [error]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center px-6 outline-none"
    >
      <div className="max-w-md w-full text-center space-y-6 p-8 rounded-xl bg-slate-900/60 border border-slate-800 shadow-2xl backdrop-blur-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 mx-auto">
          <AlertTriangle className="w-7 h-7" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-mono font-bold uppercase tracking-wider text-rose-400">
            Application Error
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Something Went Wrong
          </h1>
          <p className="text-base text-slate-400">
            An unexpected error occurred while rendering this page. You can retry the action or return to safety.
          </p>
          {error.digest && (
            <p className="text-xs font-mono text-slate-400 bg-slate-950/60 p-2 rounded border border-slate-800 break-all select-all">
              Error Digest: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Button variant="primary" onClick={() => reset()} className="w-full sm:w-auto">
            <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
            Try Again
          </Button>
          <Link href="/" className="inline-block">
            <Button variant="outline" className="w-full sm:w-auto">
              <Home className="w-4 h-4 mr-2" aria-hidden="true" />
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
