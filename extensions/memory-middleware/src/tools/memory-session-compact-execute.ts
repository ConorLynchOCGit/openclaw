import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  SessionMemoryCompactExecuteInput,
  SessionMemoryCompactExecuteResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  CandidateToolInputError,
  asJsonToolResult,
  readOptionalNumber,
  readOptionalString,
  type ToolRawParams,
} from "./common.js";

type MemorySessionCompactExecuteRawParams = ToolRawParams;

const MemorySessionCompactExecuteToolSchema = Type.Object(
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

export function normalizeMemorySessionCompactExecuteInput(params: {
  rawParams: MemorySessionCompactExecuteRawParams;
  context?: OpenClawPluginToolContext;
}): SessionMemoryCompactExecuteInput {
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

export async function executeMemorySessionCompactionFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: SessionMemoryCompactExecuteInput;
}): Promise<SessionMemoryCompactExecuteResult> {
  return params.runtime.sessionMemoryCompaction.execute(params.input);
}

export function createMemorySessionCompactExecuteTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_session_compact_execute",
    label: "Memory Session Compact Execute",
    description:
      "Execute the bounded session-memory compaction path when compaction planning recommends reusing existing session memory.",
    parameters: MemorySessionCompactExecuteToolSchema,
    async execute(_toolCallId: string, rawParams: MemorySessionCompactExecuteRawParams) {
      const input = normalizeMemorySessionCompactExecuteInput({
        rawParams,
        context: params.context,
      });
      const result = await executeMemorySessionCompactionFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
