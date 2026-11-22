'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import GithubIcon from '@/components/icons/GithubIcon';
import { Shield, ShieldAlert, ArrowRight, Loader2 } from 'lucide-react';
import { createUserClient } from '@/lib/db/supabase';

function LoginForm() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');
  const redirectParam = searchParams.get('redirect') || '/dashboard';
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(
    errorParam === 'admin_required'
      ? 'Admin access is required to view the operational observability dashboard.'
      : null
  );

  const handleGitHubLogin = async () => {
    setLoading(true);
    setAuthError(null);

    const client = createUserClient();
    if (!client) {
      setAuthError('Supabase authentication client is not configured.');
      setLoading(false);
      return;
    }

    try {
      const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectParam)}`;
      const { error } = await client.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: redirectUrl,
          scopes: 'read:user repo',
        },
      });

      if (error) {
        throw error;
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'GitHub authentication failed.');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full mx-auto p-8 rounded-2xl bg-gray-900/80 border border-gray-800 shadow-2xl backdrop-blur-sm space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-2">
          <Shield className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Sign in to DevGuard AI</h1>
        <p className="text-xs text-gray-400">
          Zero-trust authenticated access. Sign in with your GitHub account to access authorized repositories and reviews.
        </p>
      </div>

      {authError && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 flex items-start space-x-3 text-rose-300 text-xs">
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
          <span>{authError}</span>
        </div>
      )}

      <div className="space-y-4">
        <button
          onClick={handleGitHubLogin}
          disabled={loading}
          className="w-full flex items-center justify-center space-x-3 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Redirecting to GitHub...</span>
            </>
          ) : (
            <>
              <GithubIcon className="w-5 h-5 fill-current" />
              <span>Continue with GitHub</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </>
          )}
        </button>

        <p className="text-[11px] text-gray-500 text-center">
          Identity is validated directly against GitHub OAuth. No passwords or editable profiles are stored.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-gray-100 selection:bg-emerald-500/30 selection:text-emerald-300">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-12">
        <Suspense
          fallback={
            <div className="text-center text-gray-400 text-sm">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
              Loading sign in...
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}
