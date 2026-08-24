import fs from 'fs';
import path from 'path';

interface EvalSummary {
  timestamp: string;
  total_cases: number;
  tool_selection_precision: number;
  tool_selection_recall: number;
  tool_selection_f1: number;
  severity_accuracy: number;
  wasted_tool_call_rate: number;
  docs_efficiency_pass: boolean;
  total_duration_ms: number;
}

interface BaselineConfig {
  min_tool_precision: number;
  min_tool_recall: number;
  min_severity_accuracy: number;
  max_wasted_tool_rate: number;
  baseline_scores: {
    tool_selection_precision: number;
    severity_accuracy: number;
  };
}

function generateMarkdownComment() {
  const evalPath = path.join(process.cwd(), 'evals', 'eval-results.json');
  const baselinePath = path.join(process.cwd(), 'evals', 'baseline.json');

  if (!fs.existsSync(evalPath)) {
    console.error('eval-results.json not found.');
    process.exit(1);
  }

  const evalData: EvalSummary = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
  const baselineData: BaselineConfig = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : { min_tool_precision: 98, min_tool_recall: 98, min_severity_accuracy: 98, max_wasted_tool_rate: 2 };

  const isPrecisionPassed = evalData.tool_selection_precision >= baselineData.min_tool_precision;
  const isRecallPassed = evalData.tool_selection_recall >= baselineData.min_tool_recall;
  const isSeverityPassed = evalData.severity_accuracy >= baselineData.min_severity_accuracy;
  const isWastedPassed = evalData.wasted_tool_call_rate <= baselineData.max_wasted_tool_rate;
  const isDocsPassed = evalData.docs_efficiency_pass;

  const allPassed = isPrecisionPassed && isRecallPassed && isSeverityPassed && isWastedPassed && isDocsPassed;

  const md = `## 🛡️ DevGuard AI — Automated CI Evaluation Benchmark

${allPassed ? '### ✅ CI Evaluation Gate: PASSED' : '### ❌ CI Evaluation Gate: FAILED'}

The agent orchestrator tool-routing and severity-scoring algorithms were evaluated against the 20-case golden benchmark suite.

| Benchmark Metric | Current PR Score | Baseline Threshold | Status |
| :--- | :--- | :--- | :--- |
| **Tool Selection Precision** | **${evalData.tool_selection_precision}%** | ≥ ${baselineData.min_tool_precision}% | ${isPrecisionPassed ? '✅ PASS' : '❌ REGRESSION'} |
| **Tool Selection Recall** | **${evalData.tool_selection_recall}%** | ≥ ${baselineData.min_tool_recall}% | ${isRecallPassed ? '✅ PASS' : '❌ REGRESSION'} |
| **Tool Selection F1** | **${evalData.tool_selection_f1}%** | ≥ 98% | ${evalData.tool_selection_f1 >= 98 ? '✅ PASS' : '❌ REGRESSION'} |
| **Severity Accuracy** | **${evalData.severity_accuracy}%** | ≥ ${baselineData.min_severity_accuracy}% | ${isSeverityPassed ? '✅ PASS' : '❌ REGRESSION'} |
| **Wasted Tool Call Rate** | **${evalData.wasted_tool_call_rate}%** | ≤ ${baselineData.max_wasted_tool_rate}% | ${isWastedPassed ? '✅ PASS' : '❌ REGRESSION'} |
| **Docs-Only Efficiency Gate** | **${evalData.docs_efficiency_pass ? 'Zero Wasted Calls' : 'Violated'}** | Zero Wasted Calls | ${isDocsPassed ? '✅ PASS' : '❌ REGRESSION'} |

- **Total Test Cases Evaluated**: ${evalData.total_cases}
- **Evaluation Suite Latency**: ${(evalData.total_duration_ms / 1000).toFixed(2)}s
- **Evaluation Gate Rule**: Structural regressions exceeding 2.0% automatically fail CI and block merges.

*Generated automatically by DevGuard CI Suite on ${new Date().toUTCString()}*
`;

  const outputPath = path.join(process.cwd(), 'evals', 'pr-comment.md');
  fs.writeFileSync(outputPath, md, 'utf8');
  console.log(`Generated PR eval markdown comment at ${outputPath}`);
}

generateMarkdownComment();
