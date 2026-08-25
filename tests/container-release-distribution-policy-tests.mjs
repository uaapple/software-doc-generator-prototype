#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const builder = read("scripts/build-container-release.mjs");
const metadataBuilder = read("scripts/prepare-container-release-metadata.mjs");
const archiveBuilder = read("scripts/create-offline-image-archive.mjs");
const schema = JSON.parse(
  read("deploy/schemas/main-unification-production-candidate.schema.json")
);

assert.match(builder, /primary: "ghcr-exact-digest"/);
assert.match(builder, /offlineImageArchives: "on-demand-only"/);
assert.match(builder, /githubReleaseFullImageTarRequired: false/);
assert.match(builder, /SDG_PROJECT_ADDON_SOURCE_DIR/);
assert.match(builder, /SDG_PROJECT_ADDON_PROJECTS/);
assert.match(builder, /build-project-addon-release\.mjs/);
assert.match(builder, /projectAddons: projectAddonRelease/);
assert.match(metadataBuilder, /requireProjectAddons/);
assert.match(metadataBuilder, /project-addon-archive/);
assert.match(metadataBuilder, /project-addon-manifest/);
assert.match(metadataBuilder, /SHA-256 does not match source release metadata/);
assert.match(builder, /process\.argv\.includes\("--offline"\)/);
assert.match(builder, /Full-image offline archives are not regular Release assets/);
assert.match(metadataBuilder, /offlineImageArchives: "on-demand-only"/);
assert.match(metadataBuilder, /rollbackRegistryReference/);
assert.doesNotMatch(metadataBuilder, /offlineArchive/);
assert.match(archiveBuilder, /docker", \["pull", "--platform", "linux\/amd64"/);
assert.match(archiveBuilder, /scripts\/verify_image_archive\.py/);
assert.match(archiveBuilder, /--expect-archive-sha256/);
assert.match(archiveBuilder, /archiveConfigImageId/);
assert.match(archiveBuilder, /layerDigests/);
assert.match(archiveBuilder, /releaseAsset: false/);
assert.equal(
  schema.properties.distribution.properties.ghcrExactDigest.const,
  "primary-distribution"
);
assert.equal(
  schema.properties.distribution.properties.offlineImageArchives.const,
  "on-demand-only"
);
assert.equal(
  schema.properties.distribution.properties.githubReleaseFullImageTar.const,
  "not-required"
);
assert.match(
  schema.properties.releaseAssets.propertyNames.not.pattern,
  /tar/,
  "candidate schema must prohibit full-image archives as regular Release assets"
);

console.log("container release distribution policy tests passed");
