import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createReleaseManifestFixture } from "../test/helpers/release-manifest-fixture.js";
import {
  loadEmbeddedReleaseManifest,
  packageDeclaresReleaseManifest,
  readLoadedReleaseIdentity,
  readLoadedReleaseIdentityIfDeclared,
} from "./release-manifest-readback.js";
import { releaseManifestDigest, serializeReleaseManifest } from "./release-manifest.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writePackageFixture(): { packageRoot: string; manifestText: string } {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-release-readback-"));
  tempDirs.push(packageRoot);
  const manifestText = serializeReleaseManifest(createReleaseManifestFixture());
  fs.writeFileSync(path.join(packageRoot, "release-manifest.json"), manifestText);
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "openclaw",
        version: "2026.7.19-b1.1",
        openclaw: {
          release: {
            packageShape: "prototype-b-native-release-set-v1",
            manifestPath: "release-manifest.json",
            manifestSha256: releaseManifestDigest(manifestText),
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  return { packageRoot, manifestText };
}

describe("release manifest readback", () => {
  it("does not assign release identity to an ordinary source or development package", () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-release-readback-"));
    tempDirs.push(packageRoot);
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      `${JSON.stringify({ name: "openclaw", version: "2026.7.19" })}\n`,
    );

    expect(packageDeclaresReleaseManifest(packageRoot)).toBe(false);
    expect(readLoadedReleaseIdentityIfDeclared(packageRoot)).toBeNull();
  });

  it("returns loaded identity from exact embedded package bytes", () => {
    const { packageRoot, manifestText } = writePackageFixture();

    expect(packageDeclaresReleaseManifest(packageRoot)).toBe(true);
    expect(loadEmbeddedReleaseManifest(packageRoot).releaseManifestDigest).toBe(
      releaseManifestDigest(manifestText),
    );
    expect(readLoadedReleaseIdentity(packageRoot)).toMatchObject({
      releaseManifestDigest: releaseManifestDigest(manifestText),
      sourceTreeObject: "c".repeat(40),
      packageVersion: "2026.7.19-b1.1",
      packageShape: "prototype-b-native-release-set-v1",
      predecessorReleaseManifestDigest: "1".repeat(64),
      requiredPluginIds: ["browser", "codex"],
      codexCapabilityDigest: "a".repeat(64),
    });
  });

  it("fails closed for tampered, missing, symlinked, or version-inconsistent manifests", () => {
    const tampered = writePackageFixture();
    fs.appendFileSync(path.join(tampered.packageRoot, "release-manifest.json"), "\n");
    expect(() => loadEmbeddedReleaseManifest(tampered.packageRoot)).toThrow("digest mismatch");

    const missing = writePackageFixture();
    fs.rmSync(path.join(missing.packageRoot, "release-manifest.json"));
    expect(() => loadEmbeddedReleaseManifest(missing.packageRoot)).toThrow("is unavailable");

    const symlinked = writePackageFixture();
    const target = path.join(symlinked.packageRoot, "manifest-target.json");
    fs.renameSync(path.join(symlinked.packageRoot, "release-manifest.json"), target);
    fs.symlinkSync(target, path.join(symlinked.packageRoot, "release-manifest.json"));
    expect(() => loadEmbeddedReleaseManifest(symlinked.packageRoot)).toThrow(
      "regular non-symlink file",
    );

    const wrongVersion = writePackageFixture();
    const packageJsonPath = path.join(wrongVersion.packageRoot, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    packageJson.version = "2026.7.19-b1.2";
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson));
    expect(() => loadEmbeddedReleaseManifest(wrongVersion.packageRoot)).toThrow(
      "release package version mismatch",
    );
  });
});
