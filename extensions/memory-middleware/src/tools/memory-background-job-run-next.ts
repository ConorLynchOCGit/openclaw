import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  MemoryBackgroundJobRunNextInput,
  MemoryBackgroundJobRunNextResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { asJsonToolResult, readOptionalString, type ToolRawParams } from "./common.js";

type MemoryBackgroundJobRunNextRawParams = ToolRawParams;

const MemoryBackgroundJobRunNextToolSchema = Type.Object(
  {
    projectId: Type.Optional(
      Type.String({
        description: "Optional bounded project id to scope the next runnable background job.",
        minLength: 1,
      }),
    ),
    runnerId: Type.Optional(
      Type.String({
        description: "Optional runner ownership id for operationally controlled run-next access.",
        minLength: 1,
      }),
    ),
  },
  { additionalProperties: false },
);

export function normalizeMemoryBackgroundJobRunNextInput(params: {
  rawParams: MemoryBackgroundJobRunNextRawParams;
  context?: OpenClawPluginToolContext;
}): MemoryBackgroundJobRunNextInput {
  const projectId = readOptionalString(params.rawParams, "projectId");
  const runnerId = readOptionalString(params.rawParams, "runnerId") ?? params.context?.agentId;

  return {
    ...(projectId ? { projectId } : {}),
    ...(runnerId ? { runnerId } : {}),
  };
}

export async function runNextMemoryBackgroundJobFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryBackgroundJobRunNextInput;
}): Promise<MemoryBackgroundJobRunNextResult> {
  return params.runtime.backgroundJobs.runNext(params.input);
}

export function createMemoryBackgroundJobRunNextTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_background_job_run_next",
    label: "Memory Background Job Run Next",
    description:
      "Claim and run the next bounded internal memory-middleware background job for advisory proactive planning, advisory consolidation planning, bounded safe consolidation execution, or proactive drift-check execution only.",
    parameters: MemoryBackgroundJobRunNextToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryBackgroundJobRunNextRawParams) {
      const input = normalizeMemoryBackgroundJobRunNextInput({
        rawParams,
        context: params.context,
      });
      const result = await runNextMemoryBackgroundJobFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
