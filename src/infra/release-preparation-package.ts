import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { runCommandWithTimeout } from "../process/exec.js";
import type { ReleaseManifest } from "../release-manifest.js";
import { parseReleaseManifestBytes, releaseManifestDigest } from "../release-manifest.js";
import {
  resolveAcceptedReleaseForLoadedManifest,
  type ResolvedAcceptedReleaseReceipt,
} from "./accepted-release-receipt.js";
import type { ReleasePreparationAuthority } from "./release-preparation-authority.js";
import { writeImmutableOperationJson } from "./release-preparation-store.js";
import type { PreparedReleaseWorktree } from "./release-preparation-worktree.js";
import {
  publishReleaseArtifact,
  publishReleaseMetadata,
  type PublishedReleaseObject,
} from "./release-store-publication.js";

const RELEASE_DRIVER_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export type NativeReleaseDriverArtifact = {
  role: "core" | "plugin";
  packageName: string;
  artifactPath: string;
  disposition: "built" | "reused";
};

export type NativeReleaseDriverResult = {
  schema: "openclaw.release.prepare.driver-result.v1";
  manifestPath: string;
  artifacts: NativeReleaseDriverArtifact[];
  checks: Array<{ id: string; status: "passed" }>;
};

type InspectedReleaseArtifact = {
  role: "core" | "plugin";
  packageName: string;
  packageVersion: string;
  artifactSha256: string;
  npmIntegrity: string;
  npmShasum: string;
  packedBytes: number;
  packlistSha256: string;
};

type ReleasePreparationPackageDeps = {
  resolvePredecessor: typeof resolveAcceptedReleaseForLoadedManifest;
  runDriver: (params: {
    inputPath: string;
    outputPath: string;
    authority: ReleasePreparationAuthority;
    operationRoot: string;
    env: NodeJS.ProcessEnv;
  }) => Promise<NativeReleaseDriverResult>;
  verifyInventory: (params: {
    manifestBytes: Buffer;
    artifactPaths: string[];
  }) => Promise<InspectedReleaseArtifact[]>;
  publishArtifact: typeof publishReleaseArtifact;
  publishMetadata: typeof publishReleaseMetadata;
  createAcceptedTag: (params: {
    repoRoot: string;
    snapshotRef: string;
    manifest: ReleaseManifest;
    manifestDigest: string;
    packageRoot: string;
    env: NodeJS.ProcessEnv;
  }) => Promise<string>;
  now: () => Date;
};

type DriverInput = {
  schema: "openclaw.release.prepare.driver-input.v1";
  operationId: string;
  snapshot: {
    repoRoot: string;
    ref: string;
    treeObject: string;
  };
  predecessor: {
    receiptId: string;
    manifestPath: string;
    releaseManifestDigest: string;
    sourceTreeObject: string;
    artifacts: Array<{
      role: "core" | "plugin";
      packageName: string;
      version: string;
      path: string;
      sha256: string;
    }>;
  };
};

type AcceptedReleaseReceiptDocument = {
  receiptProtocolVersion: 1;
  releaseManifestDigest: string;
  loadedPredecessorManifestDigest: string;
  loadedPredecessorSourceObject: string;
  orderedArtifacts: Array<{
    role: "core" | "plugin";
    packageName: string;
    version: string;
    sha256: string;
    npmIntegrityOrShasum: string;
    packlistDigest: string;
    byteSize: number;
    contentAddressedLocation: string;
  }>;
  candidateEvidenceRef: string;
  candidateEvidenceDigest: string;
  terminalVerdict: "accepted";
  authorizationClass: "preauthorized_migration_free";
  authorizationRef: {
    codingTaskId: string;
    requesterSessionKey: string;
    sourceId: string | null;
  };
  nativeSnapshotRef: string;
  acceptedSourceTag: string;
  acceptedSourceObject: string;
  createdAt: string;
  releasePreparationOperationId: string;
};

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function ensurePathBelow(root: string, candidate: string, label: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} must remain below the release preparation operation root`);
  }
  return resolved;
}

function assertManifestAuthority(params: {
  manifest: ReleaseManifest;
  predecessor: ResolvedAcceptedReleaseReceipt;
  authority: ReleasePreparationAuthority;
  preparedWorktree: PreparedReleaseWorktree;
}): void {
  const { manifest, predecessor, authority, preparedWorktree } = params;
  if (
    manifest.source.snapshotRef !== preparedWorktree.nativeSnapshotRef ||
    manifest.source.treeObject !== preparedWorktree.sourceTreeObject
  ) {
    throw new Error("release manifest source does not match the native worktree snapshot");
  }
  if (
    manifest.predecessor.releaseManifestDigest !== authority.loadedRelease.releaseManifestDigest ||
    manifest.predecessor.sourceTreeObject !== authority.loadedRelease.sourceTreeObject ||
    predecessor.receipt.releaseManifestDigest !== authority.loadedRelease.releaseManifestDigest
  ) {
    throw new Error("release manifest predecessor does not match the loaded generation");
  }
  if (
    manifest.migration.class !== "migration_free" ||
    manifest.migration.affectedPersistentRoots.length !== 0
  ) {
    throw new Error("routine release preparation accepts only migration-free releases");
  }

  const previousOwners = predecessor.releaseManifest.artifacts
    .map((artifact) => ({
      packageName: artifact.packageName,
      role: artifact.role,
      ownedPluginIds: artifact.ownedPluginIds,
    }))
    .toSorted((left, right) => compareUtf8(left.packageName, right.packageName));
  const nextOwners = manifest.artifacts
    .map((artifact) => ({
      packageName: artifact.packageName,
      role: artifact.role,
      ownedPluginIds: artifact.ownedPluginIds,
    }))
    .toSorted((left, right) => compareUtf8(left.packageName, right.packageName));
  if (JSON.stringify(previousOwners) !== JSON.stringify(nextOwners)) {
    throw new Error(
      "migration-free release preparation cannot add, remove, or reassign release-owned plugins",
    );
  }
  if (
    JSON.stringify(predecessor.releaseManifest.loadedReadiness.requiredPluginIds) !==
    JSON.stringify(manifest.loadedReadiness.requiredPluginIds)
  ) {
    throw new Error("migration-free release preparation cannot change required plugin identities");
  }
}

function parseDriverResult(value: unknown): NativeReleaseDriverResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("native release driver returned an invalid result");
  }
  const raw = value as Record<string, unknown>;
  if (raw.schema !== "openclaw.release.prepare.driver-result.v1") {
    throw new Error("native release driver returned an unsupported result schema");
  }
  if (typeof raw.manifestPath !== "string" || !raw.manifestPath) {
    throw new Error("native release driver did not return a manifest path");
  }
  if (!Array.isArray(raw.artifacts) || raw.artifacts.length === 0) {
    throw new Error("native release driver returned no package artifacts");
  }
  const artifacts: NativeReleaseDriverArtifact[] = raw.artifacts.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`native release driver artifact ${index} is invalid`);
    }
    const artifact = entry as Record<string, unknown>;
    if (
      (artifact.role !== "core" && artifact.role !== "plugin") ||
      typeof artifact.packageName !== "string" ||
      !artifact.packageName ||
      typeof artifact.artifactPath !== "string" ||
      !artifact.artifactPath ||
      (artifact.disposition !== "built" && artifact.disposition !== "reused")
    ) {
      throw new Error(`native release driver artifact ${index} is malformed`);
    }
    return {
      role: artifact.role,
      packageName: artifact.packageName,
      artifactPath: artifact.artifactPath,
      disposition: artifact.disposition,
    };
  });
  if (!Array.isArray(raw.checks) || raw.checks.length === 0) {
    throw new Error("native release driver returned no candidate checks");
  }
  const checks = raw.checks.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`native release driver check ${index} is invalid`);
    }
    const check = entry as Record<string, unknown>;
    if (typeof check.id !== "string" || !check.id || check.status !== "passed") {
      throw new Error(`native release driver check ${index} did not pass`);
    }
    return { id: check.id, status: "passed" as const };
  });
  return {
    schema: "openclaw.release.prepare.driver-result.v1",
    manifestPath: raw.manifestPath,
    artifacts,
    checks,
  };
}

function buildDriverEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowedKeys = [
    "HOME",
    "LANG",
    "LC_ALL",
    "PATH",
    "TMPDIR",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_RUNTIME_DIR",
    "NPM_CONFIG_CACHE",
    "COREPACK_HOME",
    "PNPM_HOME",
  ] as const;
  return Object.fromEntries(
    allowedKeys.flatMap((key) => (env[key] === undefined ? [] : [[key, env[key]]])),
  );
}

async function defaultRunDriver(params: {
  inputPath: string;
  outputPath: string;
  authority: ReleasePreparationAuthority;
  operationRoot: string;
  env: NodeJS.ProcessEnv;
}): Promise<NativeReleaseDriverResult> {
  const scriptPath = path.join(
    params.authority.packageRoot,
    "scripts",
    "prepare-native-release-set.mjs",
  );
  const result = await runCommandWithTimeout(
    [process.execPath, scriptPath, "--input", params.inputPath, "--output", params.outputPath],
    {
      cwd: params.operationRoot,
      timeoutMs: RELEASE_DRIVER_TIMEOUT_MS,
      noOutputTimeoutMs: 20 * 60 * 1000,
      maxOutputBytes: 2 * 1024 * 1024,
      killProcessTree: true,
      baseEnv: {},
      env: buildDriverEnvironment(params.env),
    },
  );
  if (result.code !== 0) {
    throw new Error(
      `native release driver failed (${result.code ?? result.signal ?? result.termination}): ${result.stderr.trim()}`,
    );
  }
  return parseDriverResult(JSON.parse(await fs.readFile(params.outputPath, "utf8")) as unknown);
}

async function defaultVerifyInventory(params: {
  manifestBytes: Buffer;
  artifactPaths: string[];
}): Promise<InspectedReleaseArtifact[]> {
  const module = (await import("../../scripts/verify-release-package-inventory.mjs")) as {
    verifyReleasePackageInventory: (input: {
      manifestBytes: Buffer;
      artifactPaths: string[];
    }) => Promise<InspectedReleaseArtifact[]>;
  };
  return await module.verifyReleasePackageInventory(params);
}

async function runGit(params: {
  repoRoot: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}): Promise<string> {
  const result = await runCommandWithTimeout(["git", "-C", params.repoRoot, ...params.args], {
    timeoutMs: 120_000,
    maxOutputBytes: 1024 * 1024,
    baseEnv: {},
    env: params.env,
  });
  if (result.code !== 0) {
    throw new Error(`release tag Git operation failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

async function defaultCreateAcceptedTag(params: {
  repoRoot: string;
  snapshotRef: string;
  manifest: ReleaseManifest;
  manifestDigest: string;
  packageRoot: string;
  env: NodeJS.ProcessEnv;
}): Promise<string> {
  const tag = `openclaw-next-release/${params.manifest.package.version}/${params.manifestDigest.slice(0, 16)}`;
  const tagRef = `refs/tags/${tag}`;
  const commit = await runGit({
    repoRoot: params.repoRoot,
    args: ["rev-parse", `${params.snapshotRef}^{commit}`],
    env: buildDriverEnvironment(params.env),
  });
  const existing = await runCommandWithTimeout(
    ["git", "-C", params.repoRoot, "rev-parse", "--verify", `${tagRef}^{commit}`],
    {
      timeoutMs: 30_000,
      maxOutputBytes: 64 * 1024,
      baseEnv: {},
      env: buildDriverEnvironment(params.env),
    },
  );
  if (existing.code === 0) {
    if (existing.stdout.trim() !== commit) {
      throw new Error("accepted release tag already names a different source commit");
    }
  } else {
    await runGit({
      repoRoot: params.repoRoot,
      args: [
        "tag",
        "--annotate",
        tag,
        commit,
        "--message",
        `Accepted OpenClaw release ${params.manifestDigest}`,
      ],
      env: buildDriverEnvironment(params.env),
    });
  }

  const remote = params.env.OPENCLAW_RELEASE_TAG_REMOTE?.trim();
  if (!remote) {
    throw new Error("OPENCLAW_RELEASE_TAG_REMOTE is required to publish an accepted release tag");
  }
  const gitEnv = buildDriverEnvironment(params.env);
  gitEnv.GIT_TERMINAL_PROMPT = "0";
  const credentialsDirectory = params.env.CREDENTIALS_DIRECTORY?.trim();
  if (credentialsDirectory) {
    gitEnv.CREDENTIALS_DIRECTORY = credentialsDirectory;
    gitEnv.GIT_ASKPASS = path.join(params.packageRoot, "scripts", "release-git-askpass.mjs");
  }
  await runGit({
    repoRoot: params.repoRoot,
    args: ["push", remote, `${tagRef}:${tagRef}`],
    env: gitEnv,
  });
  const remoteCommit = await runGit({
    repoRoot: params.repoRoot,
    args: ["ls-remote", "--exit-code", remote, `${tagRef}^{}`],
    env: gitEnv,
  });
  if (remoteCommit.split(/\s/u, 1)[0] !== commit) {
    throw new Error("protected accepted release tag does not resolve to the native snapshot");
  }
  return tag;
}

function defaultDeps(): ReleasePreparationPackageDeps {
  return {
    resolvePredecessor: resolveAcceptedReleaseForLoadedManifest,
    runDriver: defaultRunDriver,
    verifyInventory: defaultVerifyInventory,
    publishArtifact: publishReleaseArtifact,
    publishMetadata: publishReleaseMetadata,
    createAcceptedTag: defaultCreateAcceptedTag,
    now: () => new Date(),
  };
}

export async function prepareAcceptedReleaseFromSnapshot(
  params: {
    authority: ReleasePreparationAuthority;
    preparedWorktree: PreparedReleaseWorktree;
    operationId: string;
    operationRoot: string;
    releaseStoreRoot: string;
    env: NodeJS.ProcessEnv;
  },
  overrides: Partial<ReleasePreparationPackageDeps> = {},
): Promise<{
  acceptedReleaseReceiptId: string;
  candidateEvidenceRef: string;
  candidateEvidenceDigest: string;
}> {
  const deps = { ...defaultDeps(), ...overrides };
  const predecessor = await deps.resolvePredecessor({
    releaseManifestDigest: params.authority.loadedRelease.releaseManifestDigest,
    env: params.env,
    releaseStoreRoot: params.releaseStoreRoot,
  });
  if (
    params.preparedWorktree.sourceTreeObject === params.authority.loadedRelease.sourceTreeObject
  ) {
    if (
      predecessor.receipt.releaseManifestDigest !==
        params.authority.loadedRelease.releaseManifestDigest ||
      predecessor.releaseManifest.source.treeObject !==
        params.authority.loadedRelease.sourceTreeObject
    ) {
      throw new Error("loaded no-op predecessor does not match the executing generation");
    }
    return {
      acceptedReleaseReceiptId: predecessor.id,
      candidateEvidenceRef: predecessor.receipt.candidateEvidenceRef,
      candidateEvidenceDigest: predecessor.receipt.candidateEvidenceDigest,
    };
  }
  const input: DriverInput = {
    schema: "openclaw.release.prepare.driver-input.v1",
    operationId: params.operationId,
    snapshot: {
      repoRoot: params.authority.worktree.repoRoot,
      ref: params.preparedWorktree.nativeSnapshotRef,
      treeObject: params.preparedWorktree.sourceTreeObject,
    },
    predecessor: {
      receiptId: predecessor.id,
      manifestPath: predecessor.releaseManifestPath,
      releaseManifestDigest: predecessor.receipt.releaseManifestDigest,
      sourceTreeObject: predecessor.releaseManifest.source.treeObject,
      artifacts: predecessor.receipt.orderedArtifacts.map((artifact) => ({
        role: artifact.role as "core" | "plugin",
        packageName: artifact.packageName,
        version: artifact.version,
        path: artifact.filePath,
        sha256: artifact.sha256,
      })),
    },
  };
  const inputPath = path.join(params.operationRoot, "driver-input.json");
  const outputPath = path.join(params.operationRoot, "driver-result.json");
  await writeImmutableOperationJson({
    operationRoot: params.operationRoot,
    filePath: inputPath,
    value: input,
  });
  const driver = await deps.runDriver({
    inputPath,
    outputPath,
    authority: params.authority,
    operationRoot: params.operationRoot,
    env: params.env,
  });
  const manifestPath = ensurePathBelow(
    params.operationRoot,
    driver.manifestPath,
    "release manifest",
  );
  const artifactPaths = driver.artifacts.map((artifact) => {
    if (artifact.disposition === "built") {
      return ensurePathBelow(params.operationRoot, artifact.artifactPath, "release artifact");
    }
    const previous = predecessor.receipt.orderedArtifacts.find(
      (candidate) =>
        candidate.role === artifact.role && candidate.packageName === artifact.packageName,
    );
    if (!previous || path.resolve(artifact.artifactPath) !== path.resolve(previous.filePath)) {
      throw new Error("reused release artifact does not match the accepted predecessor");
    }
    return previous.filePath;
  });
  const manifestBytes = await fs.readFile(manifestPath);
  const manifest = parseReleaseManifestBytes(manifestBytes);
  const manifestDigest = releaseManifestDigest(manifestBytes);
  assertManifestAuthority({
    manifest,
    predecessor,
    authority: params.authority,
    preparedWorktree: params.preparedWorktree,
  });

  const inspected = await deps.verifyInventory({ manifestBytes, artifactPaths });
  if (inspected.length !== manifest.artifacts.length) {
    throw new Error("native package inventory returned an incomplete artifact set");
  }
  for (const [index, expected] of manifest.artifacts.entries()) {
    const declared = driver.artifacts[index];
    const observed = inspected[index];
    if (
      !declared ||
      !observed ||
      declared.role !== expected.role ||
      declared.packageName !== expected.packageName ||
      observed.role !== expected.role ||
      observed.packageName !== expected.packageName ||
      observed.packageVersion !== expected.packageVersion
    ) {
      throw new Error("native package artifact order does not match the release manifest");
    }
  }

  const publishedArtifacts: PublishedReleaseObject[] = [];
  for (const [index, artifactPath] of artifactPaths.entries()) {
    const declared = driver.artifacts[index]!;
    if (declared.disposition === "reused") {
      const previous = predecessor.receipt.orderedArtifacts.find(
        (candidate) =>
          candidate.role === declared.role && candidate.packageName === declared.packageName,
      );
      if (!previous || previous.sha256 !== inspected[index]?.artifactSha256) {
        throw new Error("reused release artifact differs from the accepted predecessor");
      }
      publishedArtifacts.push({
        sha256: previous.sha256,
        byteSize: previous.byteSize,
        relativePath: previous.contentAddressedLocation,
        filePath: previous.filePath,
      });
    } else {
      publishedArtifacts.push(
        await deps.publishArtifact({
          releaseStoreRoot: params.releaseStoreRoot,
          sourcePath: artifactPath,
          fileName: path.basename(artifactPath),
        }),
      );
    }
    if (publishedArtifacts[index]?.sha256 !== inspected[index]?.artifactSha256) {
      throw new Error("published release artifact differs from verified package inventory");
    }
  }
  const publishedManifest = await deps.publishMetadata({
    releaseStoreRoot: params.releaseStoreRoot,
    namespace: "manifests",
    bytes: manifestBytes,
  });
  if (publishedManifest.sha256 !== manifestDigest) {
    throw new Error("published release manifest differs from the embedded package manifest");
  }

  const candidateEvidence = {
    schema: "openclaw.release.candidate-evidence.v1",
    operationId: params.operationId,
    releaseManifestDigest: manifestDigest,
    sourceTreeObject: manifest.source.treeObject,
    artifactSha256s: inspected.map((artifact) => artifact.artifactSha256),
    checks: driver.checks,
    terminalVerdict: "accepted",
  };
  const candidateEvidencePath = path.join(params.operationRoot, "candidate-evidence.json");
  const candidateEvidenceBytes = await writeImmutableOperationJson({
    operationRoot: params.operationRoot,
    filePath: candidateEvidencePath,
    value: candidateEvidence,
  });
  const candidateEvidenceDigest = sha256(candidateEvidenceBytes);
  const candidateEvidenceRef = path
    .relative(path.resolve(params.releaseStoreRoot), candidateEvidencePath)
    .split(path.sep)
    .join("/");
  const acceptedSourceTag = await deps.createAcceptedTag({
    repoRoot: params.authority.worktree.repoRoot,
    snapshotRef: params.preparedWorktree.nativeSnapshotRef,
    manifest,
    manifestDigest,
    packageRoot: params.authority.packageRoot,
    env: params.env,
  });

  const receipt: AcceptedReleaseReceiptDocument = {
    receiptProtocolVersion: 1,
    releaseManifestDigest: manifestDigest,
    loadedPredecessorManifestDigest: params.authority.loadedRelease.releaseManifestDigest,
    loadedPredecessorSourceObject: params.authority.loadedRelease.sourceTreeObject,
    orderedArtifacts: inspected.map((artifact, index) => ({
      role: artifact.role,
      packageName: artifact.packageName,
      version: artifact.packageVersion,
      sha256: artifact.artifactSha256,
      npmIntegrityOrShasum: artifact.npmIntegrity || artifact.npmShasum,
      packlistDigest: artifact.packlistSha256,
      byteSize: artifact.packedBytes,
      contentAddressedLocation: publishedArtifacts[index]!.relativePath.split(path.sep).join("/"),
    })),
    candidateEvidenceRef,
    candidateEvidenceDigest,
    terminalVerdict: "accepted",
    authorizationClass: "preauthorized_migration_free",
    authorizationRef: {
      codingTaskId: params.authority.task.taskId,
      requesterSessionKey: params.authority.task.requesterSessionKey,
      sourceId: params.authority.task.sourceId ?? null,
    },
    nativeSnapshotRef: params.preparedWorktree.nativeSnapshotRef,
    acceptedSourceTag,
    acceptedSourceObject: params.preparedWorktree.sourceTreeObject,
    createdAt: deps.now().toISOString(),
    releasePreparationOperationId: params.operationId,
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  const publishedReceipt = await deps.publishMetadata({
    releaseStoreRoot: params.releaseStoreRoot,
    namespace: "receipts",
    bytes: receiptBytes,
  });
  return {
    acceptedReleaseReceiptId: publishedReceipt.sha256,
    candidateEvidenceRef,
    candidateEvidenceDigest,
  };
}
