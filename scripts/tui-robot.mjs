#!/usr/bin/env node
/**
 * Autonomous TUI Robot with Full Observability
 * AI-driven robot that can observe and control the TUI
 */

import { TuiSession } from './lib/tui-test-harness.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const DEFAULT_HUMAN_SPEED = 2000; // ms between actions

class TuiRobot {
  constructor(options = {}) {
    this.session = null;
    this.speed = options.speed || DEFAULT_HUMAN_SPEED;
    this.observationLog = [];
    this.actionLog = [];
    this.scriptMode = options.scriptMode || false;
    this.verbose = options.verbose !== false;
  }

  /**
   * Start observation session
   */
  async start() {
    this.log('🤖 TUI Robot starting...');
    this.session = new TuiSession({
      startupDelay: 3000,
      commandDelay: this.speed
    });

    // Set up real-time observation
    this.session.on('output', (chunk) => {
      this.observe('stdout', chunk);
    });

    this.session.on('stderr', (chunk) => {
      this.observe('stderr', chunk);
    });

    await this.session.start();
    this.log('✓ TUI session started');
    await this.takeSnapshot('startup');
  }

  /**
   * Observe TUI output
   */
  observe(source, data) {
    const observation = {
      timestamp: Date.now(),
      source,
      data: data.substring(0, 500) // Limit size
    };
    this.observationLog.push(observation);

    if (this.verbose && source === 'stdout') {
      // Show abbreviated output
      const preview = data.substring(0, 100).replace(/\n/g, ' ');
      console.log(`📊 [OBS] ${preview}...`);
    }
  }

  /**
   * Take snapshot of current TUI state
   */
  async takeSnapshot(label) {
    const snapshot = {
      timestamp: Date.now(),
      label,
      output: this.session.getOutput(),
      errors: this.session.getErrors(),
      observations: this.observationLog.length
    };

    this.log(`📸 Snapshot: ${label}`);
    return snapshot;
  }

  /**
   * Execute action with human-visible timing
   */
  async action(type, data, description) {
    this.log(`🎬 ${description || type}`);

    const action = {
      timestamp: Date.now(),
      type,
      data,
      description
    };
    this.actionLog.push(action);

    await sleep(this.speed / 2); // Pause before action

    switch (type) {
      case 'send':
        await this.session.send(data);
        break;
      case 'sendKey':
        await this.session.sendKey(data);
        break;
      case 'wait':
        await sleep(data);
        break;
      default:
        throw new Error(`Unknown action type: ${type}`);
    }

    await sleep(this.speed / 2); // Pause after action
  }

  /**
   * Run a scripted sequence
   */
  async runScript(scriptPath) {
    this.log(`📜 Loading script: ${scriptPath}`);

    const script = JSON.parse(readFileSync(scriptPath, 'utf-8'));
    this.log(`📋 Script: ${script.name}`);
    this.log(`📝 Description: ${script.description}`);
    this.log(`🎯 ${script.steps.length} steps to execute\n`);

    await sleep(1000);

    for (let i = 0; i < script.steps.length; i++) {
      const step = script.steps[i];
      this.log(`\n━━━ Step ${i + 1}/${script.steps.length} ━━━`);

      await this.action(step.type, step.data, step.description);

      if (step.snapshot) {
        await this.takeSnapshot(step.snapshot);
      }

      if (step.observe) {
        await this.observeCondition(step.observe);
      }
    }

    this.log('\n✅ Script complete');
  }

  /**
   * Observe and check condition
   */
  async observeCondition(condition) {
    const output = this.session.getOutput();

    switch (condition.type) {
      case 'contains':
        if (output.includes(condition.value)) {
          this.log(`✓ Observed: "${condition.value}"`);
        } else {
          this.log(`✗ Not observed: "${condition.value}"`);
        }
        break;

      case 'matches':
        const regex = new RegExp(condition.value);
        if (regex.test(output)) {
          this.log(`✓ Matched: ${condition.value}`);
        } else {
          this.log(`✗ No match: ${condition.value}`);
        }
        break;
    }
  }

  /**
   * Save observation and action logs
   */
  async saveLogs(filepath) {
    const logs = {
      observations: this.observationLog,
      actions: this.actionLog,
      finalSnapshot: await this.takeSnapshot('final')
    };

    writeFileSync(filepath, JSON.stringify(logs, null, 2));
    this.log(`💾 Logs saved: ${filepath}`);
  }

  /**
   * Stop robot
   */
  async stop() {
    this.log('🛑 Stopping robot...');
    if (this.session) {
      await this.session.stop();
    }
    this.log('✓ Robot stopped');
  }

  /**
   * Log with timestamp
   */
  log(msg) {
    if (this.verbose) {
      const time = new Date().toLocaleTimeString();
      console.log(`[${time}] ${msg}`);
    }
  }
}

/**
 * Interactive robot demo
 */
async function runDemo() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Autonomous TUI Robot - Demo Mode    ║');
  console.log('╚════════════════════════════════════════╝\n');

  const robot = new TuiRobot({ speed: 2500 });

  try {
    await robot.start();

    await robot.action('send', '/help', 'Opening help menu');
    await robot.takeSnapshot('help-menu');

    await robot.action('wait', 2000, 'Observing help output');

    await robot.action('send', '/about', 'Checking about info');
    await robot.takeSnapshot('about-screen');

    await robot.action('send', '/auth', 'Opening provider tree');
    await robot.takeSnapshot('provider-tree');

    await robot.action('wait', 2000, 'Examining provider tree');

    await robot.action('sendKey', 'esc', 'Closing provider tree');

    await robot.action('send', 'Hello, world!', 'Sending test query');
    await robot.takeSnapshot('query-response');

    await robot.action('wait', 3000, 'Waiting for AI response');

    await robot.action('send', '/clear', 'Clearing history');

    await robot.saveLogs('.wren/robot-demo-log.json');
    await robot.stop();

    console.log('\n✨ Demo complete!');
  } catch (error) {
    console.error('❌ Robot error:', error.message);
    await robot.stop();
    process.exit(1);
  }
}

/**
 * Run script from file
 */
async function runScriptFile(scriptPath, speed) {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Autonomous TUI Robot - Script Mode  ║');
  console.log('╚════════════════════════════════════════╝\n');

  const robot = new TuiRobot({ speed: speed || 2000 });

  try {
    await robot.start();
    await robot.runScript(scriptPath);
    await robot.saveLogs('.wren/robot-script-log.json');
    await robot.stop();

    console.log('\n✨ Script execution complete!');
  } catch (error) {
    console.error('❌ Robot error:', error.message);
    await robot.stop();
    process.exit(1);
  }
}

// ============================================
// CLI
// ============================================

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log(`
Autonomous TUI Robot - Full TUI Access & Observability

Usage:
  npm run robot                      # Run demo
  npm run robot -- --script FILE     # Run script file
  npm run robot -- --speed MS        # Set action speed (default: 2000ms)

Options:
  --script FILE    Path to script JSON file
  --speed MS       Milliseconds between actions (human speed)
  --quiet          Minimal output
  --help           Show this help

Examples:
  npm run robot
  npm run robot -- --script scripts/qa-basic.json
  npm run robot -- --script scripts/qa-basic.json --speed 3000
`);
  process.exit(0);
}

const scriptPath = args[args.indexOf('--script') + 1];
const speed = parseInt(args[args.indexOf('--speed') + 1]) || 2000;

if (scriptPath) {
  runScriptFile(scriptPath, speed);
} else {
  runDemo();
}
