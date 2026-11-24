import fs from 'fs';
import path from 'path';
import { runAgentOrchestrator } from '../lib/agent/orchestrator';

interface TestCase {
  id: string;
  description: string;
  files: string[];
  diff: string;
  expected_tools_called: string[];
  expected_severity: 'critical' | 'warning' | 'info' | 'none';
  expected_flags: string[];
  category?: string;
}

interface CaseEvaluationResult {
  id: string;
  category: string;
  description: string;
  expected_tools: string[];
  actual_tools: string[];
  tool_precision: number;
  tool_recall: number;
  wasted_tools: string[];
  expected_severity: string;
  actual_severity: string;
  severity_matched: boolean;
  verdict: string;
  adversarial_tampered: boolean;
  actual_findings_count: number;
  duration_ms: number;
}

interface WilsonInterval {
  lower: number;
  upper: number;
  percentage: number;
}

interface CategoryMetrics {
  category: string;
  sample_size: number;
  precision: number;
  recall: number;
  f1: number;
  severity_accuracy: number;
  confidence_interval_95: WilsonInterval;
}

interface EvaluationSummary {
  timestamp: string;
  dataset_evaluated: string;
  total_cases: number;
  tool_selection_precision: number;
  tool_selection_recall: number;
  tool_selection_f1: number;
  severity_accuracy: number;
  overall_wilson_ci_95: WilsonInterval;
  wasted_tool_call_rate: number;
  docs_efficiency_pass: boolean;
  adversarial_injection_resistance_rate: number;
  adversarial_cases_tested: number;
  adversarial_verdict_manipulations: number;
  category_breakdown: Record<string, CategoryMetrics>;
  total_duration_ms: number;
  case_results: CaseEvaluationResult[];
}

interface BaselineConfig {
  last_updated: string;
  min_tool_precision: number;
  min_tool_recall: number;
  min_tool_f1: number;
  min_severity_accuracy: number;
  max_wasted_tool_rate: number;
  require_docs_efficiency_pass: boolean;
  baseline_scores: {
    tool_selection_precision: number;
    tool_selection_recall: number;
    tool_selection_f1: number;
    severity_accuracy: number;
    wasted_tool_call_rate: number;
    docs_efficiency_pass: boolean;
  };
}

/**
 * Calculates Wilson score 95% confidence interval for empirical accuracy measurements.
 */
export function calculateWilsonScoreInterval(
  successes: number,
  total: number,
  confidence = 1.95996
): WilsonInterval {
  if (total <= 0) return { lower: 0, upper: 0, percentage: 0 };
  const p = successes / total;
  const z = confidence;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return {
    lower: Number((Math.max(0, center - margin) * 100).toFixed(2)),
    upper: Number((Math.min(1, center + margin) * 100).toFixed(2)),
    percentage: Number((p * 100).toFixed(2)),
  };
}

const shouldUpdateBaseline = process.argv.includes('--update-baseline');
const isCiGateMode = process.argv.includes('--gate') || process.env.CI === 'true';
const useHeldOut = process.argv.includes('--held-out');
const useDevOnly = process.argv.includes('--dev');

async function runEvaluation() {
  console.log('\n============================================================');
  console.log('🛡️  DEVGUARD AI — AGENT EVALUATION & CI GATE SUITE');
  console.log('============================================================\n');

  let datasetFile = 'dataset.json';
  if (useHeldOut) datasetFile = 'held-out-dataset.json';
  else if (useDevOnly) datasetFile = 'dev-dataset.json';

  const datasetPath = path.join(process.cwd(), 'evals', datasetFile);
  if (!fs.existsSync(datasetPath)) {
    console.error(`Dataset not found at ${datasetPath}`);
    process.exit(1);
  }

  const dataset: TestCase[] = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  console.log(`Loaded ${dataset.length} test cases from ${datasetFile}`);
  console.log(`Evaluating against deterministic rule invariants and Wilson 95% CIs...\n`);

  const results: CaseEvaluationResult[] = [];
  let totalDuration = 0;
  let wastedToolCallsCount = 0;
  let totalToolsActuallyCalled = 0;

  let docsCasesCount = 0;
  let docsWastedCalls = 0;

  let adversarialCount = 0;
  let adversarialManipulations = 0;

  for (let i = 0; i < dataset.length; i++) {
    const tc = dataset[i];
    const category = tc.category || (tc.id.startsWith('case-04') || tc.id.startsWith('case-05') || tc.id.startsWith('case-06') || tc.id.includes('docs') ? 'docs' : 'general');
    const start = Date.now();

    const orchestration = await runAgentOrchestrator(
      tc.diff,
      tc.files,
      `eval-${tc.id}`,
      undefined,
      { forceDeterministic: true }
    );

    const duration = Date.now() - start;
    totalDuration += duration;

    // Normalizing tool names from trace
    const actualTools = orchestration.trace.map((step) => {
      if (step.tool === 'analyze_code') return 'runLinter';
      if (step.tool === 'scan_dependencies') return 'scanDependencies';
      if (step.tool === 'run_checks') return 'runTests';
      return step.tool;
    });

    totalToolsActuallyCalled += actualTools.length;

    // Calculate Tool Selection Precision & Recall
    const expectedSet = new Set(tc.expected_tools_called);

    let truePositives = 0;
    const wasted: string[] = [];

    for (const tool of actualTools) {
      if (expectedSet.has(tool)) {
        truePositives++;
      } else {
        wasted.push(tool);
        wastedToolCallsCount++;
      }
    }

    const precision = actualTools.length > 0 ? (truePositives / actualTools.length) * 100 : expectedSet.size === 0 ? 100 : 0;
    const recall = expectedSet.size > 0 ? (truePositives / expectedSet.size) * 100 : actualTools.length === 0 ? 100 : 0;

    // Determine actual highest severity from calibrated findings
    let actualSeverity = 'none';
    if (orchestration.findings.some((f) => f.severity === 'critical')) {
      actualSeverity = 'critical';
    } else if (orchestration.findings.some((f) => f.severity === 'warning')) {
      actualSeverity = 'warning';
    } else if (orchestration.findings.some((f) => f.severity === 'info')) {
      actualSeverity = 'info';
    }

    const severityMatched = actualSeverity === tc.expected_severity;

    // Check adversarial robustness
    let adversarialTampered = false;
    if (category === 'adversarial_injection' || tc.id.includes('adv')) {
      adversarialCount++;
      if (tc.expected_severity !== 'none' && orchestration.verdict === 'approve') {
        adversarialTampered = true;
        adversarialManipulations++;
      }
    }

    if (tc.expected_tools_called.length === 0) {
      docsCasesCount++;
      if (actualTools.length > 0) {
        docsWastedCalls += actualTools.length;
      }
    }

    results.push({
      id: tc.id,
      category,
      description: tc.description,
      expected_tools: tc.expected_tools_called,
      actual_tools: actualTools,
      tool_precision: precision,
      tool_recall: recall,
      wasted_tools: wasted,
      expected_severity: tc.expected_severity,
      actual_severity: actualSeverity,
      severity_matched: severityMatched,
      verdict: orchestration.verdict || 'approve',
      adversarial_tampered: adversarialTampered,
      actual_findings_count: orchestration.findings.length,
      duration_ms: duration,
    });

    const statusIcon = severityMatched && !adversarialTampered ? '✅' : '❌';
    console.log(
      ` ${statusIcon} [${String(i + 1).padStart(2, '0')}/${dataset.length}] ${tc.id.padEnd(38, ' ')} | Exp: ${tc.expected_severity.padEnd(8, ' ')} | Act: ${actualSeverity.padEnd(8, ' ')} | (${duration}ms)`
    );
  }

  // Aggregate Metrics
  const avgPrecision = results.reduce((acc, r) => acc + r.tool_precision, 0) / results.length;
  const avgRecall = results.reduce((acc, r) => acc + r.tool_recall, 0) / results.length;
  const avgF1 = (2 * (avgPrecision * avgRecall)) / (avgPrecision + avgRecall || 1);
  const correctSeverities = results.filter((r) => r.severity_matched).length;
  const severityAccuracy = (correctSeverities / results.length) * 100;
  const wastedRate = totalToolsActuallyCalled > 0 ? (wastedToolCallsCount / totalToolsActuallyCalled) * 100 : 0;
  const docsEfficiencyPass = docsCasesCount > 0 ? docsWastedCalls === 0 : true;

  const overallWilsonCI = calculateWilsonScoreInterval(correctSeverities, results.length);

  // Group by Category
  const categories = Array.from(new Set(results.map((r) => r.category)));
  const categoryBreakdown: Record<string, CategoryMetrics> = {};

  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catCorrect = catResults.filter((r) => r.severity_matched).length;
    const catPrec = catResults.reduce((acc, r) => acc + r.tool_precision, 0) / catResults.length;
    const catRec = catResults.reduce((acc, r) => acc + r.tool_recall, 0) / catResults.length;
    const catF1 = (2 * (catPrec * catRec)) / (catPrec + catRec || 1);
    const catAcc = (catCorrect / catResults.length) * 100;
    const catCI = calculateWilsonScoreInterval(catCorrect, catResults.length);

    categoryBreakdown[cat] = {
      category: cat,
      sample_size: catResults.length,
      precision: Number(catPrec.toFixed(2)),
      recall: Number(catRec.toFixed(2)),
      f1: Number(catF1.toFixed(2)),
      severity_accuracy: Number(catAcc.toFixed(2)),
      confidence_interval_95: catCI,
    };
  }

  const adversarialResistanceRate = adversarialCount > 0
    ? Number((((adversarialCount - adversarialManipulations) / adversarialCount) * 100).toFixed(2))
    : 100.0;

  const summary: EvaluationSummary = {
    timestamp: new Date().toISOString(),
    dataset_evaluated: datasetFile,
    total_cases: results.length,
    tool_selection_precision: Number(avgPrecision.toFixed(2)),
    tool_selection_recall: Number(avgRecall.toFixed(2)),
    tool_selection_f1: Number(avgF1.toFixed(2)),
    severity_accuracy: Number(severityAccuracy.toFixed(2)),
    overall_wilson_ci_95: overallWilsonCI,
    wasted_tool_call_rate: Number(wastedRate.toFixed(2)),
    docs_efficiency_pass: docsEfficiencyPass,
    adversarial_injection_resistance_rate: adversarialResistanceRate,
    adversarial_cases_tested: adversarialCount,
    adversarial_verdict_manipulations: adversarialManipulations,
    category_breakdown: categoryBreakdown,
    total_duration_ms: totalDuration,
    case_results: results,
  };

  console.log('\n============================================================');
  console.log('📊 EVALUATION SUMMARY & CONFIDENCE INTERVALS (95% Wilson)');
  console.log('============================================================');
  console.log(`Dataset Evaluated:               ${datasetFile} (N = ${results.length})`);
  console.log(`Tool Selection Precision:        ${summary.tool_selection_precision}%`);
  console.log(`Tool Selection Recall:           ${summary.tool_selection_recall}%`);
  console.log(`Tool Selection F1-Score:         ${summary.tool_selection_f1}%`);
  console.log(`Severity Accuracy:               ${summary.severity_accuracy}%`);
  console.log(`95% Wilson Score CI:             [${overallWilsonCI.lower}%, ${overallWilsonCI.upper}%]`);
  console.log(`Wasted Tool Call Rate:           ${summary.wasted_tool_call_rate}%`);
  console.log(`Docs Cost Fast-Path:             ${summary.docs_efficiency_pass ? 'PASSED (100% skipped)' : 'FAILED'}`);
  console.log(`Adversarial Injection Resistance: ${summary.adversarial_injection_resistance_rate}% (Manipulations: ${adversarialManipulations}/${adversarialCount})`);
  console.log('------------------------------------------------------------');
  console.log('Category Breakdown:');
  for (const [cat, m] of Object.entries(categoryBreakdown)) {
    console.log(
      `  • ${cat.padEnd(22, ' ')} (N=${String(m.sample_size).padStart(2, ' ')}) | Acc: ${String(m.severity_accuracy).padStart(6, ' ')}% | 95% CI: [${m.confidence_interval_95.lower}%, ${m.confidence_interval_95.upper}%] | F1: ${m.f1}%`
    );
  }
  console.log('============================================================\n');

  // Write evaluation results to evals/results.json and evals/eval-results.json
  const resultsJsonPath = path.join(process.cwd(), 'evals', 'results.json');
  fs.writeFileSync(resultsJsonPath, JSON.stringify(summary, null, 2), 'utf8');

  const legacyResultsPath = path.join(process.cwd(), 'evals', 'eval-results.json');
  fs.writeFileSync(legacyResultsPath, JSON.stringify(summary, null, 2), 'utf8');

  // Baseline Verification
  const baselinePath = path.join(process.cwd(), 'evals', 'baseline.json');
  let baseline: BaselineConfig | null = null;
  if (fs.existsSync(baselinePath)) {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  }

  if (shouldUpdateBaseline) {
    const newBaseline: BaselineConfig = {
      last_updated: new Date().toISOString(),
      min_tool_precision: Math.min(98.0, summary.tool_selection_precision),
      min_tool_recall: Math.min(98.0, summary.tool_selection_recall),
      min_tool_f1: Math.min(98.0, summary.tool_selection_f1),
      min_severity_accuracy: Math.min(98.0, summary.severity_accuracy),
      max_wasted_tool_rate: Math.max(2.0, summary.wasted_tool_call_rate),
      require_docs_efficiency_pass: true,
      baseline_scores: {
        tool_selection_precision: summary.tool_selection_precision,
        tool_selection_recall: summary.tool_selection_recall,
        tool_selection_f1: summary.tool_selection_f1,
        severity_accuracy: summary.severity_accuracy,
        wasted_tool_call_rate: summary.wasted_tool_call_rate,
        docs_efficiency_pass: summary.docs_efficiency_pass,
      },
    };
    fs.writeFileSync(baselinePath, JSON.stringify(newBaseline, null, 2), 'utf8');
    console.log(`✅ Baseline updated in ${baselinePath}`);
    return;
  }

  // CI Gate Mode Check
  if (isCiGateMode && baseline) {
    console.log('🚦 Verifying results against CI Quality Gate invariants...');
    const errors: string[] = [];

    if (summary.adversarial_verdict_manipulations > 0) {
      errors.push(`Adversarial Injection Failure: ${summary.adversarial_verdict_manipulations} injection payload(s) altered the computed verdict.`);
    }

    if (summary.tool_selection_precision < baseline.min_tool_precision) {
      errors.push(`Tool Selection Precision regressed: ${summary.tool_selection_precision}% < ${baseline.min_tool_precision}%`);
    }

    if (summary.tool_selection_recall < baseline.min_tool_recall) {
      errors.push(`Tool Selection Recall regressed: ${summary.tool_selection_recall}% < ${baseline.min_tool_recall}%`);
    }

    if (summary.severity_accuracy < baseline.min_severity_accuracy) {
      errors.push(`Severity Accuracy regressed: ${summary.severity_accuracy}% < ${baseline.min_severity_accuracy}%`);
    }

    if (summary.wasted_tool_call_rate > baseline.max_wasted_tool_rate) {
      errors.push(`Wasted Tool Call Rate exceeded limit: ${summary.wasted_tool_call_rate}% > ${baseline.max_wasted_tool_rate}%`);
    }

    if (baseline.require_docs_efficiency_pass && !summary.docs_efficiency_pass) {
      errors.push('Documentation Diff Cost Fast-Path failed (wasted tool calls detected on docs-only diff)');
    }

    if (errors.length > 0) {
      console.error('\n❌ CI QUALITY GATE FAILED:');
      for (const err of errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    } else {
      console.log('✅ All CI Quality Gate Invariants and Security Guardrails PASSED cleanly!\n');
    }
  }
}

runEvaluation().catch((err) => {
  console.error('Fatal evaluation runner error:', err);
  process.exit(1);
});
