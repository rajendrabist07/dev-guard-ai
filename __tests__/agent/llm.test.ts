import { describe, it, expect } from 'vitest';
import { synthesizeReviewWithLLM } from '@/lib/agent/llm';

describe('LLM Multi-Tier Synthesis (lib/agent/llm.ts)', () => {
  it('falls back to deterministic engine gracefully when no external API keys are active', async () => {
    const input = {
      prTitle: 'test PR',
      diffSummary: 'Modified 2 files',
      toolOutputs: [
        { tool: 'runLinter', summary: '1 critical error', findingsCount: 1 },
        { tool: 'scanDependencies', summary: 'Clean', findingsCount: 0 },
      ],
    };

    const result = await synthesizeReviewWithLLM(input);
    expect(result.summary).toBeDefined();
    expect(result.provider).toBeDefined();
    expect(result.model).toBeDefined();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
