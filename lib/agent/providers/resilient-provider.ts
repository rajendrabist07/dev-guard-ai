import {
  LLMProvider,
  ChatMessage,
  ToolDefinition,
  CompletionOptions,
  ProviderResponse,
} from './types';
import { GroqProvider } from './groq-provider';
import { GeminiProvider } from './gemini-provider';
import { MODELS, calculateModelCost } from '@/lib/config/models';
import { logger } from '@/lib/observability/logger';

export interface ResilientExecutionResult extends ProviderResponse {
  fallbackTriggered: boolean;
  fallbackReason?: string;
  estimatedCostUsd: number;
}

export class ResilientLLMProvider implements LLMProvider {
  readonly providerLabel: string;
  readonly modelId: string;
  private primaryProvider?: LLMProvider;
  private fallbackProvider?: LLMProvider;

  constructor(options?: {
    primaryProvider?: LLMProvider;
    fallbackProvider?: LLMProvider;
  }) {
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (options?.primaryProvider) {
      this.primaryProvider = options.primaryProvider;
    } else if (groqKey && !groqKey.includes('your_groq_api_key')) {
      this.primaryProvider = new GroqProvider(groqKey);
    }

    if (options?.fallbackProvider) {
      this.fallbackProvider = options.fallbackProvider;
    } else if (geminiKey && !geminiKey.includes('your_gemini_api_key')) {
      this.fallbackProvider = new GeminiProvider(geminiKey);
    }

    this.providerLabel = this.primaryProvider?.providerLabel || this.fallbackProvider?.providerLabel || MODELS.DETERMINISTIC.providerLabel;
    this.modelId = this.primaryProvider?.modelId || this.fallbackProvider?.modelId || MODELS.DETERMINISTIC.id;
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<ResilientExecutionResult> {
    let fallbackReason: string | undefined = undefined;

    // 1. Try Primary Provider (Groq)
    if (this.primaryProvider) {
      try {
        const res = await this.primaryProvider.complete(messages, options);
        const cost = calculateModelCost(res.modelId, res.inputTokens, res.outputTokens);
        return {
          ...res,
          fallbackTriggered: false,
          estimatedCostUsd: cost,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const is429 = errMsg.includes('429') || errMsg.toLowerCase().includes('rate');
        const isTimeout = errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('timed out');
        fallbackReason = is429
          ? `Primary provider (${this.primaryProvider.providerLabel}) rate limited (HTTP 429)`
          : isTimeout
          ? `Primary provider (${this.primaryProvider.providerLabel}) timed out`
          : `Primary provider (${this.primaryProvider.providerLabel}) error: ${errMsg}`;

        logger.warn('Primary LLM provider failed, evaluating fallback', {
          module: 'resilient-provider',
          reason: fallbackReason,
        });
      }
    }

    // 2. Try Fallback Provider (Gemini)
    if (this.fallbackProvider) {
      try {
        const res = await this.fallbackProvider.complete(messages, options);
        const cost = calculateModelCost(res.modelId, res.inputTokens, res.outputTokens);
        return {
          ...res,
          fallbackTriggered: true,
          fallbackReason,
          estimatedCostUsd: cost,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('Fallback LLM provider failed as well', err, {
          module: 'resilient-provider',
          fallbackReason,
          secondaryError: errMsg,
        });
      }
    }

    // 3. Deterministic Fallback
    const deterministicFallback = this.createDeterministicFallbackResponse(messages);
    return {
      ...deterministicFallback,
      fallbackTriggered: true,
      fallbackReason: fallbackReason || 'All external LLM providers unavailable or disabled',
      estimatedCostUsd: 0,
    };
  }

  async completeWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: CompletionOptions
  ): Promise<ResilientExecutionResult> {
    let fallbackReason: string | undefined = undefined;

    // 1. Try Primary Provider with tools
    if (this.primaryProvider && this.primaryProvider.completeWithTools) {
      try {
        const res = await this.primaryProvider.completeWithTools(messages, tools, options);
        const cost = calculateModelCost(res.modelId, res.inputTokens, res.outputTokens);
        return {
          ...res,
          fallbackTriggered: false,
          estimatedCostUsd: cost,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const is429 = errMsg.includes('429') || errMsg.toLowerCase().includes('rate');
        const isTimeout = errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('timed out');
        fallbackReason = is429
          ? `Primary provider (${this.primaryProvider.providerLabel}) rate limited (HTTP 429)`
          : isTimeout
          ? `Primary provider (${this.primaryProvider.providerLabel}) timed out`
          : `Primary provider (${this.primaryProvider.providerLabel}) error: ${errMsg}`;

        logger.warn('Primary LLM tool execution failed, evaluating fallback', {
          module: 'resilient-provider',
          reason: fallbackReason,
        });
      }
    }

    // 2. Try Fallback Provider with tools
    if (this.fallbackProvider && this.fallbackProvider.completeWithTools) {
      try {
        const res = await this.fallbackProvider.completeWithTools(messages, tools, options);
        const cost = calculateModelCost(res.modelId, res.inputTokens, res.outputTokens);
        return {
          ...res,
          fallbackTriggered: true,
          fallbackReason,
          estimatedCostUsd: cost,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('Fallback LLM provider with tools failed as well', err, {
          module: 'resilient-provider',
          fallbackReason,
          secondaryError: errMsg,
        });
      }
    }

    // 3. Deterministic Fallback (No tool calls)
    const deterministicFallback = this.createDeterministicFallbackResponse(messages);
    return {
      ...deterministicFallback,
      fallbackTriggered: true,
      fallbackReason: fallbackReason || 'All external LLM providers unavailable for tool execution',
      estimatedCostUsd: 0,
    };
  }

  private createDeterministicFallbackResponse(messages: ChatMessage[]): ProviderResponse {
    const inputChars = messages.reduce((acc, m) => acc + m.content.length, 0);
    const inTokens = Math.max(1, Math.ceil(inputChars / 4));
    const content = JSON.stringify({
      summary: 'Automated review completed via deterministic engine. External AI synthesis was bypassed or unavailable.',
      prioritizedFindingIds: [],
      explanations: [],
      suggestedFixes: [],
    });
    const outTokens = Math.max(1, Math.ceil(content.length / 4));

    return {
      content,
      inputTokens: inTokens,
      outputTokens: outTokens,
      totalTokens: inTokens + outTokens,
      latencyMs: 1,
      modelId: MODELS.DETERMINISTIC.id,
      providerLabel: MODELS.DETERMINISTIC.providerLabel,
    };
  }
}
