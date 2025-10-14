# NVIDIA API Special Formats

## GPT-OSS Models (gpt-oss-120b, etc.)

The `openai/gpt-oss-*` models on NVIDIA use a **different API format** than standard OpenAI chat completions.

### API Differences

**Standard OpenAI Format:**
```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  max_tokens: 100,
  temperature: 1,
  stream: true
});
```

**NVIDIA GPT-OSS Format:**
```typescript
const response = await openai.responses.create({
  model: "openai/gpt-oss-120b",
  input: [""], // Array of strings instead of messages
  max_output_tokens: 1, // Different parameter name
  top_p: 1,
  temperature: 1,
  stream: true
});
```

### Streaming Response Format

**Chunk Types:**
- `response.reasoning_text.delta` - Reasoning/thinking process text
- `response.output_text.delta` - Final output text

**Example:**
```typescript
for await (const chunk of response) {
  if (chunk.type === "response.reasoning_text.delta") {
    process.stdout.write(chunk.delta);
  } else if (chunk.type === "response.output_text.delta") {
    if (!reasoningDone) {
      process.stdout.write("\n");
      reasoningDone = true;
    }
    process.stdout.write(chunk.delta);
  }
}
```

### Implementation Requirements

1. **Content Generator:** Need a special content generator for GPT-OSS models
2. **Parameter Mapping:**
   - `messages` → `input` (convert to string array)
   - `max_tokens` → `max_output_tokens`
3. **Response Parsing:** Handle reasoning and output deltas separately
4. **Model Detection:** Check if model name starts with `openai/gpt-oss-`

### Configuration

```bash
export NVIDIA_API_KEY="nvapi-..."
export NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"
```
