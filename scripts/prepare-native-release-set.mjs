#!/usr/bin/env node
import { spawn } from "node:child_process";
// Builds and candidate-tests one receipt-bound native OpenClaw release set.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as tar from "tar";
import { embedReleaseManifest } from "./generate-release-manifest.mjs";
import {
  LEGACY_RESOLVED_OBJECT_SET_ALGORITHM,
  parseReleaseManifestBytes,
  PROTOTYPE_B_PACKAGE_SHAPE,
  RELEASE_PROTOCOL_VERSION,
  RESOLVED_OBJECT_SET_ALGORITHM,
  serializeReleaseManifest,
} from "./lib/release-manifest.mjs";
import {
  projectResolvedObjectSet,
  verifyAcceptedReleasePlan,
} from "./verify-accepted-release-plans.mjs";
import { verifyReleasePackageInventory } from "./verify-release-package-inventory.mjs";

const DRIVER_PROTOCOL = "openclaw.release.prepare.driver.v1";
const COMMAND_TIMEOUT_MS = 45 * 60 * 1000;
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const activeChildren = new Set();
const MIGRATION_CLASSES = new Set([
  "migration_free",
  "migration_bearing",
  "bootstrap_bridge_rehost",
]);
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

export function requiredCandidatePluginEntries(requiredPluginIds) {
  return Object.fromEntries(
    [...new Set(requiredPluginIds)]
      .toSorted(compareUtf8)
      .map((pluginId) => [pluginId, { enabled: true }]),
  );
}

export function pluginPackageChanged(changedPaths, packageRoot) {
  const normalizedRoot = packageRoot.split(path.sep).join("/").replaceAll("//", "/");
  const prefix = normalizedRoot.endsWith("/") ? normalizedRoot : `${normalizedRoot}/`;
  return changedPaths.some(
    (changedPath) => changedPath === normalizedRoot || changedPath.startsWith(prefix),
  );
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

export function normalizeMigration(value) {
  if (value === undefined) {
    return { class: "migration_free", affectedPersistentRoots: [] };
  }
  const migration = requireRecord(value, "release driver migration");
  const migrationClass = requireString(migration.class, "release driver migration class");
  if (!MIGRATION_CLASSES.has(migrationClass)) {
    throw new Error(`release driver migration class is unsupported: ${migrationClass}`);
  }
  if (!Array.isArray(migration.affectedPersistentRoots)) {
    throw new Error("release driver affected persistent roots must be an array");
  }
  const affectedPersistentRoots = migration.affectedPersistentRoots.map((entry, index) =>
    requireString(entry, `release driver affected persistent root ${index}`),
  );
  if (migrationClass === "migration_free" && affectedPersistentRoots.length > 0) {
    throw new Error("migration-free release driver input cannot name affected persistent roots");
  }
  return { class: migrationClass, affectedPersistentRoots };
}

export function releaseOperationEnvironment(operationRoot) {
  const cacheRoot = path.join(path.resolve(operationRoot), "cache");
  return {
    XDG_CACHE_HOME: path.join(cacheRoot, "xdg"),
    NPM_CONFIG_CACHE: path.join(cacheRoot, "npm"),
    npm_config_cache: path.join(cacheRoot, "npm"),
  };
}

async function prepareReleaseOperationEnvironment(operationRoot) {
  const environment = releaseOperationEnvironment(operationRoot);
  await Promise.all(
    [...new Set(Object.values(environment))].map(async (directory) => {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const pending = path.join(directory, `.openclaw-write-probe-${process.pid}.pending`);
      const committed = path.join(directory, `.openclaw-write-probe-${process.pid}.committed`);
      try {
        await fs.writeFile(pending, "ok\n", { flag: "wx", mode: 0o600 });
        await fs.rename(pending, committed);
        if ((await fs.readFile(committed, "utf8")) !== "ok\n") {
          throw new Error(`release cache write probe changed bytes in ${directory}`);
        }
      } finally {
        await fs.rm(pending, { force: true });
        await fs.rm(committed, { force: true });
      }
    }),
  );
  Object.assign(process.env, environment);
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
    migration: normalizeMigration(input.migration),
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
      artifacts: predecessor.artifacts.map((artifactValue, index) => {
        const artifact = requireRecord(artifactValue, `predecessor artifact ${index}`);
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

async function listSnapshotChangedPaths(input) {
  const diff = await runCapture(
    "git",
    [
      "-C",
      input.snapshot.repoRoot,
      "diff",
      "--name-only",
      "--diff-filter=ACDMRTUXB",
      "-z",
      input.predecessor.sourceTreeObject,
      input.snapshot.ref,
    ],
    input.snapshot.repoRoot,
  );
  return diff.stdout.split("\0").filter(Boolean);
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

export async function resolveRequestedExtensionPackages(stageRoot, requestedPackageNames) {
  const requested = new Set(requestedPackageNames);
  if (requested.size === 0) {
    return new Map();
  }
  const extensionsRoot = path.join(stageRoot, "extensions");
  const requestedDirectoryNames = new Set(
    [...requested].map((packageName) => packageName.split("/").at(-1)).filter(Boolean),
  );
  const entries = await fs.readdir(extensionsRoot, { withFileTypes: true });
  const result = new Map();
  for (const entry of entries) {
    if (!entry.isDirectory() || !requestedDirectoryNames.has(entry.name)) {
      continue;
    }
    const packageRoot = ensureBelow(
      stageRoot,
      path.join(extensionsRoot, entry.name),
      `${entry.name} extension package path`,
    );
    let packageJson;
    try {
      packageJson = await readJson(
        path.join(packageRoot, "package.json"),
        `${entry.name} extension package`,
      );
    } catch (error) {
      if (error?.cause?.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    if (!requested.has(packageJson.name)) {
      throw new Error(`${entry.name} extension package identity changed`);
    }
    if (result.has(packageJson.name)) {
      throw new Error(`extension package inventory contains duplicate package ${packageJson.name}`);
    }
    result.set(packageJson.name, packageRoot);
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

export function buildInstallPlan(lockBytes, registry) {
  const projection = projectResolvedObjectSet(lockBytes, registry, {
    algorithm: RESOLVED_OBJECT_SET_ALGORITHM,
  });
  return {
    registry,
    lockSha256: sha256(lockBytes),
    resolvedObjectSetAlgorithm: RESOLVED_OBJECT_SET_ALGORITHM,
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
  return { pluginId, compatibilityRange };
}

async function findOnlyTarball(directory, packageName) {
  const entries = (await fs.readdir(directory)).filter((entry) => entry.endsWith(".tgz"));
  if (entries.length !== 1) {
    throw new Error(`${packageName} native pack produced ${entries.length} tarballs`);
  }
  return path.join(directory, entries[0]);
}

async function verifyPredecessorArtifact(artifact) {
  const observed = await hashFile(artifact.path);
  if (observed !== artifact.sha256) {
    throw new Error(`${artifact.packageName} predecessor artifact digest changed`);
  }
  return artifact.path;
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

export async function prepareAttempt(params) {
  const materialize = params.materializeSnapshot ?? materializeSnapshot;
  const resolveToolchainDigest = params.toolchainDigest ?? toolchainDigest;
  const resolveChangedPaths = params.listSnapshotChangedPaths ?? listSnapshotChangedPaths;
  const verifyReusedArtifact = params.verifyPredecessorArtifact ?? verifyPredecessorArtifact;
  const commandRunner = params.runCommand ?? runCommand;
  const stageRoot = path.join(params.attemptRoot, "source");
  const outputRoot = path.join(params.attemptRoot, "artifacts");
  const logRoot = path.join(params.attemptRoot, "logs");
  await fs.rm(params.attemptRoot, { force: true, recursive: true });
  await fs.mkdir(outputRoot, { recursive: true, mode: 0o700 });
  await materialize(params.input, stageRoot, logRoot);

  const rootPackage = await readJson(path.join(stageRoot, "package.json"), "root package.json");
  const toolsDigest = await resolveToolchainDigest(stageRoot);
  const buildInputDigest = sha256(
    Buffer.from(
      JSON.stringify({
        driverProtocol: DRIVER_PROTOCOL,
        sourceTreeObject: params.input.snapshot.treeObject,
        predecessorManifestDigest: params.input.predecessor.releaseManifestDigest,
        packageShape: PROTOTYPE_B_PACKAGE_SHAPE,
        migration: params.input.migration,
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
  const externalArtifacts = params.predecessorManifest.artifacts.slice(1);
  const changedPaths = await resolveChangedPaths(params.input);
  const packageMap = await resolveRequestedExtensionPackages(
    stageRoot,
    externalArtifacts.map((artifact) => artifact.packageName),
  );
  const registry = params.predecessorManifest.artifacts[0].installPlan.registry;
  const sourcePluginPlans = [];
  const reusedPlugins = [];
  const preflightErrors = [];
  for (const predecessorArtifact of externalArtifacts) {
    const source = packageMap.get(predecessorArtifact.packageName);
    const sourceRelative = source
      ? path.relative(stageRoot, source).split(path.sep).join("/")
      : undefined;
    const shouldReuse =
      !source || !pluginPackageChanged(changedPaths, sourceRelative ?? "missing-package");
    if (shouldReuse) {
      const receiptArtifact = params.input.predecessor.artifacts.find(
        (artifact) => artifact.packageName === predecessorArtifact.packageName,
      );
      if (!receiptArtifact) {
        preflightErrors.push(
          `${predecessorArtifact.packageName} has no source package or predecessor artifact`,
        );
        continue;
      }
      reusedPlugins.push({ predecessorArtifact, receiptArtifact });
      continue;
    }
    try {
      const sourcePackage = await readJson(
        path.join(source, "package.json"),
        `${predecessorArtifact.packageName} package.json`,
      );
      const pluginVersion = requireString(
        sourcePackage.version,
        `${predecessorArtifact.packageName} version`,
      );
      if (pluginVersion === predecessorArtifact.packageVersion) {
        throw new Error(
          `${predecessorArtifact.packageName} changed without a native package version change`,
        );
      }
      const descriptor = await sourcePluginDescriptor({
        packageName: predecessorArtifact.packageName,
        packageRoot: source,
      });
      if (
        predecessorArtifact.ownedPluginIds.length !== 1 ||
        predecessorArtifact.ownedPluginIds[0] !== descriptor.pluginId
      ) {
        throw new Error(`${predecessorArtifact.packageName} changed release-owned plugin identity`);
      }
      sourcePluginPlans.push({
        id: path.basename(source),
        packageName: predecessorArtifact.packageName,
        packageRoot: source,
        packageVersion: pluginVersion,
        compatibilityRange: descriptor.compatibilityRange,
        ownedPluginIds: predecessorArtifact.ownedPluginIds,
      });
    } catch (error) {
      preflightErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const verifiedReused = await Promise.allSettled(
    reusedPlugins.map(async (plugin) => ({
      predecessorArtifact: plugin.predecessorArtifact,
      artifactPath: await verifyReusedArtifact(plugin.receiptArtifact),
    })),
  );
  for (const result of verifiedReused) {
    if (result.status === "rejected") {
      preflightErrors.push(
        result.reason instanceof Error ? result.reason.message : String(result.reason),
      );
    }
  }
  if (preflightErrors.length > 0) {
    throw new Error(`release preparation preflight rejected:\n${preflightErrors.join("\n")}`);
  }
  reusedPlugins.splice(
    0,
    reusedPlugins.length,
    ...verifiedReused.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
  );

  await commandRunner({
    id: "install-frozen-dependencies",
    command: "pnpm",
    args: ["install", "--frozen-lockfile", "--ignore-scripts"],
    cwd: stageRoot,
    logRoot,
    env: { CI: "true" },
  });

  const lockEntries = await Promise.all([
    generateShrinkwrap(stageRoot, stageRoot, "shrinkwrap-root", logRoot).then((lockBytes) => [
      "openclaw",
      lockBytes,
    ]),
    ...sourcePluginPlans.map((plugin) =>
      generateShrinkwrap(stageRoot, plugin.packageRoot, `shrinkwrap-${plugin.id}`, logRoot).then(
        (lockBytes) => [plugin.packageName, lockBytes],
      ),
    ),
  ]);
  const lockMap = new Map(lockEntries);
  const rootLock = lockMap.get("openclaw");
  if (!rootLock) {
    throw new Error("native root shrinkwrap generation returned no lock bytes");
  }
  const artifacts = [
    {
      role: "core",
      packageName: "openclaw",
      packageVersion: version,
      compatibilityRange: requireString(rootPackage.engines?.node, "root Node compatibility"),
      ownedPluginIds: params.predecessorManifest.artifacts[0].ownedPluginIds,
      installPlan: await buildInstallPlan(rootLock, registry),
    },
  ];
  for (const plugin of sourcePluginPlans) {
    const lockBytes = lockMap.get(plugin.packageName);
    if (!lockBytes) {
      throw new Error(`${plugin.packageName} shrinkwrap generation returned no lock bytes`);
    }
    artifacts.push({
      role: "plugin",
      packageName: plugin.packageName,
      packageVersion: plugin.packageVersion,
      compatibilityRange: plugin.compatibilityRange,
      ownedPluginIds: plugin.ownedPluginIds,
      installPlan: await buildInstallPlan(lockBytes, registry),
    });
  }
  for (const reused of reusedPlugins) {
    artifacts.push(reused.predecessorArtifact);
  }
  const sourcePlugins = sourcePluginPlans;
  artifacts.splice(
    1,
    artifacts.length - 1,
    ...artifacts
      .slice(1)
      .toSorted((left, right) => compareUtf8(left.packageName, right.packageName)),
  );

  const aggregateLockRows = artifacts
    .toSorted((left, right) => compareUtf8(left.packageName, right.packageName))
    .map(
      (artifact) =>
        `${artifact.packageName}\0${artifact.installPlan.lockSha256}\0${artifact.installPlan.resolvedObjectSetSha256}\n`,
    )
    .join("");
  const codexProfileRoot = path.join(stageRoot, "extensions", "codex", "system-profile");
  const manifest = parseReleaseManifestBytes(
    Buffer.from(
      serializeReleaseManifest({
        releaseProtocolVersion: RELEASE_PROTOCOL_VERSION,
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
        migration: params.input.migration,
        compatibility: params.predecessorManifest.compatibility,
        loadedReadiness: params.predecessorManifest.loadedReadiness,
      }),
      "utf8",
    ),
  );
  for (const [packageName, lockBytes] of lockMap) {
    verifyAcceptedReleasePlan({ manifest, packageName, lockBytes });
  }

  await commandRunner({
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
  const packedPlugins = await Promise.all(
    sourcePlugins.map(async (plugin) => [
      plugin.packageName,
      await packSourcePlugin({
        ...plugin,
        stageRoot,
        outputRoot,
        logRoot,
      }),
    ]),
  );
  for (const [packageName, artifactPath] of packedPlugins) {
    packedByName.set(packageName, artifactPath);
  }
  for (const reused of reusedPlugins) {
    packedByName.set(reused.predecessorArtifact.packageName, reused.artifactPath);
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
  const artifactDispositions = new Map([["openclaw", "built"]]);
  for (const plugin of sourcePlugins) {
    artifactDispositions.set(plugin.packageName, "built");
  }
  for (const plugin of reusedPlugins) {
    artifactDispositions.set(plugin.predecessorArtifact.packageName, "reused");
  }
  const inventory = await verifyReleasePackageInventory({ manifestBytes, artifactPaths });
  const extractRoot = path.join(params.attemptRoot, "built-lock-extract");
  await fs.mkdir(extractRoot, { recursive: true, mode: 0o700 });
  for (const [index, artifactPath] of artifactPaths.entries()) {
    const artifact = manifest.artifacts[index];
    if (artifactDispositions.get(artifact.packageName) !== "built") {
      continue;
    }
    verifyAcceptedReleasePlan({
      manifest,
      packageName: artifact.packageName,
      lockBytes: await extractShrinkwrap(artifactPath, extractRoot),
    });
  }
  return {
    stageRoot,
    manifest,
    manifestPath,
    manifestBytes,
    artifactPaths,
    inventory,
    logRoot,
    artifactDispositions,
  };
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
  const candidatePluginArtifacts = attempt.manifest.artifacts.filter(
    (artifact) =>
      artifact.role === "plugin" &&
      attempt.artifactDispositions.get(artifact.packageName) === "built",
  );
  for (const artifact of candidatePluginArtifacts) {
    const index = attempt.manifest.artifacts.indexOf(artifact);
    if (index < 0) {
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
  const managedProjectsRoot = path.join(state, "npm", "projects");
  const managedProjectNames =
    candidatePluginArtifacts.length === 0 ? [] : await fs.readdir(managedProjectsRoot);
  for (const artifact of candidatePluginArtifacts) {
    const matches = [];
    for (const projectName of managedProjectNames) {
      const projectRoot = path.join(managedProjectsRoot, projectName);
      const lockPath = path.join(projectRoot, "package-lock.json");
      let lockBytes;
      try {
        lockBytes = await fs.readFile(lockPath);
      } catch (error) {
        if (error?.code === "ENOENT") {
          continue;
        }
        throw error;
      }
      let lock;
      try {
        lock = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(lockBytes));
      } catch {
        continue;
      }
      const localEntry = lock?.packages?.[`node_modules/${artifact.packageName}`];
      if (
        !localEntry ||
        typeof localEntry !== "object" ||
        Array.isArray(localEntry) ||
        typeof localEntry.resolved !== "string" ||
        !localEntry.resolved.startsWith("file:")
      ) {
        continue;
      }
      const projected = projectResolvedObjectSet(lockBytes, artifact.installPlan.registry, {
        algorithm:
          artifact.installPlan.resolvedObjectSetAlgorithm ?? LEGACY_RESOLVED_OBJECT_SET_ALGORITHM,
        allowAcceptedLocalPackage: {
          packageName: artifact.packageName,
          packageVersion: artifact.packageVersion,
        },
      });
      if (projected.localPackageFound) {
        matches.push(projected);
      }
    }
    if (matches.length !== 1) {
      throw new Error(
        `candidate expected one managed project for ${artifact.packageName}; found ${matches.length}`,
      );
    }
    const observed = matches[0];
    if (
      observed.resolvedObjectCount !== artifact.installPlan.resolvedObjectCount ||
      observed.resolvedObjectSetSha256 !== artifact.installPlan.resolvedObjectSetSha256
    ) {
      throw new Error(
        `candidate managed project for ${artifact.packageName} does not reproduce the accepted object set`,
      );
    }
  }
  const candidateOwnedPluginIds = new Set([
    ...attempt.manifest.artifacts[coreIndex].ownedPluginIds,
    ...candidatePluginArtifacts.flatMap((artifact) => artifact.ownedPluginIds),
  ]);
  const requiredPluginIds = attempt.manifest.loadedReadiness.requiredPluginIds.filter((pluginId) =>
    candidateOwnedPluginIds.has(pluginId),
  );
  const requiredPluginEntries = requiredCandidatePluginEntries(requiredPluginIds);
  if (Object.keys(requiredPluginEntries).length > 0) {
    await runCommand({
      id: "candidate-configure-required-plugins",
      command: cli,
      args: [
        "config",
        "set",
        "plugins.entries",
        JSON.stringify(requiredPluginEntries),
        "--strict-json",
        "--merge",
      ],
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
  const missing = requiredPluginIds.filter((id) => !loaded.has(id));
  if (missing.length > 0) {
    throw new Error(`candidate did not load required plugins: ${missing.join(", ")}`);
  }

  const codexWasBuilt = candidatePluginArtifacts.some((artifact) =>
    artifact.ownedPluginIds.includes("codex"),
  );
  if (!codexWasBuilt) {
    return;
  }
  const codexPlugin = payload.plugins.find(
    (plugin) => plugin && plugin.id === "codex" && plugin.status === "loaded",
  );
  const codexRoot = await fs.realpath(
    requireString(codexPlugin?.rootDir, "candidate Codex installed root"),
  );
  ensureBelow(candidateRoot, codexRoot, "candidate Codex installed root");
  const codexProfileRoot = path.join(codexRoot, "system-profile");
  const installedCodex = {
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
    contributorGuidanceDigest: await hashTree(path.join(codexProfileRoot, "contributor-guidance")),
  };
  for (const [field, expected] of Object.entries(attempt.manifest.codex)) {
    if (installedCodex[field] !== expected) {
      throw new Error(
        `candidate Codex ${field} mismatch: expected ${expected}, observed ${installedCodex[field] ?? "missing"}`,
      );
    }
  }
}

export async function prepareNativeReleaseSet(params) {
  const input = parseInput(await readJson(params.inputPath, "release driver input"));
  const operationRoot = path.dirname(params.inputPath);
  ensureBelow(operationRoot, params.outputPath, "release driver output");
  await prepareReleaseOperationEnvironment(operationRoot);
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
  const prepared = await prepareAttempt({
    input,
    predecessorManifest,
    attemptRoot: path.join(buildRoot, "attempt-a"),
  });
  await candidateInstall(prepared, operationRoot);

  const result = {
    schema: "openclaw.release.prepare.driver-result.v1",
    manifestPath: prepared.manifestPath,
    artifacts: prepared.manifest.artifacts.map((artifact, index) => ({
      role: artifact.role,
      packageName: artifact.packageName,
      artifactPath: prepared.artifactPaths[index],
      disposition: prepared.artifactDispositions.get(artifact.packageName),
    })),
    checks: [
      { id: "native-build", status: "passed" },
      { id: "prebuild-accepted-install-plans", status: "passed" },
      { id: "native-package-inventory", status: "passed" },
      { id: "accepted-install-plans", status: "passed" },
      { id: "installed-plugin-object-sets", status: "passed" },
      { id: "content-addressed-artifact-identity", status: "passed" },
      { id: "credential-free-candidate-install", status: "passed" },
      { id: "required-plugin-load", status: "passed" },
      { id: "codex-system-profile-load", status: "passed" },
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
