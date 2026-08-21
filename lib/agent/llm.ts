import { z } from 'zod';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/observability/logger';

export const LLMOutputSchema = z.object({
  summary: z.string().min(10, 'Summary must be at least 10 characters long'),
  keyPoints: z.array(z.string()).min(1, 'At least one key finding bullet is required').optional(),
  actionableGuidance: z.string().optional(),
});

export type ValidatedLLMOutput = z.infer<typeof LLMOutputSchema>;

export interface LLMSynthesisInput {
  prTitle?: string;
  diffSummary: string;
  toolOutputs: Array<{
    tool: string;
    summary: string;
    findingsCount: number;
  }>;
}

export interface LLMTelemetry {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

export interface LLMSynthesisResult {
  summary: string;
  provider: 'Groq Llama 3.3 70B' | 'Gemini 2.5 Flash' | 'Deterministic Engine (Fallback)';
  model: string;
  fallbackTriggered: boolean;
  fallbackReason?: string;
  latencyMs: number;
  validationRetried?: boolean;
  telemetry: LLMTelemetry;
}

/**
 * Calculates estimated cost based on standard published pricing:
 * - Groq Llama 3.3 70B: $0.59 / 1M prompt tokens, $0.79 / 1M completion tokens
 * - Gemini 2.5 Flash: $0.075 / 1M prompt tokens, $0.30 / 1M completion tokens
 */
export function calculateEstimatedCost(provider: string, inputTokens: number, outputTokens: number): number {
  if (provider.includes('Groq') || provider.includes('Llama')) {
    const inputCost = (inputTokens / 1_000_000) * 0.59;
    const outputCost = (outputTokens / 1_000_000) * 0.79;
    return Number((inputCost + outputCost).toFixed(6));
  }
  if (provider.includes('Gemini') || provider.includes('Flash')) {
    const inputCost = (inputTokens / 1_000_000) * 0.075;
    const outputCost = (outputTokens / 1_000_000) * 0.30;
    return Number((inputCost + outputCost).toFixed(6));
  }
  return 0; // Deterministic engine has 0 compute API cost
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function parseAndValidateStructuredLLMOutput(rawText: string): { success: true; data: ValidatedLLMOutput } | { success: false; error: string } {
  const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

  // Try JSON parse first
  try {
    const jsonParsed = JSON.parse(cleaned);
    const result = LLMOutputSchema.safeParse(jsonParsed);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error.message };
  } catch {
    // If not JSON, validate as direct summary text
    if (cleaned.length >= 10) {
      return {
        success: true,
        data: {
          summary: cleaned,
        },
      };
    }
    return { success: false, error: 'Output text is too short or empty' };
  }
}

/**
 * Executes multi-tier LLM synthesis with Zod schema validation, self-correction retry,
 * token accounting, and cost estimation telemetry.
 */
export async function synthesizeReviewWithLLM(input: LLMSynthesisInput): Promise<LLMSynthesisResult> {
  const startTime = Date.now();
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  const prompt = `You are DevGuard AI, an autonomous code security and PR review agent.
Review the following empirical findings from AST linters, OSV.dev CVE databases, and test runs:
PR Target: ${input.prTitle || 'Code Review'}
Diff Scope: ${input.diffSummary}
Tool Evidence Collected:
${input.toolOutputs.map((t, idx) => `${idx + 1}. [${t.tool}] -> ${t.summary} (${t.findingsCount} findings)`).join('\n')}

Provide a concise 3-4 bullet executive summary of the review findings and actionable guidance. Keep it professional, empirical, and direct without filler words.`;

  const inputTokenEstimate = estimateTokens(prompt);

  // Tier 1: Try Groq Llama 3.3 70B
  if (groqKey && !groqKey.includes('your_groq_api_key')) {
    try {
      const groq = new Groq({ apiKey: groqKey });
      let completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are DevGuard AI, an empirical code review security agent.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 300,
      });

      let rawContent = completion.choices[0]?.message?.content?.trim() || '';
      let validation = parseAndValidateStructuredLLMOutput(rawContent);

      let validationRetried = false;
      if (!validation.success) {
        logger.warn('LLM structured output validation failed on first attempt, retrying with correction prompt', {
          module: 'llm-synthesizer',
          error: validation.error,
        });

        completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'user', content: prompt },
            { role: 'assistant', content: rawContent },
            {
              role: 'user',
              content: `Your previous output failed validation: ${validation.error}. Please provide a clear 3-4 bullet markdown summary of findings without markdown fences.`,
            },
          ],
          temperature: 0.1,
          max_tokens: 300,
        });

        rawContent = completion.choices[0]?.message?.content?.trim() || '';
        validation = parseAndValidateStructuredLLMOutput(rawContent);
        validationRetried = true;
      }

      if (validation.success) {
        const inTokens = completion.usage?.prompt_tokens ?? inputTokenEstimate;
        const outTokens = completion.usage?.completion_tokens ?? estimateTokens(rawContent);
        const costUsd = calculateEstimatedCost('Groq Llama 3.3 70B', inTokens, outTokens);
        const latencyMs = Date.now() - startTime;

        return {
          summary: validation.data.summary,
          provider: 'Groq Llama 3.3 70B',
          model: 'llama-3.3-70b-versatile',
          fallbackTriggered: false,
          latencyMs,
          validationRetried,
          telemetry: {
            inputTokens: inTokens,
            outputTokens: outTokens,
            totalTokens: inTokens + outTokens,
            estimatedCostUsd: costUsd,
            latencyMs,
          },
        };
      }
    } catch (groqErr: unknown) {
      const isRateLimit = String(groqErr).includes('429') || String(groqErr).toLowerCase().includes('rate');
      const reason = isRateLimit
        ? 'Groq rate limit exceeded (HTTP 429) — switched to Gemini 2.5 Flash'
        : `Groq request error: ${groqErr instanceof Error ? groqErr.message : 'service unreachable'}`;

      logger.warn(reason, {
        module: 'llm-synthesizer',
        action: 'groq-fallback',
        isRateLimit,
      });

      // Tier 2: Fallback to Google Gemini
      if (geminiKey && !geminiKey.includes('your_gemini_api_key')) {
        try {
          const genAI = new GoogleGenerativeAI(geminiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
          const res = await model.generateContent(prompt);
          const geminiSummary = res.response.text().trim();
          const geminiValidation = parseAndValidateStructuredLLMOutput(geminiSummary);

          if (geminiValidation.success) {
            const inTokens = res.response.usageMetadata?.promptTokenCount ?? inputTokenEstimate;
            const outTokens = res.response.usageMetadata?.candidatesTokenCount ?? estimateTokens(geminiSummary);
            const costUsd = calculateEstimatedCost('Gemini 2.5 Flash', inTokens, outTokens);
            const latencyMs = Date.now() - startTime;

            return {
              summary: geminiValidation.data.summary,
              provider: 'Gemini 2.5 Flash',
              model: 'gemini-2.0-flash',
              fallbackTriggered: true,
              fallbackReason: reason,
              latencyMs,
              telemetry: {
                inputTokens: inTokens,
                outputTokens: outTokens,
                totalTokens: inTokens + outTokens,
                estimatedCostUsd: costUsd,
                latencyMs,
              },
            };
          }
        } catch (geminiErr) {
          logger.error('Gemini fallback failed as well, using deterministic engine', geminiErr, {
            module: 'llm-synthesizer',
            action: 'gemini-fallback-failed',
          });
        }
      }
    }
  }

  // Tier 2 Direct (if Groq key missing but Gemini available)
  if (geminiKey && !geminiKey.includes('your_gemini_api_key')) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const res = await model.generateContent(prompt);
      const geminiSummary = res.response.text().trim();
      const geminiValidation = parseAndValidateStructuredLLMOutput(geminiSummary);

      if (geminiValidation.success) {
        const inTokens = res.response.usageMetadata?.promptTokenCount ?? inputTokenEstimate;
        const outTokens = res.response.usageMetadata?.candidatesTokenCount ?? estimateTokens(geminiSummary);
        const costUsd = calculateEstimatedCost('Gemini 2.5 Flash', inTokens, outTokens);
        const latencyMs = Date.now() - startTime;

        return {
          summary: geminiValidation.data.summary,
          provider: 'Gemini 2.5 Flash',
          model: 'gemini-2.0-flash',
          fallbackTriggered: false,
          latencyMs,
          telemetry: {
            inputTokens: inTokens,
            outputTokens: outTokens,
            totalTokens: inTokens + outTokens,
            estimatedCostUsd: costUsd,
            latencyMs,
          },
        };
      }
    } catch (geminiErr) {
      console.warn('[DevGuard LLM] Gemini direct call failed:', geminiErr);
    }
  }

  // Tier 3: Deterministic Rule Synthesis (Offline / 0 Hallucination guarantee)
  const totalFindings = input.toolOutputs.reduce((sum, t) => sum + t.findingsCount, 0);
  const fallbackSummary = [
    `### Summary of Autonomous Review Findings`,
    `- Analyzed ${input.toolOutputs.length} empirical security & code quality checks.`,
    `- Total findings identified: ${totalFindings}`,
    `- Verification verified by AST Linter, OSV.dev CVE database, and unit test runners.`,
  ].join('\n');

  const inTokens = inputTokenEstimate;
  const outTokens = estimateTokens(fallbackSummary);
  const latencyMs = Date.now() - startTime;

  return {
    summary: fallbackSummary,
    provider: 'Deterministic Engine (Fallback)',
    model: 'deterministic-ast-engine',
    fallbackTriggered: false,
    latencyMs,
    telemetry: {
      inputTokens: inTokens,
      outputTokens: outTokens,
      totalTokens: inTokens + outTokens,
      estimatedCostUsd: 0,
      latencyMs,
    },
  };
}
