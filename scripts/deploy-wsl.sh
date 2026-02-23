#!/bin/bash
# ============================================================
# GRUDGE VOXEL - WSL Deploy/Update Script
# Run from Windows: wsl bash ~/grudge-voxel/scripts/deploy-wsl.sh
# Or from WSL:      bash ~/grudge-voxel/scripts/deploy-wsl.sh
# ============================================================

set -e

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use --delete-prefix 22 2>/dev/null || true

PROJECT_DIR="$HOME/grudge-voxel"
WINDOWS_SRC="/mnt/d/Games/grudge-voxel"
LOG_DIR="$PROJECT_DIR/logs"

echo "=========================================="
echo "  GRUDGE VOXEL - WSL Deploy"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 1. Sync from Windows source (skip node_modules, .git, dist, models)
echo ""
echo "[1/5] Syncing from Windows source..."
rsync -av --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'dist' \
    --exclude 'client/public/models' \
    --exclude 'logs' \
    --exclude '.vercel' \
    "$WINDOWS_SRC/" "$PROJECT_DIR/"

# 2. Install deps if needed
echo ""
echo "[2/5] Checking dependencies..."
cd "$PROJECT_DIR"
npm install --silent 2>/dev/null
cd shared && npm install --silent 2>/dev/null
cd ../server && npm install --silent 2>/dev/null
cd ../client && npm install --silent 2>/dev/null
cd "$PROJECT_DIR"

# 3. Build shared types
echo ""
echo "[3/5] Building shared package..."
cd "$PROJECT_DIR/shared"
npx tsc --noEmit 2>&1 || echo "  [WARN] Shared type check had warnings"

# 4. Restart server via PM2
echo ""
echo "[4/5] Restarting game server..."
cd "$PROJECT_DIR"
pm2 delete grudge-server 2>/dev/null || true
pm2 start ecosystem.config.cjs --only grudge-server 2>/dev/null || \
    pm2 start server/src/GameServer.ts \
        --name grudge-server \
        --interpreter tsx \
        --cwd "$PROJECT_DIR/server" \
        --log "$LOG_DIR/server.log" \
        --time
pm2 save

# 5. Status report
echo ""
echo "[5/5] Status:"
pm2 list
echo ""
echo "Server logs: pm2 logs grudge-server"
echo "Server URL:  ws://localhost:3000"
echo ""
echo "=========================================="
echo "  Deploy complete!"
echo "=========================================="
