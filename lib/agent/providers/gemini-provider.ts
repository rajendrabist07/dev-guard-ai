import {
  GoogleGenerativeAI,
  FunctionDeclaration,
  SchemaType,
  Content,
  Schema,
} from '@google/generative-ai';
import {
  LLMProvider,
  ChatMessage,
  ToolDefinition,
  CompletionOptions,
  ProviderResponse,
  ToolCallRequest,
} from './types';
import { MODELS } from '@/lib/config/models';

export class GeminiProvider implements LLMProvider {
  readonly providerLabel: string = MODELS.GEMINI_FLASH.providerLabel;
  readonly modelId: string;
  private genAI: GoogleGenerativeAI;

  constructor(apiKey?: string, modelId?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY || '';
    this.modelId = modelId || MODELS.GEMINI_FLASH.id;
    this.genAI = new GoogleGenerativeAI(key);
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
      const model = this.genAI.getGenerativeModel({
        model: this.modelId,
        generationConfig: {
          temperature: options?.temperature ?? 0.1,
          maxOutputTokens: options?.maxTokens ?? 1000,
          responseMimeType: options?.responseFormat?.type === 'json_object' ? 'application/json' : undefined,
        },
      });

      // Format messages into Gemini Contents
      const contents: Content[] = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

      // Prepend system instruction if present
      const systemMsg = messages.find((m) => m.role === 'system');
      const systemInstruction = systemMsg ? systemMsg.content : undefined;

      const modelWithSystem = systemInstruction
        ? this.genAI.getGenerativeModel({
            model: this.modelId,
            systemInstruction,
            generationConfig: {
              temperature: options?.temperature ?? 0.1,
              maxOutputTokens: options?.maxTokens ?? 1000,
              responseMimeType: options?.responseFormat?.type === 'json_object' ? 'application/json' : undefined,
            },
          })
        : model;

      const result = await modelWithSystem.generateContent({
        contents,
      });

      const response = result.response;
      const content = response.text().trim();
      const latencyMs = Date.now() - startTime;

      const inputTokens = response.usageMetadata?.promptTokenCount ?? Math.ceil(JSON.stringify(messages).length / 4);
      const outputTokens = response.usageMetadata?.candidatesTokenCount ?? Math.ceil(content.length / 4);

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
        throw new Error(`Gemini request timed out after ${timeoutMs}ms`);
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
      const functionDeclarations: FunctionDeclaration[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: {
          type: SchemaType.OBJECT,
          properties: Object.entries(t.parameters.properties).reduce((acc, [k, v]) => {
            let schemaType = SchemaType.STRING;
            if (v.type === 'number') schemaType = SchemaType.NUMBER;
            if (v.type === 'boolean') schemaType = SchemaType.BOOLEAN;
            if (v.type === 'array') schemaType = SchemaType.ARRAY;
            if (v.type === 'object') schemaType = SchemaType.OBJECT;
            acc[k] = {
              type: schemaType,
              description: v.description,
            } as Schema;
            return acc;
          }, {} as { [k: string]: Schema }),
          required: t.parameters.required,
        },
      }));

      const systemMsg = messages.find((m) => m.role === 'system');
      const systemInstruction = systemMsg ? systemMsg.content : undefined;

      const model = this.genAI.getGenerativeModel({
        model: this.modelId,
        systemInstruction,
        generationConfig: {
          temperature: options?.temperature ?? 0.1,
          maxOutputTokens: options?.maxTokens ?? 1000,
        },
        tools: [{ functionDeclarations }],
      });

      const contents: Content[] = messages
        .filter((m) => m.role !== 'system')
        .map((m) => {
          if (m.role === 'tool') {
            return {
              role: 'user',
              parts: [{
                functionResponse: {
                  name: m.name || 'tool_response',
                  response: { content: m.content },
                },
              }],
            };
          }
          return {
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          };
        });

      const result = await model.generateContent({ contents });
      const response = result.response;
      let content = '';
      try {
        content = response.text().trim();
      } catch {
        // If the model responded purely with function calls, response.text() may throw
        content = '';
      }

      const functionCalls = response.functionCalls();
      const toolCalls: ToolCallRequest[] = [];

      if (functionCalls && functionCalls.length > 0) {
        for (let i = 0; i < functionCalls.length; i++) {
          const fc = functionCalls[i];
          toolCalls.push({
            id: `call_${fc.name}_${i}_${Date.now()}`,
            name: fc.name,
            arguments: (fc.args as Record<string, unknown>) || {},
          });
        }
      }

      const latencyMs = Date.now() - startTime;
      const inputTokens = response.usageMetadata?.promptTokenCount ?? Math.ceil(JSON.stringify(messages).length / 4);
      const outputTokens = response.usageMetadata?.candidatesTokenCount ?? Math.ceil(content.length / 4);

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
        throw new Error(`Gemini tool request timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
