#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$PROJECT_ROOT/.local/wiki.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No wiki PID file was found. Nothing to stop."
  exit 0
fi

pid="$(tr -d '[:space:]' <"$PID_FILE")"
if [[ -z "$pid" ]]; then
  rm -f "$PID_FILE"
  echo "Wiki PID file was empty and has been removed."
  exit 0
fi

if ! kill -0 "$pid" 2>/dev/null; then
  rm -f "$PID_FILE"
  echo "The recorded wiki process is no longer running."
  exit 0
fi

kill "$pid" 2>/dev/null || true
sleep 1

if kill -0 "$pid" 2>/dev/null; then
  kill -9 "$pid" 2>/dev/null || true
fi

rm -f "$PID_FILE"
echo "Stopped wiki service process $pid."
