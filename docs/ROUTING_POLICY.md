# Adaptive Model Routing Policy & Architecture

## 1. Overview & Operational Principles

DevGuard AI implements an **empirical, rule-driven adaptive routing policy** (`lib/agent/router.ts`) that evaluates incoming pull request diffs in `< 1ms` before executing any expensive agentic loops or external model inferences.

### Core Architectural Invariants:
1. **Safety First (Fail-Safe Complex Routing)**: Any diff containing ambiguous code, security-critical keywords, database schemas, authentication routes, or package manifests is automatically routed to the **Full Deep Inspection Tier**.
2. **Zero Waste on Non-Code Diffs**: Documentation, assets, markdown changes, and trivial formatting adjustments bypass LLM invocation entirely, completing in `< 10ms` with **0 tokens consumed** and **\$0.000000 API cost**.
3. **Truth in Cost Tracking**: Cost calculations and savings metrics are computed deterministically using standard published token pricing defined in `lib/config/models.ts`. No fabricated or marketing-inflated savings percentages are reported.

---

## 2. Measurable Diff Feature Analysis

The classifier inspects five measurable diff attributes:

| Feature | Extraction Method | Significance |
| :--- | :--- | :--- |
| **File Types** | Path extension matching (`.md`, `.txt`, `.png` vs `.ts`, `.tsx`, `.sql`, `.json`) | Distinguishes executable logic from static documentation and assets. |
| **Diff Volume** | Total added (`+`) and removed (`-`) lines across unified diff chunks | Estimates complexity and AST parsing overhead. |
| **Security Surface** | Token regex: `auth`, `login`, `session`, `webhook`, `crypto`, `token`, `SELECT`, `eval`, `secret` | Identifies credential, payment, or query-touching logic. |
| **Manifest Modifications** | Checks for `package.json`, lockfiles, migrations, or `CREATE/ALTER TABLE` | Triggers OSV.dev CVE scanning and supply chain checks. |
| **Test Invariants** | Matches `test/`, `spec/`, or API route files (`app/api/`) | Dictates whether test invariant assertion checks are required. |

---

## 3. Tiered Execution Matrix

```mermaid
flowchart TD
    PR["Incoming PR Diff"] --> Classifier["Lightweight Complexity Classifier (router.ts)"]
    Classifier -->|Docs Only or <= 3 Non-Logic Lines| Tier1["Tier 1: Trivial Fast-Path<br/>Deterministic Router<br/>0 Tokens | $0.00 Cost"]
    Classifier -->|Standard UI & Logic (< 50 lines)| Tier2["Tier 2: Standard Efficient<br/>Gemini 2.0 Flash<br/>~$0.000035 / run"]
    Classifier -->|Auth, DB, Manifests, or > 50 lines| Tier3["Tier 3: Complex Full Inspection<br/>Groq Llama 3.3 70B Orchestrator<br/>Baseline Deep Security Inspection"]
```

### Tier Specifications:

#### Tier 1: Trivial Fast-Path (`deterministic_fast`)
- **Eligibility**:
  - Diffs where every file is documentation or assets (`.md`, `.markdown`, `.txt`, `.png`, `.svg`, `.ico`, `.github/*`, `LICENSE`).
  - Non-code configuration adjustments touching $\le 3$ lines with zero security keywords.
- **Engine**: Purely deterministic static validation (`deterministic-router`).
- **Telemetry**: 0 tokens, \$0.000000 API cost, latency $\le 5\text{ms}$.
- **Verdict**: Immediate automated approval (`approve`) with 0 diagnostic findings.

#### Tier 2: Standard Efficient Tier (`gemini_flash_efficient`)
- **Eligibility**:
  - Small to medium standard application code ($\le 50$ lines changed across $< 4$ files).
  - No database migrations, package manifests, or security-sensitive paths.
- **Engine**: Gemini 2.0 Flash (`gemini-2.0-flash`).
- **Pricing**: \$0.10 / 1M prompt tokens, \$0.40 / 1M completion tokens.
- **Typical Cost**: ~\$0.000035 per synthesis run (~75% cost reduction vs baseline 70B model).

#### Tier 3: Complex Deep Security Tier (`groq_llama70b_full`)
- **Eligibility**:
  - Security-sensitive logic (authentication, session management, webhooks, payments, crypto, SQL queries).
  - Dependency manifests (`package.json`, `package-lock.json`, `pnpm-lock.yaml`).
  - Database schema changes (`schema.sql`, migrations, DDL queries).
  - Large diffs ($> 50$ lines changed or $\ge 4$ files).
- **Engine**: Primary Groq Llama 3.3 70B (`llama-3.3-70b-versatile`) with automated fallback to Gemini 2.0 Flash and offline deterministic rules.
- **Pricing**: \$0.59 / 1M prompt tokens, \$0.79 / 1M completion tokens.
- **Typical Cost**: ~\$0.0012 per full agentic orchestration run.

---

## 4. Cost Telemetry & Pricing Invariants

Cost calculations strictly follow standard published pricing:

$$\text{Cost}_{\text{USD}} = (\text{Input Tokens} \times P_{\text{input}}) + (\text{Output Tokens} \times P_{\text{output}})$$

Where $P_{\text{input}}$ and $P_{\text{output}}$ are imported directly from `lib/config/models.ts`:

```typescript
// lib/config/models.ts
export const MODELS = {
  GROQ_LLAMA_70B: {
    id: 'llama-3.3-70b-versatile',
    pricing: {
      promptTokenPriceUsd: 0.59 / 1_000_000,
      completionTokenPriceUsd: 0.79 / 1_000_000,
    },
  },
  GEMINI_FLASH: {
    id: 'gemini-2.0-flash',
    pricing: {
      promptTokenPriceUsd: 0.10 / 1_000_000,
      completionTokenPriceUsd: 0.40 / 1_000_000,
    },
  },
  DETERMINISTIC: {
    id: 'deterministic-rules',
    pricing: { promptTokenPriceUsd: 0, completionTokenPriceUsd: 0 },
  },
};
```

Telemetry records `estimatedCostUsd`, `inputTokens`, `outputTokens`, `latencyMs`, and `fallbackReason` on every single run trace, enabling auditability across all tiers.
