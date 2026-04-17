#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$PROJECT_ROOT"

source "$PROJECT_ROOT/scripts/command-window-utils.sh"

echo "启动 Wiki 服务..."
echo

bash "$PROJECT_ROOT/scripts/start-wiki.sh"

wait_for_key_and_close "Wiki 启动流程已结束。按任意键关闭窗口。"
