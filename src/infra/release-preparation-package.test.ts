import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  releaseManifestDigest,
  serializeReleaseManifest,
  type ReleaseManifest,
} from "../release-manifest.js";
import type { ResolvedAcceptedReleaseReceipt } from "./accepted-release-receipt.js";
import type { ReleasePreparationAuthority } from "./release-preparation-authority.js";
import { prepareAcceptedReleaseFromSnapshot } from "./release-preparation-package.js";
import type { PreparedReleaseWorktree } from "./release-preparation-worktree.js";

const roots: string[] = [];
const PREDECESSOR_DIGEST = "1".repeat(64);
const PREDECESSOR_TREE = "2".repeat(40);
const SNAPSHOT_TREE = "3".repeat(40);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function createManifest(params: {
  version: string;
  sourceTree: string;
  predecessorDigest: string;
  predecessorTree: string;
  pluginIds?: string[];
  pluginVersion?: string;
}): ReleaseManifest {
  const pluginIds = params.pluginIds ?? ["codex"];
  const pluginVersion = params.pluginVersion ?? params.version;
  return {
    releaseProtocolVersion: 1,
    source: {
      snapshotRef: "refs/openclaw/snapshots/system-change",
      treeObject: params.sourceTree,
    },
    predecessor: {
      releaseManifestDigest: params.predecessorDigest,
      sourceTreeObject: params.predecessorTree,
    },
    package: {
      version: params.version,
      shape: "prototype-b-native-release-set-v1",
      buildInputDigest: "4".repeat(64),
      toolchainDigest: "5".repeat(64),
      lockfileDigest: "6".repeat(64),
    },
    artifacts: [
      {
        role: "core",
        packageName: "openclaw",
        packageVersion: params.version,
        compatibilityRange: ">=2026.7.1",
        ownedPluginIds: [],
        installPlan: {
          registry: "https://registry.npmjs.org/",
          lockSha256: "7".repeat(64),
          resolvedObjectSetSha256: "8".repeat(64),
          resolvedObjectCount: 1,
        },
      },
      {
        role: "plugin",
        packageName: "@openclaw/codex",
        packageVersion: pluginVersion,
        compatibilityRange: `>=${pluginVersion}`,
        ownedPluginIds: pluginIds,
        installPlan: {
          registry: "https://registry.npmjs.org/",
          lockSha256: "9".repeat(64),
          resolvedObjectSetSha256: "a".repeat(64),
          resolvedObjectCount: 2,
        },
      },
    ],
    codex: {
      profileDigest: "b".repeat(64),
      capabilityDigest: "c".repeat(64),
      contributorGuidanceDigest: "d".repeat(64),
    },
    migration: { class: "migration_free", affectedPersistentRoots: [] },
    compatibility: {
      config: "1",
      schema: "1",
      plugin: "1",
      support: "1",
      host: "1",
    },
    loadedReadiness: {
      contractVersion: 1,
      requiredPluginIds: pluginIds,
      requireExactPackageOrigins: true,
    },
  };
}

function createPredecessor(): ResolvedAcceptedReleaseReceipt {
  const manifest = createManifest({
    version: "2026.7.1-openclaw-next.predecessor",
    sourceTree: PREDECESSOR_TREE,
    predecessorDigest: "e".repeat(64),
    predecessorTree: "f".repeat(40),
  });
  return {
    id: "0".repeat(64),
    releaseStoreRoot: "/releases",
    receipt: {
      receiptProtocolVersion: 1,
      releaseManifestDigest: PREDECESSOR_DIGEST,
      loadedPredecessorManifestDigest: manifest.predecessor.releaseManifestDigest,
      loadedPredecessorSourceObject: manifest.predecessor.sourceTreeObject,
      orderedArtifacts: [
        {
          role: "core",
          packageName: "openclaw",
          version: manifest.package.version,
          sha256: "1".repeat(64),
          npmIntegrityOrShasum: "sha512-core",
          packlistDigest: "2".repeat(64),
          byteSize: 10,
          contentAddressedLocation: "artifacts/sha256/core/openclaw.tgz",
          fileName: "openclaw.tgz",
          filePath: "/releases/openclaw.tgz",
        },
        {
          role: "plugin",
          packageName: "@openclaw/codex",
          version: manifest.package.version,
          sha256: "3".repeat(64),
          npmIntegrityOrShasum: "sha512-codex",
          packlistDigest: "4".repeat(64),
          byteSize: 20,
          contentAddressedLocation: "artifacts/sha256/codex/codex.tgz",
          fileName: "codex.tgz",
          filePath: "/releases/codex.tgz",
        },
      ],
      candidateEvidenceRef: "evidence.json",
      candidateEvidenceDigest: "5".repeat(64),
      terminalVerdict: "accepted",
      authorizationClass: "preauthorized_migration_free",
      authorizationRef: { taskId: "old" },
      nativeSnapshotRef: manifest.source.snapshotRef,
      acceptedSourceTag: "old-tag",
      acceptedSourceObject: PREDECESSOR_TREE,
      createdAt: "2026-07-20T00:00:00.000Z",
      releasePreparationOperationId: "old-operation",
    },
    releaseManifest: manifest,
    releaseManifestPath: "/releases/manifest.json",
    coreArtifact: undefined as never,
    pluginArtifacts: [],
  };
}

function createAuthority(): ReleasePreparationAuthority {
  return {
    task: {
      taskId: "coding-task",
      runtime: "cli",
      requesterSessionKey: "agent:main:main",
      ownerKey: "agent:main:main",
      scopeKind: "session",
      childSessionKey: "agent:coding:subagent:one",
      agentId: "coding",
      task: "Implement the release",
      status: "succeeded",
      deliveryStatus: "delivered",
      notifyPolicy: "silent",
      createdAt: 1,
      sourceId: "goal-native-release",
    },
    childSessionKey: "agent:coding:subagent:one",
    sessionEntry: {} as never,
    worktree: {
      id: "worktree-one",
      name: "system-change",
      repoFingerprint: "source-anchor",
      repoRoot: "/source-anchor",
      path: "/worktree",
      branch: "worktree-one",
      baseRef: "base",
      ownerKind: "session",
      ownerId: "agent:coding:subagent:one",
      createdAt: 1,
      lastActiveAt: 1,
    },
    packageRoot: "/package",
    loadedRelease: {
      releaseManifestDigest: PREDECESSOR_DIGEST,
      sourceSnapshotRef: "old-snapshot",
      sourceTreeObject: PREDECESSOR_TREE,
      packageVersion: "2026.7.1-openclaw-next.predecessor",
      packageShape: "prototype-b-native-release-set-v1",
      predecessorReleaseManifestDigest: "e".repeat(64),
      predecessorSourceTreeObject: "f".repeat(40),
      requiredPluginIds: ["codex"],
      codexCapabilityDigest: "c".repeat(64),
    },
  };
}

const preparedWorktree: PreparedReleaseWorktree = {
  worktreeId: "worktree-one",
  nativeSnapshotRef: "refs/openclaw/snapshots/system-change",
  sourceTreeObject: SNAPSHOT_TREE,
  pathSetDigest: "6".repeat(64),
  changedPaths: [],
  secretScan: {
    scanner: "gitleaks",
    scannerVersion: "8.0.0",
    policyDigest: "7".repeat(64),
    verdict: "clean",
  },
};

async function createHarness(pluginIds?: string[], pluginVersion?: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-package-test-"));
  roots.push(root);
  const operationRoot = path.join(root, "operations", "operation");
  const releaseStoreRoot = path.join(root, "releases");
  const buildRoot = path.join(operationRoot, "build");
  await fs.mkdir(buildRoot, { recursive: true });
  await fs.mkdir(releaseStoreRoot, { recursive: true });
  const manifest = createManifest({
    version: "2026.7.1-openclaw-next.candidate",
    sourceTree: SNAPSHOT_TREE,
    predecessorDigest: PREDECESSOR_DIGEST,
    predecessorTree: PREDECESSOR_TREE,
    pluginIds,
    pluginVersion,
  });
  const manifestBytes = Buffer.from(serializeReleaseManifest(manifest), "utf8");
  const manifestPath = path.join(buildRoot, "release-manifest.json");
  const corePath = path.join(buildRoot, "openclaw.tgz");
  const pluginPath = path.join(buildRoot, "codex.tgz");
  await fs.writeFile(manifestPath, manifestBytes);
  await fs.writeFile(corePath, "core");
  await fs.writeFile(pluginPath, "plugin");
  return {
    operationRoot,
    releaseStoreRoot,
    manifest,
    manifestBytes,
    manifestPath,
    corePath,
    pluginPath,
  };
}

describe("prepareAcceptedReleaseFromSnapshot", () => {
  it("returns the loaded accepted release for an unchanged source tree without running the driver", async () => {
    const predecessor = createPredecessor();
    const authority = createAuthority();
    const runDriver = vi.fn();
    const result = await prepareAcceptedReleaseFromSnapshot(
      {
        authority,
        preparedWorktree: {
          ...preparedWorktree,
          sourceTreeObject: authority.loadedRelease.sourceTreeObject,
        },
        operationId: "8".repeat(64),
        operationRoot: "/unused-operation",
        releaseStoreRoot: "/releases",
        env: {},
      },
      {
        resolvePredecessor: async () => predecessor,
        runDriver,
      },
    );

    expect(result).toEqual({
      acceptedReleaseReceiptId: predecessor.id,
      candidateEvidenceRef: predecessor.receipt.candidateEvidenceRef,
      candidateEvidenceDigest: predecessor.receipt.candidateEvidenceDigest,
    });
    expect(runDriver).not.toHaveBeenCalled();
  });

  it("binds native package evidence into one immutable accepted receipt", async () => {
    const harness = await createHarness();
    const publishedMetadata: Array<{ namespace: string; bytes: Buffer }> = [];
    const result = await prepareAcceptedReleaseFromSnapshot(
      {
        authority: createAuthority(),
        preparedWorktree,
        operationId: "8".repeat(64),
        operationRoot: harness.operationRoot,
        releaseStoreRoot: harness.releaseStoreRoot,
        env: {},
      },
      {
        resolvePredecessor: async () => createPredecessor(),
        runDriver: async () => ({
          schema: "openclaw.release.prepare.driver-result.v1",
          manifestPath: harness.manifestPath,
          artifacts: [
            {
              role: "core",
              packageName: "openclaw",
              artifactPath: harness.corePath,
              disposition: "built",
            },
            {
              role: "plugin",
              packageName: "@openclaw/codex",
              artifactPath: harness.pluginPath,
              disposition: "built",
            },
          ],
          checks: [{ id: "native-package-acceptance", status: "passed" }],
        }),
        verifyInventory: async () => [
          {
            role: "core",
            packageName: "openclaw",
            packageVersion: harness.manifest.package.version,
            artifactSha256: sha256(Buffer.from("core")),
            npmIntegrity: "sha512-core",
            npmShasum: "core-sha1",
            packedBytes: 4,
            packlistSha256: "9".repeat(64),
          },
          {
            role: "plugin",
            packageName: "@openclaw/codex",
            packageVersion: harness.manifest.package.version,
            artifactSha256: sha256(Buffer.from("plugin")),
            npmIntegrity: "sha512-plugin",
            npmShasum: "plugin-sha1",
            packedBytes: 6,
            packlistSha256: "a".repeat(64),
          },
        ],
        publishArtifact: async ({ sourcePath }) => {
          const bytes = await fs.readFile(sourcePath);
          const digest = sha256(bytes);
          return {
            sha256: digest,
            byteSize: bytes.length,
            relativePath: `artifacts/sha256/${digest}/${path.basename(sourcePath)}`,
            filePath: sourcePath,
          };
        },
        publishMetadata: async ({ namespace, bytes }) => {
          const buffer = Buffer.from(bytes);
          publishedMetadata.push({ namespace, bytes: buffer });
          const digest = sha256(buffer);
          return {
            sha256: digest,
            byteSize: buffer.length,
            relativePath: `${namespace}/sha256/${digest}.json`,
            filePath: path.join(harness.releaseStoreRoot, `${digest}.json`),
          };
        },
        createAcceptedTag: async () => "openclaw-next-release/candidate",
        now: () => new Date("2026-07-20T12:00:00.000Z"),
      },
    );

    expect(result.candidateEvidenceRef).toContain("operations/operation/candidate-evidence.json");
    expect(publishedMetadata.map((entry) => entry.namespace)).toEqual(["manifests", "receipts"]);
    const receipt = JSON.parse(publishedMetadata[1]!.bytes.toString("utf8"));
    expect(receipt).toMatchObject({
      releaseManifestDigest: releaseManifestDigest(harness.manifestBytes),
      loadedPredecessorManifestDigest: PREDECESSOR_DIGEST,
      acceptedSourceObject: SNAPSHOT_TREE,
      terminalVerdict: "accepted",
      authorizationRef: { codingTaskId: "coding-task", sourceId: "goal-native-release" },
    });
    expect(receipt.orderedArtifacts).toHaveLength(2);
    expect(result.acceptedReleaseReceiptId).toBe(sha256(publishedMetadata[1]!.bytes));
  });

  it("reuses an accepted predecessor artifact without copying or republishing it", async () => {
    const predecessor = createPredecessor();
    const predecessorPlugin = predecessor.receipt.orderedArtifacts[1]!;
    const harness = await createHarness(undefined, predecessorPlugin.version);
    const predecessorPluginPath = path.join(
      harness.releaseStoreRoot,
      "artifacts",
      "sha256",
      predecessorPlugin.sha256,
      predecessorPlugin.fileName,
    );
    await fs.mkdir(path.dirname(predecessorPluginPath), { recursive: true });
    await fs.writeFile(predecessorPluginPath, "predecessor-plugin");
    predecessorPlugin.filePath = predecessorPluginPath;
    predecessorPlugin.byteSize = Buffer.byteLength("predecessor-plugin");
    const publishArtifactCalls: string[] = [];
    const publishedMetadata: Array<{ namespace: string; bytes: Buffer }> = [];

    await prepareAcceptedReleaseFromSnapshot(
      {
        authority: createAuthority(),
        preparedWorktree,
        operationId: "8".repeat(64),
        operationRoot: harness.operationRoot,
        releaseStoreRoot: harness.releaseStoreRoot,
        env: {},
      },
      {
        resolvePredecessor: async () => predecessor,
        runDriver: async () => ({
          schema: "openclaw.release.prepare.driver-result.v1",
          manifestPath: harness.manifestPath,
          artifacts: [
            {
              role: "core",
              packageName: "openclaw",
              artifactPath: harness.corePath,
              disposition: "built",
            },
            {
              role: "plugin",
              packageName: "@openclaw/codex",
              artifactPath: predecessorPluginPath,
              disposition: "reused",
            },
          ],
          checks: [{ id: "native-package-acceptance", status: "passed" }],
        }),
        verifyInventory: async () => [
          {
            role: "core",
            packageName: "openclaw",
            packageVersion: harness.manifest.package.version,
            artifactSha256: sha256(Buffer.from("core")),
            npmIntegrity: "sha512-core",
            npmShasum: "core-sha1",
            packedBytes: 4,
            packlistSha256: "9".repeat(64),
          },
          {
            role: "plugin",
            packageName: "@openclaw/codex",
            packageVersion: predecessorPlugin.version,
            artifactSha256: predecessorPlugin.sha256,
            npmIntegrity: predecessorPlugin.npmIntegrityOrShasum,
            npmShasum: "plugin-sha1",
            packedBytes: predecessorPlugin.byteSize,
            packlistSha256: predecessorPlugin.packlistDigest,
          },
        ],
        publishArtifact: async ({ sourcePath }) => {
          publishArtifactCalls.push(sourcePath);
          const bytes = await fs.readFile(sourcePath);
          const digest = sha256(bytes);
          return {
            sha256: digest,
            byteSize: bytes.length,
            relativePath: `artifacts/sha256/${digest}/${path.basename(sourcePath)}`,
            filePath: sourcePath,
          };
        },
        publishMetadata: async ({ namespace, bytes }) => {
          const buffer = Buffer.from(bytes);
          publishedMetadata.push({ namespace, bytes: buffer });
          const digest = sha256(buffer);
          return {
            sha256: digest,
            byteSize: buffer.length,
            relativePath: `${namespace}/sha256/${digest}.json`,
            filePath: path.join(harness.releaseStoreRoot, `${digest}.json`),
          };
        },
        createAcceptedTag: async () => "openclaw-next-release/reuse",
        now: () => new Date("2026-07-20T12:00:00.000Z"),
      },
    );

    expect(publishArtifactCalls).toEqual([harness.corePath]);
    const receipt = JSON.parse(publishedMetadata[1]!.bytes.toString("utf8"));
    expect(receipt.orderedArtifacts[1]).toMatchObject({
      sha256: predecessorPlugin.sha256,
      contentAddressedLocation: predecessorPlugin.contentAddressedLocation,
    });
  });

  it("rejects release-owned plugin drift in a migration-free package", async () => {
    const harness = await createHarness(["codex", "new-plugin"]);
    await expect(
      prepareAcceptedReleaseFromSnapshot(
        {
          authority: createAuthority(),
          preparedWorktree,
          operationId: "8".repeat(64),
          operationRoot: harness.operationRoot,
          releaseStoreRoot: harness.releaseStoreRoot,
          env: {},
        },
        {
          resolvePredecessor: async () => createPredecessor(),
          runDriver: async () => ({
            schema: "openclaw.release.prepare.driver-result.v1",
            manifestPath: harness.manifestPath,
            artifacts: [
              {
                role: "core",
                packageName: "openclaw",
                artifactPath: harness.corePath,
                disposition: "built",
              },
              {
                role: "plugin",
                packageName: "@openclaw/codex",
                artifactPath: harness.pluginPath,
                disposition: "built",
              },
            ],
            checks: [{ id: "native-package-acceptance", status: "passed" }],
          }),
        },
      ),
    ).rejects.toThrow("cannot add, remove, or reassign release-owned plugins");
  });
});
