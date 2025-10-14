/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PijulService } from './pijulService.js';
import { PijulGraphAdapter, GraphNode } from './pijulGraphAdapter.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * PijulDevelopmentBridge - Makes Pijul graph available during active development
 *
 * Core Features:
 * 1. Query patch history while coding (what changed when)
 * 2. Annotate patches with AI model/turn metadata
 * 3. Import existing Git history into Pijul graph
 * 4. Quick rollback to any previous state
 *
 * DORA Alignment:
 * - Audit trail: "Which AI change broke tests?"
 * - Small steps: Track individual AI turns as patches
 * - Verification: Link patches to test results
 */
export class PijulDevelopmentBridge {
  private pijulService: PijulService;
  private graphAdapter: PijulGraphAdapter;

  constructor(private projectRoot: string) {
    this.pijulService = new PijulService(projectRoot);
    this.graphAdapter = new PijulGraphAdapter(projectRoot);
  }

  async initialize(): Promise<void> {
    await this.pijulService.initialize();
    await this.graphAdapter.initialize();
  }

  /**
   * Record AI turn as Pijul patch with metadata
   * Call this after every AI response that modifies files
   */
  async recordAITurn(metadata: {
    turnNumber: number;
    model: string;
    provider: string;
    filesChanged: string[];
    promptSummary: string;
    testsPassed?: boolean;
  }): Promise<string> {
    const message = `AI Turn ${metadata.turnNumber}: ${metadata.promptSummary}

Model: ${metadata.model}
Provider: ${metadata.provider}
Files: ${metadata.filesChanged.join(', ')}
Tests: ${metadata.testsPassed !== undefined ? (metadata.testsPassed ? 'PASS' : 'FAIL') : 'NOT_RUN'}`;

    const patchHash = await this.pijulService.createFileSnapshot(message);
    return patchHash;
  }

  /**
   * Get recent AI turns with patch hashes
   * Use this to show "what did the AI change in the last N turns?"
   */
  async getRecentAITurns(limit: number = 10): Promise<GraphNode[]> {
    return await this.graphAdapter.getGraph(limit);
  }

  /**
   * Rollback to specific AI turn
   * Use this for "undo last 3 AI changes"
   */
  async rollbackToTurn(patchHash: string): Promise<void> {
    await this.pijulService.restoreProjectFromSnapshot(patchHash);
  }

  /**
   * Import existing Git history into Pijul graph
   * Enables audit trail for brownfield projects
   *
   * Strategy:
   * 1. Get Git log with file changes
   * 2. For each commit, replay changes into Pijul
   * 3. Preserve commit messages and timestamps
   * 4. Build Pijul patch DAG matching Git history
   */
  async importGitHistory(options: {
    since?: string;  // Git revision (e.g., "HEAD~10", "main~50")
    limit?: number;  // Max commits to import
  } = {}): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const since = options.since || 'HEAD~50';  // Default: last 50 commits
    const limit = options.limit || 50;

    const result = { imported: 0, skipped: 0, errors: [] as string[] };

    try {
      // Get Git log in reverse chronological order (oldest first for Pijul)
      const { stdout: logOutput } = await execAsync(
        `git log --reverse --pretty=format:"%H|%an|%ae|%at|%s" ${since}..HEAD`,
        { cwd: this.projectRoot, maxBuffer: 10 * 1024 * 1024 }
      );

      const commits = logOutput.trim().split('\n').slice(0, limit);

      for (const line of commits) {
        if (!line.trim()) continue;

        const [hash, author, email, timestamp, ...messageParts] = line.split('|');
        const message = messageParts.join('|');

        try {
          // Get files changed in this commit
          const { stdout: filesOutput } = await execAsync(
            `git diff-tree --no-commit-id --name-only -r ${hash}`,
            { cwd: this.projectRoot }
          );
          const filesChanged = filesOutput.trim().split('\n').filter(Boolean);

          // Checkout this commit's state temporarily
          await execAsync(`git checkout ${hash} -- .`, { cwd: this.projectRoot });

          // Create Pijul patch with Git commit metadata
          const pijulMessage = `[Git Import] ${message}

Original commit: ${hash}
Author: ${author} <${email}>
Date: ${new Date(parseInt(timestamp) * 1000).toISOString()}
Files: ${filesChanged.join(', ')}`;

          await this.pijulService.createFileSnapshot(pijulMessage);
          result.imported++;

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          result.errors.push(`Failed to import ${hash}: ${errorMsg}`);
          result.skipped++;
        }
      }

      // Restore working directory to HEAD
      await execAsync(`git checkout HEAD -- .`, { cwd: this.projectRoot });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Git history import failed: ${errorMsg}`);
    }

    return result;
  }

  /**
   * Get Pijul graph visualization for debugging
   * Returns ASCII art DAG of patches
   */
  async visualizeGraph(limit: number = 20): Promise<string> {
    const nodes = await this.graphAdapter.getGraph(limit);

    const lines: string[] = ['Pijul Patch Graph:', ''];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const isFirst = i === 0;
      const isLast = i === nodes.length - 1;

      const prefix = isFirst ? '┌─' : (isLast ? '└─' : '├─');
      const shortHash = node.id.substring(0, 8);
      const age = this.formatAge(node.timestamp);
      const messageLine = node.message.split('\n')[0].substring(0, 60);

      lines.push(`${prefix} ${shortHash} (${age}) ${messageLine}`);

      if (!isLast) {
        lines.push('│');
      }
    }

    return lines.join('\n');
  }

  /**
   * Check if current working directory has uncommitted changes
   * Helps prevent "AI changed things I didn't commit yet" issues
   */
  async hasUncommittedChanges(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('git status --porcelain', {
        cwd: this.projectRoot
      });
      return stdout.trim().length > 0;
    } catch {
      return false;  // Not a git repo or git not available
    }
  }

  /**
   * Diff two patches to see what changed
   */
  async diffPatches(fromPatch: string, toPatch: string): Promise<string> {
    try {
      const pijulBinary = 'pijul';  // Simplified, assumes in PATH
      const { stdout } = await execAsync(
        `${pijulBinary} diff --from-patch ${fromPatch} --to-patch ${toPatch}`,
        { cwd: this.projectRoot, maxBuffer: 10 * 1024 * 1024 }
      );
      return stdout;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to diff patches: ${errorMsg}`);
    }
  }

  private formatAge(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }
}
