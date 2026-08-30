import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const { hashTcsdBundle } = await import(
  new URL("../src/services/tcsd-stage-catalog.js", import.meta.url).href
);

// Manifest-driven bundle hashing: stray build-context files must not shift a
// deployed bundle's hash (the bbc72245 production drift blind spot), and the
// generated manifests must always match the tree.

const root = await mkdtemp(path.join(tmpdir(), "tcsd-manifest-"));
let passed = 0;
try {
  // 1. Manifest mode: adding a stray file does NOT change the hash.
  {
    const bundle = path.join(root, "bundle-a");
    await mkdir(path.join(bundle, "sub"), { recursive: true });
    await writeFile(path.join(bundle, "SKILL.md"), "skill content");
    await writeFile(path.join(bundle, "sub", "helper.py"), "print(1)");
    const repoBundle = path.resolve("skills/hermes/tcsd-stage-01-validate-inputs");
    const repoManifest = JSON.parse(await readFile(path.join(repoBundle, "bundle-manifest.json"), "utf8"));
    assert.equal(repoManifest.schema, "tcsd-bundle-manifest/v1");
    assert.ok(Array.isArray(repoManifest.files) && repoManifest.files.length >= 1);
    passed += 1;
    console.log("ok - repo manifests exist and follow the schema");
  }

  // 2. hashTcsdBundle uses the repo manifest and ignores stray files.
  {
    const bundle = path.resolve("skills/hermes/tcsd-stage-01-validate-inputs");
    const first = await hashTcsdBundle(bundle);
    assert.equal(first.manifestDriven, true, "repo bundle must hash in manifest mode");
    // Drop a stray file into the bundle directory: hash unchanged.
    const stray = path.join(bundle, ".DS_Store");
    await writeFile(stray, "junk");
    try {
      const second = await hashTcsdBundle(bundle);
      assert.equal(second.sha256, first.sha256, "stray files must not shift the manifest hash");
    } finally {
      await rm(stray, { force: true });
    }
    // An UNLISTED real file is deployment drift and must fail loudly.
    const unlisted = path.join(bundle, "unlisted.txt");
    await writeFile(unlisted, "drift");
    try {
      await assert.rejects(
        () => hashTcsdBundle(bundle),
        (error) => error.message.includes("清单之外的文件")
      );
    } finally {
      await rm(unlisted, { force: true });
    }
    // chmod drift shifts the hash (actual on-disk mode is hashed).
    const skillFile = path.join(bundle, "SKILL.md");
    const { chmod, stat } = await import("node:fs/promises");
    const originalMode = (await stat(skillFile)).mode & 0o777;
    await chmod(skillFile, 0o600);
    try {
      const chmodded = await hashTcsdBundle(bundle);
      assert.notEqual(chmodded.sha256, first.sha256, "chmod drift must shift the manifest hash");
    } finally {
      await chmod(skillFile, originalMode);
    }
    // Touch a listed file: hash changes (content is covered).
    const target = path.join(bundle, "SKILL.md");
    const original = await readFile(target, "utf8");
    await writeFile(target, original + "\n");
    try {
      const modified = await hashTcsdBundle(bundle);
      assert.notEqual(modified.sha256, first.sha256, "content changes must shift the hash");
    } finally {
      await writeFile(target, original, "utf8");
    }
    passed += 1;
    console.log("ok - manifest hash ignores stray files, covers content");
  }

  // 3. Fallback mode (no manifest) still works.
  {
    const bundle = path.join(root, "bundle-b");
    await mkdir(bundle, { recursive: true });
    await writeFile(path.join(bundle, "a.txt"), "A");
    const result = await hashTcsdBundle(bundle);
    assert.equal(result.manifestDriven, false);
    assert.equal(result.fileCount, 1);
    passed += 1;
    console.log("ok - fallback walk works without a manifest");
  }

  // 4. Tool --check detects drift (temp clone of a bundle with a stale manifest).
  {
    const fake = path.join(root, "drift", "skills", "hermes", "tcsd-my-bundle");
    await mkdir(fake, { recursive: true });
    await writeFile(path.join(fake, "a.txt"), "A");
    const toolSource = await readFile(path.resolve("tools/generate-bundle-manifests.mjs"), "utf8");
    // The tool resolves skills/hermes relative to tools/..; run it from a fake
    // checkout root that mirrors that layout.
    const fakeRoot = path.join(root, "drift");
    await mkdir(path.join(fakeRoot, "tools"), { recursive: true });
    await writeFile(path.join(fakeRoot, "tools", "generate-bundle-manifests.mjs"), toolSource, "utf8");
    execFileSync("node", [path.join(fakeRoot, "tools", "generate-bundle-manifests.mjs")], { cwd: fakeRoot, stdio: "pipe" });
    await writeFile(path.join(fake, "b.txt"), "B"); // drift after generation
    let checkFailed = false;
    try {
      execFileSync("node", [path.join(fakeRoot, "tools", "generate-bundle-manifests.mjs"), "--check"], { cwd: fakeRoot, stdio: "pipe" });
    } catch {
      checkFailed = true;
    }
    assert.equal(checkFailed, true, "--check must flag a drifted bundle");
    passed += 1;
    console.log("ok - --check flags manifest drift");
  }

  console.log(`manifest hashing tests: ${passed} passed`);
} finally {
  await rm(root, { recursive: true, force: true });
}
