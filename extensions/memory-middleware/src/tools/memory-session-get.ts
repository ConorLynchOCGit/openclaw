import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { SessionMemoryGetInput, SessionMemoryGetResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  CandidateToolInputError,
  asJsonToolResult,
  readOptionalString,
  type ToolRawParams,
} from "./common.js";

type MemorySessionGetRawParams = ToolRawParams;

const MemorySessionGetToolSchema = Type.Object(
  {
    sessionId: Type.Optional(
      Type.String({
        description: "Session id. Falls back to trusted tool context when available.",
        minLength: 1,
      }),
    ),
    agentId: Type.Optional(
      Type.String({
        description: "Agent id. Falls back to trusted tool context when available.",
        minLength: 1,
      }),
    ),
  },
  { additionalProperties: false },
);

export function normalizeMemorySessionGetInput(params: {
  rawParams: MemorySessionGetRawParams;
  context?: OpenClawPluginToolContext;
}): SessionMemoryGetInput {
  const sessionId = readOptionalString(params.rawParams, "sessionId") ?? params.context?.sessionId;
  const agentId = readOptionalString(params.rawParams, "agentId") ?? params.context?.agentId;

  if (!sessionId) {
    throw new CandidateToolInputError("sessionId required");
  }
  if (!agentId) {
    throw new CandidateToolInputError("agentId required");
  }

  return {
    sessionId,
    agentId,
  };
}

export async function getMemorySessionFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: SessionMemoryGetInput;
}): Promise<SessionMemoryGetResult> {
  return params.runtime.sessionMemory.get(params.input);
}

export function createMemorySessionGetTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_session_get",
    label: "Memory Session Get",
    description: "Retrieve the bounded structured session-memory state for the active session.",
    parameters: MemorySessionGetToolSchema,
    async execute(_toolCallId: string, rawParams: MemorySessionGetRawParams) {
      const input = normalizeMemorySessionGetInput({
        rawParams,
        context: params.context,
      });
      const result = await getMemorySessionFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
