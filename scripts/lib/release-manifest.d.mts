export type ReleaseInstallPlan = {
  registry: string;
  lockSha256: string;
  resolvedObjectSetAlgorithm?: "npm-registry-object-v2";
  resolvedObjectSetSha256: string;
  resolvedObjectCount: number;
};

export type ReleaseArtifact = {
  role: "core" | "plugin";
  packageName: string;
  packageVersion: string;
  compatibilityRange: string;
  ownedPluginIds: string[];
  installPlan: ReleaseInstallPlan;
};

export type ReleaseManifest = {
  releaseProtocolVersion: 1 | 2;
  source: { snapshotRef: string; treeObject: string };
  predecessor: { releaseManifestDigest: string; sourceTreeObject: string };
  package: {
    version: string;
    shape: "prototype-b-native-release-set-v1";
    buildInputDigest: string;
    toolchainDigest: string;
    lockfileDigest: string;
  };
  artifacts: ReleaseArtifact[];
  codex: {
    profileDigest: string;
    capabilityDigest: string;
    contributorGuidanceDigest: string;
  };
  migration: {
    class: "migration_free" | "migration_bearing" | "bootstrap_bridge_rehost";
    affectedPersistentRoots: string[];
  };
  compatibility: {
    config: string;
    schema: string;
    plugin: string;
    support: string;
    host: string;
  };
  loadedReadiness: {
    contractVersion: 1;
    requiredPluginIds: string[];
    requireExactPackageOrigins: true;
  };
};

export const RELEASE_MANIFEST_FILENAME: "release-manifest.json";
export const LEGACY_RELEASE_PROTOCOL_VERSION: 1;
export const RELEASE_PROTOCOL_VERSION: 2;
export const PROTOTYPE_B_PACKAGE_SHAPE: "prototype-b-native-release-set-v1";
export const RELEASE_READINESS_CONTRACT_VERSION: 1;
export const LEGACY_RESOLVED_OBJECT_SET_ALGORITHM: "npm-lock-path-v1";
export const RESOLVED_OBJECT_SET_ALGORITHM: "npm-registry-object-v2";

export function isLowerHex(value: unknown, expectedLength: number | readonly number[]): boolean;
export function serializeReleaseManifest(value: unknown): string;
export function releaseManifestDigest(bytes: string | Uint8Array): string;
export function parseReleaseManifestBytes(bytes: string | Uint8Array): ReleaseManifest;
export function findReleaseArtifact(
  manifest: ReleaseManifest,
  packageName: string,
): ReleaseArtifact;
