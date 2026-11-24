import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center px-6 outline-none"
    >
      <div className="max-w-md w-full text-center space-y-6 p-8 rounded-xl bg-slate-900/60 border border-slate-800 shadow-2xl backdrop-blur-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-800/80 border border-slate-700 text-emerald-400 mx-auto">
          <ShieldAlert className="w-7 h-7" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
            Error 404
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Page Not Found
          </h1>
          <p className="text-base text-slate-400">
            The route or resource you requested could not be located in DevGuard AI.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link href="/" className="inline-block">
            <Button variant="outline" className="w-full sm:w-auto">
              <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
              Back to Home
            </Button>
          </Link>
          <Link href="/dashboard" className="inline-block">
            <Button variant="primary" className="w-full sm:w-auto">
              Open Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
