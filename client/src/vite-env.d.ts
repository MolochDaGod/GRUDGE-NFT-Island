/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket URL for the game server (e.g. wss://grudge-server.fly.dev) */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
