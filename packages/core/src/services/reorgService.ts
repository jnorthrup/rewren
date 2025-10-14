/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { Config } from '../config/config.js';
import {
  ContextDumpService,
  type MemoryItem,
  type TaskContext,
  type CriticalReference,
  type ContextDump,
} from './contextDumpService.js';
import {
  MicroContextEditor,
  type MicroContext,
  type ReorgParameters,
} from './microContextEditor.js';
import { ForensicTodoService } from './forensicTodoService.js';

type ContextContent = Parameters<ContextDumpService['createContextDump']>[0][number];

export interface ReorgOptions {
  trigger?: 'manual' | 'threshold' | 'automatic';
  messages: ContextContent[];
  parameters?: Partial<ReorgParameters>;
  memoryItems?: MemoryItem[];
  activeTasks?: TaskContext[];
  criticalReferences?: CriticalReference[];
}

export interface ReorgResult {
  dumpPath: string;
  dumpFilename: string;
  dumpMetadata: ContextDump['metadata'];
  microContext: MicroContext;
  compressedPrompt: string;
  estimatedTokens: number;
}

export class ReorgService {
  constructor(private readonly config: Config) {}

  async reorganize(options: ReorgOptions): Promise<ReorgResult> {
    const {
      trigger = 'manual',
      messages,
      parameters,
      memoryItems = [],
      activeTasks = [],
      criticalReferences = [],
    } = options;

    const contextDumpService = new ContextDumpService(this.config);
    const dumpPath = await contextDumpService.createContextDump(
      messages,
      trigger,
      memoryItems,
      activeTasks,
      criticalReferences,
    );

    const dumpFilename = path.basename(dumpPath);
    const dump = await contextDumpService.loadContextDump(dumpFilename);
    if (!dump) {
      throw new Error(`Failed to load context dump ${dumpFilename}`);
    }

    const microContextEditor = new MicroContextEditor(
      this.config,
      contextDumpService,
      parameters,
    );
    const microContext = await microContextEditor.createMicroContext(dump);
    const compressedPrompt = microContextEditor.createCompressedPrompt(microContext);

    const forensicTodoService = new ForensicTodoService(this.config);
    await forensicTodoService.createContextRecoveryTodos(dumpPath);

    return {
      dumpPath,
      dumpFilename,
      dumpMetadata: dump.metadata,
      microContext,
      compressedPrompt,
      estimatedTokens: microContext.estimatedTokens,
    };
  }
}
