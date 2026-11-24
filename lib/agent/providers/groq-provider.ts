import Groq from 'groq-sdk';
import {
  LLMProvider,
  ChatMessage,
  ToolDefinition,
  CompletionOptions,
  ProviderResponse,
  ToolCallRequest,
} from './types';
import { MODELS } from '@/lib/config/models';
import { logger } from '@/lib/observability/logger';

export class GroqProvider implements LLMProvider {
  readonly providerLabel: string = MODELS.GROQ_LLAMA_70B.providerLabel;
  readonly modelId: string;
  private client: Groq;

  constructor(apiKey?: string, modelId?: string) {
    const key = apiKey || process.env.GROQ_API_KEY || '';
    this.modelId = modelId || MODELS.GROQ_LLAMA_70B.id;
    this.client = new Groq({ apiKey: key, timeout: 10000 });
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<ProviderResponse> {
    const startTime = Date.now();
    const abortController = new AbortController();
    const timeoutMs = options?.timeoutMs || 10000;
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => abortController.abort());
    }

    try {
      const groqMessages = messages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool' as const,
            content: m.content,
            tool_call_id: m.toolCallId || 'call_default',
          };
        }
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: 'assistant' as const,
            content: m.content || '',
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          };
        }
        return {
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        };
      });

      const responseFormat = options?.responseFormat?.type === 'json_object'
        ? { type: 'json_object' as const }
        : undefined;

      const response = await this.client.chat.completions.create(
        {
          model: this.modelId,
          messages: groqMessages,
          temperature: options?.temperature ?? 0.1,
          max_tokens: options?.maxTokens ?? 1000,
          response_format: responseFormat,
        },
        {
          signal: abortController.signal,
        }
      );

      const latencyMs = Date.now() - startTime;
      const choice = response.choices[0];
      const content = choice?.message?.content || '';

      const inputTokens = response.usage?.prompt_tokens ?? Math.ceil(JSON.stringify(messages).length / 4);
      const outputTokens = response.usage?.completion_tokens ?? Math.ceil(content.length / 4);

      return {
        content,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        latencyMs,
        modelId: this.modelId,
        providerLabel: this.providerLabel,
      };
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        throw new Error(`Groq request timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async completeWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: CompletionOptions
  ): Promise<ProviderResponse> {
    const startTime = Date.now();
    const abortController = new AbortController();
    const timeoutMs = options?.timeoutMs || 10000;
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => abortController.abort());
    }

    try {
      const groqMessages = messages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool' as const,
            content: m.content,
            tool_call_id: m.toolCallId || 'call_default',
          };
        }
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: 'assistant' as const,
            content: m.content || '',
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          };
        }
        return {
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        };
      });

      const groqTools = tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));

      const response = await this.client.chat.completions.create(
        {
          model: this.modelId,
          messages: groqMessages,
          tools: groqTools,
          tool_choice: 'auto',
          temperature: options?.temperature ?? 0.1,
          max_tokens: options?.maxTokens ?? 1000,
        },
        {
          signal: abortController.signal,
        }
      );

      const latencyMs = Date.now() - startTime;
      const choice = response.choices[0];
      const message = choice?.message;
      const content = message?.content || '';

      const toolCalls: ToolCallRequest[] = [];
      if (message?.tool_calls && message.tool_calls.length > 0) {
        for (const tc of message.tool_calls) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(tc.function.arguments || '{}');
          } catch (e) {
            logger.warn('Failed to parse Groq tool call arguments JSON', { error: e });
          }
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: parsedArgs,
          });
        }
      }

      const inputTokens = response.usage?.prompt_tokens ?? Math.ceil(JSON.stringify(messages).length / 4);
      const outputTokens = response.usage?.completion_tokens ?? Math.ceil(content.length / 4);

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        latencyMs,
        modelId: this.modelId,
        providerLabel: this.providerLabel,
      };
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        throw new Error(`Groq tool request timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
