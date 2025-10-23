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
} from '@google/genai';
import { ContentGenerator, AuthType } from './contentGenerator.js';
import { ProviderConfigService, ProviderConfig } from '../services/providerConfigService.js';
import { Providers } from '../config/providers.js';
import { Config } from '../config/config.js';

/**
 * Content generator that automatically switches providers on failure
 */
export class ProviderFailoverContentGenerator implements ContentGenerator {
  private currentProvider: ProviderConfig | null = null;
  private contentGenerator: ContentGenerator | null = null;
  private config: Config;
  private sessionId?: string;

  constructor(config: Config, sessionId?: string) {
    this.config = config;
    this.sessionId = sessionId;
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    return this.executeWithFailover((generator) => generator.generateContent(request));
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.executeWithFailover((generator) => generator.generateContentStream(request));
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    return this.executeWithFailover((generator) => generator.countTokens(request));
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    return this.executeWithFailover((generator) => generator.embedContent(request));
  }

  async getTier?(): Promise<import('../code_assist/types.js').UserTierId | undefined> {
    if (this.contentGenerator?.getTier) {
      return this.contentGenerator.getTier();
    }
    return undefined;
  }

  private async executeWithFailover<T>(
    operation: (generator: ContentGenerator) => Promise<T>
  ): Promise<T> {
    const maxProviderAttempts = 3; // Try up to 3 different providers
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxProviderAttempts; attempt++) {
      try {
        const generator = await this.getOrCreateContentGenerator();
        if (!generator) {
          throw new Error('No available providers');
        }

        const result = await operation(generator);
        
        // Success - update provider performance
        if (this.currentProvider) {
          ProviderConfigService.updatePerformanceStats(
            this.currentProvider.provider,
            true,
            undefined, // latency not tracked here
            undefined // tokens not tracked here
          );
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Update provider performance on failure
        if (this.currentProvider) {
          ProviderConfigService.updatePerformanceStats(
            this.currentProvider.provider,
            false,
            undefined,
            undefined
          );
        }

        // Try next provider
        this.contentGenerator = null;
        this.currentProvider = null;
        
        console.warn(`Provider failed, attempting failover:`, error);
      }
    }

    throw lastError || new Error('All providers failed');
  }

  private async getOrCreateContentGenerator(): Promise<ContentGenerator | null> {
    if (this.contentGenerator) {
      return this.contentGenerator;
    }

    // Select next provider (weighted random or fallback)
    this.currentProvider = ProviderConfigService.selectWeightedProvider();
    if (!this.currentProvider) {
      return null;
    }

    // Create content generator for this provider
    const { createContentGenerator, createContentGeneratorConfig } = await import('./contentGenerator.js');
    
    // Map provider to auth type
    const authType = this.mapProviderToAuthType(this.currentProvider.provider);
    if (!authType) {
      console.warn(`No auth type mapping for provider: ${this.currentProvider.provider}`);
      return null;
    }

    // Pre-warm model cache for the provider's base URL if available (once per session)
    try {
      const { ProviderModelCacheService } = await import('../services/providerModelCacheService.js');
      await ProviderModelCacheService.ensureModelsFetchedFor(this.currentProvider.baseURL, this.currentProvider.apiKey, this.currentProvider.provider);
    } catch (_e) {
      // ignore
    }
    try {
      const generatorConfig = await createContentGeneratorConfig(this.config.getModel(), authType);
      // Override with provider-specific settings
      generatorConfig.apiKey = this.currentProvider.apiKey;
      
      this.contentGenerator = await createContentGenerator(generatorConfig, this.config, this.sessionId);
      return this.contentGenerator;
    } catch (error) {
      console.warn(`Failed to create content generator for provider ${this.currentProvider.provider}:`, error);
      return null;
    }
  }

  private mapProviderToAuthType(provider: Providers): AuthType | null {
    switch (provider) {
      case Providers.GOOGLE:
      case Providers.GOOGLE_VERTEX:
        // For Google providers, we need to determine the auth type from config
        // This is a simplified approach - in practice, this would need more logic
        return AuthType.USE_GEMINI; // Default to Gemini API
      case Providers.OPENAI:
        return AuthType.USE_OPENAI_COMPATIBLE;
      case Providers.QWEN:
        return AuthType.USE_QWEN_OAUTH;
      // Add mappings for other providers as needed
      default:
        return null;
    }
  }
}