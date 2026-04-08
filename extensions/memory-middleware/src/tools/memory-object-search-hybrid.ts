import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { MemoryObjectSearchHybridInput, MemoryObjectSearchScope } from "../db/runtime.js";
import { MEMORY_OBJECT_SEARCH_SCOPES } from "../db/runtime.js";
import {
  applyHybridRetrievalControlPlane,
  buildMemoryObjectRetrievalControlDecision,
} from "../retrieval-control-plane.js";
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

type MemoryObjectSearchHybridRawParams = ToolRawParams;

function memoryObjectSearchScopeSchema() {
  return Type.Unsafe<MemoryObjectSearchScope>({
    type: "string",
    enum: [...MEMORY_OBJECT_SEARCH_SCOPES],
    description:
      "Retrieval scope. Defaults to approved_only. Candidate rows and validated procedures stay hidden unless explicitly requested.",
  });
}

const MemoryObjectSearchHybridToolSchema = Type.Object(
  {
    query: Type.String({
      description:
        "Ranked text query for approved memory objects, with optional validated procedure inclusion when explicitly requested.",
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
        description:
          "Optional maximum number of ranked rows to return. Defaults to 10, maximum 25.",
        minimum: 1,
        maximum: 25,
      }),
    ),
  },
  { additionalProperties: false },
);

function readOptionalMemoryKind(
  rawParams: MemoryObjectSearchHybridRawParams,
): MemoryObjectSearchHybridInput["kind"] {
  const kind = readOptionalString(rawParams, "kind");
  if (!kind) {
    return undefined;
  }
  if (kind !== "project" && kind !== "feedback" && kind !== "procedure") {
    throw new CandidateToolInputError("kind must be one of: project, feedback, procedure");
  }
  return kind;
}

export function normalizeMemoryObjectSearchHybridInput(
  rawParams: MemoryObjectSearchHybridRawParams,
): MemoryObjectSearchHybridInput {
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

export async function searchMemoryObjectsHybridFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryObjectSearchHybridInput;
  context?: OpenClawPluginToolContext;
}) {
  const decision = buildMemoryObjectRetrievalControlDecision({
    input: params.input,
  });
  const result = await params.runtime.memoryObjectQuery.searchHybrid(params.input);
  return applyHybridRetrievalControlPlane({
    decision,
    runtime: params.runtime,
    input: params.input,
    hybridResult: result,
    cfg: params.context?.runtimeConfig ?? params.context?.config,
    agentId: params.context?.agentId,
    sessionKey: params.context?.sessionKey,
  });
}

export function createMemoryObjectSearchHybridTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_object_search_hybrid",
    label: "Memory Object Search Hybrid",
    description:
      "Run bounded ranked text search over approved memory objects, with explicitly requested candidate and validated-procedure scope support. Hybrid stays the default; nearby recurring-procedure asks, approved environment-constraint guidance, the supported approved workflow tool gotchas including git stash safety, and the supported approved API workarounds may use family-scoped semantic fallback.",
    parameters: MemoryObjectSearchHybridToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryObjectSearchHybridRawParams) {
      const input = normalizeMemoryObjectSearchHybridInput(rawParams);
      const result = await searchMemoryObjectsHybridFromTool({
        runtime: params.runtime,
        input,
        context: params.context,
      });
      return asJsonToolResult(result);
    },
  };
}
