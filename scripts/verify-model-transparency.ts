import { runAgentOrchestrator } from '../lib/agent/orchestrator';

async function testTransparency() {
  console.log('=== SPRINT U3 MODEL TRANSPARENCY & REASONING TRACE VERIFICATION ===');

  const diff = `--- a/app/api/checkout/route.ts
+++ b/app/api/checkout/route.ts
@@ -34,6 +34,8 @@ export async function POST(req: Request) {
+  const { userId } = await req.json();
+  // UNSAFE QUERY
+  const user = await db.raw("SELECT * FROM users WHERE id = '" + userId + "'");
+  await fetch('http://payment-gateway.internal/charge');

--- a/package.json
+++ b/package.json
@@ -12,3 +12,4 @@
+    "axios": "0.19.0"`;

  console.log('\n[TEST 1] Executing runAgentOrchestrator to verify empirical trace & model attribution...');
  const result = await runAgentOrchestrator(diff, ['app/api/checkout/route.ts', 'package.json'], 'test-run-transparency');

  console.log('Provider used:', result.providerUsed);
  console.log('Model used:', result.modelUsed);
  console.log('Fallback triggered:', result.fallbackTriggered);
  if (result.fallbackReason) console.log('Fallback reason:', result.fallbackReason);
  console.log('Tool calls count:', result.toolCallsCount);
  console.log('Trace length:', result.trace.length);

  if (result.trace.length === 0) {
    throw new Error('FAIL: Agent trace was not recorded in OrchestrationResult');
  }

  // Validate step-by-step integrity
  result.trace.forEach((step, idx) => {
    console.log(`  Step ${step.step}: tool=[${step.tool}], hasInput=${Boolean(step.input)}, hasOutput=${Boolean(step.output)}`);
    if (!step.tool || !step.input || !step.output || !step.timestamp) {
      throw new Error(`FAIL: Malformed trace step at index ${idx}`);
    }
  });

  if (!result.providerUsed || result.providerUsed.length === 0) {
    throw new Error('FAIL: Missing providerUsed attribution in result');
  }

  console.log('✅ TEST 1 PASSED: Real empirical trace and transparent model metadata verified.');

  console.log('\n==========================================================');
  console.log('✅ ALL SPRINT U3 MODEL TRANSPARENCY TESTS PASSED!');
  console.log('==========================================================');
}

testTransparency().catch((err) => {
  console.error('\n❌ TRANSPARENCY TEST FAILED:', err);
  process.exit(1);
});
