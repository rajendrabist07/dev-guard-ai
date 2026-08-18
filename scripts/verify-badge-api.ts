import { generateBadgeSvg } from '../lib/badge/svg';

async function testBadges() {
  console.log('=== SPRINT U4 PUBLIC SVG BADGE GENERATOR VERIFICATION ===');

  console.log('\n[TEST 1] Generating "0 critical issues" passing SVG badge...');
  const passingSvg = generateBadgeSvg({
    label: 'DevGuard AI',
    value: '0 critical issues',
    color: 'green',
  });
  console.log('Generated Passing SVG length:', passingSvg.length);
  if (!passingSvg.includes('<svg') || !passingSvg.includes('0 critical issues') || !passingSvg.includes('#10b981')) {
    throw new Error('FAIL: Passing SVG badge missing expected structure or color');
  }
  console.log('✅ TEST 1 PASSED: Passing badge generated successfully.');

  console.log('\n[TEST 2] Generating "2 critical issues" red alert SVG badge...');
  const criticalSvg = generateBadgeSvg({
    label: 'DevGuard AI',
    value: '2 critical issues',
    color: 'red',
  });
  console.log('Generated Critical SVG length:', criticalSvg.length);
  if (!criticalSvg.includes('<svg') || !criticalSvg.includes('2 critical issues') || !criticalSvg.includes('#e11d48')) {
    throw new Error('FAIL: Critical SVG badge missing expected structure or color');
  }
  console.log('✅ TEST 2 PASSED: Critical alert badge generated successfully.');

  console.log('\n[TEST 3] Generating "Powered by DevGuard AI" brand footer badge...');
  const poweredSvg = generateBadgeSvg({
    label: 'Powered by DevGuard AI',
    value: 'verified agent',
    color: 'emerald',
  });
  console.log('Generated Powered-by SVG length:', poweredSvg.length);
  if (!poweredSvg.includes('Powered by DevGuard AI') || !poweredSvg.includes('verified agent')) {
    throw new Error('FAIL: Powered-by badge missing expected text');
  }
  console.log('✅ TEST 3 PASSED: Brand footer badge generated successfully.');

  console.log('\n==========================================================');
  console.log('✅ ALL SPRINT U4 PUBLIC BADGE TESTS PASSED!');
  console.log('==========================================================');
}

testBadges().catch((err) => {
  console.error('\n❌ BADGE TEST FAILED:', err);
  process.exit(1);
});
