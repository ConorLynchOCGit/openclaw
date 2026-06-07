import { INTAKE_PRIMARY_OUTCOME_KINDS } from "./intake-route-contract.ts";
import { CANONICAL_INTENT_ROUTES } from "./router-schema.ts";
import {
  ROUTER_FRONT_DOOR_EXECUTOR_JOB_TYPES,
  ROUTER_FRONT_DOOR_SMALL_VERB_TOOL_IDS,
  compileRouterSmallVerbToolOutput,
  type RouterFrontDoorSmallVerbToolId,
  type RouterSmallVerbCompileResult,
  type RouterSmallVerbWorkflowManifestContext,
} from "./router-tool-protocol.ts";

export type RouterStagePhase =
  | "route_classification_required"
  | "ambiguity_required"
  | "executor_selection_required"
  | "accepted";

export type RouterStageAction = {
  tool: RouterFrontDoorSmallVerbToolId;
  input: Record<string, unknown>;
};

export type RouterStageProjection = {
  artifactKind: "router_stage_projection";
  schemaVersion: "intent-front-door.router-stage-runner.v1";
  lifecycleOwner: "RouterStageRunner";
  currentPhase: RouterStagePhase;
  allowedToolIds: RouterFrontDoorSmallVerbToolId[];
  canSubmitDecision: boolean;
  compile: RouterSmallVerbCompileResult;
  missingSemanticFields: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type RouterStageToolCallCandidate = {
  canonicalToolId: RouterFrontDoorSmallVerbToolId;
  input: Record<string, unknown>;
};

export type RouterStageRejectedToolCall<T extends RouterStageToolCallCandidate> = {
  toolCall: T;
  reasonCode: string;
};

export type RouterStageBoundedToolCallResult<T extends RouterStageToolCallCandidate> = {
  acceptedToolCalls: T[];
  rejectedToolCalls: RouterStageRejectedToolCall<T>[];
  reasonCodes: string[];
};

const ROUTE_CLASSIFICATION_TOOLS: RouterFrontDoorSmallVerbToolId[] = [
  "router.classify_primary_outcome",
  "router.set_route",
];

const AMBIGUITY_TOOLS: RouterFrontDoorSmallVerbToolId[] = ["router.report_ambiguity"];

const EXECUTOR_SELECTION_TOOLS: RouterFrontDoorSmallVerbToolId[] = [
  "router.select_executor_workflow",
];

const POSITIVE_ROUTE_ATTEMPTS_BEFORE_AMBIGUITY = 2;

function hasTool(actions: readonly RouterStageAction[], tool: RouterFrontDoorSmallVerbToolId) {
  return actions.some((action) => action.tool === tool);
}

function stringInput(action: RouterStageAction | undefined, key: string): string | null {
  const value = action?.input[key] ?? action?.input.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueToolIds(
  values: readonly RouterFrontDoorSmallVerbToolId[],
): RouterFrontDoorSmallVerbToolId[] {
  const allowed = new Set(ROUTER_FRONT_DOOR_SMALL_VERB_TOOL_IDS);
  return Array.from(new Set(values.filter((value) => allowed.has(value))));
}

function stringField(input: Record<string, unknown>, key: string): string {
  const value = input[key] ?? input.value;
  return typeof value === "string" ? value.trim() : "";
}

function validEnum<T extends readonly string[]>(value: string, values: T): boolean {
  return value.length > 0 && values.includes(value);
}

function validString(input: Record<string, unknown>, key: string): boolean {
  return stringField(input, key).length > 0;
}

function invalidToolInputReason(
  toolId: RouterFrontDoorSmallVerbToolId,
  input: Record<string, unknown>,
): string | null {
  switch (toolId) {
    case "router.set_route": {
      return validEnum(stringField(input, "route"), CANONICAL_INTENT_ROUTES)
        ? null
        : "router_stage_invalid_tool_input:router.set_route";
    }
    case "router.classify_primary_outcome": {
      const confidence = input.confidence;
      return validEnum(stringField(input, "outcomeKind"), INTAKE_PRIMARY_OUTCOME_KINDS) &&
        validString(input, "requestedWorkKind") &&
        validString(input, "expectedOutputKind") &&
        typeof confidence === "number" &&
        Number.isFinite(confidence) &&
        confidence >= 0 &&
        confidence <= 1
        ? null
        : "router_stage_invalid_tool_input:router.classify_primary_outcome";
    }
    case "router.select_executor_workflow": {
      const workflowId =
        stringField(input, "workflowId") || stringField(input, "executorWorkflowId");
      const jobType =
        typeof input.jobType === "string"
          ? input.jobType
          : typeof input.executorJobType === "string"
            ? input.executorJobType
            : "";
      return workflowId.length > 0 && validEnum(jobType, ROUTER_FRONT_DOOR_EXECUTOR_JOB_TYPES)
        ? null
        : "router_stage_invalid_tool_input:router.select_executor_workflow";
    }
    case "router.report_ambiguity": {
      return typeof input.ambiguous === "boolean" &&
        Array.isArray(input.missingInputs) &&
        Array.isArray(input.conflictingInstructions)
        ? null
        : "router_stage_invalid_tool_input:router.report_ambiguity";
    }
  }
  return "router_stage_invalid_tool_input:unknown_tool";
}

function semanticFieldState(actions: readonly RouterStageAction[]) {
  const primaryOutcome = hasTool(actions, "router.classify_primary_outcome");
  const executorSelected = hasTool(actions, "router.select_executor_workflow");
  const route = stringInput(
    [...actions].toReversed().find((action) => action.tool === "router.set_route"),
    "route",
  );
  return {
    primaryOutcome,
    executorSelected,
    route,
    routeSelected: Boolean(route),
  };
}

function compiledRouteIsAccepted(
  compile: RouterSmallVerbCompileResult,
  state: ReturnType<typeof semanticFieldState>,
): boolean {
  if (!compile.valid || !compile.output) {
    return false;
  }
  if (compile.output.route === "workflow_execution") {
    return Boolean(
      state.primaryOutcome &&
      state.routeSelected &&
      state.executorSelected &&
      compile.output.workflowId &&
      compile.output.jobType,
    );
  }
  return state.primaryOutcome && state.routeSelected;
}

export class RouterStageRunner {
  boundToolCallsForProjection<T extends RouterStageToolCallCandidate>(input: {
    projection: RouterStageProjection;
    toolCalls: readonly T[];
  }): RouterStageBoundedToolCallResult<T> {
    const allowed = new Set(input.projection.allowedToolIds);
    const latestAcceptedByTool = new Map<RouterFrontDoorSmallVerbToolId, T>();
    const rejectedToolCalls: RouterStageRejectedToolCall<T>[] = [];
    const duplicateToolIds = new Set<RouterFrontDoorSmallVerbToolId>();

    for (const toolCall of input.toolCalls) {
      if (!allowed.has(toolCall.canonicalToolId)) {
        rejectedToolCalls.push({
          toolCall,
          reasonCode: `router_stage_tool_not_allowed_rejected:${toolCall.canonicalToolId}`,
        });
        continue;
      }

      const invalidReason = invalidToolInputReason(toolCall.canonicalToolId, toolCall.input);
      if (invalidReason) {
        rejectedToolCalls.push({ toolCall, reasonCode: invalidReason });
        continue;
      }

      const previous = latestAcceptedByTool.get(toolCall.canonicalToolId);
      if (previous) {
        duplicateToolIds.add(toolCall.canonicalToolId);
        rejectedToolCalls.push({
          toolCall: previous,
          reasonCode: `router_stage_surplus_tool_call_rejected:${toolCall.canonicalToolId}`,
        });
      }
      latestAcceptedByTool.set(toolCall.canonicalToolId, toolCall);
    }

    const acceptedToolCalls = input.projection.allowedToolIds.flatMap((toolId) => {
      const toolCall = latestAcceptedByTool.get(toolId);
      return toolCall ? [toolCall] : [];
    });

    return {
      acceptedToolCalls,
      rejectedToolCalls,
      reasonCodes: [
        "router_stage_runner_owned_tool_acceptance",
        "router_stage_phase_bounded_tool_calls",
        `router_stage_extracted_tool_count:${input.toolCalls.length}`,
        `router_stage_accepted_tool_count:${acceptedToolCalls.length}`,
        `router_stage_rejected_tool_count:${rejectedToolCalls.length}`,
        ...Array.from(duplicateToolIds)
          .slice(0, 12)
          .map((toolId) => `router_stage_duplicate_tool_call_deduped:${toolId}`),
        ...Array.from(new Set(rejectedToolCalls.map((call) => call.reasonCode))).slice(0, 16),
      ],
    };
  }

  project(input: {
    actions: readonly RouterStageAction[];
    workflowContext?: RouterSmallVerbWorkflowManifestContext;
    positiveRouteClassificationAttempts?: number;
  }): RouterStageProjection {
    const compile = compileRouterSmallVerbToolOutput(
      {
        routerActions: input.actions,
        rawPromptStored: false,
        rawResponseStored: false,
      },
      input.workflowContext,
    );
    const state = semanticFieldState(input.actions);
    const missingSemanticFields: string[] = [];
    let currentPhase: RouterStagePhase = "route_classification_required";
    let allowedToolIds: RouterFrontDoorSmallVerbToolId[] = ROUTE_CLASSIFICATION_TOOLS;

    if (compiledRouteIsAccepted(compile, state)) {
      currentPhase = "accepted";
      allowedToolIds = [];
    } else if (
      state.primaryOutcome &&
      state.routeSelected &&
      state.route === "workflow_execution"
    ) {
      currentPhase = "executor_selection_required";
      allowedToolIds = EXECUTOR_SELECTION_TOOLS;
      if (!state.executorSelected) {
        missingSemanticFields.push("executorWorkflow");
      }
    } else {
      if (!state.primaryOutcome) {
        missingSemanticFields.push("primaryOutcome");
      }
      if (!state.routeSelected) {
        missingSemanticFields.push("route");
      }
      if (
        missingSemanticFields.length > 0 &&
        (input.positiveRouteClassificationAttempts ?? 0) >= POSITIVE_ROUTE_ATTEMPTS_BEFORE_AMBIGUITY
      ) {
        currentPhase = "ambiguity_required";
        allowedToolIds = AMBIGUITY_TOOLS;
      }
    }

    return {
      artifactKind: "router_stage_projection",
      schemaVersion: "intent-front-door.router-stage-runner.v1",
      lifecycleOwner: "RouterStageRunner",
      currentPhase,
      allowedToolIds: uniqueToolIds(allowedToolIds),
      canSubmitDecision: false,
      compile,
      missingSemanticFields: Array.from(new Set(missingSemanticFields)),
      reasonCodes: [
        "router_stage_runner_projection",
        `router_stage_phase:${currentPhase}`,
        ...missingSemanticFields.map((field) => `router_stage_missing:${field}`),
        ...compile.reasonCodes.slice(0, 12),
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
  }
}
