#!/usr/bin/env bash

set -euo pipefail

bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/start-local.sh" "$@"
