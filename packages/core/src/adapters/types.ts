/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

// Result type
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// Harmony channel representation
export type HarmonyChannel = {
  channel: 'analysis' | 'commentary' | 'final';
  content: string;
  marker?: '👽' | '👓';
};

// Adapter interface
export interface ChannelAdapter<T> {
  detect(chunk: unknown): chunk is T;
  extract(chunk: T): HarmonyChannel[];
  fallback(chunk: unknown): HarmonyChannel[];
}

// Export z for convenience in adapters
export { z };
