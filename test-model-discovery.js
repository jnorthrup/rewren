/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test script for dynamic model discovery
 */

import { initializeModelRegistry, listModels, listProviders } from './packages/core/dist/src/config/modelRegistry.js';

async function testModelDiscovery() {
  console.log('Testing dynamic model discovery...\n');

  // Show env vars
  console.log('Environment variables:');
  console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Not set');
  console.log('OPENROUTER_API_KEY:', process.env.OPENROUTER_API_KEY ? '✓ Set' : '✗ Not set');
  console.log('NVIDIA_API_KEY:', process.env.NVIDIA_API_KEY ? '✓ Set' : '✗ Not set');
  console.log('KILO_API_KEY:', process.env.KILO_API_KEY ? '✓ Set' : '✗ Not set');
  console.log();

  // Before initialization
  console.log('Before initialization:');
  const modelsBefore = listModels();
  const providersBefore = listProviders();
  console.log(`  Models: ${modelsBefore.length}`);
  console.log(`  Providers: ${providersBefore.length}`);
  console.log(`  Provider list: ${providersBefore.join(', ')}`);
  console.log();

  // Initialize and fetch dynamic models
  console.log('Initializing model registry (fetching from APIs)...');
  await initializeModelRegistry();
  console.log();

  // After initialization
  console.log('After initialization:');
  const modelsAfter = listModels();
  const providersAfter = listProviders();
  console.log(`  Models: ${modelsAfter.length}`);
  console.log(`  Providers: ${providersAfter.length}`);
  console.log(`  Provider list: ${providersAfter.join(', ')}`);
  console.log();

  // Show newly discovered models
  const newModelsCount = modelsAfter.length - modelsBefore.length;
  if (newModelsCount > 0) {
    console.log(`✓ Discovered ${newModelsCount} new models from APIs`);
    console.log('\nSample of dynamically discovered models:');
    const dynamicModels = modelsAfter.slice(modelsBefore.length);
    dynamicModels.slice(0, 10).forEach(model => {
      console.log(`  - ${model.name} (${model.provider})`);
    });
    if (dynamicModels.length > 10) {
      console.log(`  ... and ${dynamicModels.length - 10} more`);
    }
  } else {
    console.log('✗ No new models discovered (API keys may not be configured)');
  }
}

testModelDiscovery().catch(console.error);
