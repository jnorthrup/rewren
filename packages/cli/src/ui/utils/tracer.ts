/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lightweight tracer for CLI UI.
 * - If an IDE companion server is available (WREN_IDE_SERVER_PORT env var),
 *   forward log entries to it via HTTP so the extension can write them to
 *   the VS Code OutputChannel.
 * - Otherwise, fall back to console methods.
 */

type Level = 'info' | 'debug' | 'warn' | 'error';

const IDE_PORT = process.env.WREN_IDE_SERVER_PORT;
const IDE_TRACE_URL = IDE_PORT ? `http://127.0.0.1:${IDE_PORT}/trace` : null;

async function sendToIde(level: Level, message: string) {
  if (!IDE_TRACE_URL) return false;
  try {
    // Use global fetch when available (Node 18+). If not available, skip.
    if (typeof fetch === 'undefined') return false;
    void fetch(IDE_TRACE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message, timestamp: new Date().toISOString() }),
    }).catch(() => {});
    return true;
  } catch (_err) {
    return false;
  }
}

function formatArgs(args: unknown[]) {
  try {
    return args
      .map((a) => {
        if (a instanceof Error) {
          return a.stack ?? a.message;
        }
        if (typeof a === 'object') {
          try {
            return JSON.stringify(a);
          } catch (_e) {
            return String(a);
          }
        }
        return String(a);
      })
      .join(' ');
  } catch (_) {
    return args.map(String).join(' ');
  }
}

export async function info(...args: unknown[]) {
  const msg = formatArgs(args);
  const ok = await sendToIde('info', msg);
  if (!ok) console.log(msg);
}


export async function debug(...args: unknown[]) {
  const msg = formatArgs(args);
  const ok = await sendToIde('debug', msg);
  if (!ok) console.debug(msg);
}


export async function warn(...args: unknown[]) {
  const msg = formatArgs(args);
  const ok = await sendToIde('warn', msg);
  if (!ok) console.warn(msg);
}


export async function error(...args: unknown[]) {
  const msg = formatArgs(args);
  const ok = await sendToIde('error', msg);
  if (!ok) console.error(msg);
}

export { info as infoTracer, debug as debugTracer, warn as warnTracer, error as errorTracer };
