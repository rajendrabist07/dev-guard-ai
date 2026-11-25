## 🛡️ DevGuard AI — Pull Request Submission

### 1. Summary of Changes
<!-- Describe the problem solved and the concrete technical approach. -->

### 2. Security Verification & Negative Tests
- [ ] No client-controlled headers are trusted (`x-github-*`, `x-user-id`, etc.)
- [ ] User authorization verified through Supabase session / GitHub App numeric installation ID
- [ ] No string concatenation in PostgREST queries or database filters
- [ ] Added or updated unit tests covering positive and negative fixtures
- [ ] Zero new critical or serious security vulnerabilities introduced

### 3. CI/CD Quality Gates Checklist
- [ ] `npm run typecheck` passes with 0 errors
- [ ] `npm run lint` passes cleanly
- [ ] `npm run test:coverage` passes with **>= 85% line coverage on `lib/`**
- [ ] `npm run eval:gate` passes without regression against baseline
- [ ] `npm audit --audit-level=high` reports 0 vulnerabilities
- [ ] `npm run build` succeeds cleanly for Next.js 15 production

### 4. Accessibility & UI
- [ ] Tested with axe-core for WCAG AA compliance (0 serious/critical violations)
- [ ] Tested across desktop (1280px) and mobile (360px) viewports
- [ ] Focus rings visible on all interactive elements
