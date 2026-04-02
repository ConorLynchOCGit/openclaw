import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { ToolResultPersistInput, ToolResultPersistResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  CandidateToolInputError,
  asJsonToolResult,
  readOptionalBoolean,
  readOptionalJsonValue,
  readOptionalNumber,
  readOptionalObject,
  readOptionalString,
  readRequiredString,
  type ToolRawParams,
} from "./common.js";

type MemoryToolResultPersistRawParams = ToolRawParams;

const MemoryToolResultPersistToolSchema = Type.Object(
  {
    sessionId: Type.Optional(
      Type.String({
        description: "Bounded session id. Falls back to trusted tool context when available.",
        minLength: 1,
      }),
    ),
    toolName: Type.String({
      description: "Tool name whose result is being persisted.",
      minLength: 1,
    }),
    contentType: Type.Optional(
      Type.String({
        description: "Optional content type. Defaults to text/plain or application/json.",
        minLength: 1,
      }),
    ),
    payloadText: Type.Optional(
      Type.String({
        description: "Optional raw text payload. Provide either payloadText or payloadJson.",
        minLength: 1,
      }),
    ),
    payloadJson: Type.Optional(
      Type.Unknown({
        description: "Optional JSON payload. Provide either payloadText or payloadJson.",
      }),
    ),
    projectId: Type.Optional(Type.String({ description: "Optional project id for provenance." })),
    agentId: Type.Optional(
      Type.String({
        description: "Optional agent id. Falls back to trusted tool context when available.",
      }),
    ),
    metadata: Type.Optional(
      Type.Object(
        {},
        {
          additionalProperties: true,
          description: "Optional bounded metadata for the stored result.",
        },
      ),
    ),
    persistThresholdBytes: Type.Optional(
      Type.Number({
        description:
          "Optional persistence threshold in bytes. Results larger than this are persisted. Defaults to 4096.",
        minimum: 1,
        maximum: 200000,
      }),
    ),
    previewCharLimit: Type.Optional(
      Type.Number({
        description: "Optional preview character limit. Defaults to 280.",
        minimum: 1,
        maximum: 1000,
      }),
    ),
    forcePersist: Type.Optional(
      Type.Boolean({
        description: "Persist even if the payload is below the configured threshold.",
      }),
    ),
  },
  { additionalProperties: false },
);

export function normalizeMemoryToolResultPersistInput(params: {
  rawParams: MemoryToolResultPersistRawParams;
  context?: OpenClawPluginToolContext;
}): ToolResultPersistInput {
  const sessionId = readOptionalString(params.rawParams, "sessionId") ?? params.context?.sessionId;
  if (!sessionId) {
    throw new CandidateToolInputError("sessionId required");
  }

  const payloadText = readOptionalString(params.rawParams, "payloadText");
  const payloadJson = readOptionalJsonValue(params.rawParams, "payloadJson");
  if ((payloadText ? 1 : 0) + (payloadJson !== undefined ? 1 : 0) !== 1) {
    throw new CandidateToolInputError("exactly one of payloadText or payloadJson must be provided");
  }

  const toolName = readRequiredString(params.rawParams, "toolName");
  const contentType = readOptionalString(params.rawParams, "contentType");
  const projectId = readOptionalString(params.rawParams, "projectId");
  const agentId = readOptionalString(params.rawParams, "agentId") ?? params.context?.agentId;
  const metadata = readOptionalObject(params.rawParams, "metadata");
  const persistThresholdBytes = readOptionalNumber(params.rawParams, "persistThresholdBytes");
  const previewCharLimit = readOptionalNumber(params.rawParams, "previewCharLimit");
  const forcePersist = readOptionalBoolean(params.rawParams, "forcePersist");

  return {
    sessionId,
    toolName,
    ...(contentType ? { contentType } : {}),
    ...(payloadText ? { payloadText } : {}),
    ...(payloadJson !== undefined ? { payloadJson } : {}),
    ...(projectId ? { projectId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(metadata ? { metadata } : {}),
    ...(persistThresholdBytes !== undefined ? { persistThresholdBytes } : {}),
    ...(previewCharLimit !== undefined ? { previewCharLimit } : {}),
    ...(forcePersist !== undefined ? { forcePersist } : {}),
  };
}

export async function persistMemoryToolResultFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: ToolResultPersistInput;
}): Promise<ToolResultPersistResult> {
  return params.runtime.toolResultStore.persist(params.input);
}

export function createMemoryToolResultPersistTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_tool_result_persist",
    label: "Memory Tool Result Persist",
    description:
      "Persist oversized bounded tool results outside the prompt and return a stable preview suitable for prompt-safe substitution.",
    parameters: MemoryToolResultPersistToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryToolResultPersistRawParams) {
      const input = normalizeMemoryToolResultPersistInput({
        rawParams,
        context: params.context,
      });
      const result = await persistMemoryToolResultFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
