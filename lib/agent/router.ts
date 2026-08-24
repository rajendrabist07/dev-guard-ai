export type DiffComplexity = 'trivial' | 'standard' | 'complex';

export interface ComplexityAnalysis {
  complexity: DiffComplexity;
  reason: string;
  linesChanged: number;
  filesChanged: number;
  hasSecuritySensitiveFiles: boolean;
  hasSchemaOrManifestChanges: boolean;
  recommendedModelTier: 'deterministic_fast' | 'gemini_flash_efficient' | 'groq_llama70b_full';
  estimatedCostWithoutRoutingUsd: number;
  estimatedCostWithRoutingUsd: number;
  costSavingsPercentage: number;
}

/**
 * Lightweight, zero-overhead complexity classifier that executes in < 1ms
 * before launching the agentic orchestrator pipeline.
 *
 * Rules:
 * 1. Trivial: Docs-only (.md, .txt), markdown changes, single-line CSS/config edits with zero logic.
 *    -> Route: Deterministic Fast Engine (Cost: $0.000000, 100% reduction)
 * 2. Standard: Small UI components, utility helpers (< 40 lines changed, no auth/db/manifests).
 *    -> Route: Gemini 2.5 Flash Efficient Tier (Cost: ~$0.000035, ~75% reduction)
 * 3. Complex: Database schemas, auth routes, payment endpoints, package manifests, or diffs > 40 lines.
 *    -> Route: Full Groq Llama 3.3 70B Orchestrator (Cost: ~$0.000150, 0% baseline)
 */
export function classifyDiffComplexity(diff: string, fileNames: string[] = []): ComplexityAnalysis {
  const lines = diff.split('\n');
  const addedLines = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
  const removedLines = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
  const totalLinesChanged = addedLines + removedLines;
  const filesCount = fileNames.length > 0 ? fileNames.length : 1;

  const isDocsOnly =
    (fileNames.length > 0 &&
      fileNames.every((f) => /\.(md|markdown|txt|rst|adoc|png|jpg|svg|ico)$/i.test(f) || f.startsWith('.github/'))) ||
    (!fileNames.length && diff.includes('--- a/') && !diff.match(/--- a\/[^\n]+\.(ts|tsx|js|jsx|json|mjs|cjs|py|go|rs|java|rb|php|sql)/i));

  const isSchemaOrManifest =
    fileNames.some((f) => f.endsWith('package.json') || f.includes('schema') || f.includes('migration') || f.endsWith('.sql')) ||
    /dependencies|devDependencies|CREATE TABLE|ALTER TABLE|"axios"|"lodash"|"express"|"stripe"|"jsonwebtoken"/.test(diff);

  const isSecuritySensitive =
    fileNames.some((f) => /auth|login|session|webhook|stripe|payment|crypto|secret|token|security/i.test(f)) ||
    /\b(SELECT|INSERT|UPDATE|DELETE|sk_live_|ghp_|jwt|bcrypt|crypto|dangerouslySetInnerHTML|eval\()\b/i.test(diff);

  const isCodeOrRouteFile = fileNames.some((f) => /\.(ts|tsx|js|jsx|py|go|rs|sql|mjs|cjs)$/i.test(f) || f.includes('app/api') || f.includes('routes'));

  // Default baseline cost if every request used the largest model path (Groq Llama 3.3 70B)
  const baselineCost = 0.000150;

  if (isDocsOnly || (!isCodeOrRouteFile && totalLinesChanged <= 3 && !isSecuritySensitive && !isSchemaOrManifest)) {
    return {
      complexity: 'trivial',
      reason: isDocsOnly ? 'Documentation or asset diff with zero executable logic' : 'Trivial non-logic adjustment (≤ 3 lines changed)',
      linesChanged: totalLinesChanged,
      filesChanged: filesCount,
      hasSecuritySensitiveFiles: false,
      hasSchemaOrManifestChanges: false,
      recommendedModelTier: 'deterministic_fast',
      estimatedCostWithoutRoutingUsd: baselineCost,
      estimatedCostWithRoutingUsd: 0.000000,
      costSavingsPercentage: 100,
    };
  }

  if (isSecuritySensitive || isSchemaOrManifest || totalLinesChanged > 50 || filesCount >= 4) {
    let reason = 'Complex diff requiring deep multi-tool security inspection';
    if (isSecuritySensitive) reason = 'Contains security-sensitive authentication, payment, or query logic';
    else if (isSchemaOrManifest) reason = 'Contains package manifest dependency or database schema modifications';
    else reason = `Large changes (${totalLinesChanged} lines across ${filesCount} files)`;

    return {
      complexity: 'complex',
      reason,
      linesChanged: totalLinesChanged,
      filesChanged: filesCount,
      hasSecuritySensitiveFiles: isSecuritySensitive,
      hasSchemaOrManifestChanges: isSchemaOrManifest,
      recommendedModelTier: 'groq_llama70b_full',
      estimatedCostWithoutRoutingUsd: baselineCost,
      estimatedCostWithRoutingUsd: baselineCost,
      costSavingsPercentage: 0,
    };
  }

  return {
    complexity: 'standard',
    reason: `Standard application logic change (${totalLinesChanged} lines changed across ${filesCount} files)`,
    linesChanged: totalLinesChanged,
    filesChanged: filesCount,
    hasSecuritySensitiveFiles: false,
    hasSchemaOrManifestChanges: false,
    recommendedModelTier: 'gemini_flash_efficient',
    estimatedCostWithoutRoutingUsd: baselineCost,
    estimatedCostWithRoutingUsd: 0.000035,
    costSavingsPercentage: 76.7,
  };
}
