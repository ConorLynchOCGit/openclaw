import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReleaseManifestFixture } from "../../test/helpers/release-manifest-fixture.js";
import type { PluginInstallRecord } from "../config/types.plugins.js";
import {
  resolveDefaultPluginNpmDir,
  resolvePluginNpmPackageDir,
  resolvePluginNpmProjectDir,
} from "../plugins/install-paths.js";
import type { ReleaseManifest } from "../release-manifest.js";
import { withTempDir } from "../test-helpers/temp-dir.js";
import type { ResolvedAcceptedReleaseReceipt } from "./accepted-release-receipt.js";

const mocks = vi.hoisted(() => ({
  install: vi.fn(),
  loadRecords: vi.fn(),
  verifyArchivePlan: vi.fn(),
  verifyInstalledPackagePlan: vi.fn(),
  verifyInstalledPayload: vi.fn(),
  verifyInstalledPlan: vi.fn(),
  writeRecords: vi.fn(),
}));

vi.mock("../plugins/install.js", () => ({
  installPluginFromNpmPackArchive: mocks.install,
}));

vi.mock("../plugins/installed-plugin-index-records.js", () => ({
  loadInstalledPluginIndexInstallRecords: mocks.loadRecords,
  writePersistedInstalledPluginIndexInstallRecords: mocks.writeRecords,
}));

vi.mock("./accepted-release-install-plan.js", () => ({
  LEGACY_RESOLVED_OBJECT_SET_ALGORITHM: "npm-lock-path-v1",
  verifyAcceptedReleaseArtifactInstallPlan: mocks.verifyArchivePlan,
  verifyInstalledAcceptedPackagePlan: mocks.verifyInstalledPackagePlan,
  verifyInstalledAcceptedPluginPayload: mocks.verifyInstalledPayload,
  verifyInstalledAcceptedPluginPlan: mocks.verifyInstalledPlan,
}));

import {
  acceptedReleasePluginInstallRecordSpec,
  assertAcceptedReleasePluginPredecessor,
  convergeAcceptedReleasePlugins,
} from "./accepted-release-plugin-convergence.js";

function withVersion(manifest: ReleaseManifest, version: string): ReleaseManifest {
  return {
    ...manifest,
    package: { ...manifest.package, version },
    artifacts: manifest.artifacts.map((artifact) => ({
      ...artifact,
      packageVersion: version,
    })),
  };
}

async function createFixture(root: string) {
  const env = { OPENCLAW_STATE_DIR: path.join(root, "state") };
  const npmDir = resolveDefaultPluginNpmDir(env);
  const packageName = "@openclaw/codex";
  const pluginId = "codex";
  const packageRoot = resolvePluginNpmPackageDir({ npmDir, packageName });
  const projectRoot = resolvePluginNpmProjectDir({ npmDir, packageName });
  const releaseManifest = withVersion(createReleaseManifestFixture(), "2.0.0");
  const releaseStoreRoot = path.join(root, "releases");
  const archiveBytes = Buffer.from("accepted codex archive", "utf8");
  const artifactSha = createHash("sha256").update(archiveBytes).digest("hex");
  const archivePath = path.join(releaseStoreRoot, "artifacts", "sha256", artifactSha, "codex.tgz");
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.writeFile(archivePath, archiveBytes, { mode: 0o444 });
  const integrity = `sha512-${Buffer.alloc(64, 9).toString("base64")}`;
  const coreArtifact = {
    role: "core",
    packageName: "openclaw",
    version: "2.0.0",
    sha256: "a".repeat(64),
    npmIntegrityOrShasum: integrity,
    packlistDigest: "b".repeat(64),
    byteSize: 1,
    contentAddressedLocation: "unused",
    fileName: "openclaw.tgz",
    filePath: "/unused/openclaw.tgz",
  } as const;
  const pluginArtifact = {
    ...coreArtifact,
    role: "plugin",
    packageName,
    sha256: artifactSha,
    byteSize: archiveBytes.byteLength,
    contentAddressedLocation: path.relative(releaseStoreRoot, archivePath),
    fileName: path.basename(archivePath),
    filePath: archivePath,
  } as const;
  const resolvedReceipt = {
    id: "c".repeat(64),
    releaseStoreRoot,
    releaseManifest,
    releaseManifestPath: "/unused/manifest.json",
    coreArtifact,
    pluginArtifacts: [pluginArtifact],
    receipt: {
      receiptProtocolVersion: 1,
      releaseManifestDigest: "d".repeat(64),
      loadedPredecessorManifestDigest: "e".repeat(64),
      loadedPredecessorSourceObject: "1".repeat(40),
      orderedArtifacts: [coreArtifact, pluginArtifact],
      candidateEvidenceRef: "evidence",
      candidateEvidenceDigest: "f".repeat(64),
      terminalVerdict: "accepted",
      authorizationClass: "preauthorized_migration_free",
      authorizationRef: { goalId: "goal-1" },
      nativeSnapshotRef: releaseManifest.source.snapshotRef,
      acceptedSourceTag: "accepted",
      acceptedSourceObject: releaseManifest.source.treeObject,
      createdAt: "2026-07-19T00:00:00.000Z",
      releasePreparationOperationId: "prepare-1",
    },
  } satisfies ResolvedAcceptedReleaseReceipt;
  return {
    archivePath,
    env,
    integrity,
    packageName,
    packageRoot,
    pluginId,
    projectRoot,
    resolvedReceipt,
  };
}

describe("accepted release plugin convergence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyArchivePlan.mockResolvedValue({
      lockSha256: "1".repeat(64),
      resolvedObjectSetAlgorithm: "npm-registry-object-v2",
      resolvedObjectSetSha256: "2".repeat(64),
      resolvedObjectCount: 1,
      portableObjectSetSha256: "2".repeat(64),
      portableObjectCount: 1,
      pluginPayloadSha256: "3".repeat(64),
      pluginManifestSha256: "4".repeat(64),
    });
    mocks.verifyInstalledPackagePlan.mockResolvedValue({
      lockSha256: "1".repeat(64),
      resolvedObjectSetAlgorithm: "npm-lock-path-v1",
      resolvedObjectSetSha256: "2".repeat(64),
      resolvedObjectCount: 1,
      portableObjectSetSha256: "5".repeat(64),
      portableObjectCount: 1,
    });
    mocks.verifyInstalledPayload.mockResolvedValue(undefined);
    mocks.verifyInstalledPlan.mockResolvedValue(undefined);
  });

  it("installs through the native updater and reuses identical bytes across release receipts", async () => {
    await withTempDir({ prefix: "openclaw-accepted-plugin-converge-" }, async (root) => {
      const fixture = await createFixture(root);
      let records: Record<string, PluginInstallRecord> = {
        unrelated: { source: "path", sourcePath: "/opt/unrelated" },
      };
      mocks.loadRecords.mockImplementation(async () => structuredClone(records));
      mocks.writeRecords.mockImplementation(async (next: Record<string, PluginInstallRecord>) => {
        records = structuredClone(next);
        return "/unused/index";
      });
      mocks.install.mockImplementation(async () => {
        await fs.mkdir(fixture.packageRoot, { recursive: true });
        await fs.writeFile(
          path.join(fixture.packageRoot, "package.json"),
          JSON.stringify({ name: fixture.packageName, version: "2.0.0" }),
        );
        return {
          ok: true,
          pluginId: fixture.pluginId,
          targetDir: fixture.packageRoot,
          manifestName: fixture.packageName,
          version: "2.0.0",
          extensions: ["./dist/index.js"],
          npmTarballName: "codex.tgz",
          npmResolution: {
            name: fixture.packageName,
            version: "2.0.0",
            integrity: fixture.integrity,
          },
        };
      });
      const assertCandidate = vi.fn(async () => undefined);

      await expect(
        convergeAcceptedReleasePlugins({
          resolvedReceipt: fixture.resolvedReceipt,
          config: {},
          env: fixture.env,
          timeoutMs: 1_000,
          assertCandidate,
        }),
      ).resolves.toEqual({ checked: [fixture.pluginId], changed: [fixture.pluginId] });

      expect(mocks.install).toHaveBeenCalledOnce();
      expect(assertCandidate).toHaveBeenCalledTimes(2);
      expect(records.unrelated).toEqual({ source: "path", sourcePath: "/opt/unrelated" });
      expect(records[fixture.pluginId]).toMatchObject({
        source: "npm",
        spec: acceptedReleasePluginInstallRecordSpec({
          artifactSha256: fixture.resolvedReceipt.pluginArtifacts[0]?.sha256 ?? "",
        }),
        installPath: fixture.packageRoot,
        resolvedName: fixture.packageName,
        resolvedVersion: "2.0.0",
        artifactKind: "npm-pack",
      });
      expect(records[fixture.pluginId]?.sourcePath).toBeUndefined();

      mocks.install.mockClear();
      assertCandidate.mockClear();
      const nextReceipt = {
        ...fixture.resolvedReceipt,
        id: "9".repeat(64),
      } satisfies ResolvedAcceptedReleaseReceipt;
      await expect(
        convergeAcceptedReleasePlugins({
          resolvedReceipt: nextReceipt,
          env: fixture.env,
          timeoutMs: 1_000,
          assertCandidate,
        }),
      ).resolves.toEqual({ checked: [fixture.pluginId], changed: [] });
      expect(mocks.install).not.toHaveBeenCalled();
      expect(assertCandidate).toHaveBeenCalledOnce();
    });
  });

  it("retries native convergence after an interrupted install-record write", async () => {
    await withTempDir({ prefix: "openclaw-accepted-plugin-repair-" }, async (root) => {
      const fixture = await createFixture(root);
      let records: Record<string, PluginInstallRecord> = {};
      let rejectWrite = true;
      mocks.loadRecords.mockImplementation(async () => structuredClone(records));
      mocks.writeRecords.mockImplementation(async (next: Record<string, PluginInstallRecord>) => {
        if (rejectWrite) {
          throw new Error("interrupted install-record write");
        }
        records = structuredClone(next);
        return "/unused/index";
      });
      mocks.install.mockImplementation(async () => {
        await fs.mkdir(fixture.packageRoot, { recursive: true });
        await fs.writeFile(
          path.join(fixture.packageRoot, "package.json"),
          JSON.stringify({ name: fixture.packageName, version: "2.0.0" }),
        );
        return {
          ok: true,
          pluginId: fixture.pluginId,
          targetDir: fixture.packageRoot,
          manifestName: fixture.packageName,
          version: "2.0.0",
          extensions: [],
          npmResolution: {
            name: fixture.packageName,
            version: "2.0.0",
            integrity: fixture.integrity,
          },
        };
      });
      const run = () =>
        convergeAcceptedReleasePlugins({
          resolvedReceipt: fixture.resolvedReceipt,
          env: fixture.env,
          timeoutMs: 1_000,
          assertCandidate: async () => undefined,
        });

      await expect(run()).rejects.toThrow("interrupted install-record write");
      rejectWrite = false;
      await expect(run()).resolves.toEqual({
        checked: [fixture.pluginId],
        changed: [fixture.pluginId],
      });
      expect(mocks.install).toHaveBeenCalledTimes(2);
    });
  });

  it("verifies predecessor package records without mutating them", async () => {
    await withTempDir({ prefix: "openclaw-accepted-plugin-predecessor-" }, async (root) => {
      const fixture = await createFixture(root);
      await fs.mkdir(fixture.packageRoot, { recursive: true });
      await fs.writeFile(
        path.join(fixture.packageRoot, "package.json"),
        JSON.stringify({ name: fixture.packageName, version: "1.0.0" }),
      );
      const predecessor = withVersion(createReleaseManifestFixture(), "1.0.0");
      predecessor.releaseProtocolVersion = 1;
      for (const artifact of predecessor.artifacts) {
        delete artifact.installPlan.resolvedObjectSetAlgorithm;
      }
      mocks.loadRecords.mockResolvedValue({
        [fixture.pluginId]: {
          source: "npm",
          spec: `${fixture.packageName}@1.0.0`,
          installPath: fixture.packageRoot,
          version: "1.0.0",
          resolvedName: fixture.packageName,
          resolvedVersion: "1.0.0",
          artifactKind: "npm-pack",
          artifactFormat: "tgz",
        },
      });

      await expect(
        assertAcceptedReleasePluginPredecessor({
          predecessorManifest: predecessor,
          env: fixture.env,
        }),
      ).resolves.toBeUndefined();
      expect(mocks.install).not.toHaveBeenCalled();
      expect(mocks.writeRecords).not.toHaveBeenCalled();
      expect(mocks.verifyInstalledPlan).toHaveBeenCalledWith({
        projectRoot: fixture.projectRoot,
        manifestArtifact: predecessor.artifacts.find(
          (artifact) => artifact.packageName === fixture.packageName,
        ),
        expectedPortableObjectSet: { count: 1, sha256: "5".repeat(64) },
      });
    });
  });
});
