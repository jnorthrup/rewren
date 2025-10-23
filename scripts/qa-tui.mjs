#!/usr/bin/env node
/**
 * TUI Smoke Test
 * Verifies TUI starts without crashing
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function log(msg) {
  console.log(`[TUI-QA] ${msg}`);
}

function error(msg) {
  console.error(`[TUI-QA] ✗ ${msg}`);
}

async function runTests() {
  log('Starting TUI smoke tests...\n');

  for (const { name, fn } of tests) {
    log(`Running: ${name}`);
    try {
      await fn();
      log(`✓ PASS: ${name}\n`);
    } catch (e) {
      error(`FAIL: ${name}`);
      error(e.message);
      process.exit(1);
    }
  }

  log(`✓ All ${tests.length} smoke tests passed!`);
  process.exit(0);
}

// Test 1: TUI starts without crashing
test('TUI starts without crashing', async () => {
  const proc = spawn('npm', ['start'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, WREN_SIMPLE_CLI: '0' }
  });

  let output = '';
  let stderrOutput = '';
  let hasError = false;
  let started = false;

  proc.stdout.on('data', (data) => {
    output += data.toString();
    if (output.includes('Wren') || output.includes('wren') || output.length > 50) {
      started = true;
    }
  });

  proc.stderr.on('data', (data) => {
    stderrOutput += data.toString();
    // Check for fatal errors only
    if (stderrOutput.match(/Error:|ENOENT|Cannot find module/i)) {
      hasError = true;
    }
  });

  proc.on('error', (err) => {
    hasError = true;
  });

  await sleep(3000);

  proc.kill('SIGTERM');
  await sleep(500);

  if (hasError) {
    throw new Error(`TUI startup error: ${stderrOutput.substring(0, 200)}`);
  }

  if (!started) {
    throw new Error('TUI did not produce any output');
  }

  log('✓ TUI started without crashes');
});

// Test 2: TUI doesn't crash on SIGTERM
test('TUI exits cleanly on SIGTERM', async () => {
  const proc = spawn('npm', ['start'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, WREN_SIMPLE_CLI: '0' }
  });

  let exitCode = null;

  proc.on('exit', (code) => {
    exitCode = code;
  });

  await sleep(2000);

  proc.kill('SIGTERM');
  await sleep(1000);

  if (exitCode !== null && exitCode !== 0 && exitCode !== 143 && exitCode !== 15) {
    throw new Error(`TUI exited with unexpected code: ${exitCode}`);
  }

  log('✓ TUI exits cleanly');
});

// Run all tests
runTests();
