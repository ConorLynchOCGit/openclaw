import type { JsonValue } from "../runtime-job-repository.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { listExecutionPlatformMigrationFiles } from "./migrations.ts";
import type { ExecutionPlatformDatabaseResolution } from "./runtime.ts";
import type { SqlClient } from "./sql-client.ts";

export const EXECUTION_PLATFORM_DB_BOUNDARY_CONTRACT_VERSION =
  "execution-platform.db-boundary.v1" as const;

export type ExecutionPlatformDbBoundaryKind =
  | "dedicated_execution_platform_db"
  | "shared_configured_runtime_db"
  | "model_memory_fallback"
  | "pg_mem_test"
  | "unknown"
  | "misconfigured"
  | "unavailable";

export type ExecutionPlatformDbCapability =
  | "read-only"
  | "read-write-runtime"
  | "test-only"
  | "unavailable";

export type ExecutionPlatformDbReadinessState =
  | "ready"
  | "degraded"
  | "blocked_config_missing"
  | "blocked_migration_missing"
  | "blocked_permission_missing"
  | "blocked_ambiguous_boundary"
  | "test_only";

export type ExecutionPlatformDbBoundaryContract = {
  artifactKind: "execution_platform_db_boundary_contract";
  contractVersion: typeof EXECUTION_PLATFORM_DB_BOUNDARY_CONTRACT_VERSION;
  boundaryKind: ExecutionPlatformDbBoundaryKind;
  schemaName: "execution_platform";
  migrationOwner: "execution-platform";
  configSourceRef: string | null;
  runtimeSubstrateRef: string | null;
  databaseName: string | null;
  capability: ExecutionPlatformDbCapability;
  allowedStores: {
    runtimeJobs: boolean;
    runtimeEvents: boolean;
    runtimeArtifacts: boolean;
    workQueueItems: boolean;
    modelTasks: boolean;
    scriptJobs: boolean;
    dbOperations: boolean;
    convergenceTracker: boolean;
  };
  prohibitedStores: {
    rawPrompts: false;
    rawResponses: false;
    rawTranscripts: false;
    rawProviderLogs: false;
    rawToolLogs: false;
    secrets: false;
    unboundedLogs: false;
  };
  fallbackReasonCodes: string[];
  readinessState: ExecutionPlatformDbReadinessState;
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
  secretsStored: false;
};

export type ExecutionPlatformDbReadinessReport = {
  artifactKind: "execution_platform_db_readiness_report";
  contractVersion: typeof EXECUTION_PLATFORM_DB_BOUNDARY_CONTRACT_VERSION;
  boundary: ExecutionPlatformDbBoundaryContract;
  schemaPresent: boolean;
  appliedMigrationRefs: string[];
  requiredTables: Array<{
    tableName: string;
    present: boolean;
    store: keyof ExecutionPlatformDbBoundaryContract["allowedStores"];
    tableClass: "runtime" | "work_queue";
  }>;
  missingTables: string[];
  requiredMigrationRefs: string[];
  missingMigrationRefs: string[];
  writeAccessAllowed: boolean;
  convergenceTrackerMaySeed: boolean;
  workQueueLiveLinkageMayAttach: boolean;
  readinessState: ExecutionPlatformDbReadinessState;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

export type WorkQueueLiveLinkageGateDecision =
  | "enabled"
  | "blocked_model_memory_fallback"
  | "blocked_missing_tables"
  | "blocked_missing_permission"
  | "blocked_config_missing"
  | "blocked_kill_switch"
  | "needs_review";

export type WorkQueueLiveLinkageGateReport = {
  artifactKind: "work_queue_live_linkage_gate_report";
  contractVersion: typeof EXECUTION_PLATFORM_DB_BOUNDARY_CONTRACT_VERSION;
  decision: WorkQueueLiveLinkageGateDecision;
  enabled: boolean;
  boundaryKind: ExecutionPlatformDbBoundaryKind;
  readinessState: ExecutionPlatformDbReadinessState;
  workQueueLiveLinkageMayAttach: boolean;
  missingTables: string[];
  missingMigrationRefs: string[];
  reasonCodes: string[];
  runtimeJobsCreated: false;
  liveWorkQueueItemsCreated: false;
  liveWorkQueueRunsCreated: false;
  authorityGranted: false;
  controlsApplied: false;
  workQueueLifecycleMutated: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawDbRowsStored: false;
  rawLogsStored: false;
  secretsStored: false;
};

export type ConvergenceTrackerSeedReadinessResult = {
  artifactKind: "convergence_tracker_seed_readiness_result";
  accepted: boolean;
  seeded: boolean;
  created: number;
  existing: number;
  updated: number;
  sliceIds: string[];
  readiness: ExecutionPlatformDbReadinessReport;
  reasonCodes: string[];
  runtimeJobsCreated: false;
  authorityGranted: false;
  controlsApplied: false;
  workQueueLifecycleMutated: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
};

const REQUIRED_TABLES: Array<{
  tableName: string;
  store: keyof ExecutionPlatformDbBoundaryContract["allowedStores"];
  tableClass: "runtime" | "work_queue";
}> = [
  { tableName: "runtime_jobs", store: "runtimeJobs", tableClass: "runtime" },
  { tableName: "runtime_job_events", store: "runtimeEvents", tableClass: "runtime" },
  { tableName: "runtime_job_artifacts", store: "runtimeArtifacts", tableClass: "runtime" },
  { tableName: "work_items", store: "workQueueItems", tableClass: "work_queue" },
  { tableName: "work_item_versions", store: "workQueueItems", tableClass: "work_queue" },
  { tableName: "work_item_artifacts", store: "workQueueItems", tableClass: "work_queue" },
  { tableName: "work_item_events", store: "workQueueItems", tableClass: "work_queue" },
  { tableName: "work_item_assignments", store: "workQueueItems", tableClass: "work_queue" },
  { tableName: "work_runs", store: "workQueueItems", tableClass: "work_queue" },
  { tableName: "work_steps", store: "workQueueItems", tableClass: "work_queue" },
  { tableName: "work_item_dependencies", store: "workQueueItems", tableClass: "work_queue" },
  {
    tableName: "work_item_parent_workflow_links",
    store: "workQueueItems",
    tableClass: "work_queue",
  },
  { tableName: "runtime_tool_definitions", store: "runtimeEvents", tableClass: "runtime" },
  { tableName: "runtime_tool_invocations", store: "runtimeEvents", tableClass: "runtime" },
  { tableName: "runtime_tool_events", store: "runtimeEvents", tableClass: "runtime" },
  { tableName: "runtime_tool_artifacts", store: "runtimeArtifacts", tableClass: "runtime" },
];

function allowedStoresForCapability(
  capability: ExecutionPlatformDbCapability,
): ExecutionPlatformDbBoundaryContract["allowedStores"] {
  const writable = capability === "read-write-runtime" || capability === "test-only";
  return {
    runtimeJobs: writable,
    runtimeEvents: writable,
    runtimeArtifacts: writable,
    workQueueItems: writable,
    modelTasks: writable,
    scriptJobs: writable,
    dbOperations: writable,
    convergenceTracker: writable,
  };
}

function boundaryKindFromResolution(
  resolution: ExecutionPlatformDatabaseResolution | null,
): ExecutionPlatformDbBoundaryKind {
  if (!resolution) {
    return "unavailable";
  }
  if (resolution.reusedModelMemoryDatabase) {
    return "model_memory_fallback";
  }
  return "dedicated_execution_platform_db";
}

function readinessForBoundary(input: {
  boundaryKind: ExecutionPlatformDbBoundaryKind;
  capability: ExecutionPlatformDbCapability;
  fallbackReasonCodes: string[];
}): ExecutionPlatformDbReadinessState {
  if (input.boundaryKind === "pg_mem_test") {
    return "test_only";
  }
  if (input.boundaryKind === "unavailable") {
    return "blocked_config_missing";
  }
  if (input.boundaryKind === "unknown" || input.boundaryKind === "misconfigured") {
    return "blocked_config_missing";
  }
  if (input.boundaryKind === "model_memory_fallback") {
    return "degraded";
  }
  if (input.capability === "unavailable") {
    return "blocked_config_missing";
  }
  return "ready";
}

export function resolveExecutionPlatformDbBoundaryContract(input: {
  resolution?: ExecutionPlatformDatabaseResolution | null;
  boundaryKindOverride?: ExecutionPlatformDbBoundaryKind;
  capability?: ExecutionPlatformDbCapability;
  testBoundary?: boolean;
  configError?: string | null;
  sharedRuntimeDb?: boolean;
  runtimeSubstrateRef?: string | null;
}): ExecutionPlatformDbBoundaryContract {
  const sharedRuntimeDb =
    input.sharedRuntimeDb ?? Boolean(input.resolution?.explicitlyApprovedSharedRuntimeDatabase);
  const boundaryKind =
    input.boundaryKindOverride ??
    (input.testBoundary
      ? "pg_mem_test"
      : sharedRuntimeDb
        ? "shared_configured_runtime_db"
        : boundaryKindFromResolution(input.resolution ?? null));
  const capability =
    input.capability ??
    (boundaryKind === "pg_mem_test"
      ? "test-only"
      : boundaryKind === "unavailable"
        ? "unavailable"
        : "read-write-runtime");
  const fallbackReasonCodes = [
    ...(input.configError ? ["execution_platform_database_config_missing"] : []),
    ...(boundaryKind === "model_memory_fallback" ? ["model_memory_database_fallback_in_use"] : []),
    ...(boundaryKind === "shared_configured_runtime_db"
      ? ["shared_runtime_database_explicitly_configured"]
      : []),
    ...(boundaryKind === "unavailable" ? ["execution_platform_database_unavailable"] : []),
    ...(boundaryKind === "misconfigured" ? ["execution_platform_database_misconfigured"] : []),
    ...(boundaryKind === "unknown" ? ["execution_platform_database_unknown"] : []),
  ];
  return {
    artifactKind: "execution_platform_db_boundary_contract",
    contractVersion: EXECUTION_PLATFORM_DB_BOUNDARY_CONTRACT_VERSION,
    boundaryKind,
    schemaName: "execution_platform",
    migrationOwner: "execution-platform",
    configSourceRef: input.resolution?.source ?? null,
    runtimeSubstrateRef:
      input.runtimeSubstrateRef ??
      (input.resolution
        ? `postgres-database://${input.resolution.databaseName}`
        : input.testBoundary
          ? "pg-mem://execution-platform-test"
          : null),
    databaseName: input.resolution?.databaseName ?? (input.testBoundary ? "pg_mem" : null),
    capability,
    allowedStores: allowedStoresForCapability(capability),
    prohibitedStores: {
      rawPrompts: false,
      rawResponses: false,
      rawTranscripts: false,
      rawProviderLogs: false,
      rawToolLogs: false,
      secrets: false,
      unboundedLogs: false,
    },
    fallbackReasonCodes,
    readinessState: readinessForBoundary({ boundaryKind, capability, fallbackReasonCodes }),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}

async function querySucceeds(sql: SqlClient, text: string): Promise<boolean> {
  try {
    await sql.query(text);
    return true;
  } catch {
    return false;
  }
}

async function listAppliedMigrationRefs(sql: SqlClient): Promise<string[]> {
  try {
    const result = await sql.query<{ migration_name: string }>(
      "SELECT migration_name FROM execution_platform.schema_migrations ORDER BY migration_name ASC",
    );
    return result.rows.map((row) => row.migration_name).slice(0, 50);
  } catch {
    return [];
  }
}

function finalReadinessState(input: {
  boundary: ExecutionPlatformDbBoundaryContract;
  missingTables: string[];
  writeAccessAllowed: boolean;
}): ExecutionPlatformDbReadinessState {
  if (
    input.boundary.readinessState === "blocked_config_missing" ||
    input.boundary.readinessState === "blocked_ambiguous_boundary"
  ) {
    return input.boundary.readinessState;
  }
  if (input.missingTables.length > 0) {
    return "blocked_migration_missing";
  }
  if (!input.writeAccessAllowed) {
    return "blocked_permission_missing";
  }
  if (input.boundary.boundaryKind === "pg_mem_test") {
    return "test_only";
  }
  if (input.boundary.readinessState === "degraded") {
    return "degraded";
  }
  return "ready";
}

export async function inspectExecutionPlatformDbReadiness(input: {
  sql: SqlClient;
  boundary: ExecutionPlatformDbBoundaryContract;
}): Promise<ExecutionPlatformDbReadinessReport> {
  const schemaPresent = await querySucceeds(
    input.sql,
    "SELECT 1 FROM execution_platform.schema_migrations LIMIT 1",
  );
  const requiredTables = await Promise.all(
    REQUIRED_TABLES.map(async (table) => ({
      ...table,
      present: await querySucceeds(
        input.sql,
        `SELECT * FROM execution_platform.${table.tableName} LIMIT 0`,
      ),
    })),
  );
  const missingTables = requiredTables
    .filter((table) => !table.present)
    .map((table) => table.tableName);
  const requiredMigrationRefs = (await listExecutionPlatformMigrationFiles()).map(
    (migration) => migration.name,
  );
  const appliedMigrationRefs = await listAppliedMigrationRefs(input.sql);
  const missingMigrationRefs = requiredMigrationRefs.filter(
    (migrationRef) => !appliedMigrationRefs.includes(migrationRef),
  );
  const writeAccessAllowed =
    input.boundary.capability === "read-write-runtime" || input.boundary.capability === "test-only";
  const readinessState = finalReadinessState({
    boundary: input.boundary,
    missingTables,
    writeAccessAllowed,
  });
  const convergenceTrackerMaySeed =
    missingTables.length === 0 &&
    writeAccessAllowed &&
    input.boundary.allowedStores.convergenceTracker &&
    input.boundary.boundaryKind !== "model_memory_fallback" &&
    readinessState !== "blocked_config_missing" &&
    readinessState !== "blocked_migration_missing" &&
    readinessState !== "blocked_permission_missing";
  const workQueueLiveLinkageMayAttach =
    missingTables.length === 0 &&
    missingMigrationRefs.length === 0 &&
    writeAccessAllowed &&
    input.boundary.allowedStores.workQueueItems &&
    (input.boundary.boundaryKind === "dedicated_execution_platform_db" ||
      input.boundary.boundaryKind === "shared_configured_runtime_db") &&
    readinessState === "ready";
  const reasonCodes = [
    ...input.boundary.fallbackReasonCodes,
    ...(schemaPresent ? [] : ["execution_platform_schema_missing"]),
    ...missingTables.map((tableName) => `missing_table:${tableName}`),
    ...missingMigrationRefs.map((migrationRef) => `missing_migration:${migrationRef}`),
    ...(writeAccessAllowed ? [] : ["execution_platform_db_read_only"]),
    ...(workQueueLiveLinkageMayAttach
      ? ["work_queue_live_linkage_allowed"]
      : ["work_queue_live_linkage_blocked"]),
    ...(convergenceTrackerMaySeed
      ? ["convergence_tracker_seed_allowed"]
      : ["convergence_tracker_seed_blocked"]),
  ].slice(0, 50);
  return {
    artifactKind: "execution_platform_db_readiness_report",
    contractVersion: EXECUTION_PLATFORM_DB_BOUNDARY_CONTRACT_VERSION,
    boundary: input.boundary,
    schemaPresent,
    appliedMigrationRefs,
    requiredTables,
    missingTables,
    requiredMigrationRefs,
    missingMigrationRefs,
    writeAccessAllowed,
    convergenceTrackerMaySeed,
    workQueueLiveLinkageMayAttach,
    readinessState,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

export function evaluateWorkQueueLiveLinkageGate(input: {
  readiness: ExecutionPlatformDbReadinessReport;
  workQueueRuntimeControlsGate?: {
    allowed: boolean;
    reasonCodes?: string[];
    currentState?: string;
  } | null;
}): WorkQueueLiveLinkageGateReport {
  const gate = input.workQueueRuntimeControlsGate ?? null;
  const reasonCodes = [...input.readiness.reasonCodes, ...(gate?.reasonCodes ?? [])].slice(0, 50);
  let decision: WorkQueueLiveLinkageGateDecision = "needs_review";
  if (gate && !gate.allowed) {
    decision = gate.currentState === "active" ? "blocked_kill_switch" : "needs_review";
  } else if (input.readiness.boundary.boundaryKind === "model_memory_fallback") {
    decision = "blocked_model_memory_fallback";
  } else if (
    input.readiness.boundary.boundaryKind === "unavailable" ||
    input.readiness.boundary.boundaryKind === "unknown" ||
    input.readiness.boundary.boundaryKind === "misconfigured"
  ) {
    decision = "blocked_config_missing";
  } else if (
    input.readiness.missingTables.length > 0 ||
    input.readiness.missingMigrationRefs.length > 0
  ) {
    decision = "blocked_missing_tables";
  } else if (!input.readiness.writeAccessAllowed) {
    decision = "blocked_missing_permission";
  } else if (input.readiness.workQueueLiveLinkageMayAttach) {
    decision = "enabled";
  }
  return {
    artifactKind: "work_queue_live_linkage_gate_report",
    contractVersion: EXECUTION_PLATFORM_DB_BOUNDARY_CONTRACT_VERSION,
    decision,
    enabled: decision === "enabled",
    boundaryKind: input.readiness.boundary.boundaryKind,
    readinessState: input.readiness.readinessState,
    workQueueLiveLinkageMayAttach: input.readiness.workQueueLiveLinkageMayAttach,
    missingTables: input.readiness.missingTables,
    missingMigrationRefs: input.readiness.missingMigrationRefs,
    reasonCodes: [
      ...reasonCodes,
      ...(decision === "blocked_model_memory_fallback"
        ? ["model_memory_fallback_live_work_queue_linkage_blocked"]
        : []),
      ...(decision === "enabled" ? ["work_queue_live_linkage_gate_enabled"] : []),
    ].slice(0, 50),
    runtimeJobsCreated: false,
    liveWorkQueueItemsCreated: false,
    liveWorkQueueRunsCreated: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawDbRowsStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}

export async function seedConvergenceTrackerWhenDbReady(input: {
  workQueue: Pick<
    WorkQueueRepository,
    | "readWorkItemTruth"
    | "createWorkItem"
    | "updateWorkItemPlanningMetadata"
    | "createWorkItemVersion"
    | "attachArtifactReference"
    | "addDependency"
  >;
  readiness: ExecutionPlatformDbReadinessReport;
  actorId?: string | null;
}): Promise<ConvergenceTrackerSeedReadinessResult> {
  const allowed =
    input.readiness.convergenceTrackerMaySeed &&
    input.readiness.writeAccessAllowed &&
    input.readiness.boundary.allowedStores.convergenceTracker &&
    input.readiness.missingTables.length === 0 &&
    input.readiness.boundary.boundaryKind !== "model_memory_fallback";
  if (!allowed) {
    return {
      artifactKind: "convergence_tracker_seed_readiness_result",
      accepted: false,
      seeded: false,
      created: 0,
      existing: 0,
      updated: 0,
      sliceIds: [],
      readiness: input.readiness,
      reasonCodes: [
        ...input.readiness.reasonCodes,
        ...(input.readiness.boundary.boundaryKind === "model_memory_fallback"
          ? ["model_memory_fallback_live_seed_blocked"]
          : []),
      ].slice(0, 50),
      runtimeJobsCreated: false,
      authorityGranted: false,
      controlsApplied: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawLogsStored: false,
    };
  }
  return {
    artifactKind: "convergence_tracker_seed_readiness_result",
    accepted: false,
    seeded: false,
    created: 0,
    existing: 0,
    updated: 0,
    sliceIds: [],
    readiness: input.readiness,
    reasonCodes: ["source_code_convergence_tracker_retired_db_primary_work_queue_truth"],
    runtimeJobsCreated: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
  };
}

export function summarizeDbBoundaryForArtifact(
  input:
    | ExecutionPlatformDbBoundaryContract
    | ExecutionPlatformDbReadinessReport
    | ConvergenceTrackerSeedReadinessResult,
): JsonValue {
  return input as unknown as JsonValue;
}
