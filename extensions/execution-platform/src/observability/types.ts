import type { DbOperationStatus } from "../db-operations/types.ts";
import type { ModelTaskPayload, ModelTaskResult } from "../model-tasks/types.ts";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobEvent,
  RuntimeJobState,
} from "../runtime-job-repository.ts";
import type { ScriptJobPayload, ScriptJobResult } from "../script-jobs/types.ts";

export const DIAGNOSTIC_STATES = [
  "healthy",
  "pending",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "timed_out",
  "blocked",
  "manual_ready",
  "unknown",
] as const;

export type DiagnosticState = (typeof DIAGNOSTIC_STATES)[number];

export type DiagnosticLimits = {
  maxStringLength: number;
  maxArrayItems: number;
  maxObjectKeys: number;
  maxDepth: number;
  eventLimit: number;
  artifactLimit: number;
};

export type DiagnosticArtifactSummary = {
  artifactId: string;
  artifactType: string;
  storageKind: string;
  uri: string;
  contentType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  metadata: JsonValue;
  createdAt: string;
};

export type RuntimeJobRetryDiagnostic = {
  attempts: number;
  maxAttempts: number;
  retryAvailable: boolean;
  lastError: JsonValue | null;
  leaseExpiresAt: string | null;
  deadlineAt: string | null;
  recentFailureEvents: Array<{
    eventType: string;
    eventTime: string;
    data: JsonValue;
  }>;
};

export type RuntimeJobDiagnosticBase = {
  state: DiagnosticState;
  job: {
    jobId: string;
    jobType: string;
    queueName: string;
    runtimeState: RuntimeJobState;
    attempts: number;
    maxAttempts: number;
    workerId: string | null;
    leaseExpiresAt: string | null;
    deadlineAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  payload: JsonValue | null;
  result: JsonValue | null;
  error: JsonValue | null;
  retry: RuntimeJobRetryDiagnostic | null;
  events: RuntimeJobEventSummary[];
  artifacts: DiagnosticArtifactSummary[];
};

export type RuntimeJobDiagnostic = RuntimeJobDiagnosticBase & {
  kind: "runtime_job";
};

export type RuntimeJobEventSummary = {
  eventId: string;
  eventType: string;
  eventTime: string;
  workerId: string | null;
  leaseId: string | null;
  data: JsonValue;
};

export type ModelTaskDiagnostic = RuntimeJobDiagnosticBase & {
  kind: "model_task";
  contractId: string | null;
  task: ModelTaskPayload | null;
  modelResult: ModelTaskResult | null;
};

export type DbOperationDiagnostic = RuntimeJobDiagnosticBase & {
  kind: "db_operation";
  operation: DbOperationStatus["operation"];
  operationResult: DbOperationStatus["result"];
  telemetry: JsonValue;
};

export type WorkQueueDiagnostic = {
  kind: "work_queue_item";
  state: DiagnosticState;
  manualReadyMeaning?: string;
  truth: JsonValue | null;
  summary: JsonValue | null;
};

export type ScriptJobDiagnostic = RuntimeJobDiagnosticBase & {
  kind: "script_job";
  script: ScriptJobPayload | null;
  scriptResult: ScriptJobResult | null;
  validationEvidence: JsonValue[];
};

export type ObservabilityDiagnostic =
  | RuntimeJobDiagnostic
  | ModelTaskDiagnostic
  | DbOperationDiagnostic
  | WorkQueueDiagnostic
  | ScriptJobDiagnostic;

export type RuntimeJobReadRecord = {
  job: RuntimeJob;
  events: RuntimeJobEvent[];
  artifacts: RuntimeJobArtifact[];
};
