# DevGuard AI — Comprehensive Audit Baseline & Architecture Reconnaissance

**Phase 1 Deliverable — Reconnaissance & Ground-Truth Baseline**  
**Audit Date:** November 22, 2026  
**Auditor / Role:** Senior Full-Stack, Security, and AI Engineer (DevGuard AI Core Team)  
**Target Repository:** `github.com/rajendrabist07/dev-guard-ai`  
**Git Baseline Commit:** `b8d7cc2` (`origin/main`)  

---

## Executive Summary

DevGuard AI is designed as an autonomous, multi-tool GitHub PR security review agent built on Next.js 15 (App Router), Supabase Postgres + Auth, Upstash Redis, Groq (`llama-3.3-70b-versatile`), Google Gemini (`gemini-2.0-flash`), and Octokit. 

This comprehensive reconnaissance audit evaluated the current codebase against production engineering, zero-trust security, serverless architectural correctness, and truthfulness standards. 

**Key Audit Outcomes:**
- **Known Findings Verification:** All **13 known audit findings** from the mission brief have been **CONFIRMED** with precise file and line citations.
- **Critical Vulnerabilities:** Remote header-spoofing authentication bypass (IDOR), PostgREST filter injection, client-editable privilege escalation via Supabase `user_metadata`, public unauthenticated access to observability telemetry/logs, and service-role database operations that completely bypass Postgres Row-Level Security (RLS).
- **Truthfulness Gap:** Discrepancies exist between marketing claims (AST parsing, LLM dynamic tool selection, Jest/Vitest execution) and actual implementation (regex line scanning, boolean deterministic flags, static regex invariant checks).
- **Serverless Correctness:** Critical operational telemetry, in-memory caches, rate limits, and a 120-second background watchdog timer rely on ephemeral lambda memory and Node.js process state, which disintegrate across distributed serverless instances.

Below is the complete architectural baseline, inventory, verification evidence, benchmark suite, and prioritized implementation plan.

---

## 1. Route Inventory (Pages & API Endpoints)

The application exposes 5 client/server pages and 10 API routes.

| Route | Type | Methods | Callers | Documented Intent | Real Auth Enforcement | Data Read / Written |
|---|---|---|---|---|---|---|
| `/` (`app/page.tsx`) | Page (RSC/Client) | `GET` | Public Web | Marketing landing page | None (Public) | None |
| `/dashboard` (`app/dashboard/page.tsx`) | Page (Client) | `GET` | Authenticated Users | Repository PR dashboard | App-layer fetch checks; if unauthenticated, loads hardcoded mock metrics and public demo data | Reads `/api/dashboard`, `/api/auth/me` |
| `/observability` (`app/observability/page.tsx`) | Page (Client) | `GET` | Developers / Ops | System health & telemetry | **None (Publicly viewable by anyone)** | Reads `/api/observability` |
| `/try` (`app/try/page.tsx`) | Page (Client) | `GET` | Public Web | Interactive PR diff sandbox | IP-based rate limiting on submission | Posts to `/api/try` |
| `/try/result/[id]` (`app/try/result/[id]/page.tsx`) | Page (Client) | `GET` | Public Web | Permlink for sandbox run | None (Public) | Reads `/api/try/result/[id]` |
| `/api/health` (`app/api/health/route.ts`) | API | `GET` | Monitoring / Uptime | Health check probe | None (Public) | Reads 1 repo from DB; invokes GitHub App Auth probe |
| `/api/dashboard` (`app/api/dashboard/route.ts`) | API | `GET` | Dashboard Frontend | Fetch user PR reviews & metrics | `authenticateRequest(req)` — **vulnerable to `x-github-installation-id` header spoofing** | Reads `repos`, `review_runs`, `findings` via `supabaseAdmin` |
| `/api/auth/me` (`app/api/auth/me/route.ts`) | API | `GET` | Dashboard Frontend | Session identity lookup | Supabase SSR cookie auth | Reads Supabase Auth session |
| `/api/reviews/[id]` (`app/api/reviews/[id]/route.ts`) | API | `GET` | Dashboard / PR link | Fetch single review run details | `authenticateRequest(req)` + `verifyReviewRunOwnership` | Reads `review_runs`, `findings` via `supabaseAdmin` |
| `/api/observability` (`app/api/observability/route.ts`) | API | `GET` | Observability Frontend | Telemetry & error logs | **None (Completely unauthenticated)** | Reads `inMemoryLogBuffer`, `inMemoryTryRuns`, `getReviewRuns()` |
| `/api/try` (`app/api/try/route.ts`) | API | `POST` | `/try` Playground | Analyze submitted git diff | IP rate limit (10 req/10m); no user auth | Writes to `try_runs` table via `supabaseAdmin` or `inMemoryTryRuns` |
| `/api/try/result/[id]` (`app/api/try/result/[id]/route.ts`) | API | `GET` | `/try/result/[id]` | Fetch sandbox run by ID | None (Public permlink) | Reads `try_runs` via `supabaseAdmin` or `inMemoryTryRuns` |
| `/api/try/history` (`app/api/try/history/route.ts`) | API | `GET` | `/try` Playground | Fetch recent runs for session | Reads query param `sessionId` (unauthenticated) | Reads `try_runs` by `session_id` |
| `/api/simulate-review` (`app/api/simulate-review/route.ts`) | API | `POST` | Demo / Test triggers | Execute mock review pipeline | IP rate limit; no user auth | Writes to `inMemorySimulations` |
| `/api/badge/[repoId]` (`app/api/badge/[repoId]/route.ts`) | API | `GET` | GitHub README / Shields | Render SVG security badge | None (Public SVG endpoint); **vulnerable to `.or()` PostgREST SQL injection** | Reads `repos`, `review_runs`, `findings` via `supabaseAdmin` |
| `/api/webhooks/github` (`app/api/webhooks/github/route.ts`) | API | `POST` | GitHub Webhook Dispatch | Process PR open/sync events | HMAC-SHA256 signature verification (`x-hub-signature-256`) | Reads/writes `repos`, `review_runs`, `findings` via `supabaseAdmin` |

---

## 2. Data Model & Schema Source of Truth

### Comparison: `schema.sql` (Root) vs `db/schema.sql`

A file diff (`diff -u db/schema.sql schema.sql`) reveals significant divergence:
1. **Missing Tables:** `db/schema.sql` contains only `installations`, `repos`, `review_runs`, and `findings`. It is completely missing the `try_runs` table and its indexes (`idx_try_runs_session_id`, `idx_try_runs_created_at`).
2. **Missing Row-Level Security (RLS):** `db/schema.sql` defines 0 RLS policies. In contrast, root `schema.sql` defines 12 RLS policies across all 5 tables.
3. **Source of Truth:** **`schema.sql` (root)** is the authoritative production schema specification. `db/schema.sql` is an obsolete legacy subset that must be harmonized or deprecated.

### Table Schema Summary (`schema.sql`)

1. **`installations`**:
   - Columns: `id` (uuid, PK), `github_installation_id` (text, unique, not null), `account_login` (text, not null), `account_type` (text, default 'User'), `created_at` (timestamptz).
   - Indexes: Primary key.
2. **`repos`**:
   - Columns: `id` (uuid, PK), `installation_id` (uuid, FK -> `installations.id` on delete cascade), `github_repo_id` (text), `name` (text, not null), `full_name` (text, not null, unique), `private` (boolean, default false), `is_active` (boolean, default true), `created_at` (timestamptz).
   - Indexes: `idx_repos_installation_id`, `idx_repos_full_name`.
3. **`review_runs`**:
   - Columns: `id` (uuid, PK), `repo_id` (uuid, FK -> `repos.id` on delete cascade), `pr_number` (int, not null), `pr_title` (text), `pr_author` (text), `commit_sha` (text, not null), `status` (text, check in `'queued','running','completed','failed'`), `summary` (text), `tool_calls_count` (int, default 0), `provider_used` (text), `fallback_reason` (text), `agent_trace` (jsonb, default `'[]'`), `is_simulation` (boolean, default false), `error_message` (text), `started_at` (timestamptz, default now()), `completed_at` (timestamptz), `created_at` (timestamptz).
   - Indexes: `idx_review_runs_repo_id`, `idx_review_runs_status`.
4. **`findings`**:
   - Columns: `id` (uuid, PK), `review_run_id` (uuid, FK -> `review_runs.id` on delete cascade), `file_path` (text, not null), `line_number` (int), `rule_id` (text, not null), `severity` (text, check in `'critical','warning','info'`), `category` (text, check in `'security','quality','dependency','performance'`), `message` (text, not null), `suggested_fix` (text), `created_at` (timestamptz).
   - Indexes: `idx_findings_review_run_id`, `idx_findings_severity`.
5. **`try_runs`**:
   - Columns: `id` (uuid, PK), `session_id` (text), `input_type` (text, check in `'sample','pasted'`), `input_snippet` (text, not null), `pr_title` (text), `pr_author` (text), `findings` (jsonb, default `'[]'`), `agent_trace` (jsonb, default `'[]'`), `tool_calls_count` (int, default 0), `summary` (text), `provider_used` (text), `status` (text, default 'completed'), `created_at` (timestamptz).
   - Indexes: `idx_try_runs_session_id`, `idx_try_runs_created_at`.

### RLS Policies & Security Gaps
- `schema.sql` enables RLS on all 5 tables and grants full access to `service_role`.
- **Finding #2 in RLS:** The authenticated user policies for `installations`, `repos`, `review_runs`, and `findings` rely on:
  `(account_login = (auth.jwt() -> 'user_metadata' ->> 'user_name') or account_login = (auth.jwt() ->> 'email'))`
  Because `user_metadata` in Supabase can be mutated directly by client sessions via `supabase.auth.updateUser({ data: { user_name: 'target_org' } })`, this RLS policy permits authenticated privilege escalation.
- **Finding #4:** In `lib/db/supabase.ts`, all database queries instantiate `supabaseAdmin` using `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_KEY`, which completely bypasses all RLS policies in production.

---

## 3. Environment Variable Inventory

| Variable Name | Declared / Used In | Required / Optional | Client Exposed (`NEXT_PUBLIC_*`) | Impact if Missing / Invalid |
|---|---|---|---|---|
| `GITHUB_APP_ID` | `lib/github/client.ts`, `app/api/health/route.ts` | Required (App mode) | No | GitHub App Octokit authentication fails; falls back to `GITHUB_TOKEN`. |
| `GITHUB_APP_PRIVATE_KEY` / `GITHUB_PRIVATE_KEY` | `lib/github/client.ts`, `app/api/health/route.ts` | Required (App mode) | No | Private key decryption fails; Octokit cannot sign App JWTs. |
| `GITHUB_WEBHOOK_SECRET` | `lib/github/client.ts`, `app/api/webhooks/github/route.ts` | Required | No | Webhook HMAC verification fails with status 401; all webhooks rejected. |
| `GITHUB_APP_SLUG` | `components/layout/Navbar.tsx`, `components/dashboard/EmptyState.tsx` | Optional | No | Falls back to `NEXT_PUBLIC_GITHUB_APP_SLUG` or `#`. |
| `NEXT_PUBLIC_GITHUB_APP_SLUG` | `components/layout/Navbar.tsx`, `app/dashboard/page.tsx` | Optional | **Yes** | Install links on navbar/dashboard fall back to static text or `#`. |
| `GITHUB_APP_INSTALL_URL` | `components/layout/Navbar.tsx` | Optional | No | Falls back to `NEXT_PUBLIC_GITHUB_APP_INSTALL_URL`. |
| `NEXT_PUBLIC_GITHUB_APP_INSTALL_URL` | `components/layout/Navbar.tsx`, `app/page.tsx` | Optional | **Yes** | Landing page CTA button links fall back to generic GitHub app install URL. |
| `GITHUB_TOKEN` / `GITHUB_PERSONAL_ACCESS_TOKEN` | `lib/github/client.ts` | Optional | No | Fallback for local smoke testing when GitHub App credentials are not provided. |
| `GROQ_API_KEY` | `lib/agent/llm.ts` | Required (Primary LLM) | No | Groq LLM calls fail; pipeline immediately triggers fallback to Gemini. |
| `GEMINI_API_KEY` | `lib/agent/llm.ts` | Required (Fallback LLM) | No | If Groq fails and Gemini key missing, LLM returns offline degraded review fallback. |
| `SUPABASE_URL` | `lib/db/supabase.ts` | Required | No | Falls back to `NEXT_PUBLIC_SUPABASE_URL`. If both missing, DB falls back to memory Maps. |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/db/supabase.ts`, Supabase client | Required | **Yes** | Browser cannot connect to Supabase Auth. |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/db/supabase.ts`, Supabase client | Required | **Yes** | Client-side Supabase authentication fails. |
| `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | `lib/db/supabase.ts` | Required (Server DB) | No | Server-side database operations fall back to volatile `inMemorySimulations` and `inMemoryTryRuns`. |
| `UPSTASH_REDIS_REST_URL` | `lib/cache/redis.ts`, `lib/security/ratelimit.ts` | Optional | No | Redis caching & distributed rate-limiting disabled; falls back to in-memory Maps. |
| `UPSTASH_REDIS_REST_TOKEN` | `lib/cache/redis.ts`, `lib/security/ratelimit.ts` | Optional | No | Authentication to Upstash fails; falls back to in-memory Maps. |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | `app/api/observability/route.ts`, Sentry config | Optional | **Yes** (if `NEXT_PUBLIC_`) | Error reporting to Sentry disabled; telemetry reports `sentryConfigured: false`. |

---

## 4. Agent Pipeline Architecture & Reality Map

The agent pipeline is orchestrated by `lib/agent/orchestrator.ts`:

```
Webhook / Try Diff
       │
       ▼
[ Orchestrator ] ──(Docs PR?)──► [ Early Exit: No Tool Calls ]
       │
       ├──► [ Tool 1: runLint ] ─────────► Line-by-line Regex pattern matching (No AST)
       ├──► [ Tool 2: runDependencyScan ] ► Regex package.json parse + OSV API HTTP call
       └──► [ Tool 3: runTestRunner ] ────► Static regex search on diff (No real Jest/Vitest)
       │
       ▼
[ Tool Results Aggregator ]
       │
       ▼
[ LLM Layer (callLLM) ] ────────► Groq Llama 3.3 70B (Primary)
       │                           └── Fallback: Gemini 2.0 Flash (mislabeled 2.5 Flash)
       ▼
[ Output Validation ] ──────────► Zod Schema (Bypassed if length >= 10 on parse error)
       │
       ├──► [ Supabase DB ] ────► Saves review_runs and findings via supabaseAdmin
       └──► [ GitHub Octokit ] ──► Validates patch hunks; posts review comment & line remarks
```

### Tool Reality vs Claim Analysis

1. **`lint` (`lib/agent/tools/lint.ts`)**:
   - **Claim:** "AST linter parses syntax trees to eliminate false positives".
   - **Reality:** Splits diff into lines and tests addition lines (`+`) against 8 static regular expressions (`/(?:SELECT|INSERT...).*(\+|\$\{)/i`, `/\b(eval|Function)\s*\(/`, etc.). **0 AST parsing occurs.**
2. **`deps-scan` (`lib/agent/tools/deps-scan.ts`)**:
   - **Claim:** "Scans open source dependencies via OSV database".
   - **Reality:** Performs real HTTP batch queries against `https://api.osv.dev/v1/querybatch`. However, it parses `package.json` with regex/JSON, strips caret/tilde prefixes (`^`, `~`), and queries declared version bounds instead of resolved lockfile versions (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`).
3. **`test-runner` (`lib/agent/tools/test-runner.ts`)**:
   - **Claim:** "Runs tests (Jest/Vitest) in an isolated sandbox to detect regressions".
   - **Reality:** Executes **zero tests**. It inspects the diff text using regex to verify if test files were touched or if checkout/auth strings exist, returning simulated invariant metrics.

---

## 5. Verification of the 13 Known Audit Findings

Every finding from the mission instructions was verified against the codebase:

| # | Audit Finding | Status | File & Line Evidence | Technical Description |
|---|---|---|---|---|
| 1 | Header-based Auth Bypass / Cross-Tenant IDOR | **CONFIRMED** | `lib/security/auth.ts:24-26, 65-113` | `authenticateRequest()` reads `x-github-installation-id`, `x-account-login`, and `x-user-id` directly from request headers. An attacker can set these headers to impersonate any installation or user IDOR. |
| 2 | Privilege Escalation via `user_metadata` | **CONFIRMED** | `lib/security/auth.ts:39, 55`, `schema.sql:117, 127` | Installation ownership matches `user.user_metadata?.user_name`. In Supabase, `user_metadata` is client-mutable via `supabase.auth.updateUser()`. |
| 3 | PostgREST `.or()` Filter Injection | **CONFIRMED** | `lib/security/auth.ts:39`, `app/api/badge/[repoId]/route.ts:43` | Raw string interpolation into Supabase `.or()`: `.or(\`github_installation_id.eq.${identifier},account_login.eq.${identifier}\`)` allows filter breakout and unescaped commas/parentheses manipulation. |
| 4 | Service-Role DB Access Bypassing RLS | **CONFIRMED** | `lib/db/supabase.ts:20, 24` | All database read/write queries instantiate `supabaseAdmin` using `SUPABASE_SERVICE_KEY`, completely bypassing Postgres Row Level Security. |
| 5 | Gemini Model ID & Pricing Label Mismatch | **CONFIRMED** | `lib/agent/llm.ts:47, 55, 294, 325-326` | API calls `gemini-2.0-flash`, but user-facing labels and pricing calculations reference `"Gemini 2.5 Flash"` with incorrect cost math. |
| 6 | Zod Structured Output Length Check Bypass | **CONFIRMED** | `lib/agent/llm.ts:80-86` | When JSON parsing fails, the code evaluates `if (cleaned.length >= 10)` and synthesizes a fallback review structure, bypassing Zod schema validation completely. |
| 7 | Bypassable Prompt-Injection Defense | **CONFIRMED** | `lib/agent/llm.ts:107-121, 129-136` | Sanitization uses a single exact-tag string replace `replace(/<\/?user_content>/g, '')` and a 4-phrase blacklist (`lgtm`, `looks good`, `no issues found`, `ignore previous instructions`). Easily defeated with case changes, unicode, spacing, or alternative injection phrases. |
| 8 | Marketing Claims Contradict Code Reality | **CONFIRMED** | `app/page.tsx:53, 81-82, 91` | Landing page explicitly claims "AST linter", "LLM chooses tools", and "runs tests (Jest/Vitest)". Code uses regex line scanning, deterministic if-conditions, and static string checks. |
| 9 | Fake / Hard-Coded UI Metrics | **CONFIRMED** | `lib/db/supabase.ts:196-198`, `app/dashboard/page.tsx:190, 202`, `app/observability/page.tsx:132-134` | Code hardcodes `$0.000072 avg cost`, `52% savings`, and `1.85s / 3.10s latency` when data is missing. Observability displays "Degraded" with a green pulsing dot at 0 data. |
| 10 | Public Observability & In-Memory State on Serverless | **CONFIRMED** | `app/api/observability/route.ts:8-62`, `lib/observability/logger.ts:26-31` | `/api/observability` has no authentication check. Logs are stored in an in-memory ring buffer array (`inMemoryLogBuffer`) that is lost on every lambda cold start. |
| 11 | Evaluation Overfitting (Train = Test) | **CONFIRMED** | `evals/dataset.json`, `evals/run-real-world-eval.ts`, `lib/agent/calibration.ts:4-14` | The 20 golden eval cases were authored by the same engineer who wrote the regex rules. The calibration constants were hardcoded based on the exact same 20 sample PRs. |
| 12 | OSV Scan Resolves Ranges Instead of Lockfile Versions | **CONFIRMED** | `lib/agent/tools/deps-scan.ts:156-164` | Strips `^` and `~` semver operators from `package.json` dependencies rather than reading exact pinned versions from `package-lock.json` or `pnpm-lock.yaml`. |
| 13 | Serverless Watchdog Timer Flaw | **CONFIRMED** | `app/api/webhooks/github/route.ts:46-61, 238` | `setTimeout(..., 120_000)` watchdog runs inside Next.js `after()`. When deployed on Vercel/AWS Lambda, background execution freeze immediately halts or terminates long timers. |

---

## 6. Serverless Correctness Analysis

Serverless execution environments (e.g., Vercel / AWS Lambda) are stateless, horizontally scalable, and subject to frequent cold starts. The audit identified multiple critical failures regarding in-memory state:

1. **In-Memory Logging Ring Buffer (`lib/observability/logger.ts:27`)**:
   - `const inMemoryLogBuffer: StructuredLogEntry[] = [];` (capacity 100).
   - **Failure Mode:** Every lambda instance maintains an isolated slice of logs. Cold starts wipe previous logs. When multiple users or webhooks trigger concurrent requests across different lambdas, `/api/observability` only reads the logs of the specific instance serving the request.
2. **In-Memory Simulation and Try-Run Stores (`lib/db/supabase.ts:27-28`)**:
   - `export const inMemorySimulations = new Map<string, ...>();`
   - `export const inMemoryTryRuns = new Map<string, TryRun>();`
   - **Failure Mode:** If Supabase environment variables are unset or intermittent, simulation and try runs are stored in local instance memory. A subsequent GET request to `/api/try/result/[id]` hitting a different instance returns 404 Not Found.
3. **Module-Level Rate Limiting Store (`lib/security/ratelimit.ts:5`)**:
   - `const memoryStore = new Map<string, { count: number; resetAt: number }>();`
   - **Failure Mode:** Used when Upstash Redis is not configured. An attacker can bypass the 10 req/10 min rate limit by fanning out requests across multiple serverless lambda instances.
4. **Local Memory OSV Cache & Telemetry Counters (`lib/cache/redis.ts:13, 16-17`)**:
   - `const memoryCache = new Map<...>();`
   - `let totalCacheLookups = 0; let totalCacheHits = 0;`
   - **Failure Mode:** OSV cache hit rate reported on the observability dashboard is calculated from local instance variables. Metrics fluctuate wildly depending on which instance receives the telemetry request.
5. **Background Watchdog Timer (`app/api/webhooks/github/route.ts:46-61`)**:
   - `const watchdogTimer = setTimeout(..., 120_000);` wrapped in `after()`.
   - **Failure Mode:** Node.js `setTimeout` is not durable. Vercel serverless functions terminate background tasks as soon as response lifecycle completes or function execution budget expires (typically 15-60s on standard plans). Long-running timers cannot prevent orphaned runs.

---

## 7. Webhook Route Security & Architecture Review

Analysis of `app/api/webhooks/github/route.ts`:
- **Raw Body Reading:** **Compliant.** Correctly calls `await req.text()` before JSON parsing.
- **Timing-Safe HMAC Verification:** **Compliant.** Uses `@octokit/webhooks-methods` `verify()`, which internally relies on `crypto.timingSafeEqual`.
- **Delivery ID (`x-github-delivery`) Handling:** **FAILED.** The route ignores the `x-github-delivery` header completely. It relies solely on `findExistingReviewRun(storedRepo.id, prNumber, commitSha)` for deduplication, leaving it susceptible to duplicate event replay issues.
- **Payload Size Capping:** **FAILED.** Does not enforce any size limit on `req.text()`. Extremely large pull request payloads could cause memory exhaustion in serverless instances.
- **Unknown Event Type Handling:** **Compliant.** Filters for `eventType === 'pull_request'` and specific actions (`opened`, `synchronize`, `reopened`). Returns HTTP 200 with `{ message: 'Event ignored' }` for all other event types.

---

## 8. Baseline Benchmark Suite Results

Executed strictly against commit `b8d7cc2` on `origin/main`:

### Quality & Test Suite Results
- **TypeScript Typecheck (`npm run typecheck`)**: **PASS** (0 errors, 0 warnings).
- **ESLint (`npm run lint`)**: **PASS** (0 errors, 1 warning in `coverage/block-navigation.js`).
- **Vitest Unit Tests (`npm test`)**: **PASS** (21 test files, 73 tests passed in 1.45s).
- **Agent Evaluations (`npm run eval`)**: **PASS** (20/20 test cases matched, 100% precision/recall/F1, 0 wasted calls, duration 0.05s).
- **Next.js Production Build (`npm run build`)**: **PASS** (17 static/dynamic routes compiled in 5.9s).

### Security Audits
- **npm audit (`npm audit`)**: **FAIL (Exit Code 1)**
  - Total Vulnerabilities: **24** (1 low, 15 moderate, 6 high, 2 critical).
  - High/Critical packages: `@sentry/nextjs`, `next`, `zod`, `vite`.
- **Gitleaks Secret Scan (`gitleaks git --log-opts="--all"`)**: **FAIL (Exit Code 1)**
  - Total Findings Detected: **5 findings** across 72 historical commits.
  - **Audit Analysis:** All 5 findings are synthetic test fixtures (`ghp_mock_token_fixture`, `AIzaSyMockKeyForTestingPurposes12345`, `sk_live_mock_fixture_token_key`) located in:
    - `__tests__/agent/failure-modes.test.ts`
    - `evals/dataset.json`
    - `__tests__/observability/logger.test.ts`
  - **Production Secrets:** 0 real leaked credentials detected. (Gitleaks configuration must ignore test fixtures).

### Performance Benchmarks (Lighthouse Mobile)
Measured on production server (`next start`) with simulated mobile throttling:

| Route | Performance | Accessibility | Best Practices | SEO | Notes |
|---|---|---|---|---|---|
| `/` (Landing Page) | **68** | **84** | **100** | **100** | LCP impact from unoptimized Hero animations and fonts |
| `/try` (Playground) | **99** | **90** | **100** | **100** | Excellent lightweight performance |
| `/dashboard` | **88** | **91** | **96** | **100** | Minor layout shift on metric card rendering |
| `/observability` | **99** | **90** | **100** | **100** | High rendering speed |

---

## 9. Prioritized Implementation Plan (P0 / P1 / P2)

To transform DevGuard AI into a production-grade, secure, and honest showcase without risk of regression, the remediation roadmap is divided into three prioritized phases:

```
┌─────────────────────────────────────────────────────────────┐
│ P0: Zero-Trust Security, Auth Hardening & Secrets Hygiene    │
│ (IDOR elimination, RLS enforcement, Injection prevention)   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ P1: Pipeline Truthfulness, LLM Hardening & Correct Evals     │
│ (Zod enforcement, Lockfile OSV, Prompt Injection, Claims)   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ P2: Serverless Reliability, Real UI States & Performance    │
│ (Durable Redis telemetry, Webhook size caps, Mobile LCP)    │
└─────────────────────────────────────────────────────────────┘
```

### Phase P0: Security Hardening & Zero-Trust Authentication (Critical Priority)
**Goal:** Eliminate all authentication bypasses, IDOR vulnerabilities, SQL/filter injections, and unauthorized database access.
1. **Remove Client-Supplied Header Trust (`lib/security/auth.ts`)**:
   - Completely remove reliance on `x-github-installation-id`, `x-account-login`, and `x-user-id`.
   - Derive user identity exclusively from validated Supabase session tokens (`auth.getUser()`) or validated GitHub App installation tokens.
2. **Eliminate Privilege Escalation via `user_metadata`**:
   - Discontinue mapping installations to `user.user_metadata.user_name`.
   - Store verified GitHub OAuth account IDs in a dedicated link table or verified identity claims.
3. **Parameterize PostgREST Queries (`lib/security/auth.ts`, `app/api/badge/[repoId]/route.ts`)**:
   - Replace string concatenation in `.or()` with parameterized queries or separate `.eq()` clauses.
4. **Protect Observability Routes & Admin Boundaries**:
   - Require authenticated admin sessions for `/api/observability` and `/observability`.
5. **Secrets Hygiene & Gitleaks Whitelist**:
   - Configure `.gitleaksignore` for mock test fixtures; update vulnerable dependencies identified in `npm audit`.
- **Effort Estimate:** 1.5 – 2 Engineering Days.

### Phase P1: Agent Pipeline Truthfulness, LLM Hardening & Real Evals (High Priority)
**Goal:** Align all public claims with real code, harden LLM validation, and ensure evaluation rigor.
1. **Zod Structured Output Enforcement (`lib/agent/llm.ts`)**:
   - Delete the length-based fallback (`cleaned.length >= 10`). Enforce strict Zod schema validation; retry or fail honestly on schema mismatch.
2. **Model ID & Pricing Module Consolidation (`lib/agent/llm.ts`, `lib/config/models.ts`)**:
   - Create a centralized config module declaring exact model IDs (`gemini-2.0-flash`, `llama-3.3-70b-versatile`) and official pricing.
3. **Hardened Prompt-Injection Defense (`lib/agent/llm.ts`)**:
   - Implement robust XML-tag boundary encapsulation, structural separation of instructions and data, and multi-layered sanitization.
4. **Resolved Lockfile Dependency Scanning (`lib/agent/tools/deps-scan.ts`)**:
   - Parse `package-lock.json`, `pnpm-lock.yaml`, and `yarn.lock` for exact pinned versions when available.
5. **Claims vs. Code Realignment (`docs/CLAIMS.md`, `README.md`, `app/page.tsx`)**:
   - Accurately describe the linting engine (pattern-based regex AST rules vs syntax tree) and test runner (static invariant verifier).
6. **Decouple Evaluation Suite (`evals/`)**:
   - Expand evaluation dataset with independent external PRs; remove hardcoded calibration constants tuned to test data.
- **Effort Estimate:** 2 – 2.5 Engineering Days.

### Phase P2: Serverless Resilience & Honest Dashboard UX (Medium Priority)
**Goal:** Fix serverless state fragmentation, eliminate fake metrics, and optimize performance.
1. **Durable Telemetry & Caching**:
   - Migrate observability logs and cache hit counters to Upstash Redis or Supabase rather than ephemeral in-memory module arrays.
2. **Honest Empty States on Dashboard & Observability**:
   - Remove hardcoded `$0.000072`, `52% savings`, and fake latency placeholders. Display authentic empty states when zero reviews exist.
   - Fix status indicator to show "No Data / Standby" instead of "Degraded" when runs are 0.
3. **Webhook Durability & Payload Guardrails (`app/api/webhooks/github/route.ts`)**:
   - Track `x-github-delivery` ID for replay prevention.
   - Enforce a 5MB payload size limit on incoming webhooks.
   - Replace the in-memory 120s `setTimeout` watchdog with a database timestamp sweep or queue job.
4. **Mobile Performance Optimization**:
   - Optimize font loading and landing page hero bundle to bring Mobile Lighthouse Performance to 90+.
- **Effort Estimate:** 1.5 – 2 Engineering Days.

---

## 10. Conclusion & Approval Request

Phase 1 Reconnaissance and Baseline is complete. No application code has been modified in this phase.

**Next Step:** Awaiting user review and formal authorization to begin implementation of **Phase P0 (Zero-Trust Security, Auth Hardening & Secrets Hygiene)**.
