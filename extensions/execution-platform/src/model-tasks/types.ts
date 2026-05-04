import type { z } from "zod";
import type {
  ModelRouteCandidate,
  ModelRouteEvidence,
  ModelRoutePolicy,
} from "../model-routing/types.ts";
import type { ClaimedRuntimeJob, JsonValue } from "../runtime-job-repository.ts";

export const MODEL_TASK_JOB_TYPE_PREFIX = "model_task.";

export type ModelTaskContractId =
  | "model_memory.structured_json"
  | "retrieval.structured_json"
  | "proactivity.structured_json"
  | "skillifier.structured_json"
  | "outcome_pack_review.structured_json"
  | (string & {});

export type ModelTaskRouteCandidate = ModelRouteCandidate;

export type ModelTaskRoutePolicy = ModelRoutePolicy;

export type ModelTaskRouteEvidence = ModelRouteEvidence;

export type ModelTaskScorecardEvidence = {
  status: "not_run" | "placeholder" | "passed" | "failed";
  score?: number;
  notes?: string;
};

export type ModelTaskValidationEvidence = {
  ok: boolean;
  schema: "input" | "output";
  issues: string[];
};

export type ModelTaskPayload = {
  family: "model_task";
  contractId: ModelTaskContractId;
  input: JsonValue;
  routePolicy: ModelTaskRoutePolicy;
  routeEvidence: ModelTaskRouteEvidence;
  validation: {
    input: ModelTaskValidationEvidence;
    output?: ModelTaskValidationEvidence;
  };
  scorecard: ModelTaskScorecardEvidence;
};

export type ModelTaskResult = {
  family: "model_task";
  contractId: ModelTaskContractId;
  output: JsonValue;
  routeEvidence: ModelTaskRouteEvidence;
  validation: {
    output: ModelTaskValidationEvidence;
  };
  scorecard: ModelTaskScorecardEvidence;
};

export type ModelTaskContract = {
  id: ModelTaskContractId;
  description: string;
  inputSchema: z.ZodType<JsonValue>;
  outputSchema: z.ZodType<JsonValue>;
  routePolicy: ModelTaskRoutePolicy;
  scorecard: ModelTaskScorecardEvidence;
};

export type ClaimedModelTask = ClaimedRuntimeJob & {
  contract: ModelTaskContract;
  task: ModelTaskPayload;
};

export function modelTaskJobType(contractId: ModelTaskContractId): string {
  return `${MODEL_TASK_JOB_TYPE_PREFIX}${contractId}`;
}

export function isModelTaskPayload(value: JsonValue): value is ModelTaskPayload {
  const record = value as Record<string, unknown>;
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    record.family === "model_task" &&
    typeof record.contractId === "string"
  );
}

export function isModelTaskResult(value: JsonValue | null): value is ModelTaskResult {
  const record = value as Record<string, unknown>;
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    record.family === "model_task" &&
    typeof record.contractId === "string" &&
    "output" in record
  );
}
