/**
 * TUI Test Harness API
 * Programmatic interface for simulating user interactions with TUI
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import { EventEmitter } from 'events';

export class TuiSession extends EventEmitter {
  constructor(options = {}) {
    super();
    this.proc = null;
    this.output = '';
    this.errorOutput = '';
    this.exitCode = null;
    this.isReady = false;
    this.options = {
      timeout: options.timeout || 120000,
      startupDelay: options.startupDelay || 2000,
      commandDelay: options.commandDelay || 1000,
      env: options.env || {},
      ...options
    };
  }

  /**
   * Start the TUI session
   */
  async start() {
    return new Promise((resolve, reject) => {
      // Run built CLI directly to skip build checks
      this.proc = spawn('node', ['packages/cli/dist/index.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.options.env },
        cwd: process.cwd()
      });

      this.proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        this.output += chunk;
        this.emit('output', chunk);
      });

      this.proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        this.errorOutput += chunk;
        this.emit('stderr', chunk);
      });

      this.proc.on('exit', (code) => {
        this.exitCode = code;
        this.emit('exit', code);
      });

      this.proc.on('error', (err) => {
        reject(err);
      });

      // Wait for startup
      setTimeout(async () => {
        this.isReady = true;
        this.emit('ready');
        resolve();
      }, this.options.startupDelay);
    });
  }

  /**
   * Send input to the TUI
   */
  async send(input) {
    if (!this.isReady || !this.proc) {
      throw new Error('Session not ready');
    }

    this.proc.stdin.write(input + '\n');
    await sleep(this.options.commandDelay);
    return this;
  }

  /**
   * Send raw input without newline
   */
  sendRaw(input) {
    this.steps.push(async () => {
      if (!this.session.isReady || !this.session.proc) {
        throw new Error('Session not ready');
      }
      this.session.proc.stdin.write(input);
      await sleep(this.session.options.commandDelay);
    });
    return this;
  }

  /**
   * Send special key
   */
  async sendKey(key) {
    const keyMap = {
      'enter': '\n',
      'esc': '\x1b',
      'tab': '\t',
      'backspace': '\x7f',
      'up': '\x1b[A',
      'down': '\x1b[B',
      'left': '\x1b[D',
      'right': '\x1b[C',
      'ctrl-c': '\x03',
    };

    const keyCode = keyMap[key.toLowerCase()] || key;
    return this.sendRaw(keyCode);
  }

  /**
   * Wait for specific output
   */
  async waitFor(pattern, timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (typeof pattern === 'string') {
        if (this.output.includes(pattern)) {
          return true;
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(this.output)) {
          return true;
        }
      }
      await sleep(100);
    }

    throw new Error(`Timeout waiting for: ${pattern}`);
  }

  /**
   * Clear output buffer
   */
  clearOutput() {
    this.output = '';
    this.errorOutput = '';
    return this;
  }

  /**
   * Get current output
   */
  getOutput() {
    return this.output;
  }

  /**
   * Get error output
   */
  getErrors() {
    return this.errorOutput;
  }

  /**
   * Check if output contains text
   */
  hasOutput(text) {
    return this.output.includes(text);
  }

  /**
   * Check if output matches regex
   */
  matchesOutput(regex) {
    return regex.test(this.output);
  }

  /**
   * Stop the session
   */
  async stop(signal = 'SIGTERM') {
    if (this.proc) {
      this.proc.kill(signal);
      await sleep(1000);
    }
    return this;
  }

  /**
   * Destroy the session
   */
  async destroy() {
    await this.stop('SIGKILL');
  }
}

/**
 * Test builder for fluent API
 */
export class TuiTest {
  constructor(name) {
    this.name = name;
    this.session = null;
    this.steps = [];
    this.assertions = [];
  }

  /**
   * Start a new session
   */
  startSession(options = {}) {
    this.steps.push(async () => {
      this.session = new TuiSession(options);
      await this.session.start();
    });
    return this;
  }

  /**
   * Send command
   */
  send(input) {
    this.steps.push(async () => {
      if (!this.session.isReady || !this.session.proc) {
        throw new Error('Session not ready');
      }
      this.session.proc.stdin.write(input + '\n');
      await sleep(this.session.options.commandDelay);
    });
    return this;
  }

  /**
   * Send raw input without newline
   */
  sendRaw(input) {
    this.steps.push(async () => {
      if (!this.session.isReady || !this.session.proc) {
        throw new Error('Session not ready');
      }
      this.session.proc.stdin.write(input);
      await sleep(this.session.options.commandDelay);
    });
    return this;
  }

  /**
   * Send key
   */
  sendKey(key) {
    this.steps.push(async () => {
      const keyMap = {
        'enter': '\n',
        'esc': '\x1b',
        'tab': '\t',
        'backspace': '\x7f',
        'up': '\x1b[A',
        'down': '\x1b[B',
        'left': '\x1b[D',
        'right': '\x1b[C',
        'ctrl-c': '\x03',
      };
      const keyCode = keyMap[key.toLowerCase()] || key;

      if (!this.session.isReady || !this.session.proc) {
        throw new Error('Session not ready');
      }
      this.session.proc.stdin.write(keyCode);
      await sleep(this.session.options.commandDelay);
    });
    return this;
  }

  /**
   * Wait for output
   */
  waitFor(pattern, timeout) {
    this.steps.push(async () => {
      await this.session.waitFor(pattern, timeout);
    });
    return this;
  }

  /**
   * Wait for delay
   */
  wait(ms) {
    this.steps.push(async () => {
      await sleep(ms);
    });
    return this;
  }

  /**
   * Assert output contains text
   */
  assertContains(text) {
    this.assertions.push({
      type: 'contains',
      value: text,
      check: () => {
        if (!this.session.hasOutput(text)) {
          throw new Error(`Output does not contain: ${text}`);
        }
      }
    });
    return this;
  }

  /**
   * Assert output matches regex
   */
  assertMatches(regex) {
    this.assertions.push({
      type: 'matches',
      value: regex,
      check: () => {
        if (!this.session.matchesOutput(regex)) {
          throw new Error(`Output does not match: ${regex}`);
        }
      }
    });
    return this;
  }

  /**
   * Assert no errors
   */
  assertNoErrors() {
    this.assertions.push({
      type: 'noErrors',
      check: () => {
        const errors = this.session.getErrors();
        if (errors.match(/Error:|ENOENT|Cannot find module/i)) {
          throw new Error(`Errors detected: ${errors.substring(0, 200)}`);
        }
      }
    });
    return this;
  }

  /**
   * Assert exit code
   */
  assertExitCode(code) {
    this.assertions.push({
      type: 'exitCode',
      value: code,
      check: () => {
        if (this.session.exitCode !== code &&
            this.session.exitCode !== 143 &&
            this.session.exitCode !== 15) {
          throw new Error(`Exit code ${this.session.exitCode} != ${code}`);
        }
      }
    });
    return this;
  }

  /**
   * Custom assertion
   */
  assert(fn, message) {
    this.assertions.push({
      type: 'custom',
      check: () => {
        if (!fn(this.session)) {
          throw new Error(message || 'Custom assertion failed');
        }
      }
    });
    return this;
  }

  /**
   * Stop session
   */
  stopSession() {
    this.steps.push(async () => {
      await this.session.stop();
    });
    return this;
  }

  /**
   * Run the test
   */
  async run() {
    try {
      // Execute all steps
      for (const step of this.steps) {
        await step();
      }

      // Run assertions
      for (const assertion of this.assertions) {
        assertion.check();
      }

      // Cleanup
      if (this.session) {
        await this.session.destroy();
      }

      return { success: true, name: this.name };
    } catch (error) {
      // Cleanup on error
      if (this.session) {
        await this.session.destroy();
      }

      return {
        success: false,
        name: this.name,
        error: error.message,
        output: this.session?.getOutput() || '',
        errors: this.session?.getErrors() || ''
      };
    }
  }
}

/**
 * Test suite runner
 */
export class TuiTestSuite {
  constructor(name) {
    this.name = name;
    this.tests = [];
  }

  /**
   * Add test to suite
   */
  addTest(test) {
    this.tests.push(test);
    return this;
  }

  /**
   * Run all tests
   */
  async run() {
    const results = {
      suite: this.name,
      passed: 0,
      failed: 0,
      tests: []
    };

    console.log(`\n━━━ Test Suite: ${this.name} ━━━\n`);

    for (const test of this.tests) {
      console.log(`Running: ${test.name}...`);
      const result = await test.run();

      if (result.success) {
        console.log(`✓ PASS: ${test.name}`);
        results.passed++;
      } else {
        console.log(`✗ FAIL: ${test.name}`);
        console.log(`  Error: ${result.error}`);
        results.failed++;
      }

      results.tests.push(result);
    }

    console.log(`\nSuite Results: ${results.passed} passed, ${results.failed} failed\n`);

    return results;
  }
}

/**
 * Helper to create a test
 */
export function createTest(name) {
  return new TuiTest(name);
}

/**
 * Helper to create a suite
 */
export function createSuite(name) {
  return new TuiTestSuite(name);
}
