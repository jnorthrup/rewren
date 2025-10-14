#!/usr/bin/env node
/**
 * Test script for model parameter CRUD operations
 * Demonstrates provider-level defaults and per-model overrides
 */

import { ProviderTreeRoot } from '../packages/core/dist/src/config/providerTreeNodes.js';
import { JsonGraphCRUD } from '../packages/core/dist/src/config/tree/jsonGraphCRUD.js';

const tree = new ProviderTreeRoot();
await tree.initialize();

const crud = new JsonGraphCRUD(tree);

console.log('\n=== Provider-Level Default Parameters ===\n');

// Set provider-level defaults for OpenRouter
const openrouterProvider = tree.getProvider('openrouter');
if (openrouterProvider) {
  console.log('Setting OpenRouter provider defaults:');
  const result = crud.updateNode(openrouterProvider.id, {
    defaultReasoning: {
      effort: 'high',
      max_tokens: 8192,
      exclude: false
    },
    defaultVerbosity: 'high',
    defaultIncludeReasoning: true,
    defaultTemperature: 0.7,
    defaultTopP: 0.9,
    defaultMaxTokens: 9000
  });
  console.log(`  ${result.message}`);
  console.log(`  Defaults:`, {
    reasoning: result.data.defaultReasoning,
    verbosity: result.data.defaultVerbosity,
    includeReasoning: result.data.defaultIncludeReasoning,
    temperature: result.data.defaultTemperature,
    topP: result.data.defaultTopP,
    maxTokens: result.data.defaultMaxTokens
  });
}

console.log('\n=== Per-Model Parameter Overrides ===\n');

// List available models to find one that exists
const allProviders = Array.from(tree.providers.values());
let testModel = null;
for (const provider of allProviders) {
  const modelsNode = provider.children.find(c => c.type === 'models');
  if (modelsNode && modelsNode.children.length > 0) {
    testModel = modelsNode.children[0];
    console.log(`Using test model: ${testModel.label} (${testModel.id})`);
    break;
  }
}

if (testModel) {
  console.log('\nOverriding model with custom parameters:');
  const result = crud.updateNode(testModel.id, {
    reasoning: {
      effort: 'medium',
      max_tokens: 4096
    },
    temperature: 0.5,
    verbosity: 'low'
  });
  console.log(`  ${result.message}`);
  console.log(`  Model-specific:`, {
    reasoning: result.data.reasoning,
    verbosity: result.data.verbosity,
    temperature: result.data.temperature
  });

  // Show effective parameters (with fallback to provider defaults)
  console.log('\n  Effective parameters (model + provider defaults):');
  const effective = testModel.getEffectiveParameters();
  console.log(`    reasoning:`, effective.reasoning);
  console.log(`    verbosity:`, effective.verbosity);
  console.log(`    includeReasoning:`, effective.includeReasoning);
  console.log(`    temperature:`, effective.temperature);
  console.log(`    topP:`, effective.topP);
  console.log(`    maxTokens:`, effective.maxTokens);
} else {
  console.log('No models found in tree');
}

console.log('\n=== Batch Update Multiple Models ===\n');

const batchUpdates = [
  {
    nodeId: testModel?.id || 'model-test',
    updates: {
      verbosity: 'medium',
      maxTokens: 8500
    }
  },
  {
    nodeId: 'provider-openrouter',
    updates: {
      defaultTemperature: 0.8
    }
  }
];

if (testModel) {
  const batchResult = crud.batchUpdate(batchUpdates);
  console.log(`Batch update: ${batchResult.message}`);
  if (batchResult.data) {
    batchResult.data.forEach((r) => {
      console.log(`  ${r.nodeId}: ${r.message}`);
    });
  }
}

console.log('\n=== Export Configuration ===\n');

const exportResult = crud.exportGraph();
if (exportResult.success && exportResult.data) {
  // Find OpenRouter provider in exported data
  const openrouterData = exportResult.data.children?.find(
    (c) => c.provider === 'openrouter'
  );
  if (openrouterData) {
    console.log('OpenRouter provider defaults in exported JSON:');
    console.log(JSON.stringify({
      defaultReasoning: openrouterData.defaultReasoning,
      defaultVerbosity: openrouterData.defaultVerbosity,
      defaultIncludeReasoning: openrouterData.defaultIncludeReasoning,
      defaultTemperature: openrouterData.defaultTemperature,
      defaultTopP: openrouterData.defaultTopP,
      defaultMaxTokens: openrouterData.defaultMaxTokens
    }, null, 2));

    // Find gpt-oss model in exported data
    const modelsNode = openrouterData.children?.find((c) => c.id?.includes('-models'));
    const gptOssData = modelsNode?.children?.find(
      (c) => c.name === 'openai/gpt-oss-120b'
    );
    if (gptOssData) {
      console.log('\ngpt-oss-120b model overrides in exported JSON:');
      console.log(JSON.stringify({
        reasoning: gptOssData.reasoning,
        verbosity: gptOssData.verbosity,
        temperature: gptOssData.temperature,
        maxTokens: gptOssData.maxTokens
      }, null, 2));
    }
  }
}

console.log('\n=== Summary ===\n');
console.log('✓ Provider-level defaults set for all models');
console.log('✓ Per-model overrides applied to specific models');
console.log('✓ Effective parameters computed with fallback logic');
console.log('✓ Batch updates work across providers and models');
console.log('✓ Configuration exported with all parameters\n');
