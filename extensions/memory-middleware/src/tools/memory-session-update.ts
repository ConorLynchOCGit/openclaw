import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { SessionMemoryUpdateInput, SessionMemoryUpdateResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  CandidateToolInputError,
  asJsonToolResult,
  readOptionalObject,
  readOptionalString,
  readOptionalStringArray,
  type ToolRawParams,
} from "./common.js";

type MemorySessionUpdateRawParams = ToolRawParams;

const MemorySessionUpdateToolSchema = Type.Object(
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
    title: Type.Optional(Type.String({ minLength: 1 })),
    currentState: Type.Optional(Type.String({ minLength: 1 })),
    taskSpecification: Type.Optional(Type.String({ minLength: 1 })),
    relevantFiles: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    commandsUsed: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    errorsAndCorrections: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    decisionsMade: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    importantFactsLearned: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    keyResults: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    pendingTasks: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    worklog: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    updateReason: Type.Optional(Type.String({ minLength: 1 })),
    metadata: Type.Optional(Type.Object({}, { additionalProperties: true })),
  },
  { additionalProperties: false },
);

export function normalizeMemorySessionUpdateInput(params: {
  rawParams: MemorySessionUpdateRawParams;
  context?: OpenClawPluginToolContext;
}): SessionMemoryUpdateInput {
  const sessionId = readOptionalString(params.rawParams, "sessionId") ?? params.context?.sessionId;
  const agentId = readOptionalString(params.rawParams, "agentId") ?? params.context?.agentId;
  if (!sessionId) {
    throw new CandidateToolInputError("sessionId required");
  }
  if (!agentId) {
    throw new CandidateToolInputError("agentId required");
  }

  const title = readOptionalString(params.rawParams, "title");
  const currentState = readOptionalString(params.rawParams, "currentState");
  const taskSpecification = readOptionalString(params.rawParams, "taskSpecification");
  const relevantFiles = readOptionalStringArray(params.rawParams, "relevantFiles");
  const commandsUsed = readOptionalStringArray(params.rawParams, "commandsUsed");
  const errorsAndCorrections = readOptionalStringArray(params.rawParams, "errorsAndCorrections");
  const decisionsMade = readOptionalStringArray(params.rawParams, "decisionsMade");
  const importantFactsLearned = readOptionalStringArray(params.rawParams, "importantFactsLearned");
  const keyResults = readOptionalStringArray(params.rawParams, "keyResults");
  const pendingTasks = readOptionalStringArray(params.rawParams, "pendingTasks");
  const worklog = readOptionalStringArray(params.rawParams, "worklog");
  const updateReason = readOptionalString(params.rawParams, "updateReason");
  const metadata = readOptionalObject(params.rawParams, "metadata");

  return {
    sessionId,
    agentId,
    ...(title ? { title } : {}),
    ...(currentState ? { currentState } : {}),
    ...(taskSpecification ? { taskSpecification } : {}),
    ...(relevantFiles ? { relevantFiles } : {}),
    ...(commandsUsed ? { commandsUsed } : {}),
    ...(errorsAndCorrections ? { errorsAndCorrections } : {}),
    ...(decisionsMade ? { decisionsMade } : {}),
    ...(importantFactsLearned ? { importantFactsLearned } : {}),
    ...(keyResults ? { keyResults } : {}),
    ...(pendingTasks ? { pendingTasks } : {}),
    ...(worklog ? { worklog } : {}),
    ...(updateReason ? { updateReason } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export async function updateMemorySessionFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: SessionMemoryUpdateInput;
}): Promise<SessionMemoryUpdateResult> {
  return params.runtime.sessionMemory.update(params.input);
}

export function createMemorySessionUpdateTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_session_update",
    label: "Memory Session Update",
    description:
      "Create or update the bounded structured session-memory state for the active session.",
    parameters: MemorySessionUpdateToolSchema,
    async execute(_toolCallId: string, rawParams: MemorySessionUpdateRawParams) {
      const input = normalizeMemorySessionUpdateInput({
        rawParams,
        context: params.context,
      });
      const result = await updateMemorySessionFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
