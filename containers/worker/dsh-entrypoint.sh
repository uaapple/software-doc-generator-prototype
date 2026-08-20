#!/bin/sh
set -eu

: "${TCSD_WORKSPACE_ROOT:=/var/lib/sdg/data}"
: "${DSH_HOME:=/var/lib/sdg/hermes-home/dsh}"
: "${SATK_MATLAB_SESSION_MODE:=gateway}"
: "${SATK_MATLAB_DISPLAY_MODE:=nodesktop}"
: "${SATK_MCP_LOG_FOLDER:=/var/lib/sdg/logs/matlab-mcp}"
: "${TCSD_CLEAN_STALE_MCP:=0}"
: "${TCSD_GATEWAY_TRANSPORT:=/usr/local/bin/tcsd-gateway-transport}"

mkdir -p "$TCSD_WORKSPACE_ROOT" "$DSH_HOME" "$SATK_MCP_LOG_FOLDER"

# DSH scrubs credential-shaped env names (TOKEN/KEY/SECRET) from every child
# process, so the transport wrapper cannot inherit the Gateway tokens from
# env. Materialize them into a 0600 file the wrapper sources at exec time;
# the tokens are then removed from this process env. (0600 owner = service
# user; the model could read it with an explicit path, accepted per the
# operator's credential policy.)
TCSD_GATEWAY_SECRETS_FILE="${TCSD_GATEWAY_SECRETS_FILE:-/var/lib/sdg/hermes-home/gateway-secrets.env}"
if [ -n "${MATLAB_MCP_AUTH_TOKEN:-}" ] || [ -n "${MATLAB_GATEWAY_EVALUATE_TOKEN:-}" ]; then
  {
    [ -n "${MATLAB_MCP_AUTH_TOKEN:-}" ] && printf 'MATLAB_MCP_AUTH_TOKEN=%s\n' "$MATLAB_MCP_AUTH_TOKEN"
    [ -n "${MATLAB_GATEWAY_EVALUATE_TOKEN:-}" ] && printf 'MATLAB_GATEWAY_EVALUATE_TOKEN=%s\n' "$MATLAB_GATEWAY_EVALUATE_TOKEN"
  } > "$TCSD_GATEWAY_SECRETS_FILE"
  chmod 0600 "$TCSD_GATEWAY_SECRETS_FILE"
  unset MATLAB_MCP_AUTH_TOKEN MATLAB_GATEWAY_TOKEN MATLAB_GATEWAY_EVALUATE_TOKEN
fi
export TCSD_GATEWAY_SECRETS_FILE

preset_source=/opt/sdg/app/presets/unit-test-case-generation-production
preset_target="$DSH_HOME/.agent-presets/unit-test-case-generation-production"
# Force-refresh on every start: the preset is image-owned read-only config and
# must never be shadowed by a stale copy in the persistent dsh-home volume.
mkdir -p "$preset_target"
cp -f "$preset_source/agent.cordis.yml" "$preset_source/preset.yml" "$preset_target/"

headless_profile="$DSH_HOME/profiles/headless"
headless_patch="$headless_profile/cordis.patch.yml"
if [ ! -f "$headless_patch" ] || ! grep -q 'dsh-headless-tcsd' "$headless_patch"; then
  mkdir -p "$headless_profile"
  cp /opt/sdg/app/containers/worker/headless-production-preset.patch.yml "$headless_patch"
fi

# Role switch: APP_RUNTIME_ROLE=hermes-agent runs the Worker service (backend
# dispatches generation tasks via HERMES_TRANSPORT=api -> POST /internal/dsh/tasks,
# which spawns a headless DSH session per task). Without a role (or with a task
# instruction argument) it stays the one-shot task driver.
if [ "${APP_RUNTIME_ROLE:-}" = "hermes-agent" ] && [ "$#" -eq 0 ]; then
  cd /opt/sdg/app
  exec node --disable-warning=ExperimentalWarning src/hermes-server.js
fi

if [ "$#" -eq 0 ]; then
  echo "usage: tcsd-dsh-worker <task instruction>" >&2
  exit 64
fi

# The platform injects only model-provider variables into this process.
# Gateway secrets are scoped to the approved Python transport scripts only.
# DSH's HMR service requires node --expose-internals.
exec node --expose-internals /usr/local/bin/dsh --profile headless "$@"
