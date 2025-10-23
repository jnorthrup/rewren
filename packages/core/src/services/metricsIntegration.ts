/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderTreeRoot, getProviderTree, ModelNode, MetricsNode } from '../config/providerTreeNodes.js';
import { Providers } from '../config/providers.js';
import * as path from 'path';

/**
 * Integration layer between content generators and provider tree metrics.
 * Bridges the old ProviderConfigService and new ProviderTreeRoot systems.
 */
export class MetricsIntegration {
  private static instance: MetricsIntegration | null = null;
  private tree: ProviderTreeRoot;
  private treeFilePath: string;

  private constructor() {
    this.tree = getProviderTree();
    this.treeFilePath = path.join(process.cwd(), '.wren', 'provider-tree.json');
  }

  static getInstance(): MetricsIntegration {
    if (!MetricsIntegration.instance) {
      MetricsIntegration.instance = new MetricsIntegration();
    }
    return MetricsIntegration.instance;
  }

  /**
   * Initialize the tree (loads models and restores state from disk)
   */
  async initialize(): Promise<void> {
    await this.tree.initialize();
    await this.tree.loadFromFile(this.treeFilePath).catch(() => {
      // Ignore load errors on first run
    });
  }

  /**
   * Record a successful API call with latency
   */
  recordSuccess(provider: Providers, modelName: string, latencyMs: number): void {
    const providerNode = this.tree.getProvider(provider);
    if (!providerNode) return;

    // Record at provider level
    const metricsNode = providerNode.children.find(c => c.type === 'metrics') as MetricsNode | undefined;
    if (metricsNode) {
      metricsNode.recordSuccess(latencyMs);
    }

    // Record at model level
    const modelsNode = providerNode.children.find(c => c.type === 'models');
    if (modelsNode) {
      const modelNode = modelsNode.children.find(c =>
        c instanceof ModelNode && c.model.name === modelName
      ) as ModelNode | undefined;

      if (modelNode) {
        modelNode.recordSuccess(latencyMs);
      }
    }

    // Persist asynchronously (non-blocking)
    this.persistAsync();
  }

  /**
   * Record a failed API call
   */
  recordError(provider: Providers, modelName: string, error: string): void {
    const providerNode = this.tree.getProvider(provider);
    if (!providerNode) return;

    // Record at provider level
    const metricsNode = providerNode.children.find(c => c.type === 'metrics') as MetricsNode | undefined;
    if (metricsNode) {
      metricsNode.recordError(error);
    }

    // Record at model level
    const modelsNode = providerNode.children.find(c => c.type === 'models');
    if (modelsNode) {
      const modelNode = modelsNode.children.find(c =>
        c instanceof ModelNode && c.model.name === modelName
      ) as ModelNode | undefined;

      if (modelNode) {
        modelNode.recordError();
      }
    }

    // Persist asynchronously (non-blocking)
    this.persistAsync();
  }

  /**
   * Get the top-ranked models across all providers
   */
  getTopRankedModels(limit: number = 10): Array<{provider: Providers, model: string, score: number, grade: string}> {
    const rankedModels: Array<{provider: Providers, model: string, score: number, grade: string}> = [];

    this.tree.providers.forEach((providerNode) => {
      const modelsNode = providerNode.children.find(c => c.type === 'models');
      if (!modelsNode) return;

      modelsNode.children.forEach((child) => {
        if (child instanceof ModelNode && child.totalRequests > 0) {
          rankedModels.push({
            provider: providerNode.provider,
            model: child.model.name,
            score: child.bayesianScore,
            grade: child.rankingGrade
          });
        }
      });
    });

    return rankedModels
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Get the top-ranked provider
   */
  getTopRankedProvider(): Providers | null {
    let bestProvider: Providers | null = null;
    let bestScore = -1;

    this.tree.providers.forEach((providerNode) => {
      const metricsNode = providerNode.children.find(c => c.type === 'metrics') as MetricsNode | undefined;
      if (metricsNode && metricsNode.totalRequests > 0) {
        if (metricsNode.bayesianScore > bestScore) {
          bestScore = metricsNode.bayesianScore;
          bestProvider = providerNode.provider;
        }
      }
    });

    return bestProvider;
  }

  /**
   * Non-blocking async persist (debounced)
   */
  private persistAsync(): void {
    // Use setImmediate to defer persistence until after the current event loop
    setImmediate(() => {
      this.tree.saveToFile(this.treeFilePath).catch((err) => {
        console.error('Failed to persist provider tree metrics:', err);
      });
    });
  }
}
