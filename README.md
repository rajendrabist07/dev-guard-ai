<div align="center">

# 🛡️ DevGuard AI
### Autonomous PR Security & Code Review Agent
**Empirical Tool-Calling Review Loop • Zero Hallucinations • Production-Grade Security Feedback**

[![CI Pipeline](https://github.com/rajendrabist07/dev-guard-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/rajendrabist07/dev-guard-ai/actions/workflows/ci.yml)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.1-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Groq & Gemini](https://img.shields.io/badge/AI_Engine-Groq_Llama_3.3_|_Gemini_2.5-orange?style=for-the-badge&logo=google)](https://groq.com/)
[![DevGuard AI Badge](https://dev-guard-ai.vercel.app/api/badge/status)](https://dev-guard-ai.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge)](LICENSE)

[Live Demo](https://dev-guard-ai.vercel.app/) • [Interactive Playground (/try)](https://dev-guard-ai.vercel.app/try) • [Security Dashboard](https://dev-guard-ai.vercel.app/dashboard) • [Architecture](docs/architecture.md) • [Changelog](CHANGELOG.md) • [Contributing](CONTRIBUTING.md) • [API Docs](#-api-endpoints)

---

</div>

## 📌 Executive Summary

**DevGuard AI** is an autonomous GitHub App that elevates code review quality from speculative text generation to **empirical evidence gathering**. 

Traditional AI review bots simply feed PR diffs into an LLM and generate speculative comments. DevGuard AI treats the LLM as an **intelligent orchestrator** that actively invokes diagnostic tools (AST static linters, OSV.dev vulnerability scanners, unit test runners) to collect verified proof before generating severity-tagged findings and one-click copyable inline pull request patches.

---

## ⚡ Key Highlights & Core Differentiators

| Feature | DevGuard AI | Traditional AI Review Bots |
| :--- | :--- | :--- |
| **Review Strategy** | **Empirical Tool-Calling Loop** (Linter + OSV Scanner + Test Runner) | Single-shot prompt on raw diff |
| **Evidence Basis** | Real tool logs, AST patterns, CVE databases | LLM guesses & hallucinations |
| **Inline PR Fixes** | GitHub-compatible 1-click suggested code patches | Generic conversational advice |
| **Rate Limit Resilience** | Multi-tier fallback: **Groq 70B ➡️ Gemini 2.5 Flash ➡️ Deterministic Engine** | Crashes on 429 rate-limit errors |
| **Model Transparency** | Expandable Reasoning Trace showing tool I/O payloads & active model | Black-box output |
| **Visual Analytics** | 30-day severity timeline & empirical tool attribution charts | Static numbers or empty state |
| **Deliverables & Export** | Client-side **PDF Compliance Reports** & GitHub Markdown exports | No export options |
| **Public Status Badges** | Dynamic shields.io-compatible SVG badges for repository READMEs | None |
| **Interactive Sandbox** | Dedicated `/try` playground with live streaming progress & shareable URLs | Requires private repository install |

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph GitHub ["GitHub Cloud Platform"]
        PR["Pull Request Event (opened / synchronize)"]
        Review["Inline PR Review Comments & Suggested Patches"]
    end

    subgraph Backend ["Next.js 15 Backend API"]
        WH["/api/webhooks/github<br/>(HMAC-SHA256 Signature Verification)"]
        Octokit["Octokit API Client<br/>(Pulls PR Diffs & Files)"]
        DB[(Supabase Postgres Database)]
    end

    subgraph Agent ["DevGuard Autonomous Agent Loop"]
        Orchestrator["Agent Orchestrator<br/>(Groq Llama 3.3 70B / Gemini 2.5 Flash)"]
        ToolLinter["Tool: runLinter<br/>(AST / Security Rules)"]
        ToolDeps["Tool: scanDependencies<br/>(OSV.dev Vulnerability API)"]
        ToolTests["Tool: runTests<br/>(Test Suite Execution Engine)"]
    end

    subgraph Observability ["Security Dashboard & Observability UI"]
        UI["Web Dashboard (/dashboard)<br/>• 30-Day Trends & Tool Breakdown<br/>• Model Reasoning Trace Inspector<br/>• Dynamic README Badge Generator"]
        Playground["Interactive Playground (/try)<br/>• Step-by-Step Live Progress<br/>• Shareable Public URLs (/try/result/[id])<br/>• PDF / Markdown Compliance Export"]
    end

    PR -->|Webhook Payload| WH
    WH --> Octokit
    Octokit -->|Diff & Files| Orchestrator
    Orchestrator <-->|Max 5 Capped Iterations| ToolLinter
    Orchestrator <-->|Max 5 Capped Iterations| ToolDeps
    Orchestrator <-->|Max 5 Capped Iterations| ToolTests
    Orchestrator -->|Structured Findings JSON| DB
    Orchestrator -->|createReview API| Review
    DB --> UI
    DB --> Playground
```

---

## 🧰 Autonomous Tool Suite

The agent orchestrator dynamically selects from the following tool suite to collect concrete runtime and static evidence:

### 1. AST Security & Code Linter (`lib/agent/tools/lint.ts`)
- Scans modified files for critical vulnerabilities including:
  - **SQL Injection**: Unsanitized query concatenation patterns.
  - **Cross-Site Scripting (XSS)**: Unsafe `dangerouslySetInnerHTML` and `eval()` execution.
  - **Unhandled Promise Rejections**: Missing `try/catch` wrappers around external API invocations.

### 2. Dependency Vulnerability Scanner (`lib/agent/tools/deps-scan.ts`)
- Parses modified manifests (`package.json`, lockfiles).
- Queries the free **OSV.dev Open Source Vulnerabilities Database** (`https://api.osv.dev/v1/query`) for published CVE advisories.
- Flags outdated libraries (e.g., prototype pollution in `lodash`, SSRF vulnerabilities in legacy `axios`).

### 3. Programmatic Test Runner (`lib/agent/tools/test-runner.ts`)
- Executes target project test suites (`Jest`, `Vitest`, `npm test`).
- Captures test assertion failures and correlates them directly to the PR author's modified lines.

---

## 🚀 Advanced Platform Features

### 1. Dedicated Self-Service Playground (`/try`)
- Visitors can test preloaded vulnerability fixtures (SQLi, CVEs, async errors) or paste custom code diffs.
- Real-time step-by-step progress streamed live via **Server-Sent Events (SSE)**.
- Public shareable results at `/try/result/[id]` with zero authentication required.

### 2. Visual Intelligence & Health Analytics
- **Findings Over Time**: 30-day timeline stacked bar chart breaking down daily review volume by severity (Critical, Warning, Info).
- **Tool Source Attribution**: Pie chart demonstrating what percentage of findings originated from the AST linter vs. OSV.dev vs. test runner.
- **Average Time to Review**: Concrete engineering velocity metric measuring turnaround latency from webhook reception to review publication.

### 3. Exportable Compliance Deliverables (`PDF & Markdown`)
- 1-click **Client-Side PDF Document** generation with clean branding, severity summary cards, and Courier-formatted remediation code blocks.
- **GitHub-Flavored Markdown export** and quick clipboard copy for engineering management audit trails.
- Clean positive "ALL CLEAR" state when 0 security issues are detected.

### 4. Model Transparency Panel ("Show Your Work")
- Transparent model attribution badge indicating whether the synthesis was generated by `Groq Llama 3.3 70B`, `Gemini 2.5 Flash`, or deterministic fallback.
- Explicit indicator if a Groq HTTP 429 rate limit triggered an automatic Gemini fallback.
- Expandable step-by-step reasoning trace displaying input parameters and output payloads for each tool call.

### 5. Dynamic Shields.io README Badges
- Dynamic SVG status badge endpoint: `GET /api/badge/[repoId]`
- Embed markdown:
  ```markdown
  [![DevGuard AI Status](https://dev-guard-ai.vercel.app/api/badge/your-repo-id)](https://dev-guard-ai.vercel.app)
  [![Powered by DevGuard AI](https://dev-guard-ai.vercel.app/api/badge/powered-by)](https://dev-guard-ai.vercel.app)
  ```

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router, Server Components & Route Handlers)
- **Frontend**: React 19, Tailwind CSS v4, Lucide Icons, Recharts, jsPDF
- **Database & Storage**: Supabase PostgreSQL
- **AI Orchestration**: Groq SDK (`llama-3.3-70b-versatile`), Google GenAI SDK (`gemini-2.0-flash`)
- **GitHub API**: Octokit REST & App Auth, Webhook Signature Verification (`@octokit/webhooks-methods`)

---

## 💻 Getting Started Locally

### 1. Clone & Install Dependencies
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
Fill in the following credentials:
```env
# GitHub App Configuration
GITHUB_APP_ID=your_github_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_WEBHOOK_SECRET=your_webhook_secret
NEXT_PUBLIC_GITHUB_APP_INSTALL_URL="https://github.com/apps/devguard-agent/installations/new"

# AI Model Keys (Groq with Gemini Fallback)
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key

# Supabase Credentials
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_role_key
```

### 3. Run Automated Invariant & Quality Test Suites
```bash
npm test                   # Runs Vitest unit & integration test suite (27 passing tests)
npm run test:coverage      # Generates v8 code coverage report
npm run test:consistency   # Tests 0-findings/0-runs data invariants across consecutive queries
npm run test:reports       # Validates multi-finding & clean PDF/Markdown generation
npm run test:transparency  # Verifies real tool reasoning trace & LLM model attribution
npm run test:badge         # Asserts SVG badge geometry, text calculations & color rules
```

### 4. Branch Protection & CI Enforcement
The repository includes a GitHub Actions workflow (`.github/workflows/ci.yml`) that triggers on all pull requests and pushes to `main`. It automatically executes:
- TypeScript compilation & type safety (`npm run typecheck`)
- ESLint code quality checks (`npm run lint`)
- Vitest security unit & integration test suites (`npm test`)
- Data consistency & badge invariants (`npm run test:consistency`, `test:badge`, `test:reports`, `test:transparency`)
- Next.js production build validation (`npm run build`)

Weekly automated dependency scanning is configured via Dependabot (`.github/dependabot.yml`).

### 5. Observability & Error Tracking
- **Structured JSON Logging**: All webhook invocations, LLM multi-tier fallbacks, and agent tool executions output structured JSON payloads (`lib/observability/logger.ts`) formatted for Vercel Log Streams and Datadog.
- **Zero-Secret Guarantee**: Built-in regex-based secret scrubber actively redacts API keys (`sk_live_*`, `ghp_*`, `AIza*`), JWT tokens, and cryptographic signatures before writing logs.
- **Sentry Integration**: Unhandled exceptions and fallback events report directly to Sentry with sanitized execution context.
- **Real-Time Health Monitoring**: Inspect live database, GitHub App authentication, and AI provider health at `/api/health`.

### 6. Security Hardening & Safe Execution Architecture
- **Strict Input Validation**: All public endpoints are guarded with typed Zod schemas (`lib/validation/schemas.ts`), strictly enforcing maximum payload sizes (100KB) and rejecting malformed inputs with HTTP 400.
- **Rate Limiting & Abuse Mitigation**: Sliding-window rate limiting via Upstash Redis (`lib/security/ratelimit.ts`) limits requests to 5 per 10 minutes per IP with graceful HTTP 429 response handling and `Retry-After` headers.
- **Zero Arbitrary Execution Sandbox**: The static linter and diagnostic tools operate exclusively via in-memory abstract syntax tree (AST) matching, regular expression inspection, and deterministic mock assertions. **User-submitted code is never executed via `eval()`, `child_process`, or shell subshells**, preventing Remote Code Execution (RCE) and filesystem traversal.
- **HTTP Security Headers**: Automated enforcement of `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and restricted `Permissions-Policy` in `next.config.ts`.

### 7. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📡 API Endpoints

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/api/webhooks/github` | `POST` | Verified GitHub App webhook handler for PR review automation |
| `/api/try` | `POST` | SSE live streaming agent execution endpoint for playground |
| `/api/try/history` | `GET` | Session-based history of past playground reviews |
| `/api/try/result/[id]` | `GET` | Public unauthenticated review result lookup |
| `/api/badge/[repoId]` | `GET` | Dynamic Shields.io SVG status badge generator |
| `/api/dashboard` | `GET` | Security dashboard analytics, repositories & review runs data |
| `/api/health` | `GET` | Real-time system health check & configured service status |

---

## 🛡️ License

Distributed under the MIT License. See [LICENSE](LICENSE) for more details.
