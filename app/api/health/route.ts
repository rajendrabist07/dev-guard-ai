import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

export async function GET() {
  const health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    services: {
      supabase: { status: 'connected' | 'not_configured' | 'error'; message?: string };
      githubApp: { status: 'configured' | 'not_configured' | 'invalid'; message?: string; appId?: string };
      aiProviders: {
        groq: boolean;
        gemini: boolean;
      };
    };
  } = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      supabase: { status: 'not_configured' },
      githubApp: { status: 'not_configured' },
      aiProviders: {
        groq: Boolean(process.env.GROQ_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY),
      },
    },
  };

  // 1. Check Supabase Connectivity
  if (supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin.from('repos').select('id').limit(1);
      if (error) {
        health.services.supabase = { status: 'error', message: error.message };
        health.status = 'degraded';
      } else {
        health.services.supabase = { status: 'connected' };
      }
    } catch (err: unknown) {
      health.services.supabase = {
        status: 'error',
        message: err instanceof Error ? err.message : 'Connection failed',
      };
      health.status = 'degraded';
    }
  }

  // 2. Check GitHub App Authentication
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = (process.env.GITHUB_APP_PRIVATE_KEY || process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (appId && privateKey) {
    try {
      const auth = createAppAuth({
        appId,
        privateKey,
      });
      const appAuthentication = await auth({ type: 'app' });
      const octokit = new Octokit({ auth: appAuthentication.token });
      const { data: appData } = await octokit.rest.apps.getAuthenticated();

      const appName = appData?.name ?? 'DevGuard AI';
      const appSlug = appData?.slug ?? 'unknown';

      health.services.githubApp = {
        status: 'configured',
        appId,
        message: `Authenticated as GitHub App: ${appName} (${appSlug})`,
      };
    } catch (err: unknown) {
      health.services.githubApp = {
        status: 'invalid',
        appId,
        message: err instanceof Error ? err.message : 'Failed to authenticate GitHub App',
      };
      health.status = 'degraded';
    }
  } else {
    health.services.githubApp = {
      status: 'not_configured',
      message: 'GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY is missing.',
    };
  }

  const statusCode = health.status === 'unhealthy' ? 503 : 200;
  return NextResponse.json(health, { status: statusCode });
}
