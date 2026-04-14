#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$PROJECT_ROOT"

echo "终止本地后端服务..."
echo

bash "$PROJECT_ROOT/scripts/stop-local.sh"

echo
echo "停止流程已结束。按任意键关闭窗口。"
read -n 1 -s
