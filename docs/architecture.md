# 📐 DevGuard AI System Architecture

DevGuard AI is designed around an **empirical tool-calling agent loop**. Rather than relying on LLM text completions over raw pull request diffs, DevGuard AI operates as an intelligent orchestrator that gathers verified evidence through AST linters, CVE databases, and test runners before synthesizing structured review findings.

---

## 🔄 End-to-End Request Flows

### 1. GitHub Webhook Autonomous Review Flow

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant GH as GitHub (Pull Request)
    participant Webhook as /api/webhooks/github
    participant Orch as Agent Orchestrator
    participant Tools as Diagnostic Tools (Lint / Deps / Tests)
    participant LLM as Multi-Tier LLM (Groq / Gemini)
    participant DB as Supabase PostgreSQL
    participant Observability as Logger & Sentry

    Dev->>GH: Open or Synchronize Pull Request
    GH->>Webhook: POST Webhook (x-hub-signature-256)
    
    rect rgb(240, 245, 255)
        Note over Webhook: 1. Cryptographic HMAC-SHA256 Verification
        Webhook->>Webhook: verifyGitHubWebhook(body, signature)
    end

    Webhook->>DB: createReviewRun(status: "running")
    Webhook->>GH: fetchPullRequestDiff(Octokit)
    GH-->>Webhook: Unified Git Diff & Files List

    rect rgb(250, 245, 255)
        Note over Orch,Tools: 2. Empirical Evidence Gathering Loop (Max 5 Iterations)
        Webhook->>Orch: runAgentOrchestrator(diff, files, reviewRunId)
        Orch->>Tools: runLinter(files, diff) [AST Check]
        Tools-->>Orch: Lint Result (SQLi, XSS, Secret Leaks)
        Orch->>Tools: scanDependencies(package.json) [OSV.dev]
        Tools-->>Orch: Known CVE Advisories
        Orch->>Tools: runTests(testFilePath, diff) [Unit Runner]
        Tools-->>Orch: Test Failure Assertions
    end

    rect rgb(255, 250, 240)
        Note over Orch,LLM: 3. Multi-Tier Synthesis & Fallback
        Orch->>LLM: synthesizeReviewWithLLM(toolOutputs)
        alt Groq Primary Active
            LLM-->>Orch: Groq Llama 3.3 70B Summary
        else Groq 429 Rate Limited
            LLM->>Observability: Sentry Warning Breadcrumb
            LLM-->>Orch: Gemini 2.5 Flash Fallback Summary
        else Offline / No Keys
            LLM-->>Orch: Deterministic Engine Summary
        end
    end

    Webhook->>GH: postGitHubReviewComment(Inline Fixes & Badges)
    Webhook->>DB: saveFindings(findings) & updateReviewRun(status: "completed")
    Webhook->>Observability: logger.info("Review completed")
    Webhook-->>GH: HTTP 200 OK
```

---

### 2. Interactive Playground Flow (`/try`)

```mermaid
sequenceDiagram
    autonumber
    actor User as Visitor / Reviewer
    participant Page as Browser (/try)
    participant TryAPI as /api/try (SSE Stream)
    participant RateLimit as Upstash Redis Rate Limiter
    participant Orch as Agent Orchestrator
    participant DB as Supabase PostgreSQL

    User->>Page: Select Sample or Paste Code Snippet
    Page->>TryAPI: POST /api/try (Accept: text/event-stream)
    
    rect rgb(255, 240, 240)
        Note over TryAPI,RateLimit: Rate Limit & Validation
        TryAPI->>RateLimit: checkRateLimit(Client IP)
        alt Over 5 requests / 10 mins
            RateLimit-->>TryAPI: Blocked (Remaining: 0)
            TryAPI-->>Page: HTTP 429 (Retry-After)
        else Allowed
            RateLimit-->>TryAPI: Allowed
        end
        TryAPI->>TryAPI: Zod Schema Validation (Max 100KB)
    end

    TryAPI->>DB: createTryRun(status: "running")

    rect rgb(240, 255, 245)
        Note over TryAPI,Orch: Real-Time SSE Progress Streaming
        TryAPI->>Orch: runAgentOrchestrator(progressCallback)
        Orch-->>TryAPI: Step 1: Running AST Static Linter
        TryAPI-->>Page: SSE event: {"type":"progress","step":1}
        Orch-->>TryAPI: Step 2: Querying OSV.dev Database
        TryAPI-->>Page: SSE event: {"type":"progress","step":2}
        Orch-->>TryAPI: Step 3: Running Automated Test Suites
        TryAPI-->>Page: SSE event: {"type":"progress","step":3}
        Orch-->>TryAPI: Step 4: Multi-Tier LLM Synthesis
        TryAPI-->>Page: SSE event: {"type":"progress","step":4}
    end

    Orch-->>TryAPI: Orchestration Result (Findings + Trace)
    TryAPI->>DB: updateTryRun(status: "completed")
    TryAPI-->>Page: SSE event: {"type":"complete","findings":[...]}
    Page->>User: Render Findings, Inline Fixes & Model Transparency Trace
```

---

## 🛡️ Core Architectural Invariants

1. **Empirical Verification First**:
   - Zero LLM hallucination on raw code. Every finding is anchored to an empirical tool execution (`runLinter`, `scanDependencies`, `runTests`).
2. **Hard Iteration Limit**:
   - `MAX_ITERATIONS = 5` strictly bounds loop cycles, preventing runaway compute or recursion.
3. **Multi-Tier Model Resilience**:
   - Primary: **Groq Llama 3.3 70B** (high throughput)
   - Fallback: **Google Gemini 2.5 Flash** (rate-limit resilience)
   - Offline: **Deterministic Rule Engine** (zero external downtime)
4. **Zero Code Execution on Pasted Snippets**:
   - All diagnostic tools operate via in-memory abstract syntax tree analysis and regex scanners. User-provided code is never evaluated with `eval()` or executed in system shells.
5. **Defense-in-Depth Security**:
   - Webhooks validated via HMAC-SHA256.
   - External inputs sanitized and type-checked via Zod schemas.
   - Public endpoints rate-limited via Upstash Redis sliding window.
