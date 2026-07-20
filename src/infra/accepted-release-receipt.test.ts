// Covers immutable accepted-receipt resolution and package manifest CAS.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROTOTYPE_B_PACKAGE_SHAPE,
  releaseManifestDigest,
  serializeReleaseManifest,
  type ReleaseManifest,
} from "../release-manifest.js";
import { withTempDir } from "../test-helpers/temp-dir.js";
import {
  assertAcceptedReleaseCandidate,
  assertAcceptedReleaseCandidateIsDistinct,
  assertAcceptedReleasePredecessor,
  copyAcceptedReleaseArtifactToStage,
  resolveAcceptedReleaseReceipt,
} from "./accepted-release-receipt.js";

const PREDECESSOR_MANIFEST_DIGEST = "1".repeat(64);
const PREDECESSOR_SOURCE_OBJECT = "2".repeat(40);
const CANDIDATE_SOURCE_OBJECT = "3".repeat(40);

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function createManifest(params?: {
  sourceTreeObject?: string;
  predecessorManifestDigest?: string;
  predecessorSourceObject?: string;
  version?: string;
  migrationClass?: ReleaseManifest["migration"]["class"];
}): ReleaseManifest {
  return {
    releaseProtocolVersion: 1,
    source: {
      snapshotRef: "refs/openclaw/snapshots/candidate",
      treeObject: params?.sourceTreeObject ?? CANDIDATE_SOURCE_OBJECT,
    },
    predecessor: {
      releaseManifestDigest: params?.predecessorManifestDigest ?? PREDECESSOR_MANIFEST_DIGEST,
      sourceTreeObject: params?.predecessorSourceObject ?? PREDECESSOR_SOURCE_OBJECT,
    },
    package: {
      version: params?.version ?? "2026.7.19-b3.1",
      shape: PROTOTYPE_B_PACKAGE_SHAPE,
      buildInputDigest: "4".repeat(64),
      toolchainDigest: "5".repeat(64),
      lockfileDigest: "6".repeat(64),
    },
    artifacts: [
      {
        role: "core",
        packageName: "openclaw",
        packageVersion: params?.version ?? "2026.7.19-b3.1",
        compatibilityRange: ">=2026.7.0",
        ownedPluginIds: [],
        installPlan: {
          registry: "https://registry.npmjs.org/",
          lockSha256: "7".repeat(64),
          resolvedObjectSetSha256: "8".repeat(64),
          resolvedObjectCount: 1,
        },
      },
    ],
    codex: {
      profileDigest: "9".repeat(64),
      capabilityDigest: "a".repeat(64),
      contributorGuidanceDigest: "b".repeat(64),
    },
    migration: {
      class: params?.migrationClass ?? "migration_free",
      affectedPersistentRoots: [],
    },
    compatibility: {
      config: ">=1",
      schema: ">=1",
      plugin: ">=1",
      support: ">=1",
      host: ">=1",
    },
    loadedReadiness: {
      contractVersion: 1,
      requiredPluginIds: [],
      requireExactPackageOrigins: true,
    },
  };
}

async function writeEmbeddedManifestPackage(params: {
  packageRoot: string;
  manifest: ReleaseManifest;
}): Promise<void> {
  const manifestBytes = serializeReleaseManifest(params.manifest);
  const manifestSha256 = releaseManifestDigest(manifestBytes);
  await fs.mkdir(params.packageRoot, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(params.packageRoot, "release-manifest.json"), manifestBytes, "utf8"),
    fs.writeFile(
      path.join(params.packageRoot, "package.json"),
      `${JSON.stringify({
        name: "openclaw",
        version: params.manifest.package.version,
        openclaw: {
          release: {
            packageShape: PROTOTYPE_B_PACKAGE_SHAPE,
            manifestPath: "release-manifest.json",
            manifestSha256,
          },
        },
      })}\n`,
      "utf8",
    ),
  ]);
}

async function writeAcceptedReleaseStore(root: string, manifest = createManifest()) {
  const manifestBytes = serializeReleaseManifest(manifest);
  const manifestDigest = releaseManifestDigest(manifestBytes);
  const artifactBytes = Buffer.from("accepted core package\n", "utf8");
  const artifactDigest = sha256(artifactBytes);
  const artifactRelativePath = path.join(
    "artifacts",
    "sha256",
    artifactDigest,
    "openclaw-2026.7.19-b3.1.tgz",
  );
  const manifestPath = path.join(root, "manifests", "sha256", `${manifestDigest}.json`);
  const artifactPath = path.join(root, artifactRelativePath);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(manifestPath, manifestBytes, { mode: 0o444 });
  await fs.writeFile(artifactPath, artifactBytes, { mode: 0o444 });

  const receipt = {
    receiptProtocolVersion: 1,
    releaseManifestDigest: manifestDigest,
    loadedPredecessorManifestDigest: manifest.predecessor.releaseManifestDigest,
    loadedPredecessorSourceObject: manifest.predecessor.sourceTreeObject,
    orderedArtifacts: [
      {
        role: "core",
        packageName: "openclaw",
        version: manifest.package.version,
        sha256: artifactDigest,
        npmIntegrityOrShasum: "sha512-test",
        packlistDigest: "c".repeat(64),
        byteSize: artifactBytes.byteLength,
        contentAddressedLocation: artifactRelativePath,
      },
    ],
    candidateEvidenceRef: "evidence/candidate.json",
    candidateEvidenceDigest: "d".repeat(64),
    terminalVerdict: "accepted",
    authorizationClass: "preauthorized_migration_free",
    authorizationRef: { goalId: "goal-1", operatorAuthorizationId: "auth-1" },
    nativeSnapshotRef: "refs/openclaw/snapshots/candidate",
    acceptedSourceTag: "refs/tags/openclaw-release/test",
    acceptedSourceObject: manifest.source.treeObject,
    createdAt: "2026-07-19T12:00:00.000Z",
    releasePreparationOperationId: "release-prepare-1",
  };
  const receiptBytes = `${JSON.stringify(receipt)}\n`;
  const receiptId = sha256(receiptBytes);
  const receiptPath = path.join(root, "receipts", "sha256", `${receiptId}.json`);
  await fs.mkdir(path.dirname(receiptPath), { recursive: true });
  await fs.writeFile(receiptPath, receiptBytes, { mode: 0o444 });
  return { artifactPath, manifest, receiptId, receiptPath };
}

describe("accepted release receipt", () => {
  it("resolves an exact immutable receipt and manifest to content-addressed artifacts", async () => {
    await withTempDir({ prefix: "openclaw-accepted-receipt-" }, async (root) => {
      const fixture = await writeAcceptedReleaseStore(root);
      const resolved = await resolveAcceptedReleaseReceipt({
        acceptedReleaseReceiptId: fixture.receiptId,
        releaseStoreRoot: root,
      });

      expect(resolved.id).toBe(fixture.receiptId);
      expect(resolved.coreArtifact.filePath).toBe(fixture.artifactPath);
      expect(resolved.releaseManifest.migration.class).toBe("migration_free");
      expect(resolved.pluginArtifacts).toEqual([]);
    });
  });

  it("rejects same-path artifact substitution", async () => {
    await withTempDir({ prefix: "openclaw-accepted-receipt-drift-" }, async (root) => {
      const fixture = await writeAcceptedReleaseStore(root);
      await fs.chmod(fixture.artifactPath, 0o644);
      await fs.writeFile(fixture.artifactPath, "substituted package!!\n", "utf8");
      await fs.chmod(fixture.artifactPath, 0o444);

      const resolved = await resolveAcceptedReleaseReceipt({
        acceptedReleaseReceiptId: fixture.receiptId,
        releaseStoreRoot: root,
      });
      await expect(
        copyAcceptedReleaseArtifactToStage({
          artifact: resolved.coreArtifact,
          releaseStoreRoot: root,
          stageRoot: path.join(root, "install-stage"),
        }),
      ).rejects.toThrow(/byte size|SHA-256|changed before staging/u);
    });
  });

  it("rejects a migration-bearing manifest", async () => {
    await withTempDir({ prefix: "openclaw-accepted-receipt-migration-" }, async (root) => {
      const fixture = await writeAcceptedReleaseStore(
        root,
        createManifest({ migrationClass: "migration_bearing" }),
      );
      await expect(
        resolveAcceptedReleaseReceipt({
          acceptedReleaseReceiptId: fixture.receiptId,
          releaseStoreRoot: root,
        }),
      ).rejects.toThrow("not migration_free");
    });
  });

  it("rejects an absolute artifact location even when it remains inside the release store", async () => {
    await withTempDir({ prefix: "openclaw-accepted-receipt-absolute-path-" }, async (root) => {
      const fixture = await writeAcceptedReleaseStore(root);
      const receipt = JSON.parse(await fs.readFile(fixture.receiptPath, "utf8")) as {
        orderedArtifacts: Array<{ contentAddressedLocation: string }>;
      };
      const artifact = receipt.orderedArtifacts[0];
      if (!artifact) {
        throw new Error("fixture is missing its core artifact");
      }
      artifact.contentAddressedLocation = fixture.artifactPath;
      const receiptBytes = `${JSON.stringify(receipt)}\n`;
      const receiptId = sha256(receiptBytes);
      const receiptPath = path.join(root, "receipts", "sha256", `${receiptId}.json`);
      await fs.writeFile(receiptPath, receiptBytes, { mode: 0o444 });

      await expect(
        resolveAcceptedReleaseReceipt({
          acceptedReleaseReceiptId: receiptId,
          releaseStoreRoot: root,
        }),
      ).rejects.toThrow("invalid content-addressed location");
    });
  });

  it("compares predecessor and candidate package manifests by exact digest and source object", async () => {
    await withTempDir({ prefix: "openclaw-accepted-receipt-cas-" }, async (root) => {
      const fixture = await writeAcceptedReleaseStore(root);
      const resolved = await resolveAcceptedReleaseReceipt({
        acceptedReleaseReceiptId: fixture.receiptId,
        releaseStoreRoot: root,
      });
      const predecessorRoot = path.join(root, "installed-predecessor");
      const candidateRoot = path.join(root, "installed-candidate");
      const predecessorManifest = createManifest({
        sourceTreeObject: PREDECESSOR_SOURCE_OBJECT,
        version: "2026.7.18-b2.1",
      });
      await writeEmbeddedManifestPackage({
        packageRoot: predecessorRoot,
        manifest: predecessorManifest,
      });
      await writeEmbeddedManifestPackage({
        packageRoot: candidateRoot,
        manifest: fixture.manifest,
      });

      resolved.receipt.loadedPredecessorManifestDigest = releaseManifestDigest(
        serializeReleaseManifest(predecessorManifest),
      );
      await expect(
        assertAcceptedReleasePredecessor({
          packageRoot: predecessorRoot,
          receipt: resolved.receipt,
        }),
      ).resolves.toBeUndefined();
      await expect(
        assertAcceptedReleaseCandidate({ packageRoot: candidateRoot, resolvedReceipt: resolved }),
      ).resolves.toBeUndefined();
      expect(() =>
        assertAcceptedReleaseCandidateIsDistinct({
          predecessorManifest,
          resolvedReceipt: resolved,
        }),
      ).not.toThrow();

      expect(() =>
        assertAcceptedReleaseCandidateIsDistinct({
          predecessorManifest: createManifest({ version: fixture.manifest.package.version }),
          resolvedReceipt: resolved,
        }),
      ).toThrow("reuses the predecessor package version");

      resolved.receipt.loadedPredecessorSourceObject = "f".repeat(40);
      await expect(
        assertAcceptedReleasePredecessor({
          packageRoot: predecessorRoot,
          receipt: resolved.receipt,
        }),
      ).rejects.toThrow("no longer matches");
    });
  });
});
