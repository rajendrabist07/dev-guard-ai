import { describe, it, expect } from 'vitest';
import { classifyDiffComplexity } from '@/lib/agent/router';
import { runAgentOrchestrator } from '@/lib/agent/orchestrator';

describe('Sprint X4 — Adaptive Model Routing for Cost Efficiency', () => {
  it('routes a documentation-only diff to the deterministic fast-path (0 tokens, $0.000000 cost, 100% savings)', async () => {
    const docsDiff = `--- a/README.md
+++ b/README.md
@@ -1,3 +1,5 @@
+# Documentation Update
+Here are the new deployment guidelines for Docker.`;

    const analysis = classifyDiffComplexity(docsDiff, ['README.md']);
    expect(analysis.complexity).toBe('trivial');
    expect(analysis.recommendedModelTier).toBe('deterministic_fast');
    expect(analysis.costSavingsPercentage).toBe(100);

    const result = await runAgentOrchestrator(docsDiff, ['README.md'], 'eval-router-docs');
    expect(result.providerUsed).toContain('Deterministic');
    expect(result.estimatedCostUsd).toBe(0);
    expect(result.toolCallsCount).toBe(0);
    expect(result.complexityRouting?.complexity).toBe('trivial');
  });

  it('routes a database schema & SQL diff to the full Groq Llama 3.3 70B orchestrator', async () => {
    const sqlDiff = `--- a/migrations/002_auth_users.sql
+++ b/migrations/002_auth_users.sql
@@ -1,5 +1,8 @@
 CREATE TABLE users (
   id UUID PRIMARY KEY,
   email TEXT UNIQUE NOT NULL,
+  stripe_customer_id TEXT,
+  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 );`;

    const analysis = classifyDiffComplexity(sqlDiff, ['migrations/002_auth_users.sql']);
    expect(analysis.complexity).toBe('complex');
    expect(analysis.hasSchemaOrManifestChanges).toBe(true);
    expect(analysis.recommendedModelTier).toBe('groq_llama70b_full');

    const result = await runAgentOrchestrator(sqlDiff, ['migrations/002_auth_users.sql'], 'eval-router-sql');
    expect(result.complexityRouting?.complexity).toBe('complex');
    expect(result.complexityRouting?.hasSchemaOrManifestChanges).toBe(true);
  });

  it('routes security-sensitive payment and auth code to the full deep inspection tier', () => {
    const authDiff = `--- a/app/api/auth/login/route.ts
+++ b/app/api/auth/login/route.ts
@@ -10,3 +10,6 @@
 export async function POST(req: Request) {
+  const { email, password } = await req.json();
+  const token = jwt.sign({ email }, process.env.JWT_SECRET!);
+  return new Response(JSON.stringify({ token }));
 }`;

    const analysis = classifyDiffComplexity(authDiff, ['app/api/auth/login/route.ts']);
    expect(analysis.complexity).toBe('complex');
    expect(analysis.hasSecuritySensitiveFiles).toBe(true);
    expect(analysis.recommendedModelTier).toBe('groq_llama70b_full');
  });
});
