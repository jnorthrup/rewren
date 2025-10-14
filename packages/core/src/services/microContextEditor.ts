/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content } from '@google/genai';
import { Config } from '../config/config.js';
import { ContextDumpService, ContextDump, MemoryItem, TaskContext, CriticalReference } from './contextDumpService.js';

export interface ReorgParameters {
  /** Maximum tokens for the micro-context (default: 20000) */
  maxMicroContextTokens: number;

  /** How many tokens to scan from conversation history (default: 50000) */
  historyScanTokens: number;

  /** Whether to bleed back into history or remain in single context (default: false) */
  bleedIntoHistory: boolean;

  /** Whether to create TOC indexes for dense matter compression (default: true) */
  enableTocIndexing: boolean;

  /** Priority weights for different content types (0-1 scale) */
  contentWeights: {
    summary: number;
    recentMessages: number;
    keyRequirements: number;
    activeTasks: number;
    criticalReferences: number;
  };

  /** Minimum importance threshold for including items (0-1 scale) */
  minImportanceThreshold: number;

  /** Whether to preserve conversation flow markers (default: true) */
  preserveConversationFlow: boolean;
}

export interface MicroContext {
  summary: string;
  recentMessages: Content[];
  keyRequirements: MemoryItem[];
  activeTasks: TaskContext[];
  criticalReferences: CriticalReference[];
  estimatedTokens: number;
  createdAt: string;
  tocIndexes?: TocIndex[]; // Table of contents for dense matter lookup
}

export interface TocIndex {
  id: string;
  title: string;
  type: 'requirement' | 'task' | 'reference' | 'discussion';
  location: string; // Reference to dump file location
  importance: number;
  tokenDensity: number; // How much information per token
}

export class MicroContextEditor {
  private readonly DEFAULT_PARAMETERS: ReorgParameters = {
    maxMicroContextTokens: 20000,
    historyScanTokens: 50000,
    bleedIntoHistory: false,
    enableTocIndexing: true,
    contentWeights: {
      summary: 1.0,
      recentMessages: 0.8,
      keyRequirements: 0.9,
      activeTasks: 0.7,
      criticalReferences: 0.6,
    },
    minImportanceThreshold: 0.3,
    preserveConversationFlow: true,
  };

  constructor(
    private config: Config,
    private contextDumpService: ContextDumpService,
    private parameters: Partial<ReorgParameters> = {}
  ) {}

  /**
   * Gets the current reorg parameters (merged with defaults)
   */
  getParameters(): ReorgParameters {
    return { ...this.DEFAULT_PARAMETERS, ...this.parameters };
  }

  /**
   * Updates reorg parameters
   */
  setParameters(params: Partial<ReorgParameters>): void {
    this.parameters = { ...this.parameters, ...params };
  }

  /**
   * Creates a micro-context from a full context dump
   * Extracts essential information while staying under the token limit
   */
  async createMicroContext(dump: ContextDump): Promise<MicroContext> {
    const params = this.getParameters();
    const essential = this.contextDumpService.extractEssentialContext(dump, params.historyScanTokens);

    const microContext: MicroContext = {
      summary: essential.summary,
      recentMessages: essential.recentMessages,
      keyRequirements: [],
      activeTasks: [],
      criticalReferences: [],
      estimatedTokens: 0,
      createdAt: new Date().toISOString(),
      tocIndexes: params.enableTocIndexing ? [] : undefined,
    };

    // Add key requirements (weighted by importance and content weight)
    const sortedRequirements = essential.keyRequirements
      .filter(req => this.calculateImportanceScore(req) >= params.minImportanceThreshold)
      .sort((a, b) => this.calculateImportanceScore(b) - this.calculateImportanceScore(a));

    for (const req of sortedRequirements) {
      if (this.wouldExceedTokenLimit(microContext, req)) break;
      microContext.keyRequirements.push(req);

      // Add TOC index if enabled
      if (params.enableTocIndexing && microContext.tocIndexes) {
        microContext.tocIndexes.push({
          id: `req-${req.timestamp}`,
          title: req.content.substring(0, 50) + (req.content.length > 50 ? '...' : ''),
          type: 'requirement',
          location: `dump:${dump.metadata.sessionId}:requirements`,
          importance: this.calculateImportanceScore(req),
          tokenDensity: this.calculateTokenDensity(req.content),
        });
      }
    }

    // Add active tasks (weighted)
    const sortedTasks = essential.activeTasks
      .filter(task => this.calculateTaskPriorityScore(task) >= params.minImportanceThreshold)
      .sort((a, b) => this.calculateTaskPriorityScore(b) - this.calculateTaskPriorityScore(a));

    for (const task of sortedTasks) {
      if (this.wouldExceedTokenLimit(microContext, task)) break;
      microContext.activeTasks.push(task);

      // Add TOC index if enabled
      if (params.enableTocIndexing && microContext.tocIndexes) {
        microContext.tocIndexes.push({
          id: `task-${task.id}`,
          title: task.description.substring(0, 50) + (task.description.length > 50 ? '...' : ''),
          type: 'task',
          location: `dump:${dump.metadata.sessionId}:tasks`,
          importance: this.calculateTaskPriorityScore(task),
          tokenDensity: this.calculateTokenDensity(task.description),
        });
      }
    }

    // Add critical references (weighted)
    const sortedReferences = essential.criticalReferences
      .filter(ref => this.calculateReferenceImportanceScore(ref) >= params.minImportanceThreshold)
      .sort((a, b) => this.calculateReferenceImportanceScore(b) - this.calculateReferenceImportanceScore(a));

    for (const ref of sortedReferences) {
      if (this.wouldExceedTokenLimit(microContext, ref)) break;
      microContext.criticalReferences.push(ref);

      // Add TOC index if enabled
      if (params.enableTocIndexing && microContext.tocIndexes) {
        microContext.tocIndexes.push({
          id: `ref-${ref.identifier}`,
          title: `${ref.type}: ${ref.identifier}`,
          type: 'reference',
          location: `dump:${dump.metadata.sessionId}:references`,
          importance: this.calculateReferenceImportanceScore(ref),
          tokenDensity: this.calculateTokenDensity(ref.identifier + ref.location),
        });
      }
    }

    // Update token count
    microContext.estimatedTokens = this.estimateMicroContextTokens(microContext);

    return microContext;
  }

  /**
   * Creates a compressed prompt from micro-context for model consumption
   */
  createCompressedPrompt(microContext: MicroContext): string {
    const params = this.getParameters();
    const lines = [
      '=== MICRO CONTEXT RECOVERY ===',
      '',
      'CONTEXT SUMMARY:',
      microContext.summary,
      '',
    ];

    if (params.preserveConversationFlow) {
      lines.push(
        'RECENT CONVERSATION:',
        ...microContext.recentMessages.map((msg, i) => {
          const role = msg.role?.toUpperCase() || 'UNKNOWN';
          const content = msg.parts?.map(part => 'text' in part ? part.text : '[non-text content]').join(' ') || '[no content]';
          return `${role} ${i + 1}: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`;
        }),
        ''
      );
    }

    lines.push(
      'KEY REQUIREMENTS:',
      ...microContext.keyRequirements.map(req => `- ${req.content} (${req.importance})`),
      '',
      'ACTIVE TASKS:',
      ...microContext.activeTasks.map(task =>
        `- ${task.description} [${task.status.toUpperCase()}] (${task.priority})`
      ),
      '',
      'CRITICAL REFERENCES:',
      ...microContext.criticalReferences.map(ref =>
        `- ${ref.type}: ${ref.identifier} (${ref.location})`
      )
    );

    if (microContext.tocIndexes && microContext.tocIndexes.length > 0) {
      lines.push(
        '',
        'TABLE OF CONTENTS (for dense matter lookup):',
        ...microContext.tocIndexes
          .sort((a, b) => b.importance - a.importance)
          .map(index => `  ${index.id}: ${index.title} [${index.type}, imp:${index.importance.toFixed(2)}, density:${index.tokenDensity.toFixed(1)}]`)
      );
    }

    lines.push(
      '',
      '=== END MICRO CONTEXT ===',
      '',
      'Continue the conversation with full context awareness. Reference the above context and TOC indexes as needed for dense information retrieval.'
    );

    return lines.join('\n');
  }

  /**
   * Validates that a micro-context stays within token limits
   */
  validateMicroContext(microContext: MicroContext): boolean {
    const params = this.getParameters();
    return microContext.estimatedTokens <= params.maxMicroContextTokens;
  }

  /**
   * Gets the current micro-context token limit
   */
  getMaxTokens(): number {
    const params = this.getParameters();
    return params.maxMicroContextTokens;
  }

  private wouldExceedTokenLimit(
    currentContext: MicroContext,
    newItem: MemoryItem | TaskContext | CriticalReference
  ): boolean {
    const params = this.getParameters();
    const testContext = { ...currentContext };
    if ('type' in newItem && 'content' in newItem) {
      // MemoryItem
      testContext.keyRequirements = [...testContext.keyRequirements, newItem as MemoryItem];
    } else if ('status' in newItem) {
      // TaskContext
      testContext.activeTasks = [...testContext.activeTasks, newItem as TaskContext];
    } else {
      // CriticalReference
      testContext.criticalReferences = [...testContext.criticalReferences, newItem as CriticalReference];
    }

    const estimatedTokens = this.estimateMicroContextTokens(testContext);
    return estimatedTokens > params.maxMicroContextTokens;
  }

  private estimateMicroContextTokens(microContext: MicroContext): number {
    const compressedPrompt = this.createCompressedPrompt(microContext);
    // Rough estimation: ~4 characters per token
    return Math.ceil(compressedPrompt.length / 4);
  }

  private calculateImportanceScore(item: MemoryItem): number {
    const params = this.getParameters();
    const baseScore = item.importance === 'critical' ? 1.0 :
                     item.importance === 'high' ? 0.7 :
                     item.importance === 'medium' ? 0.4 : 0.1;

    // Weight by content type priority
    const typeWeight = item.type === 'user-requirement' ? params.contentWeights.keyRequirements :
                      item.type === 'estimated-deliverable' ? params.contentWeights.keyRequirements * 0.8 :
                      item.type === 'task-context' ? params.contentWeights.activeTasks :
                      params.contentWeights.keyRequirements * 0.5;

    return baseScore * typeWeight;
  }

  private calculateTaskPriorityScore(task: TaskContext): number {
    const params = this.getParameters();
    const baseScore = task.priority === 'critical' ? 1.0 :
                     task.priority === 'high' ? 0.7 :
                     task.priority === 'medium' ? 0.4 : 0.1;

    // Weight by status (active tasks are more important)
    const statusWeight = task.status === 'active' ? 1.0 :
                        task.status === 'pending' ? 0.8 :
                        task.status === 'blocked' ? 0.6 : 0.3;

    return baseScore * statusWeight * params.contentWeights.activeTasks;
  }

  private calculateReferenceImportanceScore(ref: CriticalReference): number {
    const params = this.getParameters();
    const baseScore = ref.importance === 'critical' ? 1.0 :
                     ref.importance === 'high' ? 0.7 :
                     ref.importance === 'medium' ? 0.4 : 0.1;

    return baseScore * params.contentWeights.criticalReferences;
  }

  private calculateTokenDensity(content: string): number {
    // Calculate information density (characters per token)
    // Higher density means more information per token
    const tokens = Math.ceil(content.length / 4);
    if (tokens === 0) return 0;

    // Factor in content complexity (presence of code-like patterns, technical terms, etc.)
    const complexityIndicators = (content.match(/[{}\[\]()=><;]|function|class|import|export|const|let|var/g) || []).length;
    const technicalTerms = (content.match(/\b(api|http|json|async|await|promise|error|data|config|model|token|context)\b/gi) || []).length;

    const complexityBonus = (complexityIndicators + technicalTerms) / tokens;
    return (content.length / tokens) * (1 + complexityBonus);
  }
}