#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test script to verify CRUS gitignore management functionality
 */

import * as fs from 'fs';
import * as path from 'path';
import { ContextDumpService } from '../packages/core/src/services/contextDumpService.js';
import { ForensicTodoService } from '../packages/core/src/services/forensicTodoService.js';
import { Config } from '../packages/core/src/config/config.js';

// Mock config for testing
class MockConfig {
  getWorkingDir(): string {
    return process.cwd();
  }

  getSessionId(): string {
    return 'test-session-123';
  }

  getModel(): string {
    return 'test-model';
  }
}

async function testGitignoreManagement() {
  console.log('Testing CRUS gitignore management...\n');

  const config = new MockConfig() as any as Config;
  const dumpService = new ContextDumpService(config);
  const todoService = new ForensicTodoService(config);

  // Test 1: Check initial .gitignore state
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  const initialExists = await fs.promises.access(gitignorePath).then(() => true).catch(() => false);
  console.log(`Initial .gitignore exists: ${initialExists}`);

  if (initialExists) {
    const initialContent = await fs.promises.readFile(gitignorePath, 'utf-8');
    console.log('Initial .gitignore content:');
    console.log(initialContent);
    console.log('---');
  }

  // Test 2: Trigger dump service (should add gitignore rules)
  console.log('Creating context dump to trigger gitignore management...');
  const dumpPath = await dumpService.createContextDump([], 'manual');
  console.log(`Dump created at: ${dumpPath}`);

  // Test 3: Trigger todo service (should add gitignore rules)
  console.log('Creating forensic todos to trigger gitignore management...');
  await todoService.createContextRecoveryTodos(dumpPath);

  // Test 4: Verify .gitignore was updated
  const finalContent = await fs.promises.readFile(gitignorePath, 'utf-8');
  console.log('\nFinal .gitignore content:');
  console.log(finalContent);

  // Check for expected patterns
  const hasDumpIgnore = finalContent.includes('.wren/context-dumps/');
  const hasTodoIgnore = finalContent.includes('.wren/forensic-todos/');
  const hasComment = finalContent.includes('# Wren Context Reorganization System');

  console.log('\nValidation:');
  console.log(`✓ Context dumps ignored: ${hasDumpIgnore}`);
  console.log(`✓ Forensic todos ignored: ${hasTodoIgnore}`);
  console.log(`✓ CRUS comment present: ${hasComment}`);

  if (hasDumpIgnore && hasTodoIgnore && hasComment) {
    console.log('\n🎉 Gitignore management test PASSED!');
  } else {
    console.log('\n❌ Gitignore management test FAILED!');
    process.exit(1);
  }

  // Cleanup test files
  console.log('\nCleaning up test files...');
  try {
    await fs.promises.rm(path.join(process.cwd(), '.wren'), { recursive: true, force: true });
    console.log('✓ Test files cleaned up');
  } catch (error) {
    console.warn('Warning: Could not clean up test files:', error);
  }
}

// Run the test
testGitignoreManagement().catch(console.error);