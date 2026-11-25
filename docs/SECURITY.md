# DevGuard AI — Security Architecture & Vulnerability Mitigation Matrix

## Executive Summary
This document provides the definitive security architecture, threat model, and mitigation verification matrix for DevGuard AI. Every identified vulnerability has been addressed with a test-first approach, validated through rigorous automated security suites, zero-trust design, and strict input validation.

---

## 1. Vulnerability Mitigation Matrix (Phase 2 P0 Hardening)

| Finding ID | Vulnerability / Threat | Severity | Fixed In | Proving Automated Test & Assertion |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Client Header Trust & IDOR (`x-github-installation-id`, `x-account-login`, `x-user-id`) | **P0 (Critical)** | `lib/security/auth.ts`<br>`middleware.ts` | `__tests__/security/auth-p0.test.ts`:<br>• `"rejects requests relying solely on client headers without valid session"`<br>• `"strips client-supplied x-account-login and x-user-id headers at edge"` |
| **SEC-02** | Privilege Escalation via Client-Editable `user_metadata` | **P0 (Critical)** | `lib/security/auth.ts` | `__tests__/security/auth-p0.test.ts`:<br>• `"ignores malicious user_metadata and extracts identity strictly from identities provider"` |
| **SEC-03** | PostgREST Filter String Injection in `.or()` / `.filter()` | **P0 (High)** | `lib/security/auth.ts`<br>`app/api/badge/[repoId]/route.ts` | `__tests__/security/postgrest-injection.test.ts`:<br>• `"does not use string interpolation for PostgREST .or() or .filter() queries"` |
| **SEC-04** | RLS Bypass via Universal Service-Role Client | **P0 (High)** | `lib/db/supabase.ts`<br>`schema.sql` | `__tests__/security/rls-two-users.test.ts`:<br>• `"prevents User A from reading User B's repositories when queried with user-scoped client"` |
| **SEC-05** | Webhook HMAC Verification Bypass & Timing Attacks | **P0 (Critical)** | `lib/github/client.ts`<br>`app/api/webhooks/github/route.ts` | `__tests__/security/webhook-hardening.test.ts`:<br>• `"rejects requests with invalid or missing HMAC signatures"`<br>• `"uses timing-safe comparison on buffers"` |
| **SEC-06** | Webhook Delivery Replay Attacks | **P0 (High)** | `app/api/webhooks/github/route.ts`<br>`lib/db/supabase.ts` | `__tests__/security/webhook-hardening.test.ts`:<br>• `"detects duplicate x-github-delivery ID and idempotently skips processing"` |
| **SEC-07** | Review Run Creation Race Conditions & Duplicate Rows | **P0 (Medium)** | `lib/db/supabase.ts`<br>`schema.sql` | `__tests__/security/webhook-and-diff-mapping.test.ts`:<br>• `"handles duplicate review run insertion gracefully via ON CONFLICT DO NOTHING"` |
| **SEC-08** | Unauthorized Access to `/observability` and Telemetry Logs | **P0 (High)** | `middleware.ts`<br>`app/api/observability/route.ts` | `__tests__/security/middleware.test.ts`:<br>• `"blocks unauthenticated access to /observability"`<br>• `"allows access to /observability only when user is in ADMIN_GITHUB_LOGINS allowlist"` |
| **SEC-09** | Predictable Sequential IDs & Permanent Exposure in Try Playground | **P0 (Medium)** | `app/api/try/route.ts`<br>`app/api/try/result/[id]/route.ts` | `__tests__/security/try-api-hardening.test.ts`:<br>• `"generates unguessable UUIDv4 run IDs"`<br>• `"rejects expired review runs (> 30 days old)"`<br>• `"serves X-Robots-Tag: noindex, nofollow header"` |
| **SEC-10** | Missing Rate Limiting & Denial of Wallet / LLM Quota Exhaustion | **P0 (High)** | `lib/security/ratelimit.ts`<br>`app/api/try/route.ts` | `__tests__/security/try-api-hardening.test.ts`:<br>• `"enforces sliding-window IP rate limit and returns 429 with Retry-After header"`<br>• `"activates global daily LLM budget circuit breaker and falls back to deterministic analysis"` |
| **SEC-11** | SSRF & Cache Poisoning via Unvalidated Outbound Requests | **P0 (High)** | `lib/agent/tools/deps-scan.ts` | `__tests__/tools/deps-scan.test.ts`:<br>• `"rejects malicious package names attempting path traversal or SSRF"`<br>• `"enforces outbound destination allowlist for OSV API"` |
| **SEC-12** | Cross-Site Scripting (XSS) via Unsanitized LLM / Diff Markdown | **P0 (High)** | `lib/security/sanitize.ts`<br>`app/api/try/result/[id]/route.ts` | `__tests__/security/xss-escaping.test.ts`:<br>• `"escapes raw script tags, onerror handlers, and javascript: links"` |
| **SEC-13** | Missing HTTP Security Headers & Clickjacking Exposure | **P0 (Medium)** | `next.config.mjs` | `next.config.mjs` Verification Suite:<br>• `Content-Security-Policy: frame-ancestors 'none'`<br>• `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`<br>• `X-Content-Type-Options: nosniff`<br>• `Referrer-Policy: strict-origin-when-cross-origin` |

---

## 2. Authentication & Authorization Model

DevGuard AI implements a strict **Zero-Trust Authentication Model**:

1. **Request Identity Ingestion**:
   - Inbound requests to protected endpoints (`/dashboard`, `/api/dashboard`, `/api/reviews/*`, `/api/repos/*`) must provide a valid Supabase bearer token (`Authorization: Bearer <token>`) or an active session cookie.
   - Any client-supplied identity headers (`x-github-installation-id`, `x-account-login`, `x-user-id`) are stripped at the edge by `middleware.ts`.
2. **Authoritative Identity Resolution**:
   - The user session is verified via `supabase.auth.getUser()`.
   - The user's GitHub username and numeric account ID are extracted from `user.identities` where `provider === 'github'`. The unverified and user-mutable `user.user_metadata` field is explicitly ignored.
3. **Repository & Run Authorization**:
   - Access to repository data is governed by `requireRepoAccess(request, repoId)`.
   - Access to review run data is governed by `requireReviewRunAccess(request, runId)`.
   - If an account does not have explicit ownership of the repository or installation, requests immediately fail closed with `403 Forbidden` or `404 Not Found`.

---

## 3. Webhook Hardening & Idempotency

GitHub Webhook processing (`app/api/webhooks/github/route.ts`) operates under strict cryptographic and operational controls:

1. **Raw Body Ingestion**: The raw request body is read via `req.text()` prior to JSON parsing.
2. **HMAC-SHA256 Verification**:
   - Validated against `GITHUB_WEBHOOK_SECRET` using `crypto.timingSafeEqual`.
   - Pre-validates buffer lengths to prevent exceptions or timing leakage.
   - Missing or malformed signatures immediately return `401 Unauthorized`.
3. **Payload Size Guard**:
   - Enforces a 5MB maximum body size limit. Oversized payloads return `413 Payload Too Large`.
4. **Anti-Replay Mechanism**:
   - The `x-github-delivery` header is recorded in the `webhook_deliveries` table.
   - Replayed deliveries are identified and return `200 OK` (deduplicated) without re-triggering analysis.
5. **Database Idempotency**:
   - Review run creation uses an explicit Postgres `UNIQUE(repo_id, pr_number, commit_sha)` constraint combined with `INSERT ... ON CONFLICT DO NOTHING`.

---

## 4. Rate Limiting & Circuit Breakers

1. **Playground Rate Limiting (`/api/try`)**:
   - Upstash Redis sliding-window limiter enforces a 5 requests per 10-minute window per IP.
   - Returns standard `429 Too Many Requests` with a compliant `Retry-After` header.
2. **Global LLM Budget Circuit Breaker**:
   - `checkGlobalLlmBudget()` monitors aggregate daily LLM token spend.
   - When the configured threshold (`MAX_DAILY_LLM_BUDGET_TOKENS`) is exceeded, requests do not fail abruptly; instead, the orchestrator gracefully switches to `forceDeterministic: true`, analyzing diffs using AST/regex linters and dependency scanners without consuming external API tokens.

---

## 5. Outbound Network & SSRF Defenses

1. **Host Allowlist**:
   - Outbound requests in tools (e.g. `lib/agent/tools/deps-scan.ts`) are restricted to known, static endpoints (`api.osv.dev`).
2. **Package Name Validation**:
   - Package names extracted from `package.json` manifests are validated against the official npm package naming specification (`/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/`).
   - Slashes, traversal patterns (`../`), and invalid URI schemes are blocked before constructing request URLs.

---

## 6. Secrets & Static Analysis Audits

1. **Gitleaks Secret Scan**:
   - Executed against full Git commit history:
     ```bash
     gitleaks git --log-opts="--all" --gitleaks-ignore-path=.gitleaksignore
     ```
   - **Result**: `76 commits scanned, 0 leaks found`.
2. **npm audit Status**:
   - Executed vulnerability audit: 0 critical vulnerabilities.
   - 1 High severity advisory identified in `postcss <= 8.5.22` bundled internally within Next.js 15.1.7.
   - **Risk Assessment**: `postcss` is executed strictly during build time by Next.js compiler workers; it is not exposed as a runtime HTTP service or client-reachable code. Upgrading requires Next.js 16 (major breaking change). This is documented and accepted as a non-runtime build dependency risk.


---

## 7. STRIDE Threat Model & Trust Boundaries

### Trust Boundaries
1. **Boundary A — Public Internet $\to$ Edge Middleware (`middleware.ts`):** Untrusted clients and GitHub webhooks enter here. Client-supplied identity headers (`x-user-id`, `x-account-login`, `x-github-installation-id`) are stripped before reaching route handlers.
2. **Boundary B — Webhook / Queue Ingress $\to$ Worker Execution (`/api/webhooks/github`, `/api/jobs/review-worker`):** Protected by HMAC-SHA256 (`crypto.timingSafeEqual`) for GitHub and Ed25519/HMAC (`@upstash/qstash` `Receiver`) for queue callbacks.
3. **Boundary C — Untrusted PR Diffs $\to$ LLM Synthesis (`lib/agent/llm.ts`):** PR titles, authors, and code diffs are untrusted attacker-controlled strings enclosed in per-request cryptographic nonces (`<<<UNTRUSTED_CONTENT_NONCE_...>>>`). Deterministic tool findings cannot be altered by LLM output.
4. **Boundary D — Application Server $\to$ Supabase Postgres (`db/migrations/`):** Tenant reads go through user-scoped RLS clients; webhook/worker writes use `supabaseAdmin` only after cryptographic webhook/queue verification.

### STRIDE Analysis Summary

| Category | Threat | Mitigation & Code Reference |
| :--- | :--- | :--- |
| **Spoofing** | Forged user identity headers or `user_metadata` tampering | Stripped at edge (`middleware.ts`); verified via `supabase.auth.getUser()` + `user.identities` (`lib/security/auth.ts`). |
| **Tampering** | Modified webhook payloads, queue jobs, or LLM finding suppression | Timing-safe HMAC (`lib/github/client.ts`), QStash `Receiver` (`lib/queue/qstash.ts`), Zod + referential finding-ID validation (`lib/agent/llm.ts`). |
| **Repudiation** | Denying webhook/CI triggers or unlogged auth failures | `webhook_deliveries` table, correlation IDs, persistent redacted `system_logs` (`lib/observability/logger.ts`). |
| **Information Disclosure** | Cross-tenant IDOR, leaked tokens in logs, unauthenticated telemetry | `requireRepoAccess` / `requireReviewRunAccess`, Postgres RLS, `scrubSecrets`, `ADMIN_GITHUB_LOGINS` allowlist on `/observability`. |
| **Denial of Service** | Webhook flood, `/api/try` wallet drain, stuck worker runs | 5MB webhook cap, Upstash Redis sliding-window rate limit (5/10m), daily LLM budget breaker, Vercel Cron watchdog (`>300s`). |
| **Elevation of Privilege** | PostgREST filter injection or SSRF via malicious dependencies | Parameterized `.eq()`/`.in()` only, npm package regex validation + `api.osv.dev` host allowlist (`lib/agent/tools/deps-scan.ts`). |

---

## 8. Responsible Disclosure

If you discover a security vulnerability in DevGuard AI, please **do not** open a public GitHub issue. Report it privately via GitHub Security Advisories on `github.com/rajendrabist07/dev-guard-ai/security/advisories/new` or contact the maintainer directly. We acknowledge reports within 48 hours and target fixes for P0 issues within 72 hours.
