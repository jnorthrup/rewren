/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Atomic file writer helper.
 * Writes JSON (or string) to a temporary file in the same directory and renames it
 * into place. On POSIX this pattern avoids partial-write races and supports atomic
 * replace semantics needed for watchers that rely on mv/rename.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export function atomicWriteFileSync(targetPath: string, contents: string | Buffer): void {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  // Use a temp file in the same directory
  const tmpName = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);

  // Ensure dir exists
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_e) {
    // ignore
  }

  // Write file, fsync, then rename
  const fd = fs.openSync(tmpName, 'w', 0o600);
  try {
    if (typeof contents === 'string') {
      fs.writeSync(fd, contents, null, 'utf8');
    } else {
      fs.writeSync(fd, contents, 0, contents.length);
    }
    // flush to disk
    try {
      fs.fsyncSync(fd);
    } catch (_e) {
      // best-effort
    }
  } finally {
    try { fs.closeSync(fd); } catch (_e) {}
  }

  // Use rename to atomically replace
  fs.renameSync(tmpName, targetPath);
}

export function atomicWriteJsonSync(targetPath: string, obj: unknown, space = 2): void {
  const json = JSON.stringify(obj, null, space);
  atomicWriteFileSync(targetPath, json);
}

export async function atomicWriteFile(targetPath: string, contents: string | Buffer): Promise<void> {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tmpName = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);

  await fs.promises.mkdir(dir, { recursive: true });
  const fh = await fs.promises.open(tmpName, 'w', 0o600);
  try {
    if (typeof contents === 'string') {
      await fh.writeFile(contents, 'utf8');
    } else {
      await fh.write(contents);
    }
    try { await fh.sync(); } catch (_e) {}
  } finally {
    await fh.close();
  }

  await fs.promises.rename(tmpName, targetPath);
}

export async function atomicWriteJson(targetPath: string, obj: unknown, space = 2): Promise<void> {
  const json = JSON.stringify(obj, null, space);
  await atomicWriteFile(targetPath, json);
}

export default {
  atomicWriteFileSync,
  atomicWriteJsonSync,
  atomicWriteFile,
  atomicWriteJson,
};
