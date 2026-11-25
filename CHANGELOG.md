# Changelog

All notable changes to **DevGuard AI** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-11-25 — Production Hardening, Durable Pipeline, Real AST & Phase 9 Acceptance

### Security & Authentication (Phase 2)
- Eliminated client-supplied identity header trust (`x-user-id`, `x-account-login`, `x-github-installation-id`) in `lib/security/auth.ts` and stripped them at edge `middleware.ts`.
- Enforced Supabase Auth GitHub OAuth session verification (`getUser()` + `user.identities`) and single authorization layer (`requireUser`, `requireRepoAccess`, `requireReviewRunAccess`).
- Eliminated PostgREST `.or()` string interpolation; enforced Postgres RLS across tenants.
- Hardened `/api/webhooks/github` with `crypto.timingSafeEqual`, 5MB limit, replay deduplication, and `ON CONFLICT DO NOTHING`.

### Truthfulness & Telemetry (Phase 3)
- Removed all fabricated dashboard metrics and hardcoded savings/latency values; centralized model catalog and pricing in `lib/config/models.ts` (fixed Gemini `2.0` vs `2.5` mismatch).
- Added live `pingDatabase()` and `pingRedis()` checks, synchronized observability health states, and centralized secret redaction (`system_logs`).

### Backend Robustness & Analysis Depth (Phases 4–6)
- Replaced fire-and-forget `after()` with Upstash QStash durable queue (`/api/jobs/review-worker`, `/api/jobs/dead-letter`), state machine (`queued -> running -> completed | failed | timed_out`), and Vercel Cron watchdog/retention jobs.
- Added exact lockfile parsing (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) for OSV batch scanning.
- Implemented TypeScript Compiler API AST Security Analyzer (`lib/agent/tools/ast-analyzer.ts`) across 9 CWE classes and companion `actions/devguard-action` with GitHub OIDC `/api/ingest`.
- Unified LLM providers behind `ResilientLLMProvider` with circuit breakers, native tool calling (capped at 5 iterations), strict Zod `ReviewSynthesisSchema`, referential finding-ID validation, and 64-case CI eval gate (`dev` + `held-out`).

### Frontend, Test Pyramid, CI/CD & Documentation (Phases 7–9)
- Built accessible dark design system (`components/ui/*`, WCAG AA contrast, 44px touch targets, `Inter` + `JetBrains Mono`).
- Achieved `86.01%` line coverage across `lib/` (46 suites, 272 tests), Playwright E2E + axe-core audits, k6 load testing, SHA-pinned GitHub Actions, CodeQL, and modular OpenAPI 3.1.0 docs (`/api/docs`, `/api/docs.json`).

---

## [1.2.0] - 2026-08-19 — Enterprise Engineering Discipline (Sprint V1–V5)

### Added
- **Automated Testing Suite (Vitest)**: Complete suite with 35 passing tests across AST linters, OSV dependency scanner, programmatic test runner, orchestrator, and security modules (`__tests__/`).
- **Code Coverage with V8**: Built-in coverage reports measuring `lib/agent` (95.55%) and `lib/agent/tools` (90.62%).
- **GitHub Actions CI Pipeline**: Automated workflow (`.github/workflows/ci.yml`) enforcing type checking, linting, Vitest suites, data invariant checks, and Next.js production builds on every push/PR.
- **Dependabot Security Scanning**: Automated weekly dependency vulnerability checks (`.github/dependabot.yml`) with semver-major protection.
- **Production Observability**: Sentry error tracking, structured JSON logging (`lib/observability/logger.ts`), and recursive zero-secret redaction (`scrubSecrets`).
- **Live Health Check Endpoint**: `/api/health` monitoring Supabase, GitHub App authentication, and AI provider status.
- **Security Hardening & Rate Limiting**: Upstash Redis sliding window limiter (5 requests / 10 mins) on `/api/try` and strict Zod validation schemas (`lib/validation/schemas.ts`).
- **HTTP Security Headers**: Automated CSP, `X-Frame-Options: DENY`, and `X-Content-Type-Options: nosniff` in `next.config.ts`.
- **System Architecture & Developer Docs**: Added `docs/architecture.md` with Mermaid diagrams, `CONTRIBUTING.md`, and complete JSDoc documentation.

---

## [1.1.0] - 2026-08-18 — Intelligence, Reports & Public Badges (Sprint U0–U5)

### Added
- **Visual Intelligence Layer**: Added Recharts analytics dashboard with 30-day severity trends and tool attribution breakdown charts.
- **Exportable Compliance Reports**: One-click client-side PDF export (`jsPDF`) and GitHub Markdown report generator for audit compliance (`lib/reports/export.ts`).
- **Model Transparency Panel**: Expandable "Show Your Work" UI presenting step-by-step tool I/O execution traces and active LLM provider attribution.
- **Multi-Tier LLM Engine**: Groq Llama 3.3 70B primary synthesis with automatic Google Gemini 2.5 Flash fallback on HTTP 429 rate limits.
- **Dynamic Shields.io SVG Status Badge**: Public unauthenticated `/api/badge/[repoId]` generator with customizable labels, colors, and live caching headers.
- **Strict Data Consistency Invariants**: Standardized zero-findings / zero-runs baseline across all components and added automated consistency suite (`scripts/verify-data-consistency.ts`).

---

## [1.0.0] - 2026-08-15 — Interactive Playground & Live Streaming (Sprint T1–T4)

### Added
- **Interactive Playground (`/try`)**: Public zero-setup test page for reviewing sample vulnerabilities or pasted code snippets.
- **Real-Time SSE Streaming**: Live Server-Sent Events showing agent diagnostic progress step-by-step in under 2 seconds.
- **Session History & Shareable URLs**: Saved test run history and persistent shareable result permalinks (`/try/result/[id]`).
- **Mobile Responsive Redesign**: Full layout optimization for mobile and tablet screen widths (375px+).

---

## [0.1.0] - 2026-08-10 — Initial Release & MVP

### Added
- GitHub App webhook integration (`/api/webhooks/github`) with HMAC-SHA256 signature verification.
- Empirical agent orchestrator loop (`runLinter`, `scanDependencies`, `runTests`).
- Automated inline pull request comments with GitHub-compatible 1-click suggested code fixes.
- Supabase PostgreSQL persistence for repositories, review runs, and security findings.
