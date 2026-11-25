# DevGuard AI — System Architecture

## 1. Core Components

1. **Web UI & Edge Middleware (`app/`, `components/`, `middleware.ts`):**
   - Next.js 15 App Router serving the landing page (`/`), interactive playground (`/try`, `/try/result/[id]`), authenticated dashboard (`/dashboard`, `/dashboard/runs/[id]`), and operator telemetry (`/observability`).
   - Edge middleware strips spoofable identity headers and enforces session / admin allowlist gates.
2. **Webhook & Durable Queue Pipeline (`app/api/webhooks/github`, `lib/queue/qstash.ts`, `app/api/jobs/review-worker`):**
   - Verifies GitHub HMAC-SHA256 signatures, deduplicates `x-github-delivery`, atomically inserts a `queued` run, and dispatches to Upstash QStash.
   - Worker endpoint verifies `upstash-signature`, transitions state (`queued -> running -> completed | failed | timed_out`), executes the review pipeline, and posts inline/summary comments via Octokit.
3. **Deterministic Analysis & AI Orchestration (`lib/agent/`):**
   - **AST Analyzer (`lib/agent/tools/ast-analyzer.ts`):** TypeScript Compiler API visitor checking 9 CWE classes.
   - **Lockfile Scanner (`lib/agent/tools/deps-scan.ts`, `lockfile-parser.ts`):** Resolves exact versions from `package-lock.json`, `yarn.lock`, and `pnpm-lock.yaml`, querying `api.osv.dev` with 24h Upstash Redis caching.
   - **Resilient LLM Provider (`lib/agent/providers/`):** `GroqProvider` (`llama-3.3-70b-versatile`) with circuit breaker and `GeminiProvider` (`gemini-2.0-flash`) fallback, strict Zod output schema (`ReviewSynthesisSchema`), 1-repair retry, and referential finding-ID validation.
4. **Persistence & Observability (`lib/db/supabase.ts`, `lib/observability/`):**
   - Supabase Postgres (`db/migrations/`) with Row-Level Security, redacted structured logging (`system_logs`), and Vercel Cron watchdog/retention jobs (`vercel.json`).

---

## 2. Sequence Diagram — GitHub PR Webhook Flow

```mermaid
sequenceDiagram
    autonumber
    participant GH as GitHub PR / Actions
    participant WH as /api/webhooks/github
    participant DB as Supabase Postgres
    participant QS as Upstash QStash
    participant WK as /api/jobs/review-worker
    participant ORCH as Agent Orchestrator
    participant OSV as OSV.dev + Redis
    participant LLM as Groq / Gemini

    GH->>WH: POST pull_request (x-hub-signature-256)
    WH->>WH: Verify HMAC (timingSafeEqual) & 5MB cap
    WH->>DB: Insert webhook_deliveries (replay dedupe)
    WH->>DB: Insert review_runs (status=queued, ON CONFLICT DO NOTHING)
    WH->>QS: Enqueue ReviewJobPayload
    WH-->>GH: 202 Accepted

    QS->>WK: POST signed job (upstash-signature)
    WK->>DB: Transition queued -> running
    WK->>GH: Fetch PR diff, files, and lockfile at head SHA
    WK->>ORCH: Execute deterministic tools & native tool loop
    ORCH->>ORCH: TS Compiler AST Analyzer (9 CWEs)
    ORCH->>OSV: Batch dependency CVE check (24h Redis cache)
    ORCH->>LLM: Synthesize summary & patches (nonce-wrapped, Zod-validated)
    WK->>GH: Post inline diff-hunk review annotations
    WK->>DB: Save findings & transition running -> completed
```

---

## 3. Sequence Diagram — Interactive Playground (`/try`) Flow

```mermaid
sequenceDiagram
    autonumber
    participant U as Browser (/try)
    participant API as POST /api/try
    participant RL as Upstash Redis Limiter
    participant ORCH as Agent Orchestrator
    participant DB as Supabase Postgres

    U->>API: POST diff/code (TryApiSchema)
    API->>RL: Check IP sliding window (5 req / 10 min)
    alt Rate limit exceeded
        RL-->>API: Blocked
        API-->>U: 429 Too Many Requests + Retry-After
    else Allowed
        API->>RL: Check global daily LLM budget circuit breaker
        API->>ORCH: Run AST + OSV tools + LLM synthesis (or SSE stream)
        ORCH-->>API: Findings + trace + provider attribution
        API->>DB: Persist try_runs (UUIDv4, 30-day TTL)
        API-->>U: 200 OK { reviewRunId, shareUrl, findings, trace }
    end
```
