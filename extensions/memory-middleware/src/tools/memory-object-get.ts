import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  MemoryObjectGetInput,
  MemoryObjectGetResult,
  MemoryObjectSearchScope,
} from "../db/runtime.js";
import { MEMORY_OBJECT_SEARCH_SCOPES } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  asJsonToolResult,
  readMemoryObjectSearchScope,
  readRequiredString,
  type ToolRawParams,
} from "./common.js";
import { shapeMemoryObjectGetToolResult } from "./memory-object-tool-result-shaping.js";

type MemoryObjectGetRawParams = ToolRawParams;

function memoryObjectSearchScopeSchema() {
  return Type.Unsafe<MemoryObjectSearchScope>({
    type: "string",
    enum: [...MEMORY_OBJECT_SEARCH_SCOPES],
    description:
      "Retrieval scope. Defaults to approved_only. Candidate rows and validated procedures stay hidden unless explicitly requested.",
  });
}

const MemoryObjectGetToolSchema = Type.Object(
  {
    objectId: Type.String({
      description: "Approved memory object id or validated procedure id to inspect.",
      minLength: 1,
    }),
    scope: Type.Optional(memoryObjectSearchScopeSchema()),
  },
  { additionalProperties: false },
);

export function normalizeMemoryObjectGetInput(
  rawParams: MemoryObjectGetRawParams,
): MemoryObjectGetInput {
  const scope = rawParams.scope === undefined ? undefined : readMemoryObjectSearchScope(rawParams);

  return {
    objectId: readRequiredString(rawParams, "objectId"),
    ...(scope ? { scope } : {}),
  };
}

export async function getMemoryObjectFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryObjectGetInput;
}): Promise<MemoryObjectGetResult> {
  return params.runtime.memoryObjectQuery.get(params.input);
}

export function createMemoryObjectGetTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_object_get",
    label: "Memory Object Get",
    description:
      "Inspect one bounded approved memory object, optionally including candidate rows or validated procedures when explicitly requested.",
    parameters: MemoryObjectGetToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryObjectGetRawParams) {
      const input = normalizeMemoryObjectGetInput(rawParams);
      const result = await getMemoryObjectFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(shapeMemoryObjectGetToolResult(result));
    },
  };
}
