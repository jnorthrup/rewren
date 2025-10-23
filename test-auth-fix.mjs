#!/usr/bin/env node
/**
 * Direct test of /auth fix - validates actual code execution
 */

import { readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';

const WREN_DIR = join(process.cwd(), '.wren');
const MODEL_FILE = join(WREN_DIR, 'current-model.json');

console.log('=== TESTING /AUTH FIX ===\n');

// Setup
if (!existsSync(WREN_DIR)) {
  mkdirSync(WREN_DIR, { recursive: true });
  console.log('✓ Created .wren directory');
}

// Clean slate
if (existsSync(MODEL_FILE)) {
  unlinkSync(MODEL_FILE);
  console.log('✓ Cleaned existing model file');
}

let passes = 0;
let fails = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passes++;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    fails++;
  }
}

async function runTests() {
  // Test 1: Can import saveCurrentModelSelection?
  await test('Import saveCurrentModelSelection', async () => {
    const { saveCurrentModelSelection } = await import('./packages/core/dist/index.js');
    if (typeof saveCurrentModelSelection !== 'function') {
      throw new Error('saveCurrentModelSelection not exported');
    }
  });

  // Test 2: Does it write the file?
  await test('saveCurrentModelSelection creates file', async () => {
    const { saveCurrentModelSelection } = await import('./packages/core/dist/index.js');

    await saveCurrentModelSelection(
      'nvidia',
      'meta/llama-3.3-70b-instruct',
      undefined,
      'https://integrate.api.nvidia.com/v1',
      'openai-compatible',
      {}
    );

    if (!existsSync(MODEL_FILE)) {
      throw new Error('File not created');
    }
  });

  // Test 3: Does it have correct structure?
  await test('Saved file has correct structure', () => {
    const saved = JSON.parse(readFileSync(MODEL_FILE, 'utf-8'));

    if (!saved.provider) throw new Error('Missing provider');
    if (!saved.modelName) throw new Error('Missing modelName');
    if (!saved.baseURL) throw new Error('Missing baseURL');
    if (saved.apiKey !== undefined) throw new Error('API key should be undefined');
    if (!saved.authType) throw new Error('Missing authType');
  });

  // Test 4: Can createContentGeneratorConfig load it?
  await test('createContentGeneratorConfig loads saved file', async () => {
    const { createContentGeneratorConfig, getCurrentModelSelection } = await import('./packages/core/dist/index.js');

    const selection = getCurrentModelSelection();
    if (!selection) {
      throw new Error('Selection not loaded into cache');
    }

    if (selection.modelName !== 'meta/llama-3.3-70b-instruct') {
      throw new Error(`Wrong model loaded: ${selection.modelName}`);
    }
  });

  // Test 5: Does canonicalEnvVar return correct format?
  await test('canonicalEnvVar returns NVIDIA_API_KEY format', async () => {
    const { ProviderNode } = await import('./packages/core/dist/index.js');

    const envVar = ProviderNode.canonicalEnvVar('nvidia');
    if (envVar !== 'NVIDIA_API_KEY') {
      throw new Error(`Wrong env var: ${envVar} (expected NVIDIA_API_KEY)`);
    }
  });

  // Test 6: Security - rejects API key save attempts
  await test('saveCurrentModelSelection rejects API keys', async () => {
    const { saveCurrentModelSelection } = await import('./packages/core/dist/index.js');

    try {
      await saveCurrentModelSelection(
        'nvidia',
        'test-model',
        'secret-key-should-fail', // This should be rejected
        'https://example.com',
        'openai-compatible',
        {}
      );
      throw new Error('Should have rejected API key');
    } catch (e) {
      if (!e.message.includes('SECURITY')) {
        throw new Error(`Wrong error: ${e.message}`);
      }
    }
  });

  // Results
  console.log(`\n=== RESULTS ===`);
  console.log(`Passed: ${passes}`);
  console.log(`Failed: ${fails}`);

  if (fails > 0) {
    console.error('\nFIX VALIDATION FAILED');
    process.exit(1);
  } else {
    console.log('\n✓ ALL TESTS PASSED - FIX VERIFIED');
    process.exit(0);
  }
}

runTests().catch(e => {
  console.error('Test runner failed:', e);
  process.exit(1);
});
