import { getRegistryWorktree } from "../agents/worktrees/registry.js";
import type { ManagedWorktreeRecord } from "../agents/worktrees/types.js";
import { isLowerHex } from "../release-manifest.js";
import {
  resolveAcceptedReleaseReceipt,
  resolveReleaseStoreRoot,
} from "./accepted-release-receipt.js";
import {
  resolveReleasePreparationAuthority,
  type ReleasePreparationAuthority,
} from "./release-preparation-authority.js";
import {
  deriveReleasePreparationOperationId,
  ensureReleasePreparationOperationRoot,
  readOperationJson,
  resolveReleasePreparationOperationPaths,
  writeImmutableOperationJson,
} from "./release-preparation-store.js";
import {
  prepareSystemChangeWorktree,
  verifyPreparedReleaseSnapshot,
  type PreparedReleaseWorktree,
  type ReleaseSecretScanner,
  type ReleaseSnapshotPath,
  type ReleaseWorktreeAdmissionEvidence,
} from "./release-preparation-worktree.js";

export type AcceptedReleasePreparation = {
  acceptedReleaseReceiptId: string;
  candidateEvidenceRef: string;
  candidateEvidenceDigest: string;
};

export type ReleasePreparationResult = {
  schema: "openclaw.release.prepare.result.v1";
  operationId: string;
  codingTaskId: string;
  worktreeId: string;
  nativeSnapshotRef: string;
  sourceTreeObject: string;
  acceptedReleaseReceiptId: string;
  candidateEvidenceRef: string;
  candidateEvidenceDigest: string;
  status: "accepted";
  completedAt: string;
};

type ReleasePreparationDeps = {
  resolveAuthority: typeof resolveReleasePreparationAuthority;
  getWorktree: (env: NodeJS.ProcessEnv, id: string) => ManagedWorktreeRecord | undefined;
  prepareWorktree: typeof prepareSystemChangeWorktree;
  verifySnapshot: typeof verifyPreparedReleaseSnapshot;
  prepareAcceptedRelease: (params: {
    authority: ReleasePreparationAuthority;
    preparedWorktree: PreparedReleaseWorktree;
    operationId: string;
    operationRoot: string;
    releaseStoreRoot: string;
    env: NodeJS.ProcessEnv;
  }) => Promise<AcceptedReleasePreparation>;
  resolveAcceptedReceipt: typeof resolveAcceptedReleaseReceipt;
  now: () => Date;
};

type StoredAdmission = {
  schema: "openclaw.release.prepare.admission.v1";
  operationId: string;
  codingTaskId: string;
  worktreeId: string;
  loadedReleaseManifestDigest: string;
  changedPaths: ReleaseSnapshotPath[];
  pathSetDigest: string;
  secretScan: ReleaseWorktreeAdmissionEvidence["secretScan"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`release preparation ${label} is invalid`);
  }
  return value;
}

function requireDigest(value: unknown, label: string): string {
  const digest = requireString(value, label);
  if (!isLowerHex(digest, 64)) {
    throw new Error(`release preparation ${label} is not a lowercase SHA-256 digest`);
  }
  return digest;
}

function parseStoredAdmission(value: unknown): StoredAdmission {
  if (!isRecord(value) || value.schema !== "openclaw.release.prepare.admission.v1") {
    throw new Error("release preparation admission evidence has an unsupported schema");
  }
  if (!Array.isArray(value.changedPaths)) {
    throw new Error("release preparation admission evidence has no changed paths");
  }
  const changedPaths = value.changedPaths.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`release preparation admission path ${index} is invalid`);
    }
    const kind = entry.kind;
    if (kind !== "file" && kind !== "symlink" && kind !== "deleted") {
      throw new Error(`release preparation admission path ${index} has an invalid kind`);
    }
    const mode = entry.mode;
    const byteSize = entry.byteSize;
    const digest = entry.sha256;
    if (
      (mode !== null && typeof mode !== "string") ||
      typeof byteSize !== "number" ||
      !Number.isSafeInteger(byteSize) ||
      byteSize < 0 ||
      (digest !== null && typeof digest !== "string")
    ) {
      throw new Error(`release preparation admission path ${index} is malformed`);
    }
    return {
      path: requireString(entry.path, `admission path ${index}`),
      kind,
      mode,
      byteSize,
      sha256: digest,
    } satisfies ReleaseSnapshotPath;
  });
  if (!isRecord(value.secretScan) || value.secretScan.verdict !== "clean") {
    throw new Error("release preparation admission secret scan is invalid");
  }
  if (value.secretScan.scanner !== "gitleaks") {
    throw new Error("release preparation admission scanner is invalid");
  }
  return {
    schema: "openclaw.release.prepare.admission.v1",
    operationId: requireString(value.operationId, "admission operation ID"),
    codingTaskId: requireString(value.codingTaskId, "admission Coding task ID"),
    worktreeId: requireString(value.worktreeId, "admission worktree ID"),
    loadedReleaseManifestDigest: requireDigest(
      value.loadedReleaseManifestDigest,
      "admission loaded release digest",
    ),
    changedPaths,
    pathSetDigest: requireDigest(value.pathSetDigest, "admission path-set digest"),
    secretScan: {
      scanner: "gitleaks",
      scannerVersion: requireString(value.secretScan.scannerVersion, "scanner version"),
      policyDigest: requireDigest(value.secretScan.policyDigest, "scanner policy digest"),
      verdict: "clean",
    },
  };
}

export function parseReleasePreparationResult(value: unknown): ReleasePreparationResult {
  if (!isRecord(value) || value.schema !== "openclaw.release.prepare.result.v1") {
    throw new Error("release preparation result has an unsupported schema");
  }
  if (value.status !== "accepted") {
    throw new Error("release preparation result is not accepted");
  }
  return {
    schema: "openclaw.release.prepare.result.v1",
    operationId: requireString(value.operationId, "result operation ID"),
    codingTaskId: requireString(value.codingTaskId, "result Coding task ID"),
    worktreeId: requireString(value.worktreeId, "result worktree ID"),
    nativeSnapshotRef: requireString(value.nativeSnapshotRef, "result native snapshot ref"),
    sourceTreeObject: requireString(value.sourceTreeObject, "result source tree object"),
    acceptedReleaseReceiptId: requireString(
      value.acceptedReleaseReceiptId,
      "result accepted receipt ID",
    ),
    candidateEvidenceRef: requireString(value.candidateEvidenceRef, "result evidence ref"),
    candidateEvidenceDigest: requireDigest(value.candidateEvidenceDigest, "result evidence digest"),
    status: "accepted",
    completedAt: requireString(value.completedAt, "result completion time"),
  };
}

async function defaultPrepareAcceptedRelease(
  params: Parameters<ReleasePreparationDeps["prepareAcceptedRelease"]>[0],
): Promise<AcceptedReleasePreparation> {
  const { prepareAcceptedReleaseFromSnapshot } = await import("./release-preparation-package.js");
  return await prepareAcceptedReleaseFromSnapshot(params);
}

function defaultDeps(): ReleasePreparationDeps {
  return {
    resolveAuthority: resolveReleasePreparationAuthority,
    getWorktree: getRegistryWorktree,
    prepareWorktree: prepareSystemChangeWorktree,
    verifySnapshot: verifyPreparedReleaseSnapshot,
    prepareAcceptedRelease: defaultPrepareAcceptedRelease,
    resolveAcceptedReceipt: resolveAcceptedReleaseReceipt,
    now: () => new Date(),
  };
}

function assertOperationBinding(params: {
  operationId: string;
  codingTaskId: string;
  authority: ReleasePreparationAuthority;
  value: Pick<
    StoredAdmission,
    "operationId" | "codingTaskId" | "worktreeId" | "loadedReleaseManifestDigest"
  >;
}): void {
  if (
    params.value.operationId !== params.operationId ||
    params.value.codingTaskId !== params.codingTaskId ||
    params.value.worktreeId !== params.authority.worktree.id ||
    params.value.loadedReleaseManifestDigest !==
      params.authority.loadedRelease.releaseManifestDigest
  ) {
    throw new Error("release preparation operation evidence belongs to different authority");
  }
}

export async function prepareAcceptedRelease(
  params: {
    codingTaskId: string;
    env?: NodeJS.ProcessEnv;
    releaseStoreRoot?: string;
    scanner?: ReleaseSecretScanner;
  },
  overrides: Partial<ReleasePreparationDeps> = {},
): Promise<ReleasePreparationResult> {
  const env = params.env ?? process.env;
  const deps = { ...defaultDeps(), ...overrides };
  const codingTaskId = params.codingTaskId.trim();
  const authority = await deps.resolveAuthority({ codingTaskId, env });
  const operationId = deriveReleasePreparationOperationId({
    codingTaskId,
    worktreeId: authority.worktree.id,
    loadedReleaseManifestDigest: authority.loadedRelease.releaseManifestDigest,
  });
  const releaseStoreRoot = params.releaseStoreRoot ?? resolveReleaseStoreRoot(env);
  const paths = resolveReleasePreparationOperationPaths({ releaseStoreRoot, operationId });
  await ensureReleasePreparationOperationRoot({ releaseStoreRoot, paths });

  const existingResultValue = await readOperationJson(paths.resultPath);
  if (existingResultValue !== null) {
    const existingResult = parseReleasePreparationResult(existingResultValue);
    if (
      existingResult.operationId !== operationId ||
      existingResult.codingTaskId !== codingTaskId ||
      existingResult.worktreeId !== authority.worktree.id
    ) {
      throw new Error("release preparation result belongs to different authority");
    }
    await deps.resolveAcceptedReceipt({
      acceptedReleaseReceiptId: existingResult.acceptedReleaseReceiptId,
      env,
      releaseStoreRoot,
    });
    return existingResult;
  }

  const storedAdmissionValue = await readOperationJson(paths.admissionPath);
  const storedAdmission =
    storedAdmissionValue === null ? null : parseStoredAdmission(storedAdmissionValue);
  if (storedAdmission) {
    assertOperationBinding({ operationId, codingTaskId, authority, value: storedAdmission });
  }

  const currentWorktree = deps.getWorktree(env, authority.worktree.id) ?? authority.worktree;
  let preparedWorktree: PreparedReleaseWorktree;
  if (currentWorktree.removedAt !== undefined) {
    if (!storedAdmission) {
      throw new Error("native release snapshot exists without pre-snapshot admission evidence");
    }
    preparedWorktree = await deps.verifySnapshot({
      worktree: currentWorktree,
      admission: storedAdmission,
    });
  } else {
    preparedWorktree = await deps.prepareWorktree({
      worktreeId: currentWorktree.id,
      expectedOwnerId: authority.childSessionKey,
      expectedBaseRef: authority.loadedRelease.sourceSnapshotRef,
      expectedReleaseManifestDigest: authority.loadedRelease.releaseManifestDigest,
      env,
      scanner: params.scanner,
      persistAdmission: async (admission) => {
        const value: StoredAdmission = {
          schema: "openclaw.release.prepare.admission.v1",
          operationId,
          codingTaskId,
          worktreeId: currentWorktree.id,
          loadedReleaseManifestDigest: authority.loadedRelease.releaseManifestDigest,
          changedPaths: admission.changedPaths,
          pathSetDigest: admission.pathSetDigest,
          secretScan: admission.secretScan,
        };
        await writeImmutableOperationJson({
          operationRoot: paths.operationRoot,
          filePath: paths.admissionPath,
          value,
        });
      },
    });
  }

  const accepted = await deps.prepareAcceptedRelease({
    authority,
    preparedWorktree,
    operationId,
    operationRoot: paths.operationRoot,
    releaseStoreRoot,
    env,
  });
  await deps.resolveAcceptedReceipt({
    acceptedReleaseReceiptId: accepted.acceptedReleaseReceiptId,
    env,
    releaseStoreRoot,
  });
  const result: ReleasePreparationResult = {
    schema: "openclaw.release.prepare.result.v1",
    operationId,
    codingTaskId,
    worktreeId: preparedWorktree.worktreeId,
    nativeSnapshotRef: preparedWorktree.nativeSnapshotRef,
    sourceTreeObject: preparedWorktree.sourceTreeObject,
    acceptedReleaseReceiptId: accepted.acceptedReleaseReceiptId,
    candidateEvidenceRef: accepted.candidateEvidenceRef,
    candidateEvidenceDigest: accepted.candidateEvidenceDigest,
    status: "accepted",
    completedAt: deps.now().toISOString(),
  };
  await writeImmutableOperationJson({
    operationRoot: paths.operationRoot,
    filePath: paths.resultPath,
    value: result,
  });
  return result;
}
