#!/usr/bin/env bash
set -e

NODE=$(find /nix/store -name "node" -type f 2>/dev/null | grep -v ".drv" | head -1)
[ -z "$NODE" ] && NODE=$(which node 2>/dev/null || true)
[ -z "$NODE" ] && { echo "Error: node not found."; exit 1; }

REPO="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  Mezzanine"
echo "  ──────────────────────────────────"

kill $(lsof -ti:3001 2>/dev/null) 2>/dev/null || true
sleep 1

# Build frontend only if dist is missing (skip rebuild on container restart).
# Throttled build (see scripts/safe-build.sh) so the all-core esbuild spike can't
# starve the VS Code heartbeat and trigger a devcontainer reconnect.
cd "$REPO/client"
if [ ! -d "dist" ]; then
  bash "$REPO/scripts/safe-build.sh" 2>&1 | tail -4
else
  echo "  Frontend already built (dist/ exists), skipping rebuild"
fi

# Start backend — nohup detaches from the shell session so VS Code
# devcontainer reconnects don't SIGHUP-kill the process.
echo "  Starting server → http://localhost:3001"
cd "$REPO"
nohup $NODE src/server.js >> /tmp/k8s-backend.log 2>&1 &
PID=$!

for i in $(seq 1 20); do
  curl -sf http://localhost:3001/api/health > /dev/null 2>&1 && break
  sleep 0.5
done

echo ""
echo "  ✓  http://localhost:3001  (everything on one port)"
echo "  PID $PID  ·  Log: /tmp/k8s-backend.log"
echo ""
