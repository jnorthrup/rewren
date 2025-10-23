/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  GoogleGenAI,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { Config } from '../config/config.js';
import { UserTierId } from '../code_assist/types.js';
import { ProviderTreeRoot, ProviderNode, MetricsNode, ModelsNode, ModelNode } from '../config/providerTreeNodes.js';
import { DEFAULT_MODEL } from '../config/config.js';
import { getEffectiveModel } from './modelCheck.js';
import { Providers } from '../config/providers.js';
import { getModelConfig, getProviderCredentials } from '../config/modelRegistry.js';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';

// TreeSelectionResult describes the persisted JSON shape for chosen model
interface TreeSelectionResult {
  provider: ProviderNode;
  modelName: string;
  apiKey?: string;
  baseURL?: string;
  authType: AuthType;
  // Optional model-level overrides (reasoning, temperature, maxTokens, etc.)
  modelParams?: Record<string, unknown>;
}

// Global cache for current model selection and watcher
let currentModelSelection: TreeSelectionResult | null = null;
let currentModelWatcher: fs.FSWatcher | null = null;
const selectionEvents = new EventEmitter();

// Exported helpers
export function getCurrentModelSelection(): TreeSelectionResult | null {
  return currentModelSelection;
}

export function onSelectionChange(cb: (sel: TreeSelectionResult | null) => void) {
  selectionEvents.on('change', cb);
}

export function removeSelectionChange(cb: (sel: TreeSelectionResult | null) => void) {
  selectionEvents.off('change', cb);
}

export function forceReloadSelection(): boolean {
  // Try to reload synchronously from candidates
  const projectDir = path.join(process.cwd(), '.wren');
  const homeDir = path.join(os.homedir(), '.wren');
  const candidates = [
    path.join(projectDir, 'current-model.json'),
    path.join(projectDir, '.current-model.json'),
    path.join(projectDir, 'currentmodel.json'),
    path.join(process.cwd(), 'current-model.json'),
    path.join(process.cwd(), '.current-model.json'),
    path.join(process.cwd(), 'currentmodel.json'),
    path.join(homeDir, 'current-model.json'),
    path.join(homeDir, '.current-model.json'),
    path.join(homeDir, 'currentmodel.json'),
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const normalized = normalizeLoadedSelection(JSON.parse(data));
        currentModelSelection = normalized;
        selectionEvents.emit('change', currentModelSelection);
        return true;
      } catch (_e) {
        // ignore parse errors
      }
    }
  }

  // nothing found
  currentModelSelection = null;
  selectionEvents.emit('change', null);
  return false;
}

/**
 * Save current model selection to .wren/current-model.json.
 * This persists the model choice so it survives restarts and is picked up by createContentGeneratorConfig.
 */
export async function saveCurrentModelSelection(
  provider: string,
  modelName: string,
  apiKey?: string,
  baseURL?: string,
  authType?: AuthType,
  modelParams?: Record<string, unknown>
): Promise<void> {
  // SECURITY: Never save API keys to disk
  if (apiKey !== undefined && apiKey !== null && apiKey !== '') {
    throw new Error('SECURITY VIOLATION: API keys must not be saved to disk. Pass undefined for apiKey parameter.');
  }

  const { atomicWriteJson } = await import('../utils/atomicWrite.js');
  const projectDir = path.join(process.cwd(), '.wren');
  const filePath = path.join(projectDir, 'current-model.json');

  const selection: TreeSelectionResult = {
    provider: provider as unknown as ProviderNode,
    modelName,
    apiKey: undefined, // Explicitly set to undefined for safety
    baseURL,
    authType: authType ?? AuthType.USE_OPENAI_COMPATIBLE,
    modelParams: modelParams ?? {},
  };

  try {
    // atomicWriteJson handles directory creation and atomic write
    await atomicWriteJson(filePath, selection);

    // Update in-memory cache only after successful write
    currentModelSelection = selection;
    selectionEvents.emit('change', currentModelSelection);

    console.info('[WREN] Saved current model selection to', filePath);
  } catch (error) {
    console.error('[WREN] Failed to save current model selection:', error);
    throw new Error(`Failed to save model selection: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Watch project-level `.wren/current-model.json` (preferred) and
// fall back to home-level `~/.wren/current-model.json`.
function initializeModelWatcher() {
  if (currentModelWatcher) return;

  const projectDir = path.join(process.cwd(), '.wren');
  const homeDir = path.join(os.homedir(), '.wren');
  const candidateNames = ['current-model.json', '.current-model.json', 'currentmodel.json'];

  const projectFiles = candidateNames.map((n) => path.join(projectDir, n));
  const cwdFiles = candidateNames.map((n) => path.join(process.cwd(), n));
  const homeFiles = candidateNames.map((n) => path.join(homeDir, n));

  const tryLoad = (filePath: string) => {
    if (!fs.existsSync(filePath)) return false;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      const normalized = normalizeLoadedSelection(data);
      if (!normalized) {
        console.warn('[WREN] current-model.json present but no selectable model found at', filePath);
        return false;
      }

      const prev = currentModelSelection;
      currentModelSelection = normalized;
      console.info('[WREN] Loaded current model from', filePath, '->', currentModelSelection?.modelName);
      if (JSON.stringify(prev) !== JSON.stringify(currentModelSelection)) {
        selectionEvents.emit('change', currentModelSelection);
      }
      return true;
    } catch (e) {
      console.warn('[WREN] Failed to parse current-model.json at', filePath, e);
      return false;
    }
  };

  // Search and load: project -> cwd files -> home
  for (const f of projectFiles) {
    if (tryLoad(f)) return;
  }
  for (const f of cwdFiles) {
    if (tryLoad(f)) return;
  }
  for (const f of homeFiles) {
    if (tryLoad(f)) return;
  }

  // We watch the project directory if present, else the repo cwd, else the home dir
  const watchTargets: string[] = [];
  if (fs.existsSync(projectDir)) watchTargets.push(projectDir);
  if (!watchTargets.includes(process.cwd())) watchTargets.push(process.cwd());
  if (fs.existsSync(homeDir)) watchTargets.push(homeDir);

  if (watchTargets.length === 0) return;

  try {
    // Create watchers for each target to ensure we catch .wren or file creations
    for (const watchTarget of watchTargets) {
      try {
        const w = fs.watch(watchTarget, (eventType, filename) => {
          if (!filename) return;
          const fname = String(filename);
          // react only to candidate filenames or .wren directory creation
          if (fname === '.wren' || candidateNames.includes(fname) || fname === '.current-model.json') {
            // Small delay to allow atomic replace (mv/ln) to settle
            setTimeout(() => {
              // Try project files first
              for (const f of projectFiles) {
                if (tryLoad(f)) return;
              }
              // Try cwd
              for (const f of cwdFiles) {
                if (tryLoad(f)) return;
              }
              // Try home files
              for (const f of homeFiles) {
                if (tryLoad(f)) return;
              }

              // If nothing found, clear selection
              const prev = currentModelSelection;
              currentModelSelection = null;
              if (prev !== null) {
                console.info('[WREN] current-model.json removed or no longer present; clearing selection');
                selectionEvents.emit('change', null);
              }
            }, 50);
          }
        });

        // store single reference; closing previous watchers isn't required here but keep a handle
        currentModelWatcher = w;
      } catch (_inner) {
        // best-effort per-target watcher
      }
    }
  } catch (e) {
    // Best-effort watcher; don't crash if not available
    console.warn('[WREN] Failed to initialize model file watcher', e);
  }
}

/**
 * Normalize a loaded JSON blob into TreeSelectionResult if possible.
 * Accepts either a minimal shape:
 *  { provider: 'openai', modelName: 'gpt-4o', apiKey: '...', baseURL: '...' }
 * or a full tree export which contains provider nodes, models, metrics, quotas, etc.
 */
function normalizeLoadedSelection(data: unknown): TreeSelectionResult | null {
  if (!data) return null;

  const dataObj = data as Record<string, unknown>;

  // If it already matches the simple shape, accept it
  if (typeof dataObj['modelName'] === 'string' && dataObj['provider']) {
    return {
      provider: (dataObj['provider'] as unknown) as ProviderNode,
      modelName: String(dataObj['modelName']),
      apiKey: dataObj['apiKey'] as string | undefined,
      baseURL: dataObj['baseURL'] as string | undefined,
      authType: (dataObj['authType'] as AuthType) ?? AuthType.USE_OPENAI_COMPATIBLE,
      modelParams: (dataObj['modelParams'] as Record<string, unknown>) ?? {},
    };
  }

  // If this looks like a serialized ProviderTreeRoot (v2 export), attempt to extract
  // the currently selected model by searching for a ModelsNode with selectedModel set.
  try {
    // If it's a full tree export with quotas -> providers -> models...
      const maybeQuotas = dataObj['quotas'] ?? dataObj['providers'] ?? null;
      if (maybeQuotas && typeof maybeQuotas === 'object') {
        for (const [quotaName, quotaData] of Object.entries(maybeQuotas as Record<string, unknown>)) {
          const providers = (quotaData as Record<string, unknown>)['providers'] ?? quotaData;
          if (!providers || typeof providers !== 'object') continue;

          for (const [provKey, provVal] of Object.entries(providers as Record<string, unknown>)) {
            const providerJson = provVal as Record<string, unknown>;
            const models = (providerJson['models'] ?? providerJson['children']) as unknown;
            if (!models) continue;

            if (Array.isArray(models)) {
              const selected = models.find((m) => (m && typeof m === 'object' && (((m as Record<string, unknown>)['selected']) || (String((m as Record<string, unknown>)['name']) === String(providerJson['selectedModel'])))));
              if (selected && typeof selected === 'object') {
                const sel = selected as Record<string, unknown>;
                return {
                  provider: (provKey as unknown) as ProviderNode,
                  modelName: String(sel['name'] ?? ((sel['model'] as Record<string, unknown>)?.['name'])),
                  apiKey: (providerJson['envVar'] ?? providerJson['envVarName']) as string | undefined,
                  baseURL: (providerJson['baseUrl'] ?? providerJson['baseURL']) as string | undefined,
                  authType: AuthType.USE_OPENAI_COMPATIBLE,
                  modelParams: { metrics: sel, provider: providerJson, quota: quotaName },
                };
              }
            } else if (typeof models === 'object') {
              const selectedName = (providerJson['selectedModel'] ?? providerJson['selected']) as string | undefined;
              if (selectedName && (models as Record<string, unknown>)[selectedName]) {
                return {
                  provider: (provKey as unknown) as ProviderNode,
                  modelName: selectedName,
                  apiKey: (providerJson['envVar'] ?? providerJson['envVarName']) as string | undefined,
                  baseURL: (providerJson['baseUrl'] ?? providerJson['baseURL']) as string | undefined,
                  authType: AuthType.USE_OPENAI_COMPATIBLE,
                  modelParams: { metrics: (models as Record<string, unknown>)[selectedName], provider: providerJson, quota: quotaName },
                };
              }
            }
          }
        }
      }
    } catch (_e) {
      // ignore; we'll return null below
    }

  return null;
}

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  getTier?(): Promise<UserTierId | undefined>;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
  USE_OPENAI_COMPATIBLE = 'openai-compatible',
  USE_QWEN_OAUTH = 'qwen-oauth',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  baseURL?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  enableOpenAILogging?: boolean;
  // Timeout configuration in milliseconds
  timeout?: number;
  // Maximum retries for failed requests
  maxRetries?: number;
  samplingParams?: {
    top_p?: number;
    top_k?: number;
    repetition_penalty?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    temperature?: number;
    max_tokens?: number;
  };
};

export async function createContentGeneratorConfig(
  _model: string | undefined,
  _authType: AuthType | undefined,
): Promise<ContentGeneratorConfig> {
  // Initialize file watcher on first call; this will load project/home selection
  initializeModelWatcher();

  // If a project/home `.wren/current-model.json` was loaded by the watcher, use it
  if (currentModelSelection) {
    // Get API key from environment for the provider (don't trust file-stored keys)
    // currentModelSelection.provider can be either a ProviderNode object or a string
    const providerString = typeof currentModelSelection.provider === 'string'
      ? currentModelSelection.provider
      : currentModelSelection.provider.provider;
    const providerEnvVar = ProviderNode.canonicalEnvVar(providerString as Providers);
    const apiKey = process.env[providerEnvVar] || currentModelSelection.apiKey;

    return {
      model: currentModelSelection.modelName,
      apiKey,
      baseURL: currentModelSelection.baseURL,
      authType: currentModelSelection.authType,
    };
  }

  // No persisted selection found; fall back to original environment-based logic.
  const geminiApiKey = process.env.GEMINI_API_KEY || undefined;
  const zaiApiKey = process.env.ZAI_API_KEY || process.env.GLM_API_KEY;
  const zaiBaseUrl = process.env.ZAI_BASE_URL || undefined;

  const geminiKey = geminiApiKey;
  const googleApiKey = process.env.GOOGLE_API_KEY || undefined;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || undefined;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION || undefined;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  // Use runtime model from config if available, otherwise fallback to parameter or default
  const effectiveModel = _model || DEFAULT_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType: _authType,
  };

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    _authType === AuthType.LOGIN_WITH_GOOGLE ||
    _authType === AuthType.CLOUD_SHELL
  ) {
    return contentGeneratorConfig;
  }

  if (_authType === AuthType.USE_QWEN_OAUTH) {
    // For Qwen OAuth, we need to get the access token
    const { getOauthClient } = await import('../code_assist/oauth2.js');
    const { Providers } = await import('../config/providers.js');
    const oauthClient = await getOauthClient(Providers.QWEN, {
      clientId: process.env.QWEN_CLIENT_ID,
      clientSecret: process.env.QWEN_CLIENT_SECRET,
      tokenUrl: process.env.QWEN_TOKEN_URL || 'https://oauth.aliyun.com/v1/token',
    });
    const accessToken = await oauthClient.getAccessToken();
    
    contentGeneratorConfig.apiKey = accessToken;
    contentGeneratorConfig.baseURL = process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    return contentGeneratorConfig;
  }

  if (_authType === AuthType.USE_GEMINI && geminiKey) {
    contentGeneratorConfig.apiKey = geminiKey;
    contentGeneratorConfig.vertexai = false;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  if (
    _authType === AuthType.USE_VERTEX_AI &&
    (googleApiKey || (googleCloudProject && googleCloudLocation))
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;

    return contentGeneratorConfig;
  }

  // Auto-detect provider from model if using OpenAI-compatible auth
  if (_authType === AuthType.USE_OPENAI_COMPATIBLE || !_authType) {
    // Prefer explicit Z.AI/GLM API key if present
    if (zaiApiKey) {
      contentGeneratorConfig.apiKey = zaiApiKey;
      contentGeneratorConfig.baseURL = zaiBaseUrl ?? 'https://api.z.ai';
      contentGeneratorConfig.authType = AuthType.USE_OPENAI_COMPATIBLE;
      return contentGeneratorConfig;
    }
    const modelConfig = getModelConfig(effectiveModel);
    const provider = modelConfig?.provider as Providers;

    if (provider) {
      const credentials = getProviderCredentials(provider);

      if (credentials.apiKey) {
        contentGeneratorConfig.apiKey = credentials.apiKey;
        contentGeneratorConfig.baseURL = credentials.baseURL;
        contentGeneratorConfig.authType = AuthType.USE_OPENAI_COMPATIBLE;
        return contentGeneratorConfig;
      }
    }

    // Fallback to OPENAI_API_KEY if no provider-specific key found
    if (openaiApiKey) {
      contentGeneratorConfig.apiKey = openaiApiKey;
      contentGeneratorConfig.authType = AuthType.USE_OPENAI_COMPATIBLE;
      return contentGeneratorConfig;
    }
  }

  return contentGeneratorConfig;
}

// Optionally print debugging information when env var is set. This avoids
// revealing secret values while showing which provider/baseURL was chosen.


export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const version = process.env.WREN_CODER_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (
    config.authType === AuthType.LOGIN_WITH_GOOGLE ||
    config.authType === AuthType.CLOUD_SHELL
  ) {
    return createCodeAssistContentGenerator(
      httpOptions,
      config.authType,
      gcConfig,
      sessionId,
    );
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });

    return googleGenAI.models;
  }

  if (config.authType === AuthType.USE_OPENAI_COMPATIBLE) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    // Ensure models for the provider are fetched once per session and cached across sessions
    try {
      const { ProviderModelCacheService } = await import('../services/providerModelCacheService.js');
      const baseURL = process.env.OPENAI_BASE_URL || '';
      await ProviderModelCacheService.ensureModelsFetchedFor(baseURL, config.apiKey, (await import('../config/providers.js')).Providers.OPENAI);
    } catch (_e) {
      // Best-effort
    }

    // Import OpenAIContentGenerator dynamically to avoid circular dependencies
    const { OpenAIContentGenerator } = await import(
      './openaiContentGenerator.js'
    );

    // Always use OpenAIContentGenerator, logging is controlled by enableOpenAILogging flag
    return new OpenAIContentGenerator(config.apiKey, config.model, gcConfig);
  }

  if (config.authType === AuthType.USE_QWEN_OAUTH) {
    // For Qwen OAuth, we need to get the access token
    const { getOauthClient } = await import('../code_assist/oauth2.js');
    const oauthClient = await getOauthClient((await import('../config/providers.js')).Providers.QWEN, {
      clientId: process.env.QWEN_CLIENT_ID,
      clientSecret: process.env.QWEN_CLIENT_SECRET,
      tokenUrl: 'https://oauth.aliyun.com/v1/token',
    });
    const accessToken = await oauthClient.getAccessToken();

    // Ensure models for Qwen are fetched once per session
    try {
      const { ProviderModelCacheService } = await import('../services/providerModelCacheService.js');
      const baseURL = process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
      await ProviderModelCacheService.ensureModelsFetchedFor(baseURL, accessToken, (await import('../config/providers.js')).Providers.QWEN);
    } catch (_e) {
      // Best-effort
    }

    // Use OpenAIContentGenerator with OAuth token as API key
    const { OpenAIContentGenerator } = await import('./openaiContentGenerator.js');
    return new OpenAIContentGenerator(accessToken, config.model, gcConfig);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}

async function _selectModelFromTree(): Promise<TreeSelectionResult> {
  const tree = new ProviderTreeRoot();
  await tree.initialize();

  const activeProviders = tree.getActiveProviders();
  if (activeProviders.length === 0) {
    throw new Error('No providers with API keys available');
  }

  // Select best provider by Bayesian score
  const bestProvider = activeProviders.reduce((best, current) => {
    const bestMetrics = best.children.find(c => c instanceof MetricsNode) as MetricsNode;
    const currentMetrics = current.children.find(c => c instanceof MetricsNode) as MetricsNode;
    return (currentMetrics?.bayesianScore || 0) > (bestMetrics?.bayesianScore || 0) ? current : best;
  });

  // Get the best model from this provider
  const modelsNode = bestProvider.children.find(c => c instanceof ModelsNode) as ModelsNode;
  if (!modelsNode || modelsNode.models.length === 0) {
    throw new Error(`No models available for provider ${bestProvider.provider}`);
  }

  // Select model with best Bayesian score
  const bestModel = modelsNode.models.reduce((best, current) => {
    const bestScore = best ? (modelsNode.children
      .find(c => c instanceof ModelNode && (c as ModelNode).model.name === best.name) as ModelNode)
      ?.bayesianScore || 0 : 0;
    const currentScore = (modelsNode.children
      .find(c => c instanceof ModelNode && (c as ModelNode).model.name === current.name) as ModelNode)
      ?.bayesianScore || 0;
    return currentScore > bestScore ? current : best;
  });

  return {
    provider: bestProvider,
    modelName: bestModel.name,
    apiKey: bestProvider.getApiKey(),
    baseURL: bestProvider.baseUrl,
    authType: AuthType.USE_OPENAI_COMPATIBLE, // Default to OpenAI compatible
  };
}
