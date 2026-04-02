import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  ToolResultMicrocompactExecuteInput,
  ToolResultMicrocompactExecuteResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  CandidateToolInputError,
  asJsonToolResult,
  readOptionalNumber,
  readOptionalString,
  readOptionalStringArray,
  type ToolRawParams,
} from "./common.js";

type MemoryToolResultMicrocompactExecuteRawParams = ToolRawParams;

const MemoryToolResultMicrocompactExecuteToolSchema = Type.Object(
  {
    sessionId: Type.Optional(Type.String({ minLength: 1 })),
    agentId: Type.Optional(Type.String({ minLength: 1 })),
    clearToolResultIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    idleGapSeconds: Type.Optional(Type.Number({ minimum: 1, maximum: 86400 })),
    persistedCountThreshold: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    estimatedPromptTokens: Type.Optional(Type.Number({ minimum: 1 })),
    estimatedPromptTokenThreshold: Type.Optional(Type.Number({ minimum: 1, maximum: 200000 })),
    recentFloorCount: Type.Optional(Type.Number({ minimum: 0, maximum: 20 })),
    maxClearCount: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
  },
  { additionalProperties: false },
);

export function normalizeMemoryToolResultMicrocompactExecuteInput(params: {
  rawParams: MemoryToolResultMicrocompactExecuteRawParams;
  context?: OpenClawPluginToolContext;
}): ToolResultMicrocompactExecuteInput {
  const sessionId = readOptionalString(params.rawParams, "sessionId") ?? params.context?.sessionId;
  if (!sessionId) {
    throw new CandidateToolInputError("sessionId required");
  }

  const agentId = readOptionalString(params.rawParams, "agentId") ?? params.context?.agentId;
  const clearToolResultIds = readOptionalStringArray(params.rawParams, "clearToolResultIds");
  const idleGapSeconds = readOptionalNumber(params.rawParams, "idleGapSeconds");
  const persistedCountThreshold = readOptionalNumber(params.rawParams, "persistedCountThreshold");
  const estimatedPromptTokens = readOptionalNumber(params.rawParams, "estimatedPromptTokens");
  const estimatedPromptTokenThreshold = readOptionalNumber(
    params.rawParams,
    "estimatedPromptTokenThreshold",
  );
  const recentFloorCount = readOptionalNumber(params.rawParams, "recentFloorCount");
  const maxClearCount = readOptionalNumber(params.rawParams, "maxClearCount");

  return {
    sessionId,
    ...(agentId ? { agentId } : {}),
    ...(clearToolResultIds ? { clearToolResultIds } : {}),
    ...(idleGapSeconds !== undefined ? { idleGapSeconds } : {}),
    ...(persistedCountThreshold !== undefined ? { persistedCountThreshold } : {}),
    ...(estimatedPromptTokens !== undefined ? { estimatedPromptTokens } : {}),
    ...(estimatedPromptTokenThreshold !== undefined ? { estimatedPromptTokenThreshold } : {}),
    ...(recentFloorCount !== undefined ? { recentFloorCount } : {}),
    ...(maxClearCount !== undefined ? { maxClearCount } : {}),
  };
}

export async function executeMemoryToolResultMicrocompactionFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: ToolResultMicrocompactExecuteInput;
}): Promise<ToolResultMicrocompactExecuteResult> {
  return params.runtime.toolResultStore.executeMicrocompaction(params.input);
}

export function createMemoryToolResultMicrocompactExecuteTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_tool_result_microcompact_execute",
    label: "Memory Tool Result Microcompact Execute",
    description:
      "Execute bounded persisted-preview clearing for eligible old tool results while preserving the recent floor.",
    parameters: MemoryToolResultMicrocompactExecuteToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryToolResultMicrocompactExecuteRawParams) {
      const input = normalizeMemoryToolResultMicrocompactExecuteInput({
        rawParams,
        context: params.context,
      });
      const result = await executeMemoryToolResultMicrocompactionFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
