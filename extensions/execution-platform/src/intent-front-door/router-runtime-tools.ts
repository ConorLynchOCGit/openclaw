import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  RuntimeToolKernel,
  RuntimeToolKernelInvokeResult,
} from "../runtime-tool-call/runtime-tool-kernel.ts";
import {
  buildRuntimeToolDefinition,
  type RuntimeToolRegistry,
} from "../runtime-tool-call/runtime-tool-registry.ts";
import type {
  RuntimeToolAuthorityClass,
  RuntimeToolExecutor,
  RuntimeToolFamily,
  RuntimeToolStatus,
} from "../runtime-tool-call/runtime-tool-types.ts";

export const ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS = [
  "router.classify_owner_turn_intent",
  "router.extract_constraints",
  "router.select_executor_workflow",
  "router.identify_subject_refs",
  "router.compile_execution_request",
  "router.validate_route_contract",
] as const;

export type RouterFrontDoorRuntimeToolId = (typeof ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS)[number];

export type RouterFrontDoorToolInvocationSummary = {
  toolId: RouterFrontDoorRuntimeToolId;
  invocationRef: string;
  status: RuntimeToolStatus;
  outputRef: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

const ROUTER_TOOL_CONFIG: Record<
  RouterFrontDoorRuntimeToolId,
  { family: RuntimeToolFamily; authorityClass: RuntimeToolAuthorityClass; schemaRef: string }
> = {
  "router.classify_owner_turn_intent": {
    family: "router.front_door",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://router/classify-owner-turn-intent/v1",
  },
  "router.extract_constraints": {
    family: "router.front_door",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://router/extract-constraints/v1",
  },
  "router.select_executor_workflow": {
    family: "router.front_door",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://router/select-executor-workflow/v1",
  },
  "router.identify_subject_refs": {
    family: "router.front_door",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://router/identify-subject-refs/v1",
  },
  "router.compile_execution_request": {
    family: "router.front_door",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://router/compile-execution-request/v1",
  },
  "router.validate_route_contract": {
    family: "router.front_door",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://router/validate-route-contract/v1",
  },
};

function boundedSummary(value: string): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, 1_200);
}

function jsonObject(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function defaultRouterFrontDoorToolExecutor(
  toolId: RouterFrontDoorRuntimeToolId,
): RuntimeToolExecutor {
  return {
    async execute(input) {
      const metadata = jsonObject(input.metadata);
      return {
        status: "succeeded",
        outputRef: `runtime-tool-output://${input.invocationId ?? toolId}`,
        outputHash: `router-front-door-tool:${toolId}:${input.idempotencyKey}`,
        outputSummary: boundedSummary(`${toolId} recorded bounded front-door protocol evidence.`),
        reasonCodes: [`${toolId.replaceAll(".", "_")}_recorded`],
        metadata: {
          ...metadata,
          routerFrontDoorToolRecorded: true,
          rawPromptStored: false,
          rawResponseStored: false,
        } as JsonValue,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      };
    },
  };
}

export function buildRouterFrontDoorRuntimeToolDefinition(toolId: RouterFrontDoorRuntimeToolId) {
  const config = ROUTER_TOOL_CONFIG[toolId];
  return buildRuntimeToolDefinition({
    toolId,
    toolVersion: "v1",
    toolFamily: config.family,
    executorKey: `intent-front-door.${toolId}`,
    schemaRef: config.schemaRef,
    authorityClass: config.authorityClass,
    defaultTimeoutMs: 30_000,
    enabled: true,
  });
}

export function registerRouterFrontDoorRuntimeTools(input: {
  registry: RuntimeToolRegistry;
}): void {
  for (const toolId of ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS) {
    input.registry.register(
      buildRouterFrontDoorRuntimeToolDefinition(toolId),
      defaultRouterFrontDoorToolExecutor(toolId),
    );
  }
}

export async function invokeRouterFrontDoorRuntimeTool(input: {
  kernel: RuntimeToolKernel;
  toolId: RouterFrontDoorRuntimeToolId;
  runtimeJobId?: string | null;
  requestId: string;
  roleRef?: string | null;
  modelRef?: string | null;
  providerRef?: string | null;
  idempotencyKey: string;
  inputRef?: string | null;
  inputHash?: string | null;
  inputSummary: string;
  metadata?: JsonValue;
}): Promise<RouterFrontDoorToolInvocationSummary> {
  const result: RuntimeToolKernelInvokeResult = await input.kernel.invoke({
    toolId: input.toolId,
    runtimeJobId: input.runtimeJobId ?? null,
    graphId: null,
    nodeId: null,
    roleRef: input.roleRef ?? "intent-front-door.router",
    modelRef: input.modelRef ?? null,
    providerRef: input.providerRef ?? null,
    idempotencyScope: `router-front-door:${input.requestId}`,
    idempotencyKey: input.idempotencyKey,
    inputRef: input.inputRef ?? null,
    inputHash: input.inputHash ?? null,
    inputSummary: boundedSummary(input.inputSummary),
    metadata: {
      ...jsonObject(input.metadata),
      requestId: input.requestId,
      frontDoorScopeRef: `router-front-door:${input.requestId}`,
      rawPromptStored: false,
      rawResponseStored: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    runtimeLifecycleMutated: false,
  });
  return {
    toolId: input.toolId,
    invocationRef: result.invocationRef,
    status: result.invocation.status,
    outputRef: result.invocation.outputRef,
    reasonCodes: result.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}
