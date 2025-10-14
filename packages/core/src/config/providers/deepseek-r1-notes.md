# DeepSeek R1 Models - Reasoning Models

## Overview

DeepSeek R1 models are advanced reasoning models that exhibit explicit chain-of-thought reasoning before providing final answers, similar to OpenAI's o1/o3 models.

## Available Models

### DeepSeek-R1 (Full Model)

- **Model ID**: `deepseek-reasoner` or `deepseek-r1`
- **Token Limit**: 64,000 tokens
- **Type**: Reasoning model with visible thought process (671B parameters)
- **Provider**: DeepSeek
- **Base URL**: `https://api.deepseek.com/v1`

### DeepSeek-R1 Distilled Models

DeepSeek has released **distilled versions** of R1 that are smaller and faster while retaining much of the reasoning capability:

**Qwen-based Distilled Models:**
- `deepseek-r1-distill-qwen-1.5b` - 1.5B parameters
- `deepseek-r1-distill-qwen-7b` - 7B parameters
- `deepseek-r1-distill-qwen-14b` - 14B parameters
- `deepseek-r1-distill-qwen-32b` - 32B parameters

**Llama-based Distilled Models:**
- `deepseek-r1-distill-llama-8b` - 8B parameters
- `deepseek-r1-distill-llama-70b` - 70B parameters

These distilled models:
- Fine-tuned on 800k samples from DeepSeek-R1
- Support up to 32,768 token generation
- Recommended temperature: 0.5-0.7 (0.6 optimal)
- No system prompt needed (put instructions in user prompt)
- Available via NVIDIA NIM, Hugging Face, and other platforms

## Key Characteristics

### 1. Visible Reasoning Process

R1 models expose their internal reasoning process as "reasoning tokens" before the final answer:

```
<thinking>
Let me break down this problem step by step...
First, I need to consider...
Then, I should analyze...
Finally, I can conclude...
</thinking>

Final answer: Based on my analysis above, the solution is...
```

### 2. Token Usage

- **Reasoning tokens**: The model's internal thought process (visible in response)
- **Output tokens**: The final answer after reasoning
- **Both are billable** - total tokens = reasoning + output

### 3. Response Format

DeepSeek R1 uses standard OpenAI-compatible streaming format with `reasoning_content` field:

```typescript
{
  choices: [{
    delta: {
      role: "assistant",
      reasoning_content: "...",  // Thinking process
      content: "..."             // Final answer
    }
  }]
}
```

## Configuration

### Environment Variables

```bash
export DEEPSEEK_API_KEY="sk-..."
export DEEPSEEK_BASE_URL="https://api.deepseek.com/v1"  # Optional
```

### API Parameters

```typescript
{
  model: "deepseek-reasoner",
  messages: [...],
  max_tokens: 8192,           // Limit for final answer (not reasoning)
  temperature: 1.0,           // R1 works best at temperature 1.0
  stream: true
}
```

## Usage Guidelines

### When to Use R1 Models

✅ **Good for:**
- Complex reasoning tasks
- Multi-step problem solving
- Mathematical proofs
- Code analysis and debugging
- Logical deduction
- Planning and strategy

❌ **Not ideal for:**
- Simple factual queries
- Fast responses needed
- Token budget constraints
- Tasks not requiring deep reasoning

### Cost Considerations

R1 models use more tokens due to reasoning process:
- A simple query might use 100 tokens
- Same query with R1 might use 1000+ tokens (900 reasoning + 100 answer)
- Budget accordingly - reasoning tokens add significant cost

### Temperature Settings

DeepSeek R1 models are optimized for **temperature = 1.0**:
- Lower temperatures may reduce reasoning quality
- Higher temperatures may produce inconsistent results
- Stick to 1.0 for best results

## Implementation Notes

### Handling Reasoning Content

The content generator should:

1. **Capture reasoning tokens separately** from final answer
2. **Display reasoning** optionally to user (can be verbose)
3. **Count both** reasoning and output tokens for billing

```typescript
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;

  if (delta.reasoning_content) {
    // Optional: display thinking process
    console.log('[Thinking]', delta.reasoning_content);
  }

  if (delta.content) {
    // Display final answer
    console.log(delta.content);
  }
}
```

### Token Tracking

```typescript
{
  usage: {
    prompt_tokens: 100,
    reasoning_tokens: 900,    // Internal thought process
    completion_tokens: 100,   // Final answer
    total_tokens: 1100        // All billable tokens
  }
}
```

## Model Comparison

| Feature | DeepSeek R1 | OpenAI o1 | Standard GPT-4 |
|---------|-------------|-----------|----------------|
| Reasoning | Visible | Hidden | None |
| Cost | Moderate | High | Low |
| Speed | Slower | Slower | Faster |
| Token overhead | High | High | None |
| Best for | Complex tasks | Complex tasks | General use |

## Example Use Case

```typescript
// Good use of R1 model
const response = await openai.chat.completions.create({
  model: "deepseek-reasoner",
  messages: [{
    role: "user",
    content: "Prove that the square root of 2 is irrational"
  }],
  temperature: 1.0,
  max_tokens: 8192
});

// R1 will show step-by-step logical proof in reasoning_content
// Then provide clear summary in final content
```

## API Compatibility

DeepSeek R1 uses **OpenAI-compatible API** with extensions:
- Standard `/v1/chat/completions` endpoint
- Additional `reasoning_content` field in streaming responses
- Standard authentication with Bearer token
- No special content generator needed (uses OpenAIContentGenerator)

## References

- DeepSeek API Documentation: https://platform.deepseek.com/api-docs/
- Model Capabilities: https://github.com/deepseek-ai/DeepSeek-R1
