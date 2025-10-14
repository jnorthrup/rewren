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
import { Config } from '../config/config.js';

export interface ReasoningContentGeneratorConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Content generator for OpenAI Responses API (reasoning models)
 * Used for models like o1, o3, and reasoning-capable models on NVIDIA
 */
export class ReasoningContentGenerator implements ContentGenerator {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private config: Config;

  constructor(config: Config, reasoningConfig: ReasoningContentGeneratorConfig) {
    this.apiKey = reasoningConfig.apiKey;
    this.baseUrl = reasoningConfig.baseUrl;
    this.model = reasoningConfig.model;
    this.config = config;
  }

  async generateContent(
    request: GenerateContentParameters
  ): Promise<GenerateContentResponse> {
    const contents = Array.isArray(request.contents) &&
                     request.contents.length > 0 &&
                     typeof request.contents[0] === 'object' &&
                     'parts' in request.contents[0]
      ? request.contents as Content[]
      : [];

    // Convert to input array for Responses API
    const input = this.convertToInputArray(contents);

    const reasoningRequest = {
      model: this.model,
      input,
      max_output_tokens: 4096,
      top_p: 1,
      temperature: 1,
      stream: false, // Non-streaming for now
    };

    const response = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reasoningRequest),
    });

    if (!response.ok) {
      throw new Error(`Reasoning API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return this.convertToGeminiFormat(data);
  }

  async generateContentStream(
    request: GenerateContentParameters
  ): Promise<AsyncGenerator<GenerateContentResponse, void, unknown>> {
    return this.generateContentStreamInternal(request);
  }

  private async *generateContentStreamInternal(
    request: GenerateContentParameters
  ): AsyncGenerator<GenerateContentResponse, void, unknown> {
    const contents = Array.isArray(request.contents) &&
                     request.contents.length > 0 &&
                     typeof request.contents[0] === 'object' &&
                     'parts' in request.contents[0]
      ? request.contents as Content[]
      : [];

    const input = this.convertToInputArray(contents);

    const reasoningRequest = {
      model: this.model,
      input,
      max_output_tokens: request.config?.maxOutputTokens || 4096,
      top_p: request.config?.topP || 1,
      temperature: request.config?.temperature || 1,
      stream: true,
    };

    const response = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reasoningRequest),
    });

    if (!response.ok) {
      throw new Error(`Reasoning API error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body available for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let reasoningText = '';
    let outputText = '';
    let currentParts: Part[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') continue;

          try {
            const chunk = JSON.parse(jsonStr);

            // Handle reasoning text chunks
            if (chunk.type === 'response.reasoning_text.delta') {
              reasoningText += chunk.delta;
              currentParts = [
                { text: `[Reasoning]: ${reasoningText}` },
              ];
            }
            // Handle output text chunks
            else if (chunk.type === 'response.output_text.delta') {
              outputText += chunk.delta;
              currentParts = [
                { text: `[Reasoning]: ${reasoningText}\n\n${outputText}` },
              ];
            }

            // Yield the current state
            yield {
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: currentParts,
                  },
                  finishReason: FinishReason.STOP,
                  index: 0,
                },
              ],
              promptFeedback: undefined,
              text: undefined,
              data: undefined,
              functionCalls: undefined,
              executableCode: undefined,
              codeExecutionResult: undefined,
            };
          } catch (e) {
            console.error('Error parsing streaming chunk:', e);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Estimate tokens (reasoning API doesn't provide token counting)
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

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error('Embedding not supported for reasoning models');
  }

  private convertToInputArray(contents: Content[]): string[] {
    const input: string[] = [];

    for (const content of contents) {
      for (const part of content.parts || []) {
        if ('text' in part && part.text) {
          input.push(part.text);
        }
      }
    }

    return input;
  }

  private convertToGeminiFormat(reasoningResponse: any): GenerateContentResponse {
    const reasoningText = reasoningResponse.reasoning_text || '';
    const outputText = reasoningResponse.output_text || '';

    const fullText = reasoningText
      ? `[Reasoning]: ${reasoningText}\n\n${outputText}`
      : outputText;

    return {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text: fullText }],
          },
          finishReason: FinishReason.STOP,
          index: 0,
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

  private estimateTokenCount(contents: Content[]): number {
    let totalChars = 0;
    for (const content of contents) {
      for (const part of content.parts || []) {
        if ('text' in part && part.text) {
          totalChars += part.text.length;
        }
      }
    }
    return Math.ceil(totalChars / 4);
  }
}
