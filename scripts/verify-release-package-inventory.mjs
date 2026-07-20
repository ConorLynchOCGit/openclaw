#!/usr/bin/env node
// Verifies the exact root/plugin tarball set produced by native npm pack owners.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as tar from "tar";
import {
  parseReleaseManifestBytes,
  PROTOTYPE_B_PACKAGE_SHAPE,
  RELEASE_MANIFEST_FILENAME,
  releaseManifestDigest,
} from "./lib/release-manifest.mjs";

const MAX_METADATA_BYTES = 1024 * 1024;

function usage() {
  return "usage: node scripts/verify-release-package-inventory.mjs --manifest <release-manifest.json> --artifact <package.tgz> [--artifact ...]";
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function digest(algorithm, bytes, encoding = "hex") {
  return createHash(algorithm).update(bytes).digest(encoding);
}

function normalizeTarPath(rawPath) {
  if (rawPath.includes("\\")) {
    throw new Error(`unsafe package tar entry ${rawPath}`);
  }
  const normalized = rawPath.replace(/^\.\//u, "").replace(/\/+$/u, "");
  if (normalized === "package") {
    return "";
  }
  if (!normalized.startsWith("package/")) {
    throw new Error(`unsafe package tar entry ${rawPath}`);
  }
  const relativePath = normalized.slice("package/".length);
  const segments = relativePath.split("/");
  if (
    !relativePath ||
    relativePath.startsWith("/") ||
    segments.includes("") ||
    segments.includes(".") ||
    segments.includes("..")
  ) {
    throw new Error(`unsafe package tar entry ${rawPath}`);
  }
  return relativePath;
}

function shouldCaptureMetadata(relativePath) {
  return (
    relativePath === "package.json" ||
    relativePath === RELEASE_MANIFEST_FILENAME ||
    relativePath.endsWith(`/${RELEASE_MANIFEST_FILENAME}`) ||
    relativePath === "openclaw.plugin.json" ||
    relativePath.endsWith("/openclaw.plugin.json")
  );
}

function captureEntry(entry, relativePath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let rejected = false;
    entry.on("data", (chunk) => {
      if (rejected) {
        return;
      }
      totalBytes += chunk.length;
      if (totalBytes > MAX_METADATA_BYTES) {
        rejected = true;
        reject(new Error(`package metadata exceeds ${MAX_METADATA_BYTES} bytes: ${relativePath}`));
        entry.resume();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    entry.on("end", () => resolve(Buffer.concat(chunks)));
    entry.on("error", reject);
  });
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(
      `${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function parsePluginManifest(bytes, relativePath) {
  const parsed = parseJson(bytes, relativePath);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${relativePath} must contain an object`);
  }
  if (typeof parsed.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/u.test(parsed.id)) {
    throw new Error(`${relativePath} has an invalid plugin id`);
  }
  return { pluginId: parsed.id, sha256: digest("sha256", bytes) };
}

export async function inspectReleasePackageArtifact(artifactPath) {
  const absolutePath = path.resolve(artifactPath);
  const archiveBytes = fs.readFileSync(absolutePath);
  const files = [];
  const seenPaths = new Set();
  const metadataPromises = new Map();

  const parser = tar.t({
    gzip: true,
    strict: true,
    onentry: (entry) => {
      const relativePath = normalizeTarPath(entry.path);
      if (entry.type === "Directory") {
        entry.resume();
        return;
      }
      const isFile = entry.type === "File" || entry.type === "OldFile";
      if (!isFile) {
        throw new Error(`package tar contains unsupported ${entry.type} entry ${relativePath}`);
      }
      if (!relativePath) {
        throw new Error(`package tar contains an empty file path`);
      }
      if (seenPaths.has(relativePath)) {
        throw new Error(`package tar contains duplicate file ${relativePath}`);
      }
      seenPaths.add(relativePath);
      files.push({ path: relativePath, size: entry.size, mode: entry.mode ?? 0 });
      if (shouldCaptureMetadata(relativePath)) {
        metadataPromises.set(relativePath, captureEntry(entry, relativePath));
      } else {
        entry.resume();
      }
    },
  });
  await new Promise((resolve, reject) => {
    parser.on("error", reject);
    parser.on("end", resolve);
    parser.end(archiveBytes);
  });

  const metadata = new Map();
  for (const [relativePath, promise] of metadataPromises) {
    metadata.set(relativePath, await promise);
  }
  const packageJsonBytes = metadata.get("package.json");
  if (!packageJsonBytes) {
    throw new Error(`${absolutePath} does not contain package/package.json`);
  }
  const packageJson = parseJson(packageJsonBytes, `${absolutePath}:package.json`);
  if (
    !packageJson ||
    typeof packageJson !== "object" ||
    Array.isArray(packageJson) ||
    typeof packageJson.name !== "string" ||
    typeof packageJson.version !== "string"
  ) {
    throw new Error(`${absolutePath}:package.json must contain package name and version`);
  }

  const pluginManifestDigests = [...metadata.entries()]
    .filter(([relativePath]) => relativePath.endsWith("openclaw.plugin.json"))
    .map(([relativePath, bytes]) => parsePluginManifest(bytes, relativePath))
    .toSorted((left, right) => compareUtf8(left.pluginId, right.pluginId));
  for (let index = 1; index < pluginManifestDigests.length; index += 1) {
    if (pluginManifestDigests[index - 1].pluginId === pluginManifestDigests[index].pluginId) {
      throw new Error(
        `${packageJson.name} contains duplicate plugin manifest ${pluginManifestDigests[index].pluginId}`,
      );
    }
  }

  const packlistProjection = files
    .toSorted((left, right) => compareUtf8(left.path, right.path))
    .map((file) => `${file.path}\t${file.size}\t${file.mode.toString(8)}\n`)
    .join("");

  return {
    packageJson,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    artifactSha256: digest("sha256", archiveBytes),
    npmShasum: digest("sha1", archiveBytes),
    npmIntegrity: `sha512-${digest("sha512", archiveBytes, "base64")}`,
    packedBytes: archiveBytes.length,
    fileCount: files.length,
    packlistSha256: digest("sha256", Buffer.from(packlistProjection, "utf8")),
    pluginManifestDigests,
    embeddedManifests: [...metadata.entries()].filter(
      ([relativePath]) =>
        relativePath === RELEASE_MANIFEST_FILENAME ||
        relativePath.endsWith(`/${RELEASE_MANIFEST_FILENAME}`),
    ),
  };
}

function assertSameStringSet(actual, expected, label) {
  const actualSorted = [...actual].toSorted(compareUtf8);
  const expectedSorted = [...expected].toSorted(compareUtf8);
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    throw new Error(
      `${label} mismatch: expected ${expectedSorted.join(", ") || "<none>"}; observed ${actualSorted.join(", ") || "<none>"}`,
    );
  }
}

export async function verifyReleasePackageInventory(params) {
  const manifestBytes = Buffer.isBuffer(params.manifestBytes)
    ? params.manifestBytes
    : Buffer.from(params.manifestBytes);
  const manifest = parseReleaseManifestBytes(manifestBytes);
  if (params.artifactPaths.length !== manifest.artifacts.length) {
    throw new Error(
      `release package artifact count mismatch: expected ${manifest.artifacts.length}, observed ${params.artifactPaths.length}`,
    );
  }
  const inspected = await Promise.all(
    params.artifactPaths.map((artifactPath) => inspectReleasePackageArtifact(artifactPath)),
  );
  const byPackageName = new Map();
  for (const artifact of inspected) {
    if (byPackageName.has(artifact.packageName)) {
      throw new Error(`duplicate release package artifact ${artifact.packageName}`);
    }
    byPackageName.set(artifact.packageName, artifact);
  }
  const expectedNames = new Set(manifest.artifacts.map((artifact) => artifact.packageName));
  assertSameStringSet(byPackageName.keys(), expectedNames, "release package names");

  const manifestDigest = releaseManifestDigest(manifestBytes);
  return manifest.artifacts.map((expected) => {
    const observed = byPackageName.get(expected.packageName);
    if (observed.packageVersion !== expected.packageVersion) {
      throw new Error(
        `${expected.packageName} version mismatch: expected ${expected.packageVersion}, observed ${observed.packageVersion}`,
      );
    }
    assertSameStringSet(
      observed.pluginManifestDigests.map((entry) => entry.pluginId),
      expected.ownedPluginIds,
      `${expected.packageName} owned plugin ids`,
    );
    if (expected.role === "core") {
      if (
        observed.embeddedManifests.length !== 1 ||
        observed.embeddedManifests[0]?.[0] !== RELEASE_MANIFEST_FILENAME ||
        !observed.embeddedManifests[0][1].equals(manifestBytes)
      ) {
        throw new Error(`core package does not contain the exact accepted release manifest bytes`);
      }
      const release = observed.packageJson.openclaw?.release;
      if (
        release?.packageShape !== PROTOTYPE_B_PACKAGE_SHAPE ||
        release?.manifestPath !== RELEASE_MANIFEST_FILENAME ||
        release?.manifestSha256 !== manifestDigest
      ) {
        throw new Error(`core package metadata does not bind the embedded release manifest`);
      }
    } else {
      if (observed.embeddedManifests.length > 0) {
        throw new Error(
          `${expected.packageName} plugin package must not embed a second release manifest`,
        );
      }
      if (observed.packageJson.openclaw?.compat?.pluginApi !== expected.compatibilityRange) {
        throw new Error(
          `${expected.packageName} compatibility mismatch: expected ${expected.compatibilityRange}, observed ${String(observed.packageJson.openclaw?.compat?.pluginApi)}`,
        );
      }
    }
    return {
      role: expected.role,
      packageName: expected.packageName,
      packageVersion: expected.packageVersion,
      artifactSha256: observed.artifactSha256,
      npmIntegrity: observed.npmIntegrity,
      npmShasum: observed.npmShasum,
      packedBytes: observed.packedBytes,
      fileCount: observed.fileCount,
      packlistSha256: observed.packlistSha256,
      pluginManifestDigests: observed.pluginManifestDigests,
    };
  });
}

export function parseArgs(argv) {
  let manifestPath = "";
  const artifactPaths = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if ((arg === "--manifest" || arg === "--artifact") && (!value || value.startsWith("--"))) {
      throw new Error(`${arg} requires a value`);
    }
    if (arg === "--manifest") {
      manifestPath = value;
      index += 1;
    } else if (arg === "--artifact") {
      artifactPaths.push(value);
      index += 1;
    } else {
      throw new Error(`unknown argument ${arg}\n${usage()}`);
    }
  }
  if (!manifestPath || artifactPaths.length === 0) {
    throw new Error(usage());
  }
  return { manifestPath, artifactPaths };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const manifestBytes = fs.readFileSync(path.resolve(args.manifestPath));
    const packages = await verifyReleasePackageInventory({
      manifestBytes,
      artifactPaths: args.artifactPaths,
    });
    console.log(
      JSON.stringify({ releaseManifestDigest: releaseManifestDigest(manifestBytes), packages }),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
