/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Content,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensResponse,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Part,
  FinishReason,
} from '@google/genai';
import { ContentGenerator } from './contentGenerator.js';
import { HarmonyAdapter } from '../adapters/harmonyAdapter.js';
import type { HarmonyChannel } from '../adapters/types.js';

export interface HarmonyContentGeneratorConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export class HarmonyContentGenerator implements ContentGenerator {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private headers: Record<string, string>;
  // Track streaming channel markers so we only emit start markers once per stream
  private reasoningStarted: boolean = false;
  private commentaryStarted: boolean = false;
  // Accumulate tool calls when Harmony emits tool call deltas (if any)
  private streamingToolCalls: Map<number, { id?: string; name?: string; arguments?: string }> = new Map();
  private adapter: HarmonyAdapter;

  constructor(config: HarmonyContentGeneratorConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.harmony.example.com/v1'; // Placeholder URL
    this.model = config.model;
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    this.adapter = new HarmonyAdapter();
  }

  async generateContent(
    request: GenerateContentParameters
  ): Promise<GenerateContentResponse> {
    // Convert Gemini format to Harmony API format
    const harmonyRequest = this.convertToHarmonyFormat(request);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(harmonyRequest),
    });

    if (!response.ok) {
      throw new Error(`Harmony API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return this.convertFromHarmonyFormat(data);
  }

  async generateContentStream(
    request: GenerateContentParameters
  ): Promise<AsyncGenerator<GenerateContentResponse, void, unknown>> {
    // Convert Gemini format to Harmony API format for streaming
    const harmonyRequest = this.convertToHarmonyFormat(request);
    // Add stream flag
    harmonyRequest.stream = true;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(harmonyRequest),
    });

    if (!response.ok) {
      throw new Error(`Harmony API error: ${response.status} ${await response.text()}`);
    }

    // Create an async generator for streaming responses
  async function* streamGenerator(this: HarmonyContentGenerator) {
      const reader = response.body?.getReader();
      if (!reader) {
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
                    if (data === '[DONE]') {
                      // Reset channel markers for next stream
                      this.reasoningStarted = false;
                      this.commentaryStarted = false;
                      return;
                    }

            try {
              const parsed = JSON.parse(data);
              const adapted = this.adapter.adapt(parsed);
              if (adapted.ok) {
                const parts: Part[] = (adapted.value as HarmonyChannel[]).flatMap((ch: HarmonyChannel) => {
                  const part: Part = { text: ch.content } as Part;
                    if (ch.marker === '👽') {
                      (part as unknown as { isReasoning?: boolean }).isReasoning = true;
                    }
                    if (ch.marker === '👓') {
                      (part as unknown as { isCommentary?: boolean }).isCommentary = true;
                    }
                  return [part];
                });

                yield {
                  candidates: [
                    {
                      content: {
                        role: 'model',
                        parts,
                      },
                      finishReason: 'STOP',
                      index: 0,
                    },
                  ],
                } as GenerateContentResponse;
              }
            } catch (e) {
              console.warn('Error parsing Harmony stream data:', e);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    return streamGenerator.call(this);
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Harmony doesn't typically have a countTokens endpoint, so we'll estimate
    // For now, return a default response
    const contents = Array.isArray(request.contents) &&
                     request.contents.length > 0 &&
                     typeof request.contents[0] === 'object' &&
                     'parts' in request.contents[0]
      ? request.contents as Content[]
      : [];
    const estimatedTokens = this.estimateTokenCount(contents);
    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(_request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Harmony doesn't typically provide embedding functionality
    // For now, throw an error indicating it's not supported
    throw new Error('Embedding functionality not supported for Harmony provider');
  }

  private estimateTokenCount(contents: Content[]): number {
    let totalChars = 0;
    for (const content of contents) {
      for (const part of content.parts || []) {
        if ('text' in part && part.text) {
          totalChars += part.text.length;
        }
      }
    }
    // Rough estimation: 1 token ~ 4 characters
    return Math.ceil(totalChars / 4);
  }

  private convertToHarmonyFormat(
    request: GenerateContentParameters
  ): Record<string, unknown> {
    const contents = Array.isArray(request.contents) &&
                     request.contents.length > 0 &&
                     typeof request.contents[0] === 'object' &&
                     'parts' in request.contents[0]
      ? request.contents as Content[]
      : [];
    const messages = this.convertGeminiContentsToHarmony(contents);

    // Handle JSON format requirement
    const harmonyRequest: Record<string, unknown> = {
      model: this.model,
      messages,
    };

    // Handle response format (for JSON)
    // Note: The structure might be different depending on the actual Harmony API

    return harmonyRequest;
  }

  private convertGeminiContentsToHarmony(contents: Content[]): unknown[] {
    return contents.map(content => {
      let role = content.role || 'user';
      if (role === 'model') role = 'assistant'; // Map Gemini's 'model' to OpenAI's 'assistant'
      
      // Process all parts (text, function calls, etc.)
      const processedParts: string[] = [];
      
      for (const part of content.parts || []) {
        if ('text' in part && part.text) {
          processedParts.push(part.text);
        } else if ('functionCall' in part && part.functionCall) {
          // Handle function calls for structured output
          // Emit a Harmony commentary-style preamble so Harmony-mode engines can show
          // the model is invoking a function. This mirrors other generators that
          // surface commentary (👓) for tool-call preambles.
          try {
            const fcObj = (part.functionCall as unknown) as Record<string, unknown> | undefined;
            const name = fcObj?.name ? String(fcObj.name) : 'unknown_function';
            const args = fcObj?.args ? JSON.stringify(fcObj.args) : '{}';
            // Include a short commentary preamble that Harmony providers can
            // interpret or surface in their commentary channel.
            processedParts.push(`👓 Calling ${name}... to=functions.${name}`);
            processedParts.push(args);
          } catch (_err) {
            processedParts.push(`[FUNCTION_CALL: ${JSON.stringify(part.functionCall)}]`);
          }
        } else if ('functionResponse' in part && part.functionResponse) {
          // Handle function responses
          processedParts.push(`[FUNCTION_RESPONSE: ${JSON.stringify(part.functionResponse)}]`);
        }
      }
      
      return {
        role,
        content: processedParts.join('\n'),
      };
    });
  }

  private convertFromHarmonyFormat(data: unknown): GenerateContentResponse {
    // Convert Harmony API response (or streaming chunk) to Gemini format.
    // Harmony streaming chunks are often emitted as objects with a `type`
    // (e.g. 'response.reasoning_text.delta', 'response.commentary.delta',
    // 'response.output_text.delta') and a `delta` payload. When called from
    // generateContentStream we wrap parsed chunks as { choices: [parsed] } so
    // handle both full message responses and individual chunks here.
    const maybeChoices = (data as unknown as { choices?: unknown[] })?.choices;
    const choice = Array.isArray(maybeChoices) ? maybeChoices[0] : {};
    const choiceObj: Record<string, unknown> = (typeof choice === 'object' && choice !== null)
      ? (choice as Record<string, unknown>)
      : {};

    // If this looks like a Harmony streaming chunk (has a `type` field),
    // convert channel deltas into Gemini parts with custom flags used by the UI.
    if ('type' in choiceObj && typeof choiceObj.type === 'string') {
      const parts: Part[] = [];
  const t = String(choiceObj.type);

      if (t.startsWith('response.reasoning_text')) {
        // Emit start marker once
        if (!this.reasoningStarted) {
          // @ts-expect-error - custom isReasoning flag for UI
          parts.push({ text: '👽 ', isReasoning: true, isChannelMarker: true });
          this.reasoningStarted = true;
        }
  const deltaText = String(choiceObj.delta ?? choiceObj.reasoning_text ?? '');
        // @ts-expect-error - custom isReasoning flag for UI
        parts.push({ text: deltaText, isReasoning: true });
      } else if (t.startsWith('response.commentary')) {
        if (!this.commentaryStarted) {
          // @ts-expect-error - custom isCommentary flag for UI
          parts.push({ text: '👓 ', isCommentary: true, isChannelMarker: true });
          this.commentaryStarted = true;
        }
  const deltaText = String(choiceObj.delta ?? '');
        // @ts-expect-error - custom isCommentary flag for UI
        parts.push({ text: deltaText, isCommentary: true });
      } else if (t.startsWith('response.output_text')) {
  const deltaText = String(choiceObj.delta ?? choiceObj.output_text ?? '');
        parts.push({ text: deltaText });
      } else if (t === 'response.done') {
        // Stream finished for all channels; reset markers so next stream can re-emit markers
        this.reasoningStarted = false;
        this.commentaryStarted = false;
      }

      return {
        candidates: [
          {
            content: {
              role: 'model',
              parts,
            },
            finishReason: FinishReason.STOP,
            index: Number(choiceObj.index ?? 0),
          },
        ],
        promptFeedback: undefined,
        text: undefined,
        data: undefined,
        functionCalls: undefined,
        executableCode: undefined,
        codeExecutionResult: undefined,
      };
    }

    // Otherwise, handle as a full (non-streaming) Harmony message with message/tool_calls
    const choicesArr = Array.isArray((data as unknown as { choices?: unknown[] })?.choices)
      ? ((data as unknown as { choices?: unknown[] })?.choices as unknown[])
      : undefined;

    const candidates = choicesArr?.map((c: unknown) => {
      const cObj = (typeof c === 'object' && c !== null) ? (c as Record<string, unknown>) : {};
      const message = cObj.message ?? {};
      const messageObj = (typeof message === 'object' && message !== null) ? (message as Record<string, unknown>) : {};
      const contentParts: Part[] = [];

      // Add text content
      if (messageObj.content && typeof messageObj.content === 'string') {
        contentParts.push({ text: String(messageObj.content) });
      }

      // Process function/tool calls if present in the response
      if (Array.isArray(messageObj.tool_calls)) {
        for (const toolCall of messageObj.tool_calls as unknown[]) {
          const tcObj = (typeof toolCall === 'object' && toolCall !== null) ? (toolCall as Record<string, unknown>) : {};
          const fn = (tcObj.function && typeof tcObj.function === 'object') ? (tcObj.function as Record<string, unknown>) : undefined;
          if (fn) {
            try {
              const args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments as string) : {};
              contentParts.push({
                functionCall: {
                  name: String(fn.name),
                  args,
                }
              });
            } catch (_err) {
              contentParts.push({
                functionCall: {
                  name: String(fn.name),
                  args: {},
                }
              });
            }
          }
        }
      }

      return {
        content: {
          role: 'model',
          parts: contentParts,
        },
  finishReason: FinishReason.STOP,
        index: Number(cObj.index ?? 0),
      };
  }) || [];

    const result: GenerateContentResponse = {
      candidates: candidates || [],
      promptFeedback: undefined,
      text: undefined,
      data: undefined,
      functionCalls: undefined,
      executableCode: undefined,
      codeExecutionResult: undefined,
    };

    return result;
  }

}