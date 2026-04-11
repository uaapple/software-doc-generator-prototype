#!/usr/bin/env bash

set -euo pipefail

PORT="${PORT:-3000}"
NO_BROWSER="${NO_BROWSER:-0}"

while (($# > 0)); do
  case "$1" in
    --port)
      PORT="$2"
      shift 2
      ;;
    --no-browser)
      NO_BROWSER=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_MODULES_PATH="$PROJECT_ROOT/node_modules"
RUNTIME_DIR="$PROJECT_ROOT/.local"
PID_FILE="$RUNTIME_DIR/server.pid"
URL="http://127.0.0.1:$PORT"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Please install Node.js 22+ first." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node was not found. Please install Node.js 22+ first." >&2
  exit 1
fi

if [[ ! -d "$NODE_MODULES_PATH" ]]; then
  echo "Dependencies are missing. Running npm install..."
  (cd "$PROJECT_ROOT" && npm install)
fi

mkdir -p "$RUNTIME_DIR"

existing_pid=""
if command -v lsof >/dev/null 2>&1; then
  existing_pid="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
elif command -v netstat >/dev/null 2>&1; then
  existing_pid="$(netstat -anv -p tcp 2>/dev/null | awk -v port=".$PORT" '$0 ~ "LISTEN" && $0 ~ port { print $9; exit }' || true)"
fi

if [[ -n "$existing_pid" ]]; then
  echo "$existing_pid" >"$PID_FILE"
  echo "Port $PORT is already in use by process $existing_pid. Opening the page directly."
  if [[ "$NO_BROWSER" != "1" ]]; then
    if command -v open >/dev/null 2>&1; then
      open "$URL" >/dev/null 2>&1 || true
    elif command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$URL" >/dev/null 2>&1 || true
    fi
  fi
  exit 0
fi

echo "Starting local service from $PROJECT_ROOT"
(cd "$PROJECT_ROOT" && node src/server.js >/dev/null 2>&1 & echo $! >"$PID_FILE")
server_pid="$(tr -d '[:space:]' <"$PID_FILE")"

ready=0
for _ in $(seq 1 30); do
  sleep 1

  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "Backend startup failed. node process exited." >&2
    rm -f "$PID_FILE"
    exit 1
  fi

  if curl --silent --fail --max-time 2 "$URL/api/meta" >/dev/null 2>&1; then
    ready=1
    break
  fi
done

if [[ "$ready" != "1" ]]; then
  echo "Service started but did not become ready in time. Check logs or port usage." >&2
  exit 1
fi

echo "Service is ready at $URL"
if [[ "$NO_BROWSER" != "1" ]]; then
  if command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  fi
fi
