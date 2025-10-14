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
import { simpleGit, SimpleGit, CheckRepoActions } from 'simple-git';
import { getProjectHash, WREN_CODER_DIR } from '../utils/paths.js';

// PIJUL ALTERNATIVE: Replace with exec('pijul') calls or pijul Node.js bindings
// Pijul binary paths (in priority order):
//   1. System: /Users/jim/.local/bin/pijul (currently installed)
//   2. Local build: ../pijul/target/release/pijul (not built yet)
//   3. Fallback: 'pijul' from PATH
// Benefits: Patch-based model, no staging area, commutative patches for multi-agent
// Trade-offs: Smaller ecosystem, requires Rust toolchain for building
//
// PIJUL-GIT GATEWAY STRATEGY:
// - Use PijulGit (github.com/purplesyringa/PijulGit) for bidirectional sync
// - Wren shadow repo: Pijul (patch-based, multi-agent friendly)
// - User's repo: Git (unchanged, GitHub/GitLab compatible)
// - Gateway translates: Pijul patches → Git commits on user push
// - Advantage: Internal patch commutation + external Git workflow
// - Workflow: Wren records Pijul patches → PijulGit syncs to user's .git
// - User sees: Normal Git commits (no Pijul knowledge required)
// - Currently supports: GitLab + Nest (GitHub support pending)

export class GitService {
  private projectRoot: string;
  private usePijul: boolean = false; // Toggle: false = Git only, true = Pijul + gateway

  constructor(projectRoot: string, options?: { usePijul?: boolean }) {
    this.projectRoot = path.resolve(projectRoot);
    this.usePijul = options?.usePijul || false;
  }

  private getHistoryDir(): string {
    const hash = getProjectHash(this.projectRoot);
    return path.join(os.homedir(), WREN_CODER_DIR, 'history', hash);
    // PIJUL: Same pattern, but stores .pijul instead of .git
  }

  async initialize(): Promise<void> {
    // PIJUL: When usePijul=true, skip Git check and use PijulService instead
    // Gateway handles Git sync transparently
    if (this.usePijul) {
      const { PijulService } = await import('./pijulService.js');
      const pijulService = new PijulService(this.projectRoot);
      const pijulAvailable = await pijulService.verifyPijulAvailability();
      if (!pijulAvailable) {
        throw new Error(
          'Pijul mode enabled but Pijul not installed. Install: cargo install pijul'
        );
      }
      return; // PijulService handles its own initialization
    }

    const gitAvailable = await this.verifyGitAvailability();
    if (!gitAvailable) {
      throw new Error(
        'Checkpointing is enabled, but Git is not installed. Please install Git or disable checkpointing to continue.',
      );
    }
    this.setupShadowGitRepository();
  }

  // PIJUL: Change to exec('pijul --version') or check ../pijul/target/release/pijul
  verifyGitAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      exec('git --version', (error) => {
        if (error) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Creates a hidden git repository in the project root.
   * The Git repository is used to support checkpointing.
   *
   * PIJUL ALTERNATIVE:
   * 1. exec('pijul init') in repoDir (no .gitconfig needed)
   * 2. Pijul has no staging area - no need for initial empty commit
   * 3. Pijul uses .ignore file (similar to .gitignore)
   * 4. exec('pijul record -a -m "Initial snapshot"') for first patch
   * 5. No branch concept - Pijul uses channels (main channel auto-created)
   */
  async setupShadowGitRepository() {
    const repoDir = this.getHistoryDir();
    const gitConfigPath = path.join(repoDir, '.gitconfig');

    await fs.mkdir(repoDir, { recursive: true });

    // We don't want to inherit the user's name, email, or gpg signing
    // preferences for the shadow repository, so we create a dedicated gitconfig.
    // PIJUL: No config needed - uses system-wide pijul config or defaults
    const gitConfigContent =
      '[user]\n  name = Wren Coder CLI\n  email = gemini-cli@google.com\n[commit]\n  gpgsign = false\n';
    await fs.writeFile(gitConfigPath, gitConfigContent);

    const repo = simpleGit(repoDir);
    const isRepoDefined = await repo.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);

    if (!isRepoDefined) {
      // PIJUL: exec('pijul init', { cwd: repoDir })
      await repo.init(false, {
        '--initial-branch': 'main',
      });

      // PIJUL: Not needed - no initial commit required
      await repo.commit('Initial commit', { '--allow-empty': null });
    }

    const userGitIgnorePath = path.join(this.projectRoot, '.gitignore');
    const shadowGitIgnorePath = path.join(repoDir, '.gitignore');
    // PIJUL: Use .ignore instead of .gitignore (same syntax)

    let userGitIgnoreContent = '';
    try {
      userGitIgnoreContent = await fs.readFile(userGitIgnorePath, 'utf-8');
    } catch (error) {
      if (isNodeError(error) && error.code !== 'ENOENT') {
        throw error;
      }
    }

    await fs.writeFile(shadowGitIgnorePath, userGitIgnoreContent);
  }

  // PIJUL: Replace with exec() wrapper targeting isolated .pijul directory
  // Pijul doesn't use GIT_DIR/GIT_WORK_TREE - instead:
  //   - Run pijul commands with --repository <repoDir>
  //   - Or set PIJUL_REPO_DIR environment variable
  private get shadowGitRepository(): SimpleGit {
    const repoDir = this.getHistoryDir();
    return simpleGit(this.projectRoot).env({
      GIT_DIR: path.join(repoDir, '.git'),
      GIT_WORK_TREE: this.projectRoot,
      // Prevent git from using the user's global git config.
      HOME: repoDir,
      XDG_CONFIG_HOME: repoDir,
    });
  }

  // PIJUL: exec('pijul log --repository <repoDir> --hash-only | head -1')
  // Or: pijul channel show-hash (returns current channel state hash)
  async getCurrentHash(): Promise<string> {
    return this.getCurrentCommitHash();
  }

  async getCurrentCommitHash(): Promise<string> {
    // PIJUL DELEGATION: Route to PijulService if enabled
    if (this.usePijul) {
      const { PijulService } = await import('./pijulService.js');
      const pijulService = new PijulService(this.projectRoot);
      await pijulService.initialize();
      return await pijulService.getCurrentPatchHash();
    }

    const hash = await this.shadowGitRepository.raw('rev-parse', 'HEAD');
    return hash.trim();
  }

  // PIJUL: Simpler - no staging area!
  // exec('pijul record -a -m "<message>" --repository <repoDir>')
  // -a = auto-add all changes (no separate 'add' step)
  // Returns patch hash directly
  // Benefits: One command instead of two, patch has semantic name + hash
  async createFileSnapshot(message: string): Promise<string> {
    // PIJUL DELEGATION: Route to PijulService if enabled
    if (this.usePijul) {
      const { PijulService } = await import('./pijulService.js');
      const pijulService = new PijulService(this.projectRoot);
      await pijulService.initialize();
      return await pijulService.createFileSnapshot(message);
    }

    const repo = this.shadowGitRepository;
    await repo.add('.'); // PIJUL: Not needed - record -a auto-stages
    const commitResult = await repo.commit(message);
    return commitResult.commit;
  }

  // PIJUL: More precise rollback options
  // Option 1: exec('pijul unrecord <patchHash> --repository <repoDir>')
  //   - Removes patch from history, inverts changes
  //   - Better for "undo last AI change" - doesn't lose intermediate work
  // Option 2: exec('pijul reset --repository <repoDir> --channel <state>')
  //   - Reset to specific channel state (like git restore)
  // Advantage: Patch unrecord is invertible - can re-apply later
  async restoreProjectFromSnapshot(commitHash: string): Promise<void> {
    // PIJUL DELEGATION: Route to PijulService if enabled
    if (this.usePijul) {
      const { PijulService } = await import('./pijulService.js');
      const pijulService = new PijulService(this.projectRoot);
      await pijulService.initialize();
      return await pijulService.restoreProjectFromSnapshot(commitHash);
    }

    const repo = this.shadowGitRepository;
    await repo.raw(['restore', '--source', commitHash, '.']);
    // Removes any untracked files that were introduced post snapshot.
    // PIJUL: pijul reset cleans untracked files automatically
    await repo.clean('f', ['-d']);
  }
}
