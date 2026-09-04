import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

const requiredWorkspaceDirectories = [
  "apps/extension",
  "apps/cli",
  "apps/fixture-site",
  "packages/protocol",
  "packages/safety",
  "packages/recorder-core",
  "packages/recording-adapter",
  "packages/normalizer",
  "packages/locator-engine",
  "packages/runner",
  "packages/assertions",
  "packages/extractor",
  "packages/failure",
  "packages/codex-adapter",
  "workflows",
  "data",
];

test("repository foundation declares the required npm workspace layout", () => {
  for (const directory of requiredWorkspaceDirectories) {
    assert.equal(existsSync(resolve(root, directory)), true, `missing ${directory}`);
  }

  const packageJsonPath = resolve(root, "package.json");
  assert.equal(existsSync(packageJsonPath), true, "missing root package.json");

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  assert.deepEqual(packageJson.workspaces, ["apps/*", "packages/*"]);
  assert.equal(packageJson.scripts.build, "npm run build --workspaces --if-present");
  assert.equal(packageJson.scripts.typecheck, "npm run typecheck --workspaces --if-present");
  assert.equal(packageJson.scripts.test, "npm run test --workspaces --if-present");
});
