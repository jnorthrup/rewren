# Provider API Schemas - Non-OpenAI Formats

This document catalogs all provider-specific API schemas and formats that differ from the standard OpenAI Chat Completions API.

## Table of Contents

1. [NVIDIA GPT-OSS (Responses API)](#nvidia-gpt-oss-responses-api)
2. [OpenRouter Responses API (Alpha)](#openrouter-responses-api-alpha)
3. [DeepSeek R1 (Reasoning Models)](#deepseek-r1-reasoning-models)
4. [Google Gemini (Native Format)](#google-gemini-native-format)
5. [VSCode Language Model API](#vscode-language-model-api)
6. [Anthropic Claude (Messages API)](#anthropic-claude-messages-api)
7. [Cohere Chat API](#cohere-chat-api)
8. [Mistral AI Special Parameters](#mistral-ai-special-parameters)

---

## NVIDIA GPT-OSS (Responses API)

### Format: `responses.create` (not `chat.completions.create`)

**Models**: `openai/gpt-oss-*`

**Detection Flag**: `gptOssFormat: true`

### API Differences

```typescript
// Standard OpenAI
openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  max_tokens: 100
});

// NVIDIA GPT-OSS
openai.responses.create({
  model: "openai/gpt-oss-120b",
  input: ["Hello"],  // Array of strings, not messages
  max_output_tokens: 100  // Different parameter name
});
```

### Streaming Response Format

```typescript
for await (const chunk of stream) {
  if (chunk.type === "response.reasoning_text.delta") {
    // Reasoning/thinking process
  } else if (chunk.type === "response.output_text.delta") {
    // Final output
  } else if (chunk.type === "response.done") {
    // Stream completion
  }
}
```

### Special Parameters

- `max_output_tokens` (not `max_tokens`)
- `input` (array of strings, not `messages`)
- `top_p`, `temperature` (same as OpenAI)

**Reference**: [nvidia-api-notes.md](./nvidia-api-notes.md)

---

## OpenRouter Responses API (Alpha)

### Format: Nested `reasoning` object with OpenAI-compatible base

**Base URL**: `https://openrouter.ai/api/alpha/responses`

**Models**: Supports reasoning models (o1, o3, GPT-OSS, etc.)

### API Request Format

```typescript
{
  model: "openai/gpt-oss-120b",
  input: "What is the meaning of life?",
  max_output_tokens: 9000,
  stream: true,
  reasoning: {
    effort: "high",         // 'low' | 'medium' | 'high'
    max_tokens: 8192,       // 1024-32000
    exclude: false          // Include reasoning in response
  },
  verbosity: "high",        // 'low' | 'medium' | 'high'
  include_reasoning: true   // Show reasoning in response
}
```

### Parameters

**Reasoning Object**:
- `reasoning.effort`: Controls thinking depth
  - `low`: 0.2 effort ratio
  - `medium`: 0.5 effort ratio
  - `high`: 0.8 effort ratio
- `reasoning.max_tokens`: Max tokens for reasoning (1024-32000)
- `reasoning.exclude`: Use reasoning internally but don't include in response

**Other Parameters**:
- `verbosity`: Response detail level
- `include_reasoning`: Include reasoning in response (required for COT logging)

### Important Constraint

`max_tokens` must be **strictly higher** than `reasoning.max_tokens` to ensure tokens are available for final response after thinking.

**Reference**:
- https://openrouter.ai/docs/api-reference/responses-api-alpha/overview
- https://openrouter.ai/docs/use-cases/reasoning-tokens

---

## DeepSeek R1 (Reasoning Models)

### Format: OpenAI-compatible with `reasoning_content` field

**Models**: `deepseek-reasoner`, `deepseek-r1`, `deepseek-r1-distill-*`

**API**: Standard `/v1/chat/completions` with extensions

### Response Format

```typescript
{
  choices: [{
    delta: {
      role: "assistant",
      reasoning_content: "...",  // Thinking process (billable)
      content: "..."             // Final answer (billable)
    }
  }],
  usage: {
    prompt_tokens: 100,
    reasoning_tokens: 900,      // Internal thought process
    completion_tokens: 100,     // Final answer
    total_tokens: 1100          // All billable tokens
  }
}
```

### Special Considerations

- **Both** reasoning and output tokens are billable
- Optimized for `temperature: 1.0`
- No special content generator needed (uses OpenAIContentGenerator)
- May use 10x+ tokens vs non-reasoning models

### Example Tags

```
<thinking>
Let me break down this problem step by step...
First, I need to consider...
</thinking>

Final answer: Based on my analysis above...
```

**Reference**: [deepseek-r1-notes.md](./deepseek-r1-notes.md)

---

## Google Gemini (Native Format)

### Format: Google GenerativeAI SDK (not OpenAI-compatible)

**Models**: `models/gemini-*`

**Detection Flag**: `geminiNative: true`

### API Differences

Uses Google's native SDK with `Content` and `Part` types:

```typescript
import { GoogleGenAI } from '@google/genai';

const genai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

const result = await model.generateContent({
  contents: [{
    role: 'user',
    parts: [{ text: 'Hello' }]
  }],
  generationConfig: {
    temperature: 1.0,
    maxOutputTokens: 8192
  }
});
```

### Key Differences

- `contents` array instead of `messages`
- `parts` array for multimodal content
- `generationConfig` instead of flat parameters
- Different streaming format
- Native vision/multimodal support

**Reference**: https://ai.google.dev/gemini-api/docs

---

## VSCode Language Model API

### Format: VS Code extension API (not HTTP-based)

**Models**: Discovered dynamically from `vscode.lm.selectChatModels()`

**API**: VS Code Extension API

### Discovery

```typescript
import * as vscode from 'vscode';

const languageModels = await vscode.lm.selectChatModels();
const models = languageModels.map(m => ({
  id: m.id,
  vendor: m.vendor,
  family: m.family,
  maxInputTokens: m.maxInputTokens
}));
```

### HTTP Bridge

Since Wren CLI runs outside VS Code, we use an HTTP bridge:

```typescript
// IDE Companion Server (runs in VS Code)
app.get('/models', async (req, res) => {
  const models = await vscode.lm.selectChatModels();
  res.json({ ok: true, models });
});

// Wren CLI (queries the bridge)
const response = await fetch('http://localhost:3000/models');
const { models } = await response.json();
```

### Special Considerations

- Only available when VS Code is running
- Requires IDE companion extension installed
- Models change based on installed VS Code extensions
- No direct API key (uses VS Code's auth)

**Reference**:
- [vscode-llm-architecture.md](./vscode-llm-architecture.md)
- [vscode-llm-notes.md](./vscode-llm-notes.md)

---

## Anthropic Claude (Messages API)

### Format: Messages API (not Chat Completions)

**Endpoint**: `/v1/messages` (not `/v1/chat/completions`)

**Models**: `claude-*`

### API Differences

```typescript
// OpenAI format
{
  model: "gpt-4",
  messages: [
    { role: "system", content: "You are helpful" },
    { role: "user", content: "Hello" }
  ]
}

// Claude Messages API
{
  model: "claude-sonnet-4-5-20250929",
  system: "You are helpful",  // System at top level, not in messages
  messages: [
    { role: "user", content: "Hello" }
  ],
  max_tokens: 1024  // Required parameter
}
```

### Key Differences

1. **System prompts**: Top-level `system` parameter (not in messages array)
2. **Max tokens required**: Must specify `max_tokens`
3. **No "system" role**: Only `user` and `assistant` in messages
4. **Message consolidation**: Consecutive same-role messages are combined
5. **Content blocks**: Support for multimodal content blocks

### Content Format

```typescript
{
  role: "user",
  content: [
    { type: "text", text: "What's in this image?" },
    { type: "image", source: { type: "base64", data: "..." } }
  ]
}
```

**Reference**: https://docs.anthropic.com/claude/reference/messages_post

---

## Cohere Chat API

### Format: Chat API with `message` and `chat_history`

**Endpoint**: `/v1/chat`

**Models**: `command-*`

### API Differences

```typescript
// Cohere Chat API
{
  model: "command-a-03-2025",
  message: "What is the capital of France?",  // Current user message
  chat_history: [                              // Previous turns
    { role: "USER", message: "Hello" },
    { role: "CHATBOT", message: "Hi there!" }
  ],
  max_tokens: 1024,
  temperature: 0.7
}
```

### Special Features

**Structured Outputs (2025)**:

```typescript
{
  model: "command-a-03-2025",
  message: "Extract the person's name and age",
  response_format: {
    type: "json_schema",
    json_schema: {
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" }
        },
        required: ["name", "age"]
      },
      name: "person_schema",
      strict: true
    }
  }
}
```

### Key Parameters

- `message`: Current user message (not `messages` array)
- `chat_history`: Previous conversation turns
- `response_format`: JSON schema for structured outputs
- `strict`: 100% schema adherence when true

**Reference**: https://docs.cohere.com/reference/chat

---

## Mistral AI Special Parameters

### Format: OpenAI-compatible with Mistral-specific extensions

**Endpoint**: `/v1/chat/completions`

**Models**: `mistral-*`, `open-mistral-*`, `codestral-*`

### Special Parameters

```typescript
{
  model: "mistral-large-2501",
  messages: [...],

  // Mistral-specific parameters
  safe_prompt: true,           // Content filtering
  prompt_mode: "reasoning",    // For reasoning tasks

  // Structured outputs
  response_format: {
    type: "json_schema",
    json_schema: {
      schema: { /* JSON Schema */ },
      name: "response_schema",
      strict: true
    }
  },

  // Agent-based interactions
  agent_id: "agent-123",

  // Tool use
  parallel_tool_calls: true
}
```

### Key Features

1. **safe_prompt**: Boolean for content filtering (Mistral-specific)
2. **prompt_mode**: Can be set to `"reasoning"` for reasoning tasks
3. **Strict parameter validation**: API rejects unsupported parameters (2025 update)
4. **JSON Schema**: Custom structured outputs with strict enforcement
5. **Agent support**: `agent_id` for agent-based interactions

### Function Calling Schema

```typescript
{
  tools: [{
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string" }
        },
        required: ["location"]
      }
    }
  }],
  tool_choice: "auto"
}
```

**Reference**: https://docs.mistral.ai/api/

---

## Summary Matrix

| Provider | Format | Endpoint | Key Difference | Detection |
|----------|--------|----------|----------------|-----------|
| NVIDIA GPT-OSS | Responses API | `/responses` | `input` array, `max_output_tokens` | `gptOssFormat: true` |
| OpenRouter | Responses API Alpha | `/api/alpha/responses` | Nested `reasoning` object | Via provider |
| DeepSeek R1 | OpenAI + extensions | `/v1/chat/completions` | `reasoning_content` field | Via model name |
| Google Gemini | Native SDK | Google SDK | `contents`, `parts`, `generationConfig` | `geminiNative: true` |
| VSCode LLM | Extension API | VS Code API | HTTP bridge, dynamic discovery | Via provider |
| Anthropic | Messages API | `/v1/messages` | Top-level `system`, required `max_tokens` | Via provider |
| Cohere | Chat API | `/v1/chat` | `message` + `chat_history` | Via provider |
| Mistral | OpenAI + extensions | `/v1/chat/completions` | `safe_prompt`, `prompt_mode` | Via model |

---

## Implementation Notes

### Content Generator Selection

```typescript
// In contentGenerator.ts
if (model.startsWith('openai/gpt-oss-')) {
  // Use OpenAIContentGenerator with GPT-OSS format
  return new OpenAIContentGenerator(apiKey, model, config);
}

if (model.startsWith('models/gemini-')) {
  // Use Gemini native SDK
  return new GeminiContentGenerator(apiKey, model, config);
}

if (provider === 'vscode-llm') {
  // Use VSCode HTTP bridge
  return new VSCodeContentGenerator(model, config);
}

// Default: OpenAI-compatible
return new OpenAIContentGenerator(apiKey, model, config);
```

### Format Detection

```typescript
// Auto-detect in ModelNode constructor
if (model.name.startsWith('openai/gpt-oss-')) {
  this.gptOssFormat = true;
}

if (model.provider === 'google' && model.name.startsWith('models/gemini-')) {
  this.geminiNative = true;
}
```

---

## Adding New Provider Schemas

When adding a new provider with non-standard format:

1. **Create provider notes**: `packages/core/src/config/providers/{provider}-api-notes.md`
2. **Add detection flag**: Update `ModelNode` in `providerTreeNodes.ts`
3. **Document here**: Add section to this file
4. **Implement generator**: Create or extend content generator
5. **Update tests**: Add schema validation tests

---

## References

- [NVIDIA API Notes](./nvidia-api-notes.md)
- [DeepSeek R1 Notes](./deepseek-r1-notes.md)
- [VSCode LLM Architecture](./vscode-llm-architecture.md)
- [OpenRouter Responses API](https://openrouter.ai/docs/api-reference/responses-api-alpha/overview)
- [Anthropic Messages API](https://docs.anthropic.com/claude/reference/messages_post)
- [Cohere Chat API](https://docs.cohere.com/reference/chat)
- [Mistral AI API](https://docs.mistral.ai/api/)
- [Google Gemini API](https://ai.google.dev/gemini-api/docs)
