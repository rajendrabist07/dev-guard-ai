# 🛡️ DevGuard AI — Production Failure Modes & Resilience Architecture

This document formalizes DevGuard AI's **defensive engineering principles** and explicit failure-handling mechanisms. Every failure mode below is backed by automated unit tests in the codebase.

---

## 📋 Comprehensive Failure Modes Matrix

| # | Failure Mode | What Happens | How It's Handled (Defensive Architecture) | How It's Tested (Test Proof) |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Malformed LLM Output / Schema Desync** | LLM outputs non-JSON markdown, empty strings, or unparseable structured outputs. | **Zod Schema Validation & Self-Correction Retry**: Output is passed through `LLMOutputSchema.safeParse`. On failure, the orchestrator issues a 1-shot correction prompt. If still malformed, it falls back to the deterministic engine rather than hallucinating findings. | [`__tests__/agent/failure-modes.test.ts`](file:///Users/rajendrabist/Desktop/DevGuard%20AI/__tests__/agent/failure-modes.test.ts) (`Failure Mode 1`) |
| **2** | **External Tool / Dependency Failure** | External CVE database (OSV.dev) times out or test runner encounters an unhandled runtime exception. | **Circuit-Breaker Pattern**: Each diagnostic tool (`runLinter`, `scanDependencies`, `runTests`) is wrapped in an isolated `try/catch` circuit breaker. If a tool fails, it marks the check as explicitly skipped (`"Dependency scan skipped: OSV.dev unreachable"`) rather than crashing the review run. | [`__tests__/agent/failure-modes.test.ts`](file:///Users/rajendrabist/Desktop/DevGuard%20AI/__tests__/agent/failure-modes.test.ts) (`Failure Mode 2`) |
| **3** | **Model Provider Outage / HTTP 429 Rate Limit** | Primary model provider (Groq Llama 3.3 70B) hits free-tier TPM/RPM quotas or service disruption. | **Transparent Multi-Tier Fallback Cascade**: Groq (HTTP 429) ➡️ Google Gemini 2.5 Flash ➡️ Offline Deterministic AST Engine. Fallback status and reason are explicitly recorded in `fallbackTriggered` and `fallbackReason` metadata. | [`__tests__/agent/failure-modes.test.ts`](file:///Users/rajendrabist/Desktop/DevGuard%20AI/__tests__/agent/failure-modes.test.ts) (`Failure Mode 3`) |
| **4** | **Agent Loop Runaway / Infinite Tool Recursion** | A complex multi-file pull request triggers continuous tool dependencies without convergence. | **Hard 5-Iteration Cap (`MAX_ITERATIONS = 5`)**: The orchestrator checks `trace.length < MAX_ITERATIONS` before every tool invocation. If capped, it halts execution cleanly and returns best-available findings. | [`__tests__/agent/failure-modes.test.ts`](file:///Users/rajendrabist/Desktop/DevGuard%20AI/__tests__/agent/failure-modes.test.ts) (`Failure Mode 4`) |
| **5** | **Webhook Replay / Duplicate Delivery** | GitHub sends duplicate webhook retry payloads for the same commit SHA and PR number. | **Database Idempotency Guard**: [`findExistingReviewRun`](file:///Users/rajendrabist/Desktop/DevGuard%20AI/lib/db/supabase.ts) checks for existing runs matching `repo_id + pr_number + commit_sha`. If already completed or running, the webhook returns HTTP 200 `status: duplicate` without re-posting comments. | [`__tests__/agent/failure-modes.test.ts`](file:///Users/rajendrabist/Desktop/DevGuard%20AI/__tests__/agent/failure-modes.test.ts) (`Failure Mode 5`) |

---

## 🔍 Invariant Guarantees

1. **Zero Hallucinated Security Advisories**: Findings are only created from empirical tool sources (`runLinter`, `scanDependencies`, `runTests`).
2. **Zero Code Execution on Host**: User-submitted code is analyzed via static AST parsers and regex patterns, never passed to `eval()` or shell subprocesses.
3. **Always Return Status**: Every review run reaches either a clean `'completed'` or explicit `'failed'` state with actionable diagnostics.
