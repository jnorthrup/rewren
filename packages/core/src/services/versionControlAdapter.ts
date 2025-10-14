/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GitService } from './gitService.js';
import { PijulService } from './pijulService.js';

/**
 * Version Control Adapter - Unified interface for Git and Pijul
 *
 * Strategy Pattern:
 * - GitService: Snapshot-based VCS (production default)
 * - PijulService: Patch-based VCS (multi-agent mode)
 * - Transparent switching via environment variable or config
 *
 * IPFS-Git Gateway Consideration (per user note):
 * - Pijul is NOT a first-class repo for general use
 * - Primary use case: Shadow repo for AI agent coordination
 * - IPFS trustless gateway advantage: Content-addressed patches
 * - Pijul patches → IPFS CIDs = immutable audit trail
 * - Gateway translates to Git for user's workflow
 *
 * Configuration:
 * - WREN_VCS_BACKEND=git (default)
 * - WREN_VCS_BACKEND=pijul (experimental, multi-agent)
 * - WREN_PIJUL_GIT_GATEWAY=<path> (optional PijulGit binary)
 */

export interface VersionControlService {
  initialize(): Promise<void>;
  createFileSnapshot(message: string): Promise<string>;
  restoreProjectFromSnapshot(hash: string): Promise<void>;
  getCurrentHash(): Promise<string>;
}

export class VersionControlAdapter implements VersionControlService {
  private backend: VersionControlService;
  private projectRoot: string;
  private pijulGitGateway?: string;

  constructor(
    projectRoot: string,
    options?: {
      backend?: 'git' | 'pijul';
      pijulGitGateway?: string;
    }
  ) {
    this.projectRoot = projectRoot;
    this.pijulGitGateway = options?.pijulGitGateway;

    const backendType = options?.backend || process.env.WREN_VCS_BACKEND || 'git';

    if (backendType === 'pijul') {
      this.backend = new PijulService(projectRoot);
    } else {
      this.backend = new GitService(projectRoot);
    }
  }

  async initialize(): Promise<void> {
    await this.backend.initialize();
  }

  async createFileSnapshot(message: string): Promise<string> {
    const hash = await this.backend.createFileSnapshot(message);

    // If using Pijul + gateway, sync to Git
    if (this.backend instanceof PijulService && this.pijulGitGateway) {
      await this.syncPijulToGit();
    }

    return hash;
  }

  async restoreProjectFromSnapshot(hash: string): Promise<void> {
    await this.backend.restoreProjectFromSnapshot(hash);
  }

  async getCurrentHash(): Promise<string> {
    return await this.backend.getCurrentHash();
  }

  /**
   * Sync Pijul patches to Git via PijulGit gateway
   * Only active when:
   * - Backend is PijulService
   * - Gateway binary configured
   * - User's project has .git directory
   */
  private async syncPijulToGit(): Promise<void> {
    if (!(this.backend instanceof PijulService)) {
      return;
    }

    const fs = await import('fs/promises');
    const path = await import('path');

    // Check if user's project is a Git repo
    const gitDir = path.join(this.projectRoot, '.git');
    const isGitRepo = await fs.access(gitDir).then(() => true).catch(() => false);

    if (!isGitRepo || !this.pijulGitGateway) {
      return; // No Git repo or no gateway - Pijul-only mode
    }

    // Sync Pijul shadow repo → User's Git repo
    await this.backend.syncToGit(this.projectRoot, this.pijulGitGateway);
  }

  /**
   * Get audit trail (for DORA forensics)
   * Returns patch/commit history for debugging "which AI change broke tests"
   */
  async getHistory(limit: number = 10): Promise<string[]> {
    if (this.backend instanceof PijulService) {
      return await this.backend.listPatches(limit);
    }

    // Git: Would need to add listCommits() to GitService
    return [];
  }
}

/**
 * Factory function for creating VCS adapter
 * Usage:
 *   const vcs = createVersionControlService(projectRoot);
 *   await vcs.initialize();
 *   const hash = await vcs.createFileSnapshot("AI turn 42");
 */
export function createVersionControlService(
  projectRoot: string,
  options?: {
    backend?: 'git' | 'pijul';
    pijulGitGateway?: string;
  }
): VersionControlService {
  return new VersionControlAdapter(projectRoot, options);
}
