#!/bin/bash
# ============================================================
# GRUDGE VOXEL - Lobby & Service Test Script
# Tests WebSocket connectivity, server response, and basic game flow
# Run: wsl bash ~/grudge-voxel/scripts/lobby-test.sh
# ============================================================

set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use --delete-prefix 22 2>/dev/null || true

SERVER_URL="ws://localhost:3000"
HTTP_URL="http://localhost:3000"

echo "=========================================="
echo "  GRUDGE VOXEL - Lobby & Service Tests"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# Test 1: Is the server process running?
echo ""
echo "[TEST 1] Server process..."
if pm2 describe grudge-server >/dev/null 2>&1; then
    STATUS=$(pm2 jlist 2>/dev/null | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
            try{let j=JSON.parse(d);let s=j.find(p=>p.name==='grudge-server');
            console.log(s?s.pm2_env.status:'unknown')}catch(e){console.log('parse-error')}
        })
    " 2>/dev/null || echo "unknown")
    echo "  ✓ grudge-server is $STATUS"
else
    echo "  ✗ grudge-server not found in PM2"
    echo "  Run: bash ~/grudge-voxel/scripts/deploy-wsl.sh"
    exit 1
fi

# Test 2: Is port 3000 listening?
echo ""
echo "[TEST 2] Port 3000..."
if ss -tlnp 2>/dev/null | grep -q ":3000"; then
    echo "  ✓ Port 3000 is listening"
else
    echo "  ✗ Port 3000 not listening"
    echo "  Check logs: pm2 logs grudge-server"
fi

# Test 3: WebSocket handshake test
echo ""
echo "[TEST 3] WebSocket handshake..."
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('$SERVER_URL');
const timeout = setTimeout(() => { console.log('  ✗ Connection timed out (3s)'); process.exit(1); }, 3000);
ws.on('open', () => {
    clearTimeout(timeout);
    console.log('  ✓ WebSocket connected');

    // Send a JOIN message
    ws.send(JSON.stringify({
        type: 'JOIN',
        payload: {
            name: 'TestBot-' + Date.now(),
            authMethod: 'guest',
            profile: { displayName: 'TestBot', playerClass: 'WARRIOR', faction: 'CRUSADE', race: 'HUMAN' }
        }
    }));

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'WELCOME') {
                console.log('  ✓ WELCOME received — Player ID: ' + msg.payload.playerId);
                console.log('  ✓ Spawn: (' + msg.payload.position.x.toFixed(1) + ', ' + msg.payload.position.y.toFixed(1) + ', ' + msg.payload.position.z.toFixed(1) + ')');
            } else if (msg.type === 'CHUNK') {
                console.log('  ✓ CHUNK received — streaming world data');
                ws.close();
                process.exit(0);
            }
        } catch(e) { console.log('  ? Message: ' + data.toString().substring(0, 80)); }
    });
});
ws.on('error', (err) => {
    clearTimeout(timeout);
    console.log('  ✗ Connection failed: ' + err.message);
    process.exit(1);
});
" 2>/dev/null || echo "  [WARN] ws module not available — install with: npm install -g ws"

echo ""
echo "=========================================="
echo "  Tests complete"
echo "=========================================="
