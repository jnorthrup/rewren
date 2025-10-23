# Visual MDI Workspace for TUI Testing

Graphical Multi-Document Interface for managing multiple testing sessions with live console output.

## Overview

The Visual Workspace provides a web-based MDI environment that:
- Manages multiple tmux sessions behind the scenes (user never sees tmux)
- Displays live console output in draggable/dockable windows
- Supports cascade, tile, and custom layouts
- Streams real-time output from testing sessions
- Provides visual controls (no tmux commands needed)

## Quick Start

```bash
# Start the workspace server
npm run workspace

# Open browser to http://localhost:3030
# Create sessions and watch tests run live
```

## Architecture

```
┌─────────────────────────────────────────┐
│         Web Browser (MDI GUI)           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐│
│  │ Window 1│  │ Window 2│  │ Window 3││
│  │ Session │  │ Session │  │ Session ││
│  └─────────┘  └─────────┘  └─────────┘│
└────────────┬────────────────────────────┘
             │ WebSocket + HTTP
┌────────────┴────────────────────────────┐
│      Workspace Manager (Node.js)         │
│  - Session Management                    │
│  - Output Streaming                      │
│  - Command Routing                       │
└────────────┬────────────────────────────┘
             │ Process Spawn
┌────────────┴────────────────────────────┐
│         Tmux Backend (Hidden)            │
│  - Multiple sessions                     │
│  - Input disabled after setup            │
│  - Output only                           │
└──────────────────────────────────────────┘
```

## Features

### MDI Window Management

- **Drag & Drop**: Click and drag window headers to reposition
- **Resize**: Drag borders and corners to resize windows
- **Dock**: Snap windows to edges (coming soon)
- **Cascade**: Automatic staggered layout
- **Tile**: Automatic grid layout
- **Minimize/Maximize**: Window controls

### Live Output Streaming

- Real-time console output
- Auto-scrolling terminal display
- Syntax highlighting (coming soon)
- Output search (coming soon)

### Session Management

- Create multiple independent sessions
- Each session runs in isolated tmux backend
- Send commands via input bar
- Split panes horizontally/vertically
- No tmux commands visible to user

## Interface

### Toolbar

```
┌────────────────────────────────────────────────────┐
│ [+ New Session] [Cascade] [Tile] [🤖 Robot] [QA]  │
│                            [Session Selector ▼]    │
└────────────────────────────────────────────────────┘
```

**Buttons:**
- `+ New Session` - Create new testing session
- `Cascade` - Arrange windows in cascade
- `Tile` - Arrange windows in grid
- `🤖 Robot` - Launch robot demo
- `QA` - Run QA script

### Window Layout

```
┌─────────────────────────────────────────┐
│ Session Name            [─][□][×]       │ ← Header
├─────────────────────────────────────────┤
│                                         │
│  Terminal Output                        │ ← Live Console
│  (streaming from session)               │
│                                         │
├─────────────────────────────────────────┤
│ > Command input       [Split H][Split V]│ ← Input Bar
└─────────────────────────────────────────┘
```

### Status Bar

```
┌────────────────────────────────────────────────────┐
│ Connected              3 windows | 2 sessions      │
└────────────────────────────────────────────────────┘
```

## Usage Examples

### Example 1: Watch Robot Demo

1. Start workspace: `npm run workspace`
2. Open browser: `http://localhost:3030`
3. Click `🤖 Robot` button
4. Watch automation run in window
5. Drag window to reposition
6. Click `Tile` to arrange multiple windows

### Example 2: Run QA Scripts

```bash
# Terminal 1: Start workspace
npm run workspace

# Browser:
# 1. Click "+ New Session"
# 2. In input bar: cd /Users/jim/work/wren3
# 3. Press Enter
# 4. In input bar: npm run robot -- --script scripts/qa-scripts/full-workflow.json --speed 3000
# 5. Press Enter
# 6. Watch test execute live
```

### Example 3: Multiple Parallel Sessions

1. Create 3 sessions with `+ New Session`
2. Run different tests in each:
   - Window 1: Basic commands
   - Window 2: Provider tree
   - Window 3: Full workflow
3. Click `Tile` to see all three simultaneously
4. Watch all tests run in parallel

### Example 4: Split Pane View

1. Create session
2. Run test in main pane
3. Click `Split H` to split horizontally
4. Run different test in new pane
5. Watch both simultaneously

## API

### WebSocket Messages

#### Client → Server

```javascript
// Stream pane output
{
  type: 'stream-pane',
  sessionName: 'session-123',
  paneId: '%0'
}

// Send command
{
  type: 'send-command',
  sessionName: 'session-123',
  paneId: '%0',
  command: 'npm run robot'
}
```

#### Server → Client

```javascript
// Pane output (streaming)
{
  type: 'pane-output',
  sessionName: 'session-123',
  paneId: '%0',
  data: 'base64-encoded-output'
}

// Session created
{
  type: 'session-created',
  session: { name, width, height, panes, windows }
}
```

### HTTP API

```bash
# Create session
POST /api/sessions
{
  "name": "test-session",
  "width": 120,
  "height": 40
}

# List sessions
GET /api/sessions

# Get panes
GET /api/sessions/:name/panes

# Send command to pane
POST /api/sessions/:name/panes/:paneId/send
{
  "command": "echo hello"
}

# Split pane
POST /api/sessions/:name/panes/:paneId/split
{
  "direction": "h"  // or "v"
}

# Resize pane
POST /api/sessions/:name/panes/:paneId/resize
{
  "direction": "up",  // up, down, left, right
  "amount": 5
}

# Kill session
DELETE /api/sessions/:name
```

## Customization

### Window Styling

Edit `public/index.html` styles:

```css
.tmux-window {
    background: #1e1e1e;  /* Window background */
    border: 2px solid #3e3e42;  /* Border color */
}

.tmux-window.active {
    border-color: #007acc;  /* Active border */
}
```

### Terminal Colors

```css
.terminal-output {
    color: #d4d4d4;  /* Text color */
    background: #1e1e1e;  /* Background */
    font-size: 12px;
}
```

### Layout Presets

Add custom layouts:

```javascript
function customLayout() {
    // Position windows as desired
    windows.forEach((win, index) => {
        win.style.left = `${index * 100}px`;
        win.style.top = `${index * 50}px`;
    });
}
```

## Integration with Robot

### Auto-launch Robot

```javascript
// In workspace.js
async function autoRunRobot() {
    await workspace.createSession('robot-auto');

    setTimeout(() => {
        workspace.ws.send(JSON.stringify({
            type: 'send-command',
            sessionName: 'robot-auto',
            paneId: '%0',
            command: 'cd /Users/jim/work/wren3 && npm run robot'
        }));
    }, 1000);
}
```

### Watch Multiple Scripts

```javascript
async function runAllScripts() {
    const scripts = [
        'basic-commands.json',
        'provider-tree.json',
        'full-workflow.json'
    ];

    for (const script of scripts) {
        await workspace.createSession(`script-${script}`);

        setTimeout(() => {
            workspace.ws.send(JSON.stringify({
                type: 'send-command',
                sessionName: `script-${script}`,
                paneId: '%0',
                command: `npm run robot -- --script scripts/qa-scripts/${script}`
            }));
        }, 1000);
    }

    workspace.tileWindows();
}
```

## Performance

- Server: ~50MB RAM
- Each session: ~10MB RAM
- Browser: ~100MB RAM base + 20MB per window
- WebSocket latency: <5ms on localhost

## Troubleshooting

### Port Already in Use

```bash
# Change port
PORT=3031 npm run workspace
```

### WebSocket Connection Failed

Check firewall settings or use different port.

### Tmux Sessions Not Cleaned Up

```bash
# List all sessions
tmux ls

# Kill all wren sessions
tmux ls | grep wren | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
```

### Browser Performance Issues

- Limit to 10 windows max
- Use Chrome/Firefox (better WebSocket support)
- Clear old session windows

## Roadmap

- [ ] Docking system with snap zones
- [ ] Persistent layouts
- [ ] Session templates
- [ ] Output recording/playback
- [ ] Screenshot capture
- [ ] Video recording
- [ ] Collaborative viewing (multi-user)
- [ ] Syntax highlighting
- [ ] Output search
- [ ] Keyboard shortcuts
- [ ] Touch gestures (iPad support)
- [ ] Electron app (native desktop)

## See Also

- [QA_AUTOMATION.md](./QA_AUTOMATION.md) - Testing framework
- [TESTING_ENVIRONMENT.md](./TESTING_ENVIRONMENT.md) - Tmux environments
