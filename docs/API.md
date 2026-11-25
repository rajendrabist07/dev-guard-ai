# DevGuard AI — API Reference & Modular OpenAPI 3.1 Architecture

DevGuard AI follows a **Modular "Code-as-Spec" OpenAPI 3.1.0 Architecture** that derives API documentation directly from runtime Zod validation schemas (`lib/validation/schemas.ts`) and Next.js App Router handlers.

---

## Interactive & Machine-Readable Endpoints

- **Swagger UI:** `GET /api/docs`
- **OpenAPI 3.1.0 JSON:** `GET /api/docs.json`

---

## Architecture

```text
lib/docs/
├── helpers.ts              # Reusable OpenAPI 3.1 DSL (body, envelope, messageOnly, errorResponse, schemaToJson)
├── openapi.ts              # Root OpenAPI 3.1.0 specification aggregator
└── features/
    ├── auth.docs.ts        # /api/auth/me, /api/auth/signout
    ├── reviews.docs.ts     # /api/dashboard, /api/reviews/{id}, /api/badge/{repoId}
    ├── try.docs.ts         # /api/try, /api/try/history, /api/try/result/{id}, /api/simulate-review
    ├── webhooks.docs.ts    # /api/webhooks/github, /api/ingest, /api/jobs/review-worker, /api/jobs/dead-letter
    └── system.docs.ts      # /api/health, /api/observability, /api/cron/watchdog, /api/cron/retention
```

---

## Endpoint Inventory Summary

| Domain | Method & Path | Auth Mechanism | Purpose |
| :--- | :--- | :--- | :--- |
| **Auth** | `GET /api/auth/me` | Supabase Session Cookie / Bearer | Resolve authenticated GitHub user identity |
| **Auth** | `POST /api/auth/signout` | Supabase Session Cookie | Clear session cookies and redirect to `/login` |
| **Dashboard** | `GET /api/dashboard` | Supabase Session (`requireUser`) | Tenant-scoped repositories, runs, and real metrics |
| **Dashboard** | `GET /api/reviews/{id}` | `requireReviewRunAccess` | Fetch review run & findings (public sims or owned repo) |
| **Dashboard** | `GET /api/badge/{repoId}` | Public | Render dynamic SVG security status badge |
| **Playground** | `POST /api/try` | Public (IP Rate-Limited 5/10m) | Analyze diff/code (JSON or SSE stream) |
| **Playground** | `GET /api/try/history` | Public | List up to 30 recent runs for a `sessionId` |
| **Playground** | `GET /api/try/result/{id}` | Public (UUIDv4 + 30d TTL) | Fetch shared playground result (`noindex`) |
| **Playground** | `POST /api/simulate-review` | Public (IP Rate-Limited 5/10m) | Legacy hardened PR simulation endpoint |
| **Webhooks** | `POST /api/webhooks/github` | GitHub HMAC-SHA256 | Verify, dedupe, persist `queued` run, enqueue QStash |
| **Webhooks** | `POST /api/ingest` | GitHub Actions OIDC JWT | Ingest Semgrep, OSV, and test results |
| **Queue** | `POST /api/jobs/review-worker` | Upstash QStash Signature | Execute idempotent PR review pipeline |
| **Queue** | `POST /api/jobs/dead-letter` | Upstash QStash Signature | Mark exhausted retry jobs as `failed` |
| **System** | `GET /api/health` | Public | Live Supabase, GitHub App, and provider readiness |
| **System** | `GET /api/observability` | Edge Middleware (`ADMIN_GITHUB_LOGINS`) | Telemetry, cache stats, and redacted logs |
| **Cron** | `GET /api/cron/watchdog` | `CRON_SECRET` Bearer | Mark stuck `running` jobs (>300s) as `timed_out` |
| **Cron** | `GET /api/cron/retention` | `CRON_SECRET` Bearer | Purge expired `try_runs`, old logs, old deliveries |
