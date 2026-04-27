#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_BRANCH="${RELEASE_BRANCH:-release/windows-prod}"
OUTPUT_DIR="${1:-$PROJECT_ROOT/release-dist}"

cd "$PROJECT_ROOT"

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$RELEASE_BRANCH" ]]; then
  echo "Refusing to build a production release from '$current_branch'. Switch to '$RELEASE_BRANCH' first." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain=v1)" ]]; then
  echo "Refusing to build a production release from a dirty worktree." >&2
  git status --short >&2
  exit 1
fi

if [[ "${SKIP_RELEASE_CHECKS:-0}" != "1" ]]; then
  npm test
  npm run check:wiki
  npm run check:encoding
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "zip was not found. Install zip or use the macOS /usr/bin/zip utility." >&2
  exit 1
fi

short_sha="$(git rev-parse --short=12 HEAD)"
commit_sha="$(git rev-parse HEAD)"
commit_time="$(git log -1 --format=%cI)"
build_time="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
timestamp="$(date +"%Y%m%d-%H%M%S")"
package_name="software-doc-generator-${timestamp}-${short_sha}"

mkdir -p "$OUTPUT_DIR"
output_zip="$OUTPUT_DIR/${package_name}.zip"
tmp_zip="$OUTPUT_DIR/.${package_name}.zip.tmp"
manifest_dir="$(mktemp -d)"
trap 'rm -rf "$manifest_dir" "$tmp_zip"' EXIT

archive_paths=(
  ".env.defaults"
  "README.md"
  "package.json"
  "package-lock.json"
  "src"
  "public"
  "wiki"
  "skills"
  "scripts"
  "templates"
  "docs"
)

git archive --format=zip --output="$tmp_zip" HEAD "${archive_paths[@]}"

mkdir -p "$manifest_dir/release"
cat >"$manifest_dir/release/manifest.json" <<JSON
{
  "packageName": "$package_name",
  "releaseBranch": "$RELEASE_BRANCH",
  "commitSha": "$commit_sha",
  "commitTime": "$commit_time",
  "buildTime": "$build_time",
  "runtimeDataPolicy": "APP_DATA_DIR and APP_SKILLS_DIR are external to the release package."
}
JSON

(
  cd "$manifest_dir"
  zip -q -r "$tmp_zip" release/manifest.json
)

mv "$tmp_zip" "$output_zip"
cp "$output_zip" "$OUTPUT_DIR/latest.zip"
cp "$PROJECT_ROOT/scripts/deploy-release.ps1" "$OUTPUT_DIR/deploy-release.ps1"
cp "$PROJECT_ROOT/scripts/install-windows-services.ps1" "$OUTPUT_DIR/install-windows-services.ps1"

echo "Release package created:"
echo "$output_zip"
echo "Latest package alias:"
echo "$OUTPUT_DIR/latest.zip"
echo "Windows deployment helper scripts:"
echo "$OUTPUT_DIR/deploy-release.ps1"
echo "$OUTPUT_DIR/install-windows-services.ps1"
