#!/usr/bin/env node
/**
 * Demonstrate full control over Harmony provider's GPT-OSS-120B model
 */

import { ProviderTreeRoot } from '../packages/core/dist/src/config/providerTreeNodes.js';
import { JsonGraphCRUD } from '../packages/core/dist/src/config/tree/jsonGraphCRUD.js';

const tree = new ProviderTreeRoot();
await tree.initialize();

const crud = new JsonGraphCRUD(tree);

console.log('\n=== Harmony Provider GPT-OSS-120B Full Control ===\n');

// Find Harmony provider
const harmony = tree.getProvider('harmony');
if (!harmony) {
  console.log('❌ Harmony provider not found');
  process.exit(1);
}

console.log('✅ Harmony provider found');
console.log(`   Base URL: ${harmony.baseUrl}`);
console.log(`   Env Var: ${harmony.envVar}`);
console.log(`   Enabled: ${harmony.enabled}`);

// Find models
const modelsNode = harmony.children.find(c => c.type === 'models');
console.log(`\n✅ Models available: ${modelsNode?.children.length || 0}`);

if (modelsNode) {
  modelsNode.children.forEach((m, idx) => {
    console.log(`   ${idx + 1}. ${m.model.name}`);
  });
}

// Find gpt-oss-120b model
const gptOssModel = tree.findNode('model-openai/gpt-oss-120b');
if (!gptOssModel) {
  console.log('\n❌ GPT-OSS-120B model not found in Harmony provider');
  process.exit(1);
}

console.log('\n✅ GPT-OSS-120B model found');
console.log(`   Full ID: ${gptOssModel.id}`);
console.log(`   Token Limit: ${gptOssModel.tokenLimit.toLocaleString()}`);
console.log(`   Capabilities: ${JSON.stringify(gptOssModel.model.capabilities)}`);

// Set provider-level defaults for Harmony
console.log('\n=== Setting Harmony Provider Defaults ===\n');

const providerResult = crud.updateNode(harmony.id, {
  defaultReasoning: {
    effort: 'high',
    max_tokens: 8192,
    exclude: false
  },
  defaultVerbosity: 'high',
  defaultIncludeReasoning: true,
  defaultTemperature: 1.0,
  defaultTopP: 0.95,
  defaultMaxTokens: 9000
});

console.log(`${providerResult.message}`);
console.log('Provider defaults:');
console.log(`  reasoning.effort: ${providerResult.data.defaultReasoning?.effort}`);
console.log(`  reasoning.max_tokens: ${providerResult.data.defaultReasoning?.max_tokens}`);
console.log(`  verbosity: ${providerResult.data.defaultVerbosity}`);
console.log(`  includeReasoning: ${providerResult.data.defaultIncludeReasoning}`);
console.log(`  temperature: ${providerResult.data.defaultTemperature}`);
console.log(`  topP: ${providerResult.data.defaultTopP}`);
console.log(`  maxTokens: ${providerResult.data.defaultMaxTokens}`);

// Set model-specific overrides for GPT-OSS-120B
console.log('\n=== Setting GPT-OSS-120B Model Overrides ===\n');

const modelResult = crud.updateNode(gptOssModel.id, {
  reasoning: {
    effort: 'high',
    max_tokens: 8192,
    exclude: false
  },
  verbosity: 'high',
  includeReasoning: true,
  temperature: 1.0,
  topP: 0.95,
  maxTokens: 9000,
  gptOssFormat: true  // Enable GPT-OSS API format
});

console.log(`${modelResult.message}`);
console.log('Model-specific parameters:');
console.log(`  reasoning: ${JSON.stringify(modelResult.data.reasoning)}`);
console.log(`  verbosity: ${modelResult.data.verbosity}`);
console.log(`  includeReasoning: ${modelResult.data.includeReasoning}`);
console.log(`  temperature: ${modelResult.data.temperature}`);
console.log(`  topP: ${modelResult.data.topP}`);
console.log(`  maxTokens: ${modelResult.data.maxTokens}`);
console.log(`  gptOssFormat: ${modelResult.data.gptOssFormat}`);

// Get effective parameters
console.log('\n=== Effective Parameters (Computed) ===\n');

const effective = gptOssModel.getEffectiveParameters();
console.log('Final parameters sent to API:');
console.log(`  reasoning.effort: ${effective.reasoning?.effort}`);
console.log(`  reasoning.max_tokens: ${effective.reasoning?.max_tokens}`);
console.log(`  reasoning.exclude: ${effective.reasoning?.exclude}`);
console.log(`  verbosity: ${effective.verbosity}`);
console.log(`  includeReasoning: ${effective.includeReasoning}`);
console.log(`  temperature: ${effective.temperature}`);
console.log(`  topP: ${effective.topP}`);
console.log(`  maxTokens: ${effective.maxTokens}`);

// Select the model
console.log('\n=== Selecting GPT-OSS-120B as Active Model ===\n');

const selectionResult = crud.updateNode(modelsNode.id, {
  selectedModel: 'openai/gpt-oss-120b'
});

console.log(`${selectionResult.message}`);
console.log(`Selected: ${selectionResult.data.selectedModel}`);

// Export configuration
console.log('\n=== Export Harmony Configuration ===\n');

const exportResult = crud.readNode(harmony.id);
if (exportResult.success) {
  console.log('Full Harmony provider configuration:');
  console.log(JSON.stringify(exportResult.data, null, 2));
}

console.log('\n=== Summary ===\n');
console.log('✅ Harmony provider configured with GPT-OSS-120B');
console.log('✅ Provider-level defaults set');
console.log('✅ Model-specific parameters configured');
console.log('✅ GPT-OSS API format enabled');
console.log('✅ Model selected as active');
console.log('✅ Full control achieved');
console.log('\nYou now have complete control over Harmony\'s GPT-OSS-120B model.');
console.log('All parameters can be edited via:');
console.log('  1. CRUD operations (as shown)');
console.log('  2. JSON editor in UI (press \'j\')');
console.log('  3. Direct tree manipulation\n');
