import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import { afterEach, describe, expect, it } from "vitest";
import { verifyReleasePackageInventory } from "../../scripts/verify-release-package-inventory.mjs";
import { releaseManifestDigest, serializeReleaseManifest } from "../../src/release-manifest.js";
import { createReleaseManifestFixture } from "../helpers/release-manifest-fixture.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function createPackageTarball(params: {
  name: string;
  version: string;
  pluginIds: string[];
  compatibilityRange?: string;
  manifestBytes?: Buffer;
  nestedManifestBytes?: Buffer;
  symlink?: boolean;
  hiddenPluginId?: string;
  outsideRootFile?: boolean;
}): Promise<string> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-release-package-"));
  tempDirs.push(root);
  const packageRoot = path.join(root, "package");
  fs.mkdirSync(packageRoot, { recursive: true });

  const packageJson: Record<string, unknown> = {
    name: params.name,
    version: params.version,
  };
  if (params.name === "openclaw") {
    packageJson.openclaw = {
      release: {
        packageShape: "prototype-b-native-release-set-v1",
        manifestPath: "release-manifest.json",
        manifestSha256: releaseManifestDigest(params.manifestBytes!),
      },
    };
  } else {
    packageJson.openclaw = {
      compat: { pluginApi: params.compatibilityRange },
    };
  }
  writeJson(path.join(packageRoot, "package.json"), packageJson);

  for (const [index, pluginId] of params.pluginIds.entries()) {
    const manifestPath =
      index === 0 && params.name !== "openclaw"
        ? path.join(packageRoot, "openclaw.plugin.json")
        : path.join(packageRoot, "dist", "extensions", pluginId, "openclaw.plugin.json");
    writeJson(manifestPath, { id: pluginId, configSchema: { type: "object" } });
  }
  if (params.manifestBytes) {
    fs.writeFileSync(path.join(packageRoot, "release-manifest.json"), params.manifestBytes);
  }
  if (params.nestedManifestBytes) {
    const nestedPath = path.join(packageRoot, "dist", "release-manifest.json");
    fs.mkdirSync(path.dirname(nestedPath), { recursive: true });
    fs.writeFileSync(nestedPath, params.nestedManifestBytes);
  }
  if (params.symlink) {
    fs.symlinkSync("package.json", path.join(packageRoot, "package-link.json"));
  }
  if (params.hiddenPluginId) {
    writeJson(path.join(packageRoot, "assets", "hidden", "openclaw.plugin.json"), {
      id: params.hiddenPluginId,
    });
  }
  if (params.outsideRootFile) {
    fs.writeFileSync(path.join(root, "outside.txt"), "outside npm package root\n");
  }

  const tarballPath = path.join(root, `${params.name.replaceAll("/", "-")}.tgz`);
  await tar.c(
    { cwd: root, file: tarballPath, gzip: true, portable: true },
    params.outsideRootFile ? ["package", "outside.txt"] : ["package"],
  );
  return tarballPath;
}

async function createAcceptedPackageSet(params?: {
  pluginIds?: string[];
  compatibilityRange?: string;
  pluginNestedManifest?: boolean;
  pluginSymlink?: boolean;
  hiddenPluginId?: string;
  outsideRootFile?: boolean;
}): Promise<{ manifestBytes: Buffer; artifactPaths: string[] }> {
  const manifestBytes = Buffer.from(
    serializeReleaseManifest(createReleaseManifestFixture()),
    "utf8",
  );
  const rootTarball = await createPackageTarball({
    name: "openclaw",
    version: "2026.7.19-b1.1",
    pluginIds: ["browser"],
    manifestBytes,
  });
  const pluginTarball = await createPackageTarball({
    name: "@openclaw/codex",
    version: "2026.7.19-b1.1",
    pluginIds: params?.pluginIds ?? ["codex", "dormant-codex-helper"],
    compatibilityRange: params?.compatibilityRange ?? ">=2026.7.19-b1.1",
    nestedManifestBytes: params?.pluginNestedManifest ? manifestBytes : undefined,
    symlink: params?.pluginSymlink,
    hiddenPluginId: params?.hiddenPluginId,
    outsideRootFile: params?.outsideRootFile,
  });
  return { manifestBytes, artifactPaths: [rootTarball, pluginTarball] };
}

describe("release package inventory verification", () => {
  it("binds the exact root and plugin tarball inventory to stored manifest bytes", async () => {
    const packageSet = await createAcceptedPackageSet();

    const result = await verifyReleasePackageInventory(packageSet);

    expect(result).toMatchObject([
      {
        role: "core",
        packageName: "openclaw",
        packageVersion: "2026.7.19-b1.1",
        pluginManifestDigests: [{ pluginId: "browser" }],
      },
      {
        role: "plugin",
        packageName: "@openclaw/codex",
        packageVersion: "2026.7.19-b1.1",
        pluginManifestDigests: [{ pluginId: "codex" }, { pluginId: "dormant-codex-helper" }],
      },
    ]);
    expect(result.every((entry) => /^[a-f0-9]{64}$/u.test(entry.artifactSha256))).toBe(true);
    expect(result.every((entry) => entry.npmIntegrity.startsWith("sha512-"))).toBe(true);
  });

  it("rejects missing ownership, compatibility drift, and a second embedded manifest", async () => {
    await expect(
      verifyReleasePackageInventory(await createAcceptedPackageSet({ pluginIds: ["codex"] })),
    ).rejects.toThrow("owned plugin ids mismatch");

    await expect(
      verifyReleasePackageInventory(
        await createAcceptedPackageSet({ compatibilityRange: ">=2026.7.20" }),
      ),
    ).rejects.toThrow("compatibility mismatch");

    await expect(
      verifyReleasePackageInventory(await createAcceptedPackageSet({ pluginNestedManifest: true })),
    ).rejects.toThrow("must not embed a second release manifest");

    await expect(
      verifyReleasePackageInventory(await createAcceptedPackageSet({ pluginSymlink: true })),
    ).rejects.toThrow("unsupported SymbolicLink entry");

    await expect(
      verifyReleasePackageInventory(
        await createAcceptedPackageSet({ hiddenPluginId: "unaccepted-hidden" }),
      ),
    ).rejects.toThrow("owned plugin ids mismatch");

    await expect(
      verifyReleasePackageInventory(await createAcceptedPackageSet({ outsideRootFile: true })),
    ).rejects.toThrow("unsafe package tar entry outside.txt");
  });
});
