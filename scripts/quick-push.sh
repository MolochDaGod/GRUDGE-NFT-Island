#!/bin/bash
# ============================================================
# GRUDGE VOXEL - Quick Push: sync + restart server (no npm install)
# Fastest way to test code changes on WSL server
# Run: wsl bash ~/grudge-voxel/scripts/quick-push.sh
# ============================================================

set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use --delete-prefix 22 2>/dev/null || true

WINDOWS_SRC="/mnt/d/Games/grudge-voxel"
PROJECT_DIR="$HOME/grudge-voxel"

echo "[quick-push] Syncing source..."
rsync -av --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'dist' \
    --exclude 'client/public/models' \
    --exclude 'logs' \
    --exclude '.vercel' \
    "$WINDOWS_SRC/" "$PROJECT_DIR/"

echo "[quick-push] Restarting server..."
pm2 restart grudge-server 2>/dev/null || \
    pm2 start "$PROJECT_DIR/server/src/GameServer.ts" \
        --name grudge-server \
        --interpreter tsx \
        --cwd "$PROJECT_DIR/server"

echo "[quick-push] Done! Server restarting..."
pm2 logs grudge-server --lines 5 --nostream
