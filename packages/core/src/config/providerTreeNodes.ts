/**
 * Provider Tree Node Classes with JSON Serialization
 * API Keys stored in environment variables only
 */

import { Providers } from './providers.js';
import { ModelConfig } from './providers/base.js';
import { getModelsByProvider, initializeModelRegistry } from './modelRegistry.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { convertVsCodeModelToModelConfig, VsCodeLanguageModel } from './providers/vscode.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Base abstract node class
export abstract class TreeNode {
  id: string;
  label: string;
  type: string;
  children: TreeNode[] = [];
  expanded: boolean = false;

  constructor(id: string, label: string, type: string) {
    this.id = id;
    this.label = label;
    this.type = type;
  }

  abstract toJSON(): Record<string, any>;
  abstract fromJSON(data: Record<string, any>): void;

  addChild(node: TreeNode): void {
    this.children.push(node);
  }

  removeChild(id: string): void {
    this.children = this.children.filter(c => c.id !== id);
  }

  findNode(id: string): TreeNode | null {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.findNode(id);
      if (found) return found;
    }
    return null;
  }
}

// Provider Node
// Panel node: lightweight detail view rendered under the provider in the tree.
export class PanelNode extends TreeNode {
  parentProviderId: string;
  details: string | null = null;

  constructor(parent: ProviderNode) {
    super(`${parent.id}-panel`, 'Details', 'panel');
    this.parentProviderId = parent.id;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      details: this.details,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    const maybeDetails = (data as Record<string, unknown>)['details'];
    this.details = typeof maybeDetails === 'string' ? maybeDetails : null;
  }
}

export class ProviderNode extends TreeNode {
  provider: Providers;
  enabled: boolean = true;
  baseUrl?: string;
  envVar: string;
  bayesWeight: number = 1.0;

  // Provider-level default parameters (inherited by models unless overridden)
  defaultReasoning?: {
    effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
    exclude?: boolean;
  };
  defaultVerbosity?: 'low' | 'medium' | 'high';
  defaultIncludeReasoning?: boolean;
  defaultTemperature?: number;
  defaultTopP?: number;
  defaultMaxTokens?: number;

  constructor(provider: Providers, envVar: string, baseUrl?: string) {
    // Format provider name for display: short slug
    const displayName = ProviderNode.getShortSlug(provider);

    super(`provider-${provider}`, displayName, 'provider');
    this.provider = provider;
    // Use the provided envVar as-is
    this.envVar = envVar;
    this.baseUrl = baseUrl;

    // Add a lightweight panel node under the provider (UI can render this
    // panel as the primary details view for the provider), then other
    // configuration children.
    // Panels are opt-in via env var to avoid changing test expectations and
    // to keep the tree lightweight by default. Enable by setting
    // ENABLE_PROVIDER_PANELS=1 in the environment.
    if (process.env.ENABLE_PROVIDER_PANELS === '1') {
      this.addChild(new PanelNode(this));
    }
    this.addChild(new ConfigNode(this));
    this.addChild(new ModelsNode(this));
    this.addChild(new UsageNode(this));
    this.addChild(new MetricsNode(this));
  }

  get hasApiKey(): boolean {
    // Check provider-scoped env var
    if (process.env[this.envVar]) return true;

    // Check aliases for compatibility
    if (this.provider === Providers.MOONSHOT_AI && process.env.KIMI_API_KEY) return true;
    if (this.provider === Providers.ANTHROPIC && process.env.CLAUDE_API_KEY) return true;
    if (this.provider === Providers.XAI && process.env.GROK_API_KEY) return true;

    return false;
  }

  getApiKey(): string | undefined {
    // Check primary env var
    if (process.env[this.envVar]) return process.env[this.envVar];

    // Check aliases
    if (this.provider === Providers.MOONSHOT_AI && process.env.KIMI_API_KEY) {
      return process.env.KIMI_API_KEY;
    }
    if (this.provider === Providers.ANTHROPIC && process.env.CLAUDE_API_KEY) {
      return process.env.CLAUDE_API_KEY;
    }
    if (this.provider === Providers.XAI && process.env.GROK_API_KEY) {
      return process.env.GROK_API_KEY;
    }

    return undefined;
  }

  static canonicalEnvVar(provider: Providers): string {
    // Special-case PAT for VSCode provider
    if (provider === Providers.VSCODE_LLM) return 'VSCODE_LLM_PAT';
    const up = (provider as string).toUpperCase().replace(/-/g, '_');
    return `PROVIDER_${up}_API_KEY`;
  }

  static getShortSlug(provider: Providers): string {
    const slugs: Record<string, string> = {
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'google': 'Gemini',
      'google-vertex': 'Vertex',
      'nvidia': 'NVIDIA',
      'deepseek': 'DeepSeek',
      'openrouter': 'OpenRouter',
      'groq': 'Groq',
      'kilo': 'Kilo',
      'qwen': 'Qwen',
      'moonshot-ai': 'Moonshot',
      'mistral': 'Mistral',
      'cohere': 'Cohere',
      'meta': 'Meta',
      'xai': 'xAI',
      'cerebras': 'Cerebras',
      'huggingface': 'HuggingFace',
      'perplexity': 'Perplexity',
      'vscode-llm': 'VSCode',
    };
    return slugs[provider] || provider.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  toJSON(): Record<string, any> {
    return {
      id: this.id,
      provider: this.provider,
      enabled: this.enabled,
      baseUrl: this.baseUrl,
      envVar: this.envVar, // Store env var name, not the key itself
      bayesWeight: this.bayesWeight,
      // Provider-level default parameters
      defaultReasoning: this.defaultReasoning,
      defaultVerbosity: this.defaultVerbosity,
      defaultIncludeReasoning: this.defaultIncludeReasoning,
      defaultTemperature: this.defaultTemperature,
      defaultTopP: this.defaultTopP,
      defaultMaxTokens: this.defaultMaxTokens,
      children: this.children.map(c => c.toJSON())
    };
  }

  fromJSON(data: Record<string, any>): void {
    this.enabled = data.enabled ?? true;
    this.baseUrl = data.baseUrl;
    this.bayesWeight = data.bayesWeight ?? 1.0;

    // Load provider-level default parameters
    if (data.defaultReasoning) this.defaultReasoning = data.defaultReasoning;
    if (data.defaultVerbosity) this.defaultVerbosity = data.defaultVerbosity;
    if (data.defaultIncludeReasoning !== undefined) this.defaultIncludeReasoning = data.defaultIncludeReasoning;
    if (data.defaultTemperature !== undefined) this.defaultTemperature = data.defaultTemperature;
    if (data.defaultTopP !== undefined) this.defaultTopP = data.defaultTopP;
    if (data.defaultMaxTokens !== undefined) this.defaultMaxTokens = data.defaultMaxTokens;

    // Never store API key in JSON - only reference env var
  }
}

// Configuration Node
export class ConfigNode extends TreeNode {
  parent: ProviderNode;

  constructor(parent: ProviderNode) {
    super(`${parent.id}-config`, 'Configuration', 'config');
    this.parent = parent;
  }

  toJSON(): Record<string, any> {
    return {
      id: this.id,
      type: 'config',
      baseUrl: this.parent.baseUrl,
      envVar: this.parent.envVar,
      enabled: this.parent.enabled,
      bayesWeight: this.parent.bayesWeight
    };
  }

  fromJSON(data: Record<string, any>): void {
    this.parent.baseUrl = data.baseUrl;
    this.parent.enabled = data.enabled;
    this.parent.bayesWeight = data.bayesWeight;
  }
}

// Models Node
export class ModelsNode extends TreeNode {
  parent: ProviderNode;
  models: ModelConfig[] = [];
  selectedModel?: string;
  // quick lookup for models by name
  private modelsMap: Map<string, ModelConfig> = new Map();

  constructor(parent: ProviderNode) {
    super(`${parent.id}-models`, 'Available Models', 'models');
    this.parent = parent;
  }

  loadModels(models: ModelConfig[]): void {
    this.models = models;
    this.modelsMap = new Map(models.map(m => [m.name, m] as [string, ModelConfig]));
    this.children = models.map(model => new ModelNode(model, this));
  }

  /**
   * Select a model by name. Returns true if selection changed/exists.
   */
  selectModel(name: string): boolean {
    if (!this.modelsMap.has(name)) return false;
    this.selectedModel = name;
    // mark children selection state where available
    for (const child of this.children) {
      if (child instanceof ModelNode) {
        (child as ModelNode & { selected?: boolean }).selected = child.model.name === name;
      }
    }
    return true;
  }

  toJSON(): Record<string, any> {
    return {
      id: this.id,
      type: 'models',
      selectedModel: this.selectedModel,
      models: this.models.map(m => ({
        name: m.name,
        tokenLimit: m.tokenLimit,
        supportsContextReorg: m.supportsContextReorg,
        capabilities: m.capabilities
      })),
      // Export ModelNode children with metrics
      children: this.children.map(c => c.toJSON())
    };
  }

  fromJSON(data: Record<string, any>): void {
    this.selectedModel = data.selectedModel;
    if (data.models) {
      this.loadModels(data.models);
    }
  }
}

// Individual Model Node
export class ModelNode extends TreeNode {
  model: ModelConfig;
  parent: ModelsNode;
  // optional UI selection marker
  selected?: boolean;

  // Response format flags (default: undefined = None)
  // Only track actual API format differences, not provider identity
  gptOssFormat?: boolean;     // NVIDIA GPT-OSS models use responses.create API
  geminiNative?: boolean;     // Google Gemini native format (not OpenAI-compat)

  // Per-model API parameters (override provider defaults)
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';  // Reasoning effort level
    max_tokens?: number;                 // Max tokens for reasoning
    exclude?: boolean;                   // Exclude reasoning from response
  };
  verbosity?: 'low' | 'medium' | 'high';  // Response detail level
  includeReasoning?: boolean;              // Include reasoning in response
  temperature?: number;                    // Sampling temperature (0.0-2.0)
  topP?: number;                          // Nucleus sampling (0.0-1.0)
  maxTokens?: number;                     // Max output tokens

  // Per-model performance metrics
  totalRequests: number = 0;
  successCount: number = 0;
  errorCount: number = 0;
  totalLatencyMs: number = 0;

  constructor(model: ModelConfig, parent: ModelsNode) {
    const providerSlug = ProviderNode.getShortSlug(parent.parent.provider as Providers);
    const modelSlug = ModelNode.getShortModelName(model.name);
    super(`model-${model.name}`, `[${providerSlug}] ${modelSlug}`, 'model');
    this.model = model;
    this.parent = parent;

    // Auto-detect format flags based on model name
    if (model.name.startsWith('openai/gpt-oss-')) {
      this.gptOssFormat = true;
    }

    // Gemini native models (not via OpenAI-compat API)
    if (model.provider === 'google' && model.name.startsWith('models/gemini-')) {
      this.geminiNative = true;
    }
  }

  static getShortModelName(fullName: string): string {
    // Remove provider prefix if present (e.g., "moonshotai/" -> "")
    let name = fullName.replace(/^[^/]+\//, '');

    // Shorten common patterns
    name = name.replace(/(-instruct|-chat)$/, '');
    name = name.replace(/\b(gpt-)\d+\b/, (match) => match.replace('gpt-', 'GPT-'));
    name = name.replace(/\b(claude-)\d+/, (match) => match.toUpperCase());

    // Limit length
    if (name.length > 35) {
      name = name.substring(0, 32) + '...';
    }

    return name;
  }

  get tokenLimit(): number {
    return this.model.tokenLimit;
  }

  get supportsContextReorg(): boolean {
    return this.model.supportsContextReorg ?? false;
  }

  /**
   * Get effective parameters with provider defaults as fallback
   */
  getEffectiveParameters(): {
    reasoning?: { effort?: 'low' | 'medium' | 'high'; max_tokens?: number; exclude?: boolean };
    verbosity?: 'low' | 'medium' | 'high';
    includeReasoning?: boolean;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
  } {
    const provider = this.parent.parent;
    return {
      reasoning: this.reasoning ?? provider.defaultReasoning,
      verbosity: this.verbosity ?? provider.defaultVerbosity,
      includeReasoning: this.includeReasoning ?? provider.defaultIncludeReasoning,
      temperature: this.temperature ?? provider.defaultTemperature,
      topP: this.topP ?? provider.defaultTopP,
      maxTokens: this.maxTokens ?? provider.defaultMaxTokens
    };
  }

  /**
   * Record model-level metrics
   */
  recordSuccess(latencyMs: number): void {
    this.totalRequests++;
    this.successCount++;
    this.totalLatencyMs += latencyMs;
  }

  recordError(): void {
    this.totalRequests++;
    this.errorCount++;
  }

  /**
   * Get per-model success rate
   */
  get successRate(): number {
    if (this.totalRequests === 0) return 0;
    return (this.successCount / this.totalRequests) * 100;
  }

  /**
   * Get per-model average latency
   */
  get avgLatencyMs(): number {
    if (this.successCount === 0) return 0;
    return this.totalLatencyMs / this.successCount;
  }

  /**
   * Calculate per-model Bayesian ranking score
   */
  get bayesianScore(): number {
    const alpha = 1;
    const beta = 1;

    if (this.totalRequests === 0) {
      return 0.5;  // Neutral for no data
    }

    const posteriorSuccessRate = (this.successCount + alpha) / (this.totalRequests + alpha + beta);
    const avgLatency = this.avgLatencyMs;
    const latencyFactor = avgLatency > 0 ? Math.max(0, 1 - (avgLatency / 5000)) : 1;

    return posteriorSuccessRate * (0.7 + 0.3 * latencyFactor);
  }

  /**
   * Get per-model ranking grade
   */
  get rankingGrade(): string {
    const score = this.bayesianScore;
    if (score >= 0.95) return 'A+';
    if (score >= 0.90) return 'A';
    if (score >= 0.85) return 'A-';
    if (score >= 0.80) return 'B+';
    if (score >= 0.75) return 'B';
    if (score >= 0.70) return 'B-';
    if (score >= 0.65) return 'C+';
    if (score >= 0.60) return 'C';
    if (score >= 0.55) return 'C-';
    if (score >= 0.50) return 'D';
    return 'F';
  }

  toJSON(): Record<string, any> {
    return {
      id: this.id,
      name: this.model.name,
      tokenLimit: this.model.tokenLimit,
      supportsContextReorg: this.model.supportsContextReorg,
      capabilities: this.model.capabilities,
      gptOssFormat: this.gptOssFormat,
      geminiNative: this.geminiNative,
      selected: this.selected,
      // Per-model API parameters
      reasoning: this.reasoning,
      verbosity: this.verbosity,
      includeReasoning: this.includeReasoning,
      temperature: this.temperature,
      topP: this.topP,
      maxTokens: this.maxTokens,
      // Per-model performance metrics
      totalRequests: this.totalRequests,
      successCount: this.successCount,
      errorCount: this.errorCount,
      totalLatencyMs: this.totalLatencyMs,
      successRate: this.successRate,
      avgLatencyMs: this.avgLatencyMs,
      bayesianScore: this.bayesianScore,
      rankingGrade: this.rankingGrade
    };
  }

  fromJSON(data: Record<string, any>): void {
    // Load response format flags
    this.gptOssFormat = data.gptOssFormat;
    this.geminiNative = data.geminiNative;
    this.selected = !!data.selected;

    // Load per-model API parameters
    if (data.reasoning) this.reasoning = data.reasoning;
    if (data.verbosity) this.verbosity = data.verbosity;
    if (data.includeReasoning !== undefined) this.includeReasoning = data.includeReasoning;
    if (data.temperature !== undefined) this.temperature = data.temperature;
    if (data.topP !== undefined) this.topP = data.topP;
    if (data.maxTokens !== undefined) this.maxTokens = data.maxTokens;

    // Load per-model performance metrics
    if (data.totalRequests !== undefined) this.totalRequests = data.totalRequests;
    if (data.successCount !== undefined) this.successCount = data.successCount;
    if (data.errorCount !== undefined) this.errorCount = data.errorCount;
    if (data.totalLatencyMs !== undefined) this.totalLatencyMs = data.totalLatencyMs;
  }
}

// Usage tracking node (per-provider quotas and limits)
export class UsageNode extends TreeNode {
  parent: ProviderNode;
  dailyTokenLimit?: number;
  dailyTokensUsed: number = 0;
  monthlyTokenLimit?: number;
  monthlyTokensUsed: number = 0;
  requestsPerMinute?: number;
  costPer1kTokens?: number;
  // track requests in current minute window
  private rpmWindowStartMs?: number;
  private rpmCountInWindow: number = 0;

  constructor(parent: ProviderNode) {
    super(`${parent.id}-usage`, 'Usage & Limits', 'usage');
    this.parent = parent;
  }

  get quotaUsagePercent(): number {
    if (!this.dailyTokenLimit) return 0;
    return (this.dailyTokensUsed / this.dailyTokenLimit) * 100;
  }

  get estimatedDailyCost(): number {
    if (!this.costPer1kTokens) return 0;
    return (this.dailyTokensUsed / 1000) * this.costPer1kTokens;
  }

  toJSON(): Record<string, any> {
    return {
      id: this.id,
      type: 'usage',
      dailyTokenLimit: this.dailyTokenLimit,
      dailyTokensUsed: this.dailyTokensUsed,
      monthlyTokenLimit: this.monthlyTokenLimit,
      monthlyTokensUsed: this.monthlyTokensUsed,
      requestsPerMinute: this.requestsPerMinute,
      costPer1kTokens: this.costPer1kTokens,
      rpmWindowStartMs: this.rpmWindowStartMs,
      rpmCountInWindow: this.rpmCountInWindow
    };
  }

  fromJSON(data: Record<string, any>): void {
    this.dailyTokenLimit = data.dailyTokenLimit;
    this.dailyTokensUsed = data.dailyTokensUsed ?? 0;
    this.monthlyTokenLimit = data.monthlyTokenLimit;
    this.monthlyTokensUsed = data.monthlyTokensUsed ?? 0;
    this.requestsPerMinute = data.requestsPerMinute;
    this.costPer1kTokens = data.costPer1kTokens;
    this.rpmWindowStartMs = data.rpmWindowStartMs;
    this.rpmCountInWindow = data.rpmCountInWindow ?? 0;
  }

  incrementUsage(tokens: number): void {
    this.dailyTokensUsed += tokens;
    this.monthlyTokensUsed += tokens;
  }

  /**
   * Return true if a request of `tokens` can be consumed without exceeding
   * configured limits. Does not mutate state.
   */
  canConsume(tokens: number): boolean {
    if (this.dailyTokenLimit && (this.dailyTokensUsed + tokens) > this.dailyTokenLimit) return false;
    if (this.monthlyTokenLimit && (this.monthlyTokensUsed + tokens) > this.monthlyTokenLimit) return false;
    if (this.requestsPerMinute) {
      const now = Date.now();
      const windowStart = this.rpmWindowStartMs ?? now;
      const elapsed = now - windowStart;
      const withinWindowCount = (elapsed < 60_000) ? this.rpmCountInWindow : 0;
      if (withinWindowCount >= this.requestsPerMinute) return false;
    }
    return true;
  }

  /**
   * Try to consume quota for `tokens`. Returns true if successful and
   * increments internal counters; false if limits would be exceeded.
   */
  tryConsume(tokens: number): boolean {
    if (!this.canConsume(tokens)) return false;
    this.incrementUsage(tokens);

    if (this.requestsPerMinute) {
      const now = Date.now();
      if (!this.rpmWindowStartMs || (now - this.rpmWindowStartMs) >= 60_000) {
        this.rpmWindowStartMs = now;
        this.rpmCountInWindow = 1;
      } else {
        this.rpmCountInWindow++;
      }
    }

    return true;
  }

  resetDaily(): void {
    this.dailyTokensUsed = 0;
  }

  resetMonthly(): void {
    this.monthlyTokensUsed = 0;
  }
}

// Metrics Node
export class MetricsNode extends TreeNode {
  parent: ProviderNode;
  totalRequests: number = 0;
  successCount: number = 0;
  errorCount: number = 0;
  totalLatencyMs: number = 0;
  lastError?: string;
  lastErrorTimestamp?: Date;

  constructor(parent: ProviderNode) {
    super(`${parent.id}-metrics`, 'Performance Metrics', 'metrics');
    this.parent = parent;
  }

  get successRate(): number {
    if (this.totalRequests === 0) return 0;
    return (this.successCount / this.totalRequests) * 100;
  }

  get avgLatencyMs(): number {
    if (this.successCount === 0) return 0;
    return this.totalLatencyMs / this.successCount;
  }

  /**
   * Calculate Bayesian ranking score based on success rate and latency
   * Uses Beta distribution with prior: alpha=1, beta=1 (uniform prior)
   * Score = (successes + alpha) / (total + alpha + beta) * latency_factor
   * Higher score = better performance
   */
  get bayesianScore(): number {
    const alpha = 1;  // Prior successes
    const beta = 1;   // Prior failures

    if (this.totalRequests === 0) {
      return 0.5;  // Neutral score for no data
    }

    // Calculate posterior success rate with Bayesian smoothing
    const posteriorSuccessRate = (this.successCount + alpha) / (this.totalRequests + alpha + beta);

    // Latency penalty: normalize to 0-1 range (assuming 5000ms = very slow)
    const avgLatency = this.avgLatencyMs;
    const latencyFactor = avgLatency > 0 ? Math.max(0, 1 - (avgLatency / 5000)) : 1;

    // Combined score: success rate weighted by latency
    return posteriorSuccessRate * (0.7 + 0.3 * latencyFactor);
  }

  /**
   * Get human-readable ranking grade (A+, A, B+, B, C, D, F)
   */
  get rankingGrade(): string {
    const score = this.bayesianScore;
    if (score >= 0.95) return 'A+';
    if (score >= 0.90) return 'A';
    if (score >= 0.85) return 'A-';
    if (score >= 0.80) return 'B+';
    if (score >= 0.75) return 'B';
    if (score >= 0.70) return 'B-';
    if (score >= 0.65) return 'C+';
    if (score >= 0.60) return 'C';
    if (score >= 0.55) return 'C-';
    if (score >= 0.50) return 'D';
    return 'F';
  }

  toJSON(): Record<string, any> {
    return {
      id: this.id,
      type: 'metrics',
      totalRequests: this.totalRequests,
      successCount: this.successCount,
      errorCount: this.errorCount,
      totalLatencyMs: this.totalLatencyMs,
      lastError: this.lastError,
      lastErrorTimestamp: this.lastErrorTimestamp?.toISOString(),
      successRate: this.successRate,
      avgLatencyMs: this.avgLatencyMs,
      bayesianScore: this.bayesianScore,
      rankingGrade: this.rankingGrade
    };
  }

  fromJSON(data: Record<string, any>): void {
    this.totalRequests = data.totalRequests ?? 0;
    this.successCount = data.successCount ?? 0;
    this.errorCount = data.errorCount ?? 0;
    this.totalLatencyMs = data.totalLatencyMs ?? 0;
    this.lastError = data.lastError;
    if (data.lastErrorTimestamp) {
      this.lastErrorTimestamp = new Date(data.lastErrorTimestamp);
    }
    // No rpm fields in metrics; quota tracks rpm window
  }

  recordSuccess(latencyMs: number): void {
    this.totalRequests++;
    this.successCount++;
    this.totalLatencyMs += latencyMs;
  }

  recordError(error: string): void {
    this.totalRequests++;
    this.errorCount++;
    this.lastError = error;
    this.lastErrorTimestamp = new Date();
  }

  /**
   * Unified recorder that attempts to consume quota (if provided) and then
   * records success or error depending on the result. Returns true if
   * request was recorded as success.
   */
  recordRequest(tokens: number, latencyMs?: number, error?: string): boolean {
    // Try to consume quota if provider has usage node
    const usageNode = this.parent.children.find(c => c instanceof UsageNode) as UsageNode | undefined;
    if (usageNode && !usageNode.tryConsume(tokens)) {
      // couldn't consume quota -> record error and return false
      this.recordError('quota_exceeded');
      return false;
    }

    if (error) {
      this.recordError(error);
      return false;
    }

    this.recordSuccess(latencyMs ?? 0);
    return true;
  }

  reset(): void {
    this.totalRequests = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.totalLatencyMs = 0;
    this.lastError = undefined;
    this.lastErrorTimestamp = undefined;
  }
}

// Quota container node - first-class tree level containing providers
export class QuotaNode extends TreeNode {
  quotaName: string;
  providers: Map<string, ProviderNode> = new Map();

  constructor(quotaName: string = 'identity') {
    super(`quota-${quotaName}`, quotaName, 'quota');
    this.quotaName = quotaName;
    this.expanded = true;
  }

  addProvider(provider: ProviderNode): void {
    this.providers.set(provider.provider, provider);
    this.addChild(provider);
  }

  getProvider(name: string): ProviderNode | undefined {
    return this.providers.get(name);
  }

  toJSON(): Record<string, any> {
    const providers: Record<string, any> = {};
    this.providers.forEach((provider, key) => {
      providers[key] = provider.toJSON();
    });

    return {
      id: this.id,
      type: 'quota',
      quotaName: this.quotaName,
      providers
    };
  }

  fromJSON(data: Record<string, any>): void {
    if (data.quotaName) this.quotaName = data.quotaName;
    if (data.providers) {
      Object.entries(data.providers).forEach(([key, value]: [string, any]) => {
        const provider = this.providers.get(key);
        if (provider) provider.fromJSON(value);
      });
    }
  }
}

// Root node containing quota nodes
export class ProviderTreeRoot extends TreeNode {
  quotas: Map<string, QuotaNode> = new Map();

  constructor() {
    super('root', 'Provider Management', 'root');
    this.expanded = true;
    this.initializeProviders();
  }

  get providers(): Map<string, ProviderNode> {
    // Aggregate all providers from all quotas for backward compatibility
    const allProviders = new Map<string, ProviderNode>();
    this.quotas.forEach(quota => {
      quota.providers.forEach((provider, key) => {
        allProviders.set(key, provider);
      });
    });
    return allProviders;
  }

  async initialize(): Promise<void> {
    await initializeModelRegistry();

    // Attempt to discover VSCode LLM models via the IDE companion server
    // BEFORE loading static models so VSCode appears in tree if available
    try {
      const port = process.env.WREN_IDE_SERVER_PORT || '3000';
      const url = `http://localhost:${port}/models`;

      const res = await fetchWithTimeout(url, 2000);
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && Array.isArray(body.models) && body.models.length > 0) {
          const models = body.models.map((m: VsCodeLanguageModel) => convertVsCodeModelToModelConfig(m));
          const vscodeProvider = new ProviderNode(
            Providers.VSCODE_LLM,
            ProviderNode.canonicalEnvVar(Providers.VSCODE_LLM)
          );
          const modelsNode = vscodeProvider.children.find(c => c instanceof ModelsNode) as ModelsNode | undefined;
          if (modelsNode) modelsNode.loadModels(models);

          const identityQuota = this.quotas.get('identity');
          if (identityQuota) {
            identityQuota.addProvider(vscodeProvider);
          }
        }
      }
    } catch (_err) {
      // Silent failure - VSCode provider not added
    }

    // Load models into each provider's ModelsNode across all quotas
    this.quotas.forEach(quota => {
      quota.providers.forEach(provider => {
        const modelsNode = provider.children.find(c => c instanceof ModelsNode) as ModelsNode;
        if (modelsNode) {
          const providerModels = getModelsByProvider(provider.provider);
          modelsNode.loadModels(providerModels);
        }
      });
    });
  }

  private initializeProviders(): void {
    // Create identity quota (monadic quota containing all providers)
    const identityQuota = new QuotaNode('identity');

    // Primary providers
    identityQuota.addProvider(new ProviderNode(Providers.OPENAI, 'OPENAI_API_KEY', 'https://api.openai.com/v1'));
    identityQuota.addProvider(new ProviderNode(Providers.ANTHROPIC, 'ANTHROPIC_API_KEY', 'https://api.anthropic.com/v1'));
    identityQuota.addProvider(new ProviderNode(Providers.GOOGLE, 'GEMINI_API_KEY'));
    identityQuota.addProvider(new ProviderNode(Providers.GOOGLE_VERTEX, 'GOOGLE_CLOUD_PROJECT'));

    // OpenAI-compatible
    identityQuota.addProvider(new ProviderNode(Providers.NVIDIA, 'NVIDIA_API_KEY', 'https://integrate.api.nvidia.com/v1'));
    identityQuota.addProvider(new ProviderNode(Providers.DEEPSEEK, 'DEEPSEEK_API_KEY', 'https://api.deepseek.com/v1'));
    identityQuota.addProvider(new ProviderNode(Providers.OPENROUTER, 'OPENROUTER_API_KEY', 'https://openrouter.ai/api/v1'));
    identityQuota.addProvider(new ProviderNode(Providers.GROQ, 'GROQ_API_KEY', 'https://api.groq.com/openai/v1'));
    identityQuota.addProvider(new ProviderNode(Providers.KILO, 'KILO_API_KEY', 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1'));

    // Regional
    identityQuota.addProvider(new ProviderNode(Providers.QWEN, 'QWEN_API_KEY', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'));
    identityQuota.addProvider(new ProviderNode(Providers.MOONSHOT_AI, 'MOONSHOT_API_KEY', 'https://api.moonshot.ai/v1'));
    identityQuota.addProvider(new ProviderNode(Providers.MISTRAL, 'MISTRAL_API_KEY', 'https://api.mistral.ai/v1'));
    identityQuota.addProvider(new ProviderNode(Providers.COHERE, 'COHERE_API_KEY', 'https://api.cohere.ai/v1'));

    // Additional providers
    identityQuota.addProvider(new ProviderNode(Providers.XAI, 'XAI_API_KEY', 'https://api.x.ai/v1'));
    identityQuota.addProvider(new ProviderNode(Providers.CEREBRAS, 'CEREBRAS_API_KEY', 'https://api.cerebras.ai/v1'));
    identityQuota.addProvider(new ProviderNode(Providers.HUGGINGFACE, 'HUGGINGFACE_API_KEY', 'https://router.huggingface.co/v1'));
    identityQuota.addProvider(new ProviderNode(Providers.PERPLEXITY, 'PERPLEXITY_API_KEY', 'https://api.perplexity.ai'));

    // Add identity quota to root
    this.addQuota(identityQuota);
  }

  addQuota(quota: QuotaNode): void {
    this.quotas.set(quota.quotaName, quota);
    this.addChild(quota);
  }

  getQuota(name: string): QuotaNode | undefined {
    return this.quotas.get(name);
  }

  addProvider(provider: ProviderNode): void {
    // Add to identity quota for backward compatibility
    const identityQuota = this.quotas.get('identity');
    if (identityQuota) {
      identityQuota.addProvider(provider);
    }
  }

  getProvider(name: string): ProviderNode | undefined {
    // Search all quotas for backward compatibility
    for (const quota of this.quotas.values()) {
      const provider = quota.getProvider(name);
      if (provider) return provider;
    }
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toJSON(): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotas: Record<string, any> = {};
    this.quotas.forEach((quota, key) => {
      quotas[key] = quota.toJSON();
    });

    return {
      version: '2.0',
      timestamp: new Date().toISOString(),
      quotas
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fromJSON(data: Record<string, any>): void {
    if (data.quotas) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(data.quotas).forEach(([key, value]: [string, any]) => {
        const quota = this.quotas.get(key);
        if (quota) {
          quota.fromJSON(value);
        }
      });
    } else if (data.providers) {
      // Backward compatibility: v1.0 format with providers at root
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(data.providers).forEach(([key, value]: [string, any]) => {
        const provider = this.getProvider(key);
        if (provider) {
          provider.fromJSON(value);
        }
      });
    }
  }

  serialize(): string {
    return JSON.stringify(this.toJSON(), null, 2);
  }

  deserialize(json: string): void {
    try {
      const data = JSON.parse(json);
      this.fromJSON(data);
    } catch (error) {
      console.error('Failed to deserialize provider tree:', error);
    }
  }

  // Atomic file operations
  async saveToFile(filePath: string): Promise<void> {
    const tmpPath = `${filePath}.tmp`;
    const json = this.serialize();

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write to temp file
      fs.writeFileSync(tmpPath, json, 'utf-8');

      // Atomic rename
      fs.renameSync(tmpPath, filePath);
    } catch (error) {
      // Cleanup temp file on error
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
      throw error;
    }
  }

  async loadFromFile(filePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }
      const json = fs.readFileSync(filePath, 'utf-8');
      this.deserialize(json);
      return true;
    } catch (error) {
      console.error('Failed to load provider tree from file:', error);
      return false;
    }
  }

  // Get all providers with API keys set across all quotas
  getActiveProviders(): ProviderNode[] {
    const activeProviders: ProviderNode[] = [];
    this.quotas.forEach(quota => {
      quota.providers.forEach(provider => {
        if (provider.hasApiKey && provider.enabled) {
          activeProviders.push(provider);
        }
      });
    });
    return activeProviders;
  }

  // Calculate total metrics across all providers
  getTotalMetrics(): {
    totalRequests: number;
    totalSuccess: number;
    totalErrors: number;
    avgSuccessRate: number;
    avgLatency: number;
  } {
    let totalRequests = 0;
    let totalSuccess = 0;
    let totalErrors = 0;
    let totalLatency = 0;
    let providerCount = 0;

    this.quotas.forEach(quota => {
      quota.providers.forEach(provider => {
        const metricsNode = provider.children.find(c => c instanceof MetricsNode) as MetricsNode;
        if (metricsNode) {
          totalRequests += metricsNode.totalRequests;
          totalSuccess += metricsNode.successCount;
          totalErrors += metricsNode.errorCount;
          if (metricsNode.successCount > 0) {
            totalLatency += metricsNode.avgLatencyMs;
            providerCount++;
          }
        }
      });
    });

    return {
      totalRequests,
      totalSuccess,
      totalErrors,
      avgSuccessRate: totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : 0,
      avgLatency: providerCount > 0 ? totalLatency / providerCount : 0
    };
  }
}