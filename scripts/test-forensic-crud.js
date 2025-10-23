#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Quick test harness to exercise ForensicTodoService CRUD in the built package
 */

const { ForensicTodoService } = require('../packages/core/dist/src/services/forensicTodoService.js');
const { Config } = require('../packages/core/dist/src/config/config.js');
const path = require('path');

// Minimal mock Config compatible with the core package's Config interface used by the service
class MockConfig {
  getWorkingDir() {
    return process.cwd();
  }
  getSessionId() { return 'test-session'; }
  getModel() { return 'test-model'; }
}

(async function run() {
  const config = new MockConfig();
  const service = new ForensicTodoService(config);

  console.log('Creating TODO...');
  const id = await service.createTodo('Test create', 'Context for test', 'high', 'dump://test');
  console.log('Created ID:', id);

  console.log('\nListing all TODOs...');
  const list = await service.listForensicTodos();
  console.log('Count:', list.length);
  console.log(list.map(t => ({ id: t.id, desc: t.description, status: t.status })));

  console.log('\nUpdating TODO status to in-progress...');
  const updated = await service.updateStatus(id, 'in-progress');
  console.log('Updated:', updated);

  console.log('\nGetting TODO by ID...');
  const single = await service.getTodo(id);
  console.log(single);

  console.log('\nCompleting TODO...');
  const completed = await service.completeTodo(id);
  console.log('Completed:', completed);

  console.log('\nStats:');
  console.log(await service.getStats());

  console.log('\nDeleting TODO...');
  const deleted = await service.deleteTodo(id);
  console.log('Deleted:', deleted);

  console.log('\nFinal Stats:');
  console.log(await service.getStats());

  console.log('\nDone');
})();