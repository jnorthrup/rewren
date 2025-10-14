/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ModelUsage {
  model: string;
  lastUsed: string | null;
  lastSuccess: string | null;
  lastFailure: string | null;
  successCount: number;
  failureCount: number;
  totalRequests: number;
}

interface ModelUsageStore {
  models: ModelUsage[];
}

export class ModelUsageService {
  private static readonly FILE_PATH = path.join('.wren', 'model-usage.json');
  private static readonly DEFAULT: ModelUsageStore = { models: [] };

  private static ensureDir(): void {
    const dir = path.dirname(this.FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private static read(): ModelUsageStore {
    try {
      if (!fs.existsSync(this.FILE_PATH)) {
        this.ensureDir();
        this.write(this.DEFAULT);
        return JSON.parse(JSON.stringify(this.DEFAULT));
      }
      const content = fs.readFileSync(this.FILE_PATH, 'utf-8');
      const data: ModelUsageStore = JSON.parse(content);
      // normalize
      data.models = (data.models || []).map(m => ({
        model: m.model,
        lastUsed: m.lastUsed ?? null,
        lastSuccess: m.lastSuccess ?? null,
        lastFailure: m.lastFailure ?? null,
        successCount: m.successCount ?? 0,
        failureCount: m.failureCount ?? 0,
        totalRequests: m.totalRequests ?? 0,
      }));
      return data;
    } catch (e) {
      console.warn('Failed to read model usage file, starting fresh:', e);
      return JSON.parse(JSON.stringify(this.DEFAULT));
    }
  }

  private static write(store: ModelUsageStore): boolean {
    try {
      this.ensureDir();
      fs.writeFileSync(this.FILE_PATH, JSON.stringify(store, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('Failed to write model usage file:', e);
      return false;
    }
  }

  static recordUsage(model: string, success: boolean): boolean {
    const store = this.read();
    let entry = store.models.find(m => m.model === model);
    const now = new Date().toISOString();
    if (!entry) {
      entry = {
        model,
        lastUsed: now,
        lastSuccess: success ? now : null,
        lastFailure: success ? null : now,
        successCount: success ? 1 : 0,
        failureCount: success ? 0 : 1,
        totalRequests: 1,
      };
      store.models.push(entry);
    } else {
      entry.lastUsed = now;
      if (success) {
        entry.lastSuccess = now;
        entry.successCount = (entry.successCount || 0) + 1;
      } else {
        entry.lastFailure = now;
        entry.failureCount = (entry.failureCount || 0) + 1;
      }
      entry.totalRequests = (entry.totalRequests || 0) + 1;
    }

    return this.write(store);
  }

  static getUsage(model: string): ModelUsage | null {
    const store = this.read();
    return store.models.find(m => m.model === model) || null;
  }
}
