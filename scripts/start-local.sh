#!/usr/bin/env bash

set -euo pipefail

PORT="${PORT:-3000}"
HOST="${HOST:-127.0.0.1}"
NO_BROWSER="${NO_BROWSER:-0}"
HERMES_PORT="${HERMES_PORT:-3101}"
START_HERMES_AGENT="${START_HERMES_AGENT:-1}"
PLATFORM_HERMES_TRANSPORT="${HERMES_TRANSPORT:-api}"
HERMES_BASE_URL_FROM_ENV="${HERMES_BASE_URL:-}"
HERMES_BASE_URL="${HERMES_BASE_URL_FROM_ENV:-http://127.0.0.1:$HERMES_PORT}"
LOCAL_TCSD_ENV=()
if [[ "$(uname -s)" == "Darwin" ]]; then
  LOCAL_TCSD_ENV=(
    MATLAB_ROOT="/Applications/MATLAB_R2026a.app"
    SATK_MATLAB_ROOT="/Applications/MATLAB_R2026a.app"
    SATK_MATLAB_SESSION_MODE="new"
  )
fi

while (($# > 0)); do
  case "$1" in
    --port)
      PORT="$2"
      shift 2
      ;;
    --hermes-port)
      HERMES_PORT="$2"
      if [[ -z "$HERMES_BASE_URL_FROM_ENV" ]]; then
        HERMES_BASE_URL="http://127.0.0.1:$HERMES_PORT"
      fi
      shift 2
      ;;
    --no-hermes-agent)
      START_HERMES_AGENT=0
      PLATFORM_HERMES_TRANSPORT="${HERMES_TRANSPORT:-cli}"
      shift
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
HERMES_PID_FILE="$RUNTIME_DIR/hermes-agent.pid"
LOG_FILE="$RUNTIME_DIR/server.log"
HERMES_LOG_FILE="$RUNTIME_DIR/hermes-agent.log"
URL_HOST="$HOST"
if [[ "$URL_HOST" == *:* && "$URL_HOST" != \[*\] ]]; then
  URL_HOST="[$URL_HOST]"
fi
URL="http://$URL_HOST:$PORT"

pid_on_port() {
  local port="$1"
  local pid=""
  if command -v lsof >/dev/null 2>&1; then
    pid="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  elif command -v netstat >/dev/null 2>&1; then
    pid="$(netstat -anv -p tcp 2>/dev/null | awk -v port=".$port" '$0 ~ "LISTEN" && $0 ~ port { print $9; exit }' || true)"
  fi
  printf "%s" "$pid"
}

wait_for_http() {
  local probe_url="$1"
  local pid="${2:-}"
  local log_file="${3:-}"

  for _ in $(seq 1 30); do
    sleep 1

    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
      echo "Service startup failed. Process $pid exited." >&2
      if [[ -n "$log_file" && -f "$log_file" ]]; then
        tail -n 40 "$log_file" >&2 || true
      fi
      return 1
    fi

    if curl --silent --fail --max-time 2 "$probe_url" >/dev/null 2>&1; then
      return 0
    fi
  done

  return 1
}

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

existing_pid="$(pid_on_port "$PORT")"

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

if [[ "$START_HERMES_AGENT" == "1" && "$PLATFORM_HERMES_TRANSPORT" == "api" ]]; then
  hermes_existing_pid="$(pid_on_port "$HERMES_PORT")"
  if [[ -n "$hermes_existing_pid" ]]; then
    echo "Hermes Agent port $HERMES_PORT is already in use by process $hermes_existing_pid. Reusing it."
    if ! wait_for_http "$HERMES_BASE_URL/api/health"; then
      echo "Hermes Agent did not respond at $HERMES_BASE_URL/api/health." >&2
      exit 1
    fi
  else
    echo "Starting local Hermes Agent backend on $HERMES_BASE_URL"
    (
      cd "$PROJECT_ROOT"
      nohup env \
        "${LOCAL_TCSD_ENV[@]}" \
        APP_RUNTIME_ROLE="hermes-agent" \
        HERMES_TRANSPORT="cli" \
        HERMES_HOST="127.0.0.1" \
        HERMES_PORT="$HERMES_PORT" \
        HERMES_BASE_URL="$HERMES_BASE_URL" \
        HERMES_TASK_CONCURRENCY="${HERMES_TASK_CONCURRENCY:-1}" \
        HERMES_SERVER_REQUEST_TIMEOUT_MS="${HERMES_SERVER_REQUEST_TIMEOUT_MS:-0}" \
        TCSD_STAGE_HERMES_TIMEOUT_MS="${TCSD_STAGE_HERMES_TIMEOUT_MS:-3600000}" \
        TCSD_STAGE_HERMES_MAX_TURNS="${TCSD_STAGE_HERMES_MAX_TURNS:-200}" \
        TCSD_STAGE_HERMES_PROFILE="${TCSD_STAGE_HERMES_PROFILE:-${HERMES_PROFILE:-}}" \
        HERMES_TIMEOUT_SIMULINK_MODULE_DESCRIPTION_GENERATE_MS="${HERMES_TIMEOUT_SIMULINK_MODULE_DESCRIPTION_GENERATE_MS:-3600000}" \
        HERMES_MAX_TURNS_SIMULINK_MODULE_DESCRIPTION_GENERATE="${HERMES_MAX_TURNS_SIMULINK_MODULE_DESCRIPTION_GENERATE:-10000}" \
        UNIT_TEST_CASE_PROJECT_ADMIN_CODE="${UNIT_TEST_CASE_PROJECT_ADMIN_CODE:-114301}" \
        UNIT_TEST_CASE_DEFAULT_PROJECTS="${UNIT_TEST_CASE_DEFAULT_PROJECTS:-01_楚能,02_TMS}" \
        UNIT_TEST_CASE_PROJECT_ADDON_ROOT="${UNIT_TEST_CASE_PROJECT_ADDON_ROOT:-$PROJECT_ROOT/.local/project-addons}" \
        UNIT_TEST_CASE_EXPECTED_OUTPUT_PATTERN="${UNIT_TEST_CASE_EXPECTED_OUTPUT_PATTERN:-outputs/*_tcsd.xlsx}" \
        node --disable-warning=ExperimentalWarning src/hermes-server.js >"$HERMES_LOG_FILE" 2>&1 &
      echo $! >"$HERMES_PID_FILE"
    )
    hermes_pid="$(tr -d '[:space:]' <"$HERMES_PID_FILE")"
    if ! wait_for_http "$HERMES_BASE_URL/api/health" "$hermes_pid" "$HERMES_LOG_FILE"; then
      rm -f "$HERMES_PID_FILE"
      exit 1
    fi
    echo "Hermes Agent is ready at $HERMES_BASE_URL"
  fi
fi

echo "Starting local service from $PROJECT_ROOT"
(
  cd "$PROJECT_ROOT"
  nohup env \
    "${LOCAL_TCSD_ENV[@]}" \
    APP_RUNTIME_ROLE="platform" \
    HOST="$HOST" \
    PORT="$PORT" \
    HERMES_TRANSPORT="$PLATFORM_HERMES_TRANSPORT" \
    HERMES_BASE_URL="$HERMES_BASE_URL" \
    HERMES_TASK_CONCURRENCY="${HERMES_TASK_CONCURRENCY:-1}" \
    HERMES_SERVER_REQUEST_TIMEOUT_MS="${HERMES_SERVER_REQUEST_TIMEOUT_MS:-0}" \
    HERMES_TIMEOUT_SIMULINK_MODULE_DESCRIPTION_GENERATE_MS="${HERMES_TIMEOUT_SIMULINK_MODULE_DESCRIPTION_GENERATE_MS:-3600000}" \
    HERMES_MAX_TURNS_SIMULINK_MODULE_DESCRIPTION_GENERATE="${HERMES_MAX_TURNS_SIMULINK_MODULE_DESCRIPTION_GENERATE:-10000}" \
    UNIT_TEST_CASE_PROJECT_ADMIN_CODE="${UNIT_TEST_CASE_PROJECT_ADMIN_CODE:-114301}" \
    UNIT_TEST_CASE_DEFAULT_PROJECTS="${UNIT_TEST_CASE_DEFAULT_PROJECTS:-01_楚能,02_TMS}" \
    UNIT_TEST_CASE_PROJECT_ADDON_ROOT="${UNIT_TEST_CASE_PROJECT_ADDON_ROOT:-$PROJECT_ROOT/.local/project-addons}" \
    UNIT_TEST_CASE_EXPECTED_OUTPUT_PATTERN="${UNIT_TEST_CASE_EXPECTED_OUTPUT_PATTERN:-outputs/*_tcsd.xlsx}" \
    node --disable-warning=ExperimentalWarning src/server.js >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
)
server_pid="$(tr -d '[:space:]' <"$PID_FILE")"

if ! wait_for_http "$URL/api/meta" "$server_pid" "$LOG_FILE"; then
  echo "Service started but did not become ready in time. Check logs or port usage." >&2
  rm -f "$PID_FILE"
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
