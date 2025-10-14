/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelAdapter, HarmonyChannel, z } from './types.js';

const R1ChunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({
      reasoning_content: z.string().optional(),
      content: z.string().optional(),
      tool_calls: z.array(z.any()).optional(),
    }).optional(),
  }))
});

export class R1Adapter implements ChannelAdapter<z.infer<typeof R1ChunkSchema>> {
  detect(chunk: unknown): chunk is z.infer<typeof R1ChunkSchema> {
    return R1ChunkSchema.safeParse(chunk).success;
  }

  extract(chunk: z.infer<typeof R1ChunkSchema>): HarmonyChannel[] {
    const delta = chunk.choices[0]?.delta;
    if (!delta) return [];

    const channels: HarmonyChannel[] = [];
    if (delta.reasoning_content) {
      channels.push({ channel: 'analysis', content: delta.reasoning_content, marker: '👽' });
    }
    if (delta.content) {
      channels.push({ channel: 'final', content: delta.content });
    }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        channels.push({ channel: 'commentary', content: JSON.stringify(tc), marker: '👓' });
      }
    }
    return channels;
  }

  fallback(chunk: unknown): HarmonyChannel[] {
    return [{ channel: 'final', content: String(chunk) }];
  }
}
