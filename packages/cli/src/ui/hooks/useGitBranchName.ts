/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'path';

export function useGitBranchName(cwd: string): string | undefined {
  const [branchName, setBranchName] = useState<string | undefined>(undefined);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const checkDirtyStatus = useCallback(() => {
    exec(
      'git status --porcelain',
      { cwd },
      (error, stdout, _stderr) => {
        if (error) {
          setIsDirty(false);
          return;
        }
        // If there's any output, the repo is dirty
        setIsDirty(stdout.toString().trim().length > 0);
      },
    );
  }, [cwd]);

  const fetchBranchName = useCallback(
    () => {
      exec(
        'git rev-parse --abbrev-ref HEAD',
        { cwd },
        (error, stdout, _stderr) => {
          if (error) {
            setBranchName(undefined);
            setIsDirty(false);
            return;
          }
          const branch = stdout.toString().trim();
          if (branch && branch !== 'HEAD') {
            setBranchName(branch);
            checkDirtyStatus();
          } else {
            exec(
              'git rev-parse --short HEAD',
              { cwd },
              (error, stdout, _stderr) => {
                if (error) {
                  setBranchName(undefined);
                  setIsDirty(false);
                  return;
                }
                setBranchName(stdout.toString().trim());
                checkDirtyStatus();
              },
            );
          }
        },
      );
    },
    [cwd, checkDirtyStatus],
  );

  useEffect(() => {
    fetchBranchName(); // Initial fetch

    const gitLogsHeadPath = path.join(cwd, '.git', 'logs', 'HEAD');
    const gitIndexPath = path.join(cwd, '.git', 'index');
    let headWatcher: fs.FSWatcher | undefined;
    let indexWatcher: fs.FSWatcher | undefined;
    let statusCheckInterval: NodeJS.Timeout | undefined;

    const setupWatchers = async () => {
      try {
        // Watch .git/logs/HEAD for branch changes
        await fsPromises.access(gitLogsHeadPath, fs.constants.F_OK);
        headWatcher = fs.watch(gitLogsHeadPath, (eventType: string) => {
          if (eventType === 'change' || eventType === 'rename') {
            fetchBranchName();
          }
        });
      } catch (_watchError) {
        // Silently ignore watcher errors
      }

      try {
        // Watch .git/index for dirty status changes
        await fsPromises.access(gitIndexPath, fs.constants.F_OK);
        indexWatcher = fs.watch(gitIndexPath, (eventType: string) => {
          if (eventType === 'change') {
            checkDirtyStatus();
          }
        });
      } catch (_watchError) {
        // Silently ignore watcher errors
      }

      // Also poll dirty status every 5 seconds as a fallback
      // (some changes might not trigger index updates immediately)
      statusCheckInterval = setInterval(checkDirtyStatus, 5000);
    };

    setupWatchers();

    return () => {
      headWatcher?.close();
      indexWatcher?.close();
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
      }
    };
  }, [cwd, fetchBranchName, checkDirtyStatus]);

  // Return branch name with asterisk if dirty
  return branchName && isDirty ? `${branchName}*` : branchName;
}
