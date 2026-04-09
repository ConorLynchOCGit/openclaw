import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  MemoryObjectSearchBasicInput,
  MemoryObjectSearchBasicResult,
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
  readRequiredString,
  type ToolRawParams,
} from "./common.js";
import { shapeMemoryObjectSearchBasicToolResult } from "./memory-object-tool-result-shaping.js";

type MemoryObjectSearchBasicRawParams = ToolRawParams;

function memoryObjectSearchScopeSchema() {
  return Type.Unsafe<MemoryObjectSearchScope>({
    type: "string",
    enum: [...MEMORY_OBJECT_SEARCH_SCOPES],
    description:
      "Retrieval scope. Defaults to approved_only. Candidate rows and validated procedures stay hidden unless explicitly requested.",
  });
}

const MemoryObjectSearchBasicToolSchema = Type.Object(
  {
    query: Type.String({
      description:
        "Basic text to search for in bounded memory object content or validated procedure text.",
      minLength: 1,
    }),
    scope: Type.Optional(memoryObjectSearchScopeSchema()),
    kind: Type.Optional(
      Type.String({
        description: "Optional bounded object kind filter: project, feedback, or procedure.",
        enum: ["project", "feedback", "procedure"],
      }),
    ),
    projectId: Type.Optional(Type.String({ description: "Optional project id filter." })),
    limit: Type.Optional(
      Type.Number({
        description: "Optional maximum number of rows to return. Defaults to 10, maximum 25.",
        minimum: 1,
        maximum: 25,
      }),
    ),
  },
  { additionalProperties: false },
);

function readOptionalMemoryKind(
  rawParams: MemoryObjectSearchBasicRawParams,
): MemoryObjectSearchBasicInput["kind"] {
  const kind = readOptionalString(rawParams, "kind");
  if (!kind) {
    return undefined;
  }
  if (kind !== "project" && kind !== "feedback" && kind !== "procedure") {
    throw new CandidateToolInputError("kind must be one of: project, feedback, procedure");
  }
  return kind;
}

export function normalizeMemoryObjectSearchBasicInput(
  rawParams: MemoryObjectSearchBasicRawParams,
): MemoryObjectSearchBasicInput {
  const scope = rawParams.scope === undefined ? undefined : readMemoryObjectSearchScope(rawParams);
  const kind = readOptionalMemoryKind(rawParams);
  const projectId = readOptionalString(rawParams, "projectId");
  const limit = readOptionalNumber(rawParams, "limit");

  return {
    query: readRequiredString(rawParams, "query"),
    ...(scope ? { scope } : {}),
    ...(kind ? { kind } : {}),
    ...(projectId ? { projectId } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

export async function searchMemoryObjectsBasicFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryObjectSearchBasicInput;
}): Promise<MemoryObjectSearchBasicResult> {
  return params.runtime.memoryObjectQuery.searchBasic(params.input);
}

export function createMemoryObjectSearchBasicTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_object_search_basic",
    label: "Memory Object Search Basic",
    description:
      "Run bounded exact/basic text search over approved memory objects, with candidate rows and validated procedures available only when explicitly requested.",
    parameters: MemoryObjectSearchBasicToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryObjectSearchBasicRawParams) {
      const input = normalizeMemoryObjectSearchBasicInput(rawParams);
      const result = await searchMemoryObjectsBasicFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(shapeMemoryObjectSearchBasicToolResult(result));
    },
  };
}
