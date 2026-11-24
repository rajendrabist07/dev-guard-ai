export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCallRequest[];
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' | 'text' };
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export interface ProviderResponse {
  content: string;
  toolCalls?: ToolCallRequest[];
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  modelId: string;
  providerLabel: string;
}

export interface LLMProvider {
  readonly providerLabel: string;
  readonly modelId: string;

  complete(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<ProviderResponse>;

  completeWithTools?(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: CompletionOptions
  ): Promise<ProviderResponse>;
}
