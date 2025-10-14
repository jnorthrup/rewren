# Per-Model CRUD Configuration with Provider Defaults

## Summary

Implemented a comprehensive per-model parameter management system with provider-level defaults and model-specific overrides.

## Features Implemented

### 1. Provider-Level Default Parameters

Added to `ProviderNode` ([providerTreeNodes.ts:82-91](packages/core/src/config/providerTreeNodes.ts#L82-L91)):

```typescript
defaultReasoning?: {
  effort?: 'low' | 'medium' | 'high';
  max_tokens?: number;
  exclude?: boolean;
};
defaultVerbosity?: 'low' | 'medium' | 'high';
defaultIncludeReasoning?: boolean;
defaultTemperature?: number;
defaultTopP?: number;
defaultMaxTokens?: number;
```

### 2. Per-Model Parameter Overrides

Added to `ModelNode` ([providerTreeNodes.ts:284-294](packages/core/src/config/providerTreeNodes.ts#L284-L294)):

```typescript
reasoning?: {
  effort?: 'low' | 'medium' | 'high';
  max_tokens?: number;
  exclude?: boolean;
};
verbosity?: 'low' | 'medium' | 'high';
includeReasoning?: boolean;
temperature?: number;
topP?: number;
maxTokens?: number;
```

### 3. Effective Parameters with Fallback

`ModelNode.getEffectiveParameters()` method ([providerTreeNodes.ts:342-359](packages/core/src/config/providerTreeNodes.ts#L342-L359)):

- Returns model-specific parameters if set
- Falls back to provider defaults if model value is undefined
- Enables inheritance pattern: Provider → Model

### 4. Complete Serialization

Both `ProviderNode` and `ModelNode`:
- Serialize all parameters in `toJSON()`
- Deserialize from JSON in `fromJSON()`
- Persist to disk via `provider-tree.json`

### 5. CRUD Operations

Updated `JsonGraphCRUD` ([jsonGraphCRUD.ts](packages/core/src/config/tree/jsonGraphCRUD.ts)):

#### Provider Updates
```javascript
crud.updateNode('provider-openrouter', {
  defaultReasoning: { effort: 'high', max_tokens: 8192 },
  defaultTemperature: 0.7,
  defaultTopP: 0.9
});
```

#### Model Updates
```javascript
crud.updateNode('model-gpt-4o', {
  reasoning: { effort: 'medium', max_tokens: 4096 },
  temperature: 0.5,
  // Other params fall back to provider defaults
});
```

#### Models Node Selection (Fixed)
```javascript
// Now works for ALL providers
crud.updateNode('provider-openai-models', {
  selectedModel: 'gpt-4o'
});
```

### 6. JSON Editor UI

Press `j` in Provider Tree UI to:
- Open JSON editor in left panel
- Edit node configuration directly as JSON
- `Ctrl+Enter`: Save changes
- `Esc`: Cancel and close editor

Status bar updates to show: **"JSON Editor: Ctrl+Enter Save | Esc Cancel"**

### 7. Model Selection Works Universally

Fixed CRUD to support `ModelsNode` updates - model selection now works for:
- ✅ OpenAI (102 models)
- ✅ Anthropic (3 models)
- ✅ Google Gemini (7 models)
- ✅ NVIDIA (172 models)
- ✅ DeepSeek (5 models)
- ✅ **OpenRouter (346 models)** ← No bias!
- ✅ Harmony (4 models)
- ✅ Kilo (11 models)
- ✅ Qwen (1 model)
- ✅ Mistral (3 models)
- ✅ Cohere (4 models)

## Test Scripts

### Test CRUD Operations
```bash
node scripts/test-model-params-crud.mjs
```

### Test Model Selection
```bash
node scripts/test-model-selection.mjs
```

## Architecture

```
ProviderTreeRoot
├── ProviderNode (OpenRouter)
│   ├── defaultReasoning: { effort: 'high', max_tokens: 8192 }
│   ├── defaultTemperature: 0.7
│   └── ModelsNode
│       ├── selectedModel: "openai/gpt-oss-120b"
│       ├── ModelNode (gpt-oss-120b)
│       │   ├── reasoning: { effort: 'medium' }  ← Override
│       │   ├── temperature: 0.5                  ← Override
│       │   └── verbosity: undefined              ← Uses provider default
│       └── ModelNode (deepseek-r1)
│           └── (all params use provider defaults)
```

## Parameter Inheritance

1. **Set provider default**: Applies to all models in that provider
2. **Set model override**: Overrides provider default for that specific model
3. **Get effective parameters**: `modelNode.getEffectiveParameters()` returns merged result

## Usage Example

```javascript
import { ProviderTreeRoot, JsonGraphCRUD } from '@wren-coder/wren-coder-cli-core';

const tree = new ProviderTreeRoot();
await tree.initialize();
const crud = new JsonGraphCRUD(tree);

// Set provider defaults
crud.updateNode('provider-openrouter', {
  defaultReasoning: { effort: 'high', max_tokens: 8192 },
  defaultTemperature: 0.7
});

// Override for specific model
crud.updateNode('model-openai/gpt-oss-120b', {
  reasoning: { effort: 'medium', max_tokens: 4096 }
});

// Get effective parameters
const model = tree.findNode('model-openai/gpt-oss-120b');
const effective = model.getEffectiveParameters();
// Returns: { reasoning: { effort: 'medium', max_tokens: 4096 }, temperature: 0.7, ... }
```

## Files Modified

1. [packages/core/src/config/providerTreeNodes.ts](packages/core/src/config/providerTreeNodes.ts) - Added parameters to ProviderNode and ModelNode
2. [packages/core/src/config/tree/jsonGraphCRUD.ts](packages/core/src/config/tree/jsonGraphCRUD.ts) - Updated CRUD handlers
3. [packages/cli/src/ui/components/ProviderTreeUI.tsx](packages/cli/src/ui/components/ProviderTreeUI.tsx) - Added JSON editor UI
4. [scripts/test-model-params-crud.mjs](scripts/test-model-params-crud.mjs) - Test script for parameters
5. [scripts/test-model-selection.mjs](scripts/test-model-selection.mjs) - Test script for model selection

## Parameters Reference

Based on [PROVIDER_API_SCHEMAS.md](packages/core/src/config/providers/PROVIDER_API_SCHEMAS.md):

### OpenRouter Responses API
- `reasoning.effort`: 'low' | 'medium' | 'high' (0.2, 0.5, 0.8 effort ratio)
- `reasoning.max_tokens`: 1024-32000
- `reasoning.exclude`: Include reasoning in response
- `verbosity`: 'low' | 'medium' | 'high'
- `includeReasoning`: Show reasoning in response

### Standard Parameters
- `temperature`: 0.0-2.0 (sampling randomness)
- `topP`: 0.0-1.0 (nucleus sampling)
- `maxTokens`: Max output tokens

## Next Steps (User Requested)

1. Add `thinking` parameter (enum or absent)
2. Add `context` parameters
3. Add `topK` (float)
4. Make OpenRouter elements selectable in UI ← **DONE!**

All model selection works universally across providers. No bias exists in the implementation.
