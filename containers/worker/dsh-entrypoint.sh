#!/bin/sh
set -eu

: "${TCSD_WORKSPACE_ROOT:=/var/lib/sdg/data}"
: "${DSH_HOME:=/var/lib/sdg/dsh-home}"
: "${SATK_MATLAB_SESSION_MODE:=gateway}"
: "${SATK_MATLAB_DISPLAY_MODE:=nodesktop}"
: "${SATK_MCP_LOG_FOLDER:=/var/lib/sdg/logs/matlab-mcp}"
: "${TCSD_CLEAN_STALE_MCP:=0}"
: "${TCSD_GATEWAY_TRANSPORT:=/usr/local/bin/tcsd-gateway-transport}"

# Transport path is intentionally visible; Gateway tokens are not. The DSH
# process cannot read the root-owned secret mount or inherit its contents.
unset MATLAB_MCP_AUTH_TOKEN MATLAB_GATEWAY_TOKEN MATLAB_GATEWAY_EVALUATE_TOKEN
mkdir -p "$TCSD_WORKSPACE_ROOT" "$DSH_HOME" "$SATK_MCP_LOG_FOLDER"

preset_source=/opt/sdg/app/presets/unit-test-case-generation-production
preset_target="$DSH_HOME/.agent-presets/unit-test-case-generation-production"
if [ ! -f "$preset_target/agent.cordis.yml" ]; then
  mkdir -p "$preset_target"
  cp "$preset_source/agent.cordis.yml" "$preset_source/preset.yml" "$preset_target/"
fi

headless_profile="$DSH_HOME/profiles/headless"
headless_patch="$headless_profile/cordis.patch.yml"
if [ ! -f "$headless_patch" ] || ! grep -q 'dsh-headless-tcsd' "$headless_patch"; then
  mkdir -p "$headless_profile"
  cp /opt/sdg/app/containers/worker/headless-production-preset.patch.yml "$headless_patch"
fi

if [ "$#" -eq 0 ]; then
  echo "usage: tcsd-dsh-worker <task instruction>" >&2
  exit 64
fi

# The platform injects only model-provider variables into this process.
# Gateway secrets are scoped later to the approved Python transport scripts.
exec dsh --profile headless "$*"
