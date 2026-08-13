# DevGuard AI

Autonomous PR review and security agent built with Next.js 15, Supabase, Octokit, and a capped tool-execution review loop.

DevGuard receives GitHub pull request webhooks, verifies the webhook signature, fetches changed files, runs review tools, stores findings, and can post structured GitHub PR review comments. The local demo path works without external API keys through a deterministic agent loop that calls the linter, dependency scanner, and test runner wrappers.

## Stack

- Next.js 15 App Router, React 19, TypeScript strict mode
- Tailwind CSS v4
- Supabase Postgres
- Octokit for GitHub API access
- Groq and Gemini API keys reserved for model-backed orchestration

## Project Structure

```text
app/api/webhooks/github/route.ts
app/api/reviews/[id]/route.ts
app/api/simulate-review/route.ts
app/dashboard/page.tsx
lib/agent/orchestrator.ts
lib/agent/tools/lint.ts
lib/agent/tools/deps-scan.ts
lib/agent/tools/test-runner.ts
lib/github/client.ts
lib/db/supabase.ts
lib/db/types.ts
db/schema.sql
docs/github-app-setup.md
.env.example
```

## Setup

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your secrets. **Note:** DevGuard AI features **Graceful Degradation**. If you do not have Supabase, GitHub, or Groq API keys configured yet, the app will automatically fall back to an intelligent mock state so you can still test the UI and simulated PR reviews without crashing!

```env
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=
GROQ_API_KEY=
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
```

Run `db/schema.sql` in a fresh Supabase project, then follow `docs/github-app-setup.md` to register and install the GitHub App.

## Demo

Open `/dashboard`, click **Simulate PR Review**, and run a preset. The simulation API executes:

- `runLinter`
- `scanDependencies`
- `runTests`

The agent loop is hard-capped at 5 tool iterations and returns JSON-serializable findings grouped by severity.

## Verification

```bash
npm run lint
npm run build
```
