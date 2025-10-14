/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { isNodeError } from '../utils/errors.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getProjectHash, WREN_CODER_DIR } from '../utils/paths.js';

const execAsync = promisify(exec);

/**
 * PijulService - Patch-based version control for AI agent coordination
 *
 * Advantages over Git:
 * - No staging area (record -a combines add + commit)
 * - Commutative patches (independent changes apply in any order)
 * - Named patches with semantic identity
 * - Invertible operations (unrecord = precise undo)
 * - Better multi-agent coordination (patches don't conflict on hash)
 *
 * Gateway Strategy:
 * - Shadow repo uses Pijul for patch-based tracking
 * - PijulGit gateway syncs to user's Git repo on demand
 * - User sees normal Git commits, Wren uses Pijul patches internally
 *
 * Graph Node Integration (per user proposal):
 * - Pijul patches map naturally to graph nodes (DAG structure)
 * - Each patch = node with edges to dependencies
 * - Patch hash = content-addressed node ID (IPFS-compatible)
 * - Commutative patches = parallel graph branches that auto-merge
 * - Use case: Shadow provider tree changes with Pijul patches
 * - Benefits: Audit trail of config changes, rollback to any state
 */
export class PijulService {
  private projectRoot: string;
  private pijulBinary: string | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  private getHistoryDir(): string {
    const hash = getProjectHash(this.projectRoot);
    return path.join(os.homedir(), WREN_CODER_DIR, 'history', hash);
  }

  /**
   * Detect Pijul binary in priority order:
   * 1. System install: /Users/jim/.local/bin/pijul
   * 2. Local build: ../pijul/target/release/pijul
   * 3. PATH: 'pijul'
   */
  private async detectPijulBinary(): Promise<string> {
    if (this.pijulBinary) {
      return this.pijulBinary;
    }

    const candidates = [
      path.join(os.homedir(), '.local', 'bin', 'pijul'),
      path.resolve(this.projectRoot, '..', 'pijul', 'target', 'release', 'pijul'),
      'pijul', // PATH fallback
    ];

    for (const candidate of candidates) {
      try {
        const { stdout } = await execAsync(`${candidate} --version`);
        if (stdout.includes('pijul')) {
          this.pijulBinary = candidate;
          return candidate;
        }
      } catch {
        continue;
      }
    }

    throw new Error('Pijul binary not found. Install with: cargo install pijul');
  }

  async initialize(): Promise<void> {
    const pijulBinary = await this.detectPijulBinary();
    await this.setupShadowPijulRepository(pijulBinary);
  }

  verifyPijulAvailability(): Promise<boolean> {
    return this.detectPijulBinary()
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Creates a shadow Pijul repository for checkpointing
   *
   * Differences from Git:
   * - No .gitconfig needed (uses system defaults)
   * - No initial commit required (no staging area)
   * - Uses .ignore instead of .gitignore (same syntax)
   * - No branch concept - uses channels (main auto-created)
   */
  async setupShadowPijulRepository(pijulBinary: string) {
    const repoDir = this.getHistoryDir();
    await fs.mkdir(repoDir, { recursive: true });

    const pijulDir = path.join(repoDir, '.pijul');
    const pijulDirExists = await fs.access(pijulDir).then(() => true).catch(() => false);

    if (!pijulDirExists) {
      // Initialize Pijul repository
      await execAsync(`${pijulBinary} init`, { cwd: repoDir });
    }

    // Copy user's .gitignore to .ignore (Pijul uses same syntax)
    const userIgnorePath = path.join(this.projectRoot, '.gitignore');
    const shadowIgnorePath = path.join(repoDir, '.ignore');

    let userIgnoreContent = '';
    try {
      userIgnoreContent = await fs.readFile(userIgnorePath, 'utf-8');
    } catch (error) {
      if (isNodeError(error) && error.code !== 'ENOENT') {
        throw error;
      }
    }

    await fs.writeFile(shadowIgnorePath, userIgnoreContent);
  }

  /**
   * Execute Pijul command with shadow repository isolation
   * Uses --repository flag to target shadow repo without polluting user's project
   */
  private async execPijul(args: string[]): Promise<string> {
    const pijulBinary = await this.detectPijulBinary();
    const repoDir = this.getHistoryDir();

    const command = `${pijulBinary} ${args.join(' ')} --repository ${repoDir}`;
    const { stdout } = await execAsync(command, { cwd: this.projectRoot });
    return stdout.trim();
  }

  /**
   * Get current channel state hash
   * Pijul equivalent of: git rev-parse HEAD
   */
  async getCurrentHash(): Promise<string> {
    return this.getCurrentPatchHash();
  }

  async getCurrentPatchHash(): Promise<string> {
    try {
      // Get the latest patch hash from the log
      const output = await this.execPijul(['log', '--limit', '1', '--hash-only']);
      return output.trim();
    } catch (error) {
      // If no patches yet, return empty string (like empty Git repo)
      return '';
    }
  }

  /**
   * Create a snapshot as a Pijul patch
   *
   * Advantages over Git (add + commit):
   * - Single command: record -a (auto-stages all changes)
   * - Returns patch hash with semantic name
   * - Patch identity preserved across repositories
   * - No staging area ceremony
   */
  async createFileSnapshot(message: string): Promise<string> {
    try {
      // Pijul record -a = git add . + git commit -m
      // -a: record all changes
      // -m: message
      // --author: set author (optional, uses system default if omitted)
      const output = await this.execPijul([
        'record',
        '-a',
        '-m',
        `"${message.replace(/"/g, '\\"')}"`,
        '--author',
        '"Wren Coder CLI <wren@wren-coder.dev>"'
      ]);

      // Extract patch hash from output (format: "Recorded patch <HASH>")
      const hashMatch = output.match(/[A-Z0-9]{52}/);
      return hashMatch ? hashMatch[0] : await this.getCurrentPatchHash();
    } catch (error) {
      // If recording fails (no changes), return current state
      return await this.getCurrentPatchHash();
    }
  }

  /**
   * Restore project from a specific patch state
   *
   * Pijul advantages over Git:
   * - Option 1: unrecord (removes patch, keeps it for re-apply later)
   * - Option 2: reset (hard reset to channel state)
   * - Patches are invertible - can undo specific changes without losing others
   *
   * Implementation uses reset for Git-like behavior
   */
  async restoreProjectFromSnapshot(patchHash: string): Promise<void> {
    if (!patchHash) {
      throw new Error('Cannot restore from empty patch hash');
    }

    // Pijul reset: revert working directory to specific patch state
    // Similar to: git restore --source <hash> .
    // Automatically cleans untracked files
    await this.execPijul(['reset', '--patch', patchHash]);
  }

  /**
   * Sync Pijul patches to Git repository via PijulGit gateway
   *
   * Gateway flow:
   * 1. Wren creates Pijul patches (internal shadow repo)
   * 2. PijulGit translates patches → Git commits
   * 3. User sees normal Git history
   *
   * Currently supports: GitLab + Nest
   * Pending: GitHub support
   *
   * @param gitRepoPath - Path to user's Git repository
   * @param pijulGitBinary - Path to PijulGit gateway binary (optional)
   */
  async syncToGit(gitRepoPath: string, pijulGitBinary?: string): Promise<void> {
    const gateway = pijulGitBinary || 'pijulgit'; // Assume in PATH if not provided
    const repoDir = this.getHistoryDir();

    try {
      // PijulGit syntax (from github.com/purplesyringa/PijulGit):
      // pijulgit sync --pijul <pijul-repo> --git <git-repo>
      await execAsync(
        `${gateway} sync --pijul ${repoDir} --git ${gitRepoPath}`,
        { cwd: this.projectRoot }
      );
    } catch (error) {
      // Gateway not available - log warning but don't fail
      // This allows Pijul-only operation without Git sync
      console.warn('PijulGit gateway not available:', error);
      console.warn('Shadow repo uses Pijul only. Install PijulGit for Git sync.');
    }
  }

  /**
   * List all patches (for debugging/audit)
   * Returns array of patch metadata
   */
  async listPatches(limit?: number): Promise<string[]> {
    const args = ['log', '--hash-only'];
    if (limit) {
      args.push('--limit', String(limit));
    }

    const output = await this.execPijul(args);
    return output.split('\n').filter(line => line.trim());
  }

  /**
   * Get patch details (for DORA audit trail)
   * Shows: hash, author, timestamp, message
   */
  async getPatchInfo(patchHash: string): Promise<string> {
    return await this.execPijul(['log', '--hash', patchHash]);
  }
}
