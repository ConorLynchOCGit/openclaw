#!/usr/bin/env node
// Verifies all accepted npm lock bytes and resolved objects before installation.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  findReleaseArtifact,
  LEGACY_RESOLVED_OBJECT_SET_ALGORITHM,
  parseReleaseManifestBytes,
  RESOLVED_OBJECT_SET_ALGORITHM,
} from "./lib/release-manifest.mjs";

function usage() {
  return "usage: node scripts/verify-accepted-release-plans.mjs --manifest <release-manifest.json> --lock <package-name=package-lock.json> [--lock ...]";
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function requireProjectionField(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? "a string" : "a non-empty string"}`);
  }
  if (/[\t\r\n]/u.test(value)) {
    throw new Error(`${label} must not contain tabs or newlines`);
  }
  return value;
}

function validateNpmIntegrity(integrity, packagePath) {
  const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/u.exec(integrity);
  if (!match) {
    throw new Error(`${packagePath} registry object has invalid npm integrity`);
  }
  const algorithm = match[1];
  const encodedDigest = match[2];
  const expectedBytes = { sha256: 32, sha384: 48, sha512: 64 }[algorithm];
  const decodedDigest = Buffer.from(encodedDigest, "base64");
  if (
    decodedDigest.length !== expectedBytes ||
    decodedDigest.toString("base64") !== encodedDigest
  ) {
    throw new Error(`${packagePath} registry object has invalid npm integrity`);
  }
}

function validateRegistryResolution(resolved, integrity, registry, packagePath) {
  let resolvedUrl;
  let registryUrl;
  try {
    resolvedUrl = new URL(resolved);
    registryUrl = new URL(registry);
  } catch (error) {
    throw new Error(`${packagePath} has an invalid resolved URL`, { cause: error });
  }
  if (
    resolvedUrl.protocol !== "https:" ||
    resolvedUrl.username ||
    resolvedUrl.password ||
    resolvedUrl.search ||
    resolvedUrl.hash ||
    resolvedUrl.origin !== registryUrl.origin ||
    !resolvedUrl.pathname.startsWith(registryUrl.pathname)
  ) {
    throw new Error(`${packagePath} resolved outside accepted registry ${registry}`);
  }
  validateNpmIntegrity(integrity, packagePath);
}

export function projectResolvedObjectSet(lockBytes, registry, options = {}) {
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(lockBytes));
  } catch (error) {
    throw new Error(
      `accepted npm lock is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("accepted npm lock root must be an object");
  }
  if (parsed.lockfileVersion !== 3) {
    throw new Error(
      `accepted npm lockfileVersion must be 3; found ${String(parsed.lockfileVersion)}`,
    );
  }
  const packages = parsed.packages;
  if (!packages || typeof packages !== "object" || Array.isArray(packages)) {
    throw new Error("accepted npm lock must contain a packages object");
  }
  const rootEntry = packages[""];
  if (!rootEntry || typeof rootEntry !== "object" || Array.isArray(rootEntry)) {
    throw new Error("accepted npm lock must contain a root package entry");
  }
  const acceptedLocalPackage = options.allowAcceptedLocalPackage;
  const packageName = requireProjectionField(parsed.name, "accepted npm lock name");
  let packageVersion = "";
  if (!acceptedLocalPackage) {
    packageVersion = requireProjectionField(parsed.version, "accepted npm lock version");
    const rootPackageName = requireProjectionField(rootEntry.name, "root lock package name");
    const rootPackageVersion = requireProjectionField(
      rootEntry.version,
      "root lock package version",
    );
    if (packageName !== rootPackageName || packageVersion !== rootPackageVersion) {
      throw new Error("accepted npm lock root identity does not match its package entry");
    }
  }

  const algorithm = options.algorithm ?? RESOLVED_OBJECT_SET_ALGORITHM;
  if (
    algorithm !== LEGACY_RESOLVED_OBJECT_SET_ALGORITHM &&
    algorithm !== RESOLVED_OBJECT_SET_ALGORITHM
  ) {
    throw new Error(`unsupported resolved object-set algorithm ${String(algorithm)}`);
  }
  const objectRows = algorithm === RESOLVED_OBJECT_SET_ALGORITHM ? new Set() : [];
  const expectedLocalPath = acceptedLocalPackage
    ? `node_modules/${acceptedLocalPackage.packageName}`
    : null;
  let localPackageFound = false;
  for (const packagePath of Object.keys(packages).filter(Boolean).toSorted(compareUtf8)) {
    const entry = packages[packagePath];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${packagePath} lock entry must be an object`);
    }
    requireProjectionField(packagePath, "lock package path");
    const version = requireProjectionField(entry.version, `${packagePath}.version`);
    const resolved = requireProjectionField(entry.resolved, `${packagePath}.resolved`);
    if (packagePath === expectedLocalPath && resolved.startsWith("file:")) {
      if (version !== acceptedLocalPackage.packageVersion) {
        throw new Error(
          `${packagePath} local package version does not match the accepted artifact`,
        );
      }
      const localPath = resolved.slice("file:".length);
      if (
        !localPath ||
        path.isAbsolute(localPath) ||
        localPath
          .replaceAll("\\", "/")
          .split("/")
          .some((part) => part === "..")
      ) {
        throw new Error(`${packagePath} has an unsafe local package resolution`);
      }
      localPackageFound = true;
      continue;
    }
    const integrity = requireProjectionField(entry.integrity, `${packagePath}.integrity`);
    validateRegistryResolution(resolved, integrity, registry, packagePath);
    const row =
      algorithm === LEGACY_RESOLVED_OBJECT_SET_ALGORITHM
        ? `${packagePath}\t${version}\t${resolved}\t${integrity}\n`
        : `${version}\t${resolved}\t${integrity}\n`;
    if (objectRows instanceof Set) {
      objectRows.add(row);
    } else {
      objectRows.push(row);
    }
  }
  const rows = [...objectRows].toSorted(compareUtf8);
  const projection = rows.join("");
  return {
    packageName,
    packageVersion,
    projection,
    resolvedObjectCount: rows.length,
    resolvedObjectSetSha256: sha256(Buffer.from(projection, "utf8")),
    localPackageFound,
  };
}

export function verifyAcceptedReleasePlan(params) {
  const artifact = findReleaseArtifact(params.manifest, params.packageName);
  const lockSha256 = sha256(params.lockBytes);
  const projected = projectResolvedObjectSet(params.lockBytes, artifact.installPlan.registry, {
    algorithm:
      artifact.installPlan.resolvedObjectSetAlgorithm ?? LEGACY_RESOLVED_OBJECT_SET_ALGORITHM,
  });
  const errors = [];
  if (
    projected.packageName !== artifact.packageName ||
    projected.packageVersion !== artifact.packageVersion
  ) {
    errors.push(
      `lock package identity mismatch: expected ${artifact.packageName}@${artifact.packageVersion}, observed ${projected.packageName}@${projected.packageVersion}`,
    );
  }
  if (lockSha256 !== artifact.installPlan.lockSha256) {
    errors.push(
      `lock digest mismatch: expected ${artifact.installPlan.lockSha256}, observed ${lockSha256}`,
    );
  }
  if (projected.resolvedObjectCount !== artifact.installPlan.resolvedObjectCount) {
    errors.push(
      `resolved object count mismatch: expected ${artifact.installPlan.resolvedObjectCount}, observed ${projected.resolvedObjectCount}`,
    );
  }
  if (projected.resolvedObjectSetSha256 !== artifact.installPlan.resolvedObjectSetSha256) {
    errors.push(
      `resolved object-set digest mismatch: expected ${artifact.installPlan.resolvedObjectSetSha256}, observed ${projected.resolvedObjectSetSha256}`,
    );
  }
  if (errors.length > 0) {
    throw new Error(`${params.packageName} accepted install plan rejected:\n${errors.join("\n")}`);
  }
  return {
    packageName: artifact.packageName,
    packageVersion: artifact.packageVersion,
    registry: artifact.installPlan.registry,
    lockSha256,
    resolvedObjectSetSha256: projected.resolvedObjectSetSha256,
    resolvedObjectCount: projected.resolvedObjectCount,
  };
}

export function verifyAcceptedReleasePlans(params) {
  const lockMap =
    params.locks instanceof Map ? params.locks : new Map(Object.entries(params.locks ?? {}));
  const expectedNames = params.manifest.artifacts.map((artifact) => artifact.packageName);
  const expectedSet = new Set(expectedNames);
  const missing = expectedNames.filter((name) => !lockMap.has(name));
  const unexpected = [...lockMap.keys()]
    .filter((name) => !expectedSet.has(name))
    .toSorted(compareUtf8);
  const errors = [
    ...(missing.length > 0 ? [`missing accepted locks: ${missing.join(", ")}`] : []),
    ...(unexpected.length > 0 ? [`unexpected accepted locks: ${unexpected.join(", ")}`] : []),
  ];
  const verified = [];
  for (const packageName of expectedNames) {
    const lockBytes = lockMap.get(packageName);
    if (!lockBytes) {
      continue;
    }
    try {
      verified.push(
        verifyAcceptedReleasePlan({
          manifest: params.manifest,
          packageName,
          lockBytes,
        }),
      );
    } catch (error) {
      errors.push(`${packageName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`accepted release plans rejected:\n${errors.join("\n")}`);
  }
  return verified;
}

function parseLockSpec(value) {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`invalid --lock value ${value}; expected package-name=path`);
  }
  return [value.slice(0, separator), value.slice(separator + 1)];
}

export function parseArgs(argv) {
  let manifestPath = "";
  const lockPaths = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if ((arg === "--manifest" || arg === "--lock") && (!value || value.startsWith("--"))) {
      throw new Error(`${arg} requires a value`);
    }
    if (arg === "--manifest") {
      manifestPath = value;
      index += 1;
    } else if (arg === "--lock") {
      const [packageName, lockPath] = parseLockSpec(value);
      if (lockPaths.has(packageName)) {
        throw new Error(`duplicate --lock package ${packageName}`);
      }
      lockPaths.set(packageName, lockPath);
      index += 1;
    } else {
      throw new Error(`unknown argument ${arg}\n${usage()}`);
    }
  }
  if (!manifestPath || lockPaths.size === 0) {
    throw new Error(usage());
  }
  return { manifestPath, lockPaths };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const manifest = parseReleaseManifestBytes(fs.readFileSync(path.resolve(args.manifestPath)));
    const locks = new Map(
      [...args.lockPaths].map(([packageName, lockPath]) => [
        packageName,
        fs.readFileSync(path.resolve(lockPath)),
      ]),
    );
    console.log(JSON.stringify({ verified: verifyAcceptedReleasePlans({ manifest, locks }) }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
