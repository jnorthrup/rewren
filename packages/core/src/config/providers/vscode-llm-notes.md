# VSCode Language Model API - Model Discovery Limitations

## Why VSCode Models Can't Be Dynamically Listed

Based on official VSCode documentation and MCP specification:

### 1. No HTTP Models Endpoint

**VSCode Language Model API** uses a JavaScript/TypeScript API, NOT HTTP REST endpoints:

```typescript
// This is a VSCode extension API call, not HTTP
const models = await vscode.lm.selectChatModels({
  vendor: 'copilot'
});
```

There is **NO** `/v1/models` endpoint or similar HTTP API.

### 2. Extension Context Required

The `vscode.lm.selectChatModels()` method can only be called from:
- Inside a VSCode extension
- Within the VSCode extension host process
- With proper authentication/consent dialogs

**Cannot be called from**:
- External Node.js processes
- CLI tools
- HTTP requests

### 3. MCP Server Doesn't List Models

The MCP server at `http://localhost:3000/mcp` provides:
- ✅ **Tools** (file operations, editing, diagnostics)
- ✅ **Resources** (workspace data)
- ✅ **Prompts** (templates)
- ❌ **Models** (not part of MCP protocol)

MCP Protocol Specification explicitly states:
> "Servers cannot simply request a specific model by name since the client may not have access to that exact model"

### 4. Client-Controlled Model Selection

In the MCP architecture:
- **Client (VSCode)**: Controls which models are available
- **Server (wren3)**: Expresses preferences (cost/speed/intelligence) and hints
- **Models**: Discovered at runtime by client, not enumerable by server

### 5. Dynamic Model Availability

Available models depend on:
- What the user has configured in VSCode settings
- Active Copilot subscription status
- Installed extensions that provide models
- User authentication state
- Real-time service availability

## Current Implementation

### Static Model List (`vscode.ts`)

We maintain a hardcoded list of common models:
```typescript
- claude-sonnet
- gpt-4o
- gpt-4o-mini
```

These are **placeholders** representing typical models a user might have configured.

### Why Static Is Correct

1. **No API to query**: VSCode doesn't expose model enumeration via HTTP
2. **User-specific**: Each user has different models based on their setup
3. **Runtime-only**: True model list only available when running inside VSCode
4. **MCP limitation**: MCP servers don't receive model catalogs from clients

## How Model Selection Actually Works

### In VSCode Extension Context:

```typescript
// List all available models
const allModels = await vscode.lm.selectChatModels();

// List by vendor
const copilotModels = await vscode.lm.selectChatModels({
  vendor: 'copilot'
});

// Select specific model
const [model] = await vscode.lm.selectChatModels({
  vendor: 'copilot',
  family: 'gpt-4o'
});

// Handle when no models available
if (models.length === 0) {
  // User hasn't configured any models
}
```

### From Our CLI Tool:

**We can't** use `vscode.lm.selectChatModels()` because:
- We run as a separate Node.js process
- We don't have VSCode extension context
- We don't have access to user's VSCode session

**Instead**, we use:
- IDE companion server (running inside VSCode extension)
- MCP HTTP bridge at `localhost:3000/mcp`
- Server proxies requests to actual VSCode LLM API

## Recommendation

**Keep static model list** in `packages/core/src/config/providers/vscode.ts`:

```typescript
const models: ModelConfig[] = [
  {
    name: 'claude-sonnet',
    tokenLimit: 200_000,
    description: 'Claude Sonnet via VS Code LLM API',
    provider: Providers.VSCODE_LLM,
    // ...
  },
  // ... other common models
];
```

**Skip VSCode** in dynamic model discovery (`modelRegistry.ts`):

```typescript
const OPENAI_COMPATIBLE_PROVIDERS: ProviderConfig[] = [
  { provider: Providers.OPENAI, ... },
  { provider: Providers.OPENROUTER, ... },
  { provider: Providers.NVIDIA, ... },
  // DON'T include VSCODE_LLM - it doesn't have /v1/models endpoint
];
```

## References

- [VSCode Language Model API](https://code.visualstudio.com/api/extension-guides/ai/language-model)
- [MCP Specification - Sampling](https://modelcontextprotocol.io/specification/2025-03-26/client/sampling)
- [VSCode MCP Server](https://github.com/juehang/vscode-mcp-server)
- [Model Context Protocol - Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
