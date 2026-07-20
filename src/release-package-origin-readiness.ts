// Compares receipt-bound package origins with loaded plugin-origin evidence.
import path from "node:path";
import { isLowerHex, type ReleaseManifest } from "./release-manifest.js";

export type ReleasePluginOriginEvidence = {
  pluginId: string;
  packageName: string;
  packageVersion: string;
  pluginManifestSha256: string;
  compatibilityRange: string;
  originKind: string;
  packageArtifactSha256: string;
  installedRoot: string;
};

export type ReleasePackageOriginReadiness = {
  ready: boolean;
  errors: string[];
};

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function validateEvidenceRow(
  row: ReleasePluginOriginEvidence,
  label: string,
  errors: string[],
): void {
  for (const field of [
    "pluginId",
    "packageName",
    "packageVersion",
    "compatibilityRange",
    "originKind",
    "installedRoot",
  ] as const) {
    if (!row[field] || row[field].trim() !== row[field]) {
      errors.push(`${label}.${field} must be a non-empty trimmed string`);
    }
  }
  if (!isLowerHex(row.pluginManifestSha256, 64)) {
    errors.push(`${label}.pluginManifestSha256 must be a lowercase SHA-256 digest`);
  }
  if (!isLowerHex(row.packageArtifactSha256, 64)) {
    errors.push(`${label}.packageArtifactSha256 must be a lowercase SHA-256 digest`);
  }
  if (
    !row.installedRoot.startsWith("/") ||
    path.posix.normalize(row.installedRoot) !== row.installedRoot
  ) {
    errors.push(`${label}.installedRoot must be an absolute normalized path`);
  }
}

function indexRows(
  rows: readonly ReleasePluginOriginEvidence[],
  label: string,
  errors: string[],
): Map<string, ReleasePluginOriginEvidence> {
  const result = new Map<string, ReleasePluginOriginEvidence>();
  for (const [index, row] of rows.entries()) {
    validateEvidenceRow(row, `${label}[${index}]`, errors);
    if (result.has(row.pluginId)) {
      errors.push(`${label} contains duplicate plugin ${row.pluginId}`);
      continue;
    }
    result.set(row.pluginId, row);
  }
  return result;
}

function artifactOwners(
  manifest: ReleaseManifest,
): Map<string, ReleaseManifest["artifacts"][number]> {
  const owners = new Map<string, ReleaseManifest["artifacts"][number]>();
  for (const artifact of manifest.artifacts) {
    for (const pluginId of artifact.ownedPluginIds) {
      owners.set(pluginId, artifact);
    }
  }
  return owners;
}

const COMPARED_FIELDS = [
  "packageName",
  "packageVersion",
  "pluginManifestSha256",
  "compatibilityRange",
  "originKind",
  "packageArtifactSha256",
  "installedRoot",
] as const;

/**
 * Compare the exact enabled-plugin origin set. Callers must pass only enabled
 * loaded rows; disabled package-owned identities remain manifest inventory.
 */
export function evaluateReleasePackageOriginReadiness(params: {
  manifest: ReleaseManifest;
  accepted: readonly ReleasePluginOriginEvidence[];
  observed: readonly ReleasePluginOriginEvidence[];
}): ReleasePackageOriginReadiness {
  const errors: string[] = [];
  const accepted = indexRows(params.accepted, "accepted", errors);
  const observed = indexRows(params.observed, "observed", errors);
  const owners = artifactOwners(params.manifest);
  const requiredIds = params.manifest.loadedReadiness.requiredPluginIds;
  const requiredSet = new Set(requiredIds);

  for (const pluginId of requiredIds) {
    const owner = owners.get(pluginId);
    const expected = accepted.get(pluginId);
    const actual = observed.get(pluginId);
    if (!owner) {
      errors.push(`required plugin ${pluginId} has no manifest artifact owner`);
      continue;
    }
    if (!expected) {
      errors.push(`required plugin ${pluginId} has no accepted package-origin evidence`);
      continue;
    }
    if (expected.packageName !== owner.packageName) {
      errors.push(
        `${pluginId}.packageName does not match manifest: accepted=${expected.packageName} manifest=${owner.packageName}`,
      );
    }
    if (expected.packageVersion !== owner.packageVersion) {
      errors.push(
        `${pluginId}.packageVersion does not match manifest: accepted=${expected.packageVersion} manifest=${owner.packageVersion}`,
      );
    }
    if (expected.compatibilityRange !== owner.compatibilityRange) {
      errors.push(
        `${pluginId}.compatibilityRange does not match manifest: accepted=${expected.compatibilityRange} manifest=${owner.compatibilityRange}`,
      );
    }
    const expectedOriginKind = owner.role === "core" ? "bundled" : "global";
    if (expected.originKind !== expectedOriginKind) {
      errors.push(
        `${pluginId}.originKind is not package-owned: accepted=${expected.originKind} required=${expectedOriginKind}`,
      );
    }
    if (!actual) {
      errors.push(`required plugin ${pluginId} is not loaded`);
      continue;
    }
    for (const field of COMPARED_FIELDS) {
      if (actual[field] !== expected[field]) {
        errors.push(
          `${pluginId}.${field} mismatch: accepted=${expected[field]} observed=${actual[field]}`,
        );
      }
    }
  }

  for (const pluginId of accepted.keys()) {
    if (!requiredSet.has(pluginId)) {
      errors.push(`accepted origin contains non-required plugin ${pluginId}`);
    }
  }
  for (const pluginId of observed.keys()) {
    if (!requiredSet.has(pluginId)) {
      errors.push(`loaded origin contains unaccepted plugin ${pluginId}`);
    }
  }

  return {
    ready: errors.length === 0,
    errors: errors.toSorted(compareUtf8),
  };
}
