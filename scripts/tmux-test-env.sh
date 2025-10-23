#!/bin/bash
# Fixed-size macOS Testing Terminal with Tmux Channelization

SESSION="wren-test"
WINDOW_WIDTH=200
WINDOW_HEIGHT=60

# Kill existing session if it exists
tmux kill-session -t $SESSION 2>/dev/null

# Create new tmux session
tmux new-session -d -s $SESSION -x $WINDOW_WIDTH -y $WINDOW_HEIGHT

# Window 0: Main testing view
tmux rename-window -t $SESSION:0 'Testing'

# Split into 3 panes:
# +----------------+----------------+
# |                |                |
# |   TUI Robot    |   Observation  |
# |   (Main)       |   (Logs)       |
# |                |                |
# +----------------+----------------+
# |        Status & Control         |
# +---------------------------------+

# Create splits
tmux split-window -h -t $SESSION:0
tmux split-window -v -t $SESSION:0 -l 12

# Pane 0 (top-left): Robot execution
tmux send-keys -t $SESSION:0.0 'cd /Users/jim/work/wren3' C-m
tmux send-keys -t $SESSION:0.0 'clear' C-m
tmux send-keys -t $SESSION:0.0 '# Robot Execution Pane' C-m
tmux send-keys -t $SESSION:0.0 '# Run: npm run robot' C-m
tmux send-keys -t $SESSION:0.0 '# Or:  npm run robot -- --script scripts/qa-scripts/basic-commands.json' C-m

# Pane 1 (top-right): Observation/Logs
tmux send-keys -t $SESSION:0.1 'cd /Users/jim/work/wren3' C-m
tmux send-keys -t $SESSION:0.1 'clear' C-m
tmux send-keys -t $SESSION:0.1 '# Observation Pane - Live Logs' C-m
tmux send-keys -t $SESSION:0.1 'tail -f .wren/robot-*.log 2>/dev/null || echo "Waiting for robot logs..."' C-m

# Pane 2 (bottom): Status & Control
tmux send-keys -t $SESSION:0.2 'cd /Users/jim/work/wren3' C-m
tmux send-keys -t $SESSION:0.2 'clear' C-m
tmux send-keys -t $SESSION:0.2 'echo "╔════════════════════════════════════════════════════════════════╗"' C-m
tmux send-keys -t $SESSION:0.2 'echo "║          Wren TUI Testing Environment (tmux)                  ║"' C-m
tmux send-keys -t $SESSION:0.2 'echo "╚════════════════════════════════════════════════════════════════╝"' C-m
tmux send-keys -t $SESSION:0.2 'echo ""' C-m
tmux send-keys -t $SESSION:0.2 'echo "Available Commands:"' C-m
tmux send-keys -t $SESSION:0.2 'echo "  npm run robot                          # Demo mode"' C-m
tmux send-keys -t $SESSION:0.2 'echo "  npm run robot -- --script FILE         # Run script"' C-m
tmux send-keys -t $SESSION:0.2 'echo "  npm run test:qa-robot -- --cycles N    # QA robot"' C-m
tmux send-keys -t $SESSION:0.2 'echo ""' C-m
tmux send-keys -t $SESSION:0.2 'echo "Tmux Navigation:"' C-m
tmux send-keys -t $SESSION:0.2 'echo "  Ctrl+b ↑/↓/←/→    Navigate panes"' C-m
tmux send-keys -t $SESSION:0.2 'echo "  Ctrl+b d          Detach session"' C-m
tmux send-keys -t $SESSION:0.2 'echo "  Ctrl+b :resize-pane -D/-U/-L/-R  Resize"' C-m

# Set pane borders
tmux set-option -t $SESSION pane-border-style fg=blue
tmux set-option -t $SESSION pane-active-border-style fg=green

# Set status bar
tmux set-option -t $SESSION status-style bg=blue,fg=white
tmux set-option -t $SESSION status-left "#[bg=green,fg=black,bold] WREN TEST #[default] "
tmux set-option -t $SESSION status-right "#[bg=yellow,fg=black] %H:%M:%S "
tmux set-option -t $SESSION status-interval 1

# Select main pane
tmux select-pane -t $SESSION:0.0

# Attach to session
tmux attach-session -t $SESSION
