/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Providers } from '../providers.js';
import { ModelConfig, ensureContextReorgFlag } from './base.js';

const models: ModelConfig[] = [
  {
    name: 'moonshotai/kimi2',
    tokenLimit: 128_000,
    description: 'Moonshot AI Kimi2 - Advanced reasoning model via NVIDIA',
    provider: Providers.NVIDIA,
    capabilities: {
      reasoning: true,
      functionCalling: true,
      streaming: true,
    },
    supportsContextReorg: true,
  },
  {
    name: 'openai/gpt-oss-120b',
    tokenLimit: 128_000,
    description: 'NVIDIA GPT OSS 120B - Open source GPT model hosted on NVIDIA',
    provider: Providers.NVIDIA,
    capabilities: {
      reasoning: true,
      functionCalling: false, // GPT-OSS uses responses API which doesn't support tools
      streaming: true,
    },
    supportsContextReorg: true,
    reasoning: {
      effort: 'high',      // High reasoning effort by default
      max_tokens: 8192,    // Allow up to 8K tokens for reasoning
    },
    verbosity: 'high',     // High verbosity for detailed responses
    includeReasoning: true, // Include reasoning in response for COT logging
  },
  {
    name: 'nvidia/llama-3.1-nemotron-70b-instruct',
    tokenLimit: 128_000,
    description: 'NVIDIA Llama 3.1 Nemotron 70B Instruct',
    provider: Providers.NVIDIA,
    capabilities: {
      functionCalling: true,
      streaming: true,
    },
  },
  {
    name: 'nvidia/llama-3.3-nemotron-super-70b-instruct',
    tokenLimit: 128_000,
    description: 'NVIDIA Llama 3.3 Nemotron Super 70B Instruct',
    provider: Providers.NVIDIA,
    capabilities: {
      functionCalling: true,
      streaming: true,
    },
  },
  {
    name: 'meta/llama-3.1-405b-instruct',
    tokenLimit: 128_000,
    description: 'Meta Llama 3.1 405B Instruct via NVIDIA',
    provider: Providers.NVIDIA,
    capabilities: {
      functionCalling: true,
      streaming: true,
    },
  },
  {
    name: 'google/gemma-2-27b-it',
    tokenLimit: 8_192,
    description: 'Google Gemma 2 27B IT via NVIDIA',
    provider: Providers.NVIDIA,
    capabilities: {
      functionCalling: true,
      streaming: true,
    },
  },
];

export const nvidiaModels: ModelConfig[] = ensureContextReorgFlag(models);
