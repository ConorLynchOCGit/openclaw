import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  FullCompactionFallbackExecuteInput,
  FullCompactionFallbackExecuteResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  CandidateToolInputError,
  asJsonToolResult,
  readOptionalNumber,
  readOptionalString,
  type ToolRawParams,
} from "./common.js";

type MemoryFullCompactionFallbackExecuteRawParams = ToolRawParams;

const MemoryFullCompactionFallbackExecuteToolSchema = Type.Object(
  {
    sessionId: Type.Optional(Type.String({ minLength: 1 })),
    agentId: Type.Optional(Type.String({ minLength: 1 })),
    idleGapSeconds: Type.Optional(Type.Number({ minimum: 1, maximum: 86400 })),
    persistedCountThreshold: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    estimatedPromptTokens: Type.Optional(Type.Number({ minimum: 1 })),
    estimatedPromptTokenThreshold: Type.Optional(Type.Number({ minimum: 1, maximum: 200000 })),
    recentFloorCount: Type.Optional(Type.Number({ minimum: 0, maximum: 20 })),
    maxClearCount: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
    sessionMemoryStaleAfterSeconds: Type.Optional(Type.Number({ minimum: 1, maximum: 86400 })),
  },
  { additionalProperties: false },
);

export function normalizeMemoryFullCompactionFallbackExecuteInput(params: {
  rawParams: MemoryFullCompactionFallbackExecuteRawParams;
  context?: OpenClawPluginToolContext;
}): FullCompactionFallbackExecuteInput {
  const sessionId = readOptionalString(params.rawParams, "sessionId") ?? params.context?.sessionId;
  const agentId = readOptionalString(params.rawParams, "agentId") ?? params.context?.agentId;
  if (!sessionId) {
    throw new CandidateToolInputError("sessionId required");
  }
  if (!agentId) {
    throw new CandidateToolInputError("agentId required");
  }

  const idleGapSeconds = readOptionalNumber(params.rawParams, "idleGapSeconds");
  const persistedCountThreshold = readOptionalNumber(params.rawParams, "persistedCountThreshold");
  const estimatedPromptTokens = readOptionalNumber(params.rawParams, "estimatedPromptTokens");
  const estimatedPromptTokenThreshold = readOptionalNumber(
    params.rawParams,
    "estimatedPromptTokenThreshold",
  );
  const recentFloorCount = readOptionalNumber(params.rawParams, "recentFloorCount");
  const maxClearCount = readOptionalNumber(params.rawParams, "maxClearCount");
  const sessionMemoryStaleAfterSeconds = readOptionalNumber(
    params.rawParams,
    "sessionMemoryStaleAfterSeconds",
  );

  return {
    sessionId,
    agentId,
    ...(idleGapSeconds !== undefined ? { idleGapSeconds } : {}),
    ...(persistedCountThreshold !== undefined ? { persistedCountThreshold } : {}),
    ...(estimatedPromptTokens !== undefined ? { estimatedPromptTokens } : {}),
    ...(estimatedPromptTokenThreshold !== undefined ? { estimatedPromptTokenThreshold } : {}),
    ...(recentFloorCount !== undefined ? { recentFloorCount } : {}),
    ...(maxClearCount !== undefined ? { maxClearCount } : {}),
    ...(sessionMemoryStaleAfterSeconds !== undefined ? { sessionMemoryStaleAfterSeconds } : {}),
  };
}

export async function executeMemoryFullCompactionFallbackFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: FullCompactionFallbackExecuteInput;
}): Promise<FullCompactionFallbackExecuteResult> {
  return params.runtime.fullCompactionFallback.execute(params.input);
}

export function createMemoryFullCompactionFallbackExecuteTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_full_compaction_fallback_execute",
    label: "Memory Full Compaction Fallback Execute",
    description:
      "Execute the bounded final fallback compaction path when compaction planning recommends a full fallback artifact.",
    parameters: MemoryFullCompactionFallbackExecuteToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryFullCompactionFallbackExecuteRawParams) {
      const input = normalizeMemoryFullCompactionFallbackExecuteInput({
        rawParams,
        context: params.context,
      });
      const result = await executeMemoryFullCompactionFallbackFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
