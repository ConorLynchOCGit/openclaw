import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import {
  resolveDefaultMemoryCaptureJobStoreDir,
  type MemoryCaptureJob,
  type MemoryCaptureJobEvent,
} from "./model-memory.capture-jobs.js";
import {
  resolveDefaultModelMemoryProviderScorecardStoreDir,
  type ModelMemoryProviderScorecardEvent,
} from "./model-memory.provider-scorecard.js";
import {
  listRecoveryQuarantineFiles,
  readRecoveredJsonFile,
  readRecoveredJsonLines,
  type ModelMemoryRuntimeStateRecovery,
} from "./model-memory.recovery-files.js";
import {
  buildCleanModelMemoryRuntimeDirtyState,
  resolveDefaultModelMemoryRuntimeDirtyStoreDir,
  type ModelMemoryRuntimeDirtyEvent,
  type ModelMemoryRuntimeDirtyState,
} from "./model-memory.runtime-dirty.js";

export type ModelMemoryCriticalStateCategory =
  | "semantic_truth"
  | "operational_state"
  | "derived_artifact";
export type ModelMemoryCriticalStateRestartAction =
  | "resume"
  | "replay"
  | "rebuild"
  | "quarantine"
  | "ignore_stale_residue";
export type ModelMemoryPostRestoreReconcileClass =
  | "clean"
  | "replay_required"
  | "rebuild_required"
  | "stale_but_servable"
  | "blocked_busy"
  | "quarantined_corrupt";
export type ModelMemoryCriticalStateSurfaceId =
  | "durable_mmv2_db"
  | "capture_jobs"
  | "runtime_dirty"
  | "projection_artifacts"
  | "provider_scorecards";

export type ModelMemoryCriticalStateInventoryEntry = {
  surfaceId: ModelMemoryCriticalStateSurfaceId;
  title: string;
  category: ModelMemoryCriticalStateCategory;
  restartAction: ModelMemoryCriticalStateRestartAction;
  description: string;
};

export type ModelMemoryRecoveryRoots = {
  stateDir: string;
  workspaceRoot: string;
  captureJobsDir: string;
  runtimeDirtyDir: string;
  providerScorecardsDir: string;
  projectionArtifactsRoot: string;
  projectionArtifactIndexPath: string;
};

export type ModelMemoryRecoverySurfaceReport = {
  surfaceId: ModelMemoryCriticalStateSurfaceId;
  title: string;
  category: ModelMemoryCriticalStateCategory;
  restartAction: ModelMemoryCriticalStateRestartAction;
  rootPath?: string;
  reconcileClass: ModelMemoryPostRestoreReconcileClass;
  detail: string;
  recoveries: ModelMemoryRuntimeStateRecovery[];
  quarantinePaths: string[];
  counts?: Record<string, number>;
};

export type ModelMemoryRecoveryReport = {
  collectedAt: string;
  roots: ModelMemoryRecoveryRoots;
  inventory: ModelMemoryCriticalStateInventoryEntry[];
  surfaces: ModelMemoryRecoverySurfaceReport[];
  summary: {
    overallReconcileClass: ModelMemoryPostRestoreReconcileClass;
    phase2EntrySafe: boolean;
    blockingSurfaceIds: ModelMemoryCriticalStateSurfaceId[];
  };
};

export type ModelMemoryOperationalBackupManifest = {
  schemaVersion: "model_memory_recovery_backup.v1";
  createdAt: string;
  roots: ModelMemoryRecoveryRoots;
  surfaces: Array<{
    surfaceId: "capture_jobs" | "runtime_dirty" | "provider_scorecards" | "projection_artifacts";
    backupPath: string;
    sourcePath: string;
    existed: boolean;
  }>;
};

export const MODEL_MEMORY_CRITICAL_STATE_INVENTORY: ModelMemoryCriticalStateInventoryEntry[] = [
  {
    surfaceId: "durable_mmv2_db",
    title: "Durable MMV2 DB",
    category: "semantic_truth",
    restartAction: "resume",
    description: "Canonical semantic truth in PostgreSQL-backed MMV2 tables.",
  },
  {
    surfaceId: "capture_jobs",
    title: "Capture Jobs",
    category: "operational_state",
    restartAction: "replay",
    description:
      "Capture job state and event ledger used to resume or replay unfinished ingestion.",
  },
  {
    surfaceId: "runtime_dirty",
    title: "Runtime Dirty State",
    category: "operational_state",
    restartAction: "rebuild",
    description: "Dirty/rebuild scheduling state for runtime projection and context rebuilds.",
  },
  {
    surfaceId: "projection_artifacts",
    title: "Projection Artifacts",
    category: "derived_artifact",
    restartAction: "rebuild",
    description: "Materialized workspace projection artifacts derived from MMV2 runtime state.",
  },
  {
    surfaceId: "provider_scorecards",
    title: "Provider Scorecards",
    category: "operational_state",
    restartAction: "resume",
    description: "Provider contract scorecards used for operational quality review and gating.",
  },
];

type ProjectionVersionShape = {
  targetId: string;
  canonicalArtifactPath: string;
};

type ProjectionArtifactIndex = {
  schema_version: "memory_projection_artifact_index.v1";
  generated_at: string;
  projection_count: number;
  artifact_entries: Array<{
    target_id: string;
    markdown_path: string;
    json_path: string;
  }>;
};

type RuntimeReconcileInput = {
  env?: NodeJS.ProcessEnv;
  workspaceRoot?: string;
  projectionVersions?: ProjectionVersionShape[];
};

function nowIso() {
  return new Date().toISOString();
}

function safeNameSegment(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/gu, "-").slice(0, 48) || "state";
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function listJsonFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(dirPath, entry.name))
      .toSorted((left, right) => left.localeCompare(right));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function highestReconcileClass(
  current: ModelMemoryPostRestoreReconcileClass,
  next: ModelMemoryPostRestoreReconcileClass,
): ModelMemoryPostRestoreReconcileClass {
  const order: ModelMemoryPostRestoreReconcileClass[] = [
    "clean",
    "stale_but_servable",
    "replay_required",
    "rebuild_required",
    "blocked_busy",
    "quarantined_corrupt",
  ];
  return order.indexOf(next) > order.indexOf(current) ? next : current;
}

function classifyRecoveries(params: {
  recoveries: ModelMemoryRuntimeStateRecovery[];
  quarantinePaths: string[];
  fallback: ModelMemoryPostRestoreReconcileClass;
}): ModelMemoryPostRestoreReconcileClass {
  if (params.recoveries.some((entry) => entry.recoveryClass === "locked_or_busy")) {
    return "blocked_busy";
  }
  if (
    params.quarantinePaths.length > 0 ||
    params.recoveries.some((entry) => entry.recoveryClass !== "locked_or_busy")
  ) {
    return "quarantined_corrupt";
  }
  return params.fallback;
}

function buildRoots(input: RuntimeReconcileInput = {}): ModelMemoryRecoveryRoots {
  const env = input.env ?? process.env;
  const stateDir = resolveStateDir(env);
  const workspaceRoot = path.resolve(input.workspaceRoot ?? path.join(stateDir, "workspace"));
  const projectionArtifactsRoot = path.join(
    workspaceRoot,
    ".openclaw",
    "model-memory",
    "projections",
  );
  return {
    stateDir,
    workspaceRoot,
    captureJobsDir: resolveDefaultMemoryCaptureJobStoreDir(env),
    runtimeDirtyDir: resolveDefaultModelMemoryRuntimeDirtyStoreDir(env),
    providerScorecardsDir: resolveDefaultModelMemoryProviderScorecardStoreDir(env),
    projectionArtifactsRoot,
    projectionArtifactIndexPath: path.join(projectionArtifactsRoot, "index.json"),
  };
}

async function inspectCaptureJobs(dirPath: string): Promise<ModelMemoryRecoverySurfaceReport> {
  const jobFiles = await listJsonFiles(path.join(dirPath, "jobs"));
  const jobs: MemoryCaptureJob[] = [];
  const recoveries: ModelMemoryRuntimeStateRecovery[] = [];
  for (const filePath of jobFiles) {
    const result = await readRecoveredJsonFile<MemoryCaptureJob | undefined>({
      filePath,
      fallback: undefined,
      parse: (value) => value as MemoryCaptureJob,
      repairCorruption: false,
    });
    if (result.value) {
      jobs.push(result.value);
    }
    recoveries.push(...result.recoveries);
  }

  const eventResult = await readRecoveredJsonLines<MemoryCaptureJobEvent>({
    filePath: path.join(dirPath, "events.jsonl"),
    parse: (value) => value as MemoryCaptureJobEvent,
    repairCorruption: false,
  });
  recoveries.push(...eventResult.recoveries);

  const quarantinePaths = [
    ...(await listRecoveryQuarantineFiles(path.join(dirPath, "quarantine", "jobs"))),
    ...(await listRecoveryQuarantineFiles(path.join(dirPath, "quarantine", "events"))),
  ];
  const replayStatuses = new Set<MemoryCaptureJob["status"]>([
    "queued",
    "started",
    "retry_scheduled",
    "replay_requested",
  ]);
  const replayRequiredCount = jobs.filter((entry) => replayStatuses.has(entry.status)).length;
  const reconcileClass = classifyRecoveries({
    recoveries,
    quarantinePaths,
    fallback: replayRequiredCount > 0 ? "replay_required" : "clean",
  });

  return {
    surfaceId: "capture_jobs",
    title: "Capture Jobs",
    category: "operational_state",
    restartAction: "replay",
    rootPath: dirPath,
    reconcileClass,
    detail:
      reconcileClass === "clean"
        ? "Capture jobs are readable and no unfinished jobs require replay."
        : reconcileClass === "replay_required"
          ? `${replayRequiredCount} capture jobs require replay or resume after restart/restore.`
          : reconcileClass === "blocked_busy"
            ? "Capture job state is temporarily unreadable due to file contention."
            : "Capture job state contains corrupted or quarantined runtime artifacts.",
    recoveries,
    quarantinePaths,
    counts: {
      totalJobs: jobs.length,
      replayRequiredJobs: replayRequiredCount,
      eventCount: eventResult.entries.length,
    },
  };
}

async function inspectRuntimeDirty(dirPath: string): Promise<ModelMemoryRecoverySurfaceReport> {
  const stateResult = await readRecoveredJsonFile<ModelMemoryRuntimeDirtyState>({
    filePath: path.join(dirPath, "state.json"),
    fallback: buildCleanModelMemoryRuntimeDirtyState(),
    parse: (value) => value as ModelMemoryRuntimeDirtyState,
    repairCorruption: false,
  });
  const eventsResult = await readRecoveredJsonLines<ModelMemoryRuntimeDirtyEvent>({
    filePath: path.join(dirPath, "events.jsonl"),
    parse: (value) => value as ModelMemoryRuntimeDirtyEvent,
    repairCorruption: false,
  });
  const quarantinePaths = [
    ...(await listRecoveryQuarantineFiles(path.join(dirPath, "quarantine", "state"))),
    ...(await listRecoveryQuarantineFiles(path.join(dirPath, "quarantine", "events"))),
  ];
  const recoveries = [...stateResult.recoveries, ...eventsResult.recoveries];
  const dirtyState = stateResult.value;
  const fallback =
    dirtyState.status === "clean"
      ? "clean"
      : dirtyState.status === "failed" ||
          dirtyState.status === "dirty" ||
          dirtyState.status === "scheduled" ||
          dirtyState.status === "rebuilding"
        ? "rebuild_required"
        : "clean";
  const reconcileClass = classifyRecoveries({ recoveries, quarantinePaths, fallback });

  return {
    surfaceId: "runtime_dirty",
    title: "Runtime Dirty State",
    category: "operational_state",
    restartAction: "rebuild",
    rootPath: dirPath,
    reconcileClass,
    detail:
      reconcileClass === "clean"
        ? "Runtime dirty state is clean and does not require replay or rebuild."
        : reconcileClass === "rebuild_required"
          ? `Runtime dirty state is ${dirtyState.status}; runtime rebuild is required before Phase 2 entry.`
          : reconcileClass === "blocked_busy"
            ? "Runtime dirty state is temporarily unreadable due to file contention."
            : "Runtime dirty state contains corrupted or quarantined artifacts.",
    recoveries,
    quarantinePaths,
    counts: {
      recentEventCount: eventsResult.entries.length,
      writeCountSinceLastRebuild: dirtyState.writeCountSinceLastRebuild,
      rebuildAttemptCount: dirtyState.rebuildAttemptCount,
    },
  };
}

async function inspectProviderScorecards(
  dirPath: string,
): Promise<ModelMemoryRecoverySurfaceReport> {
  const eventsResult = await readRecoveredJsonLines<ModelMemoryProviderScorecardEvent>({
    filePath: path.join(dirPath, "events.jsonl"),
    parse: (value) => value as ModelMemoryProviderScorecardEvent,
    repairCorruption: false,
  });
  const quarantinePaths = await listRecoveryQuarantineFiles(
    path.join(dirPath, "quarantine", "events"),
  );
  const summaryExists = await pathExists(path.join(dirPath, "summary.json"));
  const reconcileClass = classifyRecoveries({
    recoveries: eventsResult.recoveries,
    quarantinePaths,
    fallback: "clean",
  });

  return {
    surfaceId: "provider_scorecards",
    title: "Provider Scorecards",
    category: "operational_state",
    restartAction: "resume",
    rootPath: dirPath,
    reconcileClass,
    detail:
      reconcileClass === "clean"
        ? "Provider scorecard history is readable."
        : reconcileClass === "blocked_busy"
          ? "Provider scorecard events are temporarily unreadable due to file contention."
          : "Provider scorecard history contains corrupted or quarantined events.",
    recoveries: eventsResult.recoveries,
    quarantinePaths,
    counts: {
      eventCount: eventsResult.entries.length,
      summaryPresent: summaryExists ? 1 : 0,
    },
  };
}

async function inspectProjectionArtifacts(input: {
  workspaceRoot: string;
  projectionArtifactsRoot: string;
  projectionArtifactIndexPath: string;
  projectionVersions: ProjectionVersionShape[];
}): Promise<ModelMemoryRecoverySurfaceReport> {
  const indexResult = await readRecoveredJsonFile<ProjectionArtifactIndex | undefined>({
    filePath: input.projectionArtifactIndexPath,
    fallback: undefined,
    parse: (value) => value as ProjectionArtifactIndex,
    repairCorruption: false,
  });
  const quarantinePaths = await listRecoveryQuarantineFiles(
    path.join(input.projectionArtifactsRoot, "quarantine"),
  );

  const missingArtifactCount =
    indexResult.value === undefined
      ? 0
      : (
          await Promise.all(
            indexResult.value.artifact_entries
              .flatMap((entry) => [
                path.join(input.workspaceRoot, entry.markdown_path),
                path.join(input.workspaceRoot, entry.json_path),
              ])
              .map((artifactPath) => pathExists(artifactPath)),
          )
        ).filter((exists) => !exists).length;

  const recoveries = [...indexResult.recoveries];
  let fallback: ModelMemoryPostRestoreReconcileClass = "clean";
  if (input.projectionVersions.length > 0 && indexResult.value === undefined) {
    fallback = "rebuild_required";
  } else if (missingArtifactCount > 0) {
    fallback = "rebuild_required";
  }
  const reconcileClass = classifyRecoveries({
    recoveries,
    quarantinePaths,
    fallback,
  });

  return {
    surfaceId: "projection_artifacts",
    title: "Projection Artifacts",
    category: "derived_artifact",
    restartAction: "rebuild",
    rootPath: input.projectionArtifactsRoot,
    reconcileClass,
    detail:
      reconcileClass === "clean"
        ? "Projection artifact index and referenced files are readable."
        : reconcileClass === "rebuild_required"
          ? "Projection artifacts are missing or incomplete relative to runtime projection versions."
          : reconcileClass === "blocked_busy"
            ? "Projection artifact index is temporarily unreadable due to file contention."
            : "Projection artifacts contain corrupted or quarantined files.",
    recoveries,
    quarantinePaths,
    counts: {
      projectionVersionCount: input.projectionVersions.length,
      indexedProjectionCount: indexResult.value?.projection_count ?? 0,
      missingArtifactCount,
    },
  };
}

async function inspectDurableDb(): Promise<ModelMemoryRecoverySurfaceReport> {
  return {
    surfaceId: "durable_mmv2_db",
    title: "Durable MMV2 DB",
    category: "semantic_truth",
    restartAction: "resume",
    reconcileClass: "clean",
    detail:
      "Durable MMV2 DB availability is verified separately by DB runtime creation and isolated restore proof.",
    recoveries: [],
    quarantinePaths: [],
  };
}

export function resolveModelMemoryRecoveryRoots(
  input: RuntimeReconcileInput = {},
): ModelMemoryRecoveryRoots {
  return buildRoots(input);
}

export async function collectModelMemoryRecoveryReport(
  input: RuntimeReconcileInput = {},
): Promise<ModelMemoryRecoveryReport> {
  const roots = buildRoots(input);
  const surfaces = [
    await inspectDurableDb(),
    await inspectCaptureJobs(roots.captureJobsDir),
    await inspectRuntimeDirty(roots.runtimeDirtyDir),
    await inspectProjectionArtifacts({
      workspaceRoot: roots.workspaceRoot,
      projectionArtifactsRoot: roots.projectionArtifactsRoot,
      projectionArtifactIndexPath: roots.projectionArtifactIndexPath,
      projectionVersions: input.projectionVersions ?? [],
    }),
    await inspectProviderScorecards(roots.providerScorecardsDir),
  ];

  const overallReconcileClass = surfaces.reduce<ModelMemoryPostRestoreReconcileClass>(
    (current, surface) => highestReconcileClass(current, surface.reconcileClass),
    "clean",
  );
  const blockingSurfaceIds = surfaces
    .filter((surface) => surface.reconcileClass !== "clean")
    .map((surface) => surface.surfaceId);

  return {
    collectedAt: nowIso(),
    roots,
    inventory: MODEL_MEMORY_CRITICAL_STATE_INVENTORY,
    surfaces,
    summary: {
      overallReconcileClass,
      phase2EntrySafe: blockingSurfaceIds.length === 0,
      blockingSurfaceIds,
    },
  };
}

function operationalSurfaceRoots(roots: ModelMemoryRecoveryRoots) {
  return [
    {
      surfaceId: "capture_jobs" as const,
      sourcePath: roots.captureJobsDir,
    },
    {
      surfaceId: "runtime_dirty" as const,
      sourcePath: roots.runtimeDirtyDir,
    },
    {
      surfaceId: "provider_scorecards" as const,
      sourcePath: roots.providerScorecardsDir,
    },
    {
      surfaceId: "projection_artifacts" as const,
      sourcePath: roots.projectionArtifactsRoot,
    },
  ];
}

export async function backupModelMemoryOperationalState(input: {
  backupDir: string;
  env?: NodeJS.ProcessEnv;
  workspaceRoot?: string;
}): Promise<ModelMemoryOperationalBackupManifest> {
  const roots = buildRoots({ env: input.env, workspaceRoot: input.workspaceRoot });
  const backupDir = path.resolve(input.backupDir);
  await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });

  const surfaces: ModelMemoryOperationalBackupManifest["surfaces"] = [];
  for (const surface of operationalSurfaceRoots(roots)) {
    const existed = await pathExists(surface.sourcePath);
    const backupPath = path.join(backupDir, surface.surfaceId);
    if (existed) {
      await fs.rm(backupPath, { recursive: true, force: true });
      await fs.mkdir(path.dirname(backupPath), { recursive: true, mode: 0o700 });
      await fs.cp(surface.sourcePath, backupPath, { recursive: true });
    }
    surfaces.push({
      surfaceId: surface.surfaceId,
      backupPath,
      sourcePath: surface.sourcePath,
      existed,
    });
  }

  const manifest: ModelMemoryOperationalBackupManifest = {
    schemaVersion: "model_memory_recovery_backup.v1",
    createdAt: nowIso(),
    roots,
    surfaces,
  };
  await fs.writeFile(
    path.join(backupDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  return manifest;
}

export async function restoreModelMemoryOperationalState(input: {
  backupDir: string;
  env?: NodeJS.ProcessEnv;
  workspaceRoot?: string;
}): Promise<ModelMemoryOperationalBackupManifest> {
  const backupDir = path.resolve(input.backupDir);
  const manifestResult = await readRecoveredJsonFile<ModelMemoryOperationalBackupManifest>({
    filePath: path.join(backupDir, "manifest.json"),
    fallback: {
      schemaVersion: "model_memory_recovery_backup.v1",
      createdAt: nowIso(),
      roots: buildRoots({ env: input.env, workspaceRoot: input.workspaceRoot }),
      surfaces: [],
    },
    parse: (value) => value as ModelMemoryOperationalBackupManifest,
    repairCorruption: false,
  });
  if (manifestResult.value.surfaces.length === 0) {
    throw new Error("model-memory recovery backup manifest is missing or unreadable");
  }

  for (const surface of manifestResult.value.surfaces) {
    await fs.rm(surface.sourcePath, { recursive: true, force: true });
    if (surface.existed) {
      await fs.mkdir(path.dirname(surface.sourcePath), { recursive: true, mode: 0o700 });
      await fs.cp(surface.backupPath, surface.sourcePath, { recursive: true });
    }
  }
  return manifestResult.value;
}

export async function createModelMemoryRecoveryScratchBackupDir(input: {
  parentDir: string;
}): Promise<string> {
  const dirPath = path.join(
    input.parentDir,
    `model-memory-recovery-${safeNameSegment(randomUUID())}`,
  );
  await fs.mkdir(dirPath, { recursive: true, mode: 0o700 });
  return dirPath;
}
