import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  MemoryBackgroundJobClass,
  MemoryBackgroundJobListInput,
  MemoryBackgroundJobListResult,
  MemoryBackgroundJobStatus,
} from "../db/runtime.js";
import { MEMORY_BACKGROUND_JOB_CLASSES, MEMORY_BACKGROUND_JOB_STATUSES } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  CandidateToolInputError,
  asJsonToolResult,
  readOptionalNumber,
  readOptionalString,
  type ToolRawParams,
} from "./common.js";

type MemoryBackgroundJobListRawParams = ToolRawParams;

function backgroundJobClassSchema() {
  return Type.Unsafe<MemoryBackgroundJobClass>({
    type: "string",
    enum: [...MEMORY_BACKGROUND_JOB_CLASSES],
  });
}

function backgroundJobStatusSchema() {
  return Type.Unsafe<MemoryBackgroundJobStatus>({
    type: "string",
    enum: [...MEMORY_BACKGROUND_JOB_STATUSES],
  });
}

const MemoryBackgroundJobListToolSchema = Type.Object(
  {
    projectId: Type.Optional(Type.String({ minLength: 1 })),
    jobClass: Type.Optional(backgroundJobClassSchema()),
    status: Type.Optional(backgroundJobStatusSchema()),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);

function readOptionalBackgroundJobClass(
  rawParams: MemoryBackgroundJobListRawParams,
): MemoryBackgroundJobClass | undefined {
  const jobClass = readOptionalString(rawParams, "jobClass");
  if (!jobClass) {
    return undefined;
  }
  if (!MEMORY_BACKGROUND_JOB_CLASSES.includes(jobClass as MemoryBackgroundJobClass)) {
    throw new CandidateToolInputError(
      `jobClass must be one of: ${MEMORY_BACKGROUND_JOB_CLASSES.join(", ")}`,
    );
  }
  return jobClass as MemoryBackgroundJobClass;
}

function readOptionalBackgroundJobStatus(
  rawParams: MemoryBackgroundJobListRawParams,
): MemoryBackgroundJobStatus | undefined {
  const status = readOptionalString(rawParams, "status");
  if (!status) {
    return undefined;
  }
  if (!MEMORY_BACKGROUND_JOB_STATUSES.includes(status as MemoryBackgroundJobStatus)) {
    throw new CandidateToolInputError(
      `status must be one of: ${MEMORY_BACKGROUND_JOB_STATUSES.join(", ")}`,
    );
  }
  return status as MemoryBackgroundJobStatus;
}

export function normalizeMemoryBackgroundJobListInput(
  rawParams: MemoryBackgroundJobListRawParams,
): MemoryBackgroundJobListInput {
  const projectId = readOptionalString(rawParams, "projectId");
  const jobClass = readOptionalBackgroundJobClass(rawParams);
  const status = readOptionalBackgroundJobStatus(rawParams);
  const limit = readOptionalNumber(rawParams, "limit");

  return {
    ...(projectId ? { projectId } : {}),
    ...(jobClass ? { jobClass } : {}),
    ...(status ? { status } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

export async function listMemoryBackgroundJobsFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryBackgroundJobListInput;
}): Promise<MemoryBackgroundJobListResult> {
  return params.runtime.backgroundJobs.list(params.input);
}

export function createMemoryBackgroundJobListTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_background_job_list",
    label: "Memory Background Job List",
    description:
      "Inspect bounded internal memory-middleware background jobs without executing them.",
    parameters: MemoryBackgroundJobListToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryBackgroundJobListRawParams) {
      const input = normalizeMemoryBackgroundJobListInput(rawParams);
      const result = await listMemoryBackgroundJobsFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
