#!/usr/bin/env bash
# Bootstrap Demo - Complete system demonstration
# Shows TUI, MDI workspace, and automated QA capabilities

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Wren Coder - Autonomous Testing Infrastructure           ║"
echo "║  Bootstrap Demonstration                                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check dependencies
echo -e "${CYAN}Checking dependencies...${NC}"
command -v tmux >/dev/null 2>&1 || { echo "tmux not found. Install with: brew install tmux"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node not found"; exit 1; }
echo -e "${GREEN}✓ All dependencies present${NC}"
echo ""

# Component status
echo -e "${CYAN}System Components:${NC}"
echo "  1. Blessed TUI          - Terminal interface with command system"
echo "  2. Visual MDI Workspace - Web-based multi-window interface"
echo "  3. Autonomous Robot     - AI-driven TUI automation"
echo "  4. QA Robot             - Continuous automated testing"
echo "  5. Test Harness API     - Programmatic testing"
echo ""

# Show available commands
echo -e "${CYAN}Quick Start Commands:${NC}"
echo ""
echo -e "${YELLOW}Launch Visual Workspace (Priority 1):${NC}"
echo "  npm run workspace"
echo "  → Open http://localhost:3030 in browser"
echo "  → Click '🤖 Run Robot Demo' button"
echo "  → Watch automation in MFC-style MDI windows"
echo ""

echo -e "${YELLOW}Run Autonomous Robot (Priority 2):${NC}"
echo "  npm run robot"
echo "  → Watch TUI automation at human speed"
echo ""
echo "  npm run robot -- --script scripts/qa-scripts/full-workflow.json --speed 3000"
echo "  → Execute specific test script"
echo ""

echo -e "${YELLOW}Run QA Automation (Priority 3):${NC}"
echo "  npm run test:qa-robot"
echo "  → 17 automated tests across 6 suites"
echo ""
echo "  npm run test:qa-robot -- --continuous"
echo "  → Continuous monitoring mode"
echo ""

echo -e "${YELLOW}Quick Smoke Test:${NC}"
echo "  npm run test:qa-tui"
echo "  → 10-second validation"
echo ""

echo -e "${YELLOW}Tmux Environments (Priority 4):${NC}"
echo "  npm run qa-env"
echo "  → Multi-pane terminal dashboard"
echo ""

# Offer to start workspace
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Ready to bootstrap?${NC}"
echo ""
echo "Choose an option:"
echo "  1) Start Visual MDI Workspace (recommended)"
echo "  2) Run Robot Demo"
echo "  3) Run QA Tests"
echo "  4) Show Documentation"
echo "  5) Exit"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
  1)
    echo ""
    echo -e "${GREEN}Starting Visual MDI Workspace...${NC}"
    echo ""

    # Kill any existing workspace server on port 3030
    lsof -ti:3030 | xargs kill -9 2>/dev/null || true

    # Start workspace server in background
    npm run workspace &
    SERVER_PID=$!

    echo "Workspace server starting (PID: $SERVER_PID)..."
    sleep 3

    # Open browser window automatically
    if [[ "$OSTYPE" == "darwin"* ]]; then
      echo "Opening browser window on macOS..."
      open "http://localhost:3030"
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
      echo "Opening browser window on Windows..."
      start "http://localhost:3030"
    else
      echo "Opening browser window on Linux..."
      xdg-open "http://localhost:3030" 2>/dev/null || \
      sensible-browser "http://localhost:3030" 2>/dev/null || \
      echo "Please open http://localhost:3030 in your browser"
    fi

    echo ""
    echo -e "${GREEN}✓ Visual workspace running at http://localhost:3030${NC}"
    echo ""
    echo "Browser window should open automatically."
    echo "Click '🤖 Run Robot Demo' button to see automation."
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""

    # Wait for Ctrl+C
    trap "echo ''; echo 'Stopping workspace server...'; kill $SERVER_PID 2>/dev/null; exit 0" INT
    wait $SERVER_PID
    ;;
  2)
    echo ""
    echo -e "${GREEN}Running Autonomous Robot Demo...${NC}"
    echo ""
    npm run robot
    ;;
  3)
    echo ""
    echo -e "${GREEN}Running QA Tests (1 cycle)...${NC}"
    echo ""
    npm run test:qa-robot
    ;;
  4)
    echo ""
    echo -e "${GREEN}System Documentation:${NC}"
    echo ""
    cat AGENTS.md | head -100
    echo ""
    echo "Full documentation in: AGENTS.md"
    echo "Visual workspace guide: docs/VISUAL_WORKSPACE.md"
    echo "QA automation guide: docs/QA_AUTOMATION.md"
    ;;
  5)
    echo ""
    echo "Bootstrap cancelled. Use npm scripts directly."
    ;;
  *)
    echo ""
    echo "Invalid choice. Use npm scripts directly."
    ;;
esac

echo ""
