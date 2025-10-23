#!/usr/bin/env bash
# Auto Demo - Launch workspace and automatically trigger robot
# Shows "self-surgery" - robot testing the TUI at human-watchable speed

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Auto Demo - Robot Self-Surgery at Human Speed            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Kill any existing workspace server
echo -e "${CYAN}Cleaning up old processes...${NC}"
lsof -ti:3030 | xargs kill -9 2>/dev/null || true
tmux kill-session -t robot-auto-demo 2>/dev/null || true
sleep 1

# Start workspace server in background
echo -e "${CYAN}Starting visual workspace...${NC}"
npm run workspace > /tmp/workspace.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
echo -e "${CYAN}Waiting for server...${NC}"
for i in {1..10}; do
  if curl -s http://localhost:3030 >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Server ready${NC}"
    break
  fi
  sleep 1
done

# Open browser
echo -e "${CYAN}Opening browser window...${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
  open "http://localhost:3030"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  start "http://localhost:3030"
else
  xdg-open "http://localhost:3030" 2>/dev/null || \
  sensible-browser "http://localhost:3030" 2>/dev/null
fi

sleep 2

# Create session via API
echo -e "${CYAN}Creating demo session...${NC}"
SESSION_NAME="robot-auto-demo-$(date +%s)"

curl -s -X POST http://localhost:3030/api/sessions \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$SESSION_NAME\",\"width\":120,\"height\":40}" >/dev/null

sleep 1

# Send commands to start robot with human-speed timing
echo -e "${CYAN}Launching robot at human speed...${NC}"
echo ""
echo -e "${YELLOW}The robot will now perform self-surgery:${NC}"
echo "  • Navigate to project directory"
echo "  • Execute autonomous robot script"
echo "  • Perform TUI testing at 3-second intervals"
echo "  • All actions visible in browser window"
echo ""

# Navigate to project directory
curl -s -X POST "http://localhost:3030/api/sessions/$SESSION_NAME/panes/%0/send" \
  -H "Content-Type: application/json" \
  -d "{\"command\":\"cd /Users/jim/work/wren3\"}" >/dev/null

sleep 2

# Start the robot with full workflow at human speed (3 seconds per action)
curl -s -X POST "http://localhost:3030/api/sessions/$SESSION_NAME/panes/%0/send" \
  -H "Content-Type: application/json" \
  -d "{\"command\":\"npm run robot -- --script scripts/qa-scripts/full-workflow.json --speed 3000\"}" >/dev/null

echo -e "${GREEN}✓ Robot launched${NC}"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo -e "${CYAN}Watch the browser window:${NC}"
echo "  • MFC-style MDI window shows live terminal"
echo "  • Robot performs actions at 3-second intervals"
echo "  • Each action logged and visible"
echo "  • Full observability of autonomous testing"
echo ""
echo -e "${YELLOW}The robot is now performing self-surgery on the TUI.${NC}"
echo ""
echo "Press Ctrl+C to stop the workspace server"
echo ""

# Wait for Ctrl+C
trap "echo ''; echo 'Stopping...'; kill $SERVER_PID 2>/dev/null; tmux kill-session -t $SESSION_NAME 2>/dev/null || true; exit 0" INT
wait $SERVER_PID
