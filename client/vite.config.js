import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // esbuild's syntax minifier (DCE) miscompiles @xterm/xterm 6.0.0's already-minified enum
  // IIFE in requestMode(): it drops the `let r` declaration but keeps `void 0||(r={})`, so the
  // first DECRQM query a full-screen app (vim/less/top) sends throws "ReferenceError: r is not
  // defined" and wedges the terminal (busybox vi never sends DECRQM, so it looked fine).
  // Disabling minifySyntax keeps identifier+whitespace minification but leaves the vendor's
  // valid code intact. (#82 follow-up.)
  esbuild: {
    minifySyntax: false,
  },
  build: {
    rollupOptions: {
      maxParallelFileOps: 2,
    },
  },
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        rewriteWsOrigin: true,
      },
    },
  },
})
