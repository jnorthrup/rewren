/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModelConfig } from './base.js';

/**
 * Z.AI provider configuration helper
 * Exposes credential names and default base URL to be used by the model registry
 */
export const ZAI_PROVIDER = {
  id: 'zai',
  envApiKeyNames: ['ZAI_API_KEY', 'GLM_API_KEY'],
  defaultBaseUrl: 'https://api.z.ai',
};

/**
 * Z.AI models available through their API
 */
export const zaiModels: ModelConfig[] = []/*add no fake models  here - use model discovery*/;
