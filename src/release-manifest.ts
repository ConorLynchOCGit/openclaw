// Typed runtime surface for the package-owned release manifest protocol.
export {
  findReleaseArtifact,
  isLowerHex,
  LEGACY_RESOLVED_OBJECT_SET_ALGORITHM,
  LEGACY_RELEASE_PROTOCOL_VERSION,
  parseReleaseManifestBytes,
  PROTOTYPE_B_PACKAGE_SHAPE,
  RELEASE_MANIFEST_FILENAME,
  RELEASE_PROTOCOL_VERSION,
  RELEASE_READINESS_CONTRACT_VERSION,
  RESOLVED_OBJECT_SET_ALGORITHM,
  releaseManifestDigest,
  serializeReleaseManifest,
} from "../scripts/lib/release-manifest.mjs";
export type {
  ReleaseArtifact,
  ReleaseInstallPlan,
  ReleaseManifest,
} from "../scripts/lib/release-manifest.mjs";
