# macOS Testing Environment with Tmux

Fixed-size terminal environment for visual TUI testing and robot observation.

## Quick Start

```bash
# Launch basic testing environment
npm run test-env

# Launch comprehensive QA dashboard
npm run qa-env

# Launch in new Terminal.app window (macOS)
npm run launch-test
npm run launch-qa
```

## Environments

### 1. Basic Testing Environment (`test-env`)

3-pane layout for simple testing:

```
┌─────────────────────┬─────────────────────┐
│                     │                     │
│   Robot Execution   │   Observations      │
│                     │   & Live Logs       │
│                     │                     │
├─────────────────────┴─────────────────────┤
│          Status & Control Panel           │
└───────────────────────────────────────────┘
```

**Panes:**
- **Top-Left**: Robot execution - run robot commands here
- **Top-Right**: Live observation logs
- **Bottom**: Control panel with available commands

**Usage:**
```bash
npm run test-env

# In top-left pane, run:
npm run robot
npm run robot -- --script scripts/qa-scripts/basic-commands.json
```

### 2. QA Dashboard (`qa-env`)

4-pane comprehensive testing dashboard:

```
┌─────────────────────┬─────────────────────┐
│                     │                     │
│  Robot Execution    │  Robot Output       │
│                     │  & Observations     │
│                     │                     │
├─────────────────────┼─────────────────────┤
│                     │                     │
│  Test Results       │  TUI Monitor        │
│  & Metrics          │  (Live Stats)       │
│                     │                     │
└─────────────────────┴─────────────────────┘
```

**Windows:**
- Window 0: Dashboard (4 panes as shown above)
- Window 1: Full-screen robot view
- Window 2: Log viewers (split for multiple logs)

**Panes:**
- **Top-Left**: Execute robot commands
- **Top-Right**: Real-time observations
- **Bottom-Left**: Test results and metrics
- **Bottom-Right**: Live TUI monitoring

**Window Navigation:**
```bash
Ctrl+b 0    # Dashboard
Ctrl+b 1    # Full Robot
Ctrl+b 2    # Logs
```

## Tmux Navigation

### Basic Keys

```bash
# Pane Navigation
Ctrl+b ↑/↓/←/→     Navigate between panes
Ctrl+b o            Cycle through panes
Ctrl+b q            Show pane numbers

# Window Navigation
Ctrl+b 0-9          Switch to window N
Ctrl+b n            Next window
Ctrl+b p            Previous window
Ctrl+b w            List windows

# Session Control
Ctrl+b d            Detach from session
Ctrl+b :            Enter command mode
```

### Pane Management

```bash
# Resize Panes
Ctrl+b :resize-pane -D 5    # Down 5 lines
Ctrl+b :resize-pane -U 5    # Up 5 lines
Ctrl+b :resize-pane -L 10   # Left 10 cols
Ctrl+b :resize-pane -R 10   # Right 10 cols

# Zoom Pane
Ctrl+b z            Toggle pane zoom (full screen)

# Swap Panes
Ctrl+b {            Swap with previous pane
Ctrl+b }            Swap with next pane
```

### Copy Mode (Scrolling)

```bash
Ctrl+b [            Enter copy mode
↑/↓                 Scroll up/down
q                   Exit copy mode
```

## Running Tests

### In Basic Environment

```bash
# Terminal 1: Launch environment
npm run test-env

# In top-left pane:
npm run robot

# In top-left pane:
npm run robot -- --script scripts/qa-scripts/basic-commands.json --speed 3000

# In top-left pane:
npm run test:qa-robot -- --cycles 3
```

### In QA Dashboard

```bash
# Terminal 1: Launch dashboard
npm run qa-env

# Switch to Window 1 (Full Robot)
Ctrl+b 1

# Run comprehensive workflow
npm run robot -- --script scripts/qa-scripts/full-workflow.json

# Switch to Window 0 (Dashboard)
Ctrl+b 0

# In top-left pane, run QA robot
npm run test:qa-robot -- --continuous
```

## Session Management

### Detach and Reattach

```bash
# Detach from session (keeps running)
Ctrl+b d

# List sessions
tmux ls

# Reattach to session
tmux attach -t wren-test
tmux attach -t wren-qa

# Kill session
tmux kill-session -t wren-test
```

### Multiple Sessions

```bash
# Run both environments
npm run test-env      # In terminal 1
npm run qa-env        # In terminal 2

# Switch between them
tmux switch-client -t wren-test
tmux switch-client -t wren-qa
```

## Configuration

### Window Size

Edit `scripts/tmux-test-env.sh` or `scripts/tmux-qa-layout.sh`:

```bash
WINDOW_WIDTH=220     # Columns
WINDOW_HEIGHT=65     # Rows
```

### Pane Layout

Modify split commands in scripts:

```bash
# Horizontal split
tmux split-window -h -t $SESSION:0

# Vertical split with size
tmux split-window -v -t $SESSION:0 -l 12

# Split with percentage
tmux split-window -v -t $SESSION:0 -p 30
```

## macOS Terminal.app Integration

### Launch in New Window

```bash
# Launch basic environment
npm run launch-test

# Launch QA dashboard
npm run launch-qa
```

This uses AppleScript to:
1. Create new Terminal window
2. Set fixed size (220x65)
3. Set window position
4. Launch tmux session

### Custom Launcher

Edit `scripts/launch-test-terminal.sh`:

```applescript
-- Change window size
set the number of columns of window 1 to 220
set the number of rows of window 1 to 65

-- Change position
set position of window 1 to {50, 50}
```

## Typical Workflows

### 1. Quick Robot Demo

```bash
npm run test-env
# In top-left pane:
npm run robot
# Watch in top-right pane for observations
```

### 2. Script Development

```bash
npm run test-env
# Top-left: Edit script
vim scripts/qa-scripts/my-test.json
# Run script
npm run robot -- --script scripts/qa-scripts/my-test.json
# Top-right: Watch live output
```

### 3. Continuous QA Monitoring

```bash
npm run qa-env
# Window 0, top-left:
npm run test:qa-robot -- --continuous
# Window 2: Watch logs
Ctrl+b 2
# Window 0, bottom-right: Monitor metrics
Ctrl+b 0
```

### 4. Parallel Testing

```bash
npm run qa-env

# Window 0, top-left: Run robot
npm run robot -- --script scripts/qa-scripts/basic-commands.json

# Window 1: Run full workflow
Ctrl+b 1
npm run robot -- --script scripts/qa-scripts/full-workflow.json

# Window 2: Watch all logs
Ctrl+b 2
```

## Troubleshooting

### Tmux Not Found

```bash
# Install via Homebrew
brew install tmux
```

### Session Already Exists

```bash
# Kill existing session
tmux kill-session -t wren-test
tmux kill-session -t wren-qa

# Then relaunch
npm run test-env
```

### Pane Size Issues

```bash
# Manually resize in tmux command mode
Ctrl+b :
resize-pane -t 0 -x 100
resize-pane -t 0 -y 30
```

### Terminal Not Resizing

If Terminal.app doesn't resize properly:

1. Close Terminal window
2. Re-run `npm run launch-test`
3. Or manually resize and save as profile

## Advanced Tips

### Save Layout as Tmux Config

Add to `~/.tmux.conf`:

```bash
# Quick layout for Wren testing
bind-key T source-file ~/work/wren3/scripts/tmux-test-env.sh
```

### Custom Status Bar

Edit scripts to add custom status:

```bash
tmux set-option -t $SESSION status-right "#[bg=yellow,fg=black] Tests: 17 | Passed: 15 "
```

### Synchronized Panes

Type same command in all panes:

```bash
Ctrl+b :setw synchronize-panes on
# Now typing goes to all panes
Ctrl+b :setw synchronize-panes off
```

### Logging Pane Output

```bash
# Start logging in a pane
Ctrl+b :pipe-pane -o 'cat >> /tmp/pane-output.log'

# Stop logging
Ctrl+b :pipe-pane
```

## Performance

- Tmux overhead: ~5-10MB RAM
- Typical session: 2-4 panes = ~20MB total
- QA Dashboard: 7 panes (3 windows) = ~35MB total

## See Also

- [QA_AUTOMATION.md](./QA_AUTOMATION.md) - Testing framework details
- [Tmux Cheat Sheet](https://tmuxcheatsheet.com/)
- Robot scripts: `scripts/qa-scripts/*.json`
