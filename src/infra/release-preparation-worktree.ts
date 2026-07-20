import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireGit, requireGitBuffer } from "../agents/worktrees/git.js";
import { getRegistryWorktree } from "../agents/worktrees/registry.js";
import { abortWorktreeRemoval, claimWorktreeRemoval } from "../agents/worktrees/run-lease.js";
import { ManagedWorktreeService } from "../agents/worktrees/service.js";
import type {
  ManagedWorktreeRecord,
  WorktreeSnapshotAdmission,
} from "../agents/worktrees/types.js";
import { runCommandWithTimeout } from "../process/exec.js";

const MAX_SOURCE_FILE_BYTES = 100 * 1024 * 1024;
const MAX_SOURCE_DELTA_BYTES = 500 * 1024 * 1024;
const GITLEAKS_TIMEOUT_MS = 120_000;
const GITLEAKS_EXIT_FINDINGS = 3;
const GENERATED_PATH_SEGMENTS = new Set([
  ".artifacts",
  ".pnpm-store",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

export type ReleaseSnapshotPath = {
  path: string;
  kind: "file" | "symlink" | "deleted";
  mode: string | null;
  byteSize: number;
  sha256: string | null;
};

export type ReleaseSecretScanEvidence = {
  scanner: "gitleaks";
  scannerVersion: string;
  policyDigest: string;
  verdict: "clean";
};

export type PreparedReleaseWorktree = {
  worktreeId: string;
  nativeSnapshotRef: string;
  sourceTreeObject: string;
  pathSetDigest: string;
  changedPaths: ReleaseSnapshotPath[];
  secretScan: ReleaseSecretScanEvidence;
};

export type ReleaseWorktreeAdmissionEvidence = Pick<
  PreparedReleaseWorktree,
  "changedPaths" | "pathSetDigest" | "secretScan"
>;

export type ReleaseSecretScanner = (params: {
  scanRoot: string;
  changedPaths: readonly ReleaseSnapshotPath[];
  env: NodeJS.ProcessEnv;
}) => Promise<ReleaseSecretScanEvidence>;

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function splitNullBuffer(input: Buffer): Buffer[] {
  const fields: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] !== 0) {
      continue;
    }
    fields.push(input.subarray(start, index));
    start = index + 1;
  }
  if (start < input.length) {
    fields.push(input.subarray(start));
  }
  return fields.filter((field) => field.length > 0);
}

function decodeGitPath(raw: Buffer): string {
  let value: string;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new Error("release snapshot paths must be valid UTF-8");
  }
  if (!value || value.startsWith("/") || path.posix.normalize(value) !== value) {
    throw new Error(`release snapshot path is not repository-relative: ${JSON.stringify(value)}`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`release snapshot path is unsafe: ${JSON.stringify(value)}`);
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) {
      throw new Error("release snapshot paths must not contain control characters");
    }
  }
  if (segments.some((segment) => GENERATED_PATH_SEGMENTS.has(segment))) {
    throw new Error(`generated path is not eligible for a source snapshot: ${value}`);
  }
  return value;
}

function ensureWithinRoot(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`release snapshot path escapes its worktree: ${candidate}`);
  }
}

async function readStableRegularFile(filePath: string): Promise<{ bytes: Buffer; mode: string }> {
  const noFollowFlag = fsConstants.O_NOFOLLOW ?? 0;
  const handle = await fs.open(filePath, fsConstants.O_RDONLY | noFollowFlag);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1) {
      throw new Error(`release snapshot input must be a single-link regular file: ${filePath}`);
    }
    if (before.size > MAX_SOURCE_FILE_BYTES) {
      throw new Error(`release snapshot input exceeds ${MAX_SOURCE_FILE_BYTES} bytes: ${filePath}`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs
    ) {
      throw new Error(`release snapshot input changed while being inspected: ${filePath}`);
    }
    return { bytes, mode: (before.mode & 0o111) === 0 ? "100644" : "100755" };
  } finally {
    await handle.close();
  }
}

async function inspectChangedPath(
  root: string,
  rawPath: Buffer,
): Promise<{
  entry: ReleaseSnapshotPath;
  bytes?: Buffer;
}> {
  const relativePath = decodeGitPath(rawPath);
  const filePath = path.join(root, ...relativePath.split("/"));
  ensureWithinRoot(root, filePath);
  let stat;
  try {
    stat = await fs.lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        entry: {
          path: relativePath,
          kind: "deleted",
          mode: null,
          byteSize: 0,
          sha256: null,
        },
      };
    }
    throw error;
  }
  if (stat.isSymbolicLink()) {
    const target = await fs.readlink(filePath);
    if (path.isAbsolute(target)) {
      throw new Error(`release snapshot symlink must remain repository-relative: ${relativePath}`);
    }
    const resolvedTarget = path.resolve(path.dirname(filePath), target);
    ensureWithinRoot(root, resolvedTarget);
    const bytes = Buffer.from(target, "utf8");
    return {
      entry: {
        path: relativePath,
        kind: "symlink",
        mode: "120000",
        byteSize: bytes.length,
        sha256: sha256(bytes),
      },
      bytes,
    };
  }
  if (!stat.isFile()) {
    throw new Error(
      `release snapshot input must not be a device, socket, FIFO, or directory: ${relativePath}`,
    );
  }
  const { bytes, mode } = await readStableRegularFile(filePath);
  return {
    entry: {
      path: relativePath,
      kind: "file",
      mode,
      byteSize: bytes.length,
      sha256: sha256(bytes),
    },
    bytes,
  };
}

async function stageScannerInput(params: {
  scanRoot: string;
  inspected: ReadonlyArray<{ entry: ReleaseSnapshotPath; bytes?: Buffer }>;
}): Promise<void> {
  for (const item of params.inspected) {
    if (!item.bytes) {
      continue;
    }
    const target = path.join(params.scanRoot, ...item.entry.path.split("/"));
    ensureWithinRoot(params.scanRoot, target);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.writeFile(target, item.bytes, { flag: "wx", mode: 0o600 });
  }
}

function cleanScannerEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    PATH: env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: env.HOME ?? os.tmpdir(),
  };
}

export async function runGitleaksReleaseScan(params: {
  scanRoot: string;
  changedPaths: readonly ReleaseSnapshotPath[];
  env: NodeJS.ProcessEnv;
}): Promise<ReleaseSecretScanEvidence> {
  const scannerEnv = cleanScannerEnv(params.env);
  const versionResult = await runCommandWithTimeout(["gitleaks", "version"], {
    timeoutMs: 10_000,
    env: scannerEnv,
  });
  if (versionResult.code !== 0 || !versionResult.stdout.trim()) {
    throw new Error("release-owned gitleaks scanner is unavailable");
  }
  const scannerVersion = versionResult.stdout.trim().split("\n")[0] ?? "unknown";
  const reportPath = path.join(params.scanRoot, ".gitleaks-report.json");
  const scanResult = await runCommandWithTimeout(
    [
      "gitleaks",
      "detect",
      "--source",
      params.scanRoot,
      "--no-git",
      "--no-banner",
      "--redact",
      "--report-format",
      "json",
      "--report-path",
      reportPath,
      "--exit-code",
      String(GITLEAKS_EXIT_FINDINGS),
    ],
    { timeoutMs: GITLEAKS_TIMEOUT_MS, env: scannerEnv },
  );
  if (scanResult.code === GITLEAKS_EXIT_FINDINGS) {
    throw new Error("release snapshot secret scan found prohibited content");
  }
  if (scanResult.code !== 0) {
    throw new Error(
      `release snapshot secret scan failed: ${(scanResult.stderr || scanResult.stdout).trim() || "unknown scanner error"}`,
    );
  }
  const policyDigest = sha256(
    JSON.stringify({
      scanner: "gitleaks",
      scannerVersion,
      command: "detect --no-git --redact",
      maxSourceFileBytes: MAX_SOURCE_FILE_BYTES,
      maxSourceDeltaBytes: MAX_SOURCE_DELTA_BYTES,
      excludedGeneratedPathSegments: [...GENERATED_PATH_SEGMENTS].toSorted(compareUtf8),
    }),
  );
  return { scanner: "gitleaks", scannerVersion, policyDigest, verdict: "clean" };
}

async function inspectAdmission(params: {
  admission: WorktreeSnapshotAdmission;
  env: NodeJS.ProcessEnv;
  scanner: ReleaseSecretScanner;
}): Promise<{
  changedPaths: ReleaseSnapshotPath[];
  secretScan: ReleaseSecretScanEvidence;
}> {
  if (params.admission.changedPaths.length === 0) {
    throw new Error("release preparation requires at least one source change");
  }
  const inspected = await Promise.all(
    params.admission.changedPaths.map((rawPath) =>
      inspectChangedPath(params.admission.record.path, rawPath),
    ),
  );
  const changedPaths = inspected
    .map(({ entry }) => entry)
    .toSorted((left, right) => compareUtf8(left.path, right.path));
  for (let index = 1; index < changedPaths.length; index += 1) {
    if (changedPaths[index - 1]?.path === changedPaths[index]?.path) {
      throw new Error(`release snapshot contains duplicate path ${changedPaths[index]?.path}`);
    }
  }
  const aggregateBytes = changedPaths.reduce((total, entry) => total + entry.byteSize, 0);
  if (aggregateBytes > MAX_SOURCE_DELTA_BYTES) {
    throw new Error(`release source delta exceeds ${MAX_SOURCE_DELTA_BYTES} bytes`);
  }
  const scanRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-release-scan-"));
  try {
    await stageScannerInput({ scanRoot, inspected });
    return {
      changedPaths,
      secretScan: await params.scanner({ scanRoot, changedPaths, env: params.env }),
    };
  } finally {
    await fs.rm(scanRoot, { recursive: true, force: true });
  }
}

async function readTreeEntry(params: {
  repoRoot: string;
  treeish: string;
  relativePath: string;
}): Promise<{ mode: string; object: string } | null> {
  const output = await requireGitBuffer(params.repoRoot, [
    "--literal-pathspecs",
    "ls-tree",
    "-z",
    params.treeish,
    "--",
    params.relativePath,
  ]);
  if (output.length === 0) {
    return null;
  }
  const record = splitNullBuffer(output)[0];
  if (!record) {
    return null;
  }
  const tab = record.indexOf(0x09);
  if (tab <= 0) {
    throw new Error(`native snapshot tree entry is malformed: ${params.relativePath}`);
  }
  const metadata = record.subarray(0, tab).toString("ascii").split(" ");
  if (metadata.length !== 3 || metadata[1] !== "blob") {
    throw new Error(`native snapshot contains unsupported entry: ${params.relativePath}`);
  }
  return { mode: metadata[0] ?? "", object: metadata[2] ?? "" };
}

async function verifyNativeSnapshot(params: {
  repoRoot: string;
  snapshotRef: string;
  admitted: readonly ReleaseSnapshotPath[];
}): Promise<{ sourceTreeObject: string; pathSetDigest: string }> {
  const parent = await requireGit(params.repoRoot, ["rev-parse", `${params.snapshotRef}^`]);
  const changed = splitNullBuffer(
    await requireGitBuffer(params.repoRoot, [
      "diff",
      "--name-only",
      "-z",
      "--no-renames",
      parent,
      params.snapshotRef,
      "--",
    ]),
  )
    .map(decodeGitPath)
    .toSorted(compareUtf8);
  const admittedPaths = params.admitted.map((entry) => entry.path).toSorted(compareUtf8);
  if (JSON.stringify(changed) !== JSON.stringify(admittedPaths)) {
    throw new Error("native snapshot changed-path set does not match admitted source bytes");
  }
  for (const admitted of params.admitted) {
    const entry = await readTreeEntry({
      repoRoot: params.repoRoot,
      treeish: params.snapshotRef,
      relativePath: admitted.path,
    });
    if (admitted.kind === "deleted") {
      if (entry !== null) {
        throw new Error(`native snapshot did not delete ${admitted.path}`);
      }
      continue;
    }
    if (!entry || entry.mode !== admitted.mode) {
      throw new Error(`native snapshot mode does not match admitted source path ${admitted.path}`);
    }
    const bytes = await requireGitBuffer(params.repoRoot, ["cat-file", "blob", entry.object]);
    if (bytes.length !== admitted.byteSize || sha256(bytes) !== admitted.sha256) {
      throw new Error(`native snapshot bytes do not match admitted source path ${admitted.path}`);
    }
  }
  const projection = params.admitted
    .map(
      (entry) =>
        `${entry.path}\t${entry.kind}\t${entry.mode ?? "-"}\t${entry.byteSize}\t${entry.sha256 ?? "-"}\n`,
    )
    .join("");
  return {
    sourceTreeObject: await requireGit(params.repoRoot, [
      "rev-parse",
      `${params.snapshotRef}^{tree}`,
    ]),
    pathSetDigest: sha256(projection),
  };
}

function pathSetDigest(changedPaths: readonly ReleaseSnapshotPath[]): string {
  const projection = changedPaths
    .map(
      (entry) =>
        `${entry.path}\t${entry.kind}\t${entry.mode ?? "-"}\t${entry.byteSize}\t${entry.sha256 ?? "-"}\n`,
    )
    .join("");
  return sha256(projection);
}

export async function verifyPreparedReleaseSnapshot(params: {
  worktree: ManagedWorktreeRecord;
  admission: ReleaseWorktreeAdmissionEvidence;
}): Promise<PreparedReleaseWorktree> {
  if (!params.worktree.snapshotRef || params.worktree.removedAt === undefined) {
    throw new Error("release preparation worktree has no completed native snapshot");
  }
  if (pathSetDigest(params.admission.changedPaths) !== params.admission.pathSetDigest) {
    throw new Error("release worktree admission evidence digest mismatch");
  }
  const verified = await verifyNativeSnapshot({
    repoRoot: params.worktree.repoRoot,
    snapshotRef: params.worktree.snapshotRef,
    admitted: params.admission.changedPaths,
  });
  if (verified.pathSetDigest !== params.admission.pathSetDigest) {
    throw new Error("native snapshot path-set digest does not match admission evidence");
  }
  return {
    worktreeId: params.worktree.id,
    nativeSnapshotRef: params.worktree.snapshotRef,
    sourceTreeObject: verified.sourceTreeObject,
    pathSetDigest: verified.pathSetDigest,
    changedPaths: [...params.admission.changedPaths],
    secretScan: params.admission.secretScan,
  };
}

export async function prepareSystemChangeWorktree(params: {
  worktreeId: string;
  expectedOwnerId: string;
  expectedBaseRef: string;
  expectedReleaseManifestDigest: string;
  env?: NodeJS.ProcessEnv;
  scanner?: ReleaseSecretScanner;
  service?: ManagedWorktreeService;
  persistAdmission?: (evidence: ReleaseWorktreeAdmissionEvidence) => Promise<void>;
}): Promise<PreparedReleaseWorktree> {
  const env = params.env ?? process.env;
  const record = getRegistryWorktree(env, params.worktreeId);
  if (!record || record.removedAt !== undefined) {
    throw new Error(`release preparation worktree is unavailable: ${params.worktreeId}`);
  }
  if (
    record.ownerKind !== "session" ||
    record.ownerId !== params.expectedOwnerId ||
    record.baseRef !== params.expectedBaseRef
  ) {
    throw new Error("release preparation worktree authority does not match the Coding session");
  }
  if (!params.expectedReleaseManifestDigest.trim()) {
    throw new Error("release preparation requires the loaded release manifest digest");
  }

  const service = params.service ?? new ManagedWorktreeService({ env });
  const claimToken = randomUUID();
  let admitted:
    | { changedPaths: ReleaseSnapshotPath[]; secretScan: ReleaseSecretScanEvidence }
    | undefined;
  claimWorktreeRemoval(env, { worktreeId: record.id, token: claimToken, force: false });
  try {
    const removed = await service.remove({
      id: record.id,
      reason: `release-prepare:${params.expectedReleaseManifestDigest}`,
      claimToken,
      beforeSnapshot: async (admission) => {
        admitted = await inspectAdmission({
          admission,
          env,
          scanner: params.scanner ?? runGitleaksReleaseScan,
        });
        await params.persistAdmission?.({
          changedPaths: admitted.changedPaths,
          pathSetDigest: pathSetDigest(admitted.changedPaths),
          secretScan: admitted.secretScan,
        });
      },
    });
    if (!removed.snapshotRef || !admitted) {
      throw new Error("native worktree removal returned no admitted snapshot");
    }
    try {
      const verified = await verifyNativeSnapshot({
        repoRoot: record.repoRoot,
        snapshotRef: removed.snapshotRef,
        admitted: admitted.changedPaths,
      });
      return {
        worktreeId: record.id,
        nativeSnapshotRef: removed.snapshotRef,
        sourceTreeObject: verified.sourceTreeObject,
        pathSetDigest: verified.pathSetDigest,
        changedPaths: admitted.changedPaths,
        secretScan: admitted.secretScan,
      };
    } catch (error) {
      await service.restore({ id: record.id });
      throw error;
    }
  } catch (error) {
    abortWorktreeRemoval(env, record.id, claimToken);
    throw error;
  }
}
