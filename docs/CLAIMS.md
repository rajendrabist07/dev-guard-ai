# Claims-vs-Code Truthfulness Audit Matrix

This document maps every public claim made across the Landing Page, Dashboard, Observability UI, README, and `FAILURE_MODES.md` against its actual code implementation on `origin/main` (commit `b8d7cc2`).

Status Legend:
- **TRUE**: Code fully implements and verifies the claim.
- **PARTIAL**: Code implements some aspects, but with significant omissions, fallbacks, or caveats.
- **FALSE**: Code directly contradicts the claim, or the claim describes functionality that does not exist.
- **UNVERIFIABLE**: Claim relies on unprovable external attributes or subjective quality marketing statements.

---

## 1. Landing Page (`app/page.tsx`) Claims

| # | Public Claim | Code Location | Actual Code Reality | Status | Evidence / Notes |
|---|--------------|---------------|---------------------|:------:|------------------|
| 1 | "Empirical Tool-Calling Agent — Not Just Plain Diff Comments" | `app/page.tsx:45` | Tools (`runLinter`, `scanDependencies`, `runTests`) are executed before LLM synthesis. | **TRUE** | `lib/agent/orchestrator.ts:159-274` invokes diagnostic tools prior to calling `synthesizeReviewWithLLM`. |
| 2 | "Executes AST static linters" | `app/page.tsx:53`, `app/page.tsx:91` | `lib/agent/tools/lint.ts` | **FALSE** | `runLinter` in `lib/agent/tools/lint.ts` uses plain regular expressions (e.g. `/\b(SELECT\|INSERT)\b/i`), not an Abstract Syntax Tree (AST) parser like Babel, TypeScript AST, or ESLint. |
| 3 | "The LLM orchestrator chooses tools, inspects outputs, and refines findings up to 5 iterations" | `app/page.tsx:81-82` | `lib/agent/orchestrator.ts:56-79` | **FALSE** | The LLM does NOT choose tools. Code contains hardcoded deterministic boolean functions (`shouldRunLinter`, `shouldScanDependencies`, `shouldRunTests`). The LLM is only called once at the end to synthesize the summary text. The "5 iterations" loop does not iterate or self-refine based on LLM decisions. |
| 4 | "Checks OSV vulnerability databases for package.json" | `app/page.tsx:91` | `lib/agent/tools/deps-scan.ts:187-238` | **PARTIAL** | It queries OSV.dev over HTTP, but strips semver ranges (`^`, `~`) from `package.json` rather than resolving exact lockfile dependencies, leading to false positives/negatives. |
| 5 | "Runs unit test suites (Jest/Vitest) for zero hallucinations" | `app/page.tsx:91` | `lib/agent/tools/test-runner.ts:22-68` | **FALSE** | It never runs Jest, Vitest, or any test subprocess. `runTests` checks diff strings for regex invariants (`fetch` without `catch`, unparameterized queries). |
| 6 | "Inline GitHub Review Annotations with file-line anchors" | `app/page.tsx:99-102` | `lib/github/client.ts:153-240` | **TRUE** | `postGitHubReviewComment` maps findings to diff hunks and posts review comments via `@octokit/rest` `pulls.createReview`. |

---

## 2. Dashboard (`app/dashboard/page.tsx`) Claims

| # | Public Claim | Code Location | Actual Code Reality | Status | Evidence / Notes |
|---|--------------|---------------|---------------------|:------:|------------------|
| 7 | "Avg Cost / Review: $0.000072 (52% savings vs $0.000150 baseline)" | `app/dashboard/page.tsx:187-191`, `lib/db/supabase.ts:196-198` | Hardcoded constants | **FALSE** | When `realReviewRuns.length > 0`, `lib/db/supabase.ts` hardcodes `avgCostPerReviewUsd = 0.000072` and `adaptiveRoutingCostSavingsPercentage = 52.0`. On 0 runs, `app/dashboard/page.tsx` line 190 falls back to `0.000072`. Numbers are fabricated. |
| 8 | "Pipeline Latency (p50 / p95): 1.85s / 3.10s" | `app/dashboard/page.tsx:202` | Hardcoded fallback | **FALSE** | When `stats.p50LatencySeconds` or `p95LatencySeconds` is 0 or null, UI displays `'1.85s' / '3.10s'`, inventing latency metrics when 0 runs exist. |
| 9 | "Adaptive complexity routing (Llama 70B ➡️ Flash ➡️ Fast)" | `app/dashboard/page.tsx:193`, `lib/agent/router.ts` | Routing not connected to LLM tier | **FALSE** | `router.ts` calculates a `recommendedModelTier`, but `orchestrator.ts` ignores it and always calls Groq Llama 3.3 70B for both `standard` and `complex` diffs. |
| 10 | "Monitored Repositories Status: Active" | `app/dashboard/page.tsx:273` | Hardcoded string & badge | **PARTIAL** | The card displays `Status: {repo.is_active ? 'Active' : 'Inactive'}` from the DB, but always displays a static green `Active` badge on line 279 regardless of `repo.is_active`. |
| 11 | "24-hour TTL manifest deduplication on Upstash Redis" | `app/dashboard/page.tsx:215` | `lib/cache/redis.ts:69-81` | **PARTIAL** | Works if Upstash environment variables are set; otherwise silently falls back to an in-memory Map that is lost across serverless lambdas. |

---

## 3. Observability & Operator Telemetry (`app/observability/page.tsx`) Claims

| # | Public Claim | Code Location | Actual Code Reality | Status | Evidence / Notes |
|---|--------------|---------------|---------------------|:------:|------------------|
| 12 | "Protected Operator Telemetry" | `app/api/observability/route.ts:8` | Unprotected endpoint | **FALSE** | `GET /api/observability` had no authentication check; anyone could curl it and read internal review run logs, error traces, and cache stats. |
| 13 | "System Health: Operational (green dot) / Degraded" | `app/observability/page.tsx:132-134` | Hardcoded green dot | **FALSE** | The pulse dot is hardcoded to `bg-emerald-500`. If `data?.systemStatus` is falsy or 'degraded', the UI displays "Degraded" alongside a green pulsing dot. |
| 14 | "Live Structured JSON Ring Buffer Logs" | `lib/observability/logger.ts:25-31` | Ephemeral in-memory array | **FALSE** | `inMemoryLogBuffer` is a module-level JavaScript array (`LOG_BUFFER_CAPACITY = 100`). On serverless runtimes, each lambda invocation is isolated, and memory is destroyed upon instance termination. Logs do not aggregate across invocations. |
| 15 | "Model Fallback: Groq 429 ➡️ Gemini 2.5 Flash" | `lib/agent/llm.ts:294`, `app/observability/page.tsx:148` | Calls `gemini-2.0-flash` | **FALSE** | Model ID passed to Google SDK is `gemini-2.0-flash`. The provider label and cost calculations refer to "Gemini 2.5 Flash", a model label mismatch. |

---

## 4. Architecture, Security & Failure Modes (`README.md`, `FAILURE_MODES.md`, `docs/`) Claims

| # | Public Claim | Code Location | Actual Code Reality | Status | Evidence / Notes |
|---|--------------|---------------|---------------------|:------:|------------------|
| 16 | "Zero-trust client authentication & RLS enforcement" | `lib/security/auth.ts`, `schema.sql` | Client headers trusted; RLS bypassed | **FALSE** | `auth.ts` trusted `x-account-login` and `x-github-installation-id` headers directly (Finding 1), used user-editable `user_metadata` (Finding 2), and backend queries use `supabaseAdmin` service role key, bypassing RLS entirely (Finding 4). |
| 17 | "Strict Zod Schema Validation & Self-Correction Retry" | `lib/agent/llm.ts:67-90` | Accepts any string >= 10 chars | **FALSE** | `parseAndValidateStructuredLLMOutput` tries JSON.parse, and if it fails, falls back to accepting any text where `cleaned.length >= 10`. The Zod schema is effectively bypassed. |
| 18 | "Empirical Tool Consistency Guard & Prompt Injection Defense" | `lib/agent/llm.ts:98-136` | Regex tag strip + phrase blacklist | **FALSE** | Defense relies on single `.replace(/<\/untrusted_diff>/gi, '')` (bypassable via nested tags or alternative tags) and a blacklist of phrases (`lgtm`, `no issues found`), easily bypassed via semantic paraphrasing. |
| 19 | "Non-Blocking Immediate 202 Acknowledgment & 2-Minute Safety Watchdog" | `app/api/webhooks/github/route.ts:46-61` | `setTimeout` inside `after()` | **FALSE** | On Vercel Serverless Functions, background processes in `after()` terminate when the lambda exits (15s/60s). A 120-second `setTimeout` will never execute if the platform kills the function earlier. |
| 20 | "Database Idempotency Guard on duplicate webhooks" | `app/api/webhooks/github/route.ts:193-208` | `findExistingReviewRun` | **TRUE** | Checks `repo_id`, `pr_number`, and `commit_sha`. If already completed or running, returns HTTP 200 `status: duplicate`. |
| 21 | "Circuit-Breaker Pattern on external diagnostic tools" | `lib/agent/orchestrator.ts:174,211,251` | Tool execution try/catch blocks | **TRUE** | Each tool invocation is wrapped in an individual `try/catch` block that records diagnostic error traces without crashing the overall orchestrator. |
| 22 | "Hard 5-Iteration Cap (`MAX_ITERATIONS = 5`)" | `lib/agent/orchestrator.ts:41,119,163,210,250` | Loop checks `trace.length < MAX_ITERATIONS` | **PARTIAL** | The orchestrator checks the cap, but execution is purely linear (lint -> deps -> test -> llm), never looping or iterating. |
| 23 | "Real-World Benchmark Evaluation across 20 production repositories" | `evals/`, `docs/case-study.md` | Single-author synthetic dataset | **PARTIAL** | Evaluated on 20 cases, but golden test dataset and rule regexes were authored by the same engineer (train = test); calibration was fitted to the exact 20 PRs reported. |
