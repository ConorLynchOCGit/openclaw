// Converges receipt-bound plugin archives through the native managed npm installer.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { PluginInstallRecord } from "../config/types.plugins.js";
import {
  resolveDefaultPluginNpmDir,
  resolvePluginNpmPackageDir,
  resolvePluginNpmProjectDir,
  resolvePluginNpmProjectsDir,
} from "../plugins/install-paths.js";
import { installPluginFromNpmPackArchive } from "../plugins/install.js";
import {
  loadInstalledPluginIndexInstallRecords,
  writePersistedInstalledPluginIndexInstallRecords,
} from "../plugins/installed-plugin-index-records.js";
import {
  LEGACY_RESOLVED_OBJECT_SET_ALGORITHM,
  type ReleaseArtifact,
  type ReleaseManifest,
} from "../release-manifest.js";
import {
  type AcceptedPluginPayloadIdentity,
  verifyAcceptedReleaseArtifactInstallPlan,
  verifyInstalledAcceptedPackagePlan,
  verifyInstalledAcceptedPluginPayload,
  verifyInstalledAcceptedPluginPlan,
} from "./accepted-release-install-plan.js";
import {
  copyAcceptedReleaseArtifactToStage,
  type AcceptedReleaseArtifact,
  type ResolvedAcceptedReleaseReceipt,
  verifyStagedAcceptedReleaseArtifact,
} from "./accepted-release-receipt.js";

type AcceptedPlugin = {
  receiptArtifact: AcceptedReleaseArtifact;
  manifestArtifact: ReleaseArtifact;
  pluginId: string;
  projectRoot: string;
  packageRoot: string;
  payloadIdentity: AcceptedPluginPayloadIdentity;
};

export type AcceptedReleasePluginConvergenceResult = {
  checked: string[];
  changed: string[];
};

function releasePluginIds(manifest: ReleaseManifest): Set<string> {
  const required = new Set(manifest.loadedReadiness.requiredPluginIds);
  return new Set(
    manifest.artifacts
      .filter((artifact) => artifact.role === "plugin")
      .flatMap((artifact) => artifact.ownedPluginIds)
      .filter((pluginId) => required.has(pluginId)),
  );
}

function manifestPluginArtifactForId(manifest: ReleaseManifest, pluginId: string): ReleaseArtifact {
  const matches = manifest.artifacts.filter(
    (artifact) => artifact.role === "plugin" && artifact.ownedPluginIds.includes(pluginId),
  );
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(`release plugin ${pluginId} has no unique manifest artifact`);
  }
  return matches[0];
}

function findManifestArtifact(params: {
  receiptArtifact: AcceptedReleaseArtifact;
  manifest: ReleaseManifest;
}): ReleaseArtifact {
  const artifact = params.manifest.artifacts.find(
    (candidate) =>
      candidate.role === params.receiptArtifact.role &&
      candidate.packageName === params.receiptArtifact.packageName,
  );
  if (!artifact || artifact.packageVersion !== params.receiptArtifact.version) {
    throw new Error("accepted plugin artifact does not match the release manifest");
  }
  return artifact;
}

function requiredPluginIdForArtifact(params: {
  manifest: ReleaseManifest;
  artifact: ReleaseArtifact;
}): string {
  const required = new Set(params.manifest.loadedReadiness.requiredPluginIds);
  const requiredOwnedIds = params.artifact.ownedPluginIds.filter((pluginId) =>
    required.has(pluginId),
  );
  if (requiredOwnedIds.length !== 1) {
    throw new Error(
      `${params.artifact.packageName} must own exactly one required plugin for native npm-pack activation`,
    );
  }
  return requiredOwnedIds[0] ?? "";
}

function resolveProjectRootFromInstallRecord(params: {
  pluginId: string;
  record: PluginInstallRecord;
  manifestArtifact: ReleaseArtifact;
  npmDir: string;
  projectsDir: string;
}): string {
  if (params.record.source !== "npm" || params.record.artifactKind !== "npm-pack") {
    throw new Error(
      `predecessor release plugin ${params.pluginId} is not a native npm-pack install`,
    );
  }
  const installPath = params.record.installPath;
  const expectedPackageRoot = resolvePluginNpmPackageDir({
    npmDir: params.npmDir,
    packageName: params.manifestArtifact.packageName,
  });
  if (
    !installPath ||
    !path.isAbsolute(installPath) ||
    params.record.resolvedName !== params.manifestArtifact.packageName ||
    params.record.resolvedVersion !== params.manifestArtifact.packageVersion ||
    params.record.version !== params.manifestArtifact.packageVersion ||
    path.resolve(installPath) !== path.resolve(expectedPackageRoot)
  ) {
    throw new Error(
      `predecessor release plugin ${params.pluginId} install record does not match its loaded manifest`,
    );
  }
  const projectRoot = resolvePluginNpmProjectDir({
    npmDir: params.npmDir,
    packageName: params.manifestArtifact.packageName,
  });
  const relative = path.relative(params.projectsDir, projectRoot);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `predecessor release plugin ${params.pluginId} is outside the native managed-project root`,
    );
  }
  return projectRoot;
}

async function assertInstalledPackageMetadata(params: {
  packageRoot: string;
  manifestArtifact: ReleaseArtifact;
}): Promise<void> {
  let packageJson: unknown;
  try {
    packageJson = JSON.parse(
      await fs.readFile(path.join(params.packageRoot, "package.json"), "utf8"),
    );
  } catch (error) {
    throw new Error(
      `${params.manifestArtifact.packageName} installed package metadata is invalid`,
      {
        cause: error,
      },
    );
  }
  if (
    !packageJson ||
    typeof packageJson !== "object" ||
    Array.isArray(packageJson) ||
    (packageJson as { name?: unknown }).name !== params.manifestArtifact.packageName ||
    (packageJson as { version?: unknown }).version !== params.manifestArtifact.packageVersion
  ) {
    throw new Error(`${params.manifestArtifact.packageName} installed package identity drifted`);
  }
}

/** Fail before core staging when native plugin state is not the loaded predecessor set. */
export async function assertAcceptedReleasePluginPredecessor(params: {
  predecessorManifest: ReleaseManifest;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const env = params.env ?? process.env;
  const npmDir = resolveDefaultPluginNpmDir(env);
  const projectsDir = resolvePluginNpmProjectsDir(npmDir);
  const records = await loadInstalledPluginIndexInstallRecords({ env });
  const releaseIds = releasePluginIds(params.predecessorManifest);
  const releaseProjectRoots = new Set<string>();

  for (const pluginId of releaseIds) {
    const record = records[pluginId];
    if (!record) {
      throw new Error(`predecessor release plugin ${pluginId} has no native install record`);
    }
    const manifestArtifact = manifestPluginArtifactForId(params.predecessorManifest, pluginId);
    const projectRoot = resolveProjectRootFromInstallRecord({
      pluginId,
      record,
      manifestArtifact,
      npmDir,
      projectsDir,
    });
    await assertInstalledPackageMetadata({
      packageRoot: record.installPath ?? "",
      manifestArtifact,
    });
    if (
      (manifestArtifact.installPlan.resolvedObjectSetAlgorithm ??
        LEGACY_RESOLVED_OBJECT_SET_ALGORITHM) === LEGACY_RESOLVED_OBJECT_SET_ALGORITHM
    ) {
      const acceptedPackagePlan = await verifyInstalledAcceptedPackagePlan({
        packageRoot: record.installPath ?? "",
        manifestArtifact,
      });
      await verifyInstalledAcceptedPluginPlan({
        projectRoot,
        manifestArtifact,
        expectedPortableObjectSet: {
          sha256: acceptedPackagePlan.portableObjectSetSha256,
          count: acceptedPackagePlan.portableObjectCount,
        },
      });
    } else {
      await verifyInstalledAcceptedPluginPlan({ projectRoot, manifestArtifact });
    }
    releaseProjectRoots.add(projectRoot);
  }

  for (const [pluginId, record] of Object.entries(records)) {
    if (releaseIds.has(pluginId) || !record.installPath) {
      continue;
    }
    const relative = path.relative(projectsDir, path.resolve(record.installPath));
    const projectName = relative.split(path.sep)[0];
    if (projectName && releaseProjectRoots.has(path.join(projectsDir, projectName))) {
      throw new Error(
        `predecessor release plugin project is shared with unrelated plugin ${pluginId}`,
      );
    }
  }
}

export function acceptedReleasePluginInstallRecordSpec(params: { artifactSha256: string }): string {
  return `accepted-release:sha256:${params.artifactSha256}`;
}

function installRecordSpecMatchesArtifact(
  spec: string | undefined,
  artifactSha256: string,
): boolean {
  if (!spec) {
    return false;
  }
  const canonical = acceptedReleasePluginInstallRecordSpec({ artifactSha256 });
  if (spec === canonical) {
    return true;
  }
  // Accept records written by the bootstrap protocol. Their receipt prefix is
  // incidental; the immutable plugin artifact is identified by its digest.
  return spec.startsWith("accepted-release:") && spec.endsWith(`:sha256:${artifactSha256}`);
}

function recordMatchesAcceptedPlugin(params: {
  record: PluginInstallRecord | undefined;
  plugin: AcceptedPlugin;
}): boolean {
  const record = params.record;
  if (!record) {
    return false;
  }
  const expectedIntegrity = params.plugin.receiptArtifact.npmIntegrityOrShasum;
  const observedIntegrity = [
    record.integrity,
    record.shasum,
    record.npmIntegrity,
    record.npmShasum,
  ].filter((value): value is string => typeof value === "string");
  return (
    record.source === "npm" &&
    record.artifactKind === "npm-pack" &&
    record.artifactFormat === "tgz" &&
    record.sourcePath === undefined &&
    installRecordSpecMatchesArtifact(record.spec, params.plugin.receiptArtifact.sha256) &&
    path.resolve(record.installPath ?? "") === path.resolve(params.plugin.packageRoot) &&
    record.version === params.plugin.manifestArtifact.packageVersion &&
    record.resolvedName === params.plugin.manifestArtifact.packageName &&
    record.resolvedVersion === params.plugin.manifestArtifact.packageVersion &&
    record.resolvedSpec ===
      `${params.plugin.manifestArtifact.packageName}@${params.plugin.manifestArtifact.packageVersion}` &&
    observedIntegrity.includes(expectedIntegrity)
  );
}

async function assertAcceptedPluginInstalled(plugin: AcceptedPlugin): Promise<void> {
  await assertInstalledPackageMetadata({
    packageRoot: plugin.packageRoot,
    manifestArtifact: plugin.manifestArtifact,
  });
  await verifyInstalledAcceptedPluginPlan({
    projectRoot: plugin.projectRoot,
    manifestArtifact: plugin.manifestArtifact,
  });
  await verifyInstalledAcceptedPluginPayload({
    packageRoot: plugin.packageRoot,
    expected: plugin.payloadIdentity,
  });
}

async function withAcceptedNpmEnvironment<T>(params: {
  registry: string;
  hostVersion: string;
  run: () => Promise<T>;
}): Promise<T> {
  const updates = {
    NPM_CONFIG_REGISTRY: params.registry,
    npm_config_registry: params.registry,
    OPENCLAW_COMPATIBILITY_HOST_VERSION: params.hostVersion,
  } satisfies NodeJS.ProcessEnv;
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await params.run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function buildAcceptedInstallRecord(params: {
  plugin: AcceptedPlugin;
  npmTarballName?: string;
  resolution?: {
    integrity?: string;
    shasum?: string;
    resolvedAt?: string;
  };
}): PluginInstallRecord {
  const expected = params.plugin.receiptArtifact.npmIntegrityOrShasum;
  const observed = [params.resolution?.integrity, params.resolution?.shasum].filter(Boolean);
  if (!observed.includes(expected)) {
    throw new Error(
      `${params.plugin.manifestArtifact.packageName} npm integrity does not match its receipt`,
    );
  }
  const exactSpec = `${params.plugin.manifestArtifact.packageName}@${params.plugin.manifestArtifact.packageVersion}`;
  return {
    source: "npm",
    spec: acceptedReleasePluginInstallRecordSpec({
      artifactSha256: params.plugin.receiptArtifact.sha256,
    }),
    installPath: params.plugin.packageRoot,
    version: params.plugin.manifestArtifact.packageVersion,
    resolvedName: params.plugin.manifestArtifact.packageName,
    resolvedVersion: params.plugin.manifestArtifact.packageVersion,
    resolvedSpec: exactSpec,
    ...(params.resolution?.integrity ? { integrity: params.resolution.integrity } : {}),
    ...(params.resolution?.shasum ? { shasum: params.resolution.shasum } : {}),
    ...(params.resolution?.resolvedAt ? { resolvedAt: params.resolution.resolvedAt } : {}),
    installedAt: new Date().toISOString(),
    artifactKind: "npm-pack",
    artifactFormat: "tgz",
    ...(params.resolution?.integrity ? { npmIntegrity: params.resolution.integrity } : {}),
    ...(params.resolution?.shasum ? { npmShasum: params.resolution.shasum } : {}),
    ...(params.npmTarballName ? { npmTarballName: params.npmTarballName } : {}),
  };
}

async function prepareAcceptedPlugin(params: {
  resolvedReceipt: ResolvedAcceptedReleaseReceipt;
  receiptArtifact: AcceptedReleaseArtifact;
  npmDir: string;
  stageRoot: string;
}): Promise<{ plugin: AcceptedPlugin; archivePath: string }> {
  const manifestArtifact = findManifestArtifact({
    receiptArtifact: params.receiptArtifact,
    manifest: params.resolvedReceipt.releaseManifest,
  });
  const pluginId = requiredPluginIdForArtifact({
    manifest: params.resolvedReceipt.releaseManifest,
    artifact: manifestArtifact,
  });
  const archivePath = await copyAcceptedReleaseArtifactToStage({
    artifact: params.receiptArtifact,
    releaseStoreRoot: params.resolvedReceipt.releaseStoreRoot,
    stageRoot: params.stageRoot,
  });
  const installPlan = await verifyAcceptedReleaseArtifactInstallPlan({
    archivePath,
    receiptArtifact: params.receiptArtifact,
    manifestArtifact,
  });
  if (!installPlan.pluginPayloadSha256 || !installPlan.pluginManifestSha256) {
    throw new Error(`${manifestArtifact.packageName} has no accepted plugin payload identity`);
  }
  return {
    archivePath,
    plugin: {
      receiptArtifact: params.receiptArtifact,
      manifestArtifact,
      pluginId,
      projectRoot: resolvePluginNpmProjectDir({
        npmDir: params.npmDir,
        packageName: manifestArtifact.packageName,
      }),
      packageRoot: resolvePluginNpmPackageDir({
        npmDir: params.npmDir,
        packageName: manifestArtifact.packageName,
      }),
      payloadIdentity: {
        pluginPayloadSha256: installPlan.pluginPayloadSha256,
        pluginManifestSha256: installPlan.pluginManifestSha256,
      },
    },
  };
}

/** Verify the receipt-bound native plugin roots and install records without mutation. */
export async function assertAcceptedReleasePluginsConverged(params: {
  resolvedReceipt: ResolvedAcceptedReleaseReceipt;
  env?: NodeJS.ProcessEnv;
}): Promise<Map<string, AcceptedPluginPayloadIdentity>> {
  const env = params.env ?? process.env;
  const npmDir = resolveDefaultPluginNpmDir(env);
  const stageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-accepted-plugin-verify-"));
  const identities = new Map<string, AcceptedPluginPayloadIdentity>();
  try {
    const records = await loadInstalledPluginIndexInstallRecords({ env });
    for (const receiptArtifact of params.resolvedReceipt.pluginArtifacts) {
      const { plugin } = await prepareAcceptedPlugin({
        resolvedReceipt: params.resolvedReceipt,
        receiptArtifact,
        npmDir,
        stageRoot,
      });
      if (
        !recordMatchesAcceptedPlugin({
          record: records[plugin.pluginId],
          plugin,
        })
      ) {
        throw new Error(
          `accepted plugin ${plugin.pluginId} install record does not match its receipt`,
        );
      }
      await assertAcceptedPluginInstalled(plugin);
      identities.set(plugin.pluginId, plugin.payloadIdentity);
    }
    return identities;
  } finally {
    await fs.rm(stageRoot, { recursive: true, force: true });
  }
}

/** Idempotently install only the exact plugin archives selected by one accepted receipt. */
export async function convergeAcceptedReleasePlugins(params: {
  resolvedReceipt: ResolvedAcceptedReleaseReceipt;
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  assertCandidate: () => Promise<void>;
}): Promise<AcceptedReleasePluginConvergenceResult> {
  const env = params.env ?? process.env;
  const npmDir = resolveDefaultPluginNpmDir(env);
  await fs.mkdir(npmDir, { recursive: true, mode: 0o700 });
  const stageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-accepted-plugin-stage-"));
  const checked: string[] = [];
  const changed: string[] = [];
  const registry = params.resolvedReceipt.releaseManifest.artifacts[0]?.installPlan.registry ?? "";

  try {
    await withAcceptedNpmEnvironment({
      registry,
      hostVersion: params.resolvedReceipt.releaseManifest.package.version,
      run: async () => {
        for (const receiptArtifact of params.resolvedReceipt.pluginArtifacts) {
          await params.assertCandidate();
          const { plugin, archivePath } = await prepareAcceptedPlugin({
            resolvedReceipt: params.resolvedReceipt,
            receiptArtifact,
            npmDir,
            stageRoot,
          });
          checked.push(plugin.pluginId);

          const records = await loadInstalledPluginIndexInstallRecords({ env });
          if (
            recordMatchesAcceptedPlugin({
              record: records[plugin.pluginId],
              plugin,
            })
          ) {
            try {
              await assertAcceptedPluginInstalled(plugin);
              continue;
            } catch {
              // Native update below repairs a corrupt or partial managed root.
            }
          }

          await params.assertCandidate();
          await verifyStagedAcceptedReleaseArtifact({
            artifact: receiptArtifact,
            stageRoot,
            filePath: archivePath,
          });
          const installed = await installPluginFromNpmPackArchive({
            archivePath,
            npmDir,
            timeoutMs: params.timeoutMs,
            mode: "update",
            expectedPluginId: plugin.pluginId,
            expectedIntegrity: receiptArtifact.npmIntegrityOrShasum,
            ...(params.config ? { config: params.config } : {}),
          });
          if (!installed.ok) {
            throw new Error(
              `${plugin.manifestArtifact.packageName} accepted npm-pack install failed: ${installed.error}`,
            );
          }
          if (
            installed.pluginId !== plugin.pluginId ||
            installed.manifestName !== plugin.manifestArtifact.packageName ||
            installed.version !== plugin.manifestArtifact.packageVersion ||
            installed.npmResolution?.name !== plugin.manifestArtifact.packageName ||
            installed.npmResolution?.version !== plugin.manifestArtifact.packageVersion ||
            path.resolve(installed.targetDir) !== path.resolve(plugin.packageRoot)
          ) {
            throw new Error(
              `${plugin.manifestArtifact.packageName} native install result does not match the accepted package identity`,
            );
          }
          await assertAcceptedPluginInstalled(plugin);

          const nextRecords = await loadInstalledPluginIndexInstallRecords({ env });
          nextRecords[plugin.pluginId] = buildAcceptedInstallRecord({
            plugin,
            npmTarballName: installed.npmTarballName,
            resolution: installed.npmResolution,
          });
          await writePersistedInstalledPluginIndexInstallRecords(nextRecords, { env });
          changed.push(plugin.pluginId);
        }
      },
    });
    await assertAcceptedReleasePluginsConverged({
      resolvedReceipt: params.resolvedReceipt,
      env,
    });
    return { checked, changed };
  } finally {
    await fs.rm(stageRoot, { recursive: true, force: true });
  }
}
