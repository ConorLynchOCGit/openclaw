import { createHash } from "node:crypto";
import nodePath from "node:path";

export const RELEASE_MANIFEST_FILENAME = "release-manifest.json";
export const RELEASE_PROTOCOL_VERSION = 1;
export const PROTOTYPE_B_PACKAGE_SHAPE = "prototype-b-native-release-set-v1";
export const RELEASE_READINESS_CONTRACT_VERSION = 1;

const MAX_RELEASE_MANIFEST_BYTES = 1024 * 1024;
const PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/u;
const PACKAGE_VERSION_RE =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9._-]*$/u;

export function isLowerHex(value, expectedLength) {
  const lengths = Array.isArray(expectedLength) ? expectedLength : [expectedLength];
  if (typeof value !== "string" || !lengths.includes(value.length)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 102))) {
      return false;
    }
  }
  return true;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(path, message) {
  throw new Error(`invalid release manifest ${path}: ${message}`);
}

function requireRecord(value, path) {
  if (!isRecord(value)) {
    fail(path, "must be an object");
  }
  return value;
}

function requireExactKeys(value, expected, path) {
  const actual = Object.keys(value);
  const unexpected = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  if (missing.length > 0 || unexpected.length > 0) {
    const details = [
      ...(missing.length > 0 ? [`missing ${missing.join(", ")}`] : []),
      ...(unexpected.length > 0 ? [`unsupported ${unexpected.join(", ")}`] : []),
    ];
    fail(path, details.join("; "));
  }
}

function requireString(value, path) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    fail(path, "must be a non-empty trimmed string");
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) {
      fail(path, "must not contain control characters");
    }
  }
  return value;
}

function requireSha256(value, path) {
  const digest = requireString(value, path);
  if (!isLowerHex(digest, 64)) {
    fail(path, "must be a lowercase SHA-256 digest");
  }
  return digest;
}

function requireGitObject(value, path) {
  const object = requireString(value, path);
  if (!isLowerHex(object, [40, 64])) {
    fail(path, "must be a lowercase SHA-1 or SHA-256 Git object id");
  }
  return object;
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function requireSortedUniqueStrings(value, path, itemValidator = requireString) {
  if (!Array.isArray(value)) {
    fail(path, "must be an array");
  }
  const items = value.map((item, index) => itemValidator(item, `${path}[${index}]`));
  for (let index = 1; index < items.length; index += 1) {
    const comparison = compareUtf8(items[index - 1], items[index]);
    if (comparison === 0) {
      fail(path, `contains duplicate value ${JSON.stringify(items[index])}`);
    }
    if (comparison > 0) {
      fail(path, "must be sorted bytewise");
    }
  }
  return items;
}

function requirePackageName(value, path) {
  const packageName = requireString(value, path);
  if (!PACKAGE_NAME_RE.test(packageName)) {
    fail(path, "must be a lowercase npm package name");
  }
  return packageName;
}

function requirePackageVersion(value, path) {
  const version = requireString(value, path);
  if (!PACKAGE_VERSION_RE.test(version)) {
    fail(path, "must be an npm-valid version token");
  }
  return version;
}

function requirePluginId(value, path) {
  const pluginId = requireString(value, path);
  if (!PLUGIN_ID_RE.test(pluginId)) {
    fail(path, "must be a lowercase plugin id");
  }
  return pluginId;
}

function requireRegistry(value, path) {
  const registry = requireString(value, path);
  let parsed;
  try {
    parsed = new URL(registry);
  } catch {
    fail(path, "must be an absolute URL");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !parsed.pathname.endsWith("/") ||
    parsed.href !== registry
  ) {
    fail(path, "must be a canonical credential-free HTTPS registry URL ending in /");
  }
  return registry;
}

function normalizeInstallPlan(value, path) {
  const plan = requireRecord(value, path);
  requireExactKeys(
    plan,
    ["registry", "lockSha256", "resolvedObjectSetSha256", "resolvedObjectCount"],
    path,
  );
  if (!Number.isSafeInteger(plan.resolvedObjectCount) || plan.resolvedObjectCount < 0) {
    fail(`${path}.resolvedObjectCount`, "must be a non-negative safe integer");
  }
  return {
    registry: requireRegistry(plan.registry, `${path}.registry`),
    lockSha256: requireSha256(plan.lockSha256, `${path}.lockSha256`),
    resolvedObjectSetSha256: requireSha256(
      plan.resolvedObjectSetSha256,
      `${path}.resolvedObjectSetSha256`,
    ),
    resolvedObjectCount: plan.resolvedObjectCount,
  };
}

function normalizeArtifact(value, index) {
  const path = `artifacts[${index}]`;
  const artifact = requireRecord(value, path);
  requireExactKeys(
    artifact,
    [
      "role",
      "packageName",
      "packageVersion",
      "compatibilityRange",
      "ownedPluginIds",
      "installPlan",
    ],
    path,
  );
  if (artifact.role !== "core" && artifact.role !== "plugin") {
    fail(`${path}.role`, 'must be "core" or "plugin"');
  }
  return {
    role: artifact.role,
    packageName: requirePackageName(artifact.packageName, `${path}.packageName`),
    packageVersion: requirePackageVersion(artifact.packageVersion, `${path}.packageVersion`),
    compatibilityRange: requireString(artifact.compatibilityRange, `${path}.compatibilityRange`),
    ownedPluginIds: requireSortedUniqueStrings(
      artifact.ownedPluginIds,
      `${path}.ownedPluginIds`,
      requirePluginId,
    ),
    installPlan: normalizeInstallPlan(artifact.installPlan, `${path}.installPlan`),
  };
}

function normalizeReleaseManifest(value) {
  const manifest = requireRecord(value, "root");
  requireExactKeys(
    manifest,
    [
      "releaseProtocolVersion",
      "source",
      "predecessor",
      "package",
      "artifacts",
      "codex",
      "migration",
      "compatibility",
      "loadedReadiness",
    ],
    "root",
  );
  if (manifest.releaseProtocolVersion !== RELEASE_PROTOCOL_VERSION) {
    fail("releaseProtocolVersion", `must equal supported protocol ${RELEASE_PROTOCOL_VERSION}`);
  }

  const source = requireRecord(manifest.source, "source");
  requireExactKeys(source, ["snapshotRef", "treeObject"], "source");

  const predecessor = requireRecord(manifest.predecessor, "predecessor");
  requireExactKeys(predecessor, ["releaseManifestDigest", "sourceTreeObject"], "predecessor");

  const packageIdentity = requireRecord(manifest.package, "package");
  requireExactKeys(
    packageIdentity,
    ["version", "shape", "buildInputDigest", "toolchainDigest", "lockfileDigest"],
    "package",
  );
  if (packageIdentity.shape !== PROTOTYPE_B_PACKAGE_SHAPE) {
    fail("package.shape", `must equal ${PROTOTYPE_B_PACKAGE_SHAPE}`);
  }

  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    fail("artifacts", "must contain one core artifact and any plugin artifacts");
  }
  const artifacts = manifest.artifacts.map(normalizeArtifact);
  if (artifacts[0].role !== "core" || artifacts[0].packageName !== "openclaw") {
    fail("artifacts[0]", 'must be the core "openclaw" package');
  }
  if (artifacts[0].packageVersion !== packageIdentity.version) {
    fail("artifacts[0].packageVersion", "must equal package.version");
  }
  const packageNames = new Set([artifacts[0].packageName]);
  const pluginOwners = new Map();
  const acceptedRegistry = artifacts[0].installPlan.registry;
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index];
    if (index > 0) {
      if (artifact.role !== "plugin") {
        fail(`artifacts[${index}].role`, 'only the first artifact may use role "core"');
      }
      if (index > 1 && compareUtf8(artifacts[index - 1].packageName, artifact.packageName) >= 0) {
        fail("artifacts", "plugin artifacts must be sorted bytewise by unique package name");
      }
      if (packageNames.has(artifact.packageName)) {
        fail("artifacts", `contains duplicate package ${artifact.packageName}`);
      }
      if (artifact.ownedPluginIds.length === 0) {
        fail(
          `artifacts[${index}].ownedPluginIds`,
          "plugin packages must own at least one plugin id",
        );
      }
      packageNames.add(artifact.packageName);
    }
    if (artifact.installPlan.registry !== acceptedRegistry) {
      fail(
        `artifacts[${index}].installPlan.registry`,
        `must equal the accepted release-set registry ${acceptedRegistry}`,
      );
    }
    for (const pluginId of artifact.ownedPluginIds) {
      const owner = pluginOwners.get(pluginId);
      if (owner) {
        fail(
          `artifacts[${index}].ownedPluginIds`,
          `plugin ${pluginId} is already owned by ${owner}`,
        );
      }
      pluginOwners.set(pluginId, artifact.packageName);
    }
  }

  const codex = requireRecord(manifest.codex, "codex");
  requireExactKeys(
    codex,
    ["profileDigest", "capabilityDigest", "contributorGuidanceDigest"],
    "codex",
  );

  const migration = requireRecord(manifest.migration, "migration");
  requireExactKeys(migration, ["class", "affectedPersistentRoots"], "migration");
  if (
    !new Set(["migration_free", "migration_bearing", "bootstrap_bridge_rehost"]).has(
      migration.class,
    )
  ) {
    fail(
      "migration.class",
      "must be migration_free, migration_bearing, or bootstrap_bridge_rehost",
    );
  }
  const affectedPersistentRoots = requireSortedUniqueStrings(
    migration.affectedPersistentRoots,
    "migration.affectedPersistentRoots",
  );
  for (const root of affectedPersistentRoots) {
    if (!root.startsWith("/") || nodePath.posix.normalize(root) !== root) {
      fail("migration.affectedPersistentRoots", `root must be absolute and normalized: ${root}`);
    }
  }
  if (migration.class === "migration_free" && affectedPersistentRoots.length > 0) {
    fail(
      "migration.affectedPersistentRoots",
      "must be empty when migration.class is migration_free",
    );
  }

  const compatibility = requireRecord(manifest.compatibility, "compatibility");
  requireExactKeys(
    compatibility,
    ["config", "schema", "plugin", "support", "host"],
    "compatibility",
  );

  const loadedReadiness = requireRecord(manifest.loadedReadiness, "loadedReadiness");
  requireExactKeys(
    loadedReadiness,
    ["contractVersion", "requiredPluginIds", "requireExactPackageOrigins"],
    "loadedReadiness",
  );
  if (loadedReadiness.contractVersion !== RELEASE_READINESS_CONTRACT_VERSION) {
    fail("loadedReadiness.contractVersion", `must equal ${RELEASE_READINESS_CONTRACT_VERSION}`);
  }
  if (loadedReadiness.requireExactPackageOrigins !== true) {
    fail("loadedReadiness.requireExactPackageOrigins", "must be true");
  }
  const requiredPluginIds = requireSortedUniqueStrings(
    loadedReadiness.requiredPluginIds,
    "loadedReadiness.requiredPluginIds",
    requirePluginId,
  );
  for (const pluginId of requiredPluginIds) {
    if (!pluginOwners.has(pluginId)) {
      fail(
        "loadedReadiness.requiredPluginIds",
        `required plugin ${pluginId} has no package artifact owner`,
      );
    }
  }

  return {
    releaseProtocolVersion: RELEASE_PROTOCOL_VERSION,
    source: {
      snapshotRef: requireString(source.snapshotRef, "source.snapshotRef"),
      treeObject: requireGitObject(source.treeObject, "source.treeObject"),
    },
    predecessor: {
      releaseManifestDigest: requireSha256(
        predecessor.releaseManifestDigest,
        "predecessor.releaseManifestDigest",
      ),
      sourceTreeObject: requireGitObject(
        predecessor.sourceTreeObject,
        "predecessor.sourceTreeObject",
      ),
    },
    package: {
      version: requirePackageVersion(packageIdentity.version, "package.version"),
      shape: PROTOTYPE_B_PACKAGE_SHAPE,
      buildInputDigest: requireSha256(packageIdentity.buildInputDigest, "package.buildInputDigest"),
      toolchainDigest: requireSha256(packageIdentity.toolchainDigest, "package.toolchainDigest"),
      lockfileDigest: requireSha256(packageIdentity.lockfileDigest, "package.lockfileDigest"),
    },
    artifacts,
    codex: {
      profileDigest: requireSha256(codex.profileDigest, "codex.profileDigest"),
      capabilityDigest: requireSha256(codex.capabilityDigest, "codex.capabilityDigest"),
      contributorGuidanceDigest: requireSha256(
        codex.contributorGuidanceDigest,
        "codex.contributorGuidanceDigest",
      ),
    },
    migration: {
      class: migration.class,
      affectedPersistentRoots,
    },
    compatibility: {
      config: requireString(compatibility.config, "compatibility.config"),
      schema: requireString(compatibility.schema, "compatibility.schema"),
      plugin: requireString(compatibility.plugin, "compatibility.plugin"),
      support: requireString(compatibility.support, "compatibility.support"),
      host: requireString(compatibility.host, "compatibility.host"),
    },
    loadedReadiness: {
      contractVersion: RELEASE_READINESS_CONTRACT_VERSION,
      requiredPluginIds,
      requireExactPackageOrigins: true,
    },
  };
}

export function serializeReleaseManifest(value) {
  return `${JSON.stringify(normalizeReleaseManifest(value), null, 2)}\n`;
}

export function releaseManifestDigest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parseReleaseManifestBytes(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buffer.length === 0 || buffer.length > MAX_RELEASE_MANIFEST_BYTES) {
    throw new Error(
      `invalid release manifest bytes: size must be between 1 and ${MAX_RELEASE_MANIFEST_BYTES}`,
    );
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (error) {
    throw new Error("invalid release manifest bytes: expected UTF-8", { cause: error });
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `invalid release manifest JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const normalized = normalizeReleaseManifest(parsed);
  const canonicalBytes = Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  if (!buffer.equals(canonicalBytes)) {
    throw new Error(
      "invalid release manifest bytes: field order, indentation, and trailing newline must match the release protocol",
    );
  }
  return normalized;
}

export function findReleaseArtifact(manifest, packageName) {
  const matches = manifest.artifacts.filter((artifact) => artifact.packageName === packageName);
  if (matches.length !== 1) {
    throw new Error(
      `release manifest must contain exactly one artifact for ${packageName}; found ${matches.length}`,
    );
  }
  return matches[0];
}
