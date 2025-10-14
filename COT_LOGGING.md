# Chain of Thought (COT) Logging and UI Coloring

This document describes the Chain of Thought (COT) handling implementation in Wren CLI, based on the [OpenAI Cookbook GPT-OSS guide](https://cookbook.openai.com/articles/gpt-oss/handle-raw-cot).

## Overview

GPT-OSS models (like `gpt-oss-120b`) use the **Harmony response format** which separates reasoning (chain of thought) from final output. This implementation provides:

1. **COT Logging** - Trustless verification of reasoning steps
2. **UI Metadata** - Custom properties for visual distinction of reasoning vs output
3. **Streaming Support** - Real-time logging of reasoning as it's generated

## COT Logging

### Environment Variables

#### `WREN_DEBUG_COT`
Enable COT debugging to console.error:
```bash
export WREN_DEBUG_COT=true
```

#### `WREN_COT_LOG_FILE`
Enable COT logging (future: will write to file):
```bash
export WREN_COT_LOG_FILE=/path/to/cot.log
```

### Log Format

All COT logs are written to `stderr` with JSON structure:

#### Analysis Channel Chunk (Streaming)
```json
[COT-REASONING] {"timestamp":"2025-10-08T01:23:45.678Z","type":"reasoning","content":"Let me think about this...","model":"gpt-oss-120b"}
```

#### Commentary Channel Chunk (Streaming)
```json
[COT-COMMENTARY] {"timestamp":"2025-10-08T01:23:46.123Z","type":"commentary","content":"I should call the search tool...","model":"gpt-oss-120b"}
```

#### Final Channel Chunk (Streaming)
```json
[COT-FINAL] {"timestamp":"2025-10-08T01:23:46.789Z","type":"final","content":"The answer is","model":"gpt-oss-120b"}
```

#### Completion (Streaming - All Channels)
```json
[COT-DONE] {"timestamp":"2025-10-08T01:23:47.890Z","type":"done","model":"gpt-oss-120b","channels":{"analysis":1024,"commentary":156,"final":256}}
```

#### Full Response (Non-Streaming)
```json
[COT-FULL] {"timestamp":"2025-10-08T01:23:48.901Z","type":"non-streaming-response","model":"gpt-oss-120b","output":"...full response...","outputLength":1280}
```

### Trustless Verification

COT logging enables trustless software verification by:

1. **Immutable Audit Trail** - All reasoning steps logged with timestamps
2. **Model Identification** - Each log entry includes the model name
3. **Content Verification** - Full reasoning and output content preserved
4. **Length Metrics** - Reasoning vs output length tracked for analysis

### Parsing Logs

Extract COT logs from stderr:
```bash
wren-cli 2>&1 | grep '\[COT-'
```

Parse with jq:
```bash
wren-cli 2>&1 | grep '\[COT-REASONING\]' | sed 's/\[COT-REASONING\] //' | jq .
```

## UI Coloring

### Reasoning Metadata

Reasoning chunks are marked with custom metadata in the `GenerateContentResponse`:

```typescript
// Reasoning chunk
{
  candidates: [{
    content: {
      parts: [{ text: "reasoning text", isReasoning: true }],  // <-- Custom property
      role: 'model'
    },
    finishReason: FinishReason.FINISH_REASON_UNSPECIFIED
  }]
}

// Output chunk
{
  candidates: [{
    content: {
      parts: [{ text: "final answer" }],  // <-- No isReasoning property
      role: 'model'
    },
    finishReason: FinishReason.FINISH_REASON_UNSPECIFIED
  }]
}
```

### Detecting Reasoning in UI

```typescript
for await (const chunk of streamGenerator) {
  const part = chunk.candidates?.[0]?.content?.parts?.[0];
  if (part && 'isReasoning' in part && part.isReasoning === true) {
    // This is reasoning text - apply different color/style
    displayReasoning(part.text);
  } else {
    // This is final output
    displayOutput(part.text);
  }
}
```

### Suggested Color Scheme

Based on the OpenAI Cookbook recommendations:

- **Reasoning Text**: Gray/muted color (e.g., `dim` in terminal, `#808080` in web)
- **Final Output**: Normal/bright color (default text color)
- **Separator**: Visual separator when transitioning from reasoning to output

### Example Terminal Coloring (Chalk)

```typescript
import chalk from 'chalk';

if (part.isReasoning) {
  process.stdout.write(chalk.dim.italic(part.text));
} else {
  process.stdout.write(chalk.white(part.text));
}
```

### Example Ink Component Coloring

```tsx
import { Text } from 'ink';

{part.isReasoning ? (
  <Text dimColor italic>{part.text}</Text>
) : (
  <Text>{part.text}</Text>
)}
```

## Event Types

### Streaming Events

From the Harmony response format (each event is handled independently):

| Event Type | Channel | Description | Logged As |
|------------|---------|-------------|-----------|
| `response.reasoning_text.delta` | analysis | Incremental reasoning (COT) text | `[COT-REASONING]` |
| `response.commentary.delta` | commentary | Tool call preambles and function planning | `[COT-COMMENTARY]` |
| `response.output_text.delta` | final | Incremental final answer text | `[COT-FINAL]` |
| `response.done` | (all) | Stream completion with all channel lengths | `[COT-DONE]` |

### Response Channels

Harmony uses three **independent, non-chained** channels, each with its own rendering guidelines and UI treatment:

| Channel | Event Type | Emoji Markers | Purpose | Rendering Guidelines |
|---------|-----------|---------------|---------|---------------------|
| **analysis** | `response.reasoning_text.delta` | 👽 (start/end) | Raw chain-of-thought reasoning | Dimmed, italic text. Not user-facing by default. Each chunk independently marked. |
| **commentary** | `response.commentary.delta` | 👓 (start/end) | Tool call preambles, function planning | Monospace font, distinct color. Shows model's tool usage reasoning. Independent rendering. |
| **final** | `response.output_text.delta` | (none) | User-facing answer | Normal text weight and color. Primary user-visible content. No special markers. |

**Architecture Principle**: Each channel has completely independent rendering logic. They are NOT chained or pipelined - each channel's content is rendered according to its own guidelines without depending on other channels.

**Security Note**: Per OpenAI guidelines, raw COT content from the `analysis` channel should NOT be displayed to end-users without review, as it may contain unfiltered reasoning that bypasses safety guardrails.

## Implementation Details

### File Location
`packages/core/src/core/openaiContentGenerator.ts`

### Streaming Handler
Lines 433-512: GPT-OSS streaming with COT logging and metadata

### Non-Streaming Handler
Lines 237-273: GPT-OSS non-streaming with full response logging

### Key Features

1. **Conditional Logging** - Only logs when `WREN_DEBUG_COT` or `WREN_COT_LOG_FILE` enabled
2. **Custom Metadata** - `isReasoning: true` property added to reasoning parts
3. **Timestamp Tracking** - ISO 8601 timestamps for all log entries
4. **Length Metrics** - Tracks reasoning and output lengths
5. **Model Attribution** - Every log entry includes model name

## OpenRouter Responses API Parameters

When using GPT-OSS via OpenRouter, the following parameters are automatically applied:

```javascript
{
  model: "openai/gpt-oss-120b",
  input: "...",
  max_output_tokens: 8192,
  stream: true,
  reasoning: {
    effort: "high",      // Maximum reasoning effort
    max_tokens: 8192     // Large reasoning token budget
  },
  verbosity: "high",     // Detailed responses
  include_reasoning: true // Include reasoning in response for logging
}
```

### Reasoning Parameters

- `reasoning.effort`: Controls thinking depth (`'low'` | `'medium'` | `'high'`)
- `reasoning.max_tokens`: Max tokens allocated for reasoning (1024-32000)
- `reasoning.exclude`: Set to `true` to use reasoning internally but not include in response
- `verbosity`: Response detail level (`'low'` | `'medium'` | `'high'`)
- `include_reasoning`: Set to `true` to include reasoning in response for COT logging

### Configuration

These parameters are configured in `packages/core/src/config/providers/nvidia.ts`:

```typescript
{
  name: 'openai/gpt-oss-120b',
  reasoning: {
    effort: 'high',      // High reasoning effort by default
    max_tokens: 8192,    // Allow up to 8K tokens for reasoning
  },
  verbosity: 'high',     // High verbosity for detailed responses
  includeReasoning: true // Include reasoning in response for COT logging
}
```

## Future Enhancements

- [ ] File-based logging to `WREN_COT_LOG_FILE` path
- [ ] Structured log rotation
- [ ] COT summarization (per OpenAI recommendations)
- [ ] Safety filtering for raw COT content
- [ ] CLI --cot-color flag for automatic coloring
- [ ] Web UI with collapsible reasoning sections

## References

- [OpenAI Cookbook: Handle Raw COT](https://cookbook.openai.com/articles/gpt-oss/handle-raw-cot)
- [OpenRouter Responses API (Alpha)](https://openrouter.ai/docs/api-reference/responses-api-alpha/overview)
- [OpenRouter Reasoning Tokens](https://openrouter.ai/docs/use-cases/reasoning-tokens)
- [NVIDIA GPT-OSS API](https://docs.nvidia.com/ai-enterprise/deployment/gpt-oss/)
