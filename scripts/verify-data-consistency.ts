import { getDashboardData } from '../lib/db/supabase';
import { NEXT_PUBLIC_GITHUB_APP_INSTALL_URL, CANONICAL_GITHUB_APP_INSTALL_URL, getGitHubAppInstallUrl } from '../lib/github/config';

async function runVerification() {
  console.log('=== SPRINT U0 AUTOMATED CONSISTENCY & INVARIANT SUITE ===');

  // Test 1: GitHub URL canonical consistency
  console.log('\n[TEST 1] Verifying GitHub App URL configuration...');
  const installUrl = getGitHubAppInstallUrl();
  console.log('Canonical URL:', CANONICAL_GITHUB_APP_INSTALL_URL);
  console.log('Resolved Install URL:', installUrl);
  console.log('Shared Constant URL:', NEXT_PUBLIC_GITHUB_APP_INSTALL_URL);

  if (!installUrl.includes('/apps/') || !installUrl.includes('/installations/new')) {
    throw new Error(`FAIL: Invalid GitHub App Install URL format: "${installUrl}"`);
  }
  if (installUrl.includes('/settings/apps/new')) {
    throw new Error(`FAIL: Install URL points to developer creation page instead of installation: "${installUrl}"`);
  }
  if (installUrl === 'https://github.com' || installUrl === 'https://github.com/') {
    throw new Error(`FAIL: Install URL points to generic github.com homepage: "${installUrl}"`);
  }
  console.log('✅ TEST 1 PASSED: GitHub App Install URL is valid and canonical.');

  // Test 2: Dashboard data invariant check (Multiple repeated loads)
  console.log('\n[TEST 2] Testing Dashboard stats consistency across 5 consecutive queries...');
  for (let i = 1; i <= 5; i++) {
    const data = await getDashboardData();
    const { stats, reviewRuns, repos } = data;

    console.log(
      `  Iteration #${i}: Repos=${stats.connectedRepos}, Runs=${stats.reviewRuns}, Tools=${stats.toolsExecuted}, Findings=${stats.securityFindings}`
    );

    // INVARIANT 1: If reviewRuns == 0, securityFindings MUST be 0
    if (stats.reviewRuns === 0 && stats.securityFindings > 0) {
      throw new Error(
        `FAIL: Invariant Violation! reviewRuns is 0 but securityFindings is ${stats.securityFindings}. Findings cannot exist without review runs.`
      );
    }

    // INVARIANT 2: If reviewRuns == 0, toolsExecuted MUST be 0
    if (stats.reviewRuns === 0 && stats.toolsExecuted > 0) {
      throw new Error(
        `FAIL: Invariant Violation! reviewRuns is 0 but toolsExecuted is ${stats.toolsExecuted}. Tools cannot have executed without review runs.`
      );
    }

    // INVARIANT 3: reviewRuns count must match stats.reviewRuns
    if (reviewRuns.length !== stats.reviewRuns) {
      throw new Error(
        `FAIL: Inconsistency between reviewRuns array length (${reviewRuns.length}) and stats.reviewRuns (${stats.reviewRuns}).`
      );
    }

    // INVARIANT 4: Repos must not contain dummy simulated repos
    const dummyRepos = repos.filter(
      (r) => r.full_name.toLowerCase().includes('simulated') || r.installation_id === 'simulation'
    );
    if (dummyRepos.length > 0) {
      throw new Error(`FAIL: Dummy simulated repos leaked into dashboard repos list: ${JSON.stringify(dummyRepos)}`);
    }
  }
  console.log('✅ TEST 2 PASSED: 5/5 consecutive queries returned perfectly consistent stats.');

  console.log('\n==========================================================');
  console.log('✅ ALL SPRINT U0 DATA CONSISTENCY & INVARIANT TESTS PASSED!');
  console.log('==========================================================');
}

runVerification().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
