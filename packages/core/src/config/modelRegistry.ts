/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ModelConfig, ensureContextReorgFlag } from './providers/base.js';
import {
  deepseekModels,
  googleModels,
  openaiModels,
  anthropicModels,
  llamaModels,
  mistralModels,
  cohereModels,
  kiloModels,
  nvidiaModels,
  openrouterModels,
  zaiModels,
} from './providers/index.js';
// vscodeModels intentionally excluded - cannot be discovered via API
import { qwenModels } from './providers/qwen.js';
import { DEFAULT_TOKEN_LIMIT } from './config.js';
import { fetchModelsFromProvider } from './modelDiscovery.js';
import { Providers } from './providers.js';

export interface ModelsConfigFile {
  models: ModelConfig[];
}

const CUSTOM_MODEL_CONFIG_PATH = path.join('.wren', 'models.json');

// All built-in models from providers
const DEFAULT_MODELS: ModelConfig[] = ensureContextReorgFlag([
  ...deepseekModels,
  ...googleModels,
  ...openaiModels,
  ...anthropicModels,
  ...llamaModels,
  ...mistralModels,
  ...cohereModels,
  ...qwenModels,
  ...kiloModels,
  ...nvidiaModels,
  ...openrouterModels,
  ...zaiModels,
  // vscodeModels excluded - fake hardcoded models, cannot be discovered
]);

const DEFAULT_MODELS_MAP: Map<string, ModelConfig> = new Map(
  DEFAULT_MODELS.map((model) => [model.name, model]),
);

const DEFAULT_PROVIDERS = new Set(
  DEFAULT_MODELS.map((model) => model.provider),
);

const customModels: ModelConfig[] = loadModels();

// Track dynamically fetched models
let dynamicModels: ModelConfig[] = [];
let allModelsMap: Map<string, ModelConfig> | null = null;

// OpenAI-compatible provider configurations
interface ProviderConfig {
  provider: Providers;
  envVarBase: string;
  envVarKey: string;
}

const OPENAI_COMPATIBLE_PROVIDERS: ProviderConfig[] = [
  { provider: Providers.OPENAI, envVarBase: 'OPENAI_BASE_URL', envVarKey: 'OPENAI_API_KEY' },
  { provider: Providers.OPENROUTER, envVarBase: 'OPENROUTER_BASE_URL', envVarKey: 'OPENROUTER_API_KEY' },
  { provider: Providers.NVIDIA, envVarBase: 'NVIDIA_BASE_URL', envVarKey: 'NVIDIA_API_KEY' },
  { provider: Providers.KILO, envVarBase: 'KILO_BASE_URL', envVarKey: 'KILO_API_KEY' },
  { provider: Providers.GROQ, envVarBase: 'GROQ_BASE_URL', envVarKey: 'GROQ_API_KEY' },
  { provider: Providers.DEEPSEEK, envVarBase: 'DEEPSEEK_BASE_URL', envVarKey: 'DEEPSEEK_API_KEY' },
  { provider: Providers.QWEN, envVarBase: 'QWEN_BASE_URL', envVarKey: 'QWEN_API_KEY' },
  { provider: Providers.MOONSHOT_AI, envVarBase: 'MOONSHOT_BASE_URL', envVarKey: 'MOONSHOT_API_KEY' },
  { provider: Providers.ZAI, envVarBase: 'ZAI_BASE_URL', envVarKey: 'ZAI_API_KEY' },
  // NOTE: VSCode LLM is NOT included here - it doesn't have /v1/models endpoint
  // VSCode uses vscode.lm.selectChatModels() API which only works in extension context
  // See packages/core/src/config/providers/vscode-llm-notes.md for details
];

// Default base URLs for providers
const DEFAULT_BASE_URLS: Record<string, string> = {
  [Providers.OPENAI]: 'https://api.openai.com/v1',
  [Providers.OPENROUTER]: 'https://openrouter.ai/api/v1',
  [Providers.NVIDIA]: 'https://integrate.api.nvidia.com/v1',
  [Providers.KILO]: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', // Kilo Code (OVH AI Endpoints)
  [Providers.GROQ]: 'https://api.groq.com/openai/v1',
  [Providers.DEEPSEEK]: 'https://api.deepseek.com/v1',
  [Providers.QWEN]: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', // Qwen (Alibaba Model Studio intl)
  [Providers.MOONSHOT_AI]: 'https://api.moonshot.ai/v1', // Moonshot (global)
};

/**
 * Fetch dynamic models from OpenAI-compatible providers
 */
async function fetchDynamicModels(): Promise<void> {
  const fetchPromises: Array<Promise<ModelConfig[]>> = [];

  for (const config of OPENAI_COMPATIBLE_PROVIDERS) {
    const baseURL = process.env[config.envVarBase] || DEFAULT_BASE_URLS[config.provider];
    const apiKey = process.env[config.envVarKey];

    if (apiKey && baseURL) {
      fetchPromises.push(
        fetchModelsFromProvider(baseURL, apiKey, config.provider)
          .catch((error) => {
            console.warn(`Failed to fetch models for ${config.provider}:`, error);
            return [];
          })
      );
    }
  }

  const results = await Promise.all(fetchPromises);
  dynamicModels = ensureContextReorgFlag(results.flat());
}

function getAllModelsMap(): Map<string, ModelConfig> {
  if (!allModelsMap) {
    allModelsMap = new Map([
      ...DEFAULT_MODELS_MAP,
      ...customModels.map(
        (model) => [model.name, model] as [string, ModelConfig],
      ),
      ...dynamicModels.map(
        (model) => [model.name, model] as [string, ModelConfig],
      ),
    ]);
  }
  return allModelsMap;
}

/**
 * Initialize model registry with dynamic fetching
 */
export async function initializeModelRegistry(): Promise<void> {
  await fetchDynamicModels();
  // Clear the cache so it rebuilds with dynamic models
  allModelsMap = null;
}

/**
 * Get all built-in models
 */
export function listDefaultModels(): ModelConfig[] {
  return DEFAULT_MODELS;
}

/**
 * Load custom models from a config file
 */
function loadModels() {
  let models: ModelConfig[] = [];
  try {
    if (!fs.existsSync(CUSTOM_MODEL_CONFIG_PATH)) {
      return models;
    }

    const content = fs.readFileSync(CUSTOM_MODEL_CONFIG_PATH, 'utf-8');
    const config: ModelsConfigFile = JSON.parse(content);

    if (!config.models || !Array.isArray(config.models)) {
      console.warn(
        `Invalid models config file format at ${CUSTOM_MODEL_CONFIG_PATH}. Expected { "models": [...] }`,
      );
      return models;
    }

  // Validate each model config
  models = config.models.filter((model): model is ModelConfig => {
      if (!model.name || typeof model.name !== 'string') {
        console.warn(
          `Skipping model config with invalid name: ${JSON.stringify(model)}`,
        );
        return false;
      }

      if (
        !model.tokenLimit ||
        typeof model.tokenLimit !== 'number' ||
        model.tokenLimit <= 0
      ) {
        console.warn(
          `Skipping model config "${model.name}" with invalid tokenLimit: ${model.tokenLimit}`,
        );
        return false;
      }

      return true;
  });
  models = ensureContextReorgFlag(models);
  } catch (error) {
    console.warn(
      `Failed to load custom model configs from ${CUSTOM_MODEL_CONFIG_PATH}:`,
      error,
    );
    models = [];
  }
  return models;
}

/**
 * Get all models (built-in + custom + dynamic)
 */
export function listModels(): ModelConfig[] {
  return [...DEFAULT_MODELS, ...customModels, ...dynamicModels];
}

/**
 * Get model by name
 */
function getModel(modelName: string): ModelConfig | undefined {
  return getAllModelsMap().get(modelName);
}

/**
 * Get models by provider
 */
export function getModelsByProvider(providerName: string): ModelConfig[] {
  return listModels().filter((model) => model.provider === providerName);
}

/**
 * Get models by capability
 */
export function getModelsByCapability(
  capability: keyof ModelConfig['capabilities'],
): ModelConfig[] {
  return listModels().filter(
    (model) => model.capabilities?.[capability] === true,
  );
}

/**
 * Get available providers
 */
export function listProviders(): string[] {
  const customProviders = new Set(customModels.map((m) => m.provider));
  const dynamicProviders = new Set(dynamicModels.map((m) => m.provider));
  return [
    ...Array.from(DEFAULT_PROVIDERS),
    ...Array.from(customProviders),
    ...Array.from(dynamicProviders),
  ];
}

export function getModelConfig(modelName: string): ModelConfig | undefined {
  const model = getModel(modelName);
  return model;
}

export function isModelSupported(modelName: string): boolean {
  return getModel(modelName) !== undefined;
}


export function getTokenLimit(modelName: string): number {
  const config = getModelConfig(modelName);
  return config?.tokenLimit ?? DEFAULT_TOKEN_LIMIT;
}

/**
 * Get API credentials (key and base URL) for a given provider
 */
export function getProviderCredentials(provider: Providers): { apiKey: string | undefined; baseURL: string | undefined } {
  const providerConfig = OPENAI_COMPATIBLE_PROVIDERS.find(p => p.provider === provider);

  if (!providerConfig) {
    return { apiKey: undefined, baseURL: undefined };
  }

  const apiKey = process.env[providerConfig.envVarKey];
  const baseURL = process.env[providerConfig.envVarBase] || DEFAULT_BASE_URLS[provider];

  return { apiKey, baseURL };
}
