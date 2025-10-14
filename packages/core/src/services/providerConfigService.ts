/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Providers } from '../config/providers.js';

/**
 * Build a safe models endpoint URL for OpenAI-compatible providers.
 * Mirrors the logic in modelDiscovery.ts to avoid double /v1 segments.
 */
function buildModelsUrl(baseURL: string): string {
  try {
    const parsed = new URL(baseURL);
    const cleanPath = parsed.pathname.replace(/\/+$/g, '');
    if (cleanPath.endsWith('/v1')) {
      parsed.pathname = cleanPath + '/models';
    } else if (cleanPath.endsWith('/models')) {
      parsed.pathname = cleanPath;
    } else {
      parsed.pathname = cleanPath + '/v1/models';
    }
    return parsed.toString();
  } catch (_e) {
    const trimmed = baseURL.replace(/\/+$/g, '');
    if (/\/v1(\/|$)/.test(trimmed)) {
      return trimmed.replace(/\/+$/g, '') + '/models';
    }
    return trimmed + '/v1/models';
  }
}

export interface ProviderPerformanceStats {
  successCount: number;
  failureCount: number;
  totalRequests: number;
  avgLatencyMs: number;
  lastUsed: Date | null;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  avgTokenPerSecond: number;
  errorRate: number;
}

export interface ProviderConfig {
  provider: Providers;
  baseURL: string;
  apiKey?: string;
  enabled: boolean;
  bayesWeight: number; // Performance-based weight for provider selection
  performance?: ProviderPerformanceStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderConfigStore {
  providers: ProviderConfig[];
}

export class ProviderConfigService {
  private static readonly CONFIG_FILE_PATH = path.join('.wren', 'providers.json');
  private static readonly DEFAULT_CONFIG: ProviderConfigStore = { providers: [] };

  /**
   * Get all provider configurations
   */
  static getAllProviders(): ProviderConfig[] {
    const config = this.readConfig();
    return config.providers;
  }

  /**
   * Get a provider by name
   */
  static getProvider(provider: Providers): ProviderConfig | undefined {
    const config = this.readConfig();
    return config.providers.find(p => p.provider === provider);
  }

  /**
   * Create a new provider configuration
   */
  static createProvider(provider: Providers, baseURL: string, apiKey?: string): boolean {
    const config = this.readConfig();
    
    // Check if provider already exists
    if (config.providers.some(p => p.provider === provider)) {
      return false; // Provider already exists
    }

    const newProvider: ProviderConfig = {
      provider,
      baseURL,
      apiKey,
      enabled: true,
      bayesWeight: 1.0, // Start with neutral weight
      performance: {
        successCount: 0,
        failureCount: 0,
        totalRequests: 0,
        avgLatencyMs: 0,
        lastUsed: null,
        lastSuccess: null,
        lastFailure: null,
        avgTokenPerSecond: 0,
        errorRate: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    config.providers.push(newProvider);
    return this.writeConfig(config);
  }

  /**
   * Update an existing provider configuration
   */
  static updateProvider(provider: Providers, updates: Partial<Omit<ProviderConfig, 'provider' | 'createdAt'>>): boolean {
    const config = this.readConfig();
    
    const index = config.providers.findIndex(p => p.provider === provider);
    if (index === -1) {
      return false; // Provider not found
    }

    const existingProvider = config.providers[index];
    config.providers[index] = {
      ...existingProvider,
      ...updates,
      updatedAt: new Date(),
    };

    return this.writeConfig(config);
  }

  /**
   * Update provider performance stats
   */
  static updatePerformanceStats(provider: Providers, success: boolean, latencyMs?: number, tokensPerSecond?: number): boolean {
    const config = this.readConfig();
    
    const providerConfig = config.providers.find(p => p.provider === provider);
    if (!providerConfig) {
      return false;
    }

    const now = new Date();
    const stats = providerConfig.performance || {
      successCount: 0,
      failureCount: 0,
      totalRequests: 0,
      avgLatencyMs: 0,
      lastUsed: null,
      lastSuccess: null,
      lastFailure: null,
      avgTokenPerSecond: 0,
      errorRate: 0,
    };

    // Update counters
    if (success) {
      stats.successCount += 1;
      stats.lastSuccess = now;
    } else {
      stats.failureCount += 1;
      stats.lastFailure = now;
    }
    
    stats.totalRequests += 1;
    stats.lastUsed = now;

    // Update latency if provided
    if (latencyMs !== undefined) {
      // Calculate new average with exponential moving average (alpha = 0.1)
      stats.avgLatencyMs = stats.avgLatencyMs * 0.9 + latencyMs * 0.1;
    }

    // Update tokens per second if provided
    if (tokensPerSecond !== undefined) {
      // Calculate new average with exponential moving average (alpha = 0.1)
      stats.avgTokenPerSecond = stats.avgTokenPerSecond * 0.9 + tokensPerSecond * 0.1;
    }

    // Calculate error rate
    stats.errorRate = stats.totalRequests > 0 ? stats.failureCount / stats.totalRequests : 0;

    // Update bayes weight based on performance (simplified bayesian approach)
    providerConfig.bayesWeight = this.calculateBayesWeight(stats);

    providerConfig.performance = stats;
    providerConfig.updatedAt = now;

    return this.writeConfig(config);
  }

  /**
   * Calculate bayes weight based on performance metrics
   */
  private static calculateBayesWeight(stats: ProviderPerformanceStats): number {
    // Base weight is 1.0
    let weight = 1.0;

    // Adjust for success rate (higher success rate = higher weight)
    const successRate = stats.totalRequests > 0 ? stats.successCount / stats.totalRequests : 0;
    weight *= (0.5 + successRate); // Base 0.5 to ensure some weight, plus success rate

    // Adjust for latency (lower latency = higher weight, but cap the penalty)
    if (stats.avgLatencyMs > 0) {
      // Invert latency impact: lower latency gets higher weight
      // Normalize against a reference latency (e.g., 2000ms)
      const referenceLatency = 2000;
      weight *= Math.min(2.0, referenceLatency / Math.max(stats.avgLatencyMs, 100)); // Cap at 2x
    }

    // Adjust for error rate (lower error rate = higher weight)
    weight *= (1 - (stats.errorRate * 0.5)); // Reduce weight by up to 50% for errors

    // Ensure weight stays within reasonable bounds
    return Math.max(0.1, Math.min(5.0, weight));
  }

  /**
   * Get provider performance stats
   */
  static getPerformanceStats(provider: Providers): ProviderPerformanceStats | null {
    const config = this.readConfig();
    const providerConfig = config.providers.find(p => p.provider === provider);
    return providerConfig?.performance || null;
  }

  /**
   * Get all providers sorted by bayes weight (highest first)
   */
  static getProvidersByWeight(): ProviderConfig[] {
    const config = this.readConfig();
    return [...config.providers].sort((a, b) => (b.bayesWeight || 0) - (a.bayesWeight || 0));
  }

  /**
   * Select a provider using weighted random selection based on bayes weights
   */
  static selectWeightedProvider(): ProviderConfig | null {
    const config = this.readConfig();
    const enabledProviders = config.providers.filter(p => p.enabled);

    if (enabledProviders.length === 0) {
      return null;
    }

    // If only one provider, return it
    if (enabledProviders.length === 1) {
      return enabledProviders[0];
    }

    // Calculate total weight
    const totalWeight = enabledProviders.reduce((sum, provider) => sum + (provider.bayesWeight || 1), 0);

    // Select provider based on weighted probability
    const randomValue = Math.random() * totalWeight;
    let currentWeight = 0;

    for (const provider of enabledProviders) {
      currentWeight += provider.bayesWeight || 1;
      if (randomValue <= currentWeight) {
        return provider;
      }
    }

    // Fallback to first provider
    return enabledProviders[0];
  }

  /**
   * Delete a provider configuration
   */
  static deleteProvider(provider: Providers): boolean {
    const config = this.readConfig();
    
    const initialLength = config.providers.length;
    config.providers = config.providers.filter(p => p.provider !== provider);
    
    const deleted = config.providers.length !== initialLength;
    if (deleted) {
      return this.writeConfig(config);
    }
    
    return deleted;
  }

  /**
   * Enable a provider
   */
  static enableProvider(provider: Providers): boolean {
    return this.updateProvider(provider, { enabled: true });
  }

  /**
   * Disable a provider
   */
  static disableProvider(provider: Providers): boolean {
    return this.updateProvider(provider, { enabled: false });
  }

  /**
   * Set API key for a provider
   */
  static setApiKey(provider: Providers, apiKey: string): boolean {
    return this.updateProvider(provider, { apiKey });
  }

  /**
   * Test provider health by making a simple API call
   */
  static async testProviderHealth(provider: Providers): Promise<boolean> {
    const config = this.readConfig();
    const providerConfig = config.providers.find(p => p.provider === provider);
    
    if (!providerConfig || !providerConfig.enabled) {
      return false;
    }

    try {
      // For OpenAI-compatible providers, try a simple models endpoint call
      if (this.isOpenAICompatible(provider)) {
        const url = buildModelsUrl(providerConfig.baseURL);
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${providerConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        return response.ok;
      }

      // For other providers, implement specific health checks
      // For now, return true if provider is configured
      return true;
    } catch (error) {
      console.warn(`Health check failed for provider ${provider}:`, error);
      return false;
    }
  }

  /**
   * Check if provider is OpenAI-compatible
   */
  private static isOpenAICompatible(provider: Providers): boolean {
    const openaiCompatibleProviders = [
      Providers.OPENAI,
      Providers.OPENROUTER,
      Providers.NVIDIA,
      Providers.KILO,
      Providers.GROQ,
      Providers.DEEPSEEK,
      Providers.QWEN,
      Providers.MOONSHOT_AI,
    ];

    return openaiCompatibleProviders.includes(provider);
  }

  /**
   * Export provider configurations to a JSON file
   */
  static exportConfig(exportPath: string): boolean {
    try {
      const config = this.readConfig();
      const content = JSON.stringify(config, this.replacer, 2);
      fs.writeFileSync(exportPath, content, 'utf-8');
      return true;
    } catch (error) {
      console.error('Error exporting provider config:', error);
      return false;
    }
  }

  /**
   * Import provider configurations from a JSON file
   */
  static importConfig(importPath: string): boolean {
    try {
      if (!fs.existsSync(importPath)) {
        console.error('Import file does not exist:', importPath);
        return false;
      }

      const content = fs.readFileSync(importPath, 'utf-8');
      const importedConfig: ProviderConfigStore = JSON.parse(content);

      // Validate imported config
      if (!importedConfig || !Array.isArray(importedConfig.providers)) {
        console.error('Invalid import file format. Expected { providers: [...] }');
        return false;
      }

      // Write the imported config
      return this.writeConfig(importedConfig);
    } catch (error) {
      console.error('Error importing provider config:', error);
      return false;
    }
  }

  /**
   * Read provider configuration from file
   */
  private static readConfig(): ProviderConfigStore {
    try {
      if (!fs.existsSync(this.CONFIG_FILE_PATH)) {
        this.ensureConfigDirectory();
        this.writeConfig(this.DEFAULT_CONFIG);
        return { ...this.DEFAULT_CONFIG };
      }

      const content = fs.readFileSync(this.CONFIG_FILE_PATH, 'utf-8');
      const config: ProviderConfigStore = JSON.parse(content);

      // Ensure all required fields exist and convert dates
      config.providers = config.providers.map(provider => ({
        ...provider,
        createdAt: new Date(provider.createdAt),
        updatedAt: new Date(provider.updatedAt),
      }));

      return config;
    } catch (error) {
      console.error('Error reading provider config, using defaults:', error);
      return { ...this.DEFAULT_CONFIG };
    }
  }

  /**
   * Write provider configuration to file
   */
  private static writeConfig(config: ProviderConfigStore): boolean {
    try {
      this.ensureConfigDirectory();
      const content = JSON.stringify(config, this.replacer, 2);
      fs.writeFileSync(this.CONFIG_FILE_PATH, content, 'utf-8');
      return true;
    } catch (error) {
      console.error('Error writing provider config:', error);
      return false;
    }
  }

  /**
   * Ensure the config directory exists
   */
  private static ensureConfigDirectory(): void {
    const configDir = path.dirname(this.CONFIG_FILE_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  /**
   * Custom replacer for JSON serialization to handle dates
   */
  private static replacer(key: string, value: unknown): unknown {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }
}