#!/bin/bash
# Comprehensive QA Testing Layout with Tmux

SESSION="wren-qa"
WINDOW_WIDTH=220
WINDOW_HEIGHT=65

# Kill existing session
tmux kill-session -t $SESSION 2>/dev/null

# Create session
tmux new-session -d -s $SESSION -x $WINDOW_WIDTH -y $WINDOW_HEIGHT

# Window 0: Multi-pane testing dashboard
tmux rename-window -t $SESSION:0 'QA Dashboard'

# Create 4-pane layout:
# +------------------+------------------+
# |                  |                  |
# |  TUI Robot       |  Robot Output    |
# |  Execution       |  & Observations  |
# |                  |                  |
# +------------------+------------------+
# |                  |                  |
# |  Test Results    |  TUI Monitor     |
# |  & Metrics       |  (Live View)     |
# |                  |                  |
# +------------------+------------------+

# Create splits
tmux split-window -h -t $SESSION:0
tmux split-window -v -t $SESSION:0
tmux split-window -v -t $SESSION:0.1

# Pane 0 (top-left): Robot Execution
tmux send-keys -t $SESSION:0.0 'cd /Users/jim/work/wren3' C-m
tmux send-keys -t $SESSION:0.0 'clear' C-m
tmux send-keys -t $SESSION:0.0 'echo "╔═══════════════════════════════════╗"' C-m
tmux send-keys -t $SESSION:0.0 'echo "║    Robot Execution Pane          ║"' C-m
tmux send-keys -t $SESSION:0.0 'echo "╚═══════════════════════════════════╝"' C-m
tmux send-keys -t $SESSION:0.0 'echo ""' C-m

# Pane 1 (top-right): Robot Output
tmux send-keys -t $SESSION:0.1 'cd /Users/jim/work/wren3' C-m
tmux send-keys -t $SESSION:0.1 'clear' C-m
tmux send-keys -t $SESSION:0.1 'echo "╔═══════════════════════════════════╗"' C-m
tmux send-keys -t $SESSION:0.1 'echo "║    Robot Observations            ║"' C-m
tmux send-keys -t $SESSION:0.1 'echo "╚═══════════════════════════════════╝"' C-m
tmux send-keys -t $SESSION:0.1 'echo "Waiting for observations..."' C-m

# Pane 2 (bottom-left): Test Results
tmux send-keys -t $SESSION:0.2 'cd /Users/jim/work/wren3' C-m
tmux send-keys -t $SESSION:0.2 'clear' C-m
tmux send-keys -t $SESSION:0.2 'echo "╔═══════════════════════════════════╗"' C-m
tmux send-keys -t $SESSION:0.2 'echo "║    Test Results & Metrics        ║"' C-m
tmux send-keys -t $SESSION:0.2 'echo "╚═══════════════════════════════════╝"' C-m
tmux send-keys -t $SESSION:0.2 'echo ""' C-m
tmux send-keys -t $SESSION:0.2 'echo "Quick Stats:"' C-m
tmux send-keys -t $SESSION:0.2 'echo "  Tests: 0"' C-m
tmux send-keys -t $SESSION:0.2 'echo "  Passed: 0"' C-m
tmux send-keys -t $SESSION:0.2 'echo "  Failed: 0"' C-m

# Pane 3 (bottom-right): TUI Monitor
tmux send-keys -t $SESSION:0.3 'cd /Users/jim/work/wren3' C-m
tmux send-keys -t $SESSION:0.3 'clear' C-m
tmux send-keys -t $SESSION:0.3 'echo "╔═══════════════════════════════════╗"' C-m
tmux send-keys -t $SESSION:0.3 'echo "║    TUI Live Monitor              ║"' C-m
tmux send-keys -t $SESSION:0.3 'echo "╚═══════════════════════════════════╝"' C-m
tmux send-keys -t $SESSION:0.3 'echo ""' C-m
tmux send-keys -t $SESSION:0.3 'echo "Commands:"' C-m
tmux send-keys -t $SESSION:0.3 'echo "  watch -n 1 cat .wren/qa-robot-results.json"' C-m

# Styling
tmux set-option -t $SESSION pane-border-style fg=blue
tmux set-option -t $SESSION pane-active-border-style fg=green,bold
tmux set-option -t $SESSION status-style bg=blue,fg=white,bold
tmux set-option -t $SESSION status-left "#[bg=green,fg=black,bold] QA DASHBOARD #[default] "
tmux set-option -t $SESSION status-right "#[bg=yellow,fg=black,bold] %H:%M:%S #[default]"
tmux set-option -t $SESSION status-interval 1

# Window 1: Full Screen Robot
tmux new-window -t $SESSION:1 -n 'Full Robot'
tmux send-keys -t $SESSION:1 'cd /Users/jim/work/wren3' C-m
tmux send-keys -t $SESSION:1 'clear' C-m
tmux send-keys -t $SESSION:1 'echo "Full screen robot view"' C-m
tmux send-keys -t $SESSION:1 'echo "Run: npm run robot -- --script scripts/qa-scripts/full-workflow.json"' C-m

# Window 2: Logs Viewer
tmux new-window -t $SESSION:2 -n 'Logs'
tmux send-keys -t $SESSION:2 'cd /Users/jim/work/wren3' C-m
tmux send-keys -t $SESSION:2 'clear' C-m

# Split for multiple log views
tmux split-window -v -t $SESSION:2
tmux send-keys -t $SESSION:2.0 'echo "Robot Logs:"' C-m
tmux send-keys -t $SESSION:2.0 'tail -f .wren/robot-*-log.json 2>/dev/null || echo "No logs yet"' C-m
tmux send-keys -t $SESSION:2.1 'echo "QA Results:"' C-m
tmux send-keys -t $SESSION:2.1 'watch -n 2 "cat .wren/qa-robot-results.json 2>/dev/null || echo \"No results yet\""' C-m

# Select main window and pane
tmux select-window -t $SESSION:0
tmux select-pane -t $SESSION:0.0

# Attach
tmux attach-session -t $SESSION
