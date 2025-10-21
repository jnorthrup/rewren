# Authentication Guide

This document provides comprehensive authentication and configuration instructions for all providers supported by Wren Coder.

## Overview

Wren Coder is a multi-provider AI orchestration system that supports 15+ AI providers. API keys are **NEVER stored in files** - only in environment variables using the pattern:

```bash
<PROVIDER>_API_KEY="your-key-here"
<PROVIDER>_BASE_URL="provider-endpoint"  # Optional for most providers
```

## Quick Start

1. Choose your provider(s)
2. Set the appropriate environment variables
3. Run `wren` to start the CLI

The system will automatically discover available models from providers with configured API keys.

## Supported Providers

### Primary Providers

#### OpenAI
- **API Key Variable:** `OPENAI_API_KEY`
- **Base URL Variable:** `OPENAI_BASE_URL` (optional)
- **Default Base URL:** `https://api.openai.com/v1`
- **Get API Key:** [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Models:** GPT-4o, GPT-4-turbo, GPT-3.5-turbo, o1, o3
- **Features:** Vision, function calling, streaming, reasoning models

**Setup:**
```bash
export OPENAI_API_KEY="sk-..."
# Optional: only needed for custom endpoints
export OPENAI_BASE_URL="https://api.openai.com/v1"
```

#### Anthropic (Claude)
- **API Key Variable:** `ANTHROPIC_API_KEY`
- **Alternative:** `CLAUDE_API_KEY` (alias)
- **Base URL Variable:** `ANTHROPIC_BASE_URL` (optional)
- **Default Base URL:** `https://api.anthropic.com/v1`
- **Get API Key:** [https://console.anthropic.com/](https://console.anthropic.com/)
- **Models:** Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku
- **Features:** Vision, function calling, streaming

**Setup:**
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
# OR
export CLAUDE_API_KEY="sk-ant-..."
```

#### Google Gemini
- **API Key Variable:** `GEMINI_API_KEY`
- **Base URL:** Native Google Gemini API (not OpenAI-compatible)
- **Get API Key:** [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- **Models:** Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini 2.0
- **Features:** Vision, function calling, streaming, large context windows

**Setup:**
```bash
export GEMINI_API_KEY="AI..."
```

#### Google Vertex AI
- **Project Variable:** `GOOGLE_CLOUD_PROJECT`
- **Location Variable:** `GOOGLE_CLOUD_LOCATION` (e.g., `us-central1`)
- **API Key Variable:** `GOOGLE_API_KEY` (alternative to ADC)
- **Authentication:** Uses Application Default Credentials (ADC) or API key
- **Models:** Gemini models via Vertex AI
- **Get Started:** [https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys](https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys)

**Setup with ADC:**
```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_LOCATION="us-central1"
```

**Setup with API Key:**
```bash
export GOOGLE_API_KEY="your-vertex-api-key"
export GOOGLE_CLOUD_PROJECT="your-project-id"
```

### OpenAI-Compatible Providers

#### NVIDIA NIM
- **API Key Variable:** `NVIDIA_API_KEY`
- **Base URL Variable:** `NVIDIA_BASE_URL` (optional)
- **Default Base URL:** `https://integrate.api.nvidia.com/v1`
- **Get API Key:** [https://build.nvidia.com/](https://build.nvidia.com/)
- **Models:** 165+ models including Llama, Nemotron, GPT-OSS, Mistral, Qwen
- **Features:** Extensive model catalog, reasoning models, function calling
- **Special:** GPT-OSS models use Harmony format with multi-channel reasoning

**Setup:**
```bash
export NVIDIA_API_KEY="nvapi-..."
```

**Notes:**
- NVIDIA hosts models from multiple providers (Meta, Mistral, DeepSeek, etc.)
- `openai/gpt-oss-120b` uses special Harmony rendering format (analysis/commentary/final channels)
- Enable COT debugging: `export WREN_DEBUG_COT=true`

#### DeepSeek
- **API Key Variable:** `DEEPSEEK_API_KEY`
- **Base URL Variable:** `DEEPSEEK_BASE_URL` (optional)
- **Default Base URL:** `https://api.deepseek.com/v1`
- **Get API Key:** [https://platform.deepseek.com/](https://platform.deepseek.com/)
- **Models:** DeepSeek-V3, DeepSeek-R1 (reasoner), DeepSeek-Coder
- **Features:** Advanced reasoning, function calling, code generation

**Setup:**
```bash
export DEEPSEEK_API_KEY="sk-..."
```

#### OpenRouter
- **API Key Variable:** `OPENROUTER_API_KEY`
- **Base URL Variable:** `OPENROUTER_BASE_URL` (optional)
- **Default Base URL:** `https://openrouter.ai/api/v1`
- **Get API Key:** [https://openrouter.ai/keys](https://openrouter.ai/keys)
- **Models:** 400+ models from all major providers
- **Features:** Unified access to Anthropic, OpenAI, Google, Meta, xAI, and more

**Setup:**
```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
```

**Notes:**
- Access models from multiple providers through a single API
- Automatic failover and model routing
- Pay-as-you-go pricing across providers

#### Groq
- **API Key Variable:** `GROQ_API_KEY`
- **Base URL Variable:** `GROQ_BASE_URL` (optional)
- **Default Base URL:** `https://api.groq.com/openai/v1`
- **Get API Key:** [https://console.groq.com/](https://console.groq.com/)
- **Models:** Llama 3, Mixtral, Gemma (ultra-fast inference)
- **Features:** Extremely low latency, function calling

**Setup:**
```bash
export GROQ_API_KEY="gsk_..."
```

#### Kilo Code
- **API Key Variable:** `KILO_API_KEY`
- **Base URL Variable:** `KILO_BASE_URL` (optional)
- **Default Base URL:** `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1`
- **Models:** GPT-5, Claude 4, Gemini 2.5 Pro, Qwen3 Coder
- **Features:** Cutting-edge models, code-optimized variants

**Setup:**
```bash
export KILO_API_KEY="your-kilo-key"
```

### Regional Providers

#### Qwen (Alibaba Cloud)
- **API Key Variable:** `QWEN_API_KEY`
- **Base URL Variable:** `QWEN_BASE_URL` (optional)
- **Default Base URL:** `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- **Get API Key:** [https://dashscope.aliyuncs.com/](https://dashscope.aliyuncs.com/)
- **Models:** Qwen2.5, QwQ (reasoning), Qwen-Coder
- **Features:** Code generation, reasoning, multilingual support

**Setup:**
```bash
export QWEN_API_KEY="sk-..."
```

#### Moonshot AI (Kimi)
- **API Key Variable:** `MOONSHOT_API_KEY`
- **Alternative:** `KIMI_API_KEY` (alias)
- **Base URL Variable:** `MOONSHOT_BASE_URL` (optional)
- **Default Base URL:** `https://api.moonshot.ai/v1`
- **Get API Key:** [https://platform.moonshot.cn/](https://platform.moonshot.cn/)
- **Models:** Moonshot-v1, Kimi2 (via NVIDIA)
- **Features:** Long context, reasoning

**Setup:**
```bash
export MOONSHOT_API_KEY="sk-..."
# OR
export KIMI_API_KEY="sk-..."
```

#### Mistral AI
- **API Key Variable:** `MISTRAL_API_KEY`
- **Base URL Variable:** `MISTRAL_BASE_URL` (optional)
- **Default Base URL:** `https://api.mistral.ai/v1`
- **Get API Key:** [https://console.mistral.ai/](https://console.mistral.ai/)
- **Models:** Mistral Large, Mistral Medium, Codestral
- **Features:** Code generation, function calling, multilingual

**Setup:**
```bash
export MISTRAL_API_KEY="..."
```

#### Cohere
- **API Key Variable:** `COHERE_API_KEY`
- **Base URL Variable:** `COHERE_BASE_URL` (optional)
- **Default Base URL:** `https://api.cohere.ai/v1`
- **Get API Key:** [https://dashboard.cohere.com/](https://dashboard.cohere.com/)
- **Models:** Command R+, Command R, Command
- **Features:** RAG-optimized, function calling, embeddings

**Setup:**
```bash
export COHERE_API_KEY="..."
```

### Additional Providers

#### xAI (Grok)
- **API Key Variable:** `XAI_API_KEY`
- **Alternative:** `GROK_API_KEY` (alias)
- **Base URL Variable:** `XAI_BASE_URL` (optional)
- **Default Base URL:** `https://api.x.ai/v1`
- **Get API Key:** [https://console.x.ai/](https://console.x.ai/)
- **Models:** Grok-2, Grok-beta
- **Features:** Real-time information, vision, function calling

**Setup:**
```bash
export XAI_API_KEY="xai-..."
# OR
export GROK_API_KEY="xai-..."
```

#### Cerebras
- **API Key Variable:** `CEREBRAS_API_KEY`
- **Base URL Variable:** `CEREBRAS_BASE_URL` (optional)
- **Default Base URL:** `https://api.cerebras.ai/v1`
- **Get API Key:** [https://cloud.cerebras.ai/](https://cloud.cerebras.ai/)
- **Models:** Llama 3.1 (ultra-fast inference on custom hardware)
- **Features:** World's fastest inference, large context

**Setup:**
```bash
export CEREBRAS_API_KEY="csk-..."
```

#### Hugging Face
- **API Key Variable:** `HUGGINGFACE_API_KEY`
- **Base URL Variable:** `HUGGINGFACE_BASE_URL` (optional)
- **Default Base URL:** `https://router.huggingface.co/v1`
- **Get API Key:** [https://huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
- **Models:** Thousands of open-source models
- **Features:** Serverless inference, model hosting

**Setup:**
```bash
export HUGGINGFACE_API_KEY="hf_..."
```

#### Perplexity
- **API Key Variable:** `PERPLEXITY_API_KEY`
- **Base URL Variable:** `PERPLEXITY_BASE_URL` (optional)
- **Default Base URL:** `https://api.perplexity.ai`
- **Get API Key:** [https://www.perplexity.ai/settings/api](https://www.perplexity.ai/settings/api)
- **Models:** Sonar, Sonar Pro (web-augmented responses)
- **Features:** Real-time web search, citations

**Setup:**
```bash
export PERPLEXITY_API_KEY="pplx-..."
```

### IDE Integration

#### VSCode LLM Provider
- **Token Variable:** `VSCODE_LLM_PAT` (Personal Access Token)
- **Requirements:** Wren VSCode IDE Companion extension installed
- **Server Port:** `WREN_IDE_SERVER_PORT` (default: 3000)
- **Models:** Uses models available in VSCode (GitHub Copilot, etc.)
- **Features:** Seamless IDE integration, context from open files

**Setup:**
1. Install Wren VSCode IDE Companion extension
2. Set Personal Access Token:
   ```bash
   export VSCODE_LLM_PAT="your-pat-token"
   ```
3. Ensure IDE server is running (automatic with extension)

## Environment Variable Configuration

### Using `.env` Files

Wren Coder searches for `.env` files in this order (stops at first match):

1. Current directory and parents:
   - `.wren/.env`
   - `.env`
2. Home directory:
   - `~/.wren/.env`
   - `~/.env`

**Example `.wren/.env`:**
```bash
# Primary Provider
OPENAI_API_KEY="sk-..."

# Alternative Providers
ANTHROPIC_API_KEY="sk-ant-..."
NVIDIA_API_KEY="nvapi-..."
DEEPSEEK_API_KEY="sk-..."

# Regional Providers
QWEN_API_KEY="sk-..."

# Optional: Custom base URLs
OPENAI_BASE_URL="https://api.openai.com/v1"
```

### Project vs Global Configuration

**Project-specific** (takes precedence):
```bash
cd /path/to/project
mkdir -p .wren
echo 'OPENAI_API_KEY="project-specific-key"' > .wren/.env
```

**User-wide** (available everywhere):
```bash
mkdir -p ~/.wren
cat >> ~/.wren/.env <<'EOF'
OPENAI_API_KEY="your-default-key"
ANTHROPIC_API_KEY="sk-ant-..."
NVIDIA_API_KEY="nvapi-..."
EOF
```

### Shell Configuration

Add to `~/.bashrc`, `~/.zshrc`, or `~/.profile`:

```bash
# Wren Coder API Keys
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export NVIDIA_API_KEY="nvapi-..."
export DEEPSEEK_API_KEY="sk-..."

# Reload shell
source ~/.bashrc  # or ~/.zshrc
```

## Provider-Specific Configuration

### Custom Base URLs

Override default base URLs for custom endpoints:

```bash
# Azure OpenAI
export OPENAI_BASE_URL="https://your-resource.openai.azure.com/openai/deployments/your-deployment"
export OPENAI_API_KEY="your-azure-key"

# Local Ollama (OpenAI-compatible)
export OPENAI_BASE_URL="http://localhost:11434/v1"
export OPENAI_API_KEY="ollama"  # Dummy key required

# Custom vLLM endpoint
export OPENAI_BASE_URL="http://your-server:8000/v1"
export OPENAI_API_KEY="your-token"
```

### Harmony Format (Azure/NVIDIA GPT-OSS)

Harmony is an Azure OpenAI rendering orchestrator that provides multi-channel reasoning:

```bash
export HARMONY_API_KEY="your-azure-api-key"
export HARMONY_BASE_URL="https://your-resource.openai.azure.com"
```

**Features:**
- **Analysis Channel:** Step-by-step reasoning (hidden by default)
- **Commentary Channel:** Meta-reasoning about tool usage
- **Final Channel:** User-facing output

**Enable COT Debugging:**
```bash
export WREN_DEBUG_COT=true
```

**Models Using Harmony Format:**
- Azure OpenAI GPT-4o, GPT-4, GPT-3.5
- NVIDIA `openai/gpt-oss-120b`

### Reasoning Models Configuration

For models with extended thinking (o1, o3, r1, DeepSeek-R1):

```bash
# Default reasoning parameters (can be overridden per model)
export REASONING_EFFORT="high"        # low, medium, high
export REASONING_MAX_TOKENS="8192"    # Max tokens for reasoning
export INCLUDE_REASONING="true"       # Include reasoning in response
export VERBOSITY="high"               # low, medium, high
```

## Dynamic Model Discovery

Wren Coder automatically discovers models from configured providers:

### How It Works

1. On startup, `initializeModelRegistry()` fetches `/v1/models` from each provider
2. Results are cached to `.wren/cache/<provider>-<hash>.json`
3. Cache expires after 24 hours
4. Models are merged with built-in static definitions

### Cache Management

**Clear specific provider cache:**
```bash
rm .wren/cache/openai-*.json
```

**Clear all caches:**
```bash
rm -rf .wren/cache/
```

**Programmatic cache clearing:**
```typescript
import { clearModelCache, clearAllModelCaches } from '@wren-coder/wren-coder-cli-core';

clearModelCache('https://api.openai.com/v1', Providers.OPENAI);
clearAllModelCaches();
```

### Model Metadata Inference

The system automatically infers from model names:

- **Token Limits:** 32k, 64k, 128k, 200k patterns
- **Reasoning:** Models with "reasoner", "thinking", "o1", "o3", "r1" in name
- **Vision:** Models with "vision", "gpt-4o", "claude-3", "gemini", "grok" in name
- **Embeddings:** Models with "embedding" or "embed" in name
- **Function Calling:** Enabled for all non-embedding models by default

## Security Best Practices

1. **Never commit API keys** to version control
2. **Use `.gitignore`** to exclude `.env` files:
   ```gitignore
   .env
   .wren/.env
   .wren/cache/
   ```
3. **Rotate keys regularly** and revoke compromised keys immediately
4. **Use project-specific keys** for different environments
5. **Set restrictive file permissions:**
   ```bash
   chmod 600 ~/.wren/.env
   ```
6. **Use environment-specific keys** (dev/staging/prod)
7. **Monitor API usage** through provider dashboards

## Troubleshooting

### Authentication Errors

**"Invalid API key" or "Unauthorized":**
- Verify key is set: `echo $OPENAI_API_KEY`
- Check for extra spaces or quotes
- Ensure key has not expired or been revoked
- Verify correct environment variable name

**"Models not discovered":**
- Check cache: `ls -la .wren/cache/`
- Clear cache and retry: `rm -rf .wren/cache/`
- Verify API key has model listing permissions
- Check network connectivity to provider endpoints

**"Base URL connection failed":**
- Verify base URL format (must end with `/v1` for most providers)
- Check network firewall/proxy settings
- Test endpoint manually: `curl -H "Authorization: Bearer $KEY" https://api.openai.com/v1/models`

### Provider-Specific Issues

**Google Gemini/Vertex:**
- Ensure API is enabled in Google Cloud Console
- Verify project permissions and quotas
- For Workspace accounts, set `GOOGLE_CLOUD_PROJECT`

**NVIDIA NIM:**
- API key must start with `nvapi-`
- Some models require acceptance of terms in NVIDIA Build interface
- GPT-OSS models use different API format (automatically handled)

**Azure OpenAI (Harmony):**
- Base URL must include resource name and deployment ID
- API key format differs from standard OpenAI
- Set both `HARMONY_API_KEY` and `HARMONY_BASE_URL`

## Multiple Provider Strategy

### Failover Configuration

Configure multiple providers for automatic failover:

```bash
# Primary provider
export OPENAI_API_KEY="sk-..."

# Fallback providers
export ANTHROPIC_API_KEY="sk-ant-..."
export DEEPSEEK_API_KEY="sk-..."
```

The system will automatically retry with backup providers if primary fails.

### Cost Optimization

Use different providers for different tasks:

```bash
# Expensive, high-quality tasks
export OPENAI_API_KEY="sk-..."          # GPT-4o

# High-volume, lower-cost tasks
export DEEPSEEK_API_KEY="sk-..."       # DeepSeek-V3

# Ultra-fast inference
export GROQ_API_KEY="gsk_..."          # Groq Llama
export CEREBRAS_API_KEY="csk-..."      # Cerebras
```

### Geographic Optimization

Use regional providers for compliance and latency:

```bash
# China region
export QWEN_API_KEY="sk-..."
export MOONSHOT_API_KEY="sk-..."

# Global
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Getting Help

- **Documentation:** [https://github.com/wren-coder/wren-coder-cli](https://github.com/wren-coder/wren-coder-cli)
- **Troubleshooting Guide:** [docs/troubleshooting.md](docs/troubleshooting.md)
- **Model Providers:** [MODEL_PROVIDERS.md](MODEL_PROVIDERS.md)
- **Issues:** [GitHub Issues](https://github.com/wren-coder/wren-coder-cli/issues)
- **Discord:** [Join our community](https://discord.gg/aUnD2AQgHu)

## Appendix: Complete Environment Variable Reference

| Provider | API Key Variable | Base URL Variable | Default Base URL |
|----------|------------------|-------------------|------------------|
| OpenAI | `OPENAI_API_KEY` | `OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| Anthropic | `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` | `ANTHROPIC_BASE_URL` | `https://api.anthropic.com/v1` |
| Google Gemini | `GEMINI_API_KEY` | - | Native API |
| Google Vertex | `GOOGLE_API_KEY` or ADC | - | Native API |
| NVIDIA | `NVIDIA_API_KEY` | `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` |
| Groq | `GROQ_API_KEY` | `GROQ_BASE_URL` | `https://api.groq.com/openai/v1` |
| Kilo | `KILO_API_KEY` | `KILO_BASE_URL` | `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` |
| Qwen | `QWEN_API_KEY` | `QWEN_BASE_URL` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| Moonshot | `MOONSHOT_API_KEY` or `KIMI_API_KEY` | `MOONSHOT_BASE_URL` | `https://api.moonshot.ai/v1` |
| Mistral | `MISTRAL_API_KEY` | `MISTRAL_BASE_URL` | `https://api.mistral.ai/v1` |
| Cohere | `COHERE_API_KEY` | `COHERE_BASE_URL` | `https://api.cohere.ai/v1` |
| xAI | `XAI_API_KEY` or `GROK_API_KEY` | `XAI_BASE_URL` | `https://api.x.ai/v1` |
| Cerebras | `CEREBRAS_API_KEY` | `CEREBRAS_BASE_URL` | `https://api.cerebras.ai/v1` |
| Hugging Face | `HUGGINGFACE_API_KEY` | `HUGGINGFACE_BASE_URL` | `https://router.huggingface.co/v1` |
| Perplexity | `PERPLEXITY_API_KEY` | `PERPLEXITY_BASE_URL` | `https://api.perplexity.ai` |
| VSCode | `VSCODE_LLM_PAT` | - | Local IDE server |
| Harmony (Azure) | `HARMONY_API_KEY` | `HARMONY_BASE_URL` | Custom Azure endpoint |
