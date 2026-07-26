#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
rollback="$root_dir/scripts/rollback-linux-release.sh"
fixture=$(mktemp -d "${TMPDIR:-/tmp}/linux-rollback-test.XXXXXX")
fixture=$(realpath "$fixture")
trap 'rm -rf "$fixture"' EXIT HUP INT TERM

app_root="$fixture/app"
releases="$app_root/releases"
old_release="$releases/old"
new_release="$releases/new"
outside_release="$fixture/outside"
mkdir -p "$old_release/release" "$new_release/release" "$outside_release"
printf '{}\n' >"$old_release/package.json"
printf '{}\n' >"$new_release/package.json"
printf '{}\n' >"$outside_release/package.json"
printf '%s\n' '{"releaseTarget":"linux-prod","commitSha":"1111111111111111111111111111111111111111"}' \
  >"$new_release/release/manifest.json"
ln -s "$old_release" "$app_root/current"

service_runner="$fixture/service-runner.sh"
health_runner="$fixture/health-runner.sh"
printf '%s\n' '#!/bin/sh' 'printf "%s %s\n" "$1" "$2" >>"$ROLLBACK_TEST_LOG"' >"$service_runner"
printf '%s\n' '#!/bin/sh' 'exit 0' >"$health_runner"
chmod +x "$service_runner" "$health_runner"
export TCSD_ROLLBACK_TEST_MODE=1
export TCSD_ROLLBACK_SERVICE_RUNNER="$service_runner"
export TCSD_ROLLBACK_HEALTH_RUNNER="$health_runner"
export TCSD_ROLLBACK_HEALTH_ATTEMPTS=1
export TCSD_ROLLBACK_HEALTH_INTERVAL_SECONDS=0
export ROLLBACK_TEST_LOG="$fixture/services.log"

"$rollback" --app-root "$app_root" --target-release "$new_release" --validate-only
[ "$(realpath "$app_root/current")" = "$old_release" ]
[ ! -e "$ROLLBACK_TEST_LOG" ]

"$rollback" --app-root "$app_root" --target-release "$new_release"
[ "$(realpath "$app_root/current")" = "$new_release" ]
grep -q "stop software-doc-generator.service" "$ROLLBACK_TEST_LOG"
grep -q "start software-doc-wiki.service" "$ROLLBACK_TEST_LOG"

if "$rollback" --app-root "$app_root" --target-release "$outside_release" --validate-only >/dev/null 2>&1; then
  echo "outside release unexpectedly validated" >&2
  exit 1
fi
if "$rollback" --app-root "$app_root" --target-release "$app_root/current" --validate-only >/dev/null 2>&1; then
  echo "current unexpectedly validated as a target" >&2
  exit 1
fi
rm "$app_root/current"
mkdir "$app_root/current"
if "$rollback" --app-root "$app_root" --target-release "$old_release" --validate-only >/dev/null 2>&1; then
  echo "non-symlink current unexpectedly validated" >&2
  exit 1
fi
rmdir "$app_root/current"
ln -s "$old_release" "$app_root/current"

failing_health="$fixture/failing-health.sh"
printf '%s\n' \
  '#!/bin/sh' \
  'if [ "$(basename "$(realpath "$ROLLBACK_TEST_APP/current")")" = "new" ]; then exit 1; fi' \
  'exit 0' >"$failing_health"
chmod +x "$failing_health"
export ROLLBACK_TEST_APP="$app_root"
export TCSD_ROLLBACK_HEALTH_RUNNER="$failing_health"
if "$rollback" --app-root "$app_root" --target-release "$new_release" >/dev/null 2>&1; then
  echo "unhealthy target unexpectedly succeeded" >&2
  exit 1
fi
[ "$(realpath "$app_root/current")" = "$old_release" ]

printf '%s\n' '{"releaseTarget":"windows-prod-full","commitSha":"bad"}' \
  >"$new_release/release/manifest.json"
if "$rollback" --app-root "$app_root" --target-release "$new_release" --validate-only >/dev/null 2>&1; then
  echo "invalid manifest unexpectedly validated" >&2
  exit 1
fi

echo "Linux release rollback fixture tests passed."
