# Model Provider Integration

This document describes the dynamic model discovery system for OpenAI-compatible providers.

## Overview

The codebase now supports **dynamic model fetching** from OpenAI-compatible API endpoints. Instead of hard-coding model lists, the system automatically queries the `/v1/models` endpoint on initialization and caches the results for 24 hours.

## Supported Providers

### 1. **OpenAI** (87+ models)

- **Base URL:** `https://api.openai.com/v1`
- **Env Vars:** `OPENAI_API_KEY`, `OPENAI_BASE_URL`
- **Models Include:** GPT-4, GPT-3.5, GPT-5 Codex, embeddings, audio models

### 2. **NVIDIA** (165+ models)

- **Base URL:** `https://integrate.api.nvidia.com/v1`
- **Env Vars:** `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`
- **Models Include:**
  - `openai/gpt-oss-120b` - Open source GPT model
  - `nvidia/llama-3.1-nemotron-70b-instruct`
  - `nvidia/llama-3.3-nemotron-super-70b-instruct`
  - `meta/llama-3.1-405b-instruct`
  - `google/gemma-2-27b-it`
  - 160+ more models from various providers

### 3. **OpenRouter** (400+ models)

- **Base URL:** `https://openrouter.ai/api/v1`
- **Env Vars:** `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`
- **Models Include:**
  - All major models from Anthropic, OpenAI, Google, DeepSeek, Meta, Mistral, xAI, Qwen
  - `anthropic/claude-sonnet-4.5`
  - `openai/gpt-5-codex`
  - `deepseek/deepseek-v3.1-terminus`
  - `x-ai/grok-4-fast`
  - `google/gemini-2.5-flash-preview-09-2025`
  - 400+ more models

### 4. **Kilo Code**

- **Base URL:** `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1`
- **Env Vars:** `KILO_API_KEY`, `KILO_BASE_URL`
- **Models Include:** GPT-5, Claude 4, Gemini 2.5 Pro, Qwen3 Coder, DeepSeek models

### 5. **Harmony (Azure Rendering Orchestrator)**

- **Base URL:** `https://YOUR_AZURE_RESOURCE.openai.azure.com`
- **Env Vars:** `HARMONY_API_KEY` (Azure API key), `HARMONY_BASE_URL` (your Azure OpenAI endpoint)
- **Models Include:** GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo via Azure OpenAI
- **Note:** Harmony acts as an Azure OpenAI rendering orchestrator. Configure `HARMONY_BASE_URL` with your Azure resource endpoint.

## How It Works

### Initialization

```typescript
import { initializeModelRegistry, listModels } from '@wren-coder/wren-coder-cli-core';

// Call this on app startup
await initializeModelRegistry();

// Now get all models (built-in + dynamic)
const models = listModels();
```

### Model Discovery Flow

1. **On startup**, `initializeModelRegistry()` is called
2. For each configured provider (with API key set):
   - Fetches `/v1/models` endpoint
   - Parses model list
   - Infers token limits and capabilities
   - Caches results to `.wren/cache/<provider>-<hash>.json`
3. Cache expires after 24 hours
4. Models are merged with built-in model definitions

### Model Metadata Inference

The system automatically infers:

- **Token Limits**: Based on model name patterns (32k, 64k, 128k, 200k)
- **Capabilities**:
  - `reasoning`: Models with "reasoner", "thinking", "o1", "o3", "r1" in name
  - `vision`: Models with "vision", "gpt-4o", "claude-3", "gemini", "grok" in name
  - `embedding`: Models with "embedding" or "embed" in name
  - `streaming`: Enabled for all models by default
  - `functionCalling`: Enabled for non-embedding models

## Environment Variables

Set these to enable dynamic model fetching:

```bash
# OpenAI
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://api.openai.com/v1"  # Optional, uses default

# OpenRouter
export OPENROUTER_API_KEY="sk-or-v1-..."
export OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"  # Optional

# NVIDIA
export NVIDIA_API_KEY="nvapi-..."
export NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"  # Optional

# Kilo
export KILO_API_KEY="..."
export KILO_BASE_URL="https://api.kilo.ai/v1"  # Optional
```

## Cache Management

```typescript
import { clearModelCache, clearAllModelCaches } from '@wren-coder/wren-coder-cli-core';

// Clear cache for specific provider
clearModelCache('https://api.openai.com/v1', Providers.OPENAI);

// Clear all caches
clearAllModelCaches();
```

Cache files are stored in `.wren/cache/` with format: `<provider>-<base64url-hash>.json`

## Testing

Test the API endpoints directly:

```bash
node test-model-api.js
```

This will:

- Check which API keys are configured
- Fetch models from each provider
- Display sample models
- Show any errors

## Static Model Definitions

The codebase still includes static model definitions in:

- `packages/core/src/config/providers/openai.ts`
- `packages/core/src/config/providers/nvidia.ts`
- `packages/core/src/config/providers/openrouter.ts`
- `packages/core/src/config/providers/kilo.ts`

These serve as fallbacks when API keys are not configured and provide additional metadata.

## Custom Models

You can also define custom models in `.wren/models.json`:

```json
{
  "models": [
    {
      "name": "my-custom-model",
      "tokenLimit": 128000,
      "description": "My custom model",
      "provider": "custom-provider",
      "capabilities": {
        "reasoning": true,
        "streaming": true,
        "functionCalling": true
      }
    }
  ]
}
```
