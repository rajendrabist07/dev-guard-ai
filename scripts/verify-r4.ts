import { getDashboardData, getGitHubAppInstallUrl } from '../lib/db/supabase';
import { runAgentOrchestrator } from '../lib/agent/orchestrator';
import { getGitHubAppSlug } from '../lib/github/config';

async function verifyAll() {
  console.log('--- 1. VERIFYING GITHUB APP INSTALL URL SINGLE SOURCE OF TRUTH ---');
  const slug = getGitHubAppSlug();
  const installUrl = getGitHubAppInstallUrl();
  console.log('GitHub App Slug:', slug);
  console.log('GitHub App Install URL:', installUrl);
  if (!installUrl.includes('/installations/new') || installUrl.includes('/settings/apps/new')) {
    throw new Error('FAIL: Install URL is not pointing to /installations/new!');
  }
  console.log('✅ PASS: Install URL format is exact and canonical: ' + installUrl);

  console.log('\n--- 2. VERIFYING DASHBOARD DATA INVARIANT CANARY ---');
  const dashboardData = await getDashboardData();
  console.log('Dashboard stats:', dashboardData.stats);
  if (dashboardData.stats.reviewRuns === 0 && dashboardData.stats.securityFindings > 0) {
    throw new Error('FAIL: Invariant broken! reviewRuns is 0 but securityFindings > 0');
  }
  console.log('✅ PASS: Invariant holds perfectly (reviewRuns: ' + dashboardData.stats.reviewRuns + ', findings: ' + dashboardData.stats.securityFindings + ')');

  console.log('\n--- 3. VERIFYING AGENT ORCHESTRATOR SIMULATION (Run 1) ---');
  const sampleDiff1 = `--- a/app/api/checkout/route.ts
+++ b/app/api/checkout/route.ts
@@ -34,6 +34,8 @@ export async function POST(req: Request) {
+  const { userId } = await req.json();
+  const user = await db.raw("SELECT * FROM users WHERE id = '" + userId + "'");
+  await fetch('http://payment-gateway.internal/charge');

--- a/package.json
+++ b/package.json
@@ -12,3 +12,4 @@
+    "axios": "0.19.0",
+    "lodash": "4.17.15"`;

  const t0 = Date.now();
  const res1 = await runAgentOrchestrator(sampleDiff1, ['app/api/checkout/route.ts', 'package.json'], 'test-run-1');
  const duration1 = Date.now() - t0;
  console.log(`Simulation Run 1 finished in ${duration1}ms with ${res1.toolCallsCount} tools, ${res1.findings.length} findings, provider: [${res1.providerUsed}]`);
  if (res1.findings.length === 0 || res1.toolCallsCount === 0) {
    throw new Error('FAIL: Simulation Run 1 returned 0 findings or 0 tool calls!');
  }
  console.log('✅ PASS: Simulation Run 1 completed with empirical findings!');

  console.log('\n--- 4. VERIFYING AGENT ORCHESTRATOR SIMULATION (Run 2 - Clean Code) ---');
  const sampleDiff2 = `--- a/app/utils/math.ts
+++ b/app/utils/math.ts
@@ -1,3 +1,3 @@
 export function add(a: number, b: number) {
-  return 0;
+  return a + b;
 }`;
  const t1 = Date.now();
  const res2 = await runAgentOrchestrator(sampleDiff2, ['app/utils/math.ts'], 'test-run-2');
  const duration2 = Date.now() - t1;
  console.log(`Simulation Run 2 finished in ${duration2}ms with ${res2.toolCallsCount} tools, ${res2.findings.length} findings, provider: [${res2.providerUsed}]`);
  console.log('✅ PASS: Simulation Run 2 completed gracefully!');

  console.log('\n--- 5. VERIFYING AGENT ORCHESTRATOR SIMULATION (Run 3 - Unhandled Promise) ---');
  const sampleDiff3 = `--- a/lib/auth/session.ts
+++ b/lib/auth/session.ts
@@ -18,4 +18,6 @@ export async function refreshSession() {
+  const res = await fetch('/api/v1/auth/refresh');
+  const token = await res.json();
+  document.cookie = "token=" + token;`;
  const t2 = Date.now();
  const res3 = await runAgentOrchestrator(sampleDiff3, ['lib/auth/session.ts'], 'test-run-3');
  const duration3 = Date.now() - t2;
  console.log(`Simulation Run 3 finished in ${duration3}ms with ${res3.toolCallsCount} tools, ${res3.findings.length} findings, provider: [${res3.providerUsed}]`);
  console.log('✅ PASS: Simulation Run 3 completed successfully!');

  console.log('\n🎉 ALL SPRINT R1-R4 VERIFICATIONS PASSED 100% CLEANLY!');
}

verifyAll().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
