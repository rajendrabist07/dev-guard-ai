import { NextRequest } from 'next/server';
import { generateBadgeSvg } from '@/lib/badge/svg';
import { supabaseAdmin } from '@/lib/db/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const resolvedParams = await params;
  const rawId = decodeURIComponent(resolvedParams.repoId || 'status');
  const searchParams = req.nextUrl.searchParams;
  const customLabel = searchParams.get('label') || 'DevGuard AI';

  let badgeValue = 'passing';
  let badgeColor = 'green';

  // Preset styles
  if (rawId === 'powered-by' || searchParams.get('style') === 'powered-by') {
    badgeValue = 'verified agent';
    badgeColor = 'emerald';
  } else if (rawId === 'demo' || rawId === 'preview' || rawId === 'status') {
    badgeValue = '0 critical issues';
    badgeColor = 'green';
  } else if (supabaseAdmin) {
    try {
      // 1. Look up repository by ID or full_name
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
      let repoQuery = supabaseAdmin.from('repos').select('id, full_name, is_active');

      if (isUuid) {
        repoQuery = repoQuery.eq('id', rawId);
      } else {
        const normalizedFullName = rawId.replace(/--/g, '/').replace(/-/, '/');
        repoQuery = repoQuery.or(`full_name.eq.${rawId},full_name.eq.${normalizedFullName}`);
      }

      const { data: repoData } = await repoQuery.maybeSingle();

      if (repoData) {
        // 2. Fetch latest review run for this repo
        const { data: latestRun } = await supabaseAdmin
          .from('review_runs')
          .select('id, status, created_at')
          .eq('repo_id', repoData.id)
          .eq('is_simulation', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestRun) {
          if (latestRun.status === 'running' || latestRun.status === 'pending') {
            badgeValue = 'reviewing...';
            badgeColor = 'cyan';
          } else {
            // 3. Query findings for latest run
            const { data: findings } = await supabaseAdmin
              .from('findings')
              .select('severity')
              .eq('review_run_id', latestRun.id);

            const criticalCount = (findings || []).filter((f) => f.severity === 'critical').length;
            const warningCount = (findings || []).filter((f) => f.severity === 'warning').length;

            if (criticalCount > 0) {
              badgeValue = `${criticalCount} critical ${criticalCount === 1 ? 'issue' : 'issues'}`;
              badgeColor = 'red';
            } else if (warningCount > 0) {
              badgeValue = `${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`;
              badgeColor = 'amber';
            } else {
              badgeValue = '0 critical issues';
              badgeColor = 'green';
            }
          }
        } else {
          // Repo is connected but no review runs yet
          badgeValue = 'monitoring';
          badgeColor = 'green';
        }
      } else {
        // Fallback for unknown/uninstalled repo slug
        badgeValue = 'protected';
        badgeColor = 'green';
      }
    } catch (err) {
      console.warn('Badge database query fallback:', err);
      badgeValue = 'protected';
      badgeColor = 'green';
    }
  } else {
    badgeValue = 'protected';
    badgeColor = 'green';
  }

  const svgContent = generateBadgeSvg({
    label: customLabel,
    value: badgeValue,
    color: badgeColor,
  });

  return new Response(svgContent, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
