// Compares native Gateway loaded-readiness evidence with one accepted release receipt.
import path from "node:path";
import {
  resolveDefaultPluginNpmDir,
  resolvePluginNpmPackageDir,
} from "../plugins/install-paths.js";
import { isLowerHex, type ReleaseArtifact } from "../release-manifest.js";
import type { LoadedReleaseReadiness } from "../release-runtime-readiness.js";
import type { ResolvedAcceptedReleaseReceipt } from "./accepted-release-receipt.js";

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function artifactByPluginId(
  resolvedReceipt: ResolvedAcceptedReleaseReceipt,
): Map<string, ReleaseArtifact> {
  return new Map(
    resolvedReceipt.releaseManifest.artifacts.flatMap((artifact) =>
      artifact.ownedPluginIds.map((pluginId) => [pluginId, artifact] as const),
    ),
  );
}

/** Fail unless Gateway health describes the exact executing core and plugin release set. */
export function assertAcceptedReleaseLoadedReadback(params: {
  readiness: LoadedReleaseReadiness | undefined;
  resolvedReceipt: ResolvedAcceptedReleaseReceipt;
  packageRoot: string;
  env?: NodeJS.ProcessEnv;
}): void {
  const readiness = params.readiness;
  if (!readiness?.ready || !readiness.identity) {
    throw new Error(
      `Gateway loaded release readiness failed: ${readiness?.errors.join("; ") || "missing loaded release identity"}`,
    );
  }

  const manifest = params.resolvedReceipt.releaseManifest;
  const receipt = params.resolvedReceipt.receipt;
  const identity = readiness.identity;
  if (
    identity.releaseManifestDigest !== receipt.releaseManifestDigest ||
    identity.sourceTreeObject !== manifest.source.treeObject ||
    identity.packageVersion !== manifest.package.version ||
    identity.packageShape !== manifest.package.shape ||
    identity.predecessorReleaseManifestDigest !== manifest.predecessor.releaseManifestDigest ||
    identity.predecessorSourceTreeObject !== manifest.predecessor.sourceTreeObject ||
    identity.codexCapabilityDigest !== manifest.codex.capabilityDigest ||
    identity.requiredPluginIds.length !== manifest.loadedReadiness.requiredPluginIds.length ||
    identity.requiredPluginIds.some(
      (pluginId, index) => pluginId !== manifest.loadedReadiness.requiredPluginIds[index],
    )
  ) {
    throw new Error("Gateway loaded release identity does not match the accepted receipt");
  }

  const artifacts = artifactByPluginId(params.resolvedReceipt);
  const originsById = new Map(readiness.pluginOrigins.map((origin) => [origin.pluginId, origin]));
  if (
    originsById.size !== readiness.pluginOrigins.length ||
    originsById.size !== manifest.loadedReadiness.requiredPluginIds.length
  ) {
    throw new Error("Gateway loaded plugin-origin set does not match the accepted release");
  }

  const npmDir = resolveDefaultPluginNpmDir(params.env ?? process.env);
  for (const pluginId of manifest.loadedReadiness.requiredPluginIds) {
    const artifact = artifacts.get(pluginId);
    const origin = originsById.get(pluginId);
    if (!artifact || !origin) {
      throw new Error(`Gateway did not load accepted plugin ${pluginId}`);
    }
    const expectedOriginKind = artifact.role === "core" ? "bundled" : "global";
    if (
      origin.ownerPackageName !== artifact.packageName ||
      origin.ownerPackageVersion !== artifact.packageVersion ||
      origin.compatibilityRange !== artifact.compatibilityRange ||
      origin.originKind !== expectedOriginKind ||
      !isLowerHex(origin.pluginManifestSha256, 64)
    ) {
      throw new Error(`Gateway loaded plugin ${pluginId} from an unaccepted package origin`);
    }
    if (artifact.role === "core") {
      if (!isWithinRoot(params.packageRoot, origin.installedRoot)) {
        throw new Error(
          `Gateway loaded bundled plugin ${pluginId} outside the accepted core package`,
        );
      }
      continue;
    }
    const expectedRoot = resolvePluginNpmPackageDir({
      npmDir,
      packageName: artifact.packageName,
    });
    if (path.resolve(origin.installedRoot) !== path.resolve(expectedRoot)) {
      throw new Error(`Gateway loaded managed plugin ${pluginId} outside its accepted native root`);
    }
  }
}
