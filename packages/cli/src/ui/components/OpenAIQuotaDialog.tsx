/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { ProviderConfigService } from '@wren-coder/wren-coder-cli-core';

interface QuotaOption {
  label: string;
  value: string;
  description: string;
}

interface ProviderOption {
  label: string;
  value: string;
  baseUrl: string;
  description: string;
}

interface ModelOption {
  label: string;
  value: string;
  description: string;
}

interface OpenAIQuotaDialogProps {
  onSubmit: (baseUrl: string, model: string) => void;
  onCancel: () => void;
}

export function OpenAIQuotaDialog({
  onSubmit,
  onCancel,
}: OpenAIQuotaDialogProps): React.JSX.Element {
  const [currentStep, setCurrentStep] = useState<'provider' | 'model' | 'baseUrl'>('provider');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [customBaseUrl, setCustomBaseUrl] = useState<string>('');
  const [customModel, setCustomModel] = useState<string>('');
  const [showCustomModel, setShowCustomModel] = useState(false);
  const [showCustomBaseUrl, setShowCustomBaseUrl] = useState(false);
  
  const providers: ProviderOption[] = [
    { 
      label: 'OpenAI', 
      value: 'openai', 
      baseUrl: 'https://api.openai.com/v1',
      description: 'Official OpenAI API' 
    },
    { 
      label: 'OpenRouter', 
      value: 'openrouter', 
      baseUrl: 'https://openrouter.ai/api/v1',
      description: 'Multi-model router' 
    },
    { 
      label: 'NVIDIA NIM', 
      value: 'nvidia', 
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      description: 'NVIDIA NIM microservices' 
    },
    { 
      label: 'Groq', 
      value: 'groq', 
      baseUrl: 'https://api.groq.com/openai/v1',
      description: 'Fast inference API' 
    },
    { 
      label: 'DeepSeek', 
      value: 'deepseek', 
      baseUrl: 'https://api.deepseek.com/v1',
      description: 'Reasoning model API' 
    },
    { 
      label: 'Qwen', 
      value: 'qwen', 
      baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      description: 'Alibaba Qwen models' 
    },
    { 
      label: 'Moonshot', 
      value: 'moonshot', 
      baseUrl: 'https://api.moonshot.ai/v1',
      description: 'Moonshot AI models' 
    },
    { 
      label: 'Kilo', 
      value: 'kilo', 
      baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
      description: 'Kilo Code endpoints' 
    },
    { 
      label: 'Gemini', 
      value: 'gemini', 
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', 
      description: 'Google Gemini models' 
    },
    { 
      label: 'xAI', 
      value: 'xai', 
      baseUrl: 'https://api.x.ai/v1',
      description: 'xAI Grok models' 
    },
    { 
      label: 'Meta AI', 
      value: 'meta', 
      baseUrl: 'https://api.meta.ai/v1',
      description: 'Meta AI models' 
    },
    { 
      label: 'Hugging Face', 
      value: 'huggingface', 
      baseUrl: 'https://api-inference.huggingface.co/v1',
      description: 'Hugging Face inference' 
    },
    { 
      label: 'Custom', 
      value: 'custom', 
      baseUrl: '',
      description: 'Custom OpenAI-compatible API' 
    },
  ];

  const defaultModels: Record<string, ModelOption[]> = {
    openai: [
      { label: 'gpt-4o', value: 'gpt-4o', description: 'GPT-4 Omni' },
      { label: 'gpt-4o-mini', value: 'gpt-4o-mini', description: 'GPT-4 Mini' },
      { label: 'gpt-3.5-turbo', value: 'gpt-3.5-turbo', description: 'GPT-3.5 Turbo' },
    ],
    openrouter: [
      { label: 'openai/gpt-4o', value: 'openai/gpt-4o', description: 'OpenAI GPT-4 Omni' },
      { label: 'anthropic/claude-3.5-sonnet', value: 'anthropic/claude-3.5-sonnet', description: 'Claude 3.5 Sonnet' },
      { label: 'google/gemini-pro', value: 'google/gemini-pro', description: 'Google Gemini Pro' },
    ],
    nvidia: [
      { label: 'meta/llama-3.1-405b-instruct', value: 'meta/llama-3.1-405b-instruct', description: 'Llama 3.1 405B' },
      { label: 'nvidia/llama-3.1-nemotron-70b-instruct', value: 'nvidia/llama-3.1-nemotron-70b-instruct', description: 'Nemotron 70B' },
    ],
    groq: [
      { label: 'llama3-70b-8192', value: 'llama3-70b-8192', description: 'Llama 3 70B' },
      { label: 'mixtral-8x7b-32768', value: 'mixtral-8x7b-32768', description: 'Mixtral 8x7B' },
      { label: 'gemma-7b-it', value: 'gemma-7b-it', description: 'Gemma 7B' },
    ],
    deepseek: [
      { label: 'deepseek-chat', value: 'deepseek-chat', description: 'DeepSeek Chat' },
      { label: 'deepseek-reasoner', value: 'deepseek-reasoner', description: 'DeepSeek Reasoner' },
    ],
    qwen: [
      { label: 'qwen-max', value: 'qwen-max', description: 'Qwen Max' },
      { label: 'qwen-plus', value: 'qwen-plus', description: 'Qwen Plus' },
      { label: 'qwen-turbo', value: 'qwen-turbo', description: 'Qwen Turbo' },
    ],
    moonshot: [
      { label: 'moonshot-v1-8k', value: 'moonshot-v1-8k', description: 'Moonshot 8K' },
      { label: 'moonshot-v1-32k', value: 'moonshot-v1-32k', description: 'Moonshot 32K' },
      { label: 'moonshot-v1-128k', value: 'moonshot-v1-128k', description: 'Moonshot 128K' },
    ],
    kilo: [
      { label: 'gpt-5', value: 'gpt-5', description: 'GPT-5' },
      { label: 'claude-4', value: 'claude-4', description: 'Claude 4' },
      { label: 'qwen3-coder', value: 'qwen3-coder', description: 'Qwen3 Coder' },
    ],
    gemini: [
      { label: 'gpt-4o', value: 'gpt-4o', description: 'GPT-4 via Gemini OpenAI API' },
      { label: 'claude-3.5-sonnet', value: 'claude-3.5-sonnet', description: 'Claude via Gemini OpenAI API' },
    ],
    xai: [
      { label: 'grok-3', value: 'grok-3', description: 'Grok 3' },
      { label: 'grok-2', value: 'grok-2', description: 'Grok 2' },
    ],
    meta: [
      { label: 'llama-3.1-405b', value: 'llama-3.1-405b', description: 'Llama 3.1 405B' },
      { label: 'llama-3.1-70b', value: 'llama-3.1-70b', description: 'Llama 3.1 70B' },
    ],
    huggingface: [
      { label: 'microsoft/DialoGPT-medium', value: 'microsoft/DialoGPT-medium', description: 'DialoGPT Medium' },
      { label: 'gpt2', value: 'gpt2', description: 'GPT-2' },
    ],
  };

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  useEffect(() => {
    if (selectedProvider) {
      const provider = providers.find(p => p.value === selectedProvider);
      if (provider && provider.value !== 'custom') {
        setCustomBaseUrl(provider.baseUrl);
      }
    }
  }, [selectedProvider]);

  const handleProviderSelect = (providerValue: string) => {
    setSelectedProvider(providerValue);
    if (providerValue !== 'custom') {
      setShowCustomBaseUrl(false);
      const provider = providers.find(p => p.value === providerValue);
      if (provider) {
        setCustomBaseUrl(provider.baseUrl);
      }
    } else {
      setShowCustomBaseUrl(true);
    }
    setCurrentStep('model');
  };

  const handleModelSelect = (modelValue: string) => {
    setSelectedModel(modelValue);
    if (modelValue === 'custom-model') {
      setShowCustomModel(true);
    } else {
      onSubmit(customBaseUrl, modelValue);
    }
  };

  const handleSubmit = () => {
    if (customBaseUrl && (selectedModel || customModel)) {
      onSubmit(customBaseUrl, selectedModel || customModel);
    }
  };

  const providerItems = providers.map(p => ({
    label: `${p.label} - ${p.description}`,
    value: p.value,
  }));

  const modelItems = selectedProvider && defaultModels[selectedProvider] 
    ? [
        ...defaultModels[selectedProvider].map(m => ({
          label: `${m.label} - ${m.description}`,
          value: m.value,
        })),
        { label: 'Custom Model...', value: 'custom-model' },
      ]
    : [];

  if (currentStep === 'provider') {
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text bold>Select Provider</Text>
        <Box marginTop={1}>
          <Text>Select an AI provider to use:</Text>
        </Box>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={providerItems}
            initialIndex={-1}
            onSelect={handleProviderSelect}
            isFocused={true}
          />
        </Box>
        <Box marginTop={1}>
          <Text color={Colors.AccentPurple}>(Use Arrow Keys and Enter)</Text>
        </Box>
      </Box>
    );
  }

  if (currentStep === 'model' && !showCustomModel) {
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text bold>Select Model</Text>
        <Box marginTop={1}>
          <Text>Select a model for {providers.find(p => p.value === selectedProvider)?.label}:</Text>
        </Box>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={modelItems}
            initialIndex={-1}
            onSelect={handleModelSelect}
            isFocused={true}
          />
        </Box>
        <Box marginTop={1}>
          <Text color={Colors.AccentPurple}>(Use Arrow Keys and Enter)</Text>
        </Box>
      </Box>
    );
  }

  if (showCustomModel) {
    // For now, we'll create a simple text input - in a real implementation
    // this would require a proper text input component
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text bold>Enter Custom Model</Text>
        <Box marginTop={1}>
          <Text>Enter the model name:</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={Colors.AccentYellow}>Model: </Text>
          <input 
            type="text" 
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="Enter model name..."
          />
        </Box>
        <Box marginTop={1} flexDirection="row">
          <Text color={Colors.AccentBlue}>Press Enter to Confirm: </Text>
          <Text>{customModel || "No model entered"}</Text>
        </Box>
        <Box marginTop={1} flexDirection="row" gap={1}>
          <Text color={Colors.AccentGreen} bold>Enter</Text>
          <Text>to submit, </Text>
          <Text color={Colors.AccentRed} bold>Esc</Text>
          <Text>to cancel</Text>
        </Box>
      </Box>
    );
  }

  // This shouldn't happen with current flow, but included for completeness
  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Configuration Complete</Text>
      <Box marginTop={1}>
        <Text>Provider: {selectedProvider}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Model: {selectedModel || customModel}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Base URL: {customBaseUrl}</Text>
      </Box>
      <Box marginTop={1} flexDirection="row" gap={1}>
        <Text color={Colors.AccentGreen} bold>Enter</Text>
        <Text>to continue, </Text>
        <Text color={Colors.AccentRed} bold>Esc</Text>
        <Text>to cancel</Text>
      </Box>
    </Box>
  );
}