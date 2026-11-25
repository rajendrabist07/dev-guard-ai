# 🚀 DevGuard AI — Production Deployment & Rollback Guide

**Last Updated:** November 2026  
**Stack:** Next.js 15 (App Router), Supabase (PostgreSQL + Auth), Upstash (Redis + QStash), Vercel Serverless

---

## 1. Architecture Overview & Hosting Topology

DevGuard AI is designed for resilient, scalable serverless operations:

```
[GitHub PR Event] 
       │ (HMAC-SHA256 Signed Webhook)
       ▼
[Next.js Webhook Handler (/api/webhooks/github)]
       │
       ├── Deduplication (Redis/DB unique key)
       └── Insert review_run (status: 'queued')
       │
       ▼
[Upstash QStash (Durable Queue)] ──(Exponential Backoff Retries)──┐
       │                                                         │
       ▼                                                         ▼
[Review Worker Endpoint (/api/jobs/review-worker)]      [Dead-Letter Queue]
       │
       ├── Multi-Tool Empirical Pipeline
       │   ├── AST Static Linter (Deterministic)
       │   ├── OSV.dev CVE Batch Scanner
       │   └── Security Invariant Checks
       │
       ├── Adaptive Model Router (Groq 70B / Gemini Flash)
       │
       ├── Persist Results (Supabase PostgreSQL)
       └── Post GitHub Review Comment (REQUEST_CHANGES / COMMENT)
```

---

## 2. Deployment Workflows

### A. Preview Deployments (Per Pull Request)
- Every pull request automatically triggers a Vercel Preview Deployment.
- Preview deployments run with isolated test environment credentials.
- PRs run all automated gates in GitHub Actions: `typecheck`, `lint`, `unit-coverage (>= 85%)`, `integration`, `eval-gate`, `security-audit`, `build`, and `e2e`.

### B. Production Deployment (Branch: `main`)
- Direct pushes to `main` are protected. Merges occur strictly via pull requests that have passed all required CI checks.
- On merge to `main`, Vercel initiates the production build and deployment.
- Once deployed, the post-deployment smoke test verifies live health and playground availability.

---

## 3. Required Environment Variables

Configure these variables in Vercel Project Settings:

| Variable Name | Required | Target | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | Yes | All | Public base URL (`https://dev-guard-ai.vercel.app`) |
| `NEXT_PUBLIC_GITHUB_APP_INSTALL_URL` | Yes | All | GitHub App installation link |
| `SUPABASE_URL` | Yes | Production | Supabase project API URL |
| `SUPABASE_ANON_KEY` | Yes | Production | Supabase anonymous public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Production (Server Only) | Supabase admin service key for RLS bypass |
| `GITHUB_APP_ID` | Yes | Production (Server Only) | GitHub App numeric Application ID |
| `GITHUB_APP_PRIVATE_KEY` | Yes | Production (Server Only) | RSA Private Key for App authentication (newlines as `\n`) |
| `GITHUB_WEBHOOK_SECRET` | Yes | Production (Server Only) | Secret used for HMAC-SHA256 signature verification |
| `UPSTASH_REDIS_REST_URL` | Yes | Production (Server Only) | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Production (Server Only) | Upstash Redis access token |
| `QSTASH_TOKEN` | Yes | Production (Server Only) | Upstash QStash authorization token |
| `QSTASH_CURRENT_SIGNING_KEY` | Yes | Production (Server Only) | Inbound queue signature verification key |
| `QSTASH_NEXT_SIGNING_KEY` | Optional | Production (Server Only) | Next signing key for seamless key rotation |
| `GROQ_API_KEY` | Yes | Production (Server Only) | Primary LLM orchestrator API key (Llama 3.3 70B) |
| `GEMINI_API_KEY` | Yes | Production (Server Only) | Fallback LLM orchestrator API key (Gemini 2.0 Flash) |

---

## 4. Post-Deployment Verification (Smoke Testing)

Immediately following a deployment, run the automated smoke test script:

```bash
# Smoke test against production target
npx tsx scripts/smoke-test.ts https://dev-guard-ai.vercel.app
```

The script validates:
1. `GET /api/health` returns status `200` with database and redis statuses confirmed.
2. `POST /api/try` executes a clean analysis without errors.
3. `GET /` serves the landing page with valid branding and zero client errors.

---

## 5. Rollback Procedures

### A. Instant Vercel Production Rollback (< 30 seconds)
If an unexpected production defect is detected:
1. Open the [Vercel Project Dashboard](https://vercel.com).
2. Navigate to **Deployments**.
3. Locate the previous known-good deployment.
4. Click the three dots (`...`) menu and select **Instant Rollback**.
5. Vercel immediately re-routes 100% of production traffic to the previous deployment build without rebuilding.

### B. Database Migration Rollback
Migrations are versioned sequentially under `db/migrations/`:
1. Check the applied migrations table: `SELECT * FROM _prisma_migrations;` or Supabase migration history.
2. Apply the down migration SQL file if a schema rollback is required.
3. Since migrations are backward-compatible (additive columns only), rollbacks do not break in-flight review runs.

### C. Circuit Breaker Manual Overrides
If an upstream provider (e.g., Groq or GitHub) experiences degraded service:
- The system's adaptive router automatically switches to Google Gemini or the deterministic AST engine.
- To force deterministic execution without external AI calls, set `FORCE_DETERMINISTIC_ROUTING=true` in Vercel environment variables and redeploy.
