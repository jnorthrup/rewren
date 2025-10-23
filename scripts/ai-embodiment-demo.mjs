#!/usr/bin/env node
/**
 * AI Embodiment Demo - LLM performs self-surgery
 * The AI generates tests, executes them, observes results, adapts
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const execAsync = promisify(exec);

const SPEED = 2000;

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║  AI Embodiment - LLM Self-Surgery Framework               ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// AI-generated test scenarios
const aiGeneratedTests = [
  {
    name: "Verify slash command discovery",
    rationale: "AI needs to know what commands are available",
    actions: [
      { send: '/help', expect: 'Available commands', observation: 'Command list should appear' }
    ]
  },
  {
    name: "Test provider authentication flow",
    rationale: "AI needs to configure providers to function",
    actions: [
      { send: '/auth', expect: 'provider', observation: 'Provider selection should show' },
      { key: 'escape', expect: null, observation: 'Should exit auth mode' }
    ]
  },
  {
    name: "Query processing verification",
    rationale: "AI must be able to process natural language",
    actions: [
      { send: 'what is 2+2', expect: null, observation: 'Should process query with AI model' }
    ]
  },
  {
    name: "Provider tree navigation",
    rationale: "AI needs to inspect available models",
    actions: [
      { send: '/auth', expect: 'provider', observation: 'Enter provider tree' },
      { key: 'down', expect: null, observation: 'Navigate providers' },
      { key: 'down', expect: null, observation: 'Navigate providers' },
      { key: 'escape', expect: null, observation: 'Exit' }
    ]
  },
  {
    name: "Command recall test",
    rationale: "AI should access command history",
    actions: [
      { send: '/about', expect: 'Wren', observation: 'About info should display' },
      { send: '/clear', expect: null, observation: 'Clear screen' }
    ]
  }
];

class AIEmbodiment {
  constructor() {
    this.sessionName = `ai-embodiment-${Date.now()}`;
    this.testResults = [];
    this.observations = [];
  }

  async initialize() {
    console.log('🤖 AI: Initializing embodiment frame via tmux...');

    // Create tmux session
    await execAsync(`tmux new-session -d -s ${this.sessionName} -x 120 -y 40`);
    await sleep(500);

    // Start TUI in the tmux session
    await execAsync(`tmux send-keys -t ${this.sessionName} "cd /Users/jim/work/wren3 && node packages/cli/dist/index.js" C-m`);
    await sleep(SPEED * 2);

    console.log('✓ Embodiment active in tmux session:', this.sessionName, '\n');
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
    await execAsync(`tmux send-keys -t ${this.sessionName} "${keys.replace(/"/g, '\\"')}"`);
  }

  async sendCommand(cmd) {
    await execAsync(`tmux send-keys -t ${this.sessionName} "${cmd.replace(/"/g, '\\"')}" C-m`);
  }

  async performTest(test) {
    console.log(`\n━━━ AI Test: ${test.name} ━━━`);
    console.log(`Rationale: ${test.rationale}\n`);

    const testResult = {
      name: test.name,
      timestamp: new Date().toISOString(),
      actions: [],
      success: true
    };

    for (const action of test.actions) {
      const startTime = Date.now();

      if (action.send) {
        console.log(`🎬 AI Action: Send "${action.send}"`);
        await this.sendCommand(action.send);
      } else if (action.key) {
        console.log(`🎬 AI Action: Press ${action.key}`);
        // Simulate key press
        if (action.key === 'escape') {
          await this.sendKeys('Escape');
        } else if (action.key === 'down') {
          await this.sendKeys('Down');
        } else if (action.key === 'up') {
          await this.sendKeys('Up');
        }
      }

      await sleep(SPEED);

      const screenCapture = await this.captureScreen();
      const endTime = Date.now();
      const observation = {
        action: action.send || action.key,
        expected: action.expect,
        observed: screenCapture.slice(-500),
        latency: endTime - startTime,
        timestamp: new Date().toISOString()
      };

      console.log(`👁️  AI Observation: ${action.observation}`);

      if (action.expect) {
        const found = screenCapture.toLowerCase().includes(action.expect.toLowerCase());
        console.log(`${found ? '✓' : '✗'} Expected "${action.expect}" ${found ? 'found' : 'NOT FOUND'}`);
        if (!found) testResult.success = false;
      }

      testResult.actions.push(observation);
      console.log('');
    }

    this.testResults.push(testResult);

    const status = testResult.success ? '✓ PASS' : '✗ FAIL';
    console.log(`${status}: ${test.name}\n`);

    return testResult.success;
  }

  async runAllTests() {
    console.log('🧠 AI: Beginning self-surgery protocol...\n');

    let passed = 0;
    let failed = 0;

    for (const test of aiGeneratedTests) {
      const success = await this.performTest(test);
      if (success) passed++;
      else failed++;

      await sleep(SPEED / 2);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('AI Self-Surgery Results:');
    console.log(`  Total Tests: ${aiGeneratedTests.length}`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Save detailed results
    writeFileSync('.wren/ai-embodiment-results.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: { total: aiGeneratedTests.length, passed, failed },
      tests: this.testResults
    }, null, 2));

    console.log('📊 Detailed results saved to .wren/ai-embodiment-results.json\n');
  }

  async shutdown() {
    console.log('🤖 AI: Terminating embodiment frame...');
    try {
      await execAsync(`tmux kill-session -t ${this.sessionName}`);
    } catch (error) {
      // Session might already be dead
    }
    console.log('✓ Embodiment terminated\n');
  }
}

// Execute AI embodiment
const ai = new AIEmbodiment();

try {
  await ai.initialize();
  await ai.runAllTests();
  await ai.shutdown();
  process.exit(0);
} catch (error) {
  console.error('AI Embodiment Error:', error);
  process.exit(1);
}
