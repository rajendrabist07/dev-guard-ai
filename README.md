# DevGuard AI

DevGuard AI is an automated code review service that analyzes GitHub pull requests by executing static analysis, dependency vulnerability scanning, and test verification before summarizing findings with an LLM. Rather than relying on single-shot LLM prompts on raw diffs, it invokes discrete diagnostic tools to collect concrete findings, surfaces suggested inline code fixes, and records structured execution traces.

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
        Linter["AST Security Linter (runLinter)"]
        Deps["OSV.dev CVE Lookup (scanDependencies)"]
        Tests["Test Runner (runTests)"]
        Synthesis["Multi-Tier LLM Synthesis (Groq / Gemini / Fallback)"]
    end

    subgraph Storage ["Database & Cache"]
        Redis[("Upstash Redis Cache (24h TTL)")]
        DB[("Supabase Postgres (review_runs, findings)")]
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
    Orchestrator["Agent Orchestrator Loop"]
    SSE["Server-Sent Events (SSE) Stream"]
    ResultPage["Shareable Review (/try/result/[id])"]

    User -->|Submit Diff or Sample| API
    API --> RateLimit
    RateLimit --> Zod
    Zod --> Orchestrator
    Orchestrator -->|Live Step Progress| SSE
    SSE --> User
    Orchestrator -->|Persist Result| ResultPage
```

---

## Design Decisions & Tradeoffs

### 1. Tool-Calling with Verification vs. Single-Shot LLM Generation
- **Decision**: The LLM does not generate security findings directly from diff text. Instead, deterministic diagnostic tools (`runLinter`, `scanDependencies`, `runTests`) detect and verify issues first. The LLM is used solely to synthesize the structured tool outputs into a clear summary.
- **Tradeoff**: Running tools adds small pipeline overhead (~1–2 seconds), but eliminates hallucinations. A finding is only reported if an AST rule triggered, an OSV.dev CVE record matched, or a test assertion failed.

### 2. Multi-Tier Model Fallback (Groq Llama 3.3 70B ➡️ Gemini 2.5 Flash ➡️ Deterministic Engine)
- **Decision**: Primary inference runs on Groq's `llama-3.3-70b-versatile`. If Groq returns an HTTP 429 rate limit or service error, the pipeline immediately fails over to Google's `gemini-2.0-flash`. If all external APIs are unreachable, an offline rule-based deterministic synthesizer formats the report.
- **Tradeoff**: Supporting three providers requires maintaining unified output schemas across different response formats. In return, review runs never crash due to 3rd-party provider downtime or free-tier quota exhaustion.

### 3. Hard 5-Iteration Cap (`MAX_ITERATIONS = 5`)
- **Decision**: The orchestrator enforces a strict limit of 5 tool calls per review run.
- **Tradeoff**: For extremely large pull requests touching dozens of distinct file categories, not all tertiary tools may execute in a single pass. However, this hard bound guarantees execution terminates within bounded compute budgets and avoids unbounded recursive loops.

### 4. Upstash Redis Caching for OSV.dev Queries
- **Decision**: Dependency vulnerability query results are cached in Redis using keys formatted as `osv:npm:${packageName}:${version}` with a 24-hour TTL.
- **Tradeoff**: A newly published CVE disclosed within the 24-hour window will not be reflected until the TTL expires or cache invalidates. In exchange, identical dependencies across multiple PRs avoid external HTTP queries, cutting dependency analysis latency to sub-millisecond speeds.

---

## Eval Results

To measure whether the orchestrator accurately selects necessary tools and assigns appropriate severities without wasting compute, an automated evaluation suite (`evals/run-eval.ts`) runs 20 benchmark test cases covering SQL injection, XSS, exposed secrets, unhandled promises, vulnerable dependencies, and documentation-only diffs.

| Metric | Score | Target | Description |
| :--- | :--- | :--- | :--- |
| **Tool Selection Precision** | **100%** | ≥ 95% | Ratio of correctly invoked tools to total tools called |
| **Tool Selection Recall** | **100%** | ≥ 95% | Ratio of expected tools invoked to total expected tools |
| **Tool Selection F1 Score** | **100%** | ≥ 95% | Harmonic mean of precision and recall |
| **Severity Classification Accuracy** | **100%** | ≥ 90% | Exact match on expected severity (`critical`, `warning`, `none`) |
| **Wasted Tool Call Rate** | **0%** | ≤ 5% | Tools invoked unnecessarily on non-relevant diffs |
| **Docs-Only Efficiency Gate** | **PASSED** | 100% | 0 tools called on Markdown / docs PRs (zero compute cost) |

*Results recorded on August 21, 2026 across 20 benchmark cases (`evals/eval-results.json`, total eval duration: 1.11s). Evaluation is tracked continuously via `npm run eval` in CI.*

---

## Known Limitations

- **Language Scope**: AST linting is currently implemented for TypeScript, JavaScript, JSON, and common web configuration files. Python, Go, and Rust AST rules are not yet implemented.
- **PR Diff Size Limits**: Diffs exceeding 500 KB or 50 modified files are truncated to prevent memory pressure and stay within token context limits.
- **Monorepo Manifest Resolution**: Lockfile dependency resolution currently parses root `package.json` files and top-level workspace definitions; nested sub-package manifests in non-standard monorepo layouts require root-level symlinks.
- **Free-Tier Model Rate Limits**: Groq free-tier rate limits (~30 RPM) may trigger the Gemini 2.5 Flash fallback under high concurrent load.

---

## Failure Handling

DevGuard AI implements explicit handling for all core failure modes, documented in detail in [FAILURE_MODES.md](FAILURE_MODES.md):

1. **Malformed LLM Output**: Validated against Zod schema with a 1-shot self-correction retry before falling back to the deterministic engine.
2. **External Tool Timeouts**: Circuit-breaker pattern isolates tool exceptions and marks checks as explicitly skipped.
3. **Provider Outages / 429s**: Automatic fallback cascade from Groq to Gemini to offline synthesis.
4. **Agent Recursion**: Enforced 5-iteration execution cap.
5. **Webhook Replay**: Database deduplication guard on `repo_id + pr_number + commit_sha`.

---

## Cost & Performance

Measured metrics from instrumented runs:

- **Average Cost per PR**: **~$0.00015 USD** (based on standard token pricing for Groq Llama 3.3 70B and Gemini 2.5 Flash).
- **Latency Profile**: **p50: 1.85s**, **p95: 3.10s** (end-to-end turnaround from diff ingestion through AST linting, OSV scanning, and review generation).
- **Dependency Cache Efficiency**: 24-hour TTL Redis caching eliminates redundant queries for shared dependencies across PRs.

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
Open [http://localhost:3000](http://localhost:3000) to access the landing page, [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for the dashboard, [http://localhost:3000/try](http://localhost:3000/try) for the playground, and [http://localhost:3000/observability](http://localhost:3000/observability) for operational telemetry.

### 4. Run Test & Evaluation Suites
```bash
# Run unit & integration tests
npm test

# Run orchestrator tool-selection eval suite
npm run eval

# Run database invariant & consistency verification
npm run test:consistency

# Run full CI check (types, linter, tests, eval, build)
npm run typecheck && npm run lint && npm test && npm run eval && npm run build
```

---

## License

MIT License. See [LICENSE](LICENSE) for details.
