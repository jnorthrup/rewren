/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelAdapter, HarmonyChannel } from './types.js';

export class PassthroughAdapter implements ChannelAdapter<unknown> {
  detect(_chunk: unknown): _chunk is unknown {
    return true; // Always matches as last resort
  }

  extract(chunk: unknown): HarmonyChannel[] {
    return [{ channel: 'final', content: JSON.stringify(chunk) }];
  }

  fallback(chunk: unknown): HarmonyChannel[] {
    return this.extract(chunk);
  }
}
