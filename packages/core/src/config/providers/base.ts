/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ModelConfig {
  name: string;
  tokenLimit: number;
  description?: string;
  provider: string;
  capabilities?: {
    reasoning?: boolean;
    imageGeneration?: boolean;
    embedding?: boolean;
    vision?: boolean;
    functionCalling?: boolean;
    streaming?: boolean;
  };
  supportsContextReorg?: boolean;
  deprecated?: boolean;
  releaseDate?: string;
  // OpenRouter Responses API parameters (alpha)
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';  // Reasoning effort level
    max_tokens?: number;                 // Max tokens for reasoning (1024-32000)
    exclude?: boolean;                   // Exclude reasoning from response
  };
  verbosity?: 'low' | 'medium' | 'high';  // Response detail level
  includeReasoning?: boolean;              // Include reasoning in response
}

export const CONTEXT_REORG_TOKEN_THRESHOLD = 80_000;

export function ensureContextReorgFlag(models: ModelConfig[]): ModelConfig[] {
  return models.map((model) => ({
    ...model,
    supportsContextReorg:
      model.supportsContextReorg ?? model.tokenLimit >= CONTEXT_REORG_TOKEN_THRESHOLD,
  }));
}
