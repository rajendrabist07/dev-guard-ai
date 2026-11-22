import { NextRequest } from 'next/server';
import { getSupabaseAdmin, getReviewRunById } from '@/lib/db/supabase';
import { DisplayReviewRun, Finding } from '@/lib/db/types';

export class UnauthorizedError extends Error {
  readonly statusCode = 401;
  constructor(message = 'Authentication required.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message = 'Forbidden: Access denied.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message = 'Resource not found.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface AuthUser {
  id: string;
  githubId?: string;
  githubLogin?: string;
}

export interface AuthContext {
  isAuthenticated: boolean;
  type: 'anonymous' | 'session' | 'service';
  user?: AuthUser;
  token?: string;
  isInternalServiceCall?: boolean;
  accessibleRepoIds?: string[];
  accessibleInstallationIds?: string[];
}

/**
 * Extracts the bearer token from Authorization header or Supabase auth session cookie.
 */
function extractAuthToken(req: NextRequest | Request | { headers: Headers } | null): string | null {
  if (!req) return null;

  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // Check Cookie header for Supabase auth cookie
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    // Standard Supabase cookie names: sb-<ref>-auth-token or supabase-auth-token
    const match = cookieHeader.match(/(?:^|;\s*)(?:sb-[^=]+-auth-token|supabase-auth-token)=([^;]+)/);
    if (match?.[1]) {
      try {
        const decoded = decodeURIComponent(match[1]);
        // Often JSON stringified array or object with access_token
        if (decoded.startsWith('[') || decoded.startsWith('{')) {
          const parsed = JSON.parse(decoded);
          if (Array.isArray(parsed) && parsed[0]) return parsed[0];
          if (parsed.access_token) return parsed.access_token;
        }
        return decoded;
      } catch {
        return decodeURIComponent(match[1]);
      }
    }
  }

  return null;
}

/**
 * Extracts verified GitHub identity from user object.
 * 
 * SECURITY ZERO-TRUST PRINCIPLE:
 * NEVER use `user_metadata` or `user.email` for authorization decisions.
 * `user_metadata` is user-editable on the client via `supabase.auth.updateUser()`.
 * Identity MUST be derived exclusively from `user.identities` where `provider === 'github'`.
 */
function extractVerifiedGitHubIdentity(user: {
  identities?: Array<{ provider?: string; id?: string; identity_data?: Record<string, unknown> }>;
  app_metadata?: Record<string, unknown>;
}): { githubId?: string; githubLogin?: string } {
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const githubIdentity = identities.find((id) => id?.provider === 'github');

  if (githubIdentity) {
    const data = githubIdentity.identity_data || {};
    return {
      githubId: String(data.sub || githubIdentity.id || ''),
      githubLogin: typeof data.user_name === 'string' ? data.user_name.toLowerCase() : undefined,
    };
  }

  // Fallback to app_metadata (set only by server / OAuth provider, NOT user-editable)
  if (user.app_metadata?.provider === 'github' && user.app_metadata?.provider_id) {
    return {
      githubId: String(user.app_metadata.provider_id),
      githubLogin: undefined,
    };
  }

  return {};
}

/**
 * Authenticates request using verified Supabase session / JWT.
 * 
 * NOTE: All client-controlled identity headers (`x-github-installation-id`,
 * `x-account-login`, `x-user-id`) are completely ignored and stripped.
 */
export async function authenticateRequest(
  req: NextRequest | Request | { headers: Headers } | null
): Promise<AuthContext> {
  const token = extractAuthToken(req);
  const db = getSupabaseAdmin();

  if (!token || !db) {
    return {
      isAuthenticated: false,
      type: 'anonymous',
      accessibleRepoIds: [],
      accessibleInstallationIds: [],
    };
  }

  try {
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error || !user) {
      return {
        isAuthenticated: false,
        type: 'anonymous',
        accessibleRepoIds: [],
        accessibleInstallationIds: [],
      };
    }

    const { githubId, githubLogin } = extractVerifiedGitHubIdentity(user);

    const authUser: AuthUser = {
      id: user.id,
      githubId,
      githubLogin,
    };

    // Find authorized installations using parameterized queries ONLY
    let instQuery = db
      .from('installations')
      .select('id, github_installation_id, account_login');

    if (githubLogin) {
      instQuery = instQuery.eq('account_login', githubLogin);
    } else {
      // If no verified GitHub login, user has no linked GitHub installation
      return {
        isAuthenticated: true,
        type: 'session',
        user: authUser,
        token,
        accessibleRepoIds: [],
        accessibleInstallationIds: [],
      };
    }

    const { data: installations } = await instQuery;
    const instIds = (installations || []).map((i: { id: string }) => i.id);

    let accessibleRepoIds: string[] = [];
    if (instIds.length > 0) {
      const { data: repos } = await db
        .from('repos')
        .select('id')
        .in('installation_id', instIds);
      accessibleRepoIds = (repos || []).map((r: { id: string }) => r.id);
    }

    return {
      isAuthenticated: true,
      type: 'session',
      user: authUser,
      token,
      accessibleInstallationIds: instIds,
      accessibleRepoIds,
    };
  } catch {
    return {
      isAuthenticated: false,
      type: 'anonymous',
      accessibleRepoIds: [],
      accessibleInstallationIds: [],
    };
  }
}

/**
 * Requires an authenticated user session. Throws UnauthorizedError (HTTP 401) if not authenticated.
 */
export async function requireUser(
  req: NextRequest | Request | { headers: Headers } | null
): Promise<AuthUser> {
  const auth = await authenticateRequest(req);
  if (!auth.isAuthenticated || !auth.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  return auth.user;
}

/**
 * Verifies that the requester has access to the specified repository.
 * Throws ForbiddenError (HTTP 403) or UnauthorizedError (HTTP 401) if denied.
 */
export async function requireRepoAccess(
  repoId: string,
  req: NextRequest | Request | { headers: Headers } | null,
  internalContext?: AuthContext
): Promise<{ id: string; [key: string]: unknown }> {
  if (internalContext?.isInternalServiceCall) {
    return { id: repoId };
  }

  const auth = await authenticateRequest(req);
  if (!auth.isAuthenticated || !auth.user) {
    throw new UnauthorizedError('Authentication required to access repository.');
  }

  if (auth.accessibleRepoIds?.includes(repoId)) {
    return { id: repoId };
  }

  const db = getSupabaseAdmin();
  if (!db) {
    throw new ForbiddenError('Access to this repository is denied.');
  }

  // Parameterized database check
  const { data: repo, error } = await db
    .from('repos')
    .select('id, installation_id, installations(github_installation_id, account_login)')
    .eq('id', repoId)
    .maybeSingle();

  if (error || !repo) {
    throw new ForbiddenError('Access to this repository is denied.');
  }

  const inst = repo.installations as unknown as { github_installation_id: string; account_login: string } | null;
  if (!inst) {
    throw new ForbiddenError('Access to this repository is denied.');
  }

  const userLogin = auth.user.githubLogin;
  if (userLogin && inst.account_login.toLowerCase() === userLogin.toLowerCase()) {
    return repo;
  }

  throw new ForbiddenError('Access to this repository is denied.');
}

/**
 * Verifies that the requester has access to the specified review run.
 * Public simulation runs are accessible anonymously. All other runs require repository ownership.
 */
export async function requireReviewRunAccess(
  runId: string,
  req: NextRequest | Request | { headers: Headers } | null,
  internalContext?: AuthContext
): Promise<{ run: DisplayReviewRun; findings: Finding[] }> {
  const { run, findings } = await getReviewRunById(runId);
  if (!run) {
    throw new NotFoundError('Review run not found.');
  }

  // Simulation runs are public for playground demos
  if (run.is_simulation) {
    return { run, findings };
  }

  // Internal server calls (e.g. webhook processing) bypass user auth
  if (internalContext?.isInternalServiceCall) {
    return { run, findings };
  }

  await requireRepoAccess(run.repo_id, req, internalContext);
  return { run, findings };
}
