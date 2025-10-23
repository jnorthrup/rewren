/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test script to fetch models directly from OpenAI-compatible APIs
 */

async function testFetchModels(baseURL, apiKey, providerName) {
  console.log(`\nTesting ${providerName}...`);
  console.log(`  Base URL: ${baseURL}`);
  console.log(`  API Key: ${apiKey ? '***' + apiKey.slice(-4) : 'Not provided'}`);

  if (!apiKey) {
    console.log(`  ✗ Skipping (no API key)`);
    return;
  }

  try {
    const url = new URL('/v1/models', baseURL);
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`  ✗ Failed: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.log(`  Response: ${text.slice(0, 200)}`);
      return;
    }

    const data = await response.json();
    const models = data.data || [];

    console.log(`  ✓ Success: Found ${models.length} models`);
    if (models.length > 0) {
      console.log(`  Sample models:`);
      models.slice(0, 5).forEach(model => {
        console.log(`    - ${model.id}`);
      });
      if (models.length > 5) {
        console.log(`    ... and ${models.length - 5} more`);
      }
    }
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
  }
}

async function main() {
  console.log('Testing OpenAI-compatible API endpoints\n');
  console.log('='.repeat(60));

  const providers = [
    {
      name: 'OpenAI',
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY,
    },
    {
      name: 'OpenRouter',
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    },
    {
      name: 'NVIDIA',
      baseURL: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY,
    },
    {
      name: 'Kilo',
      baseURL: process.env.KILO_BASE_URL || 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
      apiKey: process.env.KILO_API_KEY,
    },
    {
      name: 'Groq',
      baseURL: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
    },
    {
      name: 'DeepSeek',
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY,
    },
    {
      name: 'Qwen',
      baseURL: process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      apiKey: process.env.QWEN_API_KEY,
    },
    {
      name: 'Moonshot',
      baseURL: process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1',
      apiKey: process.env.MOONSHOT_API_KEY,
    },
    {
      name: 'Harmony',
      baseURL: process.env.HARMONY_BASE_URL || 'https://harmony.ai/api/v1',
      apiKey: process.env.HARMONY_API_KEY,
    },
  ];

  for (const provider of providers) {
    await testFetchModels(provider.baseURL, provider.apiKey, provider.name);
  }

  console.log('\n' + '='.repeat(60));
  console.log('\nTo test a provider, set environment variables:');
  console.log('  export OPENAI_API_KEY="sk-..."');
  console.log('  export OPENROUTER_API_KEY="sk-or-v1-..."');
  console.log('  export NVIDIA_API_KEY="nvapi-..."');
  console.log('  export KILO_API_KEY="..."');
  console.log('  export GROQ_API_KEY="..."');
  console.log('  export DEEPSEEK_API_KEY="..."');
  console.log('  export QWEN_API_KEY="..."');
  console.log('  export MOONSHOT_API_KEY="..."');
  console.log('  export HARMONY_API_KEY="..."');
}

main().catch(console.error);