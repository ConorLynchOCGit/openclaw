#!/usr/bin/env node
import { spawn } from "node:child_process";
// Builds and candidate-tests one receipt-bound native OpenClaw release set.
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as tar from "tar";
import { embedReleaseManifest } from "./generate-release-manifest.mjs";
import {
  parseReleaseManifestBytes,
  PROTOTYPE_B_PACKAGE_SHAPE,
  serializeReleaseManifest,
} from "./lib/release-manifest.mjs";
import {
  projectResolvedObjectSet,
  verifyAcceptedReleasePlans,
} from "./verify-accepted-release-plans.mjs";
import { verifyReleasePackageInventory } from "./verify-release-package-inventory.mjs";

const DRIVER_PROTOCOL = "openclaw.release.prepare.driver.v1";
const COMMAND_TIMEOUT_MS = 45 * 60 * 1000;
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const PLUGIN_PACK_CONCURRENCY = 4;
const activeChildren = new Set();

function usage() {
  return "usage: node scripts/prepare-native-release-set.mjs --input <driver-input.json> --output <driver-result.json>";
}

export function parseArgs(argv) {
  let inputPath = "";
  let outputPath = "";
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if ((option === "--input" || option === "--output") && (!value || value.startsWith("--"))) {
      throw new Error(`${option} requires a value`);
    }
    if (option === "--input") {
      inputPath = value;
      index += 1;
    } else if (option === "--output") {
      outputPath = value;
      index += 1;
    } else {
      throw new Error(`${usage()}\nunknown argument ${String(option)}`);
    }
  }
  if (!inputPath || !outputPath) {
    throw new Error(usage());
  }
  return { inputPath: path.resolve(inputPath), outputPath: path.resolve(outputPath) };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function ensureBelow(root, candidate, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} escapes its operation root`);
  }
  return resolved;
}

function parseInput(value) {
  const input = requireRecord(value, "release driver input");
  if (input.schema !== "openclaw.release.prepare.driver-input.v1") {
    throw new Error("release driver input has an unsupported schema");
  }
  const snapshot = requireRecord(input.snapshot, "release driver snapshot");
  const predecessor = requireRecord(input.predecessor, "release driver predecessor");
  if (!Array.isArray(predecessor.artifacts) || predecessor.artifacts.length === 0) {
    throw new Error("release driver predecessor has no artifacts");
  }
  return {
    schema: input.schema,
    operationId: requireString(input.operationId, "release driver operation ID"),
    snapshot: {
      repoRoot: path.resolve(requireString(snapshot.repoRoot, "snapshot repository")),
      ref: requireString(snapshot.ref, "snapshot ref"),
      treeObject: requireString(snapshot.treeObject, "snapshot tree"),
    },
    predecessor: {
      receiptId: requireString(predecessor.receiptId, "predecessor receipt ID"),
      manifestPath: path.resolve(
        requireString(predecessor.manifestPath, "predecessor manifest path"),
      ),
      releaseManifestDigest: requireString(
        predecessor.releaseManifestDigest,
        "predecessor manifest digest",
      ),
      sourceTreeObject: requireString(predecessor.sourceTreeObject, "predecessor source tree"),
      artifacts: predecessor.artifacts.map((value, index) => {
        const artifact = requireRecord(value, `predecessor artifact ${index}`);
        if (artifact.role !== "core" && artifact.role !== "plugin") {
          throw new Error(`predecessor artifact ${index} has an invalid role`);
        }
        return {
          role: artifact.role,
          packageName: requireString(artifact.packageName, `predecessor artifact ${index} name`),
          version: requireString(artifact.version, `predecessor artifact ${index} version`),
          path: path.resolve(requireString(artifact.path, `predecessor artifact ${index} path`)),
          sha256: requireString(artifact.sha256, `predecessor artifact ${index} digest`),
        };
      }),
    },
  };
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `${label} is invalid: ${error instanceof Error ? error.message : String(error)}`,
      {
        cause: error,
      },
    );
  }
}

async function writeJsonAtomic(filePath, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
  try {
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function killChild(child, signal) {
  if (!child.pid) {
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of activeChildren) {
      killChild(child, signal);
    }
  });
}

async function runCommand(params) {
  const logPath = path.join(params.logRoot, `${params.id}.log`);
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  const log = await fs.open(logPath, "w", 0o600);
  process.stderr.write(`release.prepare: ${params.id} started\n`);
  const startedAt = Date.now();
  try {
    const child = spawn(params.command, params.args, {
      cwd: params.cwd,
      env: { ...process.env, ...params.env },
      detached: process.platform !== "win32",
      stdio: ["ignore", log.fd, log.fd],
    });
    activeChildren.add(child);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      killChild(child, "SIGTERM");
      setTimeout(() => killChild(child, "SIGKILL"), 5_000).unref();
    }, params.timeoutMs ?? COMMAND_TIMEOUT_MS);
    try {
      const result = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, closeSignal) => resolve({ code, signal: closeSignal }));
      });
      if (timedOut || result.code !== 0) {
        throw new Error(
          `${params.id} failed (${timedOut ? "timeout" : (result.code ?? result.signal)}); see ${logPath}`,
        );
      }
    } finally {
      clearTimeout(timeout);
      activeChildren.delete(child);
    }
  } finally {
    await log.close();
  }
  process.stderr.write(
    `release.prepare: ${params.id} passed in ${Math.ceil((Date.now() - startedAt) / 1000)}s\n`,
  );
  return logPath;
}

async function runCapture(command, args, cwd, env = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    const append = (target, chunk) => {
      const next = Buffer.concat([target, chunk]);
      if (next.length > MAX_CAPTURE_BYTES) {
        child.kill("SIGKILL");
        throw new Error(`${command} output exceeded ${MAX_CAPTURE_BYTES} bytes`);
      }
      return next;
    };
    child.stdout.on("data", (chunk) => {
      try {
        stdout = append(stdout, Buffer.from(chunk));
      } catch (error) {
        reject(error);
      }
    });
    child.stderr.on("data", (chunk) => {
      try {
        stderr = append(stderr, Buffer.from(chunk));
      } catch (error) {
        reject(error);
      }
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code !== 0) {
        reject(
          new Error(
            `${command} ${args.join(" ")} failed (${code ?? signal}): ${stderr.toString("utf8").trim()}`,
          ),
        );
        return;
      }
      resolve({ stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8") });
    });
  });
}

async function hashFile(filePath) {
  return sha256(await fs.readFile(filePath));
}

async function hashTree(root) {
  const rows = [];
  async function visit(relativeDirectory) {
    const directory = path.join(root, relativeDirectory);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.toSorted((left, right) => compareUtf8(left.name, right.name))) {
      const relativePath = path.join(relativeDirectory, entry.name);
      const portable = relativePath.split(path.sep).join("/");
      const absolute = path.join(root, relativePath);
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) {
        rows.push(`${portable}\0symlink\0${await fs.readlink(absolute)}\n`);
      } else if (stat.isDirectory()) {
        await visit(relativePath);
      } else if (stat.isFile()) {
        rows.push(`${portable}\0${stat.mode & 0o777}\0${sha256(await fs.readFile(absolute))}\n`);
      } else {
        throw new Error(`release profile contains unsupported file type: ${portable}`);
      }
    }
  }
  await visit("");
  return sha256(Buffer.from(rows.join(""), "utf8"));
}

async function materializeSnapshot(input, stageRoot, logRoot) {
  await fs.rm(stageRoot, { force: true, recursive: true });
  await fs.mkdir(stageRoot, { recursive: true, mode: 0o700 });
  const archivePath = path.join(path.dirname(stageRoot), `${path.basename(stageRoot)}.tar`);
  await fs.rm(archivePath, { force: true });
  await runCommand({
    id: `${path.basename(stageRoot)}-git-archive`,
    command: "git",
    args: [
      "-C",
      input.snapshot.repoRoot,
      "archive",
      "--format=tar",
      "--output",
      archivePath,
      input.snapshot.ref,
    ],
    cwd: path.dirname(stageRoot),
    logRoot,
  });
  try {
    await tar.x({ cwd: stageRoot, file: archivePath, preservePaths: false, strict: true });
  } finally {
    await fs.rm(archivePath, { force: true });
  }
}

export function deriveReleaseVersion(baseVersion, sourceTreeObject, buildInputDigest) {
  const parts = baseVersion.split("-", 1)[0].split(".");
  if (
    parts.length !== 3 ||
    parts.some((part) => !part || [...part].some((char) => char < "0" || char > "9"))
  ) {
    throw new Error(`cannot derive an internal release version from ${baseVersion}`);
  }
  const identity = sha256(
    Buffer.from(
      `${baseVersion}\0${sourceTreeObject}\0${buildInputDigest}\0${PROTOTYPE_B_PACKAGE_SHAPE}`,
      "utf8",
    ),
  );
  const correction = (BigInt(`0x${identity.slice(0, 13)}`) + 1n).toString(10);
  return `${parts.join(".")}-${correction}`;
}

async function writeRootVersion(stageRoot, version) {
  const packagePath = path.join(stageRoot, "package.json");
  const packageJson = await readJson(packagePath, "root package.json");
  packageJson.version = version;
  await fs.writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  const changelogPath = path.join(stageRoot, "CHANGELOG.md");
  const changelog = await fs.readFile(changelogPath, "utf8");
  const heading = `## ${version}\n`;
  if (!changelog.includes(heading)) {
    const entry = `${heading}\n### Changes\n\n- Internal accepted OpenClaw release built from an immutable native worktree snapshot.\n\n`;
    const firstBreak = changelog.indexOf("\n\n");
    const updated =
      firstBreak < 0
        ? `${changelog.trimEnd()}\n\n${entry}`
        : `${changelog.slice(0, firstBreak + 2)}${entry}${changelog.slice(firstBreak + 2)}`;
    await fs.writeFile(changelogPath, updated, "utf8");
  }
}

async function discoverPackages(stageRoot) {
  const result = new Map();
  const extensionsRoot = path.join(stageRoot, "extensions");
  for (const entry of await fs.readdir(extensionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const packageRoot = path.join(extensionsRoot, entry.name);
    try {
      const packageJson = await readJson(path.join(packageRoot, "package.json"), "plugin package");
      if (typeof packageJson.name === "string") {
        result.set(packageJson.name, { packageRoot, packageJson });
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return result;
}

async function generateShrinkwrap(stageRoot, packageRoot, id, logRoot) {
  await runCommand({
    id,
    command: process.execPath,
    args: [
      path.join(stageRoot, "scripts", "generate-npm-shrinkwrap.mjs"),
      "--package-dir",
      path.relative(stageRoot, packageRoot) || ".",
    ],
    cwd: stageRoot,
    logRoot,
  });
  return await fs.readFile(path.join(packageRoot, "npm-shrinkwrap.json"));
}

async function toolchainDigest(stageRoot) {
  const [npm, pnpm] = await Promise.all([
    runCapture("npm", ["--version"], stageRoot),
    runCapture("pnpm", ["--version"], stageRoot),
  ]);
  const driverBytes = await fs.readFile(fileURLToPath(import.meta.url));
  return sha256(
    Buffer.from(
      JSON.stringify({
        driverProtocol: DRIVER_PROTOCOL,
        driverSha256: sha256(driverBytes),
        node: process.version,
        npm: npm.stdout.trim(),
        pnpm: pnpm.stdout.trim(),
        platform: process.platform,
        arch: process.arch,
      }),
      "utf8",
    ),
  );
}

async function buildInstallPlan(lockBytes, registry) {
  const projection = projectResolvedObjectSet(lockBytes, registry);
  return {
    registry,
    lockSha256: sha256(lockBytes),
    resolvedObjectSetSha256: projection.resolvedObjectSetSha256,
    resolvedObjectCount: projection.resolvedObjectCount,
  };
}

async function sourcePluginDescriptor(params) {
  const manifestPath = path.join(params.packageRoot, "openclaw.plugin.json");
  const pluginManifest = await readJson(manifestPath, `${params.packageName} plugin manifest`);
  const packageJson = await readJson(
    path.join(params.packageRoot, "package.json"),
    `${params.packageName} package.json`,
  );
  const pluginId = requireString(pluginManifest.id, `${params.packageName} plugin id`);
  const compatibilityRange = requireString(
    packageJson.openclaw?.compat?.pluginApi,
    `${params.packageName} plugin compatibility`,
  );
  return { pluginId, compatibilityRange, packageJson };
}

function insertBatch(items, width) {
  const batches = [];
  for (let index = 0; index < items.length; index += width) {
    batches.push(items.slice(index, index + width));
  }
  return batches;
}

async function findOnlyTarball(directory, packageName) {
  const entries = (await fs.readdir(directory)).filter((entry) => entry.endsWith(".tgz"));
  if (entries.length !== 1) {
    throw new Error(`${packageName} native pack produced ${entries.length} tarballs`);
  }
  return path.join(directory, entries[0]);
}

async function copyVerifiedPredecessorArtifact(artifact, outputRoot) {
  const observed = await hashFile(artifact.path);
  if (observed !== artifact.sha256) {
    throw new Error(`${artifact.packageName} predecessor artifact digest changed`);
  }
  const outputPath = path.join(outputRoot, path.basename(artifact.path));
  await fs.copyFile(artifact.path, outputPath, fsConstants.COPYFILE_EXCL);
  return outputPath;
}

async function packSourcePlugin(params) {
  const outputDir = path.join(params.outputRoot, "plugin", encodeURIComponent(params.packageName));
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
  await runCommand({
    id: `pack-${params.id}`,
    command: "bash",
    args: [
      path.join(params.stageRoot, "scripts", "plugin-npm-publish.sh"),
      "--pack",
      path.relative(params.stageRoot, params.packageRoot),
    ],
    cwd: params.stageRoot,
    logRoot: params.logRoot,
    env: { OPENCLAW_PLUGIN_NPM_PACK_OUTPUT_DIR: outputDir },
  });
  return await findOnlyTarball(outputDir, params.packageName);
}

async function extractShrinkwrap(artifactPath, extractRoot) {
  const root = path.join(extractRoot, sha256(Buffer.from(artifactPath, "utf8")));
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  await tar.x({ cwd: root, file: artifactPath, preservePaths: false, strict: true });
  return await fs.readFile(path.join(root, "package", "npm-shrinkwrap.json"));
}

async function prepareAttempt(params) {
  const stageRoot = path.join(params.attemptRoot, "source");
  const outputRoot = path.join(params.attemptRoot, "artifacts");
  const logRoot = path.join(params.attemptRoot, "logs");
  await fs.rm(params.attemptRoot, { force: true, recursive: true });
  await fs.mkdir(outputRoot, { recursive: true, mode: 0o700 });
  await materializeSnapshot(params.input, stageRoot, logRoot);

  const rootPackage = await readJson(path.join(stageRoot, "package.json"), "root package.json");
  const toolsDigest = await toolchainDigest(stageRoot);
  const buildInputDigest = sha256(
    Buffer.from(
      JSON.stringify({
        driverProtocol: DRIVER_PROTOCOL,
        sourceTreeObject: params.input.snapshot.treeObject,
        predecessorManifestDigest: params.input.predecessor.releaseManifestDigest,
        packageShape: PROTOTYPE_B_PACKAGE_SHAPE,
        toolchainDigest: toolsDigest,
      }),
      "utf8",
    ),
  );
  const version = deriveReleaseVersion(
    requireString(rootPackage.version, "root package version"),
    params.input.snapshot.treeObject,
    buildInputDigest,
  );
  await writeRootVersion(stageRoot, version);
  await runCommand({
    id: "sync-plugin-versions",
    command: process.execPath,
    args: ["--import", "tsx", path.join(stageRoot, "scripts", "sync-plugin-versions.ts")],
    cwd: stageRoot,
    logRoot,
  });

  const packageMap = await discoverPackages(stageRoot);
  const registry = params.predecessorManifest.artifacts[0].installPlan.registry;
  const artifacts = [];
  const lockMap = new Map();
  const rootLock = await generateShrinkwrap(stageRoot, stageRoot, "shrinkwrap-root", logRoot);
  lockMap.set("openclaw", rootLock);
  artifacts.push({
    role: "core",
    packageName: "openclaw",
    packageVersion: version,
    compatibilityRange: requireString(rootPackage.engines?.node, "root Node compatibility"),
    ownedPluginIds: [],
    installPlan: await buildInstallPlan(rootLock, registry),
  });

  const sourcePlugins = [];
  const reusedPlugins = [];
  for (const predecessorArtifact of params.predecessorManifest.artifacts.slice(1)) {
    const source = packageMap.get(predecessorArtifact.packageName);
    if (!source) {
      const receiptArtifact = params.input.predecessor.artifacts.find(
        (artifact) => artifact.packageName === predecessorArtifact.packageName,
      );
      if (!receiptArtifact) {
        throw new Error(
          `${predecessorArtifact.packageName} has no source package or predecessor artifact`,
        );
      }
      artifacts.push(predecessorArtifact);
      reusedPlugins.push({ predecessorArtifact, receiptArtifact });
      continue;
    }
    const descriptor = await sourcePluginDescriptor({
      packageName: predecessorArtifact.packageName,
      packageRoot: source.packageRoot,
    });
    if (
      predecessorArtifact.ownedPluginIds.length !== 1 ||
      predecessorArtifact.ownedPluginIds[0] !== descriptor.pluginId
    ) {
      throw new Error(`${predecessorArtifact.packageName} changed release-owned plugin identity`);
    }
    const lockBytes = await generateShrinkwrap(
      stageRoot,
      source.packageRoot,
      `shrinkwrap-${path.basename(source.packageRoot)}`,
      logRoot,
    );
    lockMap.set(predecessorArtifact.packageName, lockBytes);
    artifacts.push({
      role: "plugin",
      packageName: predecessorArtifact.packageName,
      packageVersion: version,
      compatibilityRange: descriptor.compatibilityRange,
      ownedPluginIds: predecessorArtifact.ownedPluginIds,
      installPlan: await buildInstallPlan(lockBytes, registry),
    });
    sourcePlugins.push({
      id: path.basename(source.packageRoot),
      packageName: predecessorArtifact.packageName,
      packageRoot: source.packageRoot,
    });
  }
  artifacts.splice(
    1,
    artifacts.length - 1,
    ...artifacts
      .slice(1)
      .toSorted((left, right) => compareUtf8(left.packageName, right.packageName)),
  );

  const aggregateLockRows = [...lockMap]
    .toSorted(([left], [right]) => compareUtf8(left, right))
    .map(([packageName, bytes]) => `${packageName}\0${sha256(bytes)}\n`)
    .join("");
  const codexProfileRoot = path.join(stageRoot, "extensions", "codex", "system-profile");
  const manifest = parseReleaseManifestBytes(
    Buffer.from(
      serializeReleaseManifest({
        releaseProtocolVersion: 1,
        source: {
          snapshotRef: params.input.snapshot.ref,
          treeObject: params.input.snapshot.treeObject,
        },
        predecessor: {
          releaseManifestDigest: params.input.predecessor.releaseManifestDigest,
          sourceTreeObject: params.input.predecessor.sourceTreeObject,
        },
        package: {
          version,
          shape: PROTOTYPE_B_PACKAGE_SHAPE,
          buildInputDigest,
          toolchainDigest: toolsDigest,
          lockfileDigest: sha256(Buffer.from(aggregateLockRows, "utf8")),
        },
        artifacts,
        codex: {
          profileDigest: await hashTree(path.join(codexProfileRoot, "project")),
          capabilityDigest: sha256(
            Buffer.from(
              [
                await hashTree(path.join(codexProfileRoot, "skills")),
                await hashTree(path.join(codexProfileRoot, "shared-skills")),
                await hashTree(path.join(codexProfileRoot, "tools")),
              ].join("\n"),
              "utf8",
            ),
          ),
          contributorGuidanceDigest: await hashTree(
            path.join(codexProfileRoot, "contributor-guidance"),
          ),
        },
        migration: { class: "migration_free", affectedPersistentRoots: [] },
        compatibility: params.predecessorManifest.compatibility,
        loadedReadiness: params.predecessorManifest.loadedReadiness,
      }),
      "utf8",
    ),
  );

  await runCommand({
    id: "build-all",
    command: process.execPath,
    args: [path.join(stageRoot, "scripts", "build-all.mjs")],
    cwd: stageRoot,
    logRoot,
    env: {
      OPENCLAW_BUILD_ALL_NO_PNPM: "1",
      OPENCLAW_RUN_NODE_SKIP_DTS_BUILD: "1",
    },
  });

  const packedByName = new Map();
  for (const batch of insertBatch(sourcePlugins, PLUGIN_PACK_CONCURRENCY)) {
    const packed = await Promise.all(
      batch.map(async (plugin) => [
        plugin.packageName,
        await packSourcePlugin({
          ...plugin,
          stageRoot,
          outputRoot,
          logRoot,
        }),
      ]),
    );
    for (const [packageName, artifactPath] of packed) {
      packedByName.set(packageName, artifactPath);
    }
  }
  const reusedRoot = path.join(outputRoot, "reused");
  await fs.mkdir(reusedRoot, { recursive: true, mode: 0o700 });
  for (const reused of reusedPlugins) {
    packedByName.set(
      reused.predecessorArtifact.packageName,
      await copyVerifiedPredecessorArtifact(reused.receiptArtifact, reusedRoot),
    );
  }

  const manifestPath = path.join(params.attemptRoot, "release-manifest.json");
  const manifestBytes = Buffer.from(serializeReleaseManifest(manifest), "utf8");
  await fs.writeFile(manifestPath, manifestBytes, { mode: 0o600 });
  await embedReleaseManifest({ packageRoot: stageRoot, manifest, check: false });
  const rootOutput = path.join(outputRoot, "core");
  await fs.mkdir(rootOutput, { recursive: true, mode: 0o700 });
  const rootName = `openclaw-${version}.tgz`;
  await runCommand({
    id: "pack-root",
    command: process.execPath,
    args: [
      path.join(stageRoot, "scripts", "package-openclaw-for-docker.mjs"),
      "--skip-build",
      "--output-dir",
      rootOutput,
      "--output-name",
      rootName,
    ],
    cwd: stageRoot,
    logRoot,
  });
  packedByName.set("openclaw", path.join(rootOutput, rootName));

  const artifactPaths = manifest.artifacts.map((artifact) => {
    const artifactPath = packedByName.get(artifact.packageName);
    if (!artifactPath) {
      throw new Error(`native pack did not produce ${artifact.packageName}`);
    }
    return artifactPath;
  });
  const inventory = await verifyReleasePackageInventory({ manifestBytes, artifactPaths });
  const extractRoot = path.join(params.attemptRoot, "lock-extract");
  await fs.mkdir(extractRoot, { recursive: true, mode: 0o700 });
  const packedLocks = new Map();
  for (const [index, artifactPath] of artifactPaths.entries()) {
    packedLocks.set(
      manifest.artifacts[index].packageName,
      await extractShrinkwrap(artifactPath, extractRoot),
    );
  }
  verifyAcceptedReleasePlans({ manifest, locks: packedLocks });
  return {
    stageRoot,
    manifest,
    manifestPath,
    manifestBytes,
    artifactPaths,
    inventory,
    logRoot,
  };
}

function compareAttempts(first, second) {
  if (!first.manifestBytes.equals(second.manifestBytes)) {
    throw new Error("independent release attempts produced different manifest bytes");
  }
  if (first.inventory.length !== second.inventory.length) {
    throw new Error("independent release attempts produced different artifact counts");
  }
  for (const [index, artifact] of first.inventory.entries()) {
    const other = second.inventory[index];
    if (
      !other ||
      artifact.packageName !== other.packageName ||
      artifact.artifactSha256 !== other.artifactSha256 ||
      artifact.packlistSha256 !== other.packlistSha256
    ) {
      throw new Error(`independent release attempts differ for ${artifact.packageName}`);
    }
  }
}

async function candidateInstall(attempt, operationRoot) {
  const candidateRoot = path.join(operationRoot, "candidate");
  const prefix = path.join(candidateRoot, "prefix");
  const home = path.join(candidateRoot, "home");
  const state = path.join(candidateRoot, "state");
  const workspace = path.join(candidateRoot, "workspace");
  const logs = path.join(candidateRoot, "logs");
  await fs.rm(candidateRoot, { force: true, recursive: true });
  await Promise.all(
    [prefix, home, state, workspace, logs].map((dir) =>
      fs.mkdir(dir, { recursive: true, mode: 0o700 }),
    ),
  );
  const coreIndex = attempt.manifest.artifacts.findIndex((artifact) => artifact.role === "core");
  await runCommand({
    id: "candidate-install-core",
    command: "npm",
    args: [
      "install",
      "--global",
      "--prefix",
      prefix,
      "--no-audit",
      "--no-fund",
      attempt.artifactPaths[coreIndex],
    ],
    cwd: candidateRoot,
    logRoot: logs,
  });
  const cli = path.join(prefix, "bin", "openclaw");
  const candidateEnv = {
    HOME: home,
    OPENCLAW_HOME: home,
    OPENCLAW_STATE_DIR: state,
    OPENCLAW_CONFIG_PATH: path.join(state, "openclaw.json"),
    OPENCLAW_WORKSPACE_DIR: workspace,
  };
  for (const [index, artifact] of attempt.manifest.artifacts.entries()) {
    if (artifact.role !== "plugin") {
      continue;
    }
    await runCommand({
      id: `candidate-install-${index}`,
      command: cli,
      args: ["plugins", "install", `npm-pack:${attempt.artifactPaths[index]}`],
      cwd: candidateRoot,
      logRoot: logs,
      env: candidateEnv,
    });
  }
  const listed = await runCapture(cli, ["plugins", "list", "--json"], candidateRoot, candidateEnv);
  const payload = JSON.parse(listed.stdout);
  if (!Array.isArray(payload.plugins)) {
    throw new Error("candidate plugin readback returned no plugin inventory");
  }
  const loaded = new Set(
    payload.plugins
      .filter((plugin) => plugin && plugin.status === "loaded" && typeof plugin.id === "string")
      .map((plugin) => plugin.id),
  );
  const missing = attempt.manifest.loadedReadiness.requiredPluginIds.filter(
    (id) => !loaded.has(id),
  );
  if (missing.length > 0) {
    throw new Error(`candidate did not load required plugins: ${missing.join(", ")}`);
  }
}

export async function prepareNativeReleaseSet(params) {
  const input = parseInput(await readJson(params.inputPath, "release driver input"));
  const operationRoot = path.dirname(params.inputPath);
  ensureBelow(operationRoot, params.outputPath, "release driver output");
  const predecessorBytes = await fs.readFile(input.predecessor.manifestPath);
  if (sha256(predecessorBytes) !== input.predecessor.releaseManifestDigest) {
    throw new Error("predecessor manifest bytes do not match the loaded release digest");
  }
  const predecessorManifest = parseReleaseManifestBytes(predecessorBytes);
  if (predecessorManifest.source.treeObject !== input.predecessor.sourceTreeObject) {
    throw new Error("predecessor manifest source tree does not match the loaded generation");
  }
  const buildRoot = path.join(operationRoot, "build");
  await fs.mkdir(buildRoot, { recursive: true, mode: 0o700 });
  const first = await prepareAttempt({
    input,
    predecessorManifest,
    attemptRoot: path.join(buildRoot, "attempt-a"),
  });
  const second = await prepareAttempt({
    input,
    predecessorManifest,
    attemptRoot: path.join(buildRoot, "attempt-b"),
  });
  compareAttempts(first, second);
  await candidateInstall(first, operationRoot);

  const result = {
    schema: "openclaw.release.prepare.driver-result.v1",
    manifestPath: first.manifestPath,
    artifacts: first.manifest.artifacts.map((artifact, index) => ({
      role: artifact.role,
      packageName: artifact.packageName,
      artifactPath: first.artifactPaths[index],
    })),
    checks: [
      { id: "native-build", status: "passed" },
      { id: "native-package-inventory", status: "passed" },
      { id: "accepted-install-plans", status: "passed" },
      { id: "independent-reproducibility", status: "passed" },
      { id: "credential-free-candidate-install", status: "passed" },
      { id: "required-plugin-load", status: "passed" },
    ],
  };
  await writeJsonAtomic(params.outputPath, result);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await prepareNativeReleaseSet(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
