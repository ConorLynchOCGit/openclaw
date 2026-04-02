import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { ProcedureValidationPlanInput, ProcedureValidationPlanResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { asJsonToolResult, readRequiredString, type ToolRawParams } from "./common.js";

type ProcedureValidatePlanRawParams = ToolRawParams;

const ProcedureValidatePlanToolSchema = Type.Object(
  {
    procedureId: Type.String({
      description: "Draft procedure id to inspect for advisory-only validation planning.",
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export function normalizeProcedureValidationPlanInput(
  rawParams: ProcedureValidatePlanRawParams,
): ProcedureValidationPlanInput {
  return {
    procedureId: readRequiredString(rawParams, "procedureId"),
  };
}

export async function planProcedureValidationFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: ProcedureValidationPlanInput;
}): Promise<ProcedureValidationPlanResult> {
  return params.runtime.procedureValidationPlan.plan(params.input);
}

export function createProcedureValidatePlanTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_procedure_validate_plan",
    label: "Memory Procedure Validate Plan",
    description:
      "Return advisory-only validation-planning targets for a draft procedure without creating validated procedures or skill candidates.",
    parameters: ProcedureValidatePlanToolSchema,
    async execute(_toolCallId: string, rawParams: ProcedureValidatePlanRawParams) {
      const input = normalizeProcedureValidationPlanInput(rawParams);
      const result = await planProcedureValidationFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
