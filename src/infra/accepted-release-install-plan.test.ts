import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";
import { describe, expect, it } from "vitest";
import type { ReleaseArtifact } from "../release-manifest.js";
import { withTempDir } from "../test-helpers/temp-dir.js";
import {
  verifyAcceptedReleaseArtifactInstallPlan,
  verifyInstalledAcceptedPackagePlan,
  verifyInstalledAcceptedPluginPlan,
} from "./accepted-release-install-plan.js";
import type { AcceptedReleaseArtifact } from "./accepted-release-receipt.js";

const REGISTRY = "https://registry.example.test/";
const PACKAGE_NAME = "@openclaw/codex";
const PACKAGE_VERSION = "2.0.0";
const DEPENDENCY_PATH = "node_modules/exact-dependency";
const DEPENDENCY_VERSION = "1.2.3";
const DEPENDENCY_RESOLVED = `${REGISTRY}exact-dependency/-/exact-dependency-${DEPENDENCY_VERSION}.tgz`;
const DEPENDENCY_INTEGRITY = `sha512-${Buffer.alloc(64, 7).toString("base64")}`;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function createAcceptedLock(): Record<string, unknown> {
  return {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: PACKAGE_NAME,
        version: PACKAGE_VERSION,
      },
      [DEPENDENCY_PATH]: {
        version: DEPENDENCY_VERSION,
        resolved: DEPENDENCY_RESOLVED,
        integrity: DEPENDENCY_INTEGRITY,
      },
    },
  };
}

function createArtifact(lockBytes: Buffer): ReleaseArtifact {
  const projection = `${DEPENDENCY_PATH}\t${DEPENDENCY_VERSION}\t${DEPENDENCY_RESOLVED}\t${DEPENDENCY_INTEGRITY}\n`;
  return {
    role: "plugin",
    packageName: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    compatibilityRange: ">=2.0.0",
    ownedPluginIds: ["codex"],
    installPlan: {
      registry: REGISTRY,
      lockSha256: sha256(lockBytes),
      resolvedObjectSetSha256: sha256(projection),
      resolvedObjectCount: 1,
    },
  };
}

async function createAcceptedArchive(root: string): Promise<{
  archivePath: string;
  lockBytes: Buffer;
}> {
  const packageRoot = path.join(root, "source", "package");
  await fs.mkdir(packageRoot, { recursive: true });
  const lockBytes = Buffer.from(JSON.stringify(createAcceptedLock()), "utf8");
  await Promise.all([
    fs.writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: PACKAGE_NAME,
        version: PACKAGE_VERSION,
        openclaw: { extensions: ["index.js"] },
      }),
    ),
    fs.writeFile(path.join(packageRoot, "npm-shrinkwrap.json"), lockBytes),
    fs.writeFile(
      path.join(packageRoot, "openclaw.plugin.json"),
      JSON.stringify({ id: "codex", configSchema: { type: "object" } }),
    ),
    fs.writeFile(path.join(packageRoot, "index.js"), "export default {};\n"),
  ]);
  const archivePath = path.join(root, "accepted.tgz");
  await tar.c({ cwd: path.join(root, "source"), file: archivePath, gzip: true }, ["package"]);
  return { archivePath, lockBytes };
}

function createReceiptArtifact(archivePath: string): AcceptedReleaseArtifact {
  return {
    role: "plugin",
    packageName: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    sha256: "a".repeat(64),
    npmIntegrityOrShasum: DEPENDENCY_INTEGRITY,
    packlistDigest: "b".repeat(64),
    byteSize: 1,
    contentAddressedLocation: "unused",
    fileName: path.basename(archivePath),
    filePath: archivePath,
  };
}

describe("accepted release install plans", () => {
  it("reproduces the accepted archive, installed core, and native plugin object set", async () => {
    await withTempDir({ prefix: "openclaw-accepted-plan-" }, async (root) => {
      const { archivePath, lockBytes } = await createAcceptedArchive(root);
      const artifact = createArtifact(lockBytes);

      await expect(
        verifyAcceptedReleaseArtifactInstallPlan({
          archivePath,
          receiptArtifact: createReceiptArtifact(archivePath),
          manifestArtifact: artifact,
        }),
      ).resolves.toEqual({
        lockSha256: artifact.installPlan.lockSha256,
        resolvedObjectSetSha256: artifact.installPlan.resolvedObjectSetSha256,
        resolvedObjectCount: artifact.installPlan.resolvedObjectCount,
        pluginPayloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        pluginManifestSha256: sha256(
          JSON.stringify({ id: "codex", configSchema: { type: "object" } }),
        ),
      });

      const installedPackageRoot = path.join(root, "installed-core");
      await fs.mkdir(installedPackageRoot, { recursive: true });
      await fs.writeFile(path.join(installedPackageRoot, "npm-shrinkwrap.json"), lockBytes);
      await expect(
        verifyInstalledAcceptedPackagePlan({
          packageRoot: installedPackageRoot,
          manifestArtifact: artifact,
        }),
      ).resolves.toEqual({
        lockSha256: artifact.installPlan.lockSha256,
        resolvedObjectSetSha256: artifact.installPlan.resolvedObjectSetSha256,
        resolvedObjectCount: artifact.installPlan.resolvedObjectCount,
      });

      const projectRoot = path.join(root, "managed-project");
      await fs.mkdir(projectRoot, { recursive: true });
      await fs.writeFile(
        path.join(projectRoot, "package-lock.json"),
        JSON.stringify({
          name: "openclaw-plugin-managed-root",
          version: "1.0.0",
          lockfileVersion: 3,
          packages: {
            "": { name: "openclaw-plugin-managed-root", version: "1.0.0" },
            [`node_modules/${PACKAGE_NAME}`]: {
              version: PACKAGE_VERSION,
              resolved: "file:_openclaw-pack-archives/codex.tgz",
            },
            [DEPENDENCY_PATH]: {
              version: DEPENDENCY_VERSION,
              resolved: DEPENDENCY_RESOLVED,
              integrity: DEPENDENCY_INTEGRITY,
            },
          },
        }),
      );
      await expect(
        verifyInstalledAcceptedPluginPlan({ projectRoot, manifestArtifact: artifact }),
      ).resolves.toBeUndefined();
    });
  });

  it("rejects an archive whose exact lock bytes are not the accepted plan", async () => {
    await withTempDir({ prefix: "openclaw-accepted-plan-drift-" }, async (root) => {
      const { archivePath, lockBytes } = await createAcceptedArchive(root);
      const artifact = createArtifact(lockBytes);
      artifact.installPlan.lockSha256 = "f".repeat(64);

      await expect(
        verifyAcceptedReleaseArtifactInstallPlan({
          archivePath,
          receiptArtifact: createReceiptArtifact(archivePath),
          manifestArtifact: artifact,
        }),
      ).rejects.toThrow("does not reproduce the accepted install plan");
    });
  });
});
