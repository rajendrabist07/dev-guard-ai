# ADR 0002: Truthful Metrics, Honest Empty States, and Centralized Model Configuration

## Status
**Accepted** (2026-11-22)

## Context
During the Phase 1 and Phase 2 audits of DevGuard AI, several critical truthfulness and data integrity issues were identified:

1. **Fabricated Dashboard Metrics**:
   When zero review runs existed, the dashboard displayed hardcoded fallback constants (`$0.000072` average cost, `52% savings`, `1.85s / 3.10s` latencies, and `Webhooks Active` badges). These gave users and evaluators the impression of active operational history where none existed.
2. **Model Mismatch & Fragmented Pricing**:
   Model IDs and pricing were scattered across modules. In `lib/agent/llm.ts`, the model ID passed to the Google SDK was `gemini-2.0-flash`, but provider labels and UI badges claimed `Gemini 2.5 Flash`. Cost calculation formulas were duplicated and inconsistent.
3. **Contradictory Observability Health**:
   The telemetry health badge in `app/observability/page.tsx` hardcoded a green pulsing dot (`bg-emerald-500`) even when status was "Degraded", and displayed optimistic claims ("operating smoothly") when 0 data existed.
4. **Ephemeral Logs & Secret Exposure**:
   Logging relied on an in-memory array that vanished on serverless function termination, and secret scrubbing lacked coverage for Authorization bearer tokens, Groq keys, and fine-grained GitHub PATs.
5. **Marketing Discrepancies**:
   The landing page and README claimed features that did not exist in code (e.g. "AST linters", "LLM chooses tools", "runs unit test suites").

## Decision

We have enforced a strict **Truthful Product, Real Data Only** policy across the codebase:

### 1. Honest Empty States & Database-Derived Metrics
- Eradicated all hardcoded fallback constants (`0.000072`, `0.000150`, `1.85s`, `3.10s`, `52%`) from `app/dashboard/page.tsx` and `lib/db/supabase.ts`.
- When zero review runs exist, the dashboard displays `"No data yet"` with an honest explanation explaining that metrics await completed pull request reviews.
- Latencies (p50 / p95) and costs are computed strictly from real database timestamps and token telemetry.
- Replaced the static `"Webhooks Active"` badge with an honest `"Installed & Monitored"` / `"No repositories installed"` indicator.
- Repository badges accurately reflect `repo.is_active` as `Active` (green) or `Inactive` (gray).

### 2. Centralized Model Configuration (`lib/config/models.ts`)
- Established `lib/config/models.ts` as the single source of truth for all AI model IDs, display names, and published pricing.
- Resolved the Gemini model mismatch: centralized on official ID `gemini-2.0-flash` with display label `Gemini 2.0 Flash`.
- Telemetry, cost estimation functions, router, and UI panels now read directly from this central catalog.

### 3. Multi-Service Observability Health Calculation (`lib/observability/health.ts`)
- Implemented `computeObservabilityHealth()` and `getHealthStatusDisplay()` to evaluate live checks:
  - Database ping (`pingDatabase()`)
  - Redis ping (`pingRedis()`)
  - Review run failure rate and error frequency
- Supported states: `Healthy` (emerald), `Degraded` (amber), `Down` (rose), and `No Data Yet` (gray).
- Color and label are guaranteed to agree. Removed optimistic placeholder sentences when data is zero.

### 4. Persistent Structured Logging & Comprehensive Secret Redaction
- Added `system_logs` table to `schema.sql` and `db/schema.sql` with asynchronous persistence.
- Expanded `scrubSecrets()` with regex patterns covering Authorization bearer tokens, GitHub PATs, Groq keys, Gemini keys, Stripe keys, and JWT signatures.
- Proved via automated test `__tests__/observability/secret-redaction.test.ts` that credentials never leak to console or logs.

### 5. Truthful Public Copy & Documentation Alignment
- Aligned `app/page.tsx`, `README.md`, `app/layout.tsx`, and `app/opengraph-image.tsx` with actual code capabilities:
  - "AST linters" -> "static security rules"
  - "runs unit test suites" -> "validates security & reliability invariants"
  - "LLM chooses tools" -> "deterministic diagnostic pipeline"
- Removed emoji clutter and internal sprint jargon ("Sprint X2", "Senior Benchmark") from `README.md`.
- Updated `docs/CLAIMS.md`: zero FALSE rows remain.

## Consequences

### Positive
- **Integrity**: Every metric shown in the UI is backed by real, recorded database rows.
- **Consistency**: Centralized model configuration eliminates version drift and inaccurate pricing calculations.
- **Security**: Robust secret redaction prevents accidental credential leakage in production logs.
- **Clarity**: Developers and evaluators see transparent, honest representations of system capabilities.

### Negative / Trade-offs
- Initial dashboard visits before running any reviews show empty state indicators instead of simulated metrics.
