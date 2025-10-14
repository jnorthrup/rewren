/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../config/config.js';

export interface ForensicTodoItem {
  id: string;
  description: string;
  context: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  createdAt: string;
  status: 'pending' | 'in-progress' | 'completed';
  relatedDump?: string;
}

export class ForensicTodoService {
  private readonly todoDirectory = '.wren/forensic-todos';

  constructor(private config: Config) {}

  /**
   * Creates forensic TODO items for context recovery
   */
  async createContextRecoveryTodos(dumpPath: string): Promise<void> {
    // Ensure proper gitignore rules are in place for todo files
    await this.ensureGitignoreRules();

    const todos: ForensicTodoItem[] = [
      {
        id: `review-dump-${Date.now()}`,
        description: `Review context dump at ${dumpPath}`,
        context: 'Context reorganization triggered - review dump for critical information',
        priority: 'high',
        createdAt: new Date().toISOString(),
        status: 'pending',
        relatedDump: dumpPath,
      },
      {
        id: `verify-requirements-${Date.now()}`,
        description: 'Verify requirements from context dump',
        context: 'Ensure all user requirements and deliverables are preserved in recovery',
        priority: 'critical',
        createdAt: new Date().toISOString(),
        status: 'pending',
        relatedDump: dumpPath,
      },
      {
        id: `restore-momentum-${Date.now()}`,
        description: 'Restore momentum on active tasks',
        context: 'Review active tasks and ensure work continues without interruption',
        priority: 'high',
        createdAt: new Date().toISOString(),
        status: 'pending',
        relatedDump: dumpPath,
      },
      {
        id: `check-deliverables-${Date.now()}`,
        description: 'Check deliverables and milestones',
        context: 'Verify that all promised deliverables are still on track',
        priority: 'medium',
        createdAt: new Date().toISOString(),
        status: 'pending',
        relatedDump: dumpPath,
      },
    ];

    // Ensure todo directory exists
    const todoDir = path.join(this.config.getWorkingDir(), this.todoDirectory);
    await fs.promises.mkdir(todoDir, { recursive: true });

    // Write todos to file
    const filename = `context-recovery-${Date.now()}.json`;
    const filepath = path.join(todoDir, filename);
    await fs.promises.writeFile(filepath, JSON.stringify(todos, null, 2), 'utf-8');

    // Also log to console for immediate visibility
    console.log('\n=== FORENSIC COURSE CORRECTION ===');
    console.log(`Context reorganization triggered. Created recovery plan: ${filepath}`);
    console.log('\nCRITICAL RECOVERY ITEMS:');
    todos.forEach((todo, i) => {
      console.log(`${i + 1}. ${todo.description} (${todo.priority.toUpperCase()})`);
      console.log(`   ${todo.context}`);
    });
    console.log('\nUse /memory command to review recovery items.');
    console.log('===================================\n');
  }

  /**
   * Lists all forensic TODO items
   */
  async listForensicTodos(): Promise<ForensicTodoItem[]> {
    const todoDir = path.join(this.config.getWorkingDir(), this.todoDirectory);
    try {
      const files = await fs.promises.readdir(todoDir);
      const todos: ForensicTodoItem[] = [];

      for (const file of files) {
        if ((file.startsWith('context-recovery-') || file.startsWith('manual-todos')) && file.endsWith('.json')) {
          try {
            const content = await fs.promises.readFile(path.join(todoDir, file), 'utf-8');
            const fileTodos = JSON.parse(content) as ForensicTodoItem[];
            todos.push(...fileTodos);
          } catch {
            // Skip malformed files
          }
        }
      }

      return todos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  }

  /**
   * Creates a new forensic TODO item
   */
  async createTodo(description: string, context: string, priority: 'critical' | 'high' | 'medium' | 'low' = 'medium', relatedDump?: string): Promise<string> {
    // Ensure proper gitignore rules are in place for todo files
    await this.ensureGitignoreRules();

    const todo: ForensicTodoItem = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      description,
      context,
      priority,
      createdAt: new Date().toISOString(),
      status: 'pending',
      relatedDump,
    };

    // Ensure todo directory exists
    const todoDir = path.join(this.config.getWorkingDir(), this.todoDirectory);
    await fs.promises.mkdir(todoDir, { recursive: true });

    // Create a new file for manual todos
    const filename = `manual-todos.json`;
    const filepath = path.join(todoDir, filename);

    let existingTodos: ForensicTodoItem[] = [];
    try {
      const content = await fs.promises.readFile(filepath, 'utf-8');
      existingTodos = JSON.parse(content);
    } catch {
      // File doesn't exist or is malformed, start with empty array
    }

    existingTodos.push(todo);
    await fs.promises.writeFile(filepath, JSON.stringify(existingTodos, null, 2), 'utf-8');

    console.log(`Created forensic TODO: ${description}`);
    return todo.id;
  }

  /**
   * Updates an existing TODO item
   */
  async updateTodo(todoId: string, updates: Partial<Pick<ForensicTodoItem, 'description' | 'context' | 'priority' | 'status'>>): Promise<boolean> {
    const todos = await this.listForensicTodos();
    const todo = todos.find(t => t.id === todoId);

    if (!todo) {
      return false;
    }

    // Apply updates
    Object.assign(todo, updates);

    // Update the file with the modified todo
    const todoDir = path.join(this.config.getWorkingDir(), this.todoDirectory);
    try {
      const files = await fs.promises.readdir(todoDir);

      for (const file of files) {
        if ((file.startsWith('context-recovery-') || file.startsWith('manual-todos')) && file.endsWith('.json')) {
          try {
            const filepath = path.join(todoDir, file);
            const content = await fs.promises.readFile(filepath, 'utf-8');
            const fileTodos = JSON.parse(content) as ForensicTodoItem[];

            // Check if this file contains the todo we're updating
            const todoIndex = fileTodos.findIndex(t => t.id === todoId);
            if (todoIndex !== -1) {
              // Update the todo in this file
              fileTodos[todoIndex] = todo;

              // Write the updated todos back to the file
              await fs.promises.writeFile(filepath, JSON.stringify(fileTodos, null, 2), 'utf-8');

              console.log(`Updated forensic TODO: ${todo.description}`);
              return true;
            }
          } catch (error) {
            console.warn(`Failed to update todo in file ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to update forensic TODO file:', error);
      return false;
    }

    return false;
  }

  /**
   * Deletes a TODO item
   */
  async deleteTodo(todoId: string): Promise<boolean> {
    const todoDir = path.join(this.config.getWorkingDir(), this.todoDirectory);
    try {
      const files = await fs.promises.readdir(todoDir);

      for (const file of files) {
        if ((file.startsWith('context-recovery-') || file.startsWith('manual-todos')) && file.endsWith('.json')) {
          try {
            const filepath = path.join(todoDir, file);
            const content = await fs.promises.readFile(filepath, 'utf-8');
            const fileTodos = JSON.parse(content) as ForensicTodoItem[];

            // Check if this file contains the todo we're deleting
            const todoIndex = fileTodos.findIndex(t => t.id === todoId);
            if (todoIndex !== -1) {
              // Remove the todo from this file
              fileTodos.splice(todoIndex, 1);

              // Write the updated todos back to the file
              await fs.promises.writeFile(filepath, JSON.stringify(fileTodos, null, 2), 'utf-8');

              console.log(`Deleted forensic TODO with ID: ${todoId}`);
              return true;
            }
          } catch (error) {
            console.warn(`Failed to delete todo from file ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to delete forensic TODO:', error);
      return false;
    }

    return false;
  }

  /**
   * Updates TODO priority
   */
  async updatePriority(todoId: string, priority: 'critical' | 'high' | 'medium' | 'low'): Promise<boolean> {
    return this.updateTodo(todoId, { priority });
  }

  /**
   * Updates TODO status
   */
  async updateStatus(todoId: string, status: 'pending' | 'in-progress' | 'completed'): Promise<boolean> {
    return this.updateTodo(todoId, { status });
  }

  /**
   * Updates TODO description
   */
  async updateDescription(todoId: string, description: string): Promise<boolean> {
    return this.updateTodo(todoId, { description });
  }

  /**
   * Updates TODO context
   */
  async updateContext(todoId: string, context: string): Promise<boolean> {
    return this.updateTodo(todoId, { context });
  }

  /**
   * Finds TODOs by status
   */
  async findByStatus(status: 'pending' | 'in-progress' | 'completed'): Promise<ForensicTodoItem[]> {
    const allTodos = await this.listForensicTodos();
    return allTodos.filter(todo => todo.status === status);
  }

  /**
   * Finds TODOs by priority
   */
  async findByPriority(priority: 'critical' | 'high' | 'medium' | 'low'): Promise<ForensicTodoItem[]> {
    const allTodos = await this.listForensicTodos();
    return allTodos.filter(todo => todo.priority === priority);
  }

  /**
   * Finds TODOs by related dump
   */
  async findByRelatedDump(dumpPath: string): Promise<ForensicTodoItem[]> {
    const allTodos = await this.listForensicTodos();
    return allTodos.filter(todo => todo.relatedDump === dumpPath);
  }

  /**
   * Gets TODO by ID
   */
  async getTodo(todoId: string): Promise<ForensicTodoItem | null> {
    const allTodos = await this.listForensicTodos();
    return allTodos.find(todo => todo.id === todoId) || null;
  }

  /**
   * Bulk update TODOs by status
   */
  async bulkUpdateStatus(todoIds: string[], status: 'pending' | 'in-progress' | 'completed'): Promise<number> {
    let updatedCount = 0;
    for (const todoId of todoIds) {
      if (await this.updateStatus(todoId, status)) {
        updatedCount++;
      }
    }
    return updatedCount;
  }

  /**
   * Bulk update TODOs by priority
   */
  async bulkUpdatePriority(todoIds: string[], priority: 'critical' | 'high' | 'medium' | 'low'): Promise<number> {
    let updatedCount = 0;
    for (const todoId of todoIds) {
      if (await this.updatePriority(todoId, priority)) {
        updatedCount++;
      }
    }
    return updatedCount;
  }

  /**
   * Bulk delete TODOs
   */
  async bulkDelete(todoIds: string[]): Promise<number> {
    let deletedCount = 0;
    for (const todoId of todoIds) {
      if (await this.deleteTodo(todoId)) {
        deletedCount++;
      }
    }
    return deletedCount;
  }

  /**
   * Gets TODO statistics
   */
  async getStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    completed: number;
    pending: number;
    inProgress: number;
  }> {
    const allTodos = await this.listForensicTodos();

    const stats = {
      total: allTodos.length,
      byStatus: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      completed: 0,
      pending: 0,
      inProgress: 0,
    };

    for (const todo of allTodos) {
      // Count by status
      stats.byStatus[todo.status] = (stats.byStatus[todo.status] || 0) + 1;

      // Count by priority
      stats.byPriority[todo.priority] = (stats.byPriority[todo.priority] || 0) + 1;

      // Count specific statuses
      if (todo.status === 'completed') stats.completed++;
      if (todo.status === 'pending') stats.pending++;
      if (todo.status === 'in-progress') stats.inProgress++;
    }

    return stats;
  }

  /**
   * Ensures proper .gitignore rules are in place for CRUS todo files
   */
  private async ensureGitignoreRules(): Promise<void> {
    const gitignorePath = path.join(this.config.getWorkingDir(), '.gitignore');
    const todoIgnorePattern = `${this.todoDirectory}/`;

    try {
      let gitignoreContent = '';

      // Read existing .gitignore if it exists
      if (await fs.promises.access(gitignorePath).then(() => true).catch(() => false)) {
        gitignoreContent = await fs.promises.readFile(gitignorePath, 'utf-8');
      }

      const lines = gitignoreContent.split('\n');
      let hasTodoIgnore = false;

      // Check if pattern already exists
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === todoIgnorePattern) hasTodoIgnore = true;
      }

      // Add missing pattern
      if (!hasTodoIgnore) {
        const additions: string[] = [];

        // Add a comment header if this is the first CRUS-related ignore
        if (!gitignoreContent.includes('# Wren Context Reorganization System')) {
          additions.unshift('', '# Wren Context Reorganization System');
        }

        additions.push(todoIgnorePattern);

        // Append to .gitignore
        const updatedContent = gitignoreContent + additions.join('\n') + '\n';
        await fs.promises.writeFile(gitignorePath, updatedContent, 'utf-8');
      }
    } catch (error) {
      // Silently fail - gitignore management is not critical to CRUS operation
      console.warn('Failed to update .gitignore for CRUS:', error);
    }
  }
}