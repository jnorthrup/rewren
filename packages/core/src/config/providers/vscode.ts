/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModelConfig } from './base.js';
import { Providers } from '../providers.js';

/** Lightweight representation of the subset of LanguageModelChat we use */
export interface VsCodeLanguageModel {
  id?: string;
  vendor?: string;
  family?: string;
  maxInputTokens?: number;
}

export function convertVsCodeModelToModelConfig(m: VsCodeLanguageModel): ModelConfig {
  const name = m.id || `${m.vendor ?? 'vscode'}/${m.family ?? 'unknown'}`;
  const tokenLimit = typeof m.maxInputTokens === 'number' ? m.maxInputTokens : 0;
  return {
    name,
    tokenLimit,
    description: `VSCode LLM: ${m.vendor ?? 'vscode'} ${m.family ?? ''}`.trim(),
    provider: Providers.VSCODE_LLM,
    capabilities: {
      reasoning: true,
      streaming: true,
    },
    supportsContextReorg: tokenLimit >= 80000,
  };
}
