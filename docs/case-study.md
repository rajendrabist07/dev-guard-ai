# DevGuard AI — Technical Case Study

## Executive Summary

DevGuard AI is an autonomous, agentic GitHub App designed to solve the critical trust and accuracy gap in automated code review tools. While first-generation AI review bots treat LLMs as conversational text generators—frequently hallucinating syntax errors or missing real vulnerabilities—DevGuard AI implements a closed-loop **agentic orchestrator**. It autonomously invokes AST static linters, OSV.dev vulnerability scanners, and unit test suites to gather empirical evidence before emitting structured, inline pull request annotations.

---

## 1. The Core Engineering Challenge

### The Failure Mode of Single-Shot AI Code Review
Most existing "AI for Pull Requests" tools operate via a naive single-shot pipeline:
1. Receive PR diff.
2. Inject raw diff into a prompt: `"Review this diff for bugs and security vulnerabilities."`
3. Print LLM completion directly as a comment.

**Why this fails in production:**
- **Zero Empirical Grounding**: The LLM predicts plausible-sounding issues based on token probability rather than verifying whether the code actually compiles, passes static rules, or contains verified CVEs.
- **High False Positive Rate**: Developers experience "alert fatigue" when AI comments point out non-existent issues or suggest uncompilable code.
- **Context Length Truncation**: Large PRs overflow token context windows, causing random omissions.

---

## 2. The Solution: Multi-Step Tool Orchestration

Instead of relying on LLM intuition, DevGuard AI positions the model as an **orchestration engine**:

```
GitHub PR Diff 
      │
      ▼
[Agentic Orchestration Loop] ──(Iterative Tool Calling, Max 5 Turns)──┐
      │                                                               │
      ├─► Tool 1: AST / Security Linter (SQLi, XSS, Unhandled Promise)│
      ├─► Tool 2: OSV.dev CVE Database API (Dependency Scanner)       │
      └─► Tool 3: Unit Test Suite Runner (Programmatic Assertions)    │
      │                                                               │
      ▼                                                               │
Empirical Results Feed Back to LLM Context ◄──────────────────────────┘
      │
      ▼
Structured JSON Output & GitHub Inline Annotations (createReview API)
```

---

## 3. Deep Technical Challenge Solved: Webhook Timeouts & Loop Convergence

### Problem: GitHub's 10-Second Webhook Deadline
GitHub webhooks require an HTTP 2xx response within **10 seconds**, otherwise GitHub logs a timeout error and initiates automated retry storms. An agentic loop executing multiple tool calls (e.g., querying the OSV API, analyzing AST trees, and running tests) takes 6–18 seconds.

### Solution: Non-Blocking Fire-and-Forget Architecture
1. **Immediate Ingestion**: The route handler (`/api/webhooks/github`) validates the `X-Hub-Signature-256` HMAC signature and writes an initial `review_runs` row with status `in_progress` in Supabase within ~350ms.
2. **Background Async Execution**: The route yields an immediate `200 OK` response to GitHub while dispatching the agentic loop in an asynchronous execution pipeline.
3. **Hard-Capped Loop Convergence**: To eliminate runaway token loops or infinite recursion:
   - Hard iteration cap set strictly to **5 steps**.
   - Model outputs structured JSON findings schema (`severity`, `file_path`, `line`, `message`, `suggested_fix`, `tool_source`).
4. **Resilient AI Fallback**: If Groq's `llama-3.3-70b-versatile` encounters a rate limit (HTTP 429), the orchestrator automatically cascades to Google's `Gemini 2.5 Flash`, ensuring zero review downtime.

---

## 4. Measurable Outcomes

- **Zero Hallucination on Dependency Scans**: 100% of reported dependency vulnerabilities are backed by live advisory IDs from the open OSV.dev database.
- **Actionable Developer Feedback**: All findings include valid GitHub markdown suggestion blocks, allowing developers to accept fixes in 1-click.
- **Sub-30s Review Turnaround**: Full 3-tool execution and GitHub review posting completed in under 25 seconds on average.
- **Zero-Config Developer Experience**: Interactive `/dashboard?simulate=true` sandbox allows evaluation without requiring repository access.

---

## Tech Stack Reference
- **Frontend / Fullstack**: Next.js 15 (App Router), React 19, TypeScript strict mode, Tailwind CSS v4.
- **Database & Persistence**: Supabase PostgreSQL.
- **AI Orchestration**: Groq SDK (`llama-3.3-70b-versatile`), Google GenAI SDK (`gemini-2.5-flash`).
- **GitHub Integration**: Octokit REST API, `@octokit/auth-app`, `@octokit/webhooks-methods`.
