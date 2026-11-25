#!/usr/bin/env node
/**
 * DevGuard AI — Post-Deployment Smoke Test Script
 * Verifies live system availability on deployed staging or production targets.
 */

const targetUrl = (process.env.TARGET_URL || process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

console.log(`\n🔍 Starting DevGuard AI Post-Deployment Smoke Test against: ${targetUrl}`);

async function runSmokeTests() {
  let failed = false;

  // 1. Health Endpoint Smoke Check
  console.log('\n[1/3] Probing GET /api/health...');
  try {
    const healthRes = await fetch(`${targetUrl}/api/health`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!healthRes.ok) {
      console.error(`❌ /api/health returned non-200 status: ${healthRes.status}`);
      failed = true;
    } else {
      const data = await healthRes.json();
      console.log(`✅ /api/health returned 200 OK.`);
      console.log(`   - Status: ${data.status}`);
      console.log(`   - Version: ${data.version || '0.1.0'}`);
      console.log(`   - Services: ${JSON.stringify(data.services || {})}`);
    }
  } catch (err) {
    console.error(`❌ Failed to connect to /api/health:`, err);
    failed = true;
  }

  // 2. Interactive Playground API Smoke Check
  console.log('\n[2/3] Probing POST /api/try...');
  try {
    const tryRes = await fetch(`${targetUrl}/api/try`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': `smoke-${Date.now()}`,
      },
      body: JSON.stringify({
        input_type: 'pasted',
        input_snippet: 'const safe = 1 + 2;\nconsole.log(safe);',
        pr_title: 'Smoke Test PR',
        pr_author: 'smoke-test-runner',
      }),
    });

    if (!tryRes.ok) {
      console.error(`❌ /api/try returned non-200 status: ${tryRes.status}`);
      failed = true;
    } else {
      const tryData = await tryRes.json();
      console.log(`✅ /api/try returned 200 OK.`);
      console.log(`   - Run ID: ${tryData.runId || tryData.id}`);
      console.log(`   - Findings: ${tryData.findings?.length ?? 0}`);
      console.log(`   - Summary: ${tryData.summary ? tryData.summary.substring(0, 80) + '...' : 'Clean'}`);
    }
  } catch (err) {
    console.error(`❌ Failed to connect to /api/try:`, err);
    failed = true;
  }

  // 3. Landing Page Status Check
  console.log('\n[3/3] Probing GET / (Landing Page)...');
  try {
    const landingRes = await fetch(`${targetUrl}/`, {
      headers: { 'User-Agent': 'DevGuard-Smoke-Test/1.0' },
    });

    if (!landingRes.ok) {
      console.error(`❌ Landing page returned non-200 status: ${landingRes.status}`);
      failed = true;
    } else {
      const html = await landingRes.text();
      if (!html.includes('DevGuard AI')) {
        console.error('❌ Landing page HTML missing expected title branding');
        failed = true;
      } else {
        console.log('✅ Landing page returned 200 OK with expected branding.');
      }
    }
  } catch (err) {
    console.error(`❌ Failed to fetch landing page:`, err);
    failed = true;
  }

  console.log('\n------------------------------------------------');
  if (failed) {
    console.error('💥 Smoke test FAILED. Review issues above before routing traffic.');
    process.exit(1);
  } else {
    console.log('🎉 All smoke tests PASSED cleanly. Target is operational.');
    process.exit(0);
  }
}

runSmokeTests();
