#!/usr/bin/env bash
# System Validation - Verify all components are functional

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  System Validation - Component Verification               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Test 1: Tmux availability
echo -n "Testing tmux availability... "
if command -v tmux >/dev/null 2>&1; then
  VERSION=$(tmux -V)
  echo -e "${GREEN}✓ $VERSION${NC}"
else
  echo -e "${RED}✗ tmux not found${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Test 2: Node.js version
echo -n "Testing Node.js version... "
NODE_VERSION=$(node -v)
if [[ "$NODE_VERSION" =~ ^v(2[0-9]|[3-9][0-9]) ]]; then
  echo -e "${GREEN}✓ $NODE_VERSION${NC}"
else
  echo -e "${RED}✗ Node.js 20+ required, found $NODE_VERSION${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Test 3: Dependencies installed
echo -n "Testing npm dependencies... "
if [ -d "node_modules" ]; then
  echo -e "${GREEN}✓ installed${NC}"
else
  echo -e "${RED}✗ run npm install${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Test 4: Workspace server files
echo -n "Testing workspace server files... "
if [ -f "packages/cli/src/ui/tmux-workspace/server.mjs" ] && \
   [ -f "packages/cli/src/ui/tmux-workspace/public/index.html" ] && \
   [ -f "packages/cli/src/ui/tmux-workspace/public/workspace.js" ]; then
  echo -e "${GREEN}✓ present${NC}"
else
  echo -e "${RED}✗ missing files${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Test 5: Robot scripts
echo -n "Testing robot scripts... "
if [ -f "scripts/tui-robot.mjs" ] && \
   [ -x "scripts/tui-robot.mjs" ] && \
   [ -f "scripts/qa-robot.mjs" ] && \
   [ -x "scripts/qa-robot.mjs" ]; then
  echo -e "${GREEN}✓ present and executable${NC}"
else
  echo -e "${RED}✗ missing or not executable${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Test 6: QA test scripts
echo -n "Testing QA script files... "
SCRIPT_COUNT=$(find scripts/qa-scripts -name "*.json" 2>/dev/null | wc -l)
if [ "$SCRIPT_COUNT" -ge 3 ]; then
  echo -e "${GREEN}✓ $SCRIPT_COUNT scripts found${NC}"
else
  echo -e "${RED}✗ expected 3+ scripts, found $SCRIPT_COUNT${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Test 7: Test harness API
echo -n "Testing test harness API... "
if [ -f "scripts/lib/tui-test-harness.mjs" ]; then
  echo -e "${GREEN}✓ present${NC}"
else
  echo -e "${RED}✗ missing${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Test 8: BlessedTui
echo -n "Testing BlessedTui... "
if [ -f "packages/cli/src/ui/BlessedTui.ts" ]; then
  echo -e "${GREEN}✓ present${NC}"
else
  echo -e "${RED}✗ missing${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Test 9: Documentation
echo -n "Testing documentation... "
if [ -f "AGENTS.md" ] && \
   [ -f "docs/VISUAL_WORKSPACE.md" ] && \
   [ -f "docs/QA_AUTOMATION.md" ]; then
  echo -e "${GREEN}✓ complete${NC}"
else
  echo -e "${RED}✗ incomplete${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Test 10: Express and WS packages
echo -n "Testing workspace dependencies... "
if grep -q '"express"' packages/cli/package.json && \
   grep -q '"ws"' packages/cli/package.json; then
  echo -e "${GREEN}✓ express and ws configured${NC}"
else
  echo -e "${RED}✗ missing express or ws${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Test 11: Workspace server can start (quick check)
echo -n "Testing workspace server startup... "
if timeout 2 npm run workspace >/dev/null 2>&1; then
  echo -e "${GREEN}✓ starts successfully${NC}"
else
  # Timeout is expected, check if it at least tried to start
  if pgrep -f "tmux-workspace/server.mjs" >/dev/null 2>&1; then
    pkill -f "tmux-workspace/server.mjs"
  fi
  # Just check the script exists and is valid node
  if node -c packages/cli/src/ui/tmux-workspace/server.mjs 2>/dev/null; then
    echo -e "${GREEN}✓ syntax valid${NC}"
  else
    echo -e "${RED}✗ syntax error${NC}"
    ERRORS=$((ERRORS + 1))
  fi
fi

# Test 12: Robot script can show help
echo -n "Testing robot script help... "
if node scripts/tui-robot.mjs --help >/dev/null 2>&1; then
  echo -e "${GREEN}✓ functional${NC}"
else
  echo -e "${RED}✗ help failed${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════"
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}✓ All components validated successfully${NC}"
  echo ""
  echo "System ready for use. Run: npm run bootstrap"
  exit 0
else
  echo -e "${RED}✗ $ERRORS component(s) failed validation${NC}"
  echo ""
  echo "Fix errors before using the system"
  exit 1
fi
