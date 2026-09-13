import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';

export interface AuthContext {
  isAuthenticated: boolean;
  type: 'anonymous' | 'session' | 'bearer' | 'installation';
  userId?: string;
  installationId?: string;
  accountLogin?: string;
  accessibleRepoIds?: string[];
}

/**
 * Extracts authentication identity from request headers / tokens / session cookies.
 * 
 * Supports:
 * 1. `x-github-installation-id`: Direct installation context from verified GitHub App tokens
 * 2. `x-account-login` / `x-user-id`: Caller identity passed in secure server-to-server or proxy calls
 * 3. `Authorization: Bearer <token>`: Supabase JWT or custom API key
 * 4. Development/Demo fallback: When no auth is present, provides anonymous guest mode
 *    with access restricted exclusively to simulated / public test runs.
 */
export async function authenticateRequest(req: NextRequest): Promise<AuthContext> {
  const installationIdHeader = req.headers.get('x-github-installation-id');
  const accountLoginHeader = req.headers.get('x-account-login');
  const userIdHeader = req.headers.get('x-user-id');
  const authHeader = req.headers.get('authorization');

  // 1. Check Bearer Token (Supabase JWT)
  if (authHeader && authHeader.startsWith('Bearer ') && supabaseAdmin) {
    const token = authHeader.substring(7).trim();
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && user) {
        // Look up installations / repos associated with this user
        const { data: installations } = await supabaseAdmin
          .from('installations')
          .select('id, github_installation_id, account_login')
          .or(`account_login.eq.${user.user_metadata?.user_name || user.email},id.eq.${user.id}`);

        const instIds = (installations || []).map((i) => i.id);
        let repoIds: string[] = [];
        if (instIds.length > 0) {
          const { data: repos } = await supabaseAdmin
            .from('repos')
            .select('id')
            .in('installation_id', instIds);
          repoIds = (repos || []).map((r) => r.id);
        }

        return {
          isAuthenticated: true,
          type: 'session',
          userId: user.id,
          accountLogin: user.user_metadata?.user_name || user.email,
          accessibleRepoIds: repoIds,
        };
      }
    } catch {
      // Fall through to other auth headers
    }
  }

  // 2. Direct Installation Header (from verified webhook or internal caller)
  if (installationIdHeader && supabaseAdmin) {
    const { data: inst } = await supabaseAdmin
      .from('installations')
      .select('id, github_installation_id, account_login')
      .eq('github_installation_id', installationIdHeader)
      .maybeSingle();

    if (inst) {
      const { data: repos } = await supabaseAdmin
        .from('repos')
        .select('id')
        .eq('installation_id', inst.id);

      return {
        isAuthenticated: true,
        type: 'installation',
        installationId: inst.id,
        accountLogin: inst.account_login,
        accessibleRepoIds: (repos || []).map((r) => r.id),
      };
    }
  }

  // 3. User ID or Account Login Header
  if ((userIdHeader || accountLoginHeader) && supabaseAdmin) {
    const login = accountLoginHeader || userIdHeader;
    const { data: instList } = await supabaseAdmin
      .from('installations')
      .select('id, github_installation_id, account_login')
      .eq('account_login', login);

    const instIds = (instList || []).map((i) => i.id);
    let repoIds: string[] = [];
    if (instIds.length > 0) {
      const { data: repos } = await supabaseAdmin
        .from('repos')
        .select('id')
        .in('installation_id', instIds);
      repoIds = (repos || []).map((r) => r.id);
    }

    return {
      isAuthenticated: true,
      type: 'bearer',
      userId: userIdHeader || undefined,
      accountLogin: login || undefined,
      accessibleRepoIds: repoIds,
    };
  }

  // 4. Anonymous Guest Access (can only view simulated / demo / public sample runs)
  return {
    isAuthenticated: false,
    type: 'anonymous',
    accessibleRepoIds: [],
  };
}

/**
 * Validates whether the authenticated context has permission to view/modify a repository.
 */
export async function verifyRepoOwnership(
  repoId: string,
  auth: AuthContext
): Promise<boolean> {
  // Unauthenticated guests cannot access private/non-simulation repos
  if (!auth.isAuthenticated) return false;

  // If user has direct access in their repo list
  if (auth.accessibleRepoIds?.includes(repoId)) return true;

  // If supabaseAdmin is not configured (e.g. offline test without mock db), deny non-matching access
  if (!supabaseAdmin) {
    return auth.accessibleRepoIds?.includes(repoId) ?? false;
  }

  // Check DB directly to confirm ownership
  const { data: repo } = await supabaseAdmin
    .from('repos')
    .select('id, installation_id, installations(github_installation_id, account_login)')
    .eq('id', repoId)
    .maybeSingle();

  if (!repo) return false;

  const inst = repo.installations as unknown as { github_installation_id: string; account_login: string } | null;
  if (!inst) return false;

  if (auth.installationId && repo.installation_id === auth.installationId) return true;
  if (auth.accountLogin && inst.account_login.toLowerCase() === auth.accountLogin.toLowerCase()) return true;

  return false;
}

/**
 * Validates whether the authenticated context has permission to access a specific review run.
 */
export async function verifyReviewRunOwnership(
  run: { repo_id: string; is_simulation: boolean },
  auth: AuthContext
): Promise<boolean> {
  // Simulation and public demo runs are accessible without authentication
  if (run.is_simulation) return true;

  return verifyRepoOwnership(run.repo_id, auth);
}
