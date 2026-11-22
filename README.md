# DevGuard AI

[![CI Pipeline](https://github.com/rajendrabist07/dev-guard-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/rajendrabist07/dev-guard-ai/actions/workflows/ci.yml)
[![Eval Accuracy Gate](https://dev-guard-ai.vercel.app/api/badge/eval-score)](evals/eval-results.json)
[![Technical Case Study](https://img.shields.io/badge/Read-Technical_Case_Study-indigo)](docs/case-study.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald)](LICENSE)

DevGuard AI is an automated code review service that analyzes GitHub pull requests by executing static pattern analysis, dependency vulnerability scanning, and code diff invariant verification before synthesizing review guidance with an AI model. Rather than relying on single-shot LLM prompts on raw diffs, it invokes diagnostic tools to collect concrete evidence, surfaces suggested inline code fixes, and records structured execution traces.

Read the technical analysis: [Building an Eval-Gated, Evidence-Backed AI Code Review Agent](docs/case-study.md), detailing tool execution, regression testing gates, calibration against open-source pull requests, and complexity routing.

---

## Architecture

### GitHub Webhook Flow

```mermaid
flowchart TD
    subgraph GitHub ["GitHub Platform"]
        PR["Pull Request Event (opened / synchronize)"]
        Review["PR Review Comments & Inline Patches"]
    end

    subgraph Ingestion ["Webhook Receiver & Verification"]
        WH["POST /api/webhooks/github"]
        Auth["HMAC-SHA256 Signature Verification"]
        Dedupe["Idempotency Check (repo_id + pr_number + commit_sha)"]
    end

    subgraph Orchestration ["Agent Orchestrator (lib/agent/orchestrator.ts)"]
        DiffFilter["Diff Scope & File Classifier"]
        Linter["Static Pattern Checker (runLinter)"]
        Deps["OSV.dev Vulnerability Query (scanDependencies)"]
        Tests["Security Invariant Validator (runTests)"]
        Synthesis["Multi-Tier Model Synthesis (Groq / Gemini / Fallback)"]
    end

    subgraph Storage ["Database & Cache"]
        Redis[("Upstash Redis Cache (24h TTL)")]
        DB[("Supabase Postgres (review_runs, findings, system_logs)")]
    end

    PR --> WH
    WH --> Auth
    Auth --> Dedupe
    Dedupe -->|New Unique Commit| DiffFilter
    DiffFilter -->|Code Files| Linter
    DiffFilter -->|Manifest Changes| Deps
    DiffFilter -->|Executable Logic| Tests
    Deps <-->|Key: osv:npm:pkg:ver| Redis
    Linter --> Synthesis
    Deps --> Synthesis
    Tests --> Synthesis
    Synthesis --> DB
    Synthesis -->|Octokit REST API| Review
```

### Interactive Playground (`/try`) Flow

```mermaid
flowchart TD
    User["Developer in Browser (/try)"]
    API["POST /api/try"]
    RateLimit["Rate Limiter (5 req / 10 min per IP)"]
    Zod["Zod Payload Validation"]
    Orchestrator["Agent Orchestrator Pipeline"]
    SSE["Server-Sent Events (SSE) Stream"]
    ResultPage["Shareable Review (/try/result/[id])"]

    User -->|Submit Diff or Sample| API
    API --> RateLimit
    RateLimit --> Zod
    Zod --> Orchestrator
    Orchestrator -->|Live Step Progress| SSE
    SSE --> User
    Orchestrator -->|Persist Result (30-day retention)| ResultPage
```

---

## Design Decisions and Tradeoffs

### 1. Tool-Calling with Verification vs. Single-Shot LLM Generation
- **Decision**: The LLM does not generate security findings directly from unverified raw diff text. Instead, deterministic diagnostic tools (`runLinter` for static regex/pattern analysis, `scanDependencies` for OSV.dev vulnerabilities, `runTests` for static security invariant assertions) detect issues first. The model is used to synthesize structured tool outputs into developer guidance.
- **Tradeoff**: Running tools adds small pipeline latency (~1–2 seconds), but eliminates hallucinations. A finding is only reported if a static pattern matched, an OSV.dev record matched, or an invariant check failed.

### 2. Multi-Tier Model Fallback (Groq Llama 3.3 70B -> Gemini 2.0 Flash -> Deterministic Engine)
- **Decision**: Primary inference runs on Groq's `llama-3.3-70b-versatile`. If Groq returns an HTTP 429 rate limit or service error, the pipeline fails over to Google's `gemini-2.0-flash`. If external APIs are unreachable, an offline rule-based deterministic synthesizer formats the review report.
- **Tradeoff**: Supporting multiple providers requires maintaining unified output schemas across different response formats. In return, review runs never crash due to provider downtime or quota exhaustion.

### 3. Execution Safeguard Cap (MAX_ITERATIONS = 5)
- **Decision**: The orchestrator enforces a hard cap of 5 tool calls per review run.
- **Tradeoff**: For extremely large pull requests touching dozens of distinct file categories, execution is bounded to prevent runaway compute spend or memory pressure.

### 4. Upstash Redis Caching for OSV.dev Queries
- **Decision**: Dependency vulnerability query results are cached in Redis using keys formatted as `osv:npm:${packageName}:${version}` with a 24-hour TTL.
- **Tradeoff**: A newly published CVE disclosed within the 24-hour window will not be reflected until the TTL expires or cache invalidates. In exchange, identical dependencies across multiple PRs avoid redundant HTTP requests, cutting dependency analysis latency to sub-millisecond speeds.

---

## Evaluation Results and Validation

DevGuard AI is evaluated across two benchmark suites: a 20-case golden CI regression suite (`evals/dataset.json`), and a 20-case validation suite (`evals/run-real-world-eval.ts`) composed of pull request diffs from 5 open-source repositories (`shadcn-ui/taxonomy`, `calcom/cal.com`, `dubinc/dub`, `novuhq/novu`, `t3-oss/create-t3-app`).

### 1. Golden Benchmark (CI Regression Gate)

| Metric | Score | Target / Threshold | Description |
| :--- | :--- | :--- | :--- |
| **Tool Selection Precision** | **100%** | >= 98% (CI Gate) | Ratio of correctly invoked tools to total tools called |
| **Tool Selection Recall** | **100%** | >= 98% (CI Gate) | Ratio of expected tools invoked to total expected tools |
| **Tool Selection F1 Score** | **100%** | >= 98% (CI Gate) | Harmonic mean of precision and recall |
| **Severity Accuracy** | **100%** | >= 98% (CI Gate) | Exact match on expected severity (`critical`, `warning`, `none`) |
| **Wasted Tool Call Rate** | **0%** | <= 2% (CI Gate) | Tools invoked unnecessarily on non-relevant diffs |
| **Docs-Only Efficiency Gate** | **PASSED** | 100% | 0 tools called on Markdown / docs PRs |

### 2. Validation on Open-Source Diffs

Evaluated across 20 pull request diffs from external repositories:

| Metric | Score | Description |
| :--- | :--- | :--- |
| **Validation Precision** | **88.9%** | 8 true positives caught, 1 false positive out of 9 flags |
| **Validation Recall** | **100%** | 8/8 verified vulnerabilities identified across sample |
| **False Positive Rate** | **8.3%** | 1 benign change flagged out of 12 clean PRs |
| **Overall Accuracy** | **95.0%** | 19/20 pull requests classified with exact fidelity |

Detailed case-by-case classifications and reviewer ground-truth logs are committed in [`evals/real-world-results.json`](evals/real-world-results.json).

---

## Security Architecture

### 1. Zero-Trust Authentication and Database Row-Level Security
- **Cryptographic Identity Verification**: User identity is derived strictly from verified Supabase session tokens or OAuth provider data (`user.identities`). All client-supplied identity headers (`x-account-login`, `x-user-id`, `x-github-installation-id`) are stripped at the edge.
- **Database Row-Level Security**: PostgreSQL RLS is enabled across all application tables. User-initiated read operations use user-scoped clients, ensuring strict multi-tenant isolation.
- **Single Authorization Layer**: Every protected endpoint enforces `requireUser()`, `requireRepoAccess(repoId)`, and `requireReviewRunAccess(runId)` before executing logic.

### 2. Webhook Ingestion Hardening
- **Timing-Safe HMAC Verification**: Validates `X-Hub-Signature-256` using `crypto.timingSafeEqual` with raw request body buffers before JSON parsing.
- **Anti-Replay Delivery Protection**: `X-GitHub-Delivery` UUIDs are stored in a dedicated `webhook_deliveries` table with a unique constraint to reject replayed deliveries.
- **Database Idempotency**: Review run creation uses a PostgreSQL `UNIQUE(repo_id, pr_number, commit_sha)` constraint with `ON CONFLICT DO NOTHING`.

### 3. Prompt Boundary Tagging and Tool Consistency Guard
- **Boundary Enclosure**: Untrusted pull request diffs and titles are wrapped in explicit boundary delimiters.
- **Empirical Tool Consistency Guard**: In [`lib/agent/llm.ts`](lib/agent/llm.ts), `verifyToolConsistencyGuard` cross-verifies model summaries against deterministic tool outputs. If empirical tools detect security findings but the synthesized output proclaims an unearned approval ("LGTM" / "no issues found"), the output is overruled and flagged for human review.

### 4. Outbound Network & SSRF Defenses
- Outbound requests in dependency tooling are restricted to an allowlist of external hosts (`api.osv.dev`). Package names extracted from manifests are validated against the official npm naming regex before URL or cache key construction.

---

## Cost and Telemetry Tracking

- **Dynamic Token Cost Tracking**: Every review run records input/output token usage. Costs are computed dynamically using published provider pricing centralized in [`lib/config/models.ts`](lib/config/models.ts).
- **Latency Percentiles**: End-to-end turnaround times are recorded in database timestamps (`started_at`, `completed_at`), computing p50 and p95 percentiles from real runs.
- **Truthful Dashboard States**: When 0 review runs exist, dashboard metrics display "No data yet" rather than placeholder or estimated numbers.

---

## Local Setup

### Prerequisites
- Node.js 18+
- npm 9+

### 1. Clone & Install
```bash
git clone https://github.com/rajendrabist07/dev-guard-ai.git
cd dev-guard-ai
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Required keys:
```env
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# AI Providers (At least one required)
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key

# GitHub App (Required for live PR reviews)
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Optional: Upstash Redis (Falls back to in-memory cache if omitted)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# Optional: Sentry (Observability)
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Run Test & Evaluation Suites
```bash
# Run unit & integration tests
npm test

# Run orchestrator tool-selection eval suite
npm run eval

# Run full CI check (types, linter, tests, eval, build)
npm run typecheck && npm run lint && npm test && npm run eval && npm run build
```

---

## License

MIT License. See [LICENSE](LICENSE) for details.
