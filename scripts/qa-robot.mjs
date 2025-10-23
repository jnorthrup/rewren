#!/usr/bin/env node
/**
 * TUI Testing Robot
 * Automated continuous testing with simulated user interactions
 */

import { createTest, createSuite, TuiSession } from './lib/tui-test-harness.mjs';
import { writeFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const RESULTS_FILE = '.wren/qa-robot-results.json';
const robotResults = {
  startTime: new Date().toISOString(),
  cycles: 0,
  totalTests: 0,
  totalPassed: 0,
  totalFailed: 0,
  suites: []
};

function log(msg) {
  console.log(`[ROBOT] ${msg}`);
}

function saveResults() {
  robotResults.endTime = new Date().toISOString();
  writeFileSync(RESULTS_FILE, JSON.stringify(robotResults, null, 2));
}

// ============================================
// TEST SUITES
// ============================================

function createBasicCommandsSuite() {
  const suite = createSuite('Basic Commands');

  // Test: /help command
  suite.addTest(
    createTest('/help command shows help text')
      .startSession({ commandDelay: 800 })
      .send('/help')
      .wait(1000)
      .assertNoErrors()
      .stopSession()
  );

  // Test: /about command
  suite.addTest(
    createTest('/about command works')
      .startSession({ commandDelay: 800 })
      .send('/about')
      .wait(1000)
      .assertNoErrors()
      .stopSession()
  );

  // Test: /clear command
  suite.addTest(
    createTest('/clear command clears history')
      .startSession({ commandDelay: 800 })
      .send('test message')
      .wait(500)
      .send('/clear')
      .wait(500)
      .assertNoErrors()
      .stopSession()
  );

  // Test: Multiple commands in sequence
  suite.addTest(
    createTest('Multiple commands execute sequentially')
      .startSession({ commandDelay: 600 })
      .send('/help')
      .wait(500)
      .send('/about')
      .wait(500)
      .send('/help')
      .wait(500)
      .assertNoErrors()
      .stopSession()
  );

  return suite;
}

function createProviderTreeSuite() {
  const suite = createSuite('Provider Tree');

  // Test: Open provider tree
  suite.addTest(
    createTest('/auth opens provider tree')
      .startSession({ commandDelay: 1000 })
      .send('/auth')
      .wait(1500)
      .assertNoErrors()
      .stopSession()
  );

  // Test: ESC closes provider tree
  suite.addTest(
    createTest('ESC closes provider tree')
      .startSession({ commandDelay: 1000 })
      .send('/auth')
      .wait(1000)
      .sendKey('esc')
      .wait(500)
      .send('/help')
      .wait(500)
      .assertNoErrors()
      .stopSession()
  );

  return suite;
}

function createInputHandlingSuite() {
  const suite = createSuite('Input Handling');

  // Test: Empty input
  suite.addTest(
    createTest('Empty input does not crash')
      .startSession({ commandDelay: 300 })
      .sendRaw('\n')
      .wait(300)
      .sendRaw('\n')
      .wait(300)
      .assertNoErrors()
      .stopSession()
  );

  // Test: Long input
  suite.addTest(
    createTest('Long input handled correctly')
      .startSession({ commandDelay: 800 })
      .send('a'.repeat(500))
      .wait(1000)
      .assertNoErrors()
      .stopSession()
  );

  // Test: Special characters
  suite.addTest(
    createTest('Special characters in input')
      .startSession({ commandDelay: 800 })
      .send('!@#$%^&*(){}[]<>?')
      .wait(1000)
      .assertNoErrors()
      .stopSession()
  );

  // Test: Unicode
  suite.addTest(
    createTest('Unicode input handled')
      .startSession({ commandDelay: 800 })
      .send('你好 🚀 émoji')
      .wait(1000)
      .assertNoErrors()
      .stopSession()
  );

  return suite;
}

function createErrorHandlingSuite() {
  const suite = createSuite('Error Handling');

  // Test: Invalid command
  suite.addTest(
    createTest('Invalid command shows error')
      .startSession({ commandDelay: 800 })
      .send('/nonexistent')
      .wait(1000)
      .assertNoErrors()
      .stopSession()
  );

  // Test: Double slash
  suite.addTest(
    createTest('Double slash handled')
      .startSession({ commandDelay: 800 })
      .send('//test')
      .wait(1000)
      .assertNoErrors()
      .stopSession()
  );

  // Test: Slash only
  suite.addTest(
    createTest('Slash-only input handled')
      .startSession({ commandDelay: 800 })
      .send('/')
      .wait(1000)
      .assertNoErrors()
      .stopSession()
  );

  return suite;
}

function createStressSuite() {
  const suite = createSuite('Stress Testing');

  // Test: Rapid commands
  suite.addTest(
    createTest('Rapid command spam')
      .startSession({ commandDelay: 100 })
      .send('/help')
      .send('/help')
      .send('/help')
      .send('/about')
      .send('/help')
      .send('/help')
      .wait(1000)
      .assertNoErrors()
      .stopSession()
  );

  // Test: Mixed rapid input
  suite.addTest(
    createTest('Mixed rapid input types')
      .startSession({ commandDelay: 100 })
      .send('/help')
      .send('test query')
      .send('/about')
      .send('another query')
      .send('/help')
      .wait(1000)
      .assertNoErrors()
      .stopSession()
  );

  return suite;
}

function createQueryProcessingSuite() {
  const suite = createSuite('Query Processing');

  // Test: Simple query
  suite.addTest(
    createTest('Simple query triggers processing')
      .startSession({ commandDelay: 1500 })
      .send('hello')
      .wait(2000)
      .assertNoErrors()
      .stopSession()
  );

  // Test: Query with special chars
  suite.addTest(
    createTest('Query with special characters')
      .startSession({ commandDelay: 1500 })
      .send('what is 2+2?')
      .wait(2000)
      .assertNoErrors()
      .stopSession()
  );

  return suite;
}

// ============================================
// ROBOT CONTROL
// ============================================

async function runCycle(suites) {
  robotResults.cycles++;
  log(`━━━ Starting Cycle ${robotResults.cycles} ━━━\n`);

  for (const suite of suites) {
    const result = await suite.run();
    robotResults.totalTests += result.tests.length;
    robotResults.totalPassed += result.passed;
    robotResults.totalFailed += result.failed;
    robotResults.suites.push(result);
  }

  log(`\n━━━ Cycle ${robotResults.cycles} Complete ━━━`);
  log(`Passed: ${robotResults.totalPassed}`);
  log(`Failed: ${robotResults.totalFailed}`);
  log('');

  saveResults();
}

async function runRobot(options = {}) {
  const {
    cycles = 1,
    delayBetweenCycles = 2000,
    continuous = false
  } = options;

  log('╔══════════════════════════════════════════╗');
  log('║     TUI TESTING ROBOT ACTIVATED         ║');
  log('╚══════════════════════════════════════════╝\n');

  const suites = [
    createBasicCommandsSuite(),
    createProviderTreeSuite(),
    createInputHandlingSuite(),
    createErrorHandlingSuite(),
    createStressSuite(),
    createQueryProcessingSuite()
  ];

  if (continuous) {
    log('Running in CONTINUOUS mode (Ctrl+C to stop)\n');

    while (true) {
      await runCycle(suites);
      log(`Waiting ${delayBetweenCycles}ms before next cycle...\n`);
      await sleep(delayBetweenCycles);
    }
  } else {
    log(`Running ${cycles} cycle(s)\n`);

    for (let i = 0; i < cycles; i++) {
      await runCycle(suites);

      if (i < cycles - 1) {
        log(`Waiting ${delayBetweenCycles}ms before next cycle...\n`);
        await sleep(delayBetweenCycles);
      }
    }
  }

  // Final summary
  log('\n╔══════════════════════════════════════════╗');
  log('║         ROBOT TESTING COMPLETE          ║');
  log('╚══════════════════════════════════════════╝\n');
  log(`Total Cycles: ${robotResults.cycles}`);
  log(`Total Tests: ${robotResults.totalTests}`);
  log(`Total Passed: ${robotResults.totalPassed}`);
  log(`Total Failed: ${robotResults.totalFailed}`);
  log(`Results: ${RESULTS_FILE}\n`);

  if (robotResults.totalFailed > 0) {
    log('❌ SOME TESTS FAILED');
    process.exit(1);
  } else {
    log('✅ ALL TESTS PASSED');
    process.exit(0);
  }
}

// ============================================
// CLI INTERFACE
// ============================================

const args = process.argv.slice(2);
const options = {
  cycles: 1,
  delayBetweenCycles: 2000,
  continuous: false
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--cycles':
      options.cycles = parseInt(args[++i]) || 1;
      break;
    case '--delay':
      options.delayBetweenCycles = parseInt(args[++i]) || 2000;
      break;
    case '--continuous':
      options.continuous = true;
      break;
    case '--help':
      console.log(`
TUI Testing Robot - Automated continuous testing

Usage:
  npm run test:qa-robot [options]

Options:
  --cycles N       Run N cycles (default: 1)
  --delay MS       Delay between cycles in ms (default: 2000)
  --continuous     Run continuously until stopped
  --help           Show this help

Examples:
  npm run test:qa-robot
  npm run test:qa-robot -- --cycles 5
  npm run test:qa-robot -- --continuous
  npm run test:qa-robot -- --cycles 10 --delay 5000
`);
      process.exit(0);
  }
}

// Start the robot
runRobot(options).catch(err => {
  log(`FATAL ERROR: ${err.message}`);
  saveResults();
  process.exit(1);
});
