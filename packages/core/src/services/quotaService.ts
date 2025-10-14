/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ApiKeyService, QuotaConfig } from './apiKeyService.js';

export interface UsageRecord {
  provider: string;
  metric: 'requests' | 'tokens';
  value: number;
  timestamp: Date;
}

export interface QuotaUsage {
  requests: {
    minute: number;
    day: number;
  };
  tokens: {
    minute: number;
    day: number;
  };
}

export class QuotaService {
  private readonly dataPath: string;
  private usageData: Map<string, UsageRecord[]> = new Map();
  private apiKeyService: ApiKeyService;

  constructor(apiKeyService: ApiKeyService, dataPath?: string) {
    this.apiKeyService = apiKeyService;
    this.dataPath = dataPath || path.join('.wren', 'quota-data.json');
    this.loadUsageData();
  }

  /**
   * Load usage data from file
   */
  private loadUsageData(): void {
    try {
      if (!fs.existsSync(this.dataPath)) {
        return;
      }

      const content = fs.readFileSync(this.dataPath, 'utf-8');
      const data = JSON.parse(content);

      // Convert string timestamps back to Date objects
      this.usageData = new Map();
      for (const [key, records] of Object.entries(data)) {
        this.usageData.set(key, (records as any[]).map(record => ({
          ...record,
          timestamp: new Date(record.timestamp)
        })));
      }
    } catch (error) {
      console.warn('Failed to load quota data:', error);
    }
  }

  /**
   * Save usage data to file
   */
  private saveUsageData(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Convert Date objects to strings for serialization
      const serializableData: Record<string, any[]> = {};
      for (const [key, records] of this.usageData.entries()) {
        serializableData[key] = records.map(record => ({
          ...record,
          timestamp: record.timestamp.toISOString()
        }));
      }

      fs.writeFileSync(this.dataPath, JSON.stringify(serializableData, null, 2));
    } catch (error) {
      console.error('Failed to save quota data:', error);
    }
  }

  /**
   * Record usage for a provider
   */
  recordUsage(provider: string, metric: 'requests' | 'tokens', value: number = 1): void {
    const key = `${provider}_${metric}`;
    const record: UsageRecord = {
      provider,
      metric,
      value,
      timestamp: new Date()
    };

    if (!this.usageData.has(key)) {
      this.usageData.set(key, []);
    }
    this.usageData.get(key)!.push(record);
    this.saveUsageData();

    // Clean up old records (older than 24 hours)
    this.cleanupOldRecords(key);
  }

  /**
   * Calculate current usage for a provider within time windows
   */
  getUsage(provider: string): QuotaUsage {
    const result: QuotaUsage = {
      requests: { minute: 0, day: 0 },
      tokens: { minute: 0, day: 0 }
    };

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Calculate requests
    const requestKey = `${provider}_requests`;
    if (this.usageData.has(requestKey)) {
      const requests = this.usageData.get(requestKey)!;
      result.requests.minute = requests.filter(r => r.timestamp > oneMinuteAgo).reduce((sum, r) => sum + r.value, 0);
      result.requests.day = requests.filter(r => r.timestamp > oneDayAgo).reduce((sum, r) => sum + r.value, 0);
    }

    // Calculate tokens
    const tokenKey = `${provider}_tokens`;
    if (this.usageData.has(tokenKey)) {
      const tokens = this.usageData.get(tokenKey)!;
      result.tokens.minute = tokens.filter(r => r.timestamp > oneMinuteAgo).reduce((sum, r) => sum + r.value, 0);
      result.tokens.day = tokens.filter(r => r.timestamp > oneDayAgo).reduce((sum, r) => sum + r.value, 0);
    }

    return result;
  }

  /**
   * Check if quota is exceeded for a provider
   */
  isQuotaExceeded(provider: string): boolean {
    if (!this.apiKeyService.isQuotaEnabled(provider)) {
      return false;
    }

    const usage = this.getUsage(provider);
    const quotaConfig = this.apiKeyService.getQuotaConfig();

    if (!quotaConfig || !quotaConfig.limits[provider]) {
      return false;
    }

    const limits = quotaConfig.limits[provider];

    // Check requests per minute
    if (limits.requestsPerMinute !== undefined && usage.requests.minute >= limits.requestsPerMinute) {
      return true;
    }

    // Check requests per day
    if (limits.requestsPerDay !== undefined && usage.requests.day >= limits.requestsPerDay) {
      return true;
    }

    // Check tokens per minute
    if (limits.tokensPerMinute !== undefined && usage.tokens.minute >= limits.tokensPerMinute) {
      return true;
    }

    // Check tokens per day
    if (limits.tokensPerDay !== undefined && usage.tokens.day >= limits.tokensPerDay) {
      return true;
    }

    return false;
  }

  /**
   * Cleanup records older than 24 hours
   */
  private cleanupOldRecords(key: string): void {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const records = this.usageData.get(key) || [];
    const filtered = records.filter(record => record.timestamp > oneDayAgo);
    
    if (filtered.length !== records.length) {
      this.usageData.set(key, filtered);
      this.saveUsageData();
    }
  }

  /**
   * CRUD Operations for quota configurations
   */

  /**
   * Create or update quota configuration for a provider
   */
  createOrUpdateQuota(provider: string, limits: {
    requestsPerMinute?: number;
    requestsPerDay?: number;
    tokensPerMinute?: number;
    tokensPerDay?: number;
  }): void {
    let config = this.apiKeyService.getQuotaConfig();
    if (!config) {
      config = { enabled: true, limits: {} };
    }

    config.limits[provider] = {
      ...config.limits[provider],
      ...limits
    };

    if (!config.enabled) {
      config.enabled = true;
    }

    this.apiKeyService.setQuotaConfig(config);
  }

  /**
   * Get quota configuration for a provider
   */
  getQuota(provider: string): {
    requestsPerMinute?: number;
    requestsPerDay?: number;
    tokensPerMinute?: number;
    tokensPerDay?: number;
  } | null {
    const config = this.apiKeyService.getQuotaConfig();
    if (!config || !config.limits[provider]) {
      return null;
    }
    return config.limits[provider];
  }

  /**
   * Delete quota configuration for a provider
   */
  deleteQuota(provider: string): void {
    const config = this.apiKeyService.getQuotaConfig();
    if (!config || !config.limits[provider]) {
      return;
    }

    delete config.limits[provider];
    this.apiKeyService.setQuotaConfig(config);
  }

  /**
   * List all providers with quota configurations
   */
  listQuotaProviders(): string[] {
    const config = this.apiKeyService.getQuotaConfig();
    return config ? Object.keys(config.limits) : [];
  }

  /**
   * Enable or disable quota enforcement globally
   */
  setQuotaEnabled(enabled: boolean): void {
    let config = this.apiKeyService.getQuotaConfig();
    if (!config) {
      config = { enabled, limits: {} };
    } else {
      config.enabled = enabled;
    }
    this.apiKeyService.setQuotaConfig(config);
  }

  /**
   * Get current quota status
   */
  getQuotaStatus(): { enabled: boolean; providers: string[] } {
    const config = this.apiKeyService.getQuotaConfig();
    return {
      enabled: config?.enabled ?? false,
      providers: config ? Object.keys(config.limits) : []
    };
  }

  /**
   * Reset usage data for a specific provider
   */
  resetUsage(provider: string): void {
    const keys = [`${provider}_requests`, `${provider}_tokens`];
    for (const key of keys) {
      this.usageData.delete(key);
    }
    this.saveUsageData();
  }

  /**
   * Reset all usage data
   */
  resetAllUsage(): void {
    this.usageData.clear();
    this.saveUsageData();
  }
}