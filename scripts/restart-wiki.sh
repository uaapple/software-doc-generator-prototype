#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Stopping wiki service..."
bash "$PROJECT_ROOT/scripts/stop-wiki.sh" || true

echo
echo "Restarting wiki service..."
bash "$PROJECT_ROOT/scripts/start-wiki.sh" "$@"
