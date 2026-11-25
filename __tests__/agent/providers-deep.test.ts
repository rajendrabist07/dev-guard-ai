import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from '@/lib/agent/providers/gemini-provider';
import { GroqProvider } from '@/lib/agent/providers/groq-provider';
import { ResilientLLMProvider } from '@/lib/agent/providers/resilient-provider';
import { LLMProvider, ToolDefinition } from '@/lib/agent/providers/types';

const mockGenerateContent = vi.fn();
vi.mock('@google/generative-ai', () => ({
  SchemaType: {
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    INTEGER: 'INTEGER',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY',
    OBJECT: 'OBJECT',
  },
  GoogleGenerativeAI: vi.fn().mockImplementation(function () {
    return {
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    };
  }),
}));

const mockCreate = vi.fn();
vi.mock('groq-sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };
  }),
}));

vi.mock('@/lib/observability/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('lib/agent/providers Deep Unit Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const dummyTools: ToolDefinition[] = [
    {
      name: 'analyze_code',
      description: 'Run AST static analysis on source code',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Source code content' },
          filePath: { type: 'string', description: 'Path to target file' },
        },
        required: ['code'],
      },
    },
  ];

  describe('GeminiProvider', () => {
    it('executes simple completion successfully', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => 'Analysis response from Gemini',
          usageMetadata: {
            promptTokenCount: 50,
            candidatesTokenCount: 20,
            totalTokenCount: 70,
          },
        },
      });

      const provider = new GeminiProvider('fake-gemini-key');
      const res = await provider.complete([
        { role: 'system', content: 'You are a code auditor.' },
        { role: 'user', content: 'Audit this snippet.' },
      ]);

      expect(res.content).toBe('Analysis response from Gemini');
      expect(res.inputTokens).toBe(50);
      expect(res.outputTokens).toBe(20);
      expect(res.providerLabel).toBe(provider.providerLabel);
    });

    it('executes tool calling completions successfully', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => '',
          functionCalls: () => [
            {
              name: 'analyze_code',
              args: { code: 'const x = 1;', filePath: 'test.ts' },
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 30,
            totalTokenCount: 130,
          },
        },
      });

      const provider = new GeminiProvider('fake-gemini-key');
      const res = await provider.completeWithTools(
        [{ role: 'user', content: 'Scan this code' }],
        dummyTools
      );

      expect(res.toolCalls).toHaveLength(1);
      expect(res.toolCalls![0].name).toBe('analyze_code');
      expect(res.toolCalls![0].arguments).toEqual({ code: 'const x = 1;', filePath: 'test.ts' });
    });

    it('wraps timeout errors when execution exceeds time limit', async () => {
      const abortError = new Error('The user aborted a request.');
      abortError.name = 'AbortError';

      mockGenerateContent.mockRejectedValueOnce(abortError);

      const provider = new GeminiProvider('fake-gemini-key');
      await expect(
        provider.complete([{ role: 'user', content: 'Long request' }], { timeoutMs: 1 })
      ).rejects.toThrow();
    });
  });

  describe('GroqProvider', () => {
    it('executes simple completion successfully with JSON mode', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '{"summary": "safe"}',
            },
          },
        ],
        usage: {
          prompt_tokens: 40,
          completion_tokens: 15,
          total_tokens: 55,
        },
      });

      const provider = new GroqProvider('fake-groq-key');
      const res = await provider.complete(
        [{ role: 'user', content: 'Give JSON response' }],
        { responseFormat: { type: 'json_object' } }
      );

      expect(res.content).toBe('{"summary": "safe"}');
      expect(res.inputTokens).toBe(40);
      expect(res.outputTokens).toBe(15);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: { type: 'json_object' },
        }),
        expect.anything()
      );
    });

    it('executes tool calling completions and formats tool call results', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_12345',
                  type: 'function',
                  function: {
                    name: 'analyze_code',
                    arguments: '{"code": "eval(x);", "filePath": "evil.js"}',
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 110,
          completion_tokens: 45,
          total_tokens: 155,
        },
      });

      const provider = new GroqProvider('fake-groq-key');
      const res = await provider.completeWithTools(
        [
          { role: 'user', content: 'Check evil.js' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_000',
                name: 'analyze_code',
                arguments: {},
              },
            ],
          },
          {
            role: 'tool',
            content: 'tool execution result',
            toolCallId: 'call_000',
          },
        ],
        dummyTools
      );

      expect(res.toolCalls).toHaveLength(1);
      expect(res.toolCalls![0].id).toBe('call_12345');
      expect(res.toolCalls![0].name).toBe('analyze_code');
      expect(res.toolCalls![0].arguments).toEqual({ code: 'eval(x);', filePath: 'evil.js' });
    });
  });

  describe('ResilientLLMProvider', () => {
    it('uses primary provider when healthy', async () => {
      const mockPrimary: LLMProvider = {
        providerLabel: 'Primary-Mock',
        modelId: 'primary-v1',
        complete: vi.fn().mockResolvedValue({
          content: 'Primary success',
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          durationMs: 50,
          providerLabel: 'Primary-Mock',
          modelId: 'primary-v1',
        }),
        completeWithTools: vi.fn(),
      };

      const mockFallback: LLMProvider = {
        providerLabel: 'Fallback-Mock',
        modelId: 'fallback-v1',
        complete: vi.fn(),
        completeWithTools: vi.fn(),
      };

      const resilient = new ResilientLLMProvider({
        primaryProvider: mockPrimary,
        fallbackProvider: mockFallback,
      });
      const res = await resilient.complete([{ role: 'user', content: 'Hello' }]);

      expect(res.content).toBe('Primary success');
      expect(res.fallbackTriggered).toBe(false);
      expect(mockPrimary.complete).toHaveBeenCalled();
      expect(mockFallback.complete).not.toHaveBeenCalled();
    });

    it('falls back to secondary provider when primary fails', async () => {
      const mockPrimary: LLMProvider = {
        providerLabel: 'Primary-Mock',
        modelId: 'primary-v1',
        complete: vi.fn().mockRejectedValue(new Error('Rate limit 429')),
        completeWithTools: vi.fn(),
      };

      const mockFallback: LLMProvider = {
        providerLabel: 'Fallback-Mock',
        modelId: 'fallback-v1',
        complete: vi.fn().mockResolvedValue({
          content: 'Fallback success',
          inputTokens: 12,
          outputTokens: 6,
          totalTokens: 18,
          durationMs: 90,
          providerLabel: 'Fallback-Mock',
          modelId: 'fallback-v1',
        }),
        completeWithTools: vi.fn(),
      };

      const resilient = new ResilientLLMProvider({
        primaryProvider: mockPrimary,
        fallbackProvider: mockFallback,
      });
      const res = await resilient.complete([{ role: 'user', content: 'Hello' }]);

      expect(res.content).toBe('Fallback success');
      expect(res.fallbackTriggered).toBe(true);
      expect(res.fallbackReason).toContain('429');
      expect(mockPrimary.complete).toHaveBeenCalled();
      expect(mockFallback.complete).toHaveBeenCalled();
    });

    it('falls back to deterministic engine if both external providers fail', async () => {
      const mockPrimary: LLMProvider = {
        providerLabel: 'Primary-Mock',
        modelId: 'primary-v1',
        complete: vi.fn().mockRejectedValue(new Error('Primary 500')),
        completeWithTools: vi.fn(),
      };

      const mockFallback: LLMProvider = {
        providerLabel: 'Fallback-Mock',
        modelId: 'fallback-v1',
        complete: vi.fn().mockRejectedValue(new Error('Fallback 503')),
        completeWithTools: vi.fn(),
      };

      const resilient = new ResilientLLMProvider({
        primaryProvider: mockPrimary,
        fallbackProvider: mockFallback,
      });
      const res = await resilient.complete([{ role: 'user', content: 'Hello' }]);

      expect(res.fallbackTriggered).toBe(true);
      expect(res.providerLabel).toContain('Deterministic');
      expect(res.content).toContain('prioritizedFindingIds');
    });

    it('executes completeWithTools on primary or fallback provider', async () => {
      const mockPrimary: LLMProvider = {
        providerLabel: 'Primary-Mock',
        modelId: 'primary-v1',
        complete: vi.fn(),
        completeWithTools: vi.fn().mockRejectedValue(new Error('Tool error on primary')),
      };

      const mockFallback: LLMProvider = {
        providerLabel: 'Fallback-Mock',
        modelId: 'fallback-v1',
        complete: vi.fn(),
        completeWithTools: vi.fn().mockResolvedValue({
          content: '',
          toolCalls: [{ id: 'tc1', name: 'analyze_code', arguments: {} }],
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          durationMs: 40,
          providerLabel: 'Fallback-Mock',
          modelId: 'fallback-v1',
        }),
      };

      const resilient = new ResilientLLMProvider({
        primaryProvider: mockPrimary,
        fallbackProvider: mockFallback,
      });
      const res = await resilient.completeWithTools(
        [{ role: 'user', content: 'Hello' }],
        dummyTools
      );

      expect(res.fallbackTriggered).toBe(true);
      expect(res.toolCalls).toHaveLength(1);
    });
  });
});
