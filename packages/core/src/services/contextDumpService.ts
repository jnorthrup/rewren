/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../config/config.js';
import { SessionService } from './sessionService.js';

export interface ContextDumpMetadata {
  timestamp: string;
  sessionId: string;
  model: string;
  totalMessages: number;
  estimatedTokens: number;
  contextReorgTrigger: 'manual' | 'threshold' | 'automatic';
  memoryItems: MemoryItem[];
  activeTasks: TaskContext[];
  criticalReferences: CriticalReference[];
}

export interface MemoryItem {
  type: 'user-requirement' | 'estimated-deliverable' | 'task-context' | 'transient';
  content: string;
  timestamp: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  source: string;
}

export interface TaskContext {
  id: string;
  description: string;
  status: 'active' | 'pending' | 'completed' | 'blocked';
  priority: 'critical' | 'high' | 'medium' | 'low';
  dependencies: string[];
  deliverables: string[];
}

export interface CriticalReference {
  type: 'file' | 'function' | 'class' | 'api' | 'url';
  identifier: string;
  location: string;
  importance: 'critical' | 'high' | 'medium';
  lastReferenced: string;
}

export interface ContextDump {
  metadata: ContextDumpMetadata;
  messages: Content[];
  sessionState: {
    currentWorkingDirectory: string;
    activeFiles: string[];
    recentCommands: string[];
    environmentVariables: Record<string, string>;
  };
}

export class ContextDumpService {
  private readonly dumpDirectory = '.wren/context-dumps';
  private readonly forensicDirectory = '.wren/forensic-todos';

  constructor(private config: Config) {}

  /**
   * Creates a context dump of the current conversation and session state
   */
  async createContextDump(
    messages: Content[],
    trigger: 'manual' | 'threshold' | 'automatic' = 'manual',
    memoryItems: MemoryItem[] = [],
    activeTasks: TaskContext[] = [],
    criticalReferences: CriticalReference[] = []
  ): Promise<string> {
    // Ensure proper gitignore rules are in place for dump files
    await this.ensureGitignoreRules();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sessionId = this.config.getSessionId();
    const model = this.config.getModel();

    // Estimate token count (rough approximation)
    const estimatedTokens = this.estimateTokenCount(messages);

    const metadata: ContextDumpMetadata = {
      timestamp,
      sessionId,
      model,
      totalMessages: messages.length,
      estimatedTokens,
      contextReorgTrigger: trigger,
      memoryItems,
      activeTasks,
      criticalReferences,
    };

    const dump: ContextDump = {
      metadata,
      messages,
      sessionState: {
        currentWorkingDirectory: this.config.getWorkingDir(),
        activeFiles: SessionService.getActiveFiles(),
        recentCommands: SessionService.getRecentCommands(),
        environmentVariables: this.getSafeEnvironmentVariables(),
      },
    };

    // Ensure dump directory exists
    const dumpDir = path.join(this.config.getWorkingDir(), this.dumpDirectory);
    await fs.promises.mkdir(dumpDir, { recursive: true });

    // Write dump file
    const filename = `context-dump-${timestamp}.json`;
    const filepath = path.join(dumpDir, filename);
    await fs.promises.writeFile(filepath, JSON.stringify(dump, null, 2), 'utf-8');

    return filepath;
  }

  /**
   * Lists all available context dumps
   */
  async listContextDumps(): Promise<string[]> {
    const dumpDir = path.join(this.config.getWorkingDir(), this.dumpDirectory);
    try {
      const files = await fs.promises.readdir(dumpDir);
      return files
        .filter(file => file.startsWith('context-dump-') && file.endsWith('.json'))
        .sort()
        .reverse(); // Most recent first
    } catch {
      return [];
    }
  }

  /**
   * Loads a context dump by filename
   */
  async loadContextDump(filename: string): Promise<ContextDump | null> {
    const dumpDir = path.join(this.config.getWorkingDir(), this.dumpDirectory);
    const filepath = path.join(dumpDir, filename);

    try {
      const content = await fs.promises.readFile(filepath, 'utf-8');
      return JSON.parse(content) as ContextDump;
    } catch {
      return null;
    }
  }

  /**
   * Gets the most recent context dump
   */
  async getLatestContextDump(): Promise<ContextDump | null> {
    const dumps = await this.listContextDumps();
    if (dumps.length === 0) {
      return null;
    }
    return this.loadContextDump(dumps[0]);
  }

  /**
   * Extracts essential context from a dump for micro-context creation
   */
  extractEssentialContext(dump: ContextDump, historyScanTokens?: number): {
    recentMessages: Content[];
    keyRequirements: MemoryItem[];
    activeTasks: TaskContext[];
    criticalReferences: CriticalReference[];
    summary: string;
  } {
    // Limit history scanning based on token parameter (default: scan all)
    const maxTokens = historyScanTokens || Number.MAX_SAFE_INTEGER;
    let tokenCount = 0;
    const messagesToScan: Content[] = [];

    // Scan messages from most recent backwards until token limit
    for (let i = dump.messages.length - 1; i >= 0 && tokenCount < maxTokens; i--) {
      const msg = dump.messages[i];
      const msgTokens = this.estimateMessageTokens(msg);
      if (tokenCount + msgTokens <= maxTokens) {
        messagesToScan.unshift(msg); // Add to front to maintain order
        tokenCount += msgTokens;
      } else {
        break;
      }
    }

    // Get recent messages (last 2-3 from the scanned set)
    const recentMessages = messagesToScan.slice(-3);

    // Filter for critical memory items from scanned messages
    const keyRequirements = dump.metadata.memoryItems.filter(
      item => item.type === 'user-requirement' || item.type === 'estimated-deliverable'
    );

    // Get active tasks
    const activeTasks = dump.metadata.activeTasks.filter(
      task => task.status === 'active' || task.status === 'pending'
    );

    // Get critical references
    const criticalReferences = dump.metadata.criticalReferences.filter(
      ref => ref.importance === 'critical' || ref.importance === 'high'
    );

    // Create a summary of the context
    const summary = this.createContextSummary(dump);

    return {
      recentMessages,
      keyRequirements,
      activeTasks,
      criticalReferences,
      summary,
    };
  }

  private estimateTokenCount(messages: Content[]): number {
    // Rough estimation: ~4 characters per token
    const totalChars = messages.reduce((sum, msg) => sum + JSON.stringify(msg).length, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * Ensures proper .gitignore rules are in place for CRUS dump files
   */
  private async ensureGitignoreRules(): Promise<void> {
    const gitignorePath = path.join(this.config.getWorkingDir(), '.gitignore');
    const dumpIgnorePattern = `${this.dumpDirectory}/`;
    const forensicIgnorePattern = `${this.forensicDirectory}/`;

    try {
      let gitignoreContent = '';

      // Read existing .gitignore if it exists
      if (await fs.promises.access(gitignorePath).then(() => true).catch(() => false)) {
        gitignoreContent = await fs.promises.readFile(gitignorePath, 'utf-8');
      }

      const lines = gitignoreContent.split('\n');
      let hasDumpIgnore = false;
      let hasForensicIgnore = false;

      // Check if patterns already exist
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === dumpIgnorePattern) hasDumpIgnore = true;
        if (trimmed === forensicIgnorePattern) hasForensicIgnore = true;
      }

      // Add missing patterns
      const additions: string[] = [];
      if (!hasDumpIgnore) additions.push(dumpIgnorePattern);
      if (!hasForensicIgnore) additions.push(forensicIgnorePattern);

      if (additions.length > 0) {
        // Add a comment header if this is the first CRUS-related ignore
        if (!gitignoreContent.includes('# Wren Context Reorganization System')) {
          additions.unshift('', '# Wren Context Reorganization System');
        }

        // Append to .gitignore
        const updatedContent = gitignoreContent + additions.join('\n') + '\n';
        await fs.promises.writeFile(gitignorePath, updatedContent, 'utf-8');
      }
    } catch (error) {
      // Silently fail - gitignore management is not critical to CRUS operation
      console.warn('Failed to update .gitignore for CRUS:', error);
    }
  }

  private createContextSummary(dump: ContextDump): string {
    const { metadata } = dump;
    const lines = [
      `Context Dump Summary (${metadata.timestamp})`,
      `Session: ${metadata.sessionId}`,
      `Model: ${metadata.model}`,
      `Messages: ${metadata.totalMessages}`,
      `Estimated Tokens: ${metadata.estimatedTokens}`,
      `Trigger: ${metadata.contextReorgTrigger}`,
      '',
      'Active Tasks:',
      ...metadata.activeTasks
        .filter(task => task.status === 'active')
        .map(task => `  - ${task.description} (${task.priority})`),
      '',
      'Key Requirements:',
      ...metadata.memoryItems
        .filter(item => item.type === 'user-requirement')
        .map(item => `  - ${item.content}`),
      '',
      'Critical References:',
      ...metadata.criticalReferences
        .filter(ref => ref.importance === 'critical')
        .map(ref => `  - ${ref.type}: ${ref.identifier} (${ref.location})`),
    ];

    return lines.join('\n');
  }

  /**
   * Gets safe environment variables for context preservation
   */
  private getSafeEnvironmentVariables(): Record<string, string> {
    const safeVars: Record<string, string> = {};
    const safePrefixes = ['NODE_', 'npm_', 'PATH', 'SHELL', 'HOME', 'USER'];

    for (const [key, value] of Object.entries(process.env)) {
      if (safePrefixes.some(prefix => key.startsWith(prefix)) && typeof value === 'string') {
        safeVars[key] = value;
      }
    }

    return safeVars;
  }

  /**
   * Estimates token count for a message
   */
  private estimateMessageTokens(message: Content): number {
    const content = message.parts?.map(part => 'text' in part ? part.text : '[non-text content]').join(' ') || '[no content]';
    // Rough estimation: ~4 characters per token
    return Math.ceil(content.length / 4);
  }
}