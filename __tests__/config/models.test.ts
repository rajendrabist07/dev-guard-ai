import { describe, it, expect } from 'vitest';
import {
  MODELS,
  calculateModelCost,
  getModelDefinition,
  DEFAULT_PRIMARY_MODEL,
  DEFAULT_FALLBACK_MODEL,
} from '@/lib/config/models';

describe('Centralized Model Configuration (lib/config/models.ts)', () => {
  it('exports accurate model IDs, display names, and provider labels without 2.5 mismatch', () => {
    expect(MODELS.GROQ_LLAMA_70B.id).toBe('llama-3.3-70b-versatile');
    expect(MODELS.GROQ_LLAMA_70B.displayName).toBe('Groq Llama 3.3 70B');

    // Mismatch fix verification: gemini-2.0-flash MUST be labeled Gemini 2.0 Flash, never 2.5
    expect(MODELS.GEMINI_FLASH.id).toBe('gemini-2.0-flash');
    expect(MODELS.GEMINI_FLASH.displayName).toBe('Gemini 2.0 Flash');
    expect(MODELS.GEMINI_FLASH.displayName).not.toContain('2.5');

    expect(MODELS.DETERMINISTIC.id).toBe('deterministic-rules');
    expect(MODELS.DETERMINISTIC.pricing.promptTokenPriceUsd).toBe(0);
  });

  it('calculates token costs truthfully according to official provider pricing tables', () => {
    // Groq: $0.59 / 1M prompt, $0.79 / 1M completion
    const groqCost = calculateModelCost(MODELS.GROQ_LLAMA_70B.id, 100_000, 50_000);
    // (100,000 * 0.00000059) + (50,000 * 0.00000079) = 0.059 + 0.0395 = 0.0985
    expect(groqCost).toBeCloseTo(0.0985, 4);

    // Gemini 2.0 Flash: $0.10 / 1M prompt, $0.40 / 1M completion
    const geminiCost = calculateModelCost(MODELS.GEMINI_FLASH.id, 100_000, 50_000);
    // (100,000 * 0.00000010) + (50,000 * 0.00000040) = 0.010 + 0.020 = 0.030
    expect(geminiCost).toBeCloseTo(0.03, 4);

    // Deterministic engine: 0 cost
    const detCost = calculateModelCost(MODELS.DETERMINISTIC.id, 500_000, 500_000);
    expect(detCost).toBe(0);
  });

  it('resolves model definitions by provider label, model id, or partial string', () => {
    const fromId = getModelDefinition('gemini-2.0-flash');
    expect(fromId?.displayName).toBe('Gemini 2.0 Flash');

    const fromLabel = getModelDefinition('Gemini 2.0 Flash');
    expect(fromLabel?.id).toBe('gemini-2.0-flash');

    const fromGroq = getModelDefinition('llama-3.3-70b-versatile');
    expect(fromGroq?.provider).toBe('groq');

    expect(DEFAULT_PRIMARY_MODEL.id).toBe('llama-3.3-70b-versatile');
    expect(DEFAULT_FALLBACK_MODEL.id).toBe('gemini-2.0-flash');
  });
});
