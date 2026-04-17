import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveBootstrapRepoPath, resolveBootstrapRepoRoot } from "./bootstrap-repo-paths.js";

const tempRoots: string[] = [];

async function makeFixture(): Promise<{ repoRoot: string; distAgentDir: string }> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-bootstrap-repo-"));
  tempRoots.push(repoRoot);
  await fs.mkdir(path.join(repoRoot, "docs", "system", "registries"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, "dist", "agents"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), "{}\n", "utf8");
  await fs.writeFile(
    path.join(repoRoot, "docs", "system", "registries", "bootstrap-files.yaml"),
    "version: 1\nfileClasses: []\n",
    "utf8",
  );
  return {
    repoRoot,
    distAgentDir: path.join(repoRoot, "dist", "agents"),
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => await fs.rm(root, { recursive: true, force: true })),
  );
});

describe("bootstrap repo path helpers", () => {
  it("resolves repo-relative files from a dist-style module location", async () => {
    const fixture = await makeFixture();
    const fakeImportMetaUrl = new URL(`file://${path.join(fixture.distAgentDir, "bootstrap.js")}`)
      .href;

    expect(
      resolveBootstrapRepoPath({
        relativePath: "docs/system/registries/bootstrap-files.yaml",
        importMetaUrl: fakeImportMetaUrl,
      }),
    ).toBe(path.join(fixture.repoRoot, "docs", "system", "registries", "bootstrap-files.yaml"));
  });

  it("resolves repo root from cwd fallback when importMetaUrl is unavailable", async () => {
    const fixture = await makeFixture();

    expect(
      resolveBootstrapRepoRoot({
        cwd: path.join(fixture.repoRoot, "src", "agents"),
      }),
    ).toBe(fixture.repoRoot);
  });

  it("throws a precise error when the target file cannot be found", async () => {
    const fixture = await makeFixture();

    expect(() =>
      resolveBootstrapRepoPath({
        relativePath: "docs/system/registries/missing.yaml",
        cwd: fixture.repoRoot,
      }),
    ).toThrow('Unable to locate repo path "docs/system/registries/missing.yaml"');
  });
});
