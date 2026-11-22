# ADR 0001: Zero-Trust Authentication and Multi-Tenant Isolation Architecture

## Status
**Accepted** (2026-11-22)

## Context
During the Phase 1 security baseline audit of DevGuard AI, critical vulnerabilities were identified in the authentication, authorization, and data isolation layers (`lib/security/auth.ts`):

1. **Header-Based Authentication Bypass & IDOR**:
   `lib/security/auth.ts` trusted client-supplied HTTP headers (`x-github-installation-id`, `x-account-login`, `x-user-id`) without cryptographic verification. Any unauthenticated caller could spoof these headers to access, list, or mutate repositories and review runs belonging to any GitHub organization or user.
2. **Client-Editable Privilege Escalation**:
   User permissions and GitHub organization matching relied on `user.user_metadata.user_name` and `user.email`. In Supabase Auth, `user_metadata` is editable by the authenticated client via `supabase.auth.updateUser({ data: { user_name: "admin" } })`. This allowed any authenticated user to spoof arbitrary GitHub usernames.
3. **PostgREST Filter Injection**:
   The authorization checks constructed PostgREST query filters using JavaScript template string interpolation (e.g. `.or(\`account_login.eq.${name}\`)`), allowing query parameter breakout and unauthorized data retrieval via comma injection.
4. **Bypassed Row Level Security (RLS)**:
   All database access was executed through the Supabase service-role client (`SUPABASE_SERVICE_ROLE_KEY`), which inherently bypasses Postgres RLS policies. Application-layer errors directly resulted in database-wide privilege compromises.

## Decision

We have implemented a zero-trust, cryptographically verified authentication and authorization architecture:

### 1. Complete Removal of Client Identity Headers
- Deleted all code paths that accepted or read `x-github-installation-id`, `x-account-login`, and `x-user-id`.
- Implemented edge middleware (`middleware.ts`) that explicitly strips incoming `x-*` identity headers from inbound HTTP requests before they reach application route handlers.

### 2. Verified Cryptographic Identity via Supabase Auth & OAuth Claims
- Identity is derived strictly from verified Supabase session JWTs via `supabase.auth.getUser()` on the server.
- The user's GitHub username and numeric account ID are extracted solely from authoritative, provider-verified OAuth identities (`user.identities` where `provider === 'github'` and `identity_data`), which cannot be modified by client-side metadata updates.
- Reliance on `user_metadata` and unverified `email` for authorization is strictly prohibited.

### 3. Parameterized Query Construction
- String interpolation inside PostgREST filters (`.or(...)`, `.filter(...)`) is eradicated.
- All database operations utilize parameterized query builders (`.eq()`, `.in()`).

### 4. Single Authorization Layer (Deny-by-Default)
- Centralized access control functions in `lib/security/auth.ts`:
  - `requireUser(request)`: Ensures an active authenticated session exists, returning the verified user and GitHub identity.
  - `requireRepoAccess(request, repoId)`: Verifies that the authenticated user owns or has access to the specified repository.
  - `requireReviewRunAccess(request, runId)`: Verifies that the review run exists and belongs to a repository accessible to the authenticated user.
- Every protected route (`/dashboard`, `/api/dashboard`, `/api/reviews/*`, `/api/repos/*`) enforces this authorization layer before executing logic.

### 5. Dual-Client Database Architecture & RLS Enforcement
- **User-Scoped Client (`createUserClient(token)`)**: Instantiated with the user's verified bearer JWT, enforcing Row Level Security (RLS) directly in Postgres for user-initiated read operations.
- **Server-Only Admin Client (`getSupabaseAdmin()`)**: Restricted to internal backend operations (webhook HMAC processors and background ingestion) with strict execution boundaries.

## Consequences

### Positive
- **Elimination of IDOR & Header Spoofing**: Attackers cannot forge tenant identities or bypass access control via headers.
- **Protection Against Privilege Escalation**: Client-side modification of user metadata cannot elevate privileges or grant access to other GitHub accounts.
- **Query Injection Prevention**: Parameterized queries guarantee deterministic query semantics and protect against PostgREST filter injection.
- **Defense in Depth**: Even in the event of an application logic bug, Postgres RLS policies enforce tenant isolation at the storage layer.

### Negative / Trade-offs
- Requests without a valid Supabase bearer token or active session cookie receive `401 Unauthorized`.
- Requires users to authenticate via GitHub OAuth prior to accessing dashboard or repository data.
- Unit tests for protected endpoints must mock verified Supabase auth sessions rather than passing synthetic HTTP headers.
