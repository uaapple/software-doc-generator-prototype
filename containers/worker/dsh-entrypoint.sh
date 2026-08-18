#!/bin/sh
set -eu

: "${TCSD_WORKSPACE_ROOT:=/var/lib/sdg/data}"
: "${DSH_HOME:=/var/lib/sdg/dsh-home}"
: "${SATK_MATLAB_SESSION_MODE:=gateway}"
: "${SATK_MATLAB_DISPLAY_MODE:=nodesktop}"
: "${SATK_MCP_LOG_FOLDER:=/var/lib/sdg/logs/matlab-mcp}"
: "${TCSD_CLEAN_STALE_MCP:=0}"
: "${TCSD_GATEWAY_TRANSPORT:=/usr/local/bin/tcsd-gateway-transport}"

# Materialize the Gateway credential file from the platform-injected env, then
# unset the tokens BEFORE any DSH process starts. The file is root-owned,
# group sdg-transport (10002), mode 0440: the DSH session (uid 10001) can
# neither read the file nor inherit the tokens; only the setgid transport
# wrapper (egid 10002) can read it.
SECRET_FILE=/run/secrets/tcsd-gateway.env
if [ -n "${MATLAB_MCP_AUTH_TOKEN:-}" ] && [ -n "${MATLAB_GATEWAY_EVALUATE_TOKEN:-}" ]; then
  mkdir -p /run/secrets
  printf 'MATLAB_MCP_AUTH_TOKEN=%s\nMATLAB_GATEWAY_EVALUATE_TOKEN=%s\n' \
    "$MATLAB_MCP_AUTH_TOKEN" "$MATLAB_GATEWAY_EVALUATE_TOKEN" > "$SECRET_FILE"
  chmod 0440 "$SECRET_FILE"
  chown root:sdg-transport "$SECRET_FILE"
fi
unset MATLAB_MCP_AUTH_TOKEN MATLAB_GATEWAY_TOKEN MATLAB_GATEWAY_EVALUATE_TOKEN

mkdir -p "$TCSD_WORKSPACE_ROOT" "$DSH_HOME" "$SATK_MCP_LOG_FOLDER"
# Fix ownership of the shared (possibly host bind-mounted) data volume so the
# unprivileged service user can write; keep the root world-writable for host
# convenience on the dev Mac stack.
chown -R 10001:10001 "$TCSD_WORKSPACE_ROOT" "$DSH_HOME" "$SATK_MCP_LOG_FOLDER" 2>/dev/null || true
chmod 0777 "$TCSD_WORKSPACE_ROOT" 2>/dev/null || true

preset_source=/opt/sdg/app/presets/unit-test-case-generation-production
preset_target="$DSH_HOME/.agent-presets/unit-test-case-generation-production"
# Force-refresh on every start: the preset is image-owned read-only config and
# must never be shadowed by a stale copy in the persistent dsh-home volume.
mkdir -p "$preset_target"
cp -f "$preset_source/agent.cordis.yml" "$preset_source/preset.yml" "$preset_target/"
chown -R 10001:10001 "$preset_target" 2>/dev/null || true

headless_profile="$DSH_HOME/profiles/headless"
headless_patch="$headless_profile/cordis.patch.yml"
if [ ! -f "$headless_patch" ] || ! grep -q 'dsh-headless-tcsd' "$headless_patch"; then
  mkdir -p "$headless_profile"
  cp /opt/sdg/app/containers/worker/headless-production-preset.patch.yml "$headless_patch"
  chown -R 10001:10001 "$headless_profile" 2>/dev/null || true
fi

drop() {
  # Drop every capability (bounding/inheritable/ambient) together with the
  # privilege drop: the service must not retain CAP_DAC_OVERRIDE, otherwise it
  # could bypass the root-owned Gateway credential file.
  exec setpriv --bounding-set=-all --inh-caps=-all --ambient-caps=-all     --reuid=10001 --regid=10001 --clear-groups "$@"
}

# Role switch: APP_RUNTIME_ROLE=hermes-agent runs the Worker service (backend
# dispatches generation tasks via HERMES_TRANSPORT=api -> POST /internal/dsh/tasks,
# which spawns a headless DSH session per task). Without a role (or with a task
# instruction argument) it stays the one-shot task driver.
if [ "${APP_RUNTIME_ROLE:-}" = "hermes-agent" ] && [ "$#" -eq 0 ]; then
  cd /opt/sdg/app
  drop node --disable-warning=ExperimentalWarning src/hermes-server.js
fi

if [ "$#" -eq 0 ]; then
  echo "usage: tcsd-dsh-worker <task instruction>" >&2
  exit 64
fi

# The platform injects only model-provider variables into this process.
# Gateway secrets are scoped to the approved Python transport scripts only.
drop dsh --profile headless "$*"
