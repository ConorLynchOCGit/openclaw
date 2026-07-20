export type VerifiedReleasePackageArtifact = {
  role: "core" | "plugin";
  packageName: string;
  packageVersion: string;
  artifactSha256: string;
  npmIntegrity: string;
  npmShasum: string;
  packedBytes: number;
  fileCount: number;
  packlistSha256: string;
  pluginManifestDigests: Array<{ pluginId: string; sha256: string }>;
};

export function verifyReleasePackageInventory(params: {
  manifestBytes: Buffer | Uint8Array;
  artifactPaths: string[];
}): Promise<VerifiedReleasePackageArtifact[]>;
