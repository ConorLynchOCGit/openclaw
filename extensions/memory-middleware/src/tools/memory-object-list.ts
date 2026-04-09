import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  MemoryObjectListInput,
  MemoryObjectListResult,
  MemoryObjectSearchScope,
} from "../db/runtime.js";
import { MEMORY_OBJECT_SEARCH_SCOPES } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  CandidateToolInputError,
  asJsonToolResult,
  readMemoryObjectSearchScope,
  readOptionalNumber,
  readOptionalString,
  type ToolRawParams,
} from "./common.js";
import { shapeMemoryObjectListToolResult } from "./memory-object-tool-result-shaping.js";

type MemoryObjectListRawParams = ToolRawParams;

function memoryObjectSearchScopeSchema() {
  return Type.Unsafe<MemoryObjectSearchScope>({
    type: "string",
    enum: [...MEMORY_OBJECT_SEARCH_SCOPES],
    description:
      "Retrieval scope. Defaults to approved_only. Candidate rows and validated procedures stay hidden unless explicitly requested.",
  });
}

const MemoryObjectListToolSchema = Type.Object(
  {
    scope: Type.Optional(memoryObjectSearchScopeSchema()),
    kind: Type.Optional(
      Type.String({
        description: "Optional bounded object kind filter: project, feedback, or procedure.",
        enum: ["project", "feedback", "procedure"],
      }),
    ),
    projectId: Type.Optional(Type.String({ description: "Optional project id filter." })),
    agentId: Type.Optional(
      Type.String({ description: "Optional agent id filter for memory objects." }),
    ),
    sessionId: Type.Optional(
      Type.String({ description: "Optional session id filter for memory objects." }),
    ),
    limit: Type.Optional(
      Type.Number({
        description: "Optional maximum number of rows to return. Defaults to 20, maximum 50.",
        minimum: 1,
        maximum: 50,
      }),
    ),
  },
  { additionalProperties: false },
);

function readOptionalMemoryKind(
  rawParams: MemoryObjectListRawParams,
): MemoryObjectListInput["kind"] {
  const kind = readOptionalString(rawParams, "kind");
  if (!kind) {
    return undefined;
  }
  if (kind !== "project" && kind !== "feedback" && kind !== "procedure") {
    throw new CandidateToolInputError("kind must be one of: project, feedback, procedure");
  }
  return kind;
}

export function normalizeMemoryObjectListInput(
  rawParams: MemoryObjectListRawParams,
): MemoryObjectListInput {
  const scope = rawParams.scope === undefined ? undefined : readMemoryObjectSearchScope(rawParams);
  const kind = readOptionalMemoryKind(rawParams);
  const projectId = readOptionalString(rawParams, "projectId");
  const agentId = readOptionalString(rawParams, "agentId");
  const sessionId = readOptionalString(rawParams, "sessionId");
  const limit = readOptionalNumber(rawParams, "limit");

  return {
    ...(scope ? { scope } : {}),
    ...(kind ? { kind } : {}),
    ...(projectId ? { projectId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

export async function listMemoryObjectsFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryObjectListInput;
}): Promise<MemoryObjectListResult> {
  return params.runtime.memoryObjectQuery.list(params.input);
}

export function createMemoryObjectListTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_object_list",
    label: "Memory Object List",
    description:
      "List bounded approved memory objects, with candidate rows and validated procedures available only when explicitly requested.",
    parameters: MemoryObjectListToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryObjectListRawParams) {
      const input = normalizeMemoryObjectListInput(rawParams);
      const result = await listMemoryObjectsFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(shapeMemoryObjectListToolResult(result));
    },
  };
}
