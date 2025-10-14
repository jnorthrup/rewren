/**
 * JSON Facade CRUD Interface for Provider Tree Graph Operations
 */

import { TreeNode, ProviderNode, ConfigNode, QuotaNode, UsageNode, MetricsNode, ModelsNode, ModelNode, ProviderTreeRoot } from '../providerTreeNodes.js';

export interface NodeUpdate {
  nodeId: string;
  updates: Record<string, any>;
}

export interface CRUDResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * JSON Graph CRUD Facade
 * Provides atomic operations on the provider tree graph
 */
export class JsonGraphCRUD {
  constructor(private tree: ProviderTreeRoot) {}

  // CREATE operations
  createProvider(providerId: string, config: { envVar: string; baseUrl?: string; enabled?: boolean }): CRUDResult {
    try {
      const existing = this.tree.getProvider(providerId);
      if (existing) {
        return { success: false, message: `Provider ${providerId} already exists` };
      }

      // Note: This requires Providers enum extension for dynamic providers
      return { success: false, message: 'Dynamic provider creation not yet implemented' };
    } catch (error) {
      return { success: false, message: `Error creating provider: ${error}` };
    }
  }

  // READ operations
  readNode(nodeId: string): CRUDResult {
    try {
      const node = this.tree.findNode(nodeId);
      if (!node) {
        return { success: false, message: `Node ${nodeId} not found` };
      }

      return {
        success: true,
        message: 'Node retrieved',
        data: node.toJSON()
      };
    } catch (error) {
      return { success: false, message: `Error reading node: ${error}` };
    }
  }

  readProvider(providerId: string): CRUDResult {
    try {
      const provider = this.tree.getProvider(providerId);
      if (!provider) {
        return { success: false, message: `Provider ${providerId} not found` };
      }

      return {
        success: true,
        message: 'Provider retrieved',
        data: provider.toJSON()
      };
    } catch (error) {
      return { success: false, message: `Error reading provider: ${error}` };
    }
  }

  readAllProviders(): CRUDResult {
    try {
      const providers = Array.from(this.tree.providers.values()).map(p => ({
        id: p.provider,
        label: p.label,
        enabled: p.enabled,
        hasApiKey: p.hasApiKey,
        baseUrl: p.baseUrl
      }));

      return {
        success: true,
        message: `Retrieved ${providers.length} providers`,
        data: providers
      };
    } catch (error) {
      return { success: false, message: `Error reading providers: ${error}` };
    }
  }

  // UPDATE operations
  updateNode(nodeId: string, updates: Record<string, any>): CRUDResult {
    try {
      const node = this.tree.findNode(nodeId);
      if (!node) {
        return { success: false, message: `Node ${nodeId} not found` };
      }

      // Type-specific updates
      if (node instanceof ProviderNode) {
        return this.updateProvider(node, updates);
      } else if (node instanceof ConfigNode) {
        return this.updateConfig(node, updates);
      } else if (node instanceof UsageNode) {
        return this.updateUsage(node, updates);
      } else if (node instanceof QuotaNode) {
        return this.updateQuota(node, updates);
      } else if (node instanceof MetricsNode) {
        return this.updateMetrics(node, updates);
      } else if (node instanceof ModelsNode) {
        return this.updateModels(node, updates);
      } else if (node instanceof ModelNode) {
        return this.updateModel(node, updates);
      } else {
        return { success: false, message: `Node type ${node.type} does not support updates` };
      }
    } catch (error) {
      return { success: false, message: `Error updating node: ${error}` };
    }
  }

  private updateProvider(node: ProviderNode, updates: Record<string, any>): CRUDResult {
    if (updates.enabled !== undefined) node.enabled = !!updates.enabled;
    if (updates.baseUrl !== undefined) node.baseUrl = updates.baseUrl;
    if (updates.bayesWeight !== undefined) node.bayesWeight = Number(updates.bayesWeight);

    // Update provider-level default parameters
    if (updates.defaultReasoning !== undefined) node.defaultReasoning = updates.defaultReasoning;
    if (updates.defaultVerbosity !== undefined) node.defaultVerbosity = updates.defaultVerbosity;
    if (updates.defaultIncludeReasoning !== undefined) node.defaultIncludeReasoning = updates.defaultIncludeReasoning;
    if (updates.defaultTemperature !== undefined) node.defaultTemperature = Number(updates.defaultTemperature);
    if (updates.defaultTopP !== undefined) node.defaultTopP = Number(updates.defaultTopP);
    if (updates.defaultMaxTokens !== undefined) node.defaultMaxTokens = Number(updates.defaultMaxTokens);

    return {
      success: true,
      message: `Provider ${node.provider} updated`,
      data: node.toJSON()
    };
  }

  private updateConfig(node: ConfigNode, updates: Record<string, any>): CRUDResult {
    if (updates.baseUrl !== undefined) node.parent.baseUrl = updates.baseUrl;
    if (updates.enabled !== undefined) node.parent.enabled = !!updates.enabled;
    if (updates.bayesWeight !== undefined) node.parent.bayesWeight = Number(updates.bayesWeight);

    return {
      success: true,
      message: 'Config updated',
      data: node.toJSON()
    };
  }

  private updateUsage(node: UsageNode, updates: Record<string, any>): CRUDResult {
    if (updates.dailyTokenLimit !== undefined) node.dailyTokenLimit = Number(updates.dailyTokenLimit);
    if (updates.dailyTokensUsed !== undefined) node.dailyTokensUsed = Number(updates.dailyTokensUsed);
    if (updates.monthlyTokenLimit !== undefined) node.monthlyTokenLimit = Number(updates.monthlyTokenLimit);
    if (updates.monthlyTokensUsed !== undefined) node.monthlyTokensUsed = Number(updates.monthlyTokensUsed);
    if (updates.requestsPerMinute !== undefined) node.requestsPerMinute = Number(updates.requestsPerMinute);
    if (updates.costPer1kTokens !== undefined) node.costPer1kTokens = Number(updates.costPer1kTokens);

    return {
      success: true,
      message: 'Usage updated',
      data: node.toJSON()
    };
  }

  private updateQuota(node: QuotaNode, updates: Record<string, any>): CRUDResult {
    // QuotaNode is now a container - minimal updates supported
    if (updates.quotaName !== undefined) node.quotaName = String(updates.quotaName);

    return {
      success: true,
      message: 'Quota updated',
      data: node.toJSON()
    };
  }

  private updateMetrics(node: MetricsNode, updates: Record<string, any>): CRUDResult {
    if (updates.reset === true) {
      node.reset();
      return {
        success: true,
        message: 'Metrics reset',
        data: node.toJSON()
      };
    }

    // Direct updates (normally these would be via recordSuccess/recordError)
    if (updates.totalRequests !== undefined) node.totalRequests = Number(updates.totalRequests);
    if (updates.successCount !== undefined) node.successCount = Number(updates.successCount);
    if (updates.errorCount !== undefined) node.errorCount = Number(updates.errorCount);

    return {
      success: true,
      message: 'Metrics updated',
      data: node.toJSON()
    };
  }

  private updateModels(node: ModelsNode, updates: Record<string, any>): CRUDResult {
    // Update selected model
    if (updates.selectedModel !== undefined) {
      node.selectedModel = updates.selectedModel;
    }

    return {
      success: true,
      message: `Models node updated`,
      data: node.toJSON()
    };
  }

  private updateModel(node: ModelNode, updates: Record<string, any>): CRUDResult {
    // Update API format flags (true/false/undefined)
    if (updates.gptOssFormat !== undefined) {
      node.gptOssFormat = updates.gptOssFormat === true ? true :
                          updates.gptOssFormat === false ? false : undefined;
    }
    if (updates.geminiNative !== undefined) {
      node.geminiNative = updates.geminiNative === true ? true :
                          updates.geminiNative === false ? false : undefined;
    }

    // Update per-model API parameters
    if (updates.reasoning !== undefined) node.reasoning = updates.reasoning;
    if (updates.verbosity !== undefined) node.verbosity = updates.verbosity;
    if (updates.includeReasoning !== undefined) node.includeReasoning = updates.includeReasoning;
    if (updates.temperature !== undefined) node.temperature = Number(updates.temperature);
    if (updates.topP !== undefined) node.topP = Number(updates.topP);
    if (updates.maxTokens !== undefined) node.maxTokens = Number(updates.maxTokens);

    return {
      success: true,
      message: `Model ${node.model.name} updated`,
      data: node.toJSON()
    };
  }

  // DELETE operations
  deleteProvider(providerId: string): CRUDResult {
    try {
      const provider = this.tree.getProvider(providerId);
      if (!provider) {
        return { success: false, message: `Provider ${providerId} not found` };
      }

      this.tree.removeChild(provider.id);
      this.tree.providers.delete(providerId);

      return {
        success: true,
        message: `Provider ${providerId} deleted`
      };
    } catch (error) {
      return { success: false, message: `Error deleting provider: ${error}` };
    }
  }

  // Batch operations
  batchUpdate(updates: NodeUpdate[]): CRUDResult {
    const results: any[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const update of updates) {
      const result = this.updateNode(update.nodeId, update.updates);
      results.push({ nodeId: update.nodeId, ...result });
      if (result.success) successCount++;
      else failureCount++;
    }

    return {
      success: failureCount === 0,
      message: `Batch update: ${successCount} succeeded, ${failureCount} failed`,
      data: results
    };
  }

  // Export/Import entire graph
  exportGraph(): CRUDResult {
    try {
      const json = this.tree.serialize();
      return {
        success: true,
        message: 'Graph exported',
        data: JSON.parse(json)
      };
    } catch (error) {
      return { success: false, message: `Error exporting graph: ${error}` };
    }
  }

  importGraph(jsonData: string | Record<string, any>): CRUDResult {
    try {
      const json = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);
      this.tree.deserialize(json);
      return {
        success: true,
        message: 'Graph imported successfully'
      };
    } catch (error) {
      return { success: false, message: `Error importing graph: ${error}` };
    }
  }

  // Query operations
  queryByType(nodeType: string): CRUDResult {
    try {
      const results: any[] = [];

      const traverse = (node: TreeNode) => {
        if (node.type === nodeType) {
          results.push(node.toJSON());
        }
        for (const child of node.children) {
          traverse(child);
        }
      };

      traverse(this.tree);

      return {
        success: true,
        message: `Found ${results.length} nodes of type ${nodeType}`,
        data: results
      };
    } catch (error) {
      return { success: false, message: `Error querying by type: ${error}` };
    }
  }

  // Get aggregate statistics
  getStats(): CRUDResult {
    try {
      const metrics = this.tree.getTotalMetrics();
      const activeProviders = this.tree.getActiveProviders();

      return {
        success: true,
        message: 'Stats retrieved',
        data: {
          totalProviders: this.tree.providers.size,
          activeProviders: activeProviders.length,
          ...metrics
        }
      };
    } catch (error) {
      return { success: false, message: `Error getting stats: ${error}` };
    }
  }
}
