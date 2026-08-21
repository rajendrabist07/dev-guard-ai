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
}

interface CaseEvaluationResult {
  id: string;
  description: string;
  expected_tools: string[];
  actual_tools: string[];
  tool_precision: number;
  tool_recall: number;
  wasted_tools: string[];
  expected_severity: string;
  actual_severity: string;
  severity_matched: boolean;
  actual_findings_count: number;
  duration_ms: number;
}

interface EvaluationSummary {
  timestamp: string;
  total_cases: number;
  tool_selection_precision: number;
  tool_selection_recall: number;
  tool_selection_f1: number;
  severity_accuracy: number;
  wasted_tool_call_rate: number;
  docs_efficiency_pass: boolean;
  total_duration_ms: number;
  case_results: CaseEvaluationResult[];
}

async function runEvaluation() {
  console.log('\n============================================================');
  console.log('🛡️  DEVGUARD AI — AGENT EVALUATION & BENCHMARK SUITE (W1)');
  console.log('============================================================\n');

  const datasetPath = path.join(process.cwd(), 'evals', 'dataset.json');
  const dataset: TestCase[] = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

  const caseResults: CaseEvaluationResult[] = [];
  let totalPrecision = 0;
  let totalRecall = 0;
  let totalSeverityMatches = 0;
  let totalWastedCalls = 0;
  let totalActualCalls = 0;
  let docsEfficiencyPass = true;
  const suiteStartTime = Date.now();

  for (let i = 0; i < dataset.length; i++) {
    const testCase = dataset[i];
    const caseStart = Date.now();

    const result = await runAgentOrchestrator(
      testCase.diff,
      testCase.files,
      `eval-${testCase.id}`
    );

    const caseDuration = Date.now() - caseStart;
    const actualTools = result.trace.map((t) => t.tool);
    const expectedSet = new Set(testCase.expected_tools_called);
    const actualSet = new Set(actualTools);

    // Calculate Precision & Recall for Tool Selection
    const truePositives = actualTools.filter((t) => expectedSet.has(t)).length;
    const falsePositives = actualTools.filter((t) => !expectedSet.has(t));
    const falseNegatives = testCase.expected_tools_called.filter((t) => !actualSet.has(t));

    const precision =
      actualTools.length === 0
        ? expectedSet.size === 0
          ? 1
          : 0
        : truePositives / actualTools.length;

    const recall =
      expectedSet.size === 0
        ? actualTools.length === 0
          ? 1
          : 0
        : truePositives / expectedSet.size;

    // Severity assessment
    const criticals = result.findings.filter((f) => f.severity === 'critical').length;
    const warnings = result.findings.filter((f) => f.severity === 'warning').length;
    const infos = result.findings.filter((f) => f.severity === 'info').length;

    let actualSeverity: 'critical' | 'warning' | 'info' | 'none' = 'none';
    if (criticals > 0) actualSeverity = 'critical';
    else if (warnings > 0) actualSeverity = 'warning';
    else if (infos > 0) actualSeverity = 'info';

    const severityMatched = actualSeverity === testCase.expected_severity;

    // Check docs-only efficiency (0 tools expected)
    if (testCase.expected_tools_called.length === 0 && actualTools.length > 0) {
      docsEfficiencyPass = false;
    }

    totalPrecision += precision;
    totalRecall += recall;
    if (severityMatched) totalSeverityMatches += 1;
    totalWastedCalls += falsePositives.length;
    totalActualCalls += actualTools.length;

    const evalRecord: CaseEvaluationResult = {
      id: testCase.id,
      description: testCase.description,
      expected_tools: testCase.expected_tools_called,
      actual_tools: actualTools,
      tool_precision: Number(precision.toFixed(2)),
      tool_recall: Number(recall.toFixed(2)),
      wasted_tools: falsePositives,
      expected_severity: testCase.expected_severity,
      actual_severity: actualSeverity,
      severity_matched: severityMatched,
      actual_findings_count: result.findings.length,
      duration_ms: caseDuration,
    };

    caseResults.push(evalRecord);

    const statusIcon = precision === 1 && recall === 1 && severityMatched ? '✅' : '⚠️';
    console.log(
      `[${i + 1}/${dataset.length}] ${statusIcon} ${testCase.id.padEnd(36)} ` +
        `Tools: [${actualTools.join(', ') || 'none'}] | ` +
        `Sev: ${actualSeverity.padEnd(8)} (Exp: ${testCase.expected_severity}) | ` +
        `${caseDuration}ms`
    );
  }

  const avgPrecision = totalPrecision / dataset.length;
  const avgRecall = totalRecall / dataset.length;
  const f1 = avgPrecision + avgRecall === 0 ? 0 : (2 * (avgPrecision * avgRecall)) / (avgPrecision + avgRecall);
  const severityAccuracy = totalSeverityMatches / dataset.length;
  const wastedRate = totalActualCalls === 0 ? 0 : totalWastedCalls / totalActualCalls;
  const totalDuration = Date.now() - suiteStartTime;

  const summary: EvaluationSummary = {
    timestamp: new Date().toISOString(),
    total_cases: dataset.length,
    tool_selection_precision: Number((avgPrecision * 100).toFixed(1)),
    tool_selection_recall: Number((avgRecall * 100).toFixed(1)),
    tool_selection_f1: Number((f1 * 100).toFixed(1)),
    severity_accuracy: Number((severityAccuracy * 100).toFixed(1)),
    wasted_tool_call_rate: Number((wastedRate * 100).toFixed(1)),
    docs_efficiency_pass: docsEfficiencyPass,
    total_duration_ms: totalDuration,
    case_results: caseResults,
  };

  // Write results JSON file
  const resultsPath = path.join(process.cwd(), 'evals', 'eval-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log('\n============================================================');
  console.log('📊 EVALUATION SUMMARY SCORECARD');
  console.log('============================================================');
  console.log(`• Total Test Cases Evaluated : ${summary.total_cases}`);
  console.log(`• Tool Selection Precision    : ${summary.tool_selection_precision}%`);
  console.log(`• Tool Selection Recall       : ${summary.tool_selection_recall}%`);
  console.log(`• Tool Selection F1 Score     : ${summary.tool_selection_f1}%`);
  console.log(`• Severity Accuracy           : ${summary.severity_accuracy}%`);
  console.log(`• Wasted Tool Call Rate (Cost): ${summary.wasted_tool_call_rate}%`);
  console.log(`• Docs-Only Efficiency Gate   : ${summary.docs_efficiency_pass ? 'PASSED (Zero Wasted Calls)' : 'FAILED'}`);
  console.log(`• Total Evaluation Runtime    : ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`• Dated Results Written To    : evals/eval-results.json`);
  console.log('============================================================\n');
}

runEvaluation().catch((err) => {
  console.error('Evaluation run failed:', err);
  process.exit(1);
});
