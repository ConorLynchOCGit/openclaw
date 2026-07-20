import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createReleaseManifestFixture } from "../test/helpers/release-manifest-fixture.js";
import type { PluginRecord, PluginRegistry } from "./plugins/registry-types.js";
import { releaseManifestDigest, serializeReleaseManifest } from "./release-manifest.js";
import { readLoadedReleaseReadiness } from "./release-runtime-readiness.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createPackageRoot(): string {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-release-runtime-"));
  tempDirs.push(packageRoot);
  const manifestText = serializeReleaseManifest(createReleaseManifestFixture());
  fs.writeFileSync(path.join(packageRoot, "release-manifest.json"), manifestText);
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    `${JSON.stringify({
      name: "openclaw",
      version: "2026.7.19-b1.1",
      openclaw: {
        release: {
          packageShape: "prototype-b-native-release-set-v1",
          manifestPath: "release-manifest.json",
          manifestSha256: releaseManifestDigest(manifestText),
        },
      },
    })}\n`,
  );
  return packageRoot;
}

function createPlugin(params: {
  packageRoot: string;
  pluginId: "browser" | "codex";
  origin: "bundled" | "global";
}): PluginRecord {
  const rootDir = path.join(params.packageRoot, "plugins", params.pluginId);
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(path.join(rootDir, "openclaw.plugin.json"), `{"id":"${params.pluginId}"}\n`);
  const source = path.join(rootDir, "index.js");
  fs.writeFileSync(source, "export default {};\n");
  return {
    id: params.pluginId,
    name: params.pluginId,
    packageName: params.pluginId === "browser" ? "openclaw" : "@openclaw/codex",
    version: "2026.7.19-b1.1",
    source,
    rootDir,
    origin: params.origin,
    status: "loaded",
  } as PluginRecord;
}

function registry(plugins: PluginRecord[]): PluginRegistry {
  return { plugins } as PluginRegistry;
}

describe("loaded release readiness", () => {
  it("passes only an exact package-owned loaded plugin set", () => {
    const packageRoot = createPackageRoot();
    const result = readLoadedReleaseReadiness({
      packageRoot,
      pluginRegistry: registry([
        createPlugin({ packageRoot, pluginId: "browser", origin: "bundled" }),
        createPlugin({ packageRoot, pluginId: "codex", origin: "global" }),
      ]),
    });

    expect(result).toMatchObject({
      ready: true,
      errors: [],
      identity: {
        packageShape: "prototype-b-native-release-set-v1",
        requiredPluginIds: ["browser", "codex"],
      },
    });
    expect(result?.pluginOrigins.map((item) => item.pluginId)).toEqual(["browser", "codex"]);
  });

  it("fails closed for missing, shadowed, or unexpected loaded plugins", () => {
    const packageRoot = createPackageRoot();
    const codex = createPlugin({ packageRoot, pluginId: "codex", origin: "global" });
    const result = readLoadedReleaseReadiness({
      packageRoot,
      pluginRegistry: registry([
        { ...codex, origin: "workspace" },
        { ...codex, id: "shadow", name: "shadow" },
      ]),
    });

    expect(result?.ready).toBe(false);
    expect(result?.errors).toContain("required plugin browser is not loaded");
    expect(result?.errors.join("\n")).toContain("codex.origin mismatch");
    expect(result?.errors).toContain("loaded plugin shadow is absent from release readiness");
  });

  it("does not invent release identity for a package outside the release protocol", () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-release-runtime-"));
    tempDirs.push(packageRoot);
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      `${JSON.stringify({ name: "openclaw", version: "2026.7.19" })}\n`,
    );

    expect(readLoadedReleaseReadiness({ packageRoot })).toBeUndefined();
  });
});
