#!/usr/bin/env bash
# Build the frontend WITHOUT triggering a devcontainer "crash" (session reconnect).
#
# Root cause of the crashes: a cold `vite build` spawns esbuild with one worker per
# core (8 here) plus rollup + gzip — a short all-core CPU spike. On the Docker Desktop
# linuxkit VM this starves the VS Code remote server's heartbeat thread, the connection
# times out, and the IDE reconnects (kube-apiserver and server.js survive, so it's a
# reconnect, not a real restart). It is NOT memory — there is no cgroup cap and ~26Gi
# is free.
#
# Fix: deprioritize the build (nice), throttle its I/O (ionice), and pin it to half the
# cores (taskset) so the VS Code server always keeps CPU. Slightly slower build, no crash.
#
# Usage: bash scripts/safe-build.sh   (run with the Playwright browser CLOSED)
set -e

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO/client"

NODE=$(find /nix/store -name "node" -type f 2>/dev/null | grep -v ".drv" | head -1)
[ -z "$NODE" ] && NODE=$(which node 2>/dev/null || true)
[ -z "$NODE" ] && { echo "Error: node not found."; exit 1; }

CORES=$(nproc 2>/dev/null || echo 4)
HALF=$(( CORES > 2 ? CORES / 2 : 1 ))
LAST=$(( HALF - 1 ))

RUN="nice -n 19"
command -v taskset >/dev/null 2>&1 && RUN="taskset -c 0-$LAST $RUN"
command -v ionice  >/dev/null 2>&1 && RUN="ionice -c3 $RUN"

echo "  Building frontend (throttled: cores 0-$LAST of $CORES, nice 19)…"
NODE_OPTIONS="--max-old-space-size=2048" $RUN "$NODE" node_modules/.bin/vite build "$@"
echo "  ✓ build complete"
