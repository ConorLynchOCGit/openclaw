import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { ProcedureValidationInput, ProcedureValidationResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { storeValidatedProcedureSemanticEmbedding } from "../semantic-retrieval-routing.js";
import {
  asJsonToolResult,
  readOptionalObject,
  readOptionalString,
  readRequiredString,
  type ToolRawParams,
} from "./common.js";

type ProcedureValidateRawParams = ToolRawParams;

const ProcedureValidateToolSchema = Type.Object(
  {
    procedureId: Type.String({
      description: "Draft procedure id to validate into a bounded validated procedure.",
      minLength: 1,
    }),
    rationale: Type.Optional(
      Type.String({
        description: "Optional bounded rationale for this manual procedure validation.",
        minLength: 1,
      }),
    ),
    validatorAgentId: Type.Optional(
      Type.String({
        description: "Optional validator agent id. Falls back to trusted tool context.",
        minLength: 1,
      }),
    ),
    metadata: Type.Optional(
      Type.Object({}, { additionalProperties: true, description: "Optional validation metadata." }),
    ),
  },
  { additionalProperties: false },
);

export function normalizeProcedureValidationInput(params: {
  rawParams: ProcedureValidateRawParams;
  context?: OpenClawPluginToolContext;
}): ProcedureValidationInput {
  const procedureId = readRequiredString(params.rawParams, "procedureId");
  const rationale = readOptionalString(params.rawParams, "rationale");
  const validatorAgentId =
    readOptionalString(params.rawParams, "validatorAgentId") ?? params.context?.agentId;
  const metadata = readOptionalObject(params.rawParams, "metadata");

  return {
    procedureId,
    ...(rationale ? { rationale } : {}),
    ...(validatorAgentId ? { validatorAgentId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export async function validateProcedureFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: ProcedureValidationInput;
  context?: OpenClawPluginToolContext;
}): Promise<ProcedureValidationResult> {
  const result = await params.runtime.procedureValidation.validate(params.input);
  if (
    result.accepted &&
    (result.status === "validated" || result.status === "already_validated") &&
    params.context?.sessionKey
  ) {
    try {
      await storeValidatedProcedureSemanticEmbedding({
        config: params.runtime.config,
        cfg: params.context.runtimeConfig ?? params.context.config,
        agentId: params.context.agentId,
        sessionKey: params.context.sessionKey,
        procedureId: result.procedureId,
      });
    } catch {
      // Keep procedure validation authoritative even when semantic support is unavailable.
    }
  }
  return result;
}

export function createProcedureValidateTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_procedure_validate",
    label: "Memory Procedure Validate",
    description:
      "Validate an eligible bounded draft procedure without creating skill candidates or automatic downstream workflows.",
    parameters: ProcedureValidateToolSchema,
    async execute(_toolCallId: string, rawParams: ProcedureValidateRawParams) {
      const input = normalizeProcedureValidationInput({
        rawParams,
        context: params.context,
      });
      const result = await validateProcedureFromTool({
        runtime: params.runtime,
        input,
        context: params.context,
      });
      return asJsonToolResult(result);
    },
  };
}
