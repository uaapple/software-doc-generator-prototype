#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$PROJECT_ROOT/.local/server.pid"
HERMES_PID_FILE="$PROJECT_ROOT/.local/hermes-agent.pid"

stop_pid_file() {
  local pid_file="$1"
  local label="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "No $label PID file was found."
    return
  fi

  local pid
  pid="$(tr -d '[:space:]' <"$pid_file")"
  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    echo "$label PID file was empty and has been removed."
    return
  fi

  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$pid_file"
    echo "The recorded $label process is no longer running."
    return
  fi

  kill "$pid" 2>/dev/null || true
  sleep 1

  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$pid_file"
  echo "Stopped $label process $pid."
}

if [[ ! -f "$PID_FILE" && ! -f "$HERMES_PID_FILE" ]]; then
  echo "No PID files were found. Nothing to stop."
  exit 0
fi

stop_pid_file "$PID_FILE" "local service"
stop_pid_file "$HERMES_PID_FILE" "Hermes Agent"
