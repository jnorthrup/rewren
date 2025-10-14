/**
 * Tests for Provider Tree Node Classes and Serialization
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ProviderTreeRoot,
  ProviderNode,
  ConfigNode,
  ModelsNode,
  ModelNode,
  QuotaNode,
  UsageNode,
  MetricsNode
} from './providerTreeNodes.js';
import { Providers } from './providers.js';
import { ModelConfig } from './providers/base.js';

describe('Provider Tree Nodes', () => {
  describe('Tree Operations', () => {
    it('should add and remove children', () => {
      const parent = new ProviderNode(Providers.OPENAI, 'TEST_KEY');
      const extraChild = new ModelsNode(parent); // Use ModelsNode to avoid ID conflicts
      extraChild.id = 'extra-test-child'; // Give it a unique ID

      const initialLength = parent.children.length; // Should be 4
      parent.addChild(extraChild);

      expect(parent.children).toHaveLength(initialLength + 1);
      expect(parent.children.includes(extraChild)).toBe(true);

      parent.removeChild(extraChild.id);
      expect(parent.children).toHaveLength(initialLength);
      expect(parent.children.includes(extraChild)).toBe(false);
    });

    it('should find nodes recursively', () => {
      const root = new ProviderTreeRoot();
      const provider = root.getProvider(Providers.OPENAI);

      if (provider) {
        expect(root.findNode('root')).toBe(root);
        expect(root.findNode(provider.id)).toBe(provider);
        expect(root.findNode('nonexistent')).toBeNull();
      }
    });
  });

  describe('ProviderNode', () => {
    let providerNode: ProviderNode;

    beforeEach(() => {
      // Set up environment variable for testing
      process.env['TEST_OPENAI_KEY'] = 'test-key-123';
      providerNode = new ProviderNode(Providers.OPENAI, 'TEST_OPENAI_KEY');
    });

    afterEach(() => {
      delete process.env['TEST_OPENAI_KEY'];
    });

    it('should create provider node with correct structure', () => {
      expect(providerNode.id).toBe('provider-openai');
      expect(providerNode.provider).toBe(Providers.OPENAI);
      expect(providerNode.envVar).toBe('TEST_OPENAI_KEY');
      expect(providerNode.hasApiKey).toBe(true);
      expect(providerNode.children).toHaveLength(4); // config, models, quota, metrics
    });

    it('should detect missing API key', () => {
      delete process.env['TEST_OPENAI_KEY'];
      const nodeWithoutKey = new ProviderNode(Providers.OPENAI, 'MISSING_KEY');
      expect(nodeWithoutKey.hasApiKey).toBe(false);
    });

    it('should serialize to JSON correctly', () => {
      const json = providerNode.toJSON();

      expect(json.id).toBe('provider-openai');
      expect(json.provider).toBe(Providers.OPENAI);
      expect(json.envVar).toBe('TEST_OPENAI_KEY');
      expect(json.children).toBeDefined();
      expect(json.children).toHaveLength(4);
      // Should NOT include the actual API key
      expect(json.apiKey).toBeUndefined();
    });

    it('should deserialize from JSON correctly', () => {
      const json = providerNode.toJSON();
      const newNode = new ProviderNode(Providers.OPENAI, 'TEST_OPENAI_KEY');
      newNode.fromJSON(json);

      expect(newNode.enabled).toBe(providerNode.enabled);
      expect(newNode.baseUrl).toBe(providerNode.baseUrl);
      expect(newNode.bayesWeight).toBe(providerNode.bayesWeight);
    });
  });

  describe('ConfigNode', () => {
    let providerNode: ProviderNode;
    let configNode: ConfigNode;

    beforeEach(() => {
      providerNode = new ProviderNode(Providers.OPENAI, 'TEST_OPENAI_KEY');
      configNode = providerNode.children[0] as ConfigNode; // First child is config
    });

    it('should have correct properties', () => {
      expect(configNode.id).toBe('provider-openai-config');
      expect(configNode.type).toBe('config');
      expect(configNode.parent).toBe(providerNode);
    });

    it('should serialize config data', () => {
      const json = configNode.toJSON();

      expect(json.id).toBe('provider-openai-config');
      expect(json.type).toBe('config');
      expect(json.baseUrl).toBeUndefined(); // No baseUrl provided in constructor
      expect(json.envVar).toBe('TEST_OPENAI_KEY');
      expect(json.enabled).toBe(true);
      expect(json.bayesWeight).toBe(1.0);
    });
  });

  describe('ModelsNode', () => {
    let providerNode: ProviderNode;
    let modelsNode: ModelsNode;

    beforeEach(() => {
      providerNode = new ProviderNode(Providers.OPENAI, 'TEST_OPENAI_KEY');
      modelsNode = providerNode.children[1] as ModelsNode; // Second child is models
    });

    it('should load models correctly', () => {
      const mockModels: ModelConfig[] = [
        {
          name: 'gpt-4',
          tokenLimit: 8192,
          provider: 'openai',
          supportsContextReorg: true,
          capabilities: {
            reasoning: true,
            functionCalling: true,
            streaming: true
          }
        },
        {
          name: 'gpt-3.5-turbo',
          tokenLimit: 4096,
          provider: 'openai',
          supportsContextReorg: false,
          capabilities: {
            reasoning: false,
            functionCalling: true,
            streaming: true
          }
        }
      ];

      modelsNode.loadModels(mockModels);

      expect(modelsNode.models).toHaveLength(2);
      expect(modelsNode.children).toHaveLength(2);

      const modelNode = modelsNode.children[0] as ModelNode;
      expect(modelNode.model.name).toBe('gpt-4');
      expect(modelNode.id).toBe('model-gpt-4');
    });

    it('should serialize models data', () => {
      const mockModels: ModelConfig[] = [
        {
          name: 'gpt-4',
          tokenLimit: 8192,
          provider: 'openai',
          supportsContextReorg: true,
          capabilities: {
            reasoning: true,
            functionCalling: true
          }
        }
      ];

      modelsNode.loadModels(mockModels);
      const json = modelsNode.toJSON();

      expect(json.id).toBe('provider-openai-models');
      expect(json.type).toBe('models');
      expect(json.models).toHaveLength(1);
      expect(json.models[0].name).toBe('gpt-4');
      expect(json.models[0].tokenLimit).toBe(8192);
    });
  });

  describe('UsageNode', () => {
    let providerNode: ProviderNode;
    let usageNode: UsageNode;

    beforeEach(() => {
      providerNode = new ProviderNode(Providers.OPENAI, 'TEST_OPENAI_KEY');
      usageNode = providerNode.children[2] as UsageNode; // Third child is usage
    });

    it('should calculate usage percentage', () => {
      usageNode.dailyTokenLimit = 1000;
      usageNode.dailyTokensUsed = 250;

      expect(usageNode.quotaUsagePercent).toBe(25);
    });

    it('should calculate estimated daily cost', () => {
      usageNode.dailyTokensUsed = 1000;
      usageNode.costPer1kTokens = 0.02;

      expect(usageNode.estimatedDailyCost).toBe(0.02);
    });

    it('should increment usage', () => {
      usageNode.incrementUsage(500);
      expect(usageNode.dailyTokensUsed).toBe(500);
      expect(usageNode.monthlyTokensUsed).toBe(500);
    });

    it('should serialize usage data', () => {
      usageNode.dailyTokenLimit = 10000;
      usageNode.dailyTokensUsed = 1500;
      usageNode.costPer1kTokens = 0.03;

      const json = usageNode.toJSON();

      expect(json.type).toBe('usage');
      expect(json.dailyTokenLimit).toBe(10000);
      expect(json.dailyTokensUsed).toBe(1500);
      expect(json.costPer1kTokens).toBe(0.03);
    });
  });

  describe('MetricsNode', () => {
    let providerNode: ProviderNode;
    let metricsNode: MetricsNode;

    beforeEach(() => {
      providerNode = new ProviderNode(Providers.OPENAI, 'TEST_OPENAI_KEY');
      metricsNode = providerNode.children[3] as MetricsNode; // Fourth child is metrics
    });

    it('should calculate success rate', () => {
      metricsNode.totalRequests = 10;
      metricsNode.successCount = 8;

      expect(metricsNode.successRate).toBe(80);
    });

    it('should calculate average latency', () => {
      metricsNode.successCount = 2;
      metricsNode.totalLatencyMs = 300; // 150ms average

      expect(metricsNode.avgLatencyMs).toBe(150);
    });

    it('should record success and error', () => {
      metricsNode.recordSuccess(100);
      expect(metricsNode.totalRequests).toBe(1);
      expect(metricsNode.successCount).toBe(1);
      expect(metricsNode.totalLatencyMs).toBe(100);

      metricsNode.recordError('Test error');
      expect(metricsNode.totalRequests).toBe(2);
      expect(metricsNode.errorCount).toBe(1);
      expect(metricsNode.lastError).toBe('Test error');
      expect(metricsNode.lastErrorTimestamp).toBeInstanceOf(Date);
    });

    it('should serialize metrics data', () => {
      metricsNode.recordSuccess(200);
      metricsNode.recordError('Test error');

      const json = metricsNode.toJSON();

      expect(json.type).toBe('metrics');
      expect(json.totalRequests).toBe(2);
      expect(json.successCount).toBe(1);
      expect(json.errorCount).toBe(1);
      expect(json.totalLatencyMs).toBe(200);
      expect(json.lastError).toBe('Test error');
      expect(json.lastErrorTimestamp).toBeDefined();
    });
  });

  describe('ProviderTreeRoot', () => {
    let treeRoot: ProviderTreeRoot;

    beforeEach(() => {
      treeRoot = new ProviderTreeRoot();
    });

    it('should initialize with all providers', () => {
      expect(treeRoot.providers.size).toBeGreaterThan(0);
      expect(treeRoot.children).toHaveLength(treeRoot.providers.size);
    });

    it('should get active providers', () => {
      // Set up a test API key
      process.env['OPENAI_API_KEY'] = 'test-key';

      const activeProviders = treeRoot.getActiveProviders();
      const openaiProvider = activeProviders.find(p => p.provider === Providers.OPENAI);

      expect(openaiProvider).toBeDefined();
      expect(openaiProvider?.hasApiKey).toBe(true);

      delete process.env['OPENAI_API_KEY'];
    });

    it('should serialize entire tree', () => {
      const json = treeRoot.toJSON();

      expect(json.version).toBe('1.0');
      expect(json.timestamp).toBeDefined();
      expect(json.providers).toBeDefined();
      expect(Object.keys(json.providers)).toHaveLength(treeRoot.providers.size);
    });

    it('should deserialize tree correctly', () => {
      const json = treeRoot.toJSON();
      const newTree = new ProviderTreeRoot();
      newTree.fromJSON(json);

      expect(newTree.providers.size).toBe(treeRoot.providers.size);
    });

    it('should serialize and deserialize as string', () => {
      const serialized = treeRoot.serialize();
      expect(typeof serialized).toBe('string');

      const newTree = new ProviderTreeRoot();
      newTree.deserialize(serialized);

      expect(newTree.providers.size).toBe(treeRoot.providers.size);
    });

    it('should calculate total metrics', () => {
      // Set up some test metrics
      const openaiProvider = treeRoot.getProvider(Providers.OPENAI);
      if (openaiProvider) {
        const metricsNode = openaiProvider.children.find(c => c instanceof MetricsNode) as MetricsNode;
        if (metricsNode) {
          metricsNode.recordSuccess(100);
          metricsNode.recordError('test');
        }
      }

      const totalMetrics = treeRoot.getTotalMetrics();

      expect(totalMetrics.totalRequests).toBe(2);
      expect(totalMetrics.totalSuccess).toBe(1);
      expect(totalMetrics.totalErrors).toBe(1);
      expect(totalMetrics.avgSuccessRate).toBe(50);
    });
  });
});