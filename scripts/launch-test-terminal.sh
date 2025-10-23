#!/bin/bash
# macOS Terminal.app launcher for fixed-size testing environment

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LAYOUT="${1:-basic}"

case "$LAYOUT" in
  "qa")
    TMUX_SCRIPT="$SCRIPT_DIR/tmux-qa-layout.sh"
    ;;
  *)
    TMUX_SCRIPT="$SCRIPT_DIR/tmux-test-env.sh"
    ;;
esac

# Create AppleScript to launch Terminal with fixed size
osascript <<EOF
tell application "Terminal"
    activate

    -- Create new window with fixed size
    set newWindow to do script ""

    -- Set window size (columns x rows)
    set the number of columns of window 1 to 220
    set the number of rows of window 1 to 65

    -- Set window position (optional)
    set position of window 1 to {50, 50}

    -- Set window title
    set custom title of window 1 to "Wren TUI Testing Environment"

    -- Run tmux script
    do script "bash '$TMUX_SCRIPT'" in window 1
end tell
EOF
