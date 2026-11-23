# ADR 0003: Durable Queue Pipeline, Lockfile Dependency Resolution, & Multi-Provider Resilience

## Status
Accepted

## Context
In previous sprints, background review execution relied on Next.js 15 `after()`. In serverless environments (e.g. AWS Lambda, Vercel Serverless), `after()` has no guarantee of execution survival if the container is recycled or fails mid-run, and the in-memory 120-second watchdog timer had no persistent execution runtime across cold starts.

Furthermore:
1. Dependency scanning queried package ranges from `package.json` rather than exact resolved versions from repository lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`).
2. Outbound queries to OSV.dev and LLM providers lacked circuit breakers and chunked batch querying.
3. Database queries lacked explicit cursor pagination and data retention cleanup policies.
4. Schema definitions were split between root `schema.sql` and `db/schema.sql`.

## Decision

1. **Durable Asynchronous Job Pipeline**:
   - Replaced fire-and-forget `after()` with Upstash QStash message queuing (`@upstash/qstash`).
   - Webhook handler verifies HMAC, enforces payload limits (5MB), checks delivery replay, inserts `review_runs` (`status: 'queued'`), enqueues to QStash, and returns HTTP 202.
   - Worker endpoint (`/api/jobs/review-worker`) cryptographically verifies the queue signature via `Receiver`, transitions state to `'running'`, executes the review pipeline, and returns 200 on success.
   - Dead-letter route (`/api/jobs/dead-letter`) marks exhausted jobs as `failed` with actionable error diagnostics.
   - Replaced in-memory watchdog with Vercel Cron (`/api/cron/watchdog`, every 5 min) that queries stuck runs (`started_at < now() - 300s`) and transitions them to `'timed_out'`.

2. **Database Single Source of Truth & State Machine**:
   - Established `db/migrations/` as authoritative source of database schema migrations (`0001_initial_schema.sql`, `0002_phase4_robustness.sql`), removing the duplicate root `schema.sql`.
   - Enforced review run state machine: `queued` ➡️ `running` ➡️ `completed` \| `failed` \| `timed_out` with PostgreSQL check constraint and `transitionReviewRunState()` helper.
   - Added indexes on `(repo_id, created_at desc)`, `(status)`, and `(started_at) where status = 'running'`.
   - Introduced cursor-based pagination (`getPaginatedReviewRuns`, `getPaginatedFindings`) to eliminate unbounded table selects.
   - Implemented automated retention cron (`/api/cron/retention`) to prune expired playground runs, old logs (>14d), and stale delivery IDs (>7d).

3. **Lockfile Dependency Resolution & OSV Batch Querying**:
   - Implemented `lib/agent/tools/lockfile-parser.ts` to parse `package-lock.json` (v1/v2/v3), `yarn.lock` (v1/v2+), and `pnpm-lock.yaml` at the PR head SHA via Octokit.
   - Upgraded OSV scanning to `/v1/querybatch` with 50-package chunking, timeout controls, and `osvCircuitBreaker`.
   - Differentiates PR-introduced vs pre-existing vulnerabilities, tagging pre-existing issues as informational to eliminate noise for PR authors.

4. **Resilient Outbound Infrastructure**:
   - Created `lib/resilience/circuit-breaker.ts` (independent breakers for OSV, Groq, Gemini, GitHub, QStash).
   - Created `lib/resilience/fetch-with-retry.ts` enforcing `AbortController` timeouts, exponential backoff with jitter (+/- 25%), and `Retry-After` header parsing.
   - Generated and propagated request-scoped `correlation_id` across logs, DB rows, and queue payloads.

## Consequences

- Review jobs survive container teardowns and can be safely retried.
- Webhook duplicate storms result in exactly 1 run and 1 comment.
- Vulnerabilities reflect real resolved versions in production lockfiles.
- Unbounded selects and memory leaks on serverless are eliminated.
