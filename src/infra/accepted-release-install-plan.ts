// Verifies receipt-bound npm install plans before accepted package installation.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import type { ReleaseArtifact } from "../release-manifest.js";
import type { AcceptedReleaseArtifact } from "./accepted-release-receipt.js";

const MAX_LOCK_BYTES = 32 * 1024 * 1024;
const NPM_INTEGRITY_PATTERN = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/u;

type JsonRecord = Record<string, unknown>;

export type AcceptedReleaseInstallPlan = {
  lockSha256: string;
  resolvedObjectSetSha256: string;
  resolvedObjectCount: number;
  pluginPayloadSha256?: string;
  pluginManifestSha256?: string;
};

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || /[\t\r\n]/u.test(value)) {
    throw new Error(`${label} must be a non-empty single-line string`);
  }
  return value;
}

function parseLock(bytes: Buffer, label: string): JsonRecord {
  if (bytes.byteLength > MAX_LOCK_BYTES) {
    throw new Error(`${label} exceeds the supported size`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(`${label} is invalid JSON`, { cause: error });
  }
  if (!isRecord(parsed) || parsed.lockfileVersion !== 3 || !isRecord(parsed.packages)) {
    throw new Error(`${label} must be an npm lockfileVersion 3 package lock`);
  }
  return parsed;
}

function validateNpmIntegrity(value: string, label: string): void {
  const match = NPM_INTEGRITY_PATTERN.exec(value);
  if (!match) {
    throw new Error(`${label} has invalid npm integrity`);
  }
  const algorithm = match[1] as "sha256" | "sha384" | "sha512";
  const encoded = match[2] ?? "";
  const expectedBytes = { sha256: 32, sha384: 48, sha512: 64 }[algorithm];
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.byteLength !== expectedBytes || decoded.toString("base64") !== encoded) {
    throw new Error(`${label} has invalid npm integrity`);
  }
}

function validateRegistryObject(params: {
  packagePath: string;
  resolved: string;
  integrity: string;
  registry: string;
}): void {
  let resolvedUrl: URL;
  let registryUrl: URL;
  try {
    resolvedUrl = new URL(params.resolved);
    registryUrl = new URL(params.registry);
  } catch (error) {
    throw new Error(`${params.packagePath} has an invalid resolved URL`, { cause: error });
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
    throw new Error(`${params.packagePath} resolved outside accepted registry ${params.registry}`);
  }
  validateNpmIntegrity(params.integrity, params.packagePath);
}

function projectRegistryObjects(params: {
  lock: JsonRecord;
  registry: string;
  allowAcceptedLocalPackage?: { packageName: string; packageVersion: string };
}): { projection: string; count: number; digest: string; localPackageFound: boolean } {
  const packages = params.lock.packages as JsonRecord;
  const objectRows = new Set<string>();
  let localPackageFound = false;
  const expectedLocalPath = params.allowAcceptedLocalPackage
    ? `node_modules/${params.allowAcceptedLocalPackage.packageName}`
    : null;

  for (const packagePath of Object.keys(packages).filter(Boolean).toSorted(compareUtf8)) {
    const entry = packages[packagePath];
    if (!isRecord(entry)) {
      throw new Error(`${packagePath} lock entry must be an object`);
    }
    const version = requireString(entry.version, `${packagePath}.version`);
    const resolved = requireString(entry.resolved, `${packagePath}.resolved`);
    if (expectedLocalPath === packagePath && resolved.startsWith("file:")) {
      if (version !== params.allowAcceptedLocalPackage?.packageVersion) {
        throw new Error(
          `${packagePath} local package version does not match the accepted artifact`,
        );
      }
      const localPath = resolved.slice("file:".length);
      if (
        !localPath ||
        path.isAbsolute(localPath) ||
        localPath.split(/[\\/]/u).some((part) => part === "..")
      ) {
        throw new Error(`${packagePath} has an unsafe local package resolution`);
      }
      localPackageFound = true;
      continue;
    }
    const integrity = requireString(entry.integrity, `${packagePath}.integrity`);
    validateRegistryObject({ packagePath, resolved, integrity, registry: params.registry });
    objectRows.add(`${version}\t${resolved}\t${integrity}\n`);
  }

  const rows = [...objectRows].toSorted(compareUtf8);
  const projection = rows.join("");
  return {
    projection,
    count: rows.length,
    digest: sha256(Buffer.from(projection, "utf8")),
    localPackageFound,
  };
}

function verifyPlanProjection(params: {
  label: string;
  lockBytes: Buffer;
  lock: JsonRecord;
  artifact: ReleaseArtifact;
}): AcceptedReleaseInstallPlan {
  const packages = params.lock.packages as JsonRecord;
  const root = packages[""];
  if (!isRecord(root)) {
    throw new Error(`${params.label} must contain a root package entry`);
  }
  const lockName = requireString(params.lock.name, `${params.label} name`);
  const lockVersion = requireString(params.lock.version, `${params.label} version`);
  const rootName = requireString(root.name, `${params.label} root name`);
  const rootVersion = requireString(root.version, `${params.label} root version`);
  if (
    lockName !== params.artifact.packageName ||
    rootName !== params.artifact.packageName ||
    lockVersion !== params.artifact.packageVersion ||
    rootVersion !== params.artifact.packageVersion
  ) {
    throw new Error(`${params.label} package identity does not match the accepted artifact`);
  }

  const projected = projectRegistryObjects({
    lock: params.lock,
    registry: params.artifact.installPlan.registry,
  });
  const lockSha256 = sha256(params.lockBytes);
  const errors: string[] = [];
  if (lockSha256 !== params.artifact.installPlan.lockSha256) {
    errors.push(
      `lock digest expected ${params.artifact.installPlan.lockSha256}, observed ${lockSha256}`,
    );
  }
  if (projected.count !== params.artifact.installPlan.resolvedObjectCount) {
    errors.push(
      `resolved object count expected ${params.artifact.installPlan.resolvedObjectCount}, observed ${projected.count}`,
    );
  }
  if (projected.digest !== params.artifact.installPlan.resolvedObjectSetSha256) {
    errors.push(
      `resolved object-set digest expected ${params.artifact.installPlan.resolvedObjectSetSha256}, observed ${projected.digest}`,
    );
  }
  if (errors.length > 0) {
    throw new Error(
      `${params.label} does not reproduce the accepted install plan: ${errors.join("; ")}`,
    );
  }
  return {
    lockSha256,
    resolvedObjectSetSha256: projected.digest,
    resolvedObjectCount: projected.count,
  };
}

async function readRegularFile(filePath: string, label: string): Promise<Buffer> {
  const stat = await fs.lstat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error(`${label} must be a regular non-linked file`);
  }
  return await fs.readFile(filePath);
}

async function digestPackageTree(packageRoot: string): Promise<string> {
  const rows: string[] = [];
  const visit = async (relativeDir: string): Promise<void> => {
    const absoluteDir = path.join(packageRoot, relativeDir);
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    for (const entry of entries.toSorted((left, right) => compareUtf8(left.name, right.name))) {
      const relativePath = path.join(relativeDir, entry.name);
      const portablePath = relativePath.split(path.sep).join("/");
      const absolutePath = path.join(packageRoot, relativePath);
      const stat = await fs.lstat(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`accepted plugin payload contains a symbolic link: ${portablePath}`);
      }
      if (stat.isDirectory()) {
        // Dependency bytes are bound separately by the accepted managed-project lock.
        if (entry.name === "node_modules") {
          continue;
        }
        await visit(relativePath);
        continue;
      }
      if (!stat.isFile() || stat.nlink !== 1) {
        throw new Error(`accepted plugin payload contains a non-regular file: ${portablePath}`);
      }
      const bytes = await fs.readFile(absolutePath);
      rows.push(`${portablePath}\0${bytes.byteLength}\0${sha256(bytes)}\n`);
    }
  };
  await visit("");
  return sha256(Buffer.from(rows.join(""), "utf8"));
}

export type AcceptedPluginPayloadIdentity = {
  pluginPayloadSha256: string;
  pluginManifestSha256: string;
};

/** Hash the complete accepted plugin package payload without executing it. */
export async function readAcceptedPluginPayloadIdentity(
  packageRoot: string,
): Promise<AcceptedPluginPayloadIdentity> {
  const pluginManifest = await readRegularFile(
    path.join(packageRoot, "openclaw.plugin.json"),
    "accepted plugin manifest",
  );
  return {
    pluginPayloadSha256: await digestPackageTree(packageRoot),
    pluginManifestSha256: sha256(pluginManifest),
  };
}

/** Require the installed package bytes to match the identity derived from its accepted archive. */
export async function verifyInstalledAcceptedPluginPayload(params: {
  packageRoot: string;
  expected: AcceptedPluginPayloadIdentity;
}): Promise<void> {
  const observed = await readAcceptedPluginPayloadIdentity(params.packageRoot);
  if (
    observed.pluginPayloadSha256 !== params.expected.pluginPayloadSha256 ||
    observed.pluginManifestSha256 !== params.expected.pluginManifestSha256
  ) {
    throw new Error("installed accepted plugin payload bytes do not match its accepted archive");
  }
}

function assertArtifactAgreement(params: {
  receiptArtifact: AcceptedReleaseArtifact;
  manifestArtifact: ReleaseArtifact;
}): void {
  if (
    params.receiptArtifact.role !== params.manifestArtifact.role ||
    params.receiptArtifact.packageName !== params.manifestArtifact.packageName ||
    params.receiptArtifact.version !== params.manifestArtifact.packageVersion
  ) {
    throw new Error("accepted artifact does not match its release-manifest install plan");
  }
}

/** Verify the publishable shrinkwrap embedded in an accepted npm tarball. */
export async function verifyAcceptedReleaseArtifactInstallPlan(params: {
  archivePath: string;
  receiptArtifact: AcceptedReleaseArtifact;
  manifestArtifact: ReleaseArtifact;
}): Promise<AcceptedReleaseInstallPlan> {
  assertArtifactAgreement(params);
  const extractRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-accepted-plan-"));
  try {
    await tar.x({
      cwd: extractRoot,
      file: params.archivePath,
      preservePaths: false,
      strict: true,
    });
    const packageRoot = path.join(extractRoot, "package");
    const [packageJsonBytes, lockBytes] = await Promise.all([
      readRegularFile(path.join(packageRoot, "package.json"), "accepted package metadata"),
      readRegularFile(path.join(packageRoot, "npm-shrinkwrap.json"), "accepted package shrinkwrap"),
    ]);
    let packageJson: unknown;
    try {
      packageJson = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(packageJsonBytes));
    } catch (error) {
      throw new Error("accepted package metadata is invalid JSON", { cause: error });
    }
    if (
      !isRecord(packageJson) ||
      packageJson.name !== params.manifestArtifact.packageName ||
      packageJson.version !== params.manifestArtifact.packageVersion
    ) {
      throw new Error("accepted package metadata does not match the release manifest");
    }
    const label = `${params.manifestArtifact.packageName} accepted shrinkwrap`;
    const plan = verifyPlanProjection({
      label,
      lockBytes,
      lock: parseLock(lockBytes, label),
      artifact: params.manifestArtifact,
    });
    if (params.manifestArtifact.role !== "plugin") {
      return plan;
    }
    return {
      ...plan,
      ...(await readAcceptedPluginPayloadIdentity(packageRoot)),
    };
  } finally {
    await fs.rm(extractRoot, { recursive: true, force: true });
  }
}

/** Verify the exact shrinkwrap retained in a staged or installed core package. */
export async function verifyInstalledAcceptedPackagePlan(params: {
  packageRoot: string;
  manifestArtifact: ReleaseArtifact;
}): Promise<AcceptedReleaseInstallPlan> {
  const lockPath = path.join(params.packageRoot, "npm-shrinkwrap.json");
  const lockBytes = await readRegularFile(lockPath, "installed accepted package shrinkwrap");
  const label = `${params.manifestArtifact.packageName} installed shrinkwrap`;
  return verifyPlanProjection({
    label,
    lockBytes,
    lock: parseLock(lockBytes, label),
    artifact: params.manifestArtifact,
  });
}

/** Verify that native npm-pack staging installed only the accepted registry object set. */
export async function verifyInstalledAcceptedPluginPlan(params: {
  projectRoot: string;
  manifestArtifact: ReleaseArtifact;
}): Promise<void> {
  const lockPath = path.join(params.projectRoot, "package-lock.json");
  const lockBytes = await readRegularFile(lockPath, "accepted plugin managed-project lock");
  const lock = parseLock(lockBytes, "accepted plugin managed-project lock");
  const projected = projectRegistryObjects({
    lock,
    registry: params.manifestArtifact.installPlan.registry,
    allowAcceptedLocalPackage: {
      packageName: params.manifestArtifact.packageName,
      packageVersion: params.manifestArtifact.packageVersion,
    },
  });
  if (!projected.localPackageFound) {
    throw new Error("accepted plugin managed-project lock is missing its local npm-pack artifact");
  }
  if (
    projected.count !== params.manifestArtifact.installPlan.resolvedObjectCount ||
    projected.digest !== params.manifestArtifact.installPlan.resolvedObjectSetSha256
  ) {
    throw new Error("accepted plugin managed-project lock contains an unaccepted object set");
  }
}
