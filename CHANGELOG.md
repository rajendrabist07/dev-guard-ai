# Changelog

All notable changes to **DevGuard AI** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
