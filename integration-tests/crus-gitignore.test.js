/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs').promises;
const path = require('path');
const { ContextDumpService } = require('../packages/core/src/services/contextDumpService.js');
const { ForensicTodoService } = require('../packages/core/src/services/forensicTodoService.js');

// Mock config for testing
class MockConfig {
  getWorkingDir() {
    return process.cwd();
  }

  getSessionId() {
    return 'test-session-123';
  }

  getModel() {
    return 'test-model';
  }
}

async function testCrusGitignoreManagement() {
  console.log('Testing CRUS gitignore management...\n');

  const config = new MockConfig();
  const dumpService = new ContextDumpService(config);
  const todoService = new ForensicTodoService(config);

  // Test 1: Check initial .gitignore state
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  const initialExists = await fs.access(gitignorePath).then(() => true).catch(() => false);
  console.log(`Initial .gitignore exists: ${initialExists}`);

  let initialContent = '';
  if (initialExists) {
    initialContent = await fs.readFile(gitignorePath, 'utf-8');
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
  const finalContent = await fs.readFile(gitignorePath, 'utf-8');
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
    return true;
  } else {
    console.log('\n❌ Gitignore management test FAILED!');
    return false;
  }
}

async function cleanup() {
  console.log('\nCleaning up test files...');
  try {
    await fs.rm(path.join(process.cwd(), '.wren'), { recursive: true, force: true });
    console.log('✓ Test files cleaned up');
  } catch (error) {
    console.warn('Warning: Could not clean up test files:', error);
  }
}

if (require.main === module) {
  testCrusGitignoreManagement()
    .then(success => {
      return cleanup().then(() => {
        process.exit(success ? 0 : 1);
      });
    })
    .catch(error => {
      console.error('Test failed with error:', error);
      cleanup().finally(() => process.exit(1));
    });
}

module.exports = { testCrusGitignoreManagement, cleanup };