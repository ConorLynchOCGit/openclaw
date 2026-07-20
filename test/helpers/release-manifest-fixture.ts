import type { ReleaseArtifact, ReleaseManifest } from "../../src/release-manifest.js";

const DIGESTS = {
  predecessor: "1".repeat(64),
  buildInput: "2".repeat(64),
  toolchain: "3".repeat(64),
  lockfile: "4".repeat(64),
  rootLock: "5".repeat(64),
  rootObjects: "6".repeat(64),
  pluginLock: "7".repeat(64),
  pluginObjects: "8".repeat(64),
  codexProfile: "9".repeat(64),
  codexCapability: "a".repeat(64),
  contributorGuidance: "b".repeat(64),
} as const;

export function createReleaseManifestFixture(params?: {
  artifacts?: ReleaseArtifact[];
  requiredPluginIds?: string[];
}): ReleaseManifest {
  const artifacts = params?.artifacts ?? [
    {
      role: "core",
      packageName: "openclaw",
      packageVersion: "2026.7.19-b1.1",
      compatibilityRange: ">=2026.7.19-b1.1",
      ownedPluginIds: ["browser"],
      installPlan: {
        registry: "https://registry.npmjs.org/",
        lockSha256: DIGESTS.rootLock,
        resolvedObjectSetSha256: DIGESTS.rootObjects,
        resolvedObjectCount: 2,
      },
    },
    {
      role: "plugin",
      packageName: "@openclaw/codex",
      packageVersion: "2026.7.19-b1.1",
      compatibilityRange: ">=2026.7.19-b1.1",
      ownedPluginIds: ["codex", "dormant-codex-helper"],
      installPlan: {
        registry: "https://registry.npmjs.org/",
        lockSha256: DIGESTS.pluginLock,
        resolvedObjectSetSha256: DIGESTS.pluginObjects,
        resolvedObjectCount: 1,
      },
    },
  ];
  return {
    releaseProtocolVersion: 1,
    source: {
      snapshotRef: "refs/tags/openclaw-next-b1-fixture",
      treeObject: "c".repeat(40),
    },
    predecessor: {
      releaseManifestDigest: DIGESTS.predecessor,
      sourceTreeObject: "d".repeat(40),
    },
    package: {
      version: "2026.7.19-b1.1",
      shape: "prototype-b-native-release-set-v1",
      buildInputDigest: DIGESTS.buildInput,
      toolchainDigest: DIGESTS.toolchain,
      lockfileDigest: DIGESTS.lockfile,
    },
    artifacts,
    codex: {
      profileDigest: DIGESTS.codexProfile,
      capabilityDigest: DIGESTS.codexCapability,
      contributorGuidanceDigest: DIGESTS.contributorGuidance,
    },
    migration: {
      class: "migration_free",
      affectedPersistentRoots: [],
    },
    compatibility: {
      config: "openclaw-config-v1",
      schema: "openclaw-state-v1",
      plugin: ">=2026.7.19-b1.1",
      support: "openclaw-next-support-v1",
      host: "linux-x64-node24",
    },
    loadedReadiness: {
      contractVersion: 1,
      requiredPluginIds: params?.requiredPluginIds ?? ["browser", "codex"],
      requireExactPackageOrigins: true,
    },
  };
}
