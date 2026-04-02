import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { ConsolidationPlanInput, ConsolidationPlanResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  asJsonToolResult,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  type ToolRawParams,
} from "./common.js";

type MemoryConsolidationPlanRawParams = ToolRawParams;

const MemoryConsolidationPlanToolSchema = Type.Object(
  {
    projectId: Type.Optional(Type.String({ minLength: 1 })),
    includeValidatedProcedures: Type.Optional(Type.Boolean()),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    maxFindings: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
  },
  { additionalProperties: false },
);

export function normalizeMemoryConsolidationPlanInput(
  rawParams: MemoryConsolidationPlanRawParams,
): ConsolidationPlanInput {
  const projectId = readOptionalString(rawParams, "projectId");
  const includeValidatedProcedures = readOptionalBoolean(rawParams, "includeValidatedProcedures");
  const limit = readOptionalNumber(rawParams, "limit");
  const maxFindings = readOptionalNumber(rawParams, "maxFindings");

  return {
    ...(projectId ? { projectId } : {}),
    ...(includeValidatedProcedures !== undefined ? { includeValidatedProcedures } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(maxFindings !== undefined ? { maxFindings } : {}),
  };
}

export async function planMemoryConsolidationFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: ConsolidationPlanInput;
}): Promise<ConsolidationPlanResult> {
  return params.runtime.consolidationPlanning.plan(params.input);
}

export function createMemoryConsolidationPlanTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_consolidation_plan",
    label: "Memory Consolidation Plan",
    description:
      "Inspect bounded durable memory and propose duplicate, contradiction, stale, or drift review actions without mutating stored records.",
    parameters: MemoryConsolidationPlanToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryConsolidationPlanRawParams) {
      const input = normalizeMemoryConsolidationPlanInput(rawParams);
      const result = await planMemoryConsolidationFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
