// Loads immutable generation identity from the executing OpenClaw package.
import fs from "node:fs";
import path from "node:path";
import {
  isLowerHex,
  parseReleaseManifestBytes,
  PROTOTYPE_B_PACKAGE_SHAPE,
  RELEASE_MANIFEST_FILENAME,
  releaseManifestDigest,
  type ReleaseManifest,
} from "./release-manifest.js";

type ReleasePackageJson = {
  name?: unknown;
  version?: unknown;
  openclaw?: {
    release?: {
      packageShape?: unknown;
      manifestPath?: unknown;
      manifestSha256?: unknown;
    };
  };
};

export type LoadedReleaseManifest = {
  packageRoot: string;
  manifestPath: string;
  releaseManifestDigest: string;
  manifest: ReleaseManifest;
};

export type LoadedReleaseIdentity = {
  releaseManifestDigest: string;
  sourceSnapshotRef: string;
  sourceTreeObject: string;
  packageVersion: string;
  packageShape: string;
  predecessorReleaseManifestDigest: string;
  predecessorSourceTreeObject: string;
  requiredPluginIds: string[];
  codexCapabilityDigest: string;
};

/** Return whether an installed package declares immutable release identity. */
export function packageDeclaresReleaseManifest(packageRoot: string): boolean {
  const resolvedRoot = path.resolve(packageRoot);
  const packageJsonPath = path.join(resolvedRoot, "package.json");
  const packageJson = parsePackageJson(
    readRegularFile(packageJsonPath, "release package metadata"),
    packageJsonPath,
  );
  return packageJson.openclaw?.release !== undefined;
}

function readRegularFile(filePath: string, label: string): Buffer {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    throw new Error(
      `${label} is unavailable at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

function parsePackageJson(bytes: Buffer, packageJsonPath: string): ReleasePackageJson {
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as ReleasePackageJson;
  } catch (error) {
    throw new Error(
      `release package metadata is invalid at ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** Load and verify the exact embedded manifest bytes from an installed package root. */
export function loadEmbeddedReleaseManifest(packageRoot: string): LoadedReleaseManifest {
  const resolvedRoot = path.resolve(packageRoot);
  const packageJsonPath = path.join(resolvedRoot, "package.json");
  const packageJson = parsePackageJson(
    readRegularFile(packageJsonPath, "release package metadata"),
    packageJsonPath,
  );
  const release = packageJson.openclaw?.release;
  if (release?.manifestPath !== RELEASE_MANIFEST_FILENAME) {
    throw new Error(
      `release package metadata must bind manifestPath to ${RELEASE_MANIFEST_FILENAME}`,
    );
  }
  if (release.packageShape !== PROTOTYPE_B_PACKAGE_SHAPE) {
    throw new Error(
      `release package metadata must bind packageShape to ${PROTOTYPE_B_PACKAGE_SHAPE}`,
    );
  }
  if (typeof release.manifestSha256 !== "string" || !isLowerHex(release.manifestSha256, 64)) {
    throw new Error("release package metadata must contain a lowercase manifestSha256 digest");
  }

  const manifestPath = path.join(resolvedRoot, RELEASE_MANIFEST_FILENAME);
  const bytes = readRegularFile(manifestPath, "embedded release manifest");
  const digest = releaseManifestDigest(bytes);
  if (digest !== release.manifestSha256) {
    throw new Error(
      `embedded release manifest digest mismatch: expected ${release.manifestSha256}, observed ${digest}`,
    );
  }
  const manifest = parseReleaseManifestBytes(bytes);
  if (packageJson.name !== "openclaw") {
    throw new Error('release package metadata name must be "openclaw"');
  }
  if (packageJson.version !== manifest.package.version) {
    throw new Error(
      `release package version mismatch: package.json=${String(packageJson.version)} manifest=${manifest.package.version}`,
    );
  }
  if (manifest.package.shape !== release.packageShape) {
    throw new Error(
      `release package shape mismatch: package.json=${release.packageShape} manifest=${manifest.package.shape}`,
    );
  }

  return {
    packageRoot: resolvedRoot,
    manifestPath,
    releaseManifestDigest: digest,
    manifest,
  };
}

/** Return the bounded native version/readiness identity for the loaded generation. */
export function readLoadedReleaseIdentity(packageRoot: string): LoadedReleaseIdentity {
  const loaded = loadEmbeddedReleaseManifest(packageRoot);
  return {
    releaseManifestDigest: loaded.releaseManifestDigest,
    sourceSnapshotRef: loaded.manifest.source.snapshotRef,
    sourceTreeObject: loaded.manifest.source.treeObject,
    packageVersion: loaded.manifest.package.version,
    packageShape: loaded.manifest.package.shape,
    predecessorReleaseManifestDigest: loaded.manifest.predecessor.releaseManifestDigest,
    predecessorSourceTreeObject: loaded.manifest.predecessor.sourceTreeObject,
    requiredPluginIds: [...loaded.manifest.loadedReadiness.requiredPluginIds],
    codexCapabilityDigest: loaded.manifest.codex.capabilityDigest,
  };
}

/** Read immutable release identity when the package participates in the release protocol. */
export function readLoadedReleaseIdentityIfDeclared(
  packageRoot: string,
): LoadedReleaseIdentity | null {
  if (!packageDeclaresReleaseManifest(packageRoot)) {
    return null;
  }
  return readLoadedReleaseIdentity(packageRoot);
}
