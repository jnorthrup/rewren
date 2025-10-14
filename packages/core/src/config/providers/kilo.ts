/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Providers } from '../providers.js';
import { ModelConfig, ensureContextReorgFlag } from './base.js';

const models: ModelConfig[] = [
  {
    name: 'gpt-oss-120b',
    tokenLimit: 128_000,
    description: 'GPT OSS 120B - Open source GPT model hosted on OVH AI Endpoints',
    provider: Providers.KILO,
    capabilities: {
      functionCalling: false, // OVH might not support function calling
      streaming: true,
    },
  },
  {
    name: 'gpt-oss-20b',
    tokenLimit: 32_000,
    description: 'GPT OSS 20B - Open source GPT model hosted on OVH AI Endpoints',
    provider: Providers.KILO,
    capabilities: {
      functionCalling: false, // OVH might not support function calling
      streaming: true,
    },
  },
];

export const kiloModels: ModelConfig[] = ensureContextReorgFlag(models);
