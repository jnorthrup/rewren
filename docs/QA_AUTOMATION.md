# TUI QA Automation System

Comprehensive automated testing infrastructure for the Wren Coder TUI.

## Overview

The QA automation system provides three levels of testing:

1. **Smoke Tests** (`test:qa-tui`) - Fast basic checks
2. **Comprehensive Tests** (`test:qa`) - Full feature coverage
3. **Robot Testing** (`test:qa-robot`) - Continuous automated testing with simulated user input

## Quick Start

```bash
# Run smoke tests (30 seconds)
npm run test:qa-tui

# Run comprehensive tests (2-3 minutes)
npm run test:qa

# Run robot tests (1 cycle)
npm run test:qa-robot

# Run robot continuously
npm run test:qa-robot -- --continuous

# Run robot for N cycles
npm run test:qa-robot -- --cycles 10
```

## Architecture

### Test Harness API (`scripts/lib/tui-test-harness.mjs`)

Programmatic API for simulating user interactions:

#### TuiSession Class

Low-level session control:

```javascript
import { TuiSession } from './lib/tui-test-harness.mjs';

const session = new TuiSession();
await session.start();
await session.send('/help');
await session.sendKey('esc');
await session.waitFor('Provider');
await session.stop();
```

**Methods:**
- `start()` - Launch TUI session
- `send(input)` - Send text + newline
- `sendRaw(input)` - Send without newline
- `sendKey(key)` - Send special keys ('esc', 'enter', 'ctrl-c', 'up', 'down', etc)
- `waitFor(pattern, timeout)` - Wait for output
- `hasOutput(text)` - Check if output contains text
- `matchesOutput(regex)` - Test output against regex
- `getOutput()` - Get captured output
- `getErrors()` - Get stderr output
- `stop()` - Terminate session

#### TuiTest Class

Fluent test builder:

```javascript
import { createTest } from './lib/tui-test-harness.mjs';

const test = createTest('My test')
  .startSession({ commandDelay: 800 })
  .send('/help')
  .wait(1000)
  .assertContains('command')
  .assertNoErrors()
  .stopSession();

await test.run();
```

**Builder Methods:**
- `startSession(options)` - Create session
  - `commandDelay` - ms between commands (default: 1000)
  - `startupDelay` - ms for startup (default: 2000)
  - `timeout` - max session time (default: 120000)
- `send(input)` - Send command
- `sendRaw(input)` - Send without newline
- `sendKey(key)` - Send special key
- `wait(ms)` - Pause
- `waitFor(pattern, timeout)` - Wait for output
- `assertContains(text)` - Assert output contains
- `assertMatches(regex)` - Assert output matches
- `assertNoErrors()` - Assert no stderr errors
- `assertExitCode(code)` - Assert exit code
- `assert(fn, message)` - Custom assertion
- `stopSession()` - End session

#### TuiTestSuite Class

Test suite runner:

```javascript
import { createSuite, createTest } from './lib/tui-test-harness.mjs';

const suite = createSuite('My Suite');

suite.addTest(
  createTest('Test 1')
    .startSession()
    .send('/help')
    .assertNoErrors()
    .stopSession()
);

suite.addTest(
  createTest('Test 2')
    .startSession()
    .send('/about')
    .assertNoErrors()
    .stopSession()
);

await suite.run();
```

## Test Scripts

### 1. Smoke Tests (`scripts/qa-tui.mjs`)

**Purpose:** Fast verification TUI starts/stops correctly

**Tests:**
- TUI starts without crashing
- TUI exits cleanly on SIGTERM

**Runtime:** ~10 seconds

```bash
npm run test:qa-tui
```

### 2. Comprehensive Tests (`scripts/qa-comprehensive.mjs`)

**Purpose:** Full feature coverage

**Test Categories:**
1. **Startup & Shutdown**
   - Clean startup
   - SIGTERM handling
   - Rapid start/stop cycles

2. **Slash Commands**
   - `/help`, `/auth`, `/clear`, `/about`, `/theme`
   - Unknown command handling

3. **Input Handling**
   - Prompt persistence
   - Empty input
   - Long input (1000 chars)
   - Special characters
   - Unicode

4. **Error Handling**
   - Invalid commands
   - Command spam
   - Unicode input

5. **Provider Tree**
   - Opens with `/auth`
   - ESC closes tree

6. **Query Processing**
   - Non-slash input triggers processing

7. **Stress Testing**
   - Extended sessions (30+ commands)
   - Concurrent operations

**Runtime:** ~2-3 minutes

**Output:** `.wren/qa-results.json`

```bash
npm run test:qa
```

### 3. Robot Testing (`scripts/qa-robot.mjs`)

**Purpose:** Continuous automated testing with simulated user behavior

**Test Suites:**
1. Basic Commands (4 tests)
2. Provider Tree (2 tests)
3. Input Handling (4 tests)
4. Error Handling (3 tests)
5. Stress Testing (2 tests)
6. Query Processing (2 tests)

**Total:** 17 automated tests

**Usage:**

```bash
# Run once
npm run test:qa-robot

# Run 5 cycles with 3s delay
npm run test:qa-robot -- --cycles 5 --delay 3000

# Run continuously (Ctrl+C to stop)
npm run test:qa-robot -- --continuous

# See options
npm run test:qa-robot -- --help
```

**Output:** `.wren/qa-robot-results.json`

**Features:**
- Simulates real user interactions
- Fluent API for test definition
- Automatic session management
- Detailed JSON results logging
- Continuous monitoring mode

## Writing Custom Tests

### Example: Basic Test

```javascript
import { createTest } from './lib/tui-test-harness.mjs';

const test = createTest('Provider tree navigation')
  .startSession({ commandDelay: 1000 })
  .send('/auth')                    // Open provider tree
  .wait(1500)                       // Wait for UI
  .sendKey('down')                  // Navigate down
  .sendKey('down')
  .sendKey('enter')                 // Expand node
  .wait(500)
  .sendKey('esc')                   // Close tree
  .wait(500)
  .send('/help')                    // Verify still responsive
  .assertNoErrors()
  .stopSession();

const result = await test.run();
console.log(result.success ? 'PASS' : 'FAIL');
```

### Example: Custom Suite

```javascript
import { createSuite, createTest } from './lib/tui-test-harness.mjs';

function createMySuite() {
  const suite = createSuite('Custom Feature Tests');

  suite.addTest(
    createTest('Feature A works')
      .startSession()
      .send('/custom-command')
      .assertContains('expected output')
      .stopSession()
  );

  suite.addTest(
    createTest('Feature B handles errors')
      .startSession()
      .send('/broken-command')
      .assertContains('error message')
      .assertNoErrors() // Checks stderr, not displayed errors
      .stopSession()
  );

  return suite;
}

// Run it
const results = await createMySuite().run();
console.log(`${results.passed}/${results.tests.length} passed`);
```

## API Examples

### Simulating Complex User Flows

```javascript
const test = createTest('Complete user workflow')
  .startSession({ commandDelay: 800 })

  // Setup provider
  .send('/auth')
  .wait(1000)
  .sendKey('down')
  .sendKey('enter')
  .wait(500)
  .sendKey('esc')

  // Run query
  .send('What is 2+2?')
  .wait(3000)

  // Check history
  .send('/help')
  .wait(500)

  // Clear and exit
  .send('/clear')
  .wait(500)

  .assertNoErrors()
  .stopSession();
```

### Custom Assertions

```javascript
const test = createTest('Custom validation')
  .startSession()
  .send('/auth')
  .wait(1000)
  .assert(
    (session) => session.getOutput().includes('Provider'),
    'Provider tree did not open'
  )
  .assert(
    (session) => session.getOutput().length > 100,
    'Not enough output generated'
  )
  .stopSession();
```

### Error Detection

```javascript
const test = createTest('Error handling')
  .startSession()
  .send('/nonexistent')
  .wait(1000)
  .assertContains('Unknown command')
  .assertNoErrors() // No stderr errors
  .stopSession();
```

## Results Format

### JSON Output Structure

```json
{
  "timestamp": "2025-10-23T15:00:00.000Z",
  "cycles": 1,
  "totalTests": 17,
  "totalPassed": 15,
  "totalFailed": 2,
  "suites": [
    {
      "suite": "Basic Commands",
      "passed": 4,
      "failed": 0,
      "tests": [
        {
          "name": "/help command shows help text",
          "success": true
        }
      ]
    }
  ]
}
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: TUI QA

on: [push, pull_request]

jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build

      # Smoke tests
      - run: npm run test:qa-tui

      # Full QA
      - run: npm run test:qa

      # Robot tests (3 cycles)
      - run: npm run test:qa-robot -- --cycles 3

      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: qa-results
          path: .wren/qa-*.json
```

## Troubleshooting

### Tests Timeout

Increase delays:

```javascript
.startSession({
  commandDelay: 2000,   // More time between commands
  startupDelay: 5000    // More time for startup
})
```

### Tests Fail on API Errors

API errors (404, auth issues) are detected by `assertNoErrors()`. To skip:

```javascript
// Don't assert no errors if API isn't configured
.send('query')
.wait(2000)
// .assertNoErrors()  // Skip this
.stopSession()
```

### Output Not Captured

Blessed TUI uses terminal control codes. Use longer waits:

```javascript
.send('/command')
.wait(2000)  // Wait longer for blessed rendering
```

## Best Practices

1. **Always wait after commands** - TUI needs time to render
2. **Use appropriate delays** - Too fast = flaky tests
3. **Check stderr separately** - `assertNoErrors()` checks stderr, not displayed output
4. **Clean up sessions** - Always `.stopSession()` or use try/finally
5. **Log results** - Use JSON output for CI/CD integration
6. **Test in isolation** - Each test should be independent

## Performance

- Smoke tests: ~10s
- Comprehensive tests: ~120-180s
- Robot single cycle: ~90-120s
- Robot 10 cycles: ~15-20min

## Future Enhancements

- [ ] Screenshot capture
- [ ] Video recording
- [ ] Performance profiling
- [ ] Memory leak detection
- [ ] Coverage reporting
- [ ] AI-driven test generation
- [ ] Visual regression testing
