/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Providers } from '../providers.js';
import { ModelConfig, ensureContextReorgFlag } from './base.js';

const models: ModelConfig[] = [
  {
    name: 'openrouter/auto',
    tokenLimit: 128_000,
    description: 'OpenRouter Auto - Automatically selects best model',
    provider: Providers.OPENROUTER,
    capabilities: {
      functionCalling: true,
      streaming: true,
    },
  },
  // Anthropic Models
  {
    name: 'anthropic/claude-3.5-sonnet',
    tokenLimit: 200_000,
    description: 'Claude 3.5 Sonnet via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      vision: true,
      functionCalling: true,
      streaming: true,
    },
  },
  {
    name: 'anthropic/claude-3-5-haiku',
    tokenLimit: 200_000,
    description: 'Claude 3.5 Haiku via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      vision: true,
      functionCalling: true,
      streaming: true,
    },
  },
  {
    name: 'anthropic/claude-3-opus',
    tokenLimit: 200_000,
    description: 'Claude 3 Opus via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      vision: true,
      functionCalling: true,
      streaming: true,
    },
  },
  // DeepSeek Models
  {
    name: 'deepseek/deepseek-r1',
    tokenLimit: 128_000,
    description: 'DeepSeek R1 - Advanced reasoning model via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      reasoning: true,
      functionCalling: true,
      streaming: true,
    },
    supportsContextReorg: true,
  },
  {
    name: 'deepseek/deepseek-chat',
    tokenLimit: 128_000,
    description: 'DeepSeek Chat via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      functionCalling: true,
      streaming: true,
    },
  },
  // Google Models
  {
    name: 'google/gemini-2.5-flash-thinking-exp',
    tokenLimit: 1_000_000,
    description: 'Gemini 2.5 Flash Thinking - Experimental reasoning model via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      reasoning: true,
      vision: true,
      functionCalling: true,
      streaming: true,
    },
    supportsContextReorg: true,
  },
  {
    name: 'google/gemini-2.5-pro',
    tokenLimit: 1_000_000,
    description: 'Gemini 2.5 Pro via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      vision: true,
      functionCalling: true,
      streaming: true,
    },
  },
  {
    name: 'google/gemini-flash-1.5',
    tokenLimit: 1_000_000,
    description: 'Gemini Flash 1.5 via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      vision: true,
      functionCalling: true,
      streaming: true,
    },
  },
  // Meta Llama Models
  {
    name: 'meta-llama/llama-3.3-70b-instruct',
    tokenLimit: 128_000,
    description: 'Llama 3.3 70B Instruct via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      functionCalling: true,
      streaming: true,
    },
  },
  {
    name: 'meta-llama/llama-3.1-405b-instruct',
    tokenLimit: 128_000,
    description: 'Llama 3.1 405B Instruct via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      functionCalling: true,
      streaming: true,
    },
  },
  // OpenAI Models
  {
    name: 'openai/gpt-4o',
    tokenLimit: 128_000,
    description: 'GPT-4o via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      vision: true,
      functionCalling: true,
      streaming: true,
    },
  },
  {
    name: 'openai/gpt-4o-mini',
    tokenLimit: 128_000,
    description: 'GPT-4o Mini via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      vision: true,
      functionCalling: true,
      streaming: true,
    },
  },
  {
    name: 'openai/o1',
    tokenLimit: 200_000,
    description: 'OpenAI O1 - Advanced reasoning via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      reasoning: true,
      functionCalling: true,
      streaming: true,
    },
    supportsContextReorg: true,
  },
  {
    name: 'openai/o1-mini',
    tokenLimit: 128_000,
    description: 'OpenAI O1 Mini via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      reasoning: true,
      functionCalling: true,
      streaming: true,
    },
    supportsContextReorg: true,
  },
  // xAI Models
  {
    name: 'x-ai/grok-2-vision-1212',
    tokenLimit: 32_768,
    description: 'Grok 2 Vision via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      vision: true,
      functionCalling: true,
      streaming: true,
    },
  },
  {
    name: 'x-ai/grok-2',
    tokenLimit: 32_768,
    description: 'Grok 2 via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      functionCalling: true,
      streaming: true,
    },
  },
  // Qwen Models
  {
    name: 'qwen/qwq-32b-preview',
    tokenLimit: 32_768,
    description: 'Qwen QwQ 32B Preview - Reasoning model via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      reasoning: true,
      functionCalling: true,
      streaming: true,
    },
    supportsContextReorg: true,
  },
  {
    name: 'qwen/qwen-2.5-coder-32b-instruct',
    tokenLimit: 32_768,
    description: 'Qwen 2.5 Coder 32B Instruct via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      functionCalling: true,
      streaming: true,
    },
  },
  // Mistral Models
  {
    name: 'mistralai/mistral-large',
    tokenLimit: 128_000,
    description: 'Mistral Large via OpenRouter',
    provider: Providers.OPENROUTER,
    capabilities: {
      functionCalling: true,
      streaming: true,
    },
  },
  {
    name: 'mistralai/mistral-small',
    tokenLimit: 32_000,
    description: 'Mistral Small via OpenRouter (Free)',
    provider: Providers.OPENROUTER,
    capabilities: {
      functionCalling: true,
      streaming: true,
    },
  },
];

export const openrouterModels: ModelConfig[] = ensureContextReorgFlag(models);
