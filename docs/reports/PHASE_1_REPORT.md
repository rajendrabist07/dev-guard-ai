# Phase 1 Reconnaissance & Baseline Report

**Phase:** Phase 1 — Recon and Baseline  
**Date:** November 22, 2026  
**Auditor:** Senior Full-Stack, Security, and AI Engineer  
**Baseline Git Commit:** `b8d7cc2` (`origin/main`)  

---

## 1. Files Changed & Added

Per Phase 1 instructions ("Do not change application code in this phase"):
- **Application Code Files Changed:** `0` (Zero application code modified).
- **Documentation & Baseline Files Added / Updated:**
  - `docs/CLAIMS.md`: Exhaustive 23-item claims-vs-code matrix covering Landing Page, Dashboard, Observability, README, and `FAILURE_MODES.md`.
  - `docs/AUDIT_BASELINE.md`: Full architectural reconnaissance report including Route Inventory, Schema/Data Model comparison, Env Var inventory, Agent Pipeline analysis, Serverless Correctness breakdown, Webhook check, 13 Known Findings verification, Baseline Benchmark results, and Prioritized Implementation Roadmap.
  - `docs/reports/PHASE_1_REPORT.md`: This Phase 1 completion report.

---

## 2. Tests Added

- **Tests Added in Phase 1:** `0` (Per strict Phase 1 constraints, all application modifications and test-first fixes begin in Phase 2 upon user approval).

---

## 3. Exact Commands Run with Pass/Fail Output

All baseline checks were executed on `origin/main` (`b8d7cc2`):

### 1. TypeScript Compilation
- **Command:** `npm run typecheck`
- **Output:**
  ```bash
  > dev-guard-ai@0.1.0 typecheck
  > tsc --noEmit
  # Exit Code: 0 (PASS) - 0 errors, 0 warnings
  ```

### 2. ESLint Static Analysis
- **Command:** `npm run lint`
- **Output:**
  ```bash
  > dev-guard-ai@0.1.0 lint
  > next lint
  ✔ No ESLint warnings or errors (1 warning in coverage/block-navigation.js ignored)
  # Exit Code: 0 (PASS)
  ```

### 3. Vitest Unit & Integration Test Suite
- **Command:** `npm test`
- **Output:**
  ```bash
  > dev-guard-ai@0.1.0 test
  > vitest run
  
  ✓ __tests__/security/crypto.test.ts (4 tests)
  ✓ __tests__/security/ratelimit.test.ts (4 tests)
  ✓ __tests__/security/auth.test.ts (4 tests)
  ✓ __tests__/observability/logger.test.ts (4 tests)
  ✓ __tests__/observability/telemetry.test.ts (3 tests)
  ✓ __tests__/github/client.test.ts (4 tests)
  ✓ __tests__/github/webhook.test.ts (3 tests)
  ✓ __tests__/agent/orchestrator.test.ts (4 tests)
  ✓ __tests__/agent/tools/lint.test.ts (5 tests)
  ✓ __tests__/agent/tools/deps-scan.test.ts (4 tests)
  ✓ __tests__/agent/tools/test-runner.test.ts (3 tests)
  ✓ __tests__/agent/llm.test.ts (4 tests)
  ✓ __tests__/agent/failure-modes.test.ts (4 tests)
  ✓ __tests__/api/health.test.ts (2 tests)
  ✓ __tests__/api/badge.test.ts (2 tests)
  ✓ __tests__/api/dashboard.test.ts (2 tests)
  ✓ __tests__/api/try-pr.test.ts (4 tests)
  ✓ __tests__/api/simulate-review.test.ts (3 tests)
  ✓ __tests__/api/observability.test.ts (3 tests)
  ✓ __tests__/components/PRCard.test.tsx (3 tests)
  ✓ __tests__/components/MetricCard.test.tsx (4 tests)

  Test Files  21 passed (21)
       Tests  73 passed (73)
    Duration  1.45s
  # Exit Code: 0 (PASS)
  ```

### 4. Golden Set Agent Evaluations
- **Command:** `npm run eval`
- **Output:**
  ```bash
  > dev-guard-ai@0.1.0 eval
  > tsx evals/run-eval.ts
  
  Total test cases: 20
  Tool selection precision: 100.0%
  Tool selection recall: 100.0%
  Severity accuracy: 100.0%
  Wasted tool call rate: 0.0%
  Total duration: 0.05s
  # Exit Code: 0 (PASS)
  ```

### 5. Next.js Production Build
- **Command:** `npm run build`
- **Output:**
  ```bash
  > dev-guard-ai@0.1.0 build
  > next build
  
  ▲ Next.js 15.0.3
  Creating an optimized production build ...
  ✓ Compiled successfully in 5.9s
  ✓ Linting and checking validity of types
  ✓ Collecting page data
  ✓ Generating static pages (17/17)
  ✓ Finalizing page optimization
  # Exit Code: 0 (PASS)
  ```

### 6. Dependency Vulnerability Audit
- **Command:** `npm audit`
- **Output:**
  ```bash
  24 vulnerabilities (1 low, 15 moderate, 6 high, 2 critical)
  Critical: next (SSRF / cache poisoning in Next.js 15.0.3), vite (esbuild vulnerability)
  High: @sentry/nextjs, zod (ReDoS), micromatch
  # Exit Code: 1 (FAIL - Pending dependency updates in Phase P0)
  ```

### 7. Gitleaks Secret History Scan
- **Command:** `gitleaks git --log-opts="--all"`
- **Output:**
  ```bash
  5 findings detected across 72 commits
  # Exit Code: 1 (FAIL)
  # Analysis: All 5 findings are synthetic mock test fixtures in __tests__/ and evals/dataset.json.
  # 0 real leaked credentials found. Pending .gitleaksignore in Phase P0.
  ```

### 8. Mobile Lighthouse Audits (Chrome DevTools on `localhost:3000`)
- **Command:** Run via Puppeteer / Lighthouse CLI against `next start` with simulated mobile device & throttling:
  - `/` (Home): **Performance: 68**, Accessibility: 84, Best Practices: 100, SEO: 100
  - `/try` (Playground): **Performance: 99**, Accessibility: 90, Best Practices: 100, SEO: 100
  - `/dashboard`: **Performance: 88**, Accessibility: 91, Best Practices: 96, SEO: 100
  - `/observability`: **Performance: 99**, Accessibility: 90, Best Practices: 100, SEO: 100

---

## 4. Claims-vs-Code Changes

- Created `docs/CLAIMS.md` cataloging **23 distinct marketing, architectural, and operational claims** across the landing page, dashboard, observability dashboard, README.md, and `FAILURE_MODES.md`.
- **Claim Status Summary:**
  - **TRUE:** 8 claims (Multi-model fallback architecture, OSV batch query implementation, PR diff patch hunk line validation, deterministic rule execution, HMAC SHA-256 webhook signature verification, etc.).
  - **PARTIAL:** 8 claims (OSV scans declared semver ranges instead of lockfiles; prompt injection defense uses easily bypassed blacklist; observability ring buffer is ephemeral in serverless; golden evals overfitted).
  - **FALSE:** 7 claims ("AST linter parses syntax trees", "LLM dynamically chooses tools", "Runs Jest/Vitest tests in isolated sandbox", "$0.000072 avg cost and 52% savings at zero runs", "Degraded with green dot at zero data", "Zod structured output guarantees schema compliance").
  - **UNVERIFIABLE:** 0 claims.

---

## 5. Remaining Risks & Discrepancies

1. **Authentication Bypass Risk (Critical):** Any incoming request containing headers `x-github-installation-id`, `x-account-login`, or `x-user-id` can completely impersonate arbitrary GitHub installations or user accounts in `/api/dashboard`, `/api/installations`, and `/api/prs`.
2. **Database Access Layer Risk (High):** `lib/db/supabase.ts` uses `supabaseAdmin` (service role) everywhere, negating all RLS policies in `schema.sql`.
3. **Data Loss on Serverless Restart (High):** Observability telemetry, simulation runs, and local rate-limiting maps are wiped on lambda cold starts.
4. **Vulnerable Dependencies (Moderate/High):** Next.js 15.0.3 and related packages possess known CVEs flagged by `npm audit`.

---

## 6. Items Not Fully Verified in Sandbox

1. **Live GitHub App Webhook Delivery & Comment Posting:** Octokit calls in local sandbox run with mock keys or mock Octokit clients; live GitHub App webhook deliveries from real GitHub servers require deployment with valid GitHub App private keys.
2. **Live Upstash Redis REST Latency:** Evaluated using local in-memory fallback since live Upstash REST credentials were not provided in `.env`.

---

## 7. Next Actions

Phase 1 Recon and Baseline is complete. All findings and baselines are fully documented in `docs/AUDIT_BASELINE.md` and `docs/CLAIMS.md`. Awaiting user approval to proceed to **Phase P0 Implementation**.
