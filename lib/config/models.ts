export interface ModelPricing {
  promptTokenPriceUsd: number;
  completionTokenPriceUsd: number;
}

export interface ModelDefinition {
  id: string;
  provider: 'groq' | 'gemini' | 'deterministic';
  displayName: string;
  providerLabel: string;
  pricing: ModelPricing;
  contextWindow: number;
}

/**
 * Single source of truth for all AI model identifiers, display names, and published pricing.
 * Centralizes model parameters so UI, cost tracking, telemetry, and agents reference verified metadata.
 */
export const MODELS = {
  GROQ_LLAMA_70B: {
    id: 'llama-3.3-70b-versatile',
    provider: 'groq',
    displayName: 'Groq Llama 3.3 70B',
    providerLabel: 'Groq Llama 3.3 70B',
    pricing: {
      promptTokenPriceUsd: 0.59 / 1_000_000,
      completionTokenPriceUsd: 0.79 / 1_000_000,
    },
    contextWindow: 128000,
  },
  GEMINI_FLASH: {
    id: 'gemini-2.0-flash',
    provider: 'gemini',
    displayName: 'Gemini 2.0 Flash',
    providerLabel: 'Gemini 2.0 Flash',
    pricing: {
      promptTokenPriceUsd: 0.10 / 1_000_000,
      completionTokenPriceUsd: 0.40 / 1_000_000,
    },
    contextWindow: 1048576,
  },
  DETERMINISTIC: {
    id: 'deterministic-rules',
    provider: 'deterministic',
    displayName: 'Deterministic Static Engine',
    providerLabel: 'Deterministic Engine (Fallback)',
    pricing: {
      promptTokenPriceUsd: 0,
      completionTokenPriceUsd: 0,
    },
    contextWindow: 0,
  },
} as const satisfies Record<string, ModelDefinition>;

export const DEFAULT_PRIMARY_MODEL: ModelDefinition = MODELS.GROQ_LLAMA_70B;
export const DEFAULT_FALLBACK_MODEL: ModelDefinition = MODELS.GEMINI_FLASH;
export const DEFAULT_DETERMINISTIC_MODEL: ModelDefinition = MODELS.DETERMINISTIC;

/**
 * Resolves a model definition from an ID, provider label, or display name.
 */
export function getModelDefinition(identifier: string): ModelDefinition | undefined {
  const normalized = (identifier || '').toLowerCase().trim();
  if (!normalized) return undefined;

  for (const model of Object.values(MODELS)) {
    if (
      model.id.toLowerCase() === normalized ||
      model.displayName.toLowerCase() === normalized ||
      model.providerLabel.toLowerCase() === normalized
    ) {
      return model;
    }
  }

  if (normalized.includes('gemini') || normalized.includes('flash')) {
    return MODELS.GEMINI_FLASH;
  }
  if (normalized.includes('groq') || normalized.includes('llama')) {
    return MODELS.GROQ_LLAMA_70B;
  }
  if (normalized.includes('deterministic') || normalized.includes('rules')) {
    return MODELS.DETERMINISTIC;
  }

  return undefined;
}

/**
 * Calculates estimated API cost for a synthesis run using official published pricing.
 */
export function calculateModelCost(
  identifier: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = getModelDefinition(identifier) || MODELS.DETERMINISTIC;
  const inputCost = inputTokens * model.pricing.promptTokenPriceUsd;
  const outputCost = outputTokens * model.pricing.completionTokenPriceUsd;
  return Number((inputCost + outputCost).toFixed(6));
}
