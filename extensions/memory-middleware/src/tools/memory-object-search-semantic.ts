import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  MemoryObjectSearchSemanticInput,
  MemoryObjectSearchSemanticResult,
  MemoryObjectSemanticSearchScope,
} from "../db/runtime.js";
import { MEMORY_OBJECT_SEMANTIC_SEARCH_SCOPES } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  CandidateToolInputError,
  asJsonToolResult,
  readOptionalNumber,
  readOptionalString,
  readRequiredNumberArray,
  readRequiredString,
  type ToolRawParams,
} from "./common.js";
import { shapeMemoryObjectSearchSemanticToolResult } from "./memory-object-tool-result-shaping.js";

type MemoryObjectSearchSemanticRawParams = ToolRawParams;

function memoryObjectSemanticSearchScopeSchema() {
  return Type.Unsafe<MemoryObjectSemanticSearchScope>({
    type: "string",
    enum: [...MEMORY_OBJECT_SEMANTIC_SEARCH_SCOPES],
    description:
      "Semantic retrieval scope. Defaults to approved_only. Validated procedures remain hidden unless explicitly requested.",
  });
}

const MemoryObjectSearchSemanticToolSchema = Type.Object(
  {
    embedding: Type.Array(Type.Number(), {
      description:
        "Precomputed query embedding vector. The middleware does not generate embeddings in this prototype.",
      minItems: 1,
    }),
    embeddingModel: Type.String({
      description: "Embedding model id to match inside memory_embeddings.",
      minLength: 1,
    }),
    embeddingVersion: Type.String({
      description: "Embedding version to match inside memory_embeddings.",
      minLength: 1,
    }),
    scope: Type.Optional(memoryObjectSemanticSearchScopeSchema()),
    kind: Type.Optional(
      Type.String({
        description: "Optional bounded object kind filter: project, feedback, or procedure.",
        enum: ["project", "feedback", "procedure"],
      }),
    ),
    projectId: Type.Optional(Type.String({ description: "Optional project id filter." })),
    limit: Type.Optional(
      Type.Number({
        description:
          "Optional maximum number of semantic matches to return. Defaults to 10, maximum 25.",
        minimum: 1,
        maximum: 25,
      }),
    ),
  },
  { additionalProperties: false },
);

function readOptionalSemanticSearchScope(
  rawParams: MemoryObjectSearchSemanticRawParams,
): MemoryObjectSearchSemanticInput["scope"] {
  if (rawParams.scope === undefined) {
    return undefined;
  }
  const scope = readRequiredString(rawParams, "scope");
  if (scope !== "approved_only" && scope !== "include_validated_procedures") {
    throw new CandidateToolInputError(
      "scope must be one of: approved_only, include_validated_procedures",
    );
  }
  return scope;
}

function readOptionalMemoryKind(
  rawParams: MemoryObjectSearchSemanticRawParams,
): MemoryObjectSearchSemanticInput["kind"] {
  const kind = readOptionalString(rawParams, "kind");
  if (!kind) {
    return undefined;
  }
  if (kind !== "project" && kind !== "feedback" && kind !== "procedure") {
    throw new CandidateToolInputError("kind must be one of: project, feedback, procedure");
  }
  return kind;
}

export function normalizeMemoryObjectSearchSemanticInput(
  rawParams: MemoryObjectSearchSemanticRawParams,
): MemoryObjectSearchSemanticInput {
  const scope = readOptionalSemanticSearchScope(rawParams);
  const kind = readOptionalMemoryKind(rawParams);
  const projectId = readOptionalString(rawParams, "projectId");
  const limit = readOptionalNumber(rawParams, "limit");

  return {
    embedding: readRequiredNumberArray(rawParams, "embedding"),
    embeddingModel: readRequiredString(rawParams, "embeddingModel"),
    embeddingVersion: readRequiredString(rawParams, "embeddingVersion"),
    ...(scope ? { scope } : {}),
    ...(kind ? { kind } : {}),
    ...(projectId ? { projectId } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

export async function searchMemoryObjectsSemanticFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryObjectSearchSemanticInput;
}): Promise<MemoryObjectSearchSemanticResult> {
  return params.runtime.memoryObjectQuery.searchSemantic(params.input);
}

export function createMemoryObjectSearchSemanticTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_object_search_semantic",
    label: "Memory Object Search Semantic",
    description:
      "Run bounded semantic retrieval over embedded approved memory objects, with optional validated-procedure inclusion when explicitly requested.",
    parameters: MemoryObjectSearchSemanticToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryObjectSearchSemanticRawParams) {
      const input = normalizeMemoryObjectSearchSemanticInput(rawParams);
      const result = await searchMemoryObjectsSemanticFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(shapeMemoryObjectSearchSemanticToolResult(result));
    },
  };
}
