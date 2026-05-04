import type { ClaimedRuntimeJob, JsonValue, RuntimeJob } from "../runtime-job-repository.ts";

export const DB_OPERATION_JOB_TYPE_PREFIX = "db_operation.";

export const DB_OPERATION_LANES = [
  "interactive",
  "background",
  "maintenance",
  "migration",
  "analytics",
] as const;

export type DbOperationLane = (typeof DB_OPERATION_LANES)[number];

export const DB_OPERATION_KINDS = [
  "read",
  "write",
  "transaction",
  "long_read",
  "maintenance",
  "migration",
  "batch",
] as const;

export type DbOperationKind = (typeof DB_OPERATION_KINDS)[number];

export type DbOperationDecisionKind = "synchronous" | "durable" | "deferred" | "rejected";

export type DbOperationOutcome = "succeeded" | "failed" | "timed_out" | "deferred" | "rejected";

export type DbPoolPressureSnapshot = {
  checkedAt: string;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  maxConnections: number;
  utilization: number;
};

export type DbOperationLanePolicy = {
  synchronousTimeoutMs: number;
  durableAfterMs: number;
  maxPoolUtilization: number;
  maxWaitingCount: number;
  rejectPoolUtilization: number;
};

export type DbOperationTimeoutPolicy = Record<DbOperationLane, DbOperationLanePolicy>;

export type DbPoolPressureClassification = {
  decision: "allow" | "defer" | "reject";
  reason: string;
  pressure: DbPoolPressureSnapshot;
};

export type DbOperationClassification = {
  decision: DbOperationDecisionKind;
  reason: string;
  lane: DbOperationLane;
  operationKind: DbOperationKind;
  timeoutBudgetMs: number;
  durableAfterMs: number;
  pressure?: DbPoolPressureClassification;
};

export type DbOperationTelemetry = {
  telemetryId: string;
  operationName: string;
  operationKind: DbOperationKind;
  lane: DbOperationLane;
  decision: DbOperationDecisionKind;
  outcome: DbOperationOutcome;
  timeoutBudgetMs: number;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  pressureSnapshot?: DbPoolPressureSnapshot;
  classification: DbOperationClassification;
  jobId?: string;
  error?: JsonValue;
};

export type DbOperationPayload = {
  family: "db_operation";
  operationName: string;
  operationKind: DbOperationKind;
  lane: DbOperationLane;
  params: JsonValue;
  classification: DbOperationClassification;
  pressureSnapshot?: DbPoolPressureSnapshot;
};

export type DbOperationResult = {
  family: "db_operation";
  operationName: string;
  operationKind: DbOperationKind;
  lane: DbOperationLane;
  output: JsonValue;
  telemetry?: DbOperationTelemetry;
};

export type ClaimedDbOperation = ClaimedRuntimeJob & {
  operation: DbOperationPayload;
};

export type DbOperationStatus = {
  job: RuntimeJob | null;
  operation: DbOperationPayload | null;
  result: DbOperationResult | null;
  telemetry: DbOperationTelemetry[];
};

export function dbOperationJobType(operationName: string): string {
  return `${DB_OPERATION_JOB_TYPE_PREFIX}${operationName}`;
}

export function isDbOperationPayload(value: JsonValue): value is DbOperationPayload {
  const record = value as Record<string, unknown>;
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    record.family === "db_operation" &&
    typeof record.operationName === "string" &&
    typeof record.operationKind === "string" &&
    typeof record.lane === "string"
  );
}

export function isDbOperationResult(value: JsonValue | null): value is DbOperationResult {
  const record = value as Record<string, unknown>;
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    record.family === "db_operation" &&
    typeof record.operationName === "string" &&
    "output" in record
  );
}
