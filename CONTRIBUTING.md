# Contributing to DevGuard AI

Thank you for your interest in contributing to **DevGuard AI**! This document provides clear guidelines for setting up the development environment, running tests, and following our engineering standards.

---

## 🛠️ Local Development Setup

### 1. Prerequisites
- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **Git**

### 2. Clone and Install
```bash
git clone https://github.com/rajendrabist07/dev-guard-ai.git
cd dev-guard-ai
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Configure your keys in `.env.local`:
```ini
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI Providers (Optional for local testing — deterministic fallback will trigger if unset)
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key

# GitHub App Integration (Optional for local /try testing)
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_WEBHOOK_SECRET=your_webhook_secret
NEXT_PUBLIC_GITHUB_APP_INSTALL_URL="https://github.com/apps/devguard-agent/installations/new"

# Rate Limiting (Optional — in-memory limiter active by default)
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

### 4. Start Development Server
```bash
npm run dev
```
Navigate to [http://localhost:3000](http://localhost:3000).

---

## 🧪 Running Automated Test Suites

All pull requests must pass the complete test suite and type check:

```bash
# Run unit & integration test suites
npm test

# Run tests with coverage report (v8)
npm run test:coverage

# Run TypeScript typecheck
npm run typecheck

# Run ESLint
npm run lint

# Run data consistency & badge invariants
npm run test:consistency
npm run test:badge
npm run test:reports
npm run test:transparency
```

---

## 📐 Coding Conventions & Invariants

1. **Empirical First**:
   - Never write code that sends raw diffs directly to an LLM without running diagnostic tools first. Findings must be anchored to concrete tool outputs.
2. **Zero Code Execution**:
   - Never use `eval()`, `child_process`, or system shells on user-supplied code snippets. Use static AST heuristics and regex scanning.
3. **Zero-Secret Logging**:
   - Always use `logger` (`lib/observability/logger.ts`) instead of raw `console.log`. The logger automatically scrubs API keys, tokens, and cryptographic signatures.
4. **Zod Validation**:
   - All external API inputs must be validated with typed Zod schemas (`lib/validation/schemas.ts`).
5. **Hard Iteration Caps**:
   - Maintain the `MAX_ITERATIONS = 5` boundary in `lib/agent/orchestrator.ts`.

---

## 🚀 Submitting Pull Requests

1. Fork the repository and create a feature branch (`git checkout -b feat/my-feature`).
2. Ensure `npm run typecheck && npm run lint && npm test && npm run build` passes with zero errors.
3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/) (`feat: ...`, `fix: ...`, `docs: ...`).
4. Push to your branch and open a Pull Request. GitHub Actions CI will automatically run verification checks.
