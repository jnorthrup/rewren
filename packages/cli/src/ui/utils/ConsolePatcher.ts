/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import util from 'util';
import { ConsoleMessageItem } from '../types.js';

interface ConsolePatcherParams {
  onNewMessage: (message: Omit<ConsoleMessageItem, 'id'>) => void;
  debugMode: boolean;
}

export class ConsolePatcher {
  private originalConsoleLog = console.log;
  private originalConsoleWarn = console.warn;
  private originalConsoleError = console.error;
  private originalConsoleDebug = console.debug;

  private params: ConsolePatcherParams;
  private isProcessing = false; // Loop prevention flag
  private messageQueue: Array<{ type: 'log' | 'warn' | 'error' | 'debug'; content: string }> = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_MS = 100; // Debounce messages within 100ms window

  constructor(params: ConsolePatcherParams) {
    this.params = params;
  }

  patch() {
    console.log = this.patchConsoleMethod('log', this.originalConsoleLog);
    console.warn = this.patchConsoleMethod('warn', this.originalConsoleWarn);
    console.error = this.patchConsoleMethod('error', this.originalConsoleError);
    console.debug = this.patchConsoleMethod('debug', this.originalConsoleDebug);
  }

  cleanup = () => {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.flushQueue(); // Flush any pending messages
    console.log = this.originalConsoleLog;
    console.warn = this.originalConsoleWarn;
    console.error = this.originalConsoleError;
    console.debug = this.originalConsoleDebug;
  };

  private formatArgs = (args: unknown[]): string => util.format(...args);

  private flushQueue = () => {
    if (this.isProcessing || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    try {
      // Process all queued messages
      const messagesToProcess = [...this.messageQueue];
      this.messageQueue = [];

      for (const msg of messagesToProcess) {
        try {
          this.params.onNewMessage({
            type: msg.type,
            content: msg.content,
            count: 1,
          });
        } catch (error) {
          // Prevent recursive errors - log to original console only
          this.originalConsoleError.call(console, 'Error in onNewMessage handler:', error);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  };

  private queueMessage = (type: 'log' | 'warn' | 'error' | 'debug', content: string) => {
    // Prevent runaway queuing - limit to 1000 messages
    if (this.messageQueue.length >= 1000) {
      if (this.messageQueue.length === 1000) {
        this.originalConsoleWarn.call(console, 'Console message queue limit reached - dropping messages');
      }
      return;
    }

    this.messageQueue.push({ type, content });

    // Debounce the flush
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.flushQueue();
    }, this.DEBOUNCE_MS);
  };

  private patchConsoleMethod =
    (
      type: 'log' | 'warn' | 'error' | 'debug',
      originalMethod: (...args: unknown[]) => void,
    ) =>
    (...args: unknown[]) => {
      // Prevent re-entrant calls during message processing
      if (this.isProcessing) {
        originalMethod.apply(console, args);
        return;
      }

      if (this.params.debugMode) {
        originalMethod.apply(console, args);
      }

      if (type !== 'debug' || this.params.debugMode) {
        try {
          const content = this.formatArgs(args);
          this.queueMessage(type, content);
        } catch (error) {
          // Fail-safe: If even formatting fails, log to original console
          originalMethod.call(console, 'ConsolePatcher error:', error);
        }
      }
    };
}
