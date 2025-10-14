# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
npm install

# Start the CLI (development mode)
npm start

# Build all packages
npm run build

# Build individual packages
npm run build:packages

# Bundle for distribution
npm run bundle

# Run tests
npm test

# Run tests in CI mode
npm run test:ci

# Run E2E integration tests
npm run test:e2e

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Format code
npm run format

# Clean build artifacts
npm run clean

# Full preflight check (clean, install, format, lint, build, typecheck, test)
npm run preflight
```

## Project Architecture

### Monorepo Structure

This is a **pnpm workspaces monorepo** with three main packages:

- **`packages/core`** - Core functionality, model management, content generation
- **`packages/cli`** - Command-line interface and UI components (React + Ink)
- **`packages/vscode-ide-companion`** - VS Code extension

### Provider & Model System

The codebase implements a **multi-provider AI orchestration system** with dynamic model discovery:

#### Provider Tree Architecture

The system uses a hierarchical tree structure (`ProviderTreeRoot`) to manage providers, models, quotas, and metrics:

```text
ProviderTreeRoot
├── ProviderNode (per provider: OpenAI, NVIDIA, OpenRouter, etc.)
│   ├── PanelNode (optional: UI detail view)
│   ├── ConfigNode (provider configuration)
│   ├── ModelsNode
│   │   └── ModelNode[] (individual models with per-model metrics)
│   ├── UsageNode (quota tracking)
│   └── MetricsNode (performance metrics, Bayesian scoring)
```

**Key Classes** (`packages/core/src/config/providerTreeNodes.ts`):

- `TreeNode` - Abstract base class for all tree nodes
- `ProviderNode` - Provider-level node with API key management
- `ModelNode` - Individual model with metrics tracking
- `MetricsNode` - Performance tracking with Bayesian ranking
- `QuotaNode` - Usage limits and quota enforcement (future)
- `ProviderTreeRoot` - Root node with initialization and provider discovery

**Bayesian Ranking**: The system implements Bayesian scoring for provider/model selection based on success rate, latency, and historical performance. Test with `scripts/test-bayesian-ranking.mjs`.

#### Content Generator Pattern

The system abstracts model providers through the `ContentGenerator` interface:

- **`ContentGenerator`** - Interface for all content generators
- **`OpenAIContentGenerator`** - OpenAI-compatible API handler (supports OpenAI, NVIDIA, OpenRouter, DeepSeek, etc.)
- **`HarmonyContentGenerator`** - Azure OpenAI rendering orchestrator
- **`ReasoningContentGenerator`** - Wrapper for reasoning models (o1, o3, r1 series)
- **`ProviderFailoverContentGenerator`** - Automatic failover between providers

#### Dynamic Model Discovery

Models are **dynamically fetched** from provider `/v1/models` endpoints and cached for 24 hours:

1. On startup, `initializeModelRegistry()` fetches models from configured providers
2. Results cached to `.wren/cache/<provider>-<hash>.json`
3. Token limits and capabilities auto-inferred from model names
4. Supports 600+ models across OpenAI, NVIDIA, OpenRouter, Kilo, Harmony

**Environment Variables** for providers:

```bash
# Each provider uses <PROVIDER>_API_KEY and <PROVIDER>_BASE_URL
OPENAI_API_KEY="sk-..."
NVIDIA_API_KEY="nvapi-..."
OPENROUTER_API_KEY="sk-or-..."
HARMONY_API_KEY="..."
HARMONY_BASE_URL="https://your-azure-resource.openai.azure.com"
```

See `MODEL_PROVIDERS.md` for complete provider configuration.

### Chain of Thought (COT) Logging

GPT-OSS models and Harmony format use **multi-channel reasoning**:

- **Analysis channel** - Step-by-step reasoning (hidden from user by default)
- **Commentary channel** - Meta-reasoning about tool usage
- **Final channel** - User-facing output

**COT Debugging**:

```bash
export WREN_DEBUG_COT=true        # Log COT to stderr
export WREN_COT_LOG_FILE=/path    # Future: write to file
```

See `COT_LOGGING.md` for format details.

### Key Services

- **`ProviderModelCacheService`** - Handles 24-hour model cache
- **`JsonGraphCRUD`** - CRUD operations on provider tree
- **Context Reorganization Service** - Manages conversation context compression
- **IDE Server** - Supports IDE integration (VSCode extension)

### Testing Infrastructure

**Test Scripts** (`scripts/`):

- `test-bayesian-ranking.mjs` - Verify Bayesian scoring algorithm
- `test-model-params-crud.mjs` - Test model parameter CRUD operations
- `test-harmony-gpt-oss-control.mjs` - Test GPT-OSS/Harmony integration
- `test-auth-crud-works.mjs` - Verify authentication flow

**Integration Tests**: Run with `npm run test:e2e`

## Important Patterns

### API Key Security

**API keys are NEVER stored in files** - only in environment variables. The `ProviderNode` class reads keys at runtime:

```typescript
// Check environment for provider-specific key
process.env.OPENAI_API_KEY
process.env.NVIDIA_API_KEY
// ... etc
```

### Model Configuration

To get model config and provider credentials:

```typescript
import { getModelConfig, getProviderCredentials } from '@wren-coder/wren-coder-cli-core';

const config = getModelConfig('gpt-4');
const credentials = getProviderCredentials(config.provider);
```

### Adding New Providers

1. Add provider enum to `packages/core/src/config/providers.ts`
2. Create provider config in `packages/core/src/config/providers/<provider>.ts`
3. Add to `ProviderTreeRoot.initialize()` in `providerTreeNodes.ts`
4. Add environment variable pattern to `ProviderNode.canonicalEnvVar()`

## Architecture Decisions

### Why Provider Tree?

The provider tree enables:

- **Hierarchical quota management** - Track usage per provider and per model
- **Bayesian model selection** - Learn which models perform best for which tasks
- **Dynamic provider discovery** - Auto-discover models from API endpoints
- **Failover support** - Automatically retry with backup providers
- **Metrics tracking** - Monitor latency, success rate, error patterns per model

### Why Multiple Content Generators?

Different providers have different capabilities:

- OpenAI-compatible: Standard chat completion API
- Harmony: Multi-channel reasoning (analysis/commentary/final)
- Reasoning models: Extended thinking time, different parameter sets
- Gemini: Native Google GenAI SDK

The abstraction allows seamless switching between providers while preserving provider-specific features.

## Debugging

Enable debug logging:

```bash
export DEBUG=1
npm start -- -m gpt-4 -p "test prompt"
```

Enable COT debugging for reasoning models:

```bash
export WREN_DEBUG_COT=true
npm start -- -m openai/gpt-oss-120b -p "explain this code"
```

## Configuration Files

- `.env` - Environment variables (API keys, base URLs)
- `.wren/cache/` - Dynamic model cache (auto-generated, 24h TTL)
- `.wren/models.json` - Custom model definitions (optional)

## Package Entry Points

- `packages/core/src/index.ts` - Core exports
- `packages/cli/src/index.ts` - CLI exports
- `bundle/wrenCoder.js` - Bundled executable (generated)
