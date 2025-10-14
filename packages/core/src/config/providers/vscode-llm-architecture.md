# VSCode LLM Provider - Architecture & Implementation

## Overview

VSCode LLM provider enables dynamic discovery of language models configured in a user's VS Code installation via the **VS Code Language Model API** (`vscode.lm`).

## Architecture

```
┌──────────────────┐         HTTP GET          ┌───────────────────────┐      vscode.lm API      ┌─────────────┐
│   wren CLI       │  ────────────────────────> │  IDE Companion Server │  ────────────────────>  │  VS Code    │
│  (External)      │   /models (2s timeout)    │   (Extension Context) │   selectChatModels()   │  Extension  │
│                  │                            │   localhost:3000      │                         │  Host       │
│ ProviderTreeRoot │ <──────────────────────── │                       │ <─────────────────────  │             │
│                  │   JSON: {models: [...]}   │                       │   LanguageModelChat[]   │             │
└──────────────────┘                            └───────────────────────┘                         └─────────────┘
         │                                                 │
         │                                                 │
         │  SSE: /models/stream                           │  onDidChangeChatModels
         │ <──────────────────────────────────────────────│
         │  event: models-changed                         │
         └────> Re-fetch /models                          │
```

## Components

### 1. IDE Companion Server (`ide-server.ts`)

**Location**: `packages/vscode-ide-companion/src/ide-server.ts`

**Endpoints**:

#### `GET /models`
```typescript
// Returns VSCode models as JSON
{
  ok: true,
  models: [
    {
      id: "copilot-gpt-4o",
      vendor: "copilot",
      family: "gpt-4o",
      maxInputTokens: 128000
    },
    // ...
  ]
}
```

**Implementation**:
- Calls `vscode.lm.selectChatModels()` - only works in extension context
- Maps `LanguageModelChat` objects to simple JSON format
- May prompt user for consent (VS Code security feature)

#### `GET /models/stream`
```
Content-Type: text/event-stream

event: models-changed
data: {}
```

**Implementation**:
- Server-Sent Events (SSE) endpoint
- Broadcasts when `vscode.lm.onDidChangeChatModels` fires
- Clients re-query `/models` on receiving event

### 2. Provider Tree (`providerTreeNodes.ts`)

**Location**: `packages/core/src/config/providerTreeNodes.ts:564-589`

**Initialization Flow**:
```typescript
// In ProviderTreeRoot.initializeProviders()
const port = process.env.WREN_IDE_SERVER_PORT || '3000';
const url = `http://localhost:${port}/models`;

fetchWithTimeout(url, 2000)
  .then(async (res) => {
    const body = await res.json();
    const models = body.models.map(convertVsCodeModelToModelConfig);

    // Create VSCode provider with real models
    const vscodeProvider = new ProviderNode(Providers.VSCODE_LLM, 'VSCODE_LLM_PAT');
    const modelsNode = vscodeProvider.children.find(c => c instanceof ModelsNode);
    modelsNode.loadModels(models);

    this.addProvider(vscodeProvider);
  })
  .catch(() => {
    // Silent failure - VSCode provider not added
  });
```

**Failure Modes**:
- IDE server not running → Skip VSCode provider (no error)
- Network timeout (2s) → Skip VSCode provider
- No models configured → Skip VSCode provider
- Invalid response → Skip VSCode provider

### 3. Model Converter (`vscode.ts`)

**Location**: `packages/core/src/config/providers/vscode.ts`

**Function**: `convertVsCodeModelToModelConfig()`

```typescript
interface VsCodeLanguageModel {
  id?: string;              // "copilot-gpt-4o"
  vendor?: string;          // "copilot"
  family?: string;          // "gpt-4o"
  maxInputTokens?: number;  // 128000
}

function convertVsCodeModelToModelConfig(m: VsCodeLanguageModel): ModelConfig {
  return {
    name: m.id || `${m.vendor}/${m.family}`,
    tokenLimit: m.maxInputTokens || 0,
    description: `VSCode LLM: ${m.vendor} ${m.family}`,
    provider: Providers.VSCODE_LLM,
    capabilities: {
      reasoning: true,
      streaming: true,
    },
    supportsContextReorg: tokenLimit >= 80000,
  };
}
```

## Benefits

### ✅ Real Models from User Configuration
- No hardcoded fake models
- Shows exactly what user has access to in VS Code
- Includes GitHub Copilot models, custom language models, etc.

### ✅ Dynamic Updates
- SSE stream notifies CLI when models change
- User adds/removes models in VS Code → CLI sees changes
- No restart required

### ✅ Accurate Metadata
- Real token limits from VS Code API
- Correct model families and vendors
- Proper capability flags

### ✅ Graceful Degradation
- Works when IDE server running
- Silently skips when unavailable
- No errors or warnings when not in VS Code

## Usage

### When IDE Server Running (in VS Code):
```bash
# IDE companion extension auto-starts server on port 3000
# VSCode models appear in /auth tree automatically
wren
> /auth
  📁 VSCode
    🤖 copilot-gpt-4o
    🤖 copilot-gpt-3.5-turbo
    🤖 custom-model
```

### When IDE Server Not Running (terminal):
```bash
# No VSCode provider shown (silent skip)
wren
> /auth
  📁 NVIDIA (165 models)
  📁 OpenRouter (400+ models)
  📁 OpenAI (87 models)
  # VSCode not shown - no error
```

### Opting Out:
```bash
# Disable IDE mode (no VSCode provider attempt)
NO_IDE_MODE=1 wren

# Or via CLI flag
wren --no-ide-mode

# Or in .wren/settings.json
{"ideMode": false}
```

## Environment Variables

- `WREN_IDE_SERVER_PORT`: Port where IDE server runs (default: 3000)
- `NO_IDE_MODE`: Set to "1" to disable IDE integration entirely

## API Reference

### VSCode Language Model API

```typescript
namespace vscode.lm {
  /**
   * Select language models by a selector.
   * Returns array of LanguageModelChat objects.
   * May prompt user for consent.
   */
  function selectChatModels(selector?: LanguageModelChatSelector): Thenable<LanguageModelChat[]>;

  /**
   * Event that fires when available models change.
   * Use to detect when user adds/removes models.
   */
  const onDidChangeChatModels: Event<LanguageModelChatChangeEvent>;
}

interface LanguageModelChat {
  id: string;
  vendor: string;
  family: string;
  maxInputTokens: number;
  countTokens(text: string | LanguageModelChatMessage, token?: CancellationToken): Thenable<number>;
  sendRequest(messages: LanguageModelChatMessage[], options?: LanguageModelChatRequestOptions, token?: CancellationToken): Thenable<LanguageModelChatResponse>;
}
```

## Security Considerations

1. **User Consent**: `vscode.lm.selectChatModels()` may prompt user for consent
2. **Extension Context Only**: API only accessible in VS Code extension host
3. **localhost Only**: IDE server binds to localhost (not exposed externally)
4. **No Credentials**: Models list doesn't include API keys or secrets

## Testing

### Manual Test:
1. Open wren3 project in VS Code
2. IDE companion extension starts (check Output → "MCP Server")
3. Verify server on port 3000: `curl http://localhost:3000/models`
4. Run `npm start` from terminal
5. Run `/auth` command
6. Verify VSCode provider shows with real models

### Without VS Code:
1. Run `npm start` from regular terminal
2. Run `/auth` command
3. Verify VSCode provider NOT shown (silent skip)

## References

- [VS Code Language Model API](https://code.visualstudio.com/api/extension-guides/ai/language-model)
- [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api)
- [Model Context Protocol](https://modelcontextprotocol.io)
