# DevGuard AI — Evaluation Suite

## Methodology

The DevGuard AI evaluation suite (`evals/run-eval.ts`) measures deterministic tool selection, static rule precision/recall, severity classification, docs fast-path cost avoidance, and resistance to indirect prompt injection without spending live LLM tokens in CI.

- **CI Gate Command:** `npm run eval:gate`
- **Statistical Reporting:** Computes 95% Wilson Score Confidence Intervals per category and overall.
- **Zero-Token Determinism:** Evaluates AST analyzer rules, dependency scanner behavior, adaptive router decisions, and prompt-injection consistency guards deterministically against ground-truth labels.

---

## Dataset Provenance (`N = 64`)

1. **`evals/dev-dataset.json` (`N = 32`):** Development benchmark covering SQL injection, command injection, SSRF, hardcoded secrets, vulnerable dependencies (`axios`, `lodash`, `minimist`), clean code, documentation-only PRs, and initial adversarial prompt injections.
2. **`evals/held-out-dataset.json` (`N = 32`):** Held-out validation split including unseen vulnerability variants and an expanded adversarial prompt-injection corpus (fake `LGTM` headers, Markdown table spoofing, JSON key override attempts, commit-hash instruction smuggling).
3. **Merged Evaluation Artifact:** `evals/dataset.json` (`N = 64`), with latest verified gate output recorded in `evals/results.json`.

---

## Latest CI Gate Results (`N = 64`)

- **Tool Selection Precision:** `100%`
- **Tool Selection Recall:** `100%`
- **Tool Selection F1-Score:** `100%`
- **Severity Accuracy:** `100%` (95% Wilson CI: `[94.34%, 100%]`)
- **Wasted Tool Call Rate:** `0%` (Docs Fast-Path: 100% skipped)
- **Adversarial Injection Resistance:** `100%` (`0/34` manipulations)

---

## Limitations

- **Synthesized / Curated Fixtures:** The 64-case suite consists of curated vulnerability diffs and adversarial payloads rather than a full multi-thousand-PR public corpus; real-world false-positive rates on diverse monorepos require ongoing telemetry.
- **Deterministic Gate:** `npm run eval:gate` validates tool routing, AST/OSV rules, and injection guards deterministically; live LLM synthesis latency and phrasing quality depend on Groq/Gemini availability in production.
