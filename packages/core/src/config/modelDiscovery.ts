/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ModelConfig } from './providers/base.js';
import { Providers } from './providers.js';

/**
 * Build a safe models endpoint URL for OpenAI-compatible providers.
 * If the provided baseURL already contains a /v1 segment, append /models
 * to the existing path. Otherwise, append /v1/models.
 */
function buildModelsUrl(baseURL: string): string {
  try {
    const parsed = new URL(baseURL);
    const cleanPath = parsed.pathname.replace(/\/+$/g, '');
    if (cleanPath.endsWith('/v1')) {
      parsed.pathname = cleanPath + '/models';
    } else if (cleanPath.endsWith('/models')) {
      parsed.pathname = cleanPath; // already points at models
    } else {
      parsed.pathname = cleanPath + '/v1/models';
    }
    return parsed.toString();
  } catch (_e) {
    // Fallback: string concat
    const trimmed = baseURL.replace(/\/+$/g, '');
    if (/\/v1(\/|$)/.test(trimmed)) {
      return trimmed.replace(/\/+$/g, '') + '/models';
    }
    return trimmed + '/v1/models';
  }
}

interface OpenAIModelResponse {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

interface OpenAIModelsListResponse {
  object: 'list';
  data: OpenAIModelResponse[];
}

interface CachedModels {
  timestamp: number;
  provider: string;
  baseURL: string;
  models: ModelConfig[];
}

const CACHE_DIR = path.join('.wren', 'cache');
// Debounce model fetching to 5 hours
const CACHE_TTL = 5 * 60 * 60 * 1000; // 5 hours in milliseconds

/**
 * Fetch models from an OpenAI-compatible /v1/models endpoint
 */
export async function fetchModelsFromProvider(
  baseURL: string,
  apiKey: string,
  _provider: Providers,
): Promise<ModelConfig[]> {
  // Check cache first
  const cached = loadCachedModels(baseURL, _provider);
  if (cached) {
    return cached;
  }

  try {
  const url = buildModelsUrl(baseURL);
  const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(
        `Failed to fetch models from ${baseURL}: ${response.status} ${response.statusText}`,
      );
      return [];
    }

    // Read text and attempt to parse JSON. Some providers may return HTML
    // error pages which would throw on response.json(), so handle that.
    const text = await response.text();
    let data: OpenAIModelsListResponse;
    try {
      data = JSON.parse(text) as OpenAIModelsListResponse;
    } catch (_err) {
      console.warn(
        `Unexpected non-JSON response from ${baseURL}: ${text.slice(0, 200)}`,
      );
      return [];
    }

    // Convert to ModelConfig format
    const models: ModelConfig[] = data.data.map((model) => ({
      name: model.id,
      tokenLimit: inferTokenLimit(model.id, _provider),
      description: `${model.id} from ${_provider}`,
      provider: _provider,
      capabilities: inferCapabilities(model.id, _provider),
    }));

    // Cache the results
  saveCachedModels(baseURL, _provider, models);

    return models;
  } catch (error) {
    console.warn(`Error fetching models from ${baseURL}:`, error);
    return [];
  }
}

/**
 * Infer token limit based on model name and provider
 */
function inferTokenLimit(modelId: string, provider: Providers): number {
  const id = modelId.toLowerCase();

  // Provider-specific patterns
  if (provider === Providers.NVIDIA) {
    if (id.includes('405b')) return 128_000;
    if (id.includes('nemotron')) return 128_000;
    return 128_000;
  }

  if (provider === Providers.OPENROUTER) {
    if (id.includes('gemini') && id.includes('flash')) return 1_000_000;
    if (id.includes('claude')) return 200_000;
    if (id.includes('gpt-4')) return 128_000;
    if (id.includes('llama')) return 128_000;
    return 128_000;
  }

  if (provider === Providers.KILO) {
    return 128_000;
  }

  // Generic patterns
  if (id.includes('32k')) return 32_000;
  if (id.includes('64k')) return 64_000;
  if (id.includes('128k')) return 128_000;
  if (id.includes('200k')) return 200_000;

  // Default
  return 128_000;
}

/**
 * Infer capabilities based on model name and provider
 */
function inferCapabilities(
  modelId: string,
  provider: Providers,
): ModelConfig['capabilities'] {
  const id = modelId.toLowerCase();

  const capabilities: ModelConfig['capabilities'] = {
    streaming: true,
    functionCalling: false, // Default to false, only enable for known supported models
  };

  // Models known to support function calling
  if (
    // OpenAI models (but not GPT-OSS models which use responses API)
    (id.includes('gpt-') && !id.includes('gpt-oss-')) ||
    // Anthropic models
    id.includes('claude-') ||
    // Google models
    id.includes('gemini-') ||
    // DeepSeek models
    id.includes('deepseek-') ||
    // Meta Llama models (some support function calling, but not prompt-guard)
    (id.includes('llama-3') && !id.includes('prompt-guard') && provider !== Providers.NVIDIA) ||
    // Qwen models
    id.includes('qwen') ||
    // Mistral models
    id.includes('mistral-') ||
    // Cohere models
    id.includes('command-r') ||
    // xAI models
    id.includes('grok-')
  ) {
    capabilities.functionCalling = true;
  }

  // Reasoning models
  if (
    id.includes('reasoner') ||
    id.includes('thinking') ||
    id.includes('o1') ||
    id.includes('o3') ||
    id.includes('r1') ||
    id.includes('qwq')
  ) {
    capabilities.reasoning = true;
  }

  // Vision models
  if (
    id.includes('vision') ||
    id.includes('gpt-4o') ||
    id.includes('claude-3') ||
    id.includes('gemini') ||
    id.includes('grok')
  ) {
    capabilities.vision = true;
  }

  // Embedding models
  if (id.includes('embedding') || id.includes('embed')) {
    capabilities.embedding = true;
    capabilities.functionCalling = false;
  }

  // Audio/transcription models (whisper, tts, etc.)
  if (id.includes('whisper') || id.includes('tts') || id.includes('speech') || id.includes('audio')) {
    capabilities.functionCalling = false;
    capabilities.streaming = false;
  }

  return capabilities;
}

/**
 * Load cached models if available and not expired
 */
function loadCachedModels(
  baseURL: string,
  provider: Providers,
): ModelConfig[] | null {
  try {
    const cacheFile = getCacheFilePath(baseURL, provider);
    if (!fs.existsSync(cacheFile)) {
      return null;
    }

    const content = fs.readFileSync(cacheFile, 'utf-8');
    const cached: CachedModels = JSON.parse(content);

    // Check if cache is expired
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      return null;
    }

    return cached.models;
  } catch (error) {
    console.warn('Error loading cached models:', error);
    return null;
  }
}

/**
 * Save models to cache
 */
function saveCachedModels(
  baseURL: string,
  provider: Providers,
  models: ModelConfig[],
): void {
  try {
    // Ensure cache directory exists
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    const cacheFile = getCacheFilePath(baseURL, provider);
    const cached: CachedModels = {
      timestamp: Date.now(),
      provider,
      baseURL,
      models,
    };

    fs.writeFileSync(cacheFile, JSON.stringify(cached, null, 2), 'utf-8');
  } catch (error) {
    console.warn('Error saving cached models:', error);
  }
}

/**
 * Get cache file path for a provider
 */
function getCacheFilePath(baseURL: string, provider: Providers): string {
  // Create a safe filename from the baseURL
  const urlHash = Buffer.from(baseURL).toString('base64url');
  return path.join(CACHE_DIR, `${provider}-${urlHash}.json`);
}

/**
 * Clear cache for a specific provider
 */
export function clearModelCache(baseURL: string, provider: Providers): void {
  try {
    const cacheFile = getCacheFilePath(baseURL, provider);
    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
    }
  } catch (error) {
    console.warn('Error clearing model cache:', error);
  }
}

/**
 * Clear all model caches
 */
export function clearAllModelCaches(): void {
  try {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(CACHE_DIR, file));
        }
      }
    }
  } catch (error) {
    console.warn('Error clearing all model caches:', error);
  }
}
