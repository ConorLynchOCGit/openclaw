import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { MemoryBackgroundJobGetInput, MemoryBackgroundJobGetResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { asJsonToolResult, readRequiredString, type ToolRawParams } from "./common.js";

type MemoryBackgroundJobGetRawParams = ToolRawParams;

const MemoryBackgroundJobGetToolSchema = Type.Object(
  {
    jobId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export function normalizeMemoryBackgroundJobGetInput(
  rawParams: MemoryBackgroundJobGetRawParams,
): MemoryBackgroundJobGetInput {
  return {
    jobId: readRequiredString(rawParams, "jobId"),
  };
}

export async function getMemoryBackgroundJobFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryBackgroundJobGetInput;
}): Promise<MemoryBackgroundJobGetResult> {
  return params.runtime.backgroundJobs.get(params.input);
}

export function createMemoryBackgroundJobGetTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_background_job_get",
    label: "Memory Background Job Get",
    description:
      "Inspect one bounded internal memory-middleware background job without executing it.",
    parameters: MemoryBackgroundJobGetToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryBackgroundJobGetRawParams) {
      const input = normalizeMemoryBackgroundJobGetInput(rawParams);
      const result = await getMemoryBackgroundJobFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
