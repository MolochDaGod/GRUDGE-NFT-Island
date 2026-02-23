#!/bin/bash
# ============================================================
# GRUDGE VOXEL - Server Status Check
# Run: wsl bash ~/grudge-voxel/scripts/server-status.sh
# ============================================================

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use --delete-prefix 22 2>/dev/null || true

echo "=========================================="
echo "  GRUDGE VOXEL - Server Status"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

echo ""
echo "--- PM2 Processes ---"
pm2 list 2>/dev/null || echo "PM2 not running"

echo ""
echo "--- Ports Listening ---"
ss -tlnp 2>/dev/null | grep -E "3000|5173|8080" || echo "No game ports listening"

echo ""
echo "--- System Resources ---"
echo "CPU: $(nproc) cores"
free -h | head -2
echo ""
df -h / | tail -1

echo ""
echo "--- Recent Server Logs (last 10 lines) ---"
pm2 logs grudge-server --lines 10 --nostream 2>/dev/null || echo "No logs available"

echo ""
echo "--- Node Version ---"
node --version 2>/dev/null || echo "Node not available"
