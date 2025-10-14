/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ApiKeyConfig {
  KILO_API_KEY?: string;
  NVIDIA_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  [key: string]: string | undefined;
}

export interface QuotaConfig {
  enabled: boolean;
  limits: {
    [provider: string]: {
      requestsPerMinute?: number;
      requestsPerDay?: number;
      tokensPerMinute?: number;
      tokensPerDay?: number;
    };
  };
}

export interface ApiKeyServiceOptions {
  configPath?: string;
}

export class ApiKeyService {
  private configPath: string;
  private apiKeys: ApiKeyConfig = {};
  private quotaConfig: QuotaConfig | null = null;

  constructor(options: ApiKeyServiceOptions = {}) {
    // Default to .wren directory in project root
    this.configPath = options.configPath || path.join('.wren', 'api-keys.json');
    this.loadApiKeys();
    this.loadQuotaConfig();
  }

  /**
   * Load API keys from config file
   */
  private loadApiKeys(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        return;
      }

      const content = fs.readFileSync(this.configPath, 'utf-8');
      const config: ApiKeyConfig = JSON.parse(content);
      this.apiKeys = config;
    } catch (error) {
      console.warn(`Failed to load API keys from ${this.configPath}:`, error);
    }
  }

  /**
   * Load quota configuration from file
   */
  private loadQuotaConfig(): void {
    try {
      const quotaConfigPath = this.configPath.replace('api-keys.json', 'quota-config.json');
      if (!fs.existsSync(quotaConfigPath)) {
        return;
      }

      const content = fs.readFileSync(quotaConfigPath, 'utf-8');
      this.quotaConfig = JSON.parse(content);
    } catch (error) {
      console.warn('Failed to load quota config:', error);
    }
  }

  /**
   * Get an API key by name
   */
  getApiKey(keyName: keyof ApiKeyConfig): string | undefined {
    // Check config file first
    const apiKey = this.apiKeys[keyName];
    if (apiKey) {
      return apiKey;
    }

    // Check environment variable as fallback
    return process.env[keyName];
  }

  /**
   * Set an API key and save to config file
   */
  setApiKey(keyName: keyof ApiKeyConfig, value: string): void {
    this.apiKeys[keyName] = value;
    this.saveApiKeys();
  }

  /**
   * Save API keys to config file
   */
  private saveApiKeys(): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write config file
      fs.writeFileSync(this.configPath, JSON.stringify(this.apiKeys, null, 2));
    } catch (error) {
      console.error(`Failed to save API keys to ${this.configPath}:`, error);
    }
  }

  /**
   * Remove an API key
   */
  removeApiKey(keyName: keyof ApiKeyConfig): void {
    delete this.apiKeys[keyName];
    this.saveApiKeys();
  }

  /**
   * Get all available API keys
   */
  getApiKeys(): ApiKeyConfig {
    const envKeys = { ...this.apiKeys };

    // Add environment variables that may not be in the config file
    if (process.env.KILO_API_KEY) envKeys.KILO_API_KEY = process.env.KILO_API_KEY;
    if (process.env.NVIDIA_API_KEY) envKeys.NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
    if (process.env.OPENROUTER_API_KEY) envKeys.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    return envKeys;
  }

  /**
   * Get quota configuration
   */
  getQuotaConfig(): QuotaConfig | null {
    return this.quotaConfig;
  }

  /**
   * Set quota configuration
   */
  setQuotaConfig(quotaConfig: QuotaConfig): void {
    this.quotaConfig = quotaConfig;
    this.saveQuotaConfig();
  }

  /**
   * Save quota configuration to file
   */
  private saveQuotaConfig(): void {
    if (!this.quotaConfig) return;

    try {
      const quotaConfigPath = this.configPath.replace('api-keys.json', 'quota-config.json');
      const dir = path.dirname(quotaConfigPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(quotaConfigPath, JSON.stringify(this.quotaConfig, null, 2));
    } catch (error) {
      console.error('Failed to save quota config:', error);
    }
  }

  /**
   * Check if quota is enabled for a specific provider
   */
  isQuotaEnabled(provider: string): boolean {
    return this.quotaConfig?.enabled === true && 
           this.quotaConfig.limits[provider] !== undefined;
  }

  /**
   * Check if a provider has exceeded its quota based on usage tracking
   */
  isQuotaExceeded(provider: string, metric: 'requests' | 'tokens', value: number, timeUnit: 'minute' | 'day'): boolean {
    if (!this.quotaConfig?.enabled || !this.quotaConfig.limits[provider]) {
      return false;
    }

    const limitKey = `${metric}Per${timeUnit.charAt(0).toUpperCase() + timeUnit.slice(1)}` as keyof typeof this.quotaConfig.limits[string];
    const limit = this.quotaConfig.limits[provider][limitKey];
    
    if (limit === undefined) {
      return false;
    }

    return value >= limit;
  }
}