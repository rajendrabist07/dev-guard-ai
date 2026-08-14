<div align="center">

# 🛡️ DevGuard AI
### Autonomous PR Security & Code Review Agent
**Empirical Tool-Calling Review Loop • Zero Hallucinations • Production-Grade Security Feedback**

[![Next.js 15](https://img.shields.io/badge/Next.js-15.1-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Groq & Gemini](https://img.shields.io/badge/AI_Engine-Groq_Llama_3.3_|_Gemini_2.5-orange?style=for-the-badge&logo=google)](https://groq.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge)](LICENSE)

[Live Demo](https://dev-guard-ai.vercel.app/) • [Dashboard](https://dev-guard-ai.vercel.app/dashboard) • [Architecture](#-system-architecture) • [Getting Started](#-getting-started) • [API Docs](#-api-endpoints)

---

</div>

## 📌 Executive Summary

**DevGuard AI** is an autonomous GitHub App that elevates code review quality from speculative text generation to **empirical evidence gathering**. 

Traditional AI review bots simply feed PR diffs into an LLM and generate speculative comments. DevGuard AI treats the LLM as an **intelligent orchestrator** that actively invokes diagnostic tools (AST static linters, OSV vulnerability scanners, unit test runners) to collect verified proof before generating severity-tagged findings and one-click copyable inline pull request patches.

---

## ⚡ Key Highlights & Core Differentiators

| Feature | DevGuard AI | Traditional AI Review Bots |
| :--- | :--- | :--- |
| **Review Strategy** | **Empirical Tool-Calling Loop** (Linter + OSV Scanner + Test Runner) | Single-shot prompt on raw diff |
| **Evidence Basis** | Real tool logs, AST patterns, CVE databases | LLM guesses & hallucinations |
| **Inline PR Fixes** | GitHub-compatible 1-click suggested code patches | Generic conversational advice |
| **Rate Limit Resilience** | Multi-tier fallback: **Groq 70B ➡️ Gemini 2.5 Flash ➡️ Deterministic Engine** | Crashes on 429 rate-limit errors |
| **Observability** | Full multi-step Agent Trace Inspector on web dashboard | Black-box output |
| **Zero-Config Demo** | Built-in interactive sandbox for live simulation | Requires full repo access to test |

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

    subgraph Frontend ["Security Dashboard & Observability UI"]
        UI["Web Dashboard (/dashboard)<br/>• Repository Status<br/>• Step-by-Step Tool Trace Viewer<br/>• Interactive PR Simulation Engine"]
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

## 📁 Repository Structure

```
devguard-ai/
├── app/
│   ├── api/
│   │   ├── webhooks/github/route.ts   # GitHub Webhook HMAC-SHA256 receiver
│   │   ├── reviews/[id]/route.ts      # Review run details & findings API
│   │   └── simulate-review/route.ts   # Interactive live demo simulation endpoint
│   ├── dashboard/page.tsx             # Main Security Dashboard & review history
│   ├── page.tsx                       # Landing page & feature showcase
│   ├── globals.css                    # Tailwind CSS v4 styling & dark theme tokens
│   └── layout.tsx                     # Root layout with metadata
├── components/
│   ├── Navbar.tsx                     # Header navigation with quick links
│   ├── ReviewDetailModal.tsx          # Multi-step agent trace & findings inspector
│   └── SimulateReviewModal.tsx        # Live PR review simulation drawer
├── lib/
│   ├── agent/
│   │   ├── orchestrator.ts            # Core agentic loop with Groq / Gemini tool calling
│   │   └── tools/
│   │       ├── lint.ts                # AST static linter & security scanner
│   │       ├── deps-scan.ts           # OSV.dev dependency vulnerability scanner
│   │       └── test-runner.ts         # Programmatic test suite runner
│   ├── db/
│   │   ├── supabase.ts                # Typed Supabase client & fallback mock store
│   │   └── types.ts                   # TypeScript interfaces (Installations, Runs, Findings)
│   └── github/
│       └── client.ts                  # Octokit wrapper for diff fetching & review posting
├── schema.sql                         # PostgreSQL schema for Supabase
├── .env.example                       # Environment variables reference template
├── vercel.json                        # Vercel deployment configuration
└── tsconfig.json                      # TypeScript strict compiler configuration
```

---

## 🗄️ Database Schema

DevGuard AI utilizes Supabase Postgres for durable tracking of installations, review runs, findings, and tool execution traces:

```sql
-- 1. GitHub Installations
CREATE TABLE installations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  github_installation_id BIGINT UNIQUE NOT NULL,
  account_login TEXT NOT NULL,
  account_avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Repositories
CREATE TABLE repos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  installation_id UUID REFERENCES installations(id) ON DELETE CASCADE,
  github_repo_id BIGINT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  default_branch TEXT DEFAULT 'main',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Review Runs
CREATE TABLE review_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repo_id UUID REFERENCES repos(id) ON DELETE CASCADE,
  pr_number INT NOT NULL,
  pr_title TEXT NOT NULL,
  pr_author TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  tool_calls_count INT DEFAULT 0,
  agent_trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 4. Findings
CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_run_id UUID REFERENCES review_runs(id) ON DELETE CASCADE,
  severity TEXT CHECK (severity IN ('critical', 'warning', 'info')),
  file_path TEXT NOT NULL,
  line INT NOT NULL DEFAULT 1,
  message TEXT NOT NULL,
  suggested_fix TEXT,
  tool_source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 🚀 Getting Started

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

```env
# GitHub App Configuration
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret_string
GITHUB_TOKEN=ghp_optional_fallback_token

# AI Model Keys (Groq Llama 3.3 70B & Gemini 2.5 Flash Fallback)
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key

# Supabase Postgres Database
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

> [!TIP]
> **Graceful Degradation**: DevGuard AI includes built-in mock fallback handling. If you run the project locally without external API keys, the dashboard and simulation loop will execute smoothly with deterministic tool outputs.

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the landing page and [http://localhost:3000/dashboard](http://localhost:3000/dashboard) to explore the dashboard.

### 4. Build & Type Check

```bash
npm run lint
npm run build
```

---

## ⚙️ Setting Up the GitHub App

To connect DevGuard AI to live GitHub repositories:

1. Navigate to **GitHub Settings ➡️ Developer Settings ➡️ GitHub Apps ➡️ [New GitHub App](https://github.com/settings/apps/new)**.
2. Fill in the required parameters:
   - **Homepage URL**: `https://dev-guard-ai.vercel.app`
   - **Webhook URL**: `https://dev-guard-ai.vercel.app/api/webhooks/github`
   - **Webhook Secret**: Your generated secret string (`GITHUB_WEBHOOK_SECRET`).
3. Set **Repository Permissions**:
   - **Pull requests**: `Read and write` (to post review comments and approve/request changes).
   - **Contents**: `Read-only` (to inspect file diffs).
4. Set **Subscribe to Events**:
   - Check `Pull request` events.
5. Create the App, download your `.pem` Private Key, and note your `App ID`.
6. Click **Install App** in the left sidebar and select the repositories you want DevGuard AI to monitor.

---

## 🌐 API Endpoints

### `POST /api/webhooks/github`
Webhook endpoint receiving live GitHub PR events (`opened`, `synchronize`, `reopened`). Validates the `X-Hub-Signature-256` header, triggers the agentic review loop, and writes findings to GitHub and Supabase.

### `POST /api/simulate-review`
Sandbox execution endpoint allowing developers and demo judges to test the agent on custom or preset diffs.
- **Request Body**:
  ```json
  {
    "prTitle": "feat: payment checkout endpoint refactor",
    "prAuthor": "alex-dev",
    "diff": "--- a/app/api/checkout/route.ts\n+++ b/app/api/checkout/route.ts...",
    "fileNames": ["app/api/checkout/route.ts", "package.json"]
  }
  ```
- **Response**: Returns the complete review run status, tool execution trace steps, and severity-categorized findings.

### `GET /api/reviews/[id]`
Fetches the execution history, status, and findings for a specific review run ID.

---

## 🔒 Security & Best Practices

- **Signature Verification**: All incoming webhooks are validated against `X-Hub-Signature-256` using HMAC SHA-256 before any payload processing.
- **Iteration Capping**: The autonomous loop is hard-capped at **5 iterations** to eliminate runaway token consumption and infinite loops.
- **Secret Protection**: API private keys and tokens are securely isolated to server-side routes; `.env` files are excluded from version control.
- **Least Privilege Access**: GitHub App requests only minimal required permissions (`Pull requests: write`, `Contents: read`).

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue.

1. Fork the repository
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

<div align="center">
Built with precision for developers by the <strong>DevGuard AI Team</strong>.
</div>
