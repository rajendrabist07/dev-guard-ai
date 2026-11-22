# Phase 2 — Security P0 Hardening & Verification Report

## Executive Summary
This report documents the completion of **Phase 2: Security P0 Hardening** for DevGuard AI. Every critical vulnerability discovered during the Phase 1 reconnaissance audit has been remediated using a strict test-first approach. All 115 automated test suites pass, TypeScript compilation passes with zero errors, ESLint passes with zero errors, the golden eval benchmark runs with 100% precision/recall, and the Next.js production build succeeds cleanly. Gitleaks scanning confirms zero secrets leaked across the entire repository git history.

---

## 1. Remediation Summary by Domain

### A. Authentication & Authorization Rewrite (`lib/security/auth.ts`)
1. **Elimination of Header Spoofing & IDOR**:
   - Completely deleted all parsing and trust in client-supplied headers (`x-github-installation-id`, `x-account-login`, `x-user-id`).
   - Verified via `__tests__/security/auth-p0.test.ts` and `__tests__/security/idor-prevention.test.ts`.
2. **Cryptographic Identity Derivation**:
   - Identity is derived strictly from verified Supabase session JWTs (`supabase.auth.getUser()`).
   - Authoritative GitHub identity is extracted exclusively from `user.identities` (`provider === 'github'`), checking the numeric `sub` and verified GitHub account username.
   - User-editable `user.user_metadata` and unverified `email` fields are completely ignored for authorization decisions.
3. **Parameterization of PostgREST Filters**:
   - Replaced all string-interpolated `.or(...)` filter clauses with parameterized query methods (`.eq()`, `.in()`).
   - Verified via `__tests__/security/postgrest-injection.test.ts`.
4. **Single Authorization Layer (Deny-by-Default)**:
   - Implemented `requireUser(request)`, `requireRepoAccess(request, repoId)`, and `requireReviewRunAccess(request, runId)`.
   - All protected API routes (`/api/dashboard`, `/api/reviews/[id]`, `/api/repos/*`) enforce this layer.
5. **Dual-Client Supabase Architecture & RLS Enforcement**:
   - Segregated database operations into `createUserClient(token)` (user-scoped JWT client enforcing PostgreSQL RLS) and `getSupabaseAdmin()` (server-only boundary for internal background tasks and webhooks).
   - Rewrote `schema.sql` and `db/schema.sql` RLS policies. Verified cross-tenant isolation with two simulated users in `__tests__/security/rls-two-users.test.ts`.

### B. Edge Middleware & Route Protection (`middleware.ts`)
1. **Edge Route Interception**:
   - Protects `/dashboard`, `/api/dashboard`, `/api/reviews/*`, `/api/repos/*`.
   - Redirects unauthenticated browser requests to `/login?redirect=...`.
   - Returns RFC 7807/standard `401 Unauthorized` JSON responses for API calls.
2. **Identity Header Stripping**:
   - Strips any inbound `x-account-login`, `x-user-id`, and `x-github-installation-id` headers at the edge prior to proxying downstream.
3. **Public Allowlist**:
   - Explicitly allows public endpoints: `/`, `/try`, `/try/result/[id]`, `/api/try`, `/api/badge/*`, `/api/webhooks/github`, `/login`, `/auth/callback`.

### C. Webhook Ingestion Hardening (`app/api/webhooks/github/route.ts`)
1. **Raw Body Ingestion & Timing-Safe HMAC**:
   - Reads `req.text()` prior to JSON parsing.
   - Computes HMAC-SHA256 and compares signatures using `crypto.timingSafeEqual` with pre-validated buffer lengths.
   - Missing or invalid signatures return `401 Unauthorized` before processing any body content.
2. **Anti-Replay Mechanism**:
   - Ingests `x-github-delivery` UUID and stores it in the `webhook_deliveries` database table with a `UNIQUE` constraint.
   - Duplicate deliveries are acknowledged with `200 OK` (deduplicated) without executing pipeline steps.
3. **Payload Limits & Event Filtering**:
   - Enforces a 5MB payload size limit; rejects oversized payloads with `413 Payload Too Large`.
   - Ignores unhandled GitHub events with `202 Accepted` and structured log notices.
4. **Database Idempotency**:
   - Review run creation uses PostgreSQL `UNIQUE (repo_id, pr_number, commit_sha)` with `INSERT ... ON CONFLICT DO NOTHING`.
5. **Octokit Installation Token Caching**:
   - Implemented memory caching in `lib/github/client.ts` with 50-minute TTL (short of GitHub's 60-minute expiry) to prevent token exhaustion.

### D. Public Exposure & Playground Hardening
1. **Operator Observability Protection (`/observability`)**:
   - `/observability` and `/api/observability` require an active session belonging to a GitHub login listed in the `ADMIN_GITHUB_LOGINS` environment variable. Non-admins receive `403 Forbidden`.
2. **Try Playground Unpredictability & Expiration (`/try/result/[id]`)**:
   - Replaced sequential or timestamped IDs with cryptographic UUIDv4 (`crypto.randomUUID()`).
   - Validates IDs against UUIDv4 regex.
   - Enforces a 30-day retention policy via `expires_at` timestamp. Expired runs return `404 Not Found`.
   - Appends `X-Robots-Tag: noindex, nofollow` to prevent search engine indexing.
   - Escapes and sanitizes all user and LLM text via `lib/security/sanitize.ts` to prevent XSS.
3. **Sliding-Window Rate Limiting & Circuit Breaker (`/api/try`)**:
   - Enforces strict Zod schema disallowing undeclared fields (`.strict()`) and limiting code diff size to 100KB.
   - Sliding-window rate limiter (5 requests per 10 minutes per IP). Returns `429 Too Many Requests` with `Retry-After`.
   - Global daily LLM token circuit breaker (`checkGlobalLlmBudget()`). Automatically downgrades execution to deterministic static analysis (`forceDeterministic: true`) when budget limits are approached.
4. **HTTP Security Headers (`next.config.mjs`)**:
   - `Content-Security-Policy`: `frame-ancestors 'none'`, script restrictions, and asset isolation.
   - `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload`.
   - `X-Content-Type-Options`: `nosniff`.
   - `Referrer-Policy`: `strict-origin-when-cross-origin`.
   - `Permissions-Policy`: `camera=(), microphone=(), geolocation=()`.

### E. SSRF & Environment Validation
1. **Outbound Destination Allowlist & Package Name Validation**:
   - Hardcoded destination host allowlist (`api.osv.dev`) in `lib/agent/tools/deps-scan.ts`.
   - Validates extracted npm package names against the official npm naming regex (`/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/`), preventing path traversal and URL injection.
2. **Environment Variable Validation (`lib/env.ts`)**:
   - Validates all server and client environment variables at startup using Zod schemas.
   - Client leakage protection blocklist (`FORBIDDEN_CLIENT_SECRETS`) asserts that no service role keys or webhook secrets are prefixed with `NEXT_PUBLIC_`.

---

## 2. Test Verification & Code Quality Metrics (Rule 6)

Every required verification check was executed sequentially:

### 1. TypeScript Static Typing (`npm run typecheck`)
```bash
> tsc --noEmit
# Exit Code: 0 (0 errors)
```

### 2. Linting (`npm run lint`)
```bash
> eslint .
# Exit Code: 0 (0 errors, 1 harmless unused-directive warning in coverage/)
```

### 3. Automated Test Suite (`npm test`)
```bash
> vitest run

Test Files:  29 passed (29)
Tests:       115 passed (115)
Duration:    4.15s
```
*Newly authored test suites validating Phase 2 fixes:*
- `__tests__/security/auth-p0.test.ts` (7 tests)
- `__tests__/security/postgrest-injection.test.ts` (1 test)
- `__tests__/security/middleware.test.ts` (8 tests)
- `__tests__/security/idor-prevention.test.ts` (5 tests)
- `__tests__/security/webhook-hardening.test.ts` (7 tests)
- `__tests__/security/try-api-hardening.test.ts` (7 tests)
- `__tests__/security/xss-escaping.test.ts` (4 tests)
- `__tests__/security/rls-two-users.test.ts` (2 tests)
- `__tests__/security/env.test.ts` (5 tests)

### 4. Golden Evaluation Benchmark (`npm run eval`)
```bash
> npx tsx evals/run-eval.ts

• Total Test Cases Evaluated : 20
• Tool Selection Precision    : 100% (Threshold: 98%)
• Tool Selection Recall       : 100% (Threshold: 98%)
• Tool Selection F1 Score     : 100% (Threshold: 98%)
• Severity Accuracy           : 100% (Threshold: 98%)
• Wasted Tool Call Rate (Cost): 0% (Max Allowed: 2%)
• Docs-Only Efficiency Gate   : PASSED (Zero Wasted Calls)
```

### 5. Production Build (`npm run build`)
```bash
> next build

✓ Compiled successfully in 15.6s
✓ Linting and checking validity of types
✓ Collecting page data
✓ Generating static pages (20/20)
✓ Finalizing page optimization
# Exit Code: 0
```

### 6. Secret Leakage Audit (`gitleaks`)
```bash
> gitleaks git --log-opts="--all" --gitleaks-ignore-path=.gitleaksignore

76 commits scanned.
0 leaks found.
# Exit Code: 0
```

### 7. Dependency Security Audit (`npm audit`)
- **Status**: 0 critical vulnerabilities.
- **Accepted Risk**: 1 High severity advisory in `postcss <= 8.5.22` packaged internally within Next.js 15.1.7. `postcss` is a compile-time tool used during `next build`, not exposed to runtime requests. Upgrading requires Next.js 16 (major breaking change). This is documented as an accepted non-runtime build dependency risk.

---

## 3. Git Commits Authored in Phase 2

1. `b3fbacd`: `feat(security): add environment variable validation schema in lib/env.ts`
2. `d5b5fdb`: `feat(security): rewrite auth layer, eliminate header-based IDOR, add edge middleware and login flow`
3. `5ddb53d`: `feat(security): harden webhook verification, replay prevention, payload limits, and idempotency`
4. `e916837`: `feat(security): harden try playground with uuidv4, strict zod limits, circuit breaker, and sanitized output`
5. `6df71ed`: `feat(security): harden ssrf prevention, security headers, csp, and database schema rls`
