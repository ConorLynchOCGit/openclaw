import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { MemoryProactivePlanInput, MemoryProactivePlanResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  asJsonToolResult,
  readOptionalNumber,
  readOptionalString,
  type ToolRawParams,
} from "./common.js";

type MemoryProactivePlanRawParams = ToolRawParams;

const MemoryProactivePlanToolSchema = Type.Object(
  {
    projectId: Type.Optional(
      Type.String({
        description: "Optional bounded project id to scope advisory-only proactive planning.",
        minLength: 1,
      }),
    ),
    maxActions: Type.Optional(
      Type.Number({
        description: "Maximum number of advisory actions to return.",
        minimum: 1,
        maximum: 20,
      }),
    ),
  },
  { additionalProperties: false },
);

export function normalizeMemoryProactivePlanInput(
  rawParams: MemoryProactivePlanRawParams,
): MemoryProactivePlanInput {
  const projectId = readOptionalString(rawParams, "projectId");
  const maxActions = readOptionalNumber(rawParams, "maxActions");

  return {
    ...(projectId ? { projectId } : {}),
    ...(maxActions !== undefined ? { maxActions } : {}),
  };
}

export async function planMemoryProactivityFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryProactivePlanInput;
}): Promise<MemoryProactivePlanResult> {
  return params.runtime.proactivePlanning.plan(params.input);
}

export function createMemoryProactivePlanTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_proactive_plan",
    label: "Memory Proactive Plan",
    description:
      "Inspect bounded internal memory-middleware state and return advisory-only next-step follow-up opportunities without executing any action.",
    parameters: MemoryProactivePlanToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryProactivePlanRawParams) {
      const input = normalizeMemoryProactivePlanInput(rawParams);
      const result = await planMemoryProactivityFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
