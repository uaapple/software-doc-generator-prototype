#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$PROJECT_ROOT"

source "$PROJECT_ROOT/scripts/command-window-utils.sh"

echo "重启本地后端服务..."
echo

bash "$PROJECT_ROOT/scripts/stop-local.sh" || true
echo
bash "$PROJECT_ROOT/scripts/start-local.sh"

wait_for_key_and_close "重启流程已结束。按任意键关闭窗口。"
