/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum Providers {
  AMAZON_BEDROCK = 'amazon-bedrock',
  ANTHROPIC = 'anthropic',
  VSCODE_LLM = 'vscode-llm',
  AZURE = 'azure',
  COHERE = 'cohere',
  DEEPSEEK = 'deepseek',
  GOOGLE = 'google',
  GOOGLE_VERTEX = 'google-vertex',
  GITHUB_COPILOT = 'github-copilot',
  GROQ = 'groq',
  HUGGINGFACE = 'huggingface',
  LLAMA = 'llama',
  MISTRAL = 'mistral',
  MORPH = 'morph',
  OPENAI = 'openai',
  OPENROUTER = 'openrouter',
  V0 = 'v0',
  VERCEL = 'vercel',
  XAI = 'xai',
  QWEN = 'qwen',
  FIREWORKS_AI = 'fireworks-ai',
  GITHUB_MODELS = 'github-models',
  INFERENCE = 'inference',
  AI21_LABS = 'ai21-labs',
  CORE42 = 'core42',
  NOUS_RESEARCH = 'nous-research',
  TNG_TECH = 'tng-tech',
  COGNITIVE_COMPUTATIONS = 'cognitive-computations',
  MOONSHOT_AI = 'moonshot-ai',
  CEREBRAS = 'cerebras',
  KILO = 'kilo',
  NVIDIA = 'nvidia',
  PERPLEXITY = 'perplexity',
  ZAI = 'zai',
}
 
/**
 * Human-friendly display names for providers. Use this map when rendering UI
 * so we have consistent capitalization and spacing across the app.
 */
export const PROVIDER_DISPLAY_NAMES: Record<Providers, string> = {
  [Providers.AMAZON_BEDROCK]: 'Amazon Bedrock',
  [Providers.ANTHROPIC]: 'Anthropic',
  [Providers.AZURE]: 'Azure',
  [Providers.COHERE]: 'Cohere',
  [Providers.DEEPSEEK]: 'DeepSeek',
  [Providers.GOOGLE]: 'Google',
  [Providers.GOOGLE_VERTEX]: 'Google Vertex',
  [Providers.GITHUB_COPILOT]: 'GitHub Copilot',
  [Providers.GROQ]: 'GROQ',
  [Providers.HUGGINGFACE]: 'Hugging Face',
  [Providers.LLAMA]: 'Llama',
  [Providers.MISTRAL]: 'Mistral',
  [Providers.MORPH]: 'Morph',
  [Providers.OPENAI]: 'OpenAI',
  [Providers.OPENROUTER]: 'OpenRouter',
  [Providers.V0]: 'v0',
  [Providers.VERCEL]: 'Vercel',
  [Providers.XAI]: 'xAI',
  [Providers.QWEN]: 'Qwen',
  [Providers.FIREWORKS_AI]: 'Fireworks AI',
  [Providers.GITHUB_MODELS]: 'GitHub Models',
  [Providers.INFERENCE]: 'Inference',
  [Providers.AI21_LABS]: 'AI21 Labs',
  [Providers.CORE42]: 'Core42',
  [Providers.NOUS_RESEARCH]: 'Nous Research',
  [Providers.TNG_TECH]: 'TNG Tech',
  [Providers.COGNITIVE_COMPUTATIONS]: 'Cognitive Computations',
  [Providers.MOONSHOT_AI]: 'Moonshot AI',
  [Providers.CEREBRAS]: 'Cerebras',
  [Providers.KILO]: 'Kilo',
  [Providers.NVIDIA]: 'NVIDIA',
  [Providers.PERPLEXITY]: 'Perplexity',
  [Providers.ZAI]: 'Z.AI (GLM)',
  [Providers.VSCODE_LLM]: 'VSCode LLM',
};

/**
 * Return a friendly display name for a provider enum value. Falls back to a
 * generated title-case string if the provider isn't in the override map.
 */
export function providerDisplayName(provider: Providers): string {
  const override = PROVIDER_DISPLAY_NAMES[provider];
  if (override) return override;

  // Fallback: convert kebab-case -> Title Case (handles most providers).
  return (provider as string)
    .split('-')
    .map((segment) => {
      // preserve all-uppercase tokens and tokens with digits (AI21, v0, etc.)
      if (/^[A-Z0-9]+$/.test(segment)) return segment;
      if (/\d/.test(segment)) return segment.toUpperCase();
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join(' ');
}
