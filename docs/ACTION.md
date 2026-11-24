# DevGuard Action (`devguard-action`)

`devguard-action` is a reusable GitHub Action that executes real security scanners and your repository's own test suite inside your CI runner, securely ingesting verified findings into DevGuard AI via GitHub Actions OIDC (OpenID Connect).

---

## Why `devguard-action`?

In a pure webhook-driven serverless environment, running untrusted, arbitrary containerized test suites (e.g. `npm test` or `pytest`) is dangerous and technically constrained.

`devguard-action` solves this by executing inside **your own GitHub Actions runner**:
1. **Semgrep**: Runs comprehensive OWASP Top 10 and security-audit rule sets directly against your repository source tree.
2. **OSV-Scanner**: Identifies dependency vulnerabilities across your lockfiles.
3. **Repository Test Execution**: Runs your real unit/integration test command (`npm test`, `vitest run`, `cargo test`, etc.), measuring exit codes, duration, and test output.
4. **Zero Long-Lived Secrets**: Authenticates using ephemeral, cryptographically verified GitHub Actions OIDC tokens against GitHub's official JWKS (`token.actions.githubusercontent.com`).

---

## Copy-Paste Workflow YAML

Create `.github/workflows/devguard.yml` in your repository:

```yaml
name: DevGuard Security & Test CI

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write # Required for GitHub OIDC token minting

jobs:
  security-and-tests:
    name: Run DevGuard Scanners & Ingest
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Execute DevGuard Action
        uses: rajendrabist07/dev-guard-ai/actions/devguard-action@main
        with:
          devguard-url: 'https://dev-guard-ai.vercel.app'
          test-command: 'npm test'
          enable-semgrep: 'true'
          enable-osv: 'true'
          enable-tests: 'true'
```

---

## Action Inputs Reference

| Input | Description | Required | Default |
|-------|-------------|:--------:|---------|
| `devguard-url` | Base URL of your DevGuard AI instance | No | `https://dev-guard-ai.vercel.app` |
| `test-command` | Test command to execute in your runner | No | `npm test` |
| `enable-semgrep` | Whether to run Semgrep OWASP and security-audit rules | No | `true` |
| `enable-osv` | Whether to execute Google OSV-Scanner | No | `true` |
| `enable-tests` | Whether to execute the repository test suite | No | `true` |
| `oidc-audience` | Expected audience claim for GitHub OIDC token exchange | No | `devguard-ai` |

---

## How It Works: Cryptographic OIDC Ingestion

```
+-------------------------------------------------------------+
|                      Your CI Runner                         |
|  1. Semgrep scan (OWASP Top 10 + Security Audit)            |
|  2. OSV-Scanner (Lockfiles & dependencies)                  |
|  3. Run Test Suite (npm test -> records duration & status)   |
|  4. Mint GitHub OIDC Token (aud: devguard-ai)               |
+------------------------------+------------------------------+
                               |
                               | POST /api/ingest
                               | Authorization: Bearer <OIDC_TOKEN>
                               v
+-------------------------------------------------------------+
|                     DevGuard AI Server                      |
|  1. Fetches GitHub JWKS (token.actions.githubusercontent)   |
|  2. Verifies RSA-SHA256 signature & token claims            |
|  3. Validates repository ownership & active installation     |
|  4. Merges Semgrep + OSV with in-app AST findings           |
|  5. Deduplicates findings by file:line:rule                 |
|  6. Posts review to GitHub PR with verified test notice     |
+-------------------------------------------------------------+
```

### Review Comments Appearance:

- **When `devguard-action` runs**:
  ```markdown
  > 🧪 **Test Suite Status**: tests: executed (npm test passed in 3450ms)
  ```
- **When repository does not have `devguard-action`**:
  ```markdown
  > ℹ️ **Test Suite Status**: tests: not executed — install devguard-action to enable.
  ```
