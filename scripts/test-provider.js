#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Simple non-interactive provider test script.
// Usage:
//   node scripts/test-provider.js --provider openai --key $OPENAI_API_KEY --base https://api.openai.com/v1 --model gpt-4o --prompt "Hello"
// Or use env vars: PROVIDER, PROVIDER_KEY, PROVIDER_BASE, MODEL, PROMPT

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    args[k] = v;
  }
}

const provider = args.provider || process.env.PROVIDER || 'openai';
const apiKey =
  args.key ||
  process.env.PROVIDER_KEY ||
  process.env.OPENAI_API_KEY ||
  process.env.VSCODE_LLM_PAT ||
  process.env.NVIDIA_API_KEY ||
  process.env.ANTHROPIC_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.DEEPSEEK_API_KEY ||
  process.env.QWEN_API_KEY;

const base =
  args.base ||
  process.env.PROVIDER_BASE ||
  process.env.OPENAI_BASE_URL ||
  process.env.NVIDIA_BASE_URL ||
  process.env.ANTHROPIC_BASE_URL ||
  '';
const model = args.model || process.env.MODEL || 'gpt-4o';
const prompt = args.prompt || process.env.PROMPT || 'Say hello from CLI';

if (!apiKey) {
  console.error('No API key provided. Pass --key or set PROVIDER_KEY / OPENAI_API_KEY / VSCODE_LLM_PAT');
  process.exit(2);
}

// Choose a sensible default base URL for OpenAI-compatible providers
let baseUrl = base;
if (!baseUrl) {
  if (provider === 'openai' || provider === 'openrouter' || provider === 'nvidia' || provider === 'kilo') {
    baseUrl = 'https://api.openai.com/v1';
  }
}

async function run() {
  try {
    const url = new URL('/v1/chat/completions', baseUrl || 'https://api.openai.com');

    const body = {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 256,
    };

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const txt = await res.text();
    try {
      const json = JSON.parse(txt);
      // try to extract message text
      if (json.choices && json.choices[0] && json.choices[0].message) {
        console.log(json.choices[0].message.content || JSON.stringify(json, null, 2));
      } else if (json.output && json.output[0] && json.output[0].content) {
        // Gemini Responses-like
        const parts = json.output.flatMap((p) => p.content || []);
        console.log(parts.map((part) => part.text || '').join(''));
      } else {
        console.log(JSON.stringify(json, null, 2));
      }
    } catch (_e) {
      console.log(txt);
    }
  } catch (_e) {
    console.error('Request failed:', _e);
    process.exit(1);
  }
}

run();
