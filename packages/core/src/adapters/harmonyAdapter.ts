/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelAdapter, HarmonyChannel, Result, Ok } from './types.js';
import { R1Adapter } from './r1Adapter.js';
import { GeminiAdapter } from './geminiAdapter.js';
import { PassthroughAdapter } from './passthroughAdapter.js';

export class HarmonyAdapter {
  private adapters: Array<ChannelAdapter<unknown>>;

  constructor() {
  this.adapters = [new R1Adapter(), new GeminiAdapter(), new PassthroughAdapter()];
  }

  adapt(chunk: unknown): Result<HarmonyChannel[], Error> {
    for (const adapter of this.adapters) {
      try {
        if (adapter.detect(chunk)) {
          return Ok(adapter.extract(chunk));
        }
      } catch (e) {
        // swallow and continue
        console.warn(`Adapter failure: ${e}`);
      }
    }

    // Fallback guaranteed
    return Ok([{ channel: 'final', content: JSON.stringify(chunk) }]);
  }
}
