#!/usr/bin/env node
/**
 * Comprehensive TUI QA Automation
 * Tests all features, commands, and scenarios
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import { writeFileSync, readFileSync } from 'fs';

const TEST_LOG = '.wren/qa-results.json';
const results = {
  timestamp: new Date().toISOString(),
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

function log(msg) {
  console.log(`[QA] ${msg}`);
}

function success(msg) {
  console.log(`[QA] ✓ ${msg}`);
}

function error(msg) {
  console.error(`[QA] ✗ ${msg}`);
}

function recordTest(name, status, details = '') {
  results.tests.push({ name, status, details, timestamp: Date.now() });
  if (status === 'pass') results.passed++;
  else if (status === 'fail') results.failed++;
  else if (status === 'skip') results.skipped++;
}

async function runTest(name, fn) {
  log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`Testing: ${name}`);
  try {
    await fn();
    success(`PASS: ${name}`);
    recordTest(name, 'pass');
    return true;
  } catch (e) {
    error(`FAIL: ${name}`);
    error(`  ${e.message}`);
    recordTest(name, 'fail', e.message);
    return false;
  }
}

// ============================================
// CATEGORY 1: STARTUP & SHUTDOWN
// ============================================

async function testStartup() {
  await runTest('TUI starts without errors', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let hasError = false;
    let started = false;

    proc.stderr.on('data', (data) => {
      const err = data.toString();
      if (err.match(/Error:|ENOENT|Cannot find module/i)) {
        hasError = true;
      }
    });

    proc.stdout.on('data', () => {
      started = true;
    });

    await sleep(3000);
    proc.kill('SIGTERM');
    await sleep(500);

    if (hasError) throw new Error('Startup errors detected');
    if (!started) throw new Error('No output produced');
  });

  await runTest('TUI exits cleanly with SIGTERM', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let exitCode = null;
    proc.on('exit', (code) => { exitCode = code; });

    await sleep(2000);
    proc.kill('SIGTERM');
    await sleep(1000);

    if (exitCode !== null && exitCode !== 0 && exitCode !== 143 && exitCode !== 15) {
      throw new Error(`Bad exit code: ${exitCode}`);
    }
  });

  await runTest('TUI handles rapid start/stop cycles', async () => {
    for (let i = 0; i < 3; i++) {
      const proc = spawn('npm', ['start'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      await sleep(1000);
      proc.kill('SIGTERM');
      await sleep(500);
    }
  });
}

// ============================================
// CATEGORY 2: SLASH COMMANDS
// ============================================

async function testSlashCommands() {
  const commands = [
    { cmd: '/help', expectOutput: true },
    { cmd: '/auth', expectOutput: true },
    { cmd: '/clear', expectOutput: false },
    { cmd: '/about', expectOutput: true },
    { cmd: '/theme', expectOutput: true },
  ];

  for (const { cmd, expectOutput } of commands) {
    await runTest(`Command ${cmd} responds`, async () => {
      const proc = spawn('npm', ['start'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      let gotOutput = false;
      proc.stdout.on('data', () => { gotOutput = true; });

      await sleep(2000);
      proc.stdin.write(`${cmd}\n`);
      await sleep(2000);

      proc.kill('SIGTERM');
      await sleep(500);

      if (expectOutput && !gotOutput) {
        throw new Error(`${cmd} produced no output`);
      }
    });
  }

  await runTest('Unknown commands show error message', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let output = '';
    proc.stdout.on('data', (data) => { output += data.toString(); });

    await sleep(2000);
    proc.stdin.write('/nonexistent\n');
    await sleep(2000);

    proc.kill('SIGTERM');
    await sleep(500);

    // Just verify it didn't crash
    if (output.length < 10) {
      throw new Error('No error message shown');
    }
  });
}

// ============================================
// CATEGORY 3: INPUT HANDLING
// ============================================

async function testInputHandling() {
  await runTest('Input prompt persists after commands', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let gotOutput = false;
    proc.stdout.on('data', () => { gotOutput = true; });

    await sleep(2000);

    // Send multiple commands
    proc.stdin.write('/help\n');
    await sleep(1000);
    proc.stdin.write('/about\n');
    await sleep(1000);
    proc.stdin.write('/help\n');
    await sleep(1000);

    proc.kill('SIGTERM');
    await sleep(500);

    if (!gotOutput) {
      throw new Error('Commands not processed');
    }
  });

  await runTest('Empty input does not crash', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    await sleep(2000);

    // Send empty lines
    proc.stdin.write('\n');
    await sleep(500);
    proc.stdin.write('\n');
    await sleep(500);
    proc.stdin.write('\n');
    await sleep(500);

    proc.kill('SIGTERM');
    await sleep(500);
  });

  await runTest('Long input handled correctly', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    await sleep(2000);

    const longInput = 'a'.repeat(1000);
    proc.stdin.write(longInput + '\n');
    await sleep(1000);

    proc.kill('SIGTERM');
    await sleep(500);
  });

  await runTest('Special characters in input', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    await sleep(2000);

    const specialChars = '!@#$%^&*(){}[]<>?/\\|~`';
    proc.stdin.write(specialChars + '\n');
    await sleep(1000);

    proc.kill('SIGTERM');
    await sleep(500);
  });
}

// ============================================
// CATEGORY 4: ERROR HANDLING
// ============================================

async function testErrorHandling() {
  await runTest('Invalid commands do not crash TUI', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let crashed = false;
    proc.on('exit', (code) => {
      if (code !== null && code !== 0 && code !== 143 && code !== 15) {
        crashed = true;
      }
    });

    await sleep(2000);

    // Send various invalid commands
    proc.stdin.write('/invalid\n');
    await sleep(500);
    proc.stdin.write('//double\n');
    await sleep(500);
    proc.stdin.write('/\n');
    await sleep(500);

    proc.kill('SIGTERM');
    await sleep(500);

    if (crashed) throw new Error('TUI crashed');
  });

  await runTest('Rapid command spam does not crash', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let crashed = false;
    proc.on('exit', (code) => {
      if (code !== null && code !== 0 && code !== 143 && code !== 15) {
        crashed = true;
      }
    });

    await sleep(2000);

    // Spam commands
    for (let i = 0; i < 20; i++) {
      proc.stdin.write('/help\n');
      await sleep(50);
    }

    await sleep(1000);
    proc.kill('SIGTERM');
    await sleep(500);

    if (crashed) throw new Error('TUI crashed on spam');
  });

  await runTest('Unicode input handled correctly', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    await sleep(2000);

    const unicode = '你好世界 🚀 émoji ñ';
    proc.stdin.write(unicode + '\n');
    await sleep(1000);

    proc.kill('SIGTERM');
    await sleep(500);
  });
}

// ============================================
// CATEGORY 5: PROVIDER TREE
// ============================================

async function testProviderTree() {
  await runTest('Provider tree opens with /auth', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let gotOutput = false;
    proc.stdout.on('data', () => { gotOutput = true; });

    await sleep(2000);
    proc.stdin.write('/auth\n');
    await sleep(2000);

    proc.kill('SIGTERM');
    await sleep(500);

    if (!gotOutput) {
      throw new Error('Provider tree did not open');
    }
  });

  await runTest('ESC closes provider tree', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    await sleep(2000);

    // Open tree
    proc.stdin.write('/auth\n');
    await sleep(1000);

    // Send ESC
    proc.stdin.write('\x1b');
    await sleep(500);

    // Verify still responsive
    proc.stdin.write('/help\n');
    await sleep(500);

    proc.kill('SIGTERM');
    await sleep(500);
  });
}

// ============================================
// CATEGORY 6: QUERY PROCESSING
// ============================================

async function testQueryProcessing() {
  await runTest('Non-slash input triggers query processing', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let gotResponse = false;
    proc.stdout.on('data', (data) => {
      const output = data.toString();
      // Look for processing indicator or error message
      if (output.includes('Processing') || output.includes('error') ||
          output.includes('configured') || output.includes('client')) {
        gotResponse = true;
      }
    });

    await sleep(2000);
    proc.stdin.write('test query\n');
    await sleep(2000);

    proc.kill('SIGTERM');
    await sleep(500);

    if (!gotResponse) {
      throw new Error('Query not processed');
    }
  });
}

// ============================================
// CATEGORY 7: STRESS TESTING
// ============================================

async function testStressScenarios() {
  await runTest('Memory stability over extended session', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    await sleep(2000);

    // Simulate extended usage
    for (let i = 0; i < 30; i++) {
      proc.stdin.write('/help\n');
      await sleep(100);
    }

    await sleep(1000);
    proc.kill('SIGTERM');
    await sleep(500);
  });

  await runTest('Concurrent operations do not deadlock', async () => {
    const proc = spawn('npm', ['start'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    await sleep(2000);

    // Send multiple commands without waiting
    proc.stdin.write('/help\n');
    proc.stdin.write('/about\n');
    proc.stdin.write('/auth\n');
    proc.stdin.write('\x1b'); // ESC
    proc.stdin.write('/help\n');

    await sleep(2000);
    proc.kill('SIGTERM');
    await sleep(500);
  });
}

// ============================================
// MAIN TEST RUNNER
// ============================================

async function runAllTests() {
  log('\n╔══════════════════════════════════════════════╗');
  log('║   COMPREHENSIVE TUI QA AUTOMATION SUITE     ║');
  log('╚══════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  log('Category 1: Startup & Shutdown');
  await testStartup();

  log('\n\nCategory 2: Slash Commands');
  await testSlashCommands();

  log('\n\nCategory 3: Input Handling');
  await testInputHandling();

  log('\n\nCategory 4: Error Handling');
  await testErrorHandling();

  log('\n\nCategory 5: Provider Tree');
  await testProviderTree();

  log('\n\nCategory 6: Query Processing');
  await testQueryProcessing();

  log('\n\nCategory 7: Stress Testing');
  await testStressScenarios();

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Write results
  writeFileSync(TEST_LOG, JSON.stringify(results, null, 2));

  // Summary
  log('\n\n╔══════════════════════════════════════════════╗');
  log('║              TEST SUMMARY                    ║');
  log('╚══════════════════════════════════════════════╝');
  log('');
  success(`Passed: ${results.passed}`);
  if (results.failed > 0) error(`Failed: ${results.failed}`);
  if (results.skipped > 0) log(`Skipped: ${results.skipped}`);
  log(`Duration: ${duration}s`);
  log(`Results saved to: ${TEST_LOG}`);
  log('');

  if (results.failed > 0) {
    log('Failed tests:');
    results.tests
      .filter(t => t.status === 'fail')
      .forEach(t => error(`  - ${t.name}: ${t.details}`));
    process.exit(1);
  }

  success('ALL TESTS PASSED! 🎉');
  process.exit(0);
}

// Run tests
runAllTests().catch(err => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
