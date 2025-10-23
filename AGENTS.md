# AGENTS.md - Autonomous Testing & Visual Workspace Architecture

**Priority:** CRITICAL
**Status:** PRODUCTION READY
**Last Updated:** 2025-10-23

## Executive Summary

Complete autonomous testing infrastructure with visual MDI workspace for TUI automation, robot execution, and multi-session management.

## System Architecture

```
┌───────────────────────────────────────────────────────────┐
│                  VISUAL MDI WORKSPACE                      │
│         Web-based Multi-Document Interface                 │
│     Drag/Drop, Tile, Cascade, Docking, Live Streaming    │
│                  http://localhost:3030                     │
└──────────────────────┬────────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
┌────────▼──────────┐       ┌───────▼──────────┐
│  Workspace Manager│       │   Robot System   │
│   (Node Server)   │       │  Autonomous TUI  │
│  - WebSocket      │       │   Orchestration  │
│  - Session Mgmt   │       │  - Script Engine │
│  - Live Streaming │       │  - Observation   │
└────────┬──────────┘       └───────┬──────────┘
         │                           │
         └─────────────┬─────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
┌────────▼──────────┐       ┌───────▼──────────┐
│  Tmux Backend     │       │   TUI (Blessed)  │
│  (Hidden Layer)   │       │  User Interface  │
│  - Multi-session  │       │  - CommandService│
│  - Output capture │       │  - Provider Tree │
│  - No user input  │       │  - Query Process │
└───────────────────┘       └──────────────────┘
```

## Core Components

### 1. Visual MDI Workspace (`npm run workspace`)

**Location:** `packages/cli/src/ui/tmux-workspace/`
**Purpose:** Graphical environment for managing multiple testing sessions

**Features:**
- Multi-window MDI interface
- Drag-and-drop positioning
- Border resizing
- Cascade/tile layouts
- Live console streaming
- No tmux exposure to user
- WebSocket real-time updates

**Key Files:**
- `server.mjs` - Node.js backend (Express + WebSocket)
- `public/index.html` - MDI interface
- `public/workspace.js` - Window management

**API:**
```javascript
// Create session
POST /api/sessions
{ name, width, height }

// Stream output
WebSocket: { type: 'stream-pane', sessionName, paneId }

// Send command
POST /api/sessions/:name/panes/:paneId/send
{ command }
```

**Usage:**
```bash
npm run workspace
# Open http://localhost:3030
# Click "+ New Session"
# Click "🤖 Run Robot Demo"
# Watch live automation
```

### 2. Autonomous TUI Robot (`npm run robot`)

**Location:** `scripts/tui-robot.mjs`
**Purpose:** AI-driven autonomous TUI control with full observability

**Features:**
- Full TUI access and control
- Real-time observation logging
- Snapshot capabilities
- Human-speed timing (watchable)
- Script execution engine
- JSON script format

**Script Format:**
```json
{
  "name": "Test Name",
  "description": "What this tests",
  "speed": 2500,
  "steps": [
    {
      "type": "send",
      "data": "/help",
      "description": "Open help menu",
      "snapshot": "help-screen",
      "observe": {
        "type": "contains",
        "value": "command"
      }
    }
  ]
}
```

**Robot API:**
```javascript
const robot = new TuiRobot({ speed: 2500 });
await robot.start();
await robot.action('send', '/help', 'Opening help');
await robot.takeSnapshot('help-menu');
await robot.runScript('path/to/script.json');
await robot.saveLogs('.wren/robot-log.json');
await robot.stop();
```

**Available Scripts:**
- `scripts/qa-scripts/basic-commands.json` - Basic command tests
- `scripts/qa-scripts/provider-tree.json` - Provider navigation
- `scripts/qa-scripts/full-workflow.json` - Complete user workflow

**Usage:**
```bash
# Demo mode
npm run robot

# Run script at 3s/action
npm run robot -- --script scripts/qa-scripts/full-workflow.json --speed 3000

# Quiet mode
npm run robot -- --script FILE --quiet
```

### 3. Test Harness API

**Location:** `scripts/lib/tui-test-harness.mjs`
**Purpose:** Programmatic TUI testing API

**Classes:**

#### TuiSession
Low-level session control:
```javascript
const session = new TuiSession();
await session.start();
await session.send('/help');
await session.sendKey('esc');
await session.waitFor('Provider', 5000);
const output = session.getOutput();
await session.stop();
```

#### TuiTest
Fluent test builder:
```javascript
const test = createTest('My Test')
  .startSession({ commandDelay: 800 })
  .send('/auth')
  .wait(1000)
  .sendKey('down')
  .assertContains('Provider')
  .assertNoErrors()
  .stopSession();

await test.run();
```

#### TuiTestSuite
Suite runner:
```javascript
const suite = createSuite('Basic Commands');
suite.addTest(test1);
suite.addTest(test2);
await suite.run();
```

### 4. QA Robot (`npm run test:qa-robot`)

**Location:** `scripts/qa-robot.mjs`
**Purpose:** Continuous automated testing with looping

**Features:**
- 6 test suites, 17 automated tests
- Continuous monitoring mode
- JSON results logging
- Multi-cycle execution

**Test Suites:**
1. Basic Commands (4 tests)
2. Provider Tree (2 tests)
3. Input Handling (4 tests)
4. Error Handling (3 tests)
5. Stress Testing (2 tests)
6. Query Processing (2 tests)

**Usage:**
```bash
# Single cycle
npm run test:qa-robot

# 10 cycles with 5s delay
npm run test:qa-robot -- --cycles 10 --delay 5000

# Continuous mode
npm run test:qa-robot -- --continuous
```

**Output:** `.wren/qa-robot-results.json`

### 5. Blessed TUI (`packages/cli/src/ui/BlessedTui.ts`)

**Purpose:** Terminal UI with CommandService integration

**Features:**
- Command registry system
- Provider tree with dual-pane layout
- Query processing via AI
- Ctrl+C handling
- Input persistence
- No crashes on errors

**Architecture:**
```javascript
BlessedTui
├── CommandService (slash commands)
├── Provider Tree (dual-pane)
│   ├── Tree navigation (↑↓ enter esc)
│   └── Detail view
└── Query Processing (AI integration)
```

### 6. Tmux Environments

**Locations:**
- `scripts/tmux-test-env.sh` - Basic 3-pane layout
- `scripts/tmux-qa-layout.sh` - 4-pane QA dashboard

**Features:**
- Fixed terminal size (200x60, 220x65)
- Color-coded borders
- Status bars
- Multiple windows
- macOS Terminal.app integration

**Usage:**
```bash
# Basic environment
npm run test-env

# QA dashboard
npm run qa-env

# New Terminal window
npm run launch-test
npm run launch-qa
```

## Priorities & Workflow

### Priority 1: Visual Workspace (HIGHEST)

**Use Case:** Watch automation happen live in graphical interface

**Workflow:**
```bash
# Terminal 1
npm run workspace

# Browser
http://localhost:3030
# Click "🤖 Run Robot Demo"
# Drag windows, tile layout
# Watch live automation
```

**Why:**
- Most user-friendly
- No tmux knowledge required
- Full visual feedback
- MDI for multiple simultaneous views
- Real-time streaming

### Priority 2: Autonomous Robot

**Use Case:** Run pre-defined automation scripts

**Workflow:**
```bash
# Run script at human-watchable speed
npm run robot -- --script scripts/qa-scripts/full-workflow.json --speed 3000

# Output logged to .wren/robot-script-log.json
```

**Why:**
- Scriptable automation
- Repeatable tests
- Human-speed execution
- Full observability

### Priority 3: QA Robot (Continuous Testing)

**Use Case:** Automated continuous testing

**Workflow:**
```bash
# Run continuous QA
npm run test:qa-robot -- --continuous

# Results: .wren/qa-robot-results.json
```

**Why:**
- Automated validation
- Regression testing
- Metrics tracking
- No human intervention

### Priority 4: Tmux Environments

**Use Case:** Terminal-based testing for developers

**Workflow:**
```bash
npm run qa-env
# Switch panes with Ctrl+b arrows
# Run robot in top-left pane
```

**Why:**
- Terminal-native
- Multi-pane views
- Tmux power users

## Integration Points

### With Visual Workspace

```bash
# Start workspace
npm run workspace

# In browser, click "🤖 Robot"
# Or create session and run:
cd /Users/jim/work/wren3
npm run robot -- --script scripts/qa-scripts/basic-commands.json

# Watch in MDI window
```

### With CI/CD

```yaml
# GitHub Actions
- name: Run QA Robot
  run: npm run test:qa-robot -- --cycles 5

- name: Upload Results
  uses: actions/upload-artifact@v3
  with:
    name: qa-results
    path: .wren/qa-robot-results.json
```

### With Development

```bash
# Write script
vim scripts/qa-scripts/my-test.json

# Test in workspace
npm run workspace
# Click session, run script

# Or test directly
npm run robot -- --script scripts/qa-scripts/my-test.json --speed 2000
```

## Agent Capabilities

### Observation
- Real-time stdout/stderr capture
- Snapshot system for TUI state
- JSON logging of all events
- WebSocket streaming

### Control
- Send commands to TUI
- Navigate with keys (↑↓←→ enter esc)
- Execute slash commands
- Split/resize panes
- Create/kill sessions

### Autonomy
- Script execution engine
- Decision-making (observe → action)
- Human-speed timing
- Error recovery
- Parallel execution

### Feedback
- Live console streaming
- Action logging
- Observation logging
- Test results JSON
- Status routing

## Development Guide

### Creating New Robot Script

```json
{
  "name": "My Test",
  "description": "Tests XYZ",
  "speed": 2500,
  "steps": [
    {
      "type": "send",
      "data": "command",
      "description": "What this does",
      "snapshot": "label",
      "observe": {
        "type": "contains",
        "value": "expected"
      }
    }
  ]
}
```

Save to `scripts/qa-scripts/my-test.json`

### Creating New Test

```javascript
const test = createTest('Test Name')
  .startSession()
  .send('input')
  .wait(1000)
  .assertContains('output')
  .stopSession();

await test.run();
```

### Adding to Workspace

Edit `public/workspace.js`:

```javascript
async function runMyTest() {
    await workspace.createSession('my-test');
    // Send commands...
}
```

Add button to `public/index.html`:

```html
<button onclick="runMyTest()">My Test</button>
```

## Performance Metrics

### Visual Workspace
- Server: 50MB RAM
- Per session: 10MB RAM
- Browser: 100MB base + 20MB/window
- Latency: <5ms (localhost)
- Max windows: 20 recommended

### Robot
- Process: 30MB RAM
- Per action: ~100ms overhead
- Human speed: 2-3s/action
- Script execution: Varies by script

### QA Robot
- Single cycle: 90-120s
- 17 tests per cycle
- Memory stable over cycles
- Results: ~50KB JSON

## Troubleshooting

### Workspace Not Starting

```bash
# Check port
lsof -i :3030

# Kill if needed
kill -9 PID

# Or use different port
PORT=3031 npm run workspace
```

### Robot Hangs

```bash
# Kill all tmux sessions
tmux ls | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
```

### Tmux Input Captured

Robot disables tmux input after session creation. If stuck:

```bash
# Kill session
tmux kill-session -t SESSION_NAME
```

## Documentation

- `docs/QA_AUTOMATION.md` - Testing framework details
- `docs/TESTING_ENVIRONMENT.md` - Tmux environments
- `docs/VISUAL_WORKSPACE.md` - MDI workspace guide

## Future Enhancements

1. **LLM-Driven Robot** - AI decides what to test based on code changes
2. **Persistent Layouts** - Save/load workspace layouts
3. **Collaborative Mode** - Multi-user shared workspace
4. **Recording/Playback** - Record sessions, replay later
5. **Visual Regression** - Screenshot comparison
6. **Performance Profiling** - CPU/memory tracking
7. **Electron App** - Native desktop application
8. **Touch Support** - iPad/tablet gestures

## Quick Reference

```bash
# Visual Workspace
npm run workspace                    # Start MDI server

# Robot
npm run robot                        # Demo
npm run robot -- --script FILE       # Run script

# QA Robot
npm run test:qa-robot                # Single cycle
npm run test:qa-robot -- --continuous # Continuous

# Tmux Environments
npm run test-env                     # Basic 3-pane
npm run qa-env                       # QA 4-pane dashboard
npm run launch-test                  # New Terminal window

# Smoke Tests
npm run test:qa-tui                  # Quick validation (10s)
```

## Critical Notes

1. **Tmux is hidden** - User never sees tmux commands
2. **Input disabled** - Tmux input capture disabled after setup
3. **Visual first** - MDI workspace is primary interface
4. **Human speed** - All automation runs at watchable speeds
5. **Full observability** - Everything logged and streamed
6. **No crashes** - Error handling preserves interactivity
7. **Parallel capable** - Multiple sessions simultaneously

---

**For issues:** See individual documentation files
**For development:** Follow Development Guide above
**For CI/CD:** Use QA Robot with --cycles flag
