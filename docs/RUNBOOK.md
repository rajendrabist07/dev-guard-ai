# DevGuard AI — Operations Runbook

This runbook documents production incident response, stuck-run recovery, provider outages, secret rotation, and database restoration procedures.

---

## 1. Stuck Review Runs (`running` > 5 Minutes)

### Detection
- `/api/observability` reports elevated `failedRunsCount` or runs stuck in `running`.
- Automated recovery runs every 5 minutes via Vercel Cron (`vercel.json`) calling `GET /api/cron/watchdog` (authorized by `Authorization: Bearer $CRON_SECRET`).

### Manual Recovery
1. Trigger the watchdog endpoint manually:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/watchdog
   ```
2. Inspect the JSON response (`stuckRunsCount`, `timedOutCount`, `timedOutRunIds`).
3. If QStash retries exhausted, check `/api/jobs/dead-letter` logs in `system_logs` for `DEAD_LETTER_MAX_RETRIES`.

---

## 2. AI Provider Outage (Groq / Gemini)

### Behavior Under Failure
- **Groq 429 / 5xx / Timeout:** `ResilientLLMProvider` (`lib/agent/providers/resilient-provider.ts`) trips its circuit breaker and automatically falls back to `GeminiProvider` (`gemini-2.0-flash`).
- **Dual Provider Outage:** The orchestrator falls back to deterministic synthesis—all AST and OSV findings are preserved and posted to GitHub with a deterministic summary.
- **Budget Exhaustion:** When `checkGlobalLlmBudget()` exceeds the configured daily ceiling, `/api/try` skips LLM calls and returns deterministic findings immediately.

### Operator Actions
1. Check `GET /api/health` and `/observability` for provider status and recent fallback events.
2. Verify `GROQ_API_KEY` and `GEMINI_API_KEY` quotas in vendor consoles.
3. No manual restart is required; circuit breakers self-heal via half-open probes after cooldown.

---

## 3. Upstash Redis or OSV.dev Outage

- **Redis Down:** `lib/cache/redis.ts` degrades gracefully to bounded in-memory caching; `lib/security/ratelimit.ts` logs a warning and preserves availability.
- **OSV.dev Down:** `lib/agent/tools/deps-scan.ts` retries transient failures with jittered backoff (`fetchWithRetry`), trips its circuit breaker, and engages the offline critical CVE fallback table for high-severity known packages (`axios`, `lodash`, `minimist`, etc.).

---

## 4. Secret & Key Rotation

1. **`GITHUB_WEBHOOK_SECRET`**:
   - Generate a new 32-byte hex secret (`openssl rand -hex 32`).
   - Update Vercel Environment Variables first, redeploy, then update the GitHub App Webhook Secret.
2. **`GITHUB_APP_PRIVATE_KEY`**:
   - Generate a new private key in GitHub App Settings.
   - Escape newlines as `\n` and update `GITHUB_APP_PRIVATE_KEY` in Vercel, then revoke the old key in GitHub after verifying `GET /api/health` returns `githubApp.status: "configured"`.
3. **`QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY`**:
   - Rotate in Upstash Console; `Receiver` verifies both current and next keys during zero-downtime rotation.
4. **`CRON_SECRET` / `SUPABASE_SERVICE_KEY`**:
   - Rotate in Supabase / Vercel settings and redeploy immediately.

---

## 5. Supabase Database Restore & Migrations

- **Schema Source of Truth:** `db/migrations/` (consolidated baseline + incremental migrations).
- **Point-in-Time Recovery (PITR):**
  1. In Supabase Dashboard $\to$ Database $\to$ Backups, select the target recovery timestamp prior to the incident.
  2. Restore to a staging project first and verify `review_runs`, `findings`, `repos`, and `installations` row counts.
  3. Re-apply any pending migrations from `db/migrations/` before switching production traffic.
- **Data Retention:** `GET /api/cron/retention` purges expired `try_runs` (>30 days), `system_logs` (>14 days), and `webhook_deliveries` (>7 days).
