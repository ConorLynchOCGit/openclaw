import type {
  ClaimedRuntimeJob,
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobEvent,
} from "../runtime-job-repository.ts";

export const SCRIPT_JOB_TYPE_PREFIX = "script_job.";

export const SCRIPT_JOB_LANES = ["build", "test", "lint", "eval", "proof"] as const;

export type ScriptJobLane = (typeof SCRIPT_JOB_LANES)[number];

export type ScriptArtifactPolicy = {
  maxMetadataBytes: number;
  maxInlineTextBytes: number;
  allowInlineText: boolean;
};

export type ScriptJobDefinition = {
  scriptId: string;
  description: string;
  handlerId: string;
  allowedLanes: ScriptJobLane[];
  timeoutMs: number;
  artifactPolicy: ScriptArtifactPolicy;
  shellExecutionAllowed: false;
};

export type ScriptJobPayload = {
  family: "script_job";
  scriptId: string;
  lane: ScriptJobLane;
  input: JsonValue;
  definitionSnapshot: {
    handlerId: string;
    timeoutMs: number;
    artifactPolicy: ScriptArtifactPolicy;
    shellExecutionAllowed: false;
  };
};

export type ScriptJobResult = {
  family: "script_job";
  scriptId: string;
  lane: ScriptJobLane;
  output: JsonValue;
  exitCode?: number;
  validationEvidence?: ValidationLaneEvidence;
};

export type ClaimedScriptJob = ClaimedRuntimeJob & {
  definition: ScriptJobDefinition;
  script: ScriptJobPayload;
};

export type ScriptJobStatus = {
  job: RuntimeJob | null;
  payload: ScriptJobPayload | null;
  result: ScriptJobResult | null;
  evidence: {
    events: RuntimeJobEvent[];
    artifacts: RuntimeJobArtifact[];
  };
};

export const VALIDATION_LANE_IDS = ["build", "test", "lint", "eval", "proof"] as const;

export type ValidationLaneId = (typeof VALIDATION_LANE_IDS)[number];

export type ValidationLaneDefinition = {
  laneId: ValidationLaneId;
  description: string;
  commandDescriptor: string;
  turboMayOrchestrate: boolean;
  turboRuntimeTruth: false;
};

export type ValidationLaneEvidence = {
  laneId: ValidationLaneId;
  outcome: "passed" | "failed" | "canceled" | "skipped";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: string;
  artifactRefs: string[];
  turboMayOrchestrate: boolean;
  turboRuntimeTruth: false;
  metadata?: JsonValue;
};

export function scriptJobType(scriptId: string): string {
  return `${SCRIPT_JOB_TYPE_PREFIX}${scriptId}`;
}

export function isScriptJobPayload(value: JsonValue): value is ScriptJobPayload {
  const record = value as Record<string, unknown>;
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    record.family === "script_job" &&
    typeof record.scriptId === "string" &&
    typeof record.lane === "string"
  );
}

export function isScriptJobResult(value: JsonValue | null): value is ScriptJobResult {
  const record = value as Record<string, unknown>;
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    record.family === "script_job" &&
    typeof record.scriptId === "string" &&
    "output" in record
  );
}
