/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelAdapter, HarmonyChannel, z } from './types.js';

const GeminiSchema = z.object({
  contents: z.array(z.object({
    parts: z.array(z.any()).optional(),
    thought: z.any().optional(),
  })).optional(),
  candidates: z.array(z.object({
    content: z.object({
      parts: z.array(z.any()).optional(),
    }).optional(),
  })).optional(),
});

export class GeminiAdapter implements ChannelAdapter<z.infer<typeof GeminiSchema>> {
  detect(chunk: unknown): chunk is z.infer<typeof GeminiSchema> {
    return GeminiSchema.safeParse(chunk).success;
  }

  extract(chunk: z.infer<typeof GeminiSchema>): HarmonyChannel[] {
    const channels: HarmonyChannel[] = [];

    // Handle contents format (request format)
    const contentParts = chunk.contents?.[0]?.parts || [];
    for (const p of contentParts) {
      if (p.text && p.role !== 'tool') {
        channels.push({ channel: 'final', content: p.text });
      }
      if (p.thought) {
        channels.push({ channel: 'analysis', content: String(p.thought), marker: '👽' });
      }
    }

    // Handle candidates format (response format)
    const candidateParts = chunk.candidates?.[0]?.content?.parts || [];
    for (const p of candidateParts) {
      if (p.text && p.role !== 'tool') {
        channels.push({ channel: 'final', content: p.text });
      }
      if (p.thought) {
        channels.push({ channel: 'analysis', content: String(p.thought), marker: '👽' });
      }
      // Map tool calls to commentary channel
      if (p.functionCall) {
        channels.push({
          channel: 'commentary',
          content: JSON.stringify(p.functionCall),
          marker: '👓'
        });
      }
    }

    return channels;
  }

  fallback(chunk: unknown): HarmonyChannel[] {
    return [{ channel: 'final', content: String(chunk) }];
  }
}
