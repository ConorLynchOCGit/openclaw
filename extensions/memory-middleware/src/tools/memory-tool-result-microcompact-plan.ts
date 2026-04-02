import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  ToolResultMicrocompactPlanInput,
  ToolResultMicrocompactPlanResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  CandidateToolInputError,
  asJsonToolResult,
  readOptionalNumber,
  readOptionalString,
  type ToolRawParams,
} from "./common.js";

type MemoryToolResultMicrocompactPlanRawParams = ToolRawParams;

const MemoryToolResultMicrocompactPlanToolSchema = Type.Object(
  {
    sessionId: Type.Optional(
      Type.String({
        description: "Bounded session id. Falls back to trusted tool context when available.",
        minLength: 1,
      }),
    ),
    idleGapSeconds: Type.Optional(
      Type.Number({
        description: "Optional idle-gap threshold in seconds. Defaults to 900.",
        minimum: 1,
        maximum: 86400,
      }),
    ),
    persistedCountThreshold: Type.Optional(
      Type.Number({
        description: "Optional persisted-result count threshold. Defaults to 6.",
        minimum: 1,
        maximum: 100,
      }),
    ),
    estimatedPromptTokens: Type.Optional(
      Type.Number({
        description: "Optional explicit prompt-pressure hint in tokens.",
        minimum: 1,
      }),
    ),
    estimatedPromptTokenThreshold: Type.Optional(
      Type.Number({
        description: "Optional token-pressure threshold. Defaults to 12000.",
        minimum: 1,
        maximum: 200000,
      }),
    ),
    recentFloorCount: Type.Optional(
      Type.Number({
        description: "Optional recent floor to preserve. Defaults to 2.",
        minimum: 0,
        maximum: 20,
      }),
    ),
    maxClearCount: Type.Optional(
      Type.Number({
        description:
          "Optional max number of persisted previews to recommend clearing. Defaults to 10.",
        minimum: 1,
        maximum: 50,
      }),
    ),
  },
  { additionalProperties: false },
);

export function normalizeMemoryToolResultMicrocompactPlanInput(params: {
  rawParams: MemoryToolResultMicrocompactPlanRawParams;
  context?: OpenClawPluginToolContext;
}): ToolResultMicrocompactPlanInput {
  const sessionId = readOptionalString(params.rawParams, "sessionId") ?? params.context?.sessionId;
  if (!sessionId) {
    throw new CandidateToolInputError("sessionId required");
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

  return {
    sessionId,
    ...(idleGapSeconds !== undefined ? { idleGapSeconds } : {}),
    ...(persistedCountThreshold !== undefined ? { persistedCountThreshold } : {}),
    ...(estimatedPromptTokens !== undefined ? { estimatedPromptTokens } : {}),
    ...(estimatedPromptTokenThreshold !== undefined ? { estimatedPromptTokenThreshold } : {}),
    ...(recentFloorCount !== undefined ? { recentFloorCount } : {}),
    ...(maxClearCount !== undefined ? { maxClearCount } : {}),
  };
}

export async function planMemoryToolResultMicrocompactionFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: ToolResultMicrocompactPlanInput;
}): Promise<ToolResultMicrocompactPlanResult> {
  return params.runtime.toolResultStore.planMicrocompaction(params.input);
}

export function createMemoryToolResultMicrocompactPlanTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_tool_result_microcompact_plan",
    label: "Memory Tool Result Microcompact Plan",
    description:
      "Plan bounded prompt-preview clearing for older persisted tool results while preserving a recent floor.",
    parameters: MemoryToolResultMicrocompactPlanToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryToolResultMicrocompactPlanRawParams) {
      const input = normalizeMemoryToolResultMicrocompactPlanInput({
        rawParams,
        context: params.context,
      });
      const result = await planMemoryToolResultMicrocompactionFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
