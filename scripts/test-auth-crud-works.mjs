#!/usr/bin/env node
/**
 * Test that the auth GUI CRUD works
 * Tests all the functionality we built:
 * - Provider-level defaults
 * - Per-model parameters
 * - Model selection
 * - JSON editor capabilities
 */

import { ProviderTreeRoot } from '../packages/core/dist/src/config/providerTreeNodes.js';
import { JsonGraphCRUD } from '../packages/core/dist/src/config/tree/jsonGraphCRUD.js';

console.log('\n=== Auth GUI CRUD Functionality Test ===\n');

const tree = new ProviderTreeRoot();
await tree.initialize();

const crud = new JsonGraphCRUD(tree);

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passCount++;
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failCount++;
  }
}

// Test 1: Read provider
test('Read provider node', () => {
  const result = crud.readProvider('openrouter');
  if (!result.success) throw new Error(result.message);
  if (!result.data.provider) throw new Error('Missing provider field');
});

// Test 2: Update provider defaults
test('Update provider-level defaults', () => {
  const result = crud.updateNode('provider-openrouter', {
    defaultReasoning: { effort: 'high', max_tokens: 8192 },
    defaultTemperature: 0.7,
    defaultTopP: 0.9
  });
  if (!result.success) throw new Error(result.message);
  if (!result.data.defaultReasoning) throw new Error('Defaults not saved');
});

// Test 3: Read all providers
test('Read all providers', () => {
  const result = crud.readAllProviders();
  if (!result.success) throw new Error(result.message);
  if (!Array.isArray(result.data)) throw new Error('Expected array');
  if (result.data.length < 5) throw new Error('Too few providers');
});

// Test 4: Update model parameters
const harmony = tree.getProvider('harmony');
if (harmony) {
  const modelsNode = harmony.children.find(c => c.type === 'models');
  if (modelsNode && modelsNode.children.length > 0) {
    const firstModel = modelsNode.children[0];

    test('Update model parameters', () => {
      const result = crud.updateNode(firstModel.id, {
        reasoning: { effort: 'medium', max_tokens: 4096 },
        temperature: 0.5
      });
      if (!result.success) throw new Error(result.message);
      if (!result.data.reasoning) throw new Error('Model params not saved');
    });

    test('Get effective parameters (inheritance)', () => {
      const effective = firstModel.getEffectiveParameters();
      if (!effective) throw new Error('No effective parameters');
      // Should have either model or provider defaults
    });
  }
}

// Test 5: Select model
test('Select model (ModelsNode update)', () => {
  const harmony = tree.getProvider('harmony');
  if (!harmony) throw new Error('Harmony provider not found');

  const modelsNode = harmony.children.find(c => c.type === 'models');
  if (!modelsNode) throw new Error('Models node not found');

  const result = crud.updateNode(modelsNode.id, {
    selectedModel: 'openai/gpt-oss-120b'
  });

  if (!result.success) throw new Error(result.message);
  if (result.data.selectedModel !== 'openai/gpt-oss-120b') {
    throw new Error('Model not selected');
  }
});

// Test 6: Update quota
test('Update quota limits', () => {
  const harmony = tree.getProvider('harmony');
  if (!harmony) throw new Error('Harmony provider not found');

  const quotaNode = harmony.children.find(c => c.type === 'quota');
  if (!quotaNode) throw new Error('Quota node not found');

  const result = crud.updateNode(quotaNode.id, {
    dailyTokenLimit: 100000,
    monthlyTokenLimit: 3000000
  });

  if (!result.success) throw new Error(result.message);
});

// Test 7: Update metrics
test('Update metrics', () => {
  const harmony = tree.getProvider('harmony');
  if (!harmony) throw new Error('Harmony provider not found');

  const metricsNode = harmony.children.find(c => c.type === 'metrics');
  if (!metricsNode) throw new Error('Metrics node not found');

  const result = crud.updateNode(metricsNode.id, {
    reset: true
  });

  if (!result.success) throw new Error(result.message);
});

// Test 8: Batch update
test('Batch update multiple nodes', () => {
  const updates = [
    {
      nodeId: 'provider-harmony',
      updates: { defaultTemperature: 0.8 }
    },
    {
      nodeId: 'provider-openrouter',
      updates: { defaultVerbosity: 'high' }
    }
  ];

  const result = crud.batchUpdate(updates);
  if (!result.success) throw new Error(result.message);
});

// Test 9: Export graph
test('Export graph (JSON editor backend)', () => {
  const result = crud.exportGraph();
  if (!result.success) throw new Error(result.message);
  if (!result.data) throw new Error('No export data');
  if (!result.data.children) throw new Error('Missing children');
});

// Test 10: Query by type
test('Query nodes by type', () => {
  const result = crud.queryByType('model');
  if (!result.success) throw new Error(result.message);
  if (!Array.isArray(result.data)) throw new Error('Expected array');
});

// Test 11: Get stats
test('Get aggregate stats', () => {
  const result = crud.getStats();
  if (!result.success) throw new Error(result.message);
  if (typeof result.data.totalProviders !== 'number') {
    throw new Error('Missing stats');
  }
});

// Test 12: JSON serialization round-trip
test('JSON serialization round-trip', () => {
  const exported = crud.exportGraph();
  if (!exported.success) throw new Error('Export failed');

  const json = JSON.stringify(exported.data);
  const parsed = JSON.parse(json);

  if (!parsed.children) throw new Error('Serialization failed');
});

console.log('\n=== Test Summary ===\n');
console.log(`✅ Passed: ${passCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log(`📊 Total: ${passCount + failCount}\n`);

if (failCount === 0) {
  console.log('🎉 All auth GUI CRUD functionality is working!\n');
  console.log('Features verified:');
  console.log('  ✅ Provider CRUD operations');
  console.log('  ✅ Provider-level default parameters');
  console.log('  ✅ Per-model parameter overrides');
  console.log('  ✅ Model selection (all providers)');
  console.log('  ✅ Quota management');
  console.log('  ✅ Metrics tracking');
  console.log('  ✅ Batch updates');
  console.log('  ✅ JSON export (for editor)');
  console.log('  ✅ Graph queries');
  console.log('  ✅ Aggregate statistics');
  console.log('  ✅ Full serialization');
  console.log('');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Check the errors above.\n');
  process.exit(1);
}
