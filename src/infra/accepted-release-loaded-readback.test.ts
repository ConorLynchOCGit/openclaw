import path from "node:path";
import { describe, expect, it } from "vitest";
import { createReleaseManifestFixture } from "../../test/helpers/release-manifest-fixture.js";
import { resolvePluginNpmPackageDir } from "../plugins/install-paths.js";
import type { LoadedReleaseReadiness } from "../release-runtime-readiness.js";
import { assertAcceptedReleaseLoadedReadback } from "./accepted-release-loaded-readback.js";
import type { ResolvedAcceptedReleaseReceipt } from "./accepted-release-receipt.js";

function createResolvedReceipt(): ResolvedAcceptedReleaseReceipt {
  const releaseManifest = createReleaseManifestFixture();
  const coreArtifact = {
    role: "core",
    packageName: "openclaw",
    version: releaseManifest.package.version,
    sha256: "1".repeat(64),
    npmIntegrityOrShasum: `sha512-${Buffer.alloc(64, 1).toString("base64")}`,
    packlistDigest: "2".repeat(64),
    byteSize: 1,
    contentAddressedLocation: "artifacts/core",
    fileName: "openclaw.tgz",
    filePath: "/releases/openclaw.tgz",
  } as const;
  const pluginArtifact = {
    ...coreArtifact,
    role: "plugin",
    packageName: "@openclaw/codex",
    sha256: "3".repeat(64),
    contentAddressedLocation: "artifacts/codex",
    fileName: "codex.tgz",
    filePath: "/releases/codex.tgz",
  } as const;
  return {
    id: "4".repeat(64),
    releaseStoreRoot: "/releases",
    releaseManifest,
    releaseManifestPath: "/releases/manifest.json",
    coreArtifact,
    pluginArtifacts: [pluginArtifact],
    receipt: {
      receiptProtocolVersion: 1,
      releaseManifestDigest: "5".repeat(64),
      loadedPredecessorManifestDigest: releaseManifest.predecessor.releaseManifestDigest,
      loadedPredecessorSourceObject: releaseManifest.predecessor.sourceTreeObject,
      orderedArtifacts: [coreArtifact, pluginArtifact],
      candidateEvidenceRef: "evidence",
      candidateEvidenceDigest: "6".repeat(64),
      terminalVerdict: "accepted",
      authorizationClass: "preauthorized_migration_free",
      authorizationRef: { goalId: "goal-1" },
      nativeSnapshotRef: releaseManifest.source.snapshotRef,
      acceptedSourceTag: "accepted",
      acceptedSourceObject: releaseManifest.source.treeObject,
      createdAt: "2026-07-19T00:00:00.000Z",
      releasePreparationOperationId: "prepare-1",
    },
  };
}

function createReadiness(params: {
  resolved: ResolvedAcceptedReleaseReceipt;
  packageRoot: string;
  stateDir: string;
}): LoadedReleaseReadiness {
  const manifest = params.resolved.releaseManifest;
  return {
    ready: true,
    errors: [],
    identity: {
      releaseManifestDigest: params.resolved.receipt.releaseManifestDigest,
      sourceSnapshotRef: manifest.source.snapshotRef,
      sourceTreeObject: manifest.source.treeObject,
      packageVersion: manifest.package.version,
      packageShape: manifest.package.shape,
      predecessorReleaseManifestDigest: manifest.predecessor.releaseManifestDigest,
      predecessorSourceTreeObject: manifest.predecessor.sourceTreeObject,
      requiredPluginIds: [...manifest.loadedReadiness.requiredPluginIds],
      codexCapabilityDigest: manifest.codex.capabilityDigest,
    },
    pluginOrigins: [
      {
        pluginId: "browser",
        ownerPackageName: "openclaw",
        ownerPackageVersion: manifest.package.version,
        pluginPackageName: "@openclaw/browser-plugin",
        pluginPackageVersion: manifest.package.version,
        pluginManifestVersion: manifest.package.version,
        pluginManifestSha256: "7".repeat(64),
        compatibilityRange: manifest.artifacts[0]?.compatibilityRange ?? "",
        originKind: "bundled",
        installedRoot: path.join(params.packageRoot, "extensions", "browser"),
      },
      {
        pluginId: "codex",
        ownerPackageName: "@openclaw/codex",
        ownerPackageVersion: manifest.package.version,
        pluginPackageName: "@openclaw/codex",
        pluginPackageVersion: manifest.package.version,
        pluginManifestVersion: manifest.package.version,
        pluginManifestSha256: "8".repeat(64),
        compatibilityRange: manifest.artifacts[1]?.compatibilityRange ?? "",
        originKind: "global",
        installedRoot: resolvePluginNpmPackageDir({
          npmDir: path.join(params.stateDir, "npm"),
          packageName: "@openclaw/codex",
        }),
      },
    ],
  };
}

describe("accepted release loaded readback", () => {
  it("accepts the exact executing manifest and native plugin origins", () => {
    const resolved = createResolvedReceipt();
    const packageRoot = "/opt/openclaw/lib/node_modules/openclaw";
    const stateDir = "/var/lib/openclaw";
    expect(() =>
      assertAcceptedReleaseLoadedReadback({
        readiness: createReadiness({ resolved, packageRoot, stateDir }),
        resolvedReceipt: resolved,
        packageRoot,
        env: { OPENCLAW_STATE_DIR: stateDir },
      }),
    ).not.toThrow();
  });

  it("rejects a same-version plugin loaded from another global root", () => {
    const resolved = createResolvedReceipt();
    const packageRoot = "/opt/openclaw/lib/node_modules/openclaw";
    const stateDir = "/var/lib/openclaw";
    const readiness = createReadiness({ resolved, packageRoot, stateDir });
    const codex = readiness.pluginOrigins.find((origin) => origin.pluginId === "codex");
    if (!codex) {
      throw new Error("missing codex fixture");
    }
    codex.installedRoot = "/home/user/.openclaw/extensions/codex";

    expect(() =>
      assertAcceptedReleaseLoadedReadback({
        readiness,
        resolvedReceipt: resolved,
        packageRoot,
        env: { OPENCLAW_STATE_DIR: stateDir },
      }),
    ).toThrow("outside its accepted native root");
  });
});
