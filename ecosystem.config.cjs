// PM2 Ecosystem Config — Grudge Warlords Game Server
// Start:   pm2 start ecosystem.config.cjs
// Logs:    pm2 logs grudge-server
// Stop:    pm2 stop grudge-server
// Restart: pm2 restart grudge-server
const path = require('path');
const SERVER_DIR = path.join(__dirname, 'server');

module.exports = {
  apps: [
    {
      name: 'grudge-server',
      cwd: SERVER_DIR,
      interpreter: 'node',
      script: path.join(SERVER_DIR, 'node_modules/tsx/dist/cli.mjs'),
      args: 'src/GameServer.ts',
      watch: [path.join(SERVER_DIR, 'src')],
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'dist'],
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      // Auto-restart on crash, max 10 restarts in 1 minute
      max_restarts: 10,
      min_uptime: 5000,
      // Log files
      error_file: path.join(SERVER_DIR, 'logs/server-error.log'),
      out_file: path.join(SERVER_DIR, 'logs/server-out.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: 'grudge-tunnel',
      script: 'C:/Users/nugye/cloudflared.exe',
      args: 'tunnel --url http://localhost:3000',
      autorestart: true,
      max_restarts: 5,
      error_file: path.join(__dirname, 'logs/tunnel-error.log'),
      out_file: path.join(__dirname, 'logs/tunnel-out.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
