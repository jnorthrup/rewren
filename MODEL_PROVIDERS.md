# Model Provider Integration

This document describes the dynamic model discovery system and provider architecture for Wren Coder's multi-provider AI orchestration system.

## Overview

Wren Coder supports **dynamic model fetching** from 15+ AI providers. Instead of hard-coding model lists, the system automatically queries provider `/v1/models` endpoints on initialization and caches results for 5 hours.

**Key Features:**

- Automatic model discovery from provider APIs
- 5-hour caching for performance
- 600+ models across all providers
- Intelligent capability detection
- Provider-specific format handling

## Supported Providers

### Primary Providers

#### 1. OpenAI (87+ models)

- **Base URL:** `https://api.openai.com/v1`
- **Env Vars:** `OPENAI_API_KEY`, `OPENAI_BASE_URL`
- **Models Include:** GPT-4o, GPT-4-turbo, GPT-3.5-turbo, o1, o3, embeddings, audio models
- **Features:** Vision, function calling, streaming, reasoning models
- **Get API Key:** [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)

#### 2. Anthropic Claude (10+ models)

- **Base URL:** `https://api.anthropic.com/v1`
- **Env Vars:** `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`, `ANTHROPIC_BASE_URL`
- **Models Include:** Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku
- **Features:** Vision, function calling, streaming, long context (200k tokens)
- **Get API Key:** [https://console.anthropic.com/](https://console.anthropic.com/)

#### 3. Google Gemini

- **Base URL:** Native Google AI Studio API (not OpenAI-compatible)
- **Env Vars:** `GEMINI_API_KEY`
- **Models Include:** Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini 2.0, Gemini Thinking
- **Features:** Vision, function calling, streaming, massive context (2M tokens), native multimodal
- **Get API Key:** [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

#### 4. Google Vertex AI

- **Base URL:** Native Vertex AI API
- **Env Vars:** `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_API_KEY` (or ADC)
- **Authentication:** Application Default Credentials or API key
- **Models Include:** All Gemini models via Google Cloud
- **Features:** Enterprise features, VPC-SC, private endpoints, quota management
- **Get Started:** [https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys](https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys)

### OpenAI-Compatible Providers

#### 5. NVIDIA NIM (165+ models)

- **Base URL:** `https://integrate.api.nvidia.com/v1`
- **Env Vars:** `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`
- **Get API Key:** [https://build.nvidia.com/](https://build.nvidia.com/)
- **Models Include:**
  - `openai/gpt-oss-120b` - Open source GPT with Harmony format (multi-channel reasoning)
  - `nvidia/llama-3.1-nemotron-70b-instruct` - NVIDIA's instruction-tuned Llama
  - `nvidia/llama-3.3-nemotron-super-70b-instruct` - Enhanced Nemotron variant
  - `meta/llama-3.1-405b-instruct` - Meta's largest Llama model
  - `google/gemma-2-27b-it` - Google's Gemma via NVIDIA
  - `mistralai/mixtral-8x7b-instruct-v0.1` - Mistral MoE model
  - `microsoft/phi-3-medium-128k-instruct` - Microsoft Phi-3
  - 160+ more models from Meta, Mistral, DeepSeek, Microsoft, Google, etc.
- **Features:** Extensive catalog, ultra-fast inference, free tier, reasoning models
- **Special Format:** GPT-OSS uses Harmony format with analysis/commentary/final channels

#### 6. DeepSeek (10+ models)

- **Base URL:** `https://api.deepseek.com/v1`
- **Env Vars:** `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`
- **Get API Key:** [https://platform.deepseek.com/](https://platform.deepseek.com/)
- **Models Include:**
  - `deepseek-chat` - General conversation model
  - `deepseek-reasoner` (R1) - Advanced reasoning with extended thinking
  - `deepseek-coder` - Code-optimized variant
  - DeepSeek-V3 series
- **Features:** Advanced reasoning, competitive pricing, function calling, code generation
- **Special:** DeepSeek-R1 supports extended reasoning similar to o1

#### 7. OpenRouter (400+ models)

- **Base URL:** `https://openrouter.ai/api/v1`
- **Env Vars:** `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`
- **Get API Key:** [https://openrouter.ai/keys](https://openrouter.ai/keys)
- **Models Include:**
  - All major models from Anthropic, OpenAI, Google, Meta, xAI, DeepSeek, Mistral
  - `anthropic/claude-sonnet-4.5` - Latest Claude via OpenRouter
  - `openai/gpt-5-codex` - GPT-5 Codex (when available)
  - `deepseek/deepseek-v3.1-terminus` - Latest DeepSeek variants
  - `x-ai/grok-4-fast` - xAI Grok models
  - `google/gemini-2.5-flash-preview-09-2025` - Latest Gemini previews
  - 400+ more models with unified pricing and API
- **Features:** Unified access, automatic failover, pay-as-you-go across providers

#### 8. Groq (15+ models)

- **Base URL:** `https://api.groq.com/openai/v1`
- **Env Vars:** `GROQ_API_KEY`, `GROQ_BASE_URL`
- **Get API Key:** [https://console.groq.com/](https://console.groq.com/)
- **Models Include:** Llama 3.3, Mixtral 8x7B, Gemma 2 (ultra-fast inference on LPU)
- **Features:** Fastest inference in the world, low latency, free tier
- **Speed:** 500+ tokens/second, <100ms time-to-first-token

#### 9. Kilo Code

- **Base URL:** `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1`
- **Env Vars:** `KILO_API_KEY`, `KILO_BASE_URL`
- **Models Include:** GPT-5, Claude 4, Gemini 2.5 Pro, Qwen3 Coder, DeepSeek variants
- **Features:** Cutting-edge model access, code-optimized models
- **Note:** Provides early access to unreleased model versions

### Regional Providers

#### 10. Qwen (Alibaba Cloud) (20+ models)

- **Base URL:** `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- **Env Vars:** `QWEN_API_KEY` (`DASHSCOPE_API_KEY` alias), `QWEN_BASE_URL`
- **Authentication:** API key (production-ready), OAuth (implementation in progress)
- **Get API Key:** [https://dashscope.aliyuncs.com/](https://dashscope.aliyuncs.com/)
- **Models Include:**
  - `qwen3-coder` - Latest code generation model with advanced agentic capabilities
  - `qwen2.5-coder-32b-instruct` - Code-optimized model with 32B parameters
  - `qwq-32b-preview` - Reasoning model (QwQ - Question with Question approach)
  - `qwen2.5-72b-instruct` - General instruction following with 72B parameters
  - `qwen2.5-32b-instruct` - Balanced performance model
  - `qwen2.5-14b-instruct` - Efficient model for resource-constrained environments
- **Features:** Strong multilingual support (Chinese/English), advanced code generation, mathematical reasoning, function calling, streaming
- **Compliance:** China data residency compliance, enterprise security features
- **Performance:** Competitive inference speeds, optimized for both coding and general tasks

#### 11. Moonshot AI (Kimi) (5+ models)

- **Base URL:** `https://api.moonshot.ai/v1`
- **Env Vars:** `MOONSHOT_API_KEY` or `KIMI_API_KEY`, `MOONSHOT_BASE_URL`
- **Get API Key:** [https://platform.moonshot.cn/](https://platform.moonshot.cn/)
- **Models Include:**
  - `moonshot-v1-8k` - Standard context model
  - `moonshot-v1-32k` - Extended context
  - `moonshot-v1-128k` - Long context variant
  - `moonshotai/kimi2` - Latest version (via NVIDIA)
- **Features:** Long context, reasoning, Chinese language optimization

#### 12. Mistral AI (10+ models)

- **Base URL:** `https://api.mistral.ai/v1`
- **Env Vars:** `MISTRAL_API_KEY`, `MISTRAL_BASE_URL`
- **Get API Key:** [https://console.mistral.ai/](https://console.mistral.ai/)
- **Models Include:**
  - `mistral-large-latest` - Flagship model
  - `mistral-medium-latest` - Balanced performance
  - `codestral-latest` - Code generation specialist
  - `mixtral-8x7b-instruct` - MoE architecture
- **Features:** European provider, strong multilingual, code generation, function calling

#### 13. Cohere (10+ models)

- **Base URL:** `https://api.cohere.ai/v1`
- **Env Vars:** `COHERE_API_KEY`, `COHERE_BASE_URL`
- **Get API Key:** [https://dashboard.cohere.com/](https://dashboard.cohere.com/)
- **Models Include:**
  - `command-r-plus` - Advanced reasoning and RAG
  - `command-r` - General purpose
  - `command` - Fast inference
- **Features:** RAG-optimized, enterprise features, embeddings, reranking

### Additional Providers

#### 14. xAI (Grok) (5+ models)

- **Base URL:** `https://api.x.ai/v1`
- **Env Vars:** `XAI_API_KEY` or `GROK_API_KEY`, `XAI_BASE_URL`
- **Get API Key:** [https://console.x.ai/](https://console.x.ai/)
- **Models Include:**
  - `grok-2-latest` - Latest Grok model
  - `grok-2-vision-latest` - Multimodal variant
  - `grok-beta` - Beta access to new features
- **Features:** Real-time X (Twitter) data access, vision, humor mode

#### 15. Cerebras (3+ models)

- **Base URL:** `https://api.cerebras.ai/v1`
- **Env Vars:** `CEREBRAS_API_KEY`, `CEREBRAS_BASE_URL`
- **Get API Key:** [https://cloud.cerebras.ai/](https://cloud.cerebras.ai/)
- **Models Include:** Llama 3.1 8B, 70B (world's fastest inference on WSE)
- **Features:** Ultra-fast inference (1000+ tokens/sec), large context, wafer-scale engine
- **Speed:** Fastest open-source model inference available

#### 16. Hugging Face (1000+ models)

- **Base URL:** `https://router.huggingface.co/v1`
- **Env Vars:** `HUGGINGFACE_API_KEY`, `HUGGINGFACE_BASE_URL`
- **Get API Key:** [https://huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
- **Models Include:** Thousands of open-source models via serverless inference
- **Features:** Access to entire HF Hub, custom model deployment, free tier

#### 17. Perplexity (5+ models)

- **Base URL:** `https://api.perplexity.ai`
- **Env Vars:** `PERPLEXITY_API_KEY`, `PERPLEXITY_BASE_URL`
- **Get API Key:** [https://www.perplexity.ai/settings/api](https://www.perplexity.ai/settings/api)
- **Models Include:**
  - `sonar` - Web-augmented responses
  - `sonar-pro` - Enhanced with real-time search
- **Features:** Real-time web search, citations, fact-checking

### IDE Integration

#### 18. VSCode LLM Provider

- **Base URL:** Local IDE server (default: `http://localhost:3000`)
- **Env Vars:** `VSCODE_LLM_PAT`, `WREN_IDE_SERVER_PORT`
- **Requirements:** Wren VSCode IDE Companion extension
- **Models Include:** Models available in VSCode (GitHub Copilot, etc.)
- **Features:** Seamless IDE integration, context from open files, workspace awareness

### Special Providers

#### 19. Harmony (Azure OpenAI Orchestrator)

- **Base URL:** `https://YOUR_AZURE_RESOURCE.openai.azure.com`
- **Env Vars:** `HARMONY_API_KEY` (Azure API key), `HARMONY_BASE_URL` (Azure endpoint)
- **Models Include:** GPT-4o, GPT-4o Mini, GPT-4-turbo, GPT-3.5-turbo via Azure OpenAI
- **Features:** Multi-channel reasoning (analysis/commentary/final), Azure enterprise features
- **Special Format:** Harmony provides structured COT output across three channels:
  - **Analysis:** Step-by-step reasoning (hidden from user by default)
  - **Commentary:** Meta-reasoning about tool usage
  - **Final:** User-facing output

**Enable Harmony COT Debugging:**

```bash
export WREN_DEBUG_COT=true        # Log COT to stderr
export WREN_COT_LOG_FILE=/path    # Future: write to file
```

See [COT_LOGGING.md](COT_LOGGING.md) for format details.

## How It Works

### Initialization Flow

```typescript
import { initializeModelRegistry, listModels } from '@wren-coder/wren-coder-cli-core';

// Call on app startup
await initializeModelRegistry();

// Get all models (built-in + dynamically discovered)
const models = listModels();
```

### Model Discovery Process

1. **On startup**, `initializeModelRegistry()` is called
2. For each configured provider (with API key set):
   - Fetches `GET /v1/models` endpoint
   - Parses model list and metadata
   - Infers token limits and capabilities from model names
   - Caches results to `.wren/cache/<provider>-<base64url-hash>.json`
3. Cache expires after 5 hours
4. Models are merged with built-in static model definitions
5. Provider tree is initialized with discovered models

### Model Metadata Inference

The system automatically infers capabilities from model names:

#### Token Limits

- **128k:** Models with "128k" in name
- **200k:** Models with "200k" in name or Claude 3.x
- **32k:** Models with "32k" in name
- **64k:** Models with "64k" in name
- **Default:** 4096 if not specified

#### Capabilities

- **Reasoning:** Models with "reasoner", "thinking", "o1", "o3", "r1", "qwq" in name
- **Vision:** Models with "vision", "gpt-4o", "claude-3", "gemini", "grok" in name
- **Embedding:** Models with "embedding" or "embed" in name
- **Streaming:** Enabled for all models by default
- **Function Calling:** Enabled for non-embedding models (disabled for GPT-OSS responses API)

### Cache Behavior

**Cache Location:** `.wren/cache/<provider>-<hash>.json`

**Cache Format:**

```json
{
  "timestamp": "2025-10-19T12:00:00.000Z",
  "baseUrl": "https://api.openai.com/v1",
  "provider": "openai",
  "models": [
    {
      "name": "gpt-4o",
      "tokenLimit": 128000,
      "capabilities": {
        "vision": true,
        "functionCalling": true,
        "streaming": true
      }
    }
  ]
}
```

**Cache Expiration:** 5 hours from creation

**Manual Cache Management:**

```typescript
import { clearModelCache, clearAllModelCaches } from '@wren-coder/wren-coder-cli-core';

// Clear specific provider cache
clearModelCache('https://api.openai.com/v1', Providers.OPENAI);

// Clear all caches
clearAllModelCaches();
```

**CLI Cache Management:**

```bash
# Clear specific provider
rm .wren/cache/openai-*.json

# Clear all caches
rm -rf .wren/cache/

# View cache contents
cat .wren/cache/*.json | jq .
```

## Environment Variables

Set these to enable dynamic model fetching:

```bash
# OpenAI
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://api.openai.com/v1"  # Optional

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
export ANTHROPIC_BASE_URL="https://api.anthropic.com/v1"  # Optional

# Google Gemini
export GEMINI_API_KEY="AI..."

# Google Vertex AI
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_LOCATION="us-central1"
export GOOGLE_API_KEY="your-vertex-key"  # Alternative to ADC

# NVIDIA
export NVIDIA_API_KEY="nvapi-..."
export NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"  # Optional

# DeepSeek
export DEEPSEEK_API_KEY="sk-..."
export DEEPSEEK_BASE_URL="https://api.deepseek.com/v1"  # Optional

# OpenRouter
export OPENROUTER_API_KEY="sk-or-v1-..."
export OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"  # Optional

# Groq
export GROQ_API_KEY="gsk_..."
export GROQ_BASE_URL="https://api.groq.com/openai/v1"  # Optional

# Kilo
export KILO_API_KEY="..."
export KILO_BASE_URL="https://oai.endpoints.kepler.ai.cloud.ovh.net/v1"  # Optional

# Qwen
export QWEN_API_KEY="sk-..."
export QWEN_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"  # Optional

# Moonshot AI
export MOONSHOT_API_KEY="sk-..."
export MOONSHOT_BASE_URL="https://api.moonshot.ai/v1"  # Optional

# Mistral
export MISTRAL_API_KEY="..."
export MISTRAL_BASE_URL="https://api.mistral.ai/v1"  # Optional

# Cohere
export COHERE_API_KEY="..."
export COHERE_BASE_URL="https://api.cohere.ai/v1"  # Optional

# xAI (Grok)
export XAI_API_KEY="xai-..."
export XAI_BASE_URL="https://api.x.ai/v1"  # Optional

# Cerebras
export CEREBRAS_API_KEY="csk-..."
export CEREBRAS_BASE_URL="https://api.cerebras.ai/v1"  # Optional

# Hugging Face
export HUGGINGFACE_API_KEY="hf_..."
export HUGGINGFACE_BASE_URL="https://router.huggingface.co/v1"  # Optional

# Perplexity
export PERPLEXITY_API_KEY="pplx-..."
export PERPLEXITY_BASE_URL="https://api.perplexity.ai"  # Optional

# Harmony (Azure OpenAI)
export HARMONY_API_KEY="your-azure-key"
export HARMONY_BASE_URL="https://your-resource.openai.azure.com"

# VSCode Integration
export VSCODE_LLM_PAT="your-pat-token"
export WREN_IDE_SERVER_PORT="3000"  # Optional
```

## Static Model Definitions

The codebase includes static model definitions as fallbacks when API keys are not configured:

- `packages/core/src/config/providers/openai.ts` - OpenAI models
- `packages/core/src/config/providers/anthropic.ts` - Claude models
- `packages/core/src/config/providers/google.ts` - Gemini models
- `packages/core/src/config/providers/nvidia.ts` - NVIDIA NIM models
- `packages/core/src/config/providers/deepseek.ts` - DeepSeek models
- `packages/core/src/config/providers/openrouter.ts` - OpenRouter aggregated models
- `packages/core/src/config/providers/kilo.ts` - Kilo models
- `packages/core/src/config/providers/qwen.ts` - Qwen models
- `packages/core/src/config/providers/mistral.ts` - Mistral models
- `packages/core/src/config/providers/cohere.ts` - Cohere models
- `packages/core/src/config/providers/meta.ts` - Llama models

These provide:

- Model metadata and descriptions
- Default token limits
- Capability flags
- Provider-specific parameters
- Reasoning configuration

## Custom Models

Define custom models in `.wren/models.json`:

```json
{
  "models": [
    {
      "name": "my-custom-model",
      "tokenLimit": 128000,
      "description": "My custom fine-tuned model",
      "provider": "custom-provider",
      "capabilities": {
        "reasoning": true,
        "streaming": true,
        "functionCalling": true
      },
      "reasoning": {
        "effort": "high",
        "max_tokens": 8192
      },
      "verbosity": "medium",
      "includeReasoning": true
    }
  ]
}
```

## Testing Model Discovery

Test the dynamic discovery system:

```bash
# Set API keys
export OPENAI_API_KEY="sk-..."
export NVIDIA_API_KEY="nvapi-..."

# Run test script
node scripts/test-model-discovery.mjs

# Output will show:
# - Which providers are configured
# - Models fetched from each provider
# - Cache file locations
# - Any errors encountered
```

## Provider Architecture

### ProviderTreeRoot

The system uses a hierarchical tree structure to manage providers:

```
ProviderTreeRoot
├── QuotaNode (identity)
│   ├── ProviderNode (OpenAI)
│   │   ├── ConfigNode
│   │   ├── ModelsNode
│   │   │   └── ModelNode[] (individual models)
│   │   ├── UsageNode (quota tracking)
│   │   └── MetricsNode (performance, Bayesian scoring)
│   ├── ProviderNode (NVIDIA)
│   │   └── ...
│   └── ProviderNode (DeepSeek)
│       └── ...
```

**Key Components:**

- **ProviderNode:** Provider-level configuration, API key management
- **ModelNode:** Individual model with metrics tracking
- **MetricsNode:** Performance tracking with Bayesian ranking
- **UsageNode:** Quota limits and tracking (future)

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation.

## Bayesian Ranking

The system implements Bayesian scoring for provider/model selection based on:

- Success rate
- Average latency
- Historical performance

**Test Bayesian ranking:**

```bash
node scripts/test-bayesian-ranking.mjs
```

See [CLAUDE.md](CLAUDE.md) for algorithm details.

## ContentGenerator Pattern

Different providers use different ContentGenerator implementations:

- **OpenAIContentGenerator:** OpenAI-compatible APIs (OpenAI, NVIDIA, DeepSeek, etc.)
- **HarmonyContentGenerator:** Azure OpenAI with multi-channel reasoning
- **ReasoningContentGenerator:** Wrapper for reasoning models (o1, o3, r1)
- **GeminiContentGenerator:** Native Google Gemini SDK
- **ProviderFailoverContentGenerator:** Automatic failover between providers

## Provider-Specific Notes

### OpenAI

- Most widely compatible format
- Reference implementation for OpenAI-compatible providers
- Support for o1/o3 reasoning models with extended thinking

### Anthropic

- Native Anthropic SDK (not OpenAI-compatible)
- 200k context window
- Strong vision capabilities
- Claude 3.5 Sonnet recommended for coding

### Google Gemini

- Native multimodal from ground up
- 2M token context window (longest available)
- Gemini 1.5 Pro recommended for complex tasks
- Gemini Thinking for reasoning tasks

### NVIDIA NIM

- Largest model catalog (165+ models)
- Hosts models from multiple providers
- Free tier available
- GPT-OSS models use Harmony format (special handling required)
- Some models require terms acceptance in NVIDIA Build interface

### DeepSeek

- DeepSeek-R1 competitive with o1 for reasoning
- Very cost-effective
- Strong code generation
- DeepSeek-V3 for general tasks

### OpenRouter

- Unified API for 400+ models
- Automatic routing and failover
- Pay-as-you-go across providers
- Single API key for all providers

### Groq

- Fastest inference (500+ tok/sec)
- Free tier with generous limits
- Limited model selection (Llama, Mixtral, Gemma)
- Best for high-throughput applications

### Cerebras

- World's fastest inference on WSE
- 1000+ tokens/second
- Large context support
- Open-source Llama models only

## Troubleshooting

### Models Not Discovered

1. Verify API key is set: `echo $OPENAI_API_KEY`
2. Check cache directory: `ls -la .wren/cache/`
3. Clear cache: `rm -rf .wren/cache/`
4. Test endpoint manually:

   ```bash
   curl -H "Authorization: Bearer $OPENAI_API_KEY" \
        https://api.openai.com/v1/models
   ```

### Cache Issues

1. Clear specific provider: `rm .wren/cache/openai-*.json`
2. Clear all caches: `rm -rf .wren/cache/`
3. Check file permissions: `ls -la .wren/cache/`
4. Verify cache location is writable

### Provider-Specific Issues

- **NVIDIA:** API key must start with `nvapi-`, some models require terms acceptance
- **Azure/Harmony:** Base URL must include resource and deployment ID
- **Google Vertex:** Requires project setup and API enablement
- **VSCode:** Requires IDE companion extension installed and running

## See Also

- [AUTHENTICATION.md](AUTHENTICATION.md) - Complete authentication guide for all providers
- [CLAUDE.md](CLAUDE.md) - Project architecture and development guide
- [COT_LOGGING.md](COT_LOGGING.md) - Chain of Thought logging format
- [docs/cli/authentication.md](docs/cli/authentication.md) - Legacy Gemini authentication docs
- [docs/troubleshooting.md](docs/troubleshooting.md) - Troubleshooting guide
