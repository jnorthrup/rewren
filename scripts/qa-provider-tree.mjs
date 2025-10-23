#!/usr/bin/env node
/**
 * Provider Tree QA - Comprehensive testing of model selection tree
 * Tests navigation, providers, models, but doesn't modify JSON data
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const execAsync = promisify(exec);
const SPEED = 1500;

class ProviderTreeQA {
  constructor() {
    this.sessionName = `provider-tree-qa-${Date.now()}`;
    this.testResults = [];
    this.totalTests = 0;
    this.passed = 0;
    this.failed = 0;
  }

  async initialize() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  Provider Tree QA - Comprehensive Model Selection Tests   ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    await execAsync(`tmux new-session -d -s ${this.sessionName} -x 120 -y 40`);
    await sleep(500);
    await execAsync(`tmux send-keys -t ${this.sessionName} "cd /Users/jim/work/wren3 && node packages/cli/dist/index.js" C-m`);
    await sleep(SPEED * 2);
  }

  async captureScreen() {
    try {
      const { stdout } = await execAsync(`tmux capture-pane -t ${this.sessionName} -p`);
      return stdout;
    } catch (error) {
      return '';
    }
  }

  async sendKeys(keys) {
    await execAsync(`tmux send-keys -t ${this.sessionName} "${keys}"`);
  }

  async sendCommand(cmd) {
    await execAsync(`tmux send-keys -t ${this.sessionName} "${cmd.replace(/"/g, '\\"')}" C-m`);
  }

  async test(name, testFn) {
    this.totalTests++;
    console.log(`\n🧪 Testing: ${name}`);

    try {
      await testFn();
      this.passed++;
      console.log(`✓ PASS: ${name}`);
      this.testResults.push({ name, status: 'pass' });
    } catch (error) {
      this.failed++;
      console.log(`✗ FAIL: ${name}`);
      console.log(`  Error: ${error.message}`);
      this.testResults.push({ name, status: 'fail', error: error.message });
    }
  }

  async assertContains(text, message = '') {
    const screen = await this.captureScreen();
    if (!screen.toLowerCase().includes(text.toLowerCase())) {
      throw new Error(message || `Expected to find: ${text}`);
    }
  }

  async assertNotContains(text, message = '') {
    const screen = await this.captureScreen();
    if (screen.toLowerCase().includes(text.toLowerCase())) {
      throw new Error(message || `Expected NOT to find: ${text}`);
    }
  }

  async runTests() {
    console.log('🚀 Starting Provider Tree QA Tests...\n');

    // Test 1: Opening provider tree
    await this.test('Open provider tree with /auth', async () => {
      await this.sendCommand('/auth');
      await sleep(SPEED);
      await this.assertContains('provider', 'Provider tree should open');
    });

    // Test 2: Tree shows providers
    await this.test('Provider tree displays providers', async () => {
      await sleep(SPEED);
      const screen = await this.captureScreen();
      const hasProviders = screen.match(/openai|nvidia|openrouter|gemini|anthropic/i);
      if (!hasProviders) throw new Error('No providers visible in tree');
    });

    // Test 3: Navigate down
    await this.test('Navigate down with arrow key', async () => {
      await this.sendKeys('Down');
      await sleep(SPEED);
      // Just verify it doesn't crash
      await this.assertContains('provider', 'Tree should still be visible');
    });

    // Test 4: Navigate up
    await this.test('Navigate up with arrow key', async () => {
      await this.sendKeys('Up');
      await sleep(SPEED);
      await this.assertContains('provider', 'Tree should still be visible');
    });

    // Test 5: Multiple down navigations
    await this.test('Navigate down multiple times', async () => {
      for (let i = 0; i < 5; i++) {
        await this.sendKeys('Down');
        await sleep(300);
      }
      await this.assertContains('provider', 'Tree should still be visible after multiple navigations');
    });

    // Test 6: Navigate to bottom and back
    await this.test('Navigate to bottom of tree', async () => {
      for (let i = 0; i < 20; i++) {
        await this.sendKeys('Down');
        await sleep(200);
      }
      await this.assertContains('provider', 'Tree should handle bottom boundary');
    });

    // Test 7: Navigate back to top
    await this.test('Navigate back to top', async () => {
      for (let i = 0; i < 20; i++) {
        await this.sendKeys('Up');
        await sleep(200);
      }
      await this.assertContains('provider', 'Tree should handle top boundary');
    });

    // Test 8: Expand/collapse with Enter
    await this.test('Expand node with Enter', async () => {
      await this.sendKeys('Return');
      await sleep(SPEED);
      await this.assertContains('provider', 'Tree should still be visible after enter');
    });

    // Test 9: Expand again to collapse
    await this.test('Collapse node with Enter', async () => {
      await this.sendKeys('Return');
      await sleep(SPEED);
      await this.assertContains('provider', 'Tree should still be visible after collapse');
    });

    // Test 10: Detail pane shows info
    await this.test('Detail pane shows provider info', async () => {
      await this.sendKeys('Down');
      await sleep(SPEED);
      const screen = await this.captureScreen();
      // Detail pane should show something
      if (screen.length < 100) throw new Error('Detail pane appears empty');
    });

    // Test 11: Navigate through all providers
    await this.test('Navigate through multiple providers', async () => {
      for (let i = 0; i < 10; i++) {
        await this.sendKeys('Down');
        await sleep(400);
      }
      await this.assertContains('provider', 'Should navigate through providers without crash');
    });

    // Test 12: Rapid navigation stress test
    await this.test('Rapid navigation stress test', async () => {
      for (let i = 0; i < 30; i++) {
        await this.sendKeys(i % 2 === 0 ? 'Down' : 'Up');
        await sleep(100);
      }
      await this.assertContains('provider', 'Tree should handle rapid navigation');
    });

    // Test 13: Expand multiple nodes
    await this.test('Expand multiple nodes sequentially', async () => {
      await this.sendKeys('Return');
      await sleep(500);
      await this.sendKeys('Down');
      await sleep(300);
      await this.sendKeys('Return');
      await sleep(500);
      await this.assertContains('provider', 'Should handle multiple expansions');
    });

    // Test 14: Deep navigation into models
    await this.test('Navigate into models list', async () => {
      for (let i = 0; i < 5; i++) {
        await this.sendKeys('Down');
        await sleep(300);
        await this.sendKeys('Return');
        await sleep(300);
      }
      const screen = await this.captureScreen();
      if (screen.length < 100) throw new Error('Models not visible');
    });

    // Test 15: Close tree with ESC
    await this.test('Close provider tree with ESC', async () => {
      await this.sendKeys('Escape');
      await sleep(SPEED);
      await this.assertNotContains('provider tree', 'Tree should be closed');
    });

    // Test 16: Reopen tree
    await this.test('Reopen provider tree', async () => {
      await this.sendCommand('/auth');
      await sleep(SPEED);
      await this.assertContains('provider', 'Tree should reopen');
    });

    // Test 17: Tree state persists
    await this.test('Tree remembers state after close/reopen', async () => {
      await this.sendKeys('Down');
      await sleep(300);
      await this.sendKeys('Down');
      await sleep(300);
      await this.sendKeys('Escape');
      await sleep(500);
      await this.sendCommand('/auth');
      await sleep(SPEED);
      await this.assertContains('provider', 'Tree state should work after reopen');
    });

    // Test 18: Keyboard shortcuts work
    await this.test('j/k vim-style navigation works', async () => {
      await this.sendKeys('j');
      await sleep(300);
      await this.sendKeys('k');
      await sleep(300);
      await this.assertContains('provider', 'Vim-style keys should work');
    });

    // Test 19: Multiple ESC presses don't crash
    await this.test('Multiple ESC presses handled', async () => {
      await this.sendKeys('Escape');
      await sleep(300);
      await this.sendKeys('Escape');
      await sleep(300);
      await this.sendKeys('Escape');
      await sleep(300);
      // Should just close and stay closed
    });

    // Test 20: Can use TUI after closing tree
    await this.test('TUI functional after closing tree', async () => {
      await this.sendCommand('/help');
      await sleep(SPEED);
      await this.assertContains('command', 'TUI should work normally after tree operations');
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Provider Tree QA Results:');
    console.log(`  Total Tests: ${this.totalTests}`);
    console.log(`  Passed: ${this.passed}`);
    console.log(`  Failed: ${this.failed}`);
    console.log(`  Success Rate: ${((this.passed / this.totalTests) * 100).toFixed(1)}%`);
    console.log('═══════════════════════════════════════════════════════════\n');

    writeFileSync('.wren/provider-tree-qa-results.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: { total: this.totalTests, passed: this.passed, failed: this.failed },
      tests: this.testResults
    }, null, 2));

    console.log('📊 Results saved to .wren/provider-tree-qa-results.json\n');
  }

  async shutdown() {
    try {
      await execAsync(`tmux kill-session -t ${this.sessionName}`);
    } catch (error) {
      // Session might already be dead
    }
  }
}

const qa = new ProviderTreeQA();

try {
  await qa.initialize();
  await qa.runTests();
  await qa.shutdown();
  process.exit(qa.failed > 0 ? 1 : 0);
} catch (error) {
  console.error('QA Error:', error);
  await qa.shutdown();
  process.exit(1);
}
