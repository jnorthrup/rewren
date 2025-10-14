/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ModelUsageService } from './modelUsageService.js';

export interface SessionState {
  sessionId: string;
  model: string;
  modelSwitchedDuringSession: boolean;
  savedAt: string;
  // optional snapshot of per-model usage timestamps for quick resume
  modelUsage?: Record<string, { lastUsed?: string | null; lastSuccess?: string | null; lastFailure?: string | null }>;
  // Active files being worked on in this session
  activeFiles?: string[];
  // Recent commands executed in this session
  recentCommands?: string[];
}

export class SessionService {
  private static readonly FILE_PATH = path.join('.wren', 'session.json');
  private static readonly MAX_ACTIVE_FILES = 20;
  private static readonly MAX_RECENT_COMMANDS = 50;
  private static activeFilesSet: Set<string> = new Set();
  private static recentCommandsList: string[] = [];

  private static ensureDir(): void {
    const dir = path.dirname(this.FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  static save(state: SessionState): boolean {
    try {
      this.ensureDir();
      fs.writeFileSync(this.FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('Failed to save session state:', e);
      return false;
    }
  }

  static load(): SessionState | null {
    try {
      if (!fs.existsSync(this.FILE_PATH)) return null;
      const content = fs.readFileSync(this.FILE_PATH, 'utf-8');
      const data: SessionState = JSON.parse(content);
      return data;
    } catch (e) {
      console.warn('Failed to load session state:', e);
      return null;
    }
  }

  static buildSnapshot(currentSessionId: string, model: string, switched: boolean): SessionState {
    const usage = ModelUsageService.getUsage(model);
    const snapshot: SessionState = {
      sessionId: currentSessionId,
      model,
      modelSwitchedDuringSession: switched,
      savedAt: new Date().toISOString(),
      modelUsage: {},
      activeFiles: Array.from(this.activeFilesSet),
      recentCommands: [...this.recentCommandsList],
    };
    if (usage) {
      snapshot.modelUsage![model] = {
        lastUsed: usage.lastUsed,
        lastSuccess: usage.lastSuccess,
        lastFailure: usage.lastFailure,
      };
    }
    return snapshot;
  }

  /**
   * Track a file as active in the current session
   */
  static trackActiveFile(filePath: string): void {
    this.activeFilesSet.add(filePath);
    // Limit the number of tracked files to prevent unbounded growth
    if (this.activeFilesSet.size > this.MAX_ACTIVE_FILES) {
      // Remove the oldest entry (first in the set)
      const firstEntry = this.activeFilesSet.values().next().value;
      if (firstEntry) {
        this.activeFilesSet.delete(firstEntry);
      }
    }
  }

  /**
   * Track a command as recently executed
   */
  static trackCommand(command: string): void {
    this.recentCommandsList.push(command);
    // Limit the number of tracked commands
    if (this.recentCommandsList.length > this.MAX_RECENT_COMMANDS) {
      this.recentCommandsList.shift(); // Remove oldest command
    }
  }

  /**
   * Get the list of active files
   */
  static getActiveFiles(): string[] {
    return Array.from(this.activeFilesSet);
  }

  /**
   * Get the list of recent commands
   */
  static getRecentCommands(): string[] {
    return [...this.recentCommandsList];
  }

  /**
   * Clear active files tracking
   */
  static clearActiveFiles(): void {
    this.activeFilesSet.clear();
  }

  /**
   * Clear recent commands tracking
   */
  static clearRecentCommands(): void {
    this.recentCommandsList = [];
  }

  /**
   * Restore session state from loaded data
   */
  static restore(state: SessionState): void {
    if (state.activeFiles) {
      this.activeFilesSet = new Set(state.activeFiles);
    }
    if (state.recentCommands) {
      this.recentCommandsList = [...state.recentCommands];
    }
  }
}
