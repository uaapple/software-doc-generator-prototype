#!/bin/sh
set -eu

usage() {
  echo "Usage: $0 --app-root /opt/software-doc-generator --target-release /opt/software-doc-generator/releases/RELEASE [--validate-only]" >&2
}

fail() {
  echo "rollback-linux-release: $*" >&2
  exit 1
}

app_root=""
target_release=""
validate_only=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --app-root)
      [ "$#" -ge 2 ] || fail "--app-root requires a value"
      app_root=$2
      shift 2
      ;;
    --target-release)
      [ "$#" -ge 2 ] || fail "--target-release requires a value"
      target_release=$2
      shift 2
      ;;
    --validate-only)
      validate_only=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage
      fail "unknown argument: $1"
      ;;
  esac
done

[ -n "$app_root" ] || fail "--app-root is required"
[ -n "$target_release" ] || fail "--target-release is required"
case "$app_root" in /*) ;; *) fail "--app-root must be an absolute path" ;; esac
case "$target_release" in /*) ;; *) fail "--target-release must be an absolute path" ;; esac

command -v realpath >/dev/null 2>&1 || fail "realpath is required"
requested_app_root=$app_root
app_root=$(realpath "$app_root") || fail "app root does not exist: $requested_app_root"
releases_root="$app_root/releases"
current_link="$app_root/current"
[ -d "$releases_root" ] || fail "releases directory does not exist: $releases_root"
[ -L "$current_link" ] || fail "current must be a symbolic link: $current_link"
target_parent=$(realpath "$(dirname "$target_release")") || fail "target release parent does not exist"
if [ "$target_parent" = "$app_root" ] && [ "$(basename "$target_release")" = "current" ]; then
  fail "--target-release cannot be current"
fi

releases_root=$(realpath "$releases_root") || fail "cannot resolve releases directory"
requested_target_release=$target_release
target_release=$(realpath "$target_release") || fail "target release does not exist: $requested_target_release"
[ ! -L "$requested_target_release" ] || fail "target release cannot be a symbolic link"
[ -d "$target_release" ] || fail "target release is not a directory: $target_release"
[ "$(dirname "$target_release")" = "$releases_root" ] ||
  fail "target release must be a direct child of $releases_root"
[ -f "$target_release/package.json" ] ||
  fail "target release is missing package.json: $target_release"

original_release=$(realpath "$current_link") || fail "current points to a missing release"
[ -d "$original_release" ] || fail "current does not point to a release directory"
[ "$(dirname "$original_release")" = "$releases_root" ] ||
  fail "current points outside $releases_root"

validate_manifest() {
  manifest_path=$1
  [ -f "$manifest_path" ] || return 0
  command -v node >/dev/null 2>&1 || fail "node is required to validate $manifest_path"
  node -e '
    const fs = require("fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (value.releaseTarget !== "linux-prod") {
      throw new Error(`releaseTarget must be linux-prod, got ${value.releaseTarget}`);
    }
    if (!/^[0-9a-f]{40}$/i.test(String(value.commitSha || ""))) {
      throw new Error("commitSha must be a 40-character hexadecimal commit id");
    }
  ' "$manifest_path" || fail "release manifest validation failed: $manifest_path"
}

validate_manifest "$target_release/release/manifest.json"
echo "Validated Linux rollback target: $target_release"
[ "$validate_only" -eq 0 ] || exit 0

service_runner=${TCSD_ROLLBACK_SERVICE_RUNNER:-}
health_runner=${TCSD_ROLLBACK_HEALTH_RUNNER:-}
health_attempts=${TCSD_ROLLBACK_HEALTH_ATTEMPTS:-30}
health_interval=${TCSD_ROLLBACK_HEALTH_INTERVAL_SECONDS:-1}
if [ -n "$service_runner$health_runner${TCSD_ROLLBACK_HEALTH_ATTEMPTS:-}${TCSD_ROLLBACK_HEALTH_INTERVAL_SECONDS:-}" ] &&
  [ "${TCSD_ROLLBACK_TEST_MODE:-0}" != "1" ]; then
  fail "runner injection is allowed only when TCSD_ROLLBACK_TEST_MODE=1"
fi
case "$health_attempts:$health_interval" in
  *[!0-9:]*|:*|*:) fail "health attempts and interval must be non-negative integers" ;;
esac
[ "$health_attempts" -gt 0 ] || fail "health attempts must be greater than zero"

run_service() {
  action=$1
  service=$2
  if [ -n "$service_runner" ]; then
    "$service_runner" "$action" "$service"
  else
    systemctl "$action" "$service"
  fi
}

check_url() {
  url=$1
  if [ -n "$health_runner" ]; then
    "$health_runner" "$url"
  else
    curl --fail --silent --show-error --max-time 10 "$url" >/dev/null
  fi
}

check_health() {
  attempt=1
  while [ "$attempt" -le "$health_attempts" ]; do
    if check_url "http://127.0.0.1:3000/api/health" &&
      check_url "http://127.0.0.1:3001/"; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep "$health_interval"
  done
  return 1
}

switch_current() {
  destination=$1
  temporary_link="$app_root/.current.rollback.$$"
  [ ! -e "$temporary_link" ] && [ ! -L "$temporary_link" ] ||
    fail "temporary link already exists: $temporary_link"
  ln -s "$destination" "$temporary_link"
  if [ "$(uname -s)" = "Linux" ]; then
    mv -Tf "$temporary_link" "$current_link"
  else
    mv -fh "$temporary_link" "$current_link"
  fi
}

cleanup_link="$app_root/.current.rollback.$$"
trap 'rm -f "$cleanup_link"' EXIT HUP INT TERM

rollback_failed=0
run_service stop software-doc-generator.service || rollback_failed=1
run_service stop software-doc-wiki.service || rollback_failed=1
if [ "$rollback_failed" -ne 0 ]; then
  run_service start software-doc-generator.service >/dev/null 2>&1 || true
  run_service start software-doc-wiki.service >/dev/null 2>&1 || true
  fail "failed to stop Linux services; current was not changed"
fi

if ! switch_current "$target_release"; then
  run_service start software-doc-generator.service >/dev/null 2>&1 || true
  run_service start software-doc-wiki.service >/dev/null 2>&1 || true
  fail "failed to atomically switch current to $target_release"
fi

activation_ok=1
run_service start software-doc-generator.service || activation_ok=0
run_service start software-doc-wiki.service || activation_ok=0
if [ "$activation_ok" -eq 1 ] && check_health; then
  echo "Linux rollback completed: $current_link -> $target_release"
  exit 0
fi

echo "Target release failed startup or health; restoring $original_release" >&2
run_service stop software-doc-generator.service >/dev/null 2>&1 || true
run_service stop software-doc-wiki.service >/dev/null 2>&1 || true
switch_current "$original_release" || fail "target failed and original current could not be restored"
run_service start software-doc-generator.service >/dev/null 2>&1 || true
run_service start software-doc-wiki.service >/dev/null 2>&1 || true
check_health >/dev/null 2>&1 || true
fail "target release failed startup or health; original current was restored"
