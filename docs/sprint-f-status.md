# Sprint F Status Report

Date: 2026-08-14

## Codebase Audit

- GitHub App registration: not confirmed. Local env still has empty `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`, so a real GitHub App is not usable from this checkout yet.
- Webhook route: exists at `/api/webhooks/github`. Production currently returns `405` for `GET`, which means the route is deployed and matched, but only `POST` is implemented.
- Dashboard stats before this fix:
  - Connected repositories came from `repos.length`, but the data layer fell back to mock repos when Supabase data was empty/missing.
  - Review runs came from `reviewRuns.length`, also with mock fallback.
  - Tools executed used `tool_calls_count || 1` and run rows used `|| 3`, which inflated missing data.
  - Security findings was hardcoded to `3`.
  - GitHub App nav linked to generic `https://github.com`.

## Fixes Applied

- Removed mock fallback data from `lib/db/supabase.ts`.
- Added `/api/dashboard`, which loads dashboard data server-side from Supabase.
- Dashboard now uses real Supabase-backed values for:
  - connected repos
  - review runs
  - tools executed
  - findings count
- Dashboard shows empty/error states instead of fabricated data.
- GitHub App links are now configured by `GITHUB_APP_INSTALL_URL`, `GITHUB_APP_SLUG`, `NEXT_PUBLIC_GITHUB_APP_INSTALL_URL`, or `NEXT_PUBLIC_GITHUB_APP_SLUG`.
- Generic `github.com` links were removed from the nav/dashboard install CTA.
- Webhook signature verification now rejects requests when `GITHUB_WEBHOOK_SECRET` is missing.
- GitHub diff fetch no longer returns a fake/mock diff on API failure.
- GitHub App installation auth support was added through `@octokit/auth-app`.

## Local Smoke Tests

- `npm run lint`: passing.
- `npm run build`: passing.
- Local invalid webhook signature test: now returns `401 Unauthorized`.
- Local dashboard API: currently returns a real Supabase error because the configured Supabase project does not have the required tables yet:
  `Could not find the table 'public.review_runs' in the schema cache`.

## Production Smoke Tests

- `https://dev-guard-ai.vercel.app/api/webhooks/github`: reachable; `GET` returns `405`, expected because the webhook only supports `POST`.
- `https://dev-guard-ai.vercel.app/api/dashboard`: returns `404`, meaning the deployed production build does not include the new dashboard API yet.
- Vercel env verification: not completed. `vercel env ls` cannot run because this local codebase is not linked to a Vercel project. Run `vercel link`, then `vercel env ls` to verify production variables.

## Current Pipeline Truth

- Webhook receipt: route exists, but real signed POST was not tested because no GitHub App webhook secret/App install is configured here.
- Signature verification: fixed locally; invalid signatures are rejected.
- Supabase persistence: blocked until `db/schema.sql` is run in the Supabase project.
- Diff fetch: implemented against GitHub API with installation auth, but not end-to-end tested against a real installed GitHub App.
- Agent review: local orchestrator builds and can run, but production path is not verified.
- GitHub review comment posting: implemented, but not verified in production because GitHub App installation is not configured/installed.

## Required Next Actions

1. Run `db/schema.sql` in the Supabase SQL editor for `https://vdwyrpbhetanbfrmdmvw.supabase.co`.
2. Create the GitHub App and set these env vars in Vercel:
   - `GITHUB_APP_ID`
   - `GITHUB_APP_PRIVATE_KEY`
   - `GITHUB_WEBHOOK_SECRET`
   - `GITHUB_APP_SLUG` or `GITHUB_APP_INSTALL_URL`
   - `NEXT_PUBLIC_GITHUB_APP_SLUG` or `NEXT_PUBLIC_GITHUB_APP_INSTALL_URL`
3. Add the existing Groq, Gemini, Supabase URL, anon key, and service key values in Vercel env vars.
4. Redeploy Vercel from the pushed repo.
5. Install the GitHub App on a test repo and open a PR to verify the full webhook -> diff fetch -> agent -> Supabase -> GitHub review path.
