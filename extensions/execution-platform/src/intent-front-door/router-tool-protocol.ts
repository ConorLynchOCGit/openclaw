import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolStatus } from "../runtime-tool-call/runtime-tool-types.ts";
import { INTAKE_PRIMARY_OUTCOME_KINDS } from "./intake-route-contract.ts";
import type { IntentValidationDecision } from "./intent-validator.ts";
import type { RouterFrontDoorToolInvocationSummary } from "./router-runtime-tools.ts";
import {
  ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS,
  type RouterFrontDoorRuntimeToolId,
} from "./router-runtime-tools.ts";
import {
  CANONICAL_INTENT_ROUTES,
  createBaseCanonicalRouterOutput,
  type CanonicalIntentRoute,
  type CanonicalResponseMode,
  type CanonicalRouterOutput,
} from "./router-schema.ts";

export const ROUTER_FRONT_DOOR_TOOL_PROTOCOL_VERSION = "intent-front-door.router-tool-protocol.v1";

export const ROUTER_FRONT_DOOR_SMALL_VERB_TOOL_IDS = [
  "router.set_route",
  "router.classify_primary_outcome",
  "router.select_executor_workflow",
  "router.report_ambiguity",
] as const;

export const ROUTER_FRONT_DOOR_EXECUTOR_JOB_TYPES = [
  "executor.agent_team",
  "executor.single_agent",
  "executor.workflow",
] as const;

export type RouterFrontDoorSmallVerbToolId = (typeof ROUTER_FRONT_DOOR_SMALL_VERB_TOOL_IDS)[number];

const stringSchema = (maxLength: number, minLength = 1) =>
  ({ type: "string", minLength, maxLength }) as const;

const nullableStringSchema = (maxLength: number) =>
  ({ anyOf: [stringSchema(maxLength), { type: "null" }] }) as const;

const booleanSchema = { type: "boolean" } as const;
const confidenceSchema = { type: "number", minimum: 0, maximum: 1 } as const;

const strictToolSchema = (
  tool: RouterFrontDoorSmallVerbToolId,
  input: {
    required: readonly string[];
    properties: Record<string, unknown>;
  },
) =>
  ({
    type: "object",
    additionalProperties: false,
    required: ["tool", "input"],
    properties: {
      tool: { type: "string", enum: [tool] },
      input: {
        type: "object",
        additionalProperties: false,
        required: input.required,
        properties: input.properties,
      },
    },
  }) as const;

export const ROUTER_FRONT_DOOR_SMALL_VERB_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["routerActions", "rawPromptStored", "rawResponseStored"],
  properties: {
    routerActions: {
      type: "array",
      minItems: 1,
      maxItems: 80,
      items: {
        anyOf: [
          strictToolSchema("router.set_route", {
            required: ["route"],
            properties: { route: { type: "string", enum: CANONICAL_INTENT_ROUTES } },
          }),
          strictToolSchema("router.classify_primary_outcome", {
            required: ["outcomeKind", "requestedWorkKind", "expectedOutputKind", "confidence"],
            properties: {
              outcomeKind: { type: "string", enum: INTAKE_PRIMARY_OUTCOME_KINDS },
              requestedWorkKind: stringSchema(160),
              expectedOutputKind: stringSchema(160),
              confidence: confidenceSchema,
            },
          }),
          strictToolSchema("router.select_executor_workflow", {
            required: ["workflowId", "jobType"],
            properties: {
              workflowId: stringSchema(120, 3),
              jobType: { type: "string", enum: ROUTER_FRONT_DOOR_EXECUTOR_JOB_TYPES },
            },
          }),
          strictToolSchema("router.report_ambiguity", {
            required: [
              "ambiguous",
              "missingInputs",
              "conflictingInstructions",
              "clarificationQuestion",
            ],
            properties: {
              ambiguous: booleanSchema,
              missingInputs: {
                type: "array",
                maxItems: 20,
                items: stringSchema(120),
              },
              conflictingInstructions: {
                type: "array",
                maxItems: 20,
                items: stringSchema(180),
              },
              clarificationQuestion: nullableStringSchema(500),
            },
          }),
        ],
      },
    },
    rawPromptStored: { type: "boolean", const: false },
    rawResponseStored: { type: "boolean", const: false },
  },
} as const;

type RouterSmallVerbCall = {
  tool: RouterFrontDoorSmallVerbToolId;
  input: Record<string, unknown>;
};

export type RouterSmallVerbCompileResult = {
  valid: boolean;
  output: CanonicalRouterOutput | null;
  reasonCodes: string[];
  schemaIssues: Array<{ path: string; message: string; code: string }>;
};

export type RouterFrontDoorNativeToolDefinition = {
  name: string;
  canonicalToolId: RouterFrontDoorSmallVerbToolId;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type RouterSmallVerbWorkflowManifestContext = {
  workflowSummaries?: unknown[];
};

type RouterWorkflowManifestSummary = {
  workflowId: string;
  jobType: string;
  executable: boolean;
  status: string;
  capabilitySummary: {
    executableCapabilities: string[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function routerFrontDoorProviderToolName(toolId: RouterFrontDoorSmallVerbToolId): string {
  return toolId.replace(/[^a-zA-Z0-9_-]/gu, "_");
}

export function routerFrontDoorCanonicalToolIdFromProviderName(
  providerToolName: string,
): RouterFrontDoorSmallVerbToolId | null {
  for (const toolId of ROUTER_FRONT_DOOR_SMALL_VERB_TOOL_IDS) {
    if (routerFrontDoorProviderToolName(toolId) === providerToolName) {
      return toolId;
    }
  }
  return null;
}

function routerFrontDoorToolInputSchema(
  toolId: RouterFrontDoorSmallVerbToolId,
): Record<string, unknown> {
  const actionSchemas = (ROUTER_FRONT_DOOR_SMALL_VERB_OUTPUT_JSON_SCHEMA.properties.routerActions
    .items.anyOf ?? []) as readonly Record<string, unknown>[];
  for (const actionSchema of actionSchemas) {
    const properties = isRecord(actionSchema.properties) ? actionSchema.properties : {};
    const toolProperty = isRecord(properties.tool) ? properties.tool : {};
    const enumValues = Array.isArray(toolProperty.enum) ? toolProperty.enum : [];
    if (enumValues[0] !== toolId) {
      continue;
    }
    const inputProperty = isRecord(properties.input) ? properties.input : {};
    return inputProperty;
  }
  return {
    type: "object",
    additionalProperties: false,
    properties: {},
    required: [],
  };
}

export function routerFrontDoorSmallVerbNativeToolDefinitions(
  allowedToolIds: readonly RouterFrontDoorSmallVerbToolId[] = ROUTER_FRONT_DOOR_SMALL_VERB_TOOL_IDS,
): RouterFrontDoorNativeToolDefinition[] {
  const descriptionByTool: Partial<Record<RouterFrontDoorSmallVerbToolId, string>> = {
    "router.set_route": "Set the canonical route family for the owner request.",
    "router.classify_primary_outcome":
      "Classify the user's primary requested outcome without authoring RequirementMap or authority details.",
    "router.select_executor_workflow":
      "Select the executor workflow and job type that can perform the primary requested work.",
    "router.report_ambiguity":
      "Report that the route class or executor cannot be selected without owner clarification.",
  };
  return allowedToolIds.map((toolId) => ({
    name: routerFrontDoorProviderToolName(toolId),
    canonicalToolId: toolId,
    description:
      descriptionByTool[toolId] ??
      `OpenClaw intent front-door small verb ${toolId}. Runtime compiles this bounded semantic routing fact into CanonicalRouterOutput.`,
    inputSchema: routerFrontDoorToolInputSchema(toolId),
  }));
}

function boundedText(value: unknown, maxChars: number): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, maxChars) : "";
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

function primaryValue(input: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) {
      return input[key];
    }
  }
  return input.value;
}

function numberInRange(value: unknown, fallback: number, min = 0, max = 1): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function responseModeForRoute(route: CanonicalIntentRoute): CanonicalResponseMode {
  switch (route) {
    case "workflow_execution":
      return "create_runtime_job";
    case "plan_only":
    case "multi_workflow_plan":
      return "create_plan_only";
    case "work_queue_control":
      return "apply_control";
    case "clarification_required":
      return "ask_clarification";
    case "blocked":
    case "needs_review":
      return "block";
    case "chat_response":
    case "status_response":
    case "research_only":
    default:
      return "answer_in_chat";
  }
}

function executeNowForRoute(route: CanonicalIntentRoute): boolean {
  return route === "workflow_execution" || route === "work_queue_control";
}

function workflowSummaryFor(
  context: RouterSmallVerbWorkflowManifestContext | undefined,
  workflowId: string | null | undefined,
) {
  if (!workflowId) {
    return null;
  }
  for (const summary of context?.workflowSummaries ?? []) {
    if (!isRecord(summary)) {
      continue;
    }
    const capabilitySummary = summary.capabilitySummary;
    if (!isRecord(capabilitySummary) || !Array.isArray(capabilitySummary.executableCapabilities)) {
      continue;
    }
    if (summary.workflowId !== workflowId || typeof summary.jobType !== "string") {
      continue;
    }
    return {
      workflowId,
      jobType: summary.jobType,
      executable: summary.executable === true,
      status: typeof summary.status === "string" ? summary.status : "unknown",
      capabilitySummary: {
        executableCapabilities: capabilitySummary.executableCapabilities.filter(
          (capability): capability is string => typeof capability === "string",
        ),
      },
    } satisfies RouterWorkflowManifestSummary;
  }
  return null;
}

function primaryOutcomeKindsFromDraft(draft: Partial<CanonicalRouterOutput>): string[] {
  const prefix = "router_primary_outcome:";
  return (draft.reasonCodes ?? [])
    .filter((reason) => reason.startsWith(prefix))
    .map((reason) => reason.slice(prefix.length))
    .filter(Boolean);
}

function requiredExecutorCapabilitiesForPrimaryOutcome(outcomeKind: string): string[] {
  switch (outcomeKind) {
    case "implement_existing_system":
    case "harden_existing_system":
      return ["code_edit"];
    case "prove_existing_system":
      return ["test"];
    case "review_existing_system":
      return ["review"];
    case "produce_plan":
      return ["plan"];
    default:
      return [];
  }
}

function applyWorkflowManifestContext(
  draft: Partial<CanonicalRouterOutput>,
  context: RouterSmallVerbWorkflowManifestContext | undefined,
): { reasonCodes: string[]; schemaIssues: Array<{ path: string; message: string; code: string }> } {
  const reasonCodes: string[] = [];
  const schemaIssues: Array<{ path: string; message: string; code: string }> = [];
  const requiresWorkflowExecutor =
    draft.route === "workflow_execution" || draft.responseMode === "create_runtime_job";
  if (!requiresWorkflowExecutor) {
    return { reasonCodes, schemaIssues };
  }

  const executorWorkflowId = draft.executorWorkflowId ?? draft.workflowId ?? null;
  const workflow = workflowSummaryFor(context, executorWorkflowId);
  if (!executorWorkflowId) {
    schemaIssues.push({
      path: "executorWorkflowId",
      message: "workflow_execution requires a model-authored executor workflow",
      code: "router_executor_workflow_missing",
    });
    reasonCodes.push("router_executor_workflow_missing");
    return { reasonCodes, schemaIssues };
  }
  if (context?.workflowSummaries && !workflow) {
    schemaIssues.push({
      path: "executorWorkflowId",
      message: "selected executor workflow is not in the workflow manifest candidate set",
      code: "router_executor_workflow_not_in_manifest",
    });
    reasonCodes.push("router_executor_workflow_not_in_manifest");
    return { reasonCodes, schemaIssues };
  }
  if (!workflow) {
    return { reasonCodes, schemaIssues };
  }

  if (!workflow.executable) {
    schemaIssues.push({
      path: "executorWorkflowId",
      message: `selected workflow is not executable: ${workflow.status}`,
      code: "router_executor_workflow_not_executable",
    });
    reasonCodes.push(`router_executor_workflow_not_executable:${workflow.status}`);
  }

  if (draft.jobType && draft.jobType !== workflow.jobType) {
    schemaIssues.push({
      path: "jobType",
      message: "selected executor jobType does not match the workflow manifest",
      code: "router_executor_job_type_mismatch",
    });
    reasonCodes.push("router_executor_job_type_mismatch");
  }
  if (!draft.jobType) {
    draft.jobType = workflow.jobType;
    reasonCodes.push("router_executor_job_type_filled_from_workflow_manifest");
  }

  const executableCapabilities = new Set(workflow.capabilitySummary.executableCapabilities);
  for (const outcomeKind of primaryOutcomeKindsFromDraft(draft)) {
    for (const capability of requiredExecutorCapabilitiesForPrimaryOutcome(outcomeKind)) {
      if (executableCapabilities.has(capability)) {
        continue;
      }
      schemaIssues.push({
        path: "executorWorkflowId",
        message: `selected executor cannot perform primary outcome ${outcomeKind}; missing ${capability}`,
        code: "router_executor_primary_outcome_capability_mismatch",
      });
      reasonCodes.push(
        `router_executor_primary_outcome_capability_mismatch:${outcomeKind}:${capability}`,
      );
    }
  }

  return { reasonCodes, schemaIssues };
}

function readCalls(value: unknown): RouterSmallVerbCall[] | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawActions =
    value.routerActions ?? value.routerToolCalls ?? value.toolCalls ?? value.actions ?? null;
  if (!Array.isArray(rawActions)) {
    return null;
  }
  const calls: RouterSmallVerbCall[] = [];
  for (const rawAction of rawActions) {
    if (!isRecord(rawAction)) {
      continue;
    }
    const tool = rawAction.tool ?? rawAction.toolId ?? rawAction.name;
    if (!enumValue(tool, ROUTER_FRONT_DOOR_SMALL_VERB_TOOL_IDS)) {
      continue;
    }
    const rawInput = rawAction.input ?? rawAction.arguments ?? rawAction.args ?? {};
    calls.push({
      tool: tool as RouterFrontDoorSmallVerbToolId,
      input: isRecord(rawInput) ? rawInput : {},
    });
  }
  return calls.length > 0 ? calls : null;
}

export function compileRouterSmallVerbToolOutput(
  value: unknown,
  context?: RouterSmallVerbWorkflowManifestContext,
): RouterSmallVerbCompileResult {
  const calls = readCalls(value);
  if (!calls) {
    return {
      valid: false,
      output: null,
      reasonCodes: ["router_small_verb_tool_calls_missing"],
      schemaIssues: [{ path: "routerActions", message: "routerActions required", code: "missing" }],
    };
  }

  const draft: Partial<CanonicalRouterOutput> = {
    route: "chat_response",
    responseMode: "answer_in_chat",
    executeNow: false,
    executorWorkflowId: null,
    workflowId: null,
    jobType: null,
    subjectWorkflowIds: [],
    targetSubjectRefs: [],
    targetRefs: [],
    requestedCapabilities: [],
    constraints: [],
    mentionedActions: [],
    requestedActions: [],
    negatedActions: [],
    conditionalActions: [],
    selectedExecutionReason: "",
    targetSubjectReason: "",
    confidence: 0.5,
    objectiveSummary: "",
    requestedAuthority: null,
    requiresApproval: false,
    approvalKind: null,
    riskClass: "low",
    sideEffectClass: "none",
    activeJobRefs: [],
    childWorkflowRequests: [],
    multiIntentPlan: [],
    ambiguity: {
      ambiguous: false,
      missingInputs: [],
      conflictingInstructions: [],
      clarificationQuestion: null,
    },
    reasonCodes: [],
    rawPromptStored: false,
    rawResponseStored: false,
  };
  const reasonCodes = ["router_small_verb_tool_output_compiled"];

  for (const call of calls) {
    switch (call.tool) {
      case "router.set_route": {
        const route = enumValue(primaryValue(call.input, "route"), CANONICAL_INTENT_ROUTES);
        if (route) {
          draft.route = route as CanonicalIntentRoute;
        }
        break;
      }
      case "router.classify_primary_outcome": {
        const outcomeKind = enumValue(
          primaryValue(call.input, "outcomeKind"),
          INTAKE_PRIMARY_OUTCOME_KINDS,
        );
        if (outcomeKind) {
          draft.reasonCodes!.push(`router_primary_outcome:${outcomeKind}`);
        }
        draft.confidence = numberInRange(call.input.confidence, draft.confidence ?? 0.5);
        reasonCodes.push("router_primary_outcome_classified");
        break;
      }
      case "router.select_executor_workflow": {
        const workflowId = boundedText(
          primaryValue(call.input, "workflowId", "executorWorkflowId"),
          120,
        );
        if (workflowId) {
          draft.executorWorkflowId = workflowId;
          draft.workflowId = workflowId;
        }
        const jobType = enumValue(
          call.input.jobType ?? call.input.executorJobType,
          ROUTER_FRONT_DOOR_EXECUTOR_JOB_TYPES,
        );
        if (jobType) {
          draft.jobType = jobType;
        }
        break;
      }
      case "router.report_ambiguity":
        draft.ambiguity = {
          ambiguous: call.input.ambiguous !== false,
          missingInputs: Array.isArray(call.input.missingInputs)
            ? call.input.missingInputs
                .map((entry) => boundedText(entry, 120))
                .filter(Boolean)
                .slice(0, 20)
            : [],
          conflictingInstructions: Array.isArray(call.input.conflictingInstructions)
            ? call.input.conflictingInstructions
                .map((entry) => boundedText(entry, 180))
                .filter(Boolean)
                .slice(0, 20)
            : [],
          clarificationQuestion: boundedText(call.input.clarificationQuestion, 500) || null,
        };
        break;
    }
  }

  if (draft.route) {
    draft.responseMode = responseModeForRoute(draft.route);
    draft.executeNow = executeNowForRoute(draft.route);
  }
  draft.targetSubjectRefs =
    draft.targetSubjectRefs!.length > 0 ? draft.targetSubjectRefs : draft.targetRefs;
  draft.reasonCodes = Array.from(
    new Set(["router_small_verb_decision_submitted", ...draft.reasonCodes!]),
  ).slice(0, 30);
  const manifestResult = applyWorkflowManifestContext(draft, context);
  reasonCodes.push(...manifestResult.reasonCodes);
  draft.reasonCodes = Array.from(
    new Set([
      ...draft.reasonCodes,
      ...manifestResult.reasonCodes,
      ...(manifestResult.schemaIssues.length > 0
        ? ["router_small_verb_workflow_manifest_validation_deferred"]
        : []),
    ]),
  ).slice(0, 30);

  if (manifestResult.schemaIssues.length > 0) {
    return {
      valid: false,
      output: null,
      reasonCodes,
      schemaIssues: manifestResult.schemaIssues,
    };
  }

  try {
    return {
      valid: true,
      output: createBaseCanonicalRouterOutput(draft as CanonicalRouterOutput),
      reasonCodes,
      schemaIssues: [],
    };
  } catch (error) {
    return {
      valid: false,
      output: null,
      reasonCodes: [...reasonCodes, "router_small_verb_canonical_compile_failed"],
      schemaIssues: [
        {
          path: "$",
          message: error instanceof Error ? error.message : "canonical router compile failed",
          code: "compile_failed",
        },
      ],
    };
  }
}

export type RouterFrontDoorToolPhaseStatus = {
  toolId: RouterFrontDoorRuntimeToolId;
  status: RuntimeToolStatus | "not_invoked";
  summary: string;
  invocationRef: string | null;
  reasonCodes: string[];
};

export type RouterFrontDoorToolProtocolResult = {
  artifactKind: "router_front_door_tool_protocol_result";
  protocolVersion: typeof ROUTER_FRONT_DOOR_TOOL_PROTOCOL_VERSION;
  requestId: string;
  promptHash: string;
  status: "succeeded" | "needs_review" | "failed";
  phaseStatuses: RouterFrontDoorToolPhaseStatus[];
  toolInvocationRefs: string[];
  executorWorkflowId: string | null;
  subjectWorkflowIds: string[];
  targetSubjectRefs: Array<{ targetKind: string; targetRef: string; confidence: number | null }>;
  requestedCapabilities: string[];
  constraintSummaries: Array<{ constraintKind: string; objectSummary: string; confidence: number }>;
  requirementMapHandoffRef: string;
  validationOutcome: IntentValidationDecision["outcome"] | null;
  validationReasonCodes: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
  authorityGranted: false;
};

function phaseSummary(toolId: RouterFrontDoorRuntimeToolId, output: CanonicalRouterOutput): string {
  switch (toolId) {
    case "router.route_classification":
      return `Classified route ${output.route} with response mode ${output.responseMode}.`;
    case "router.executor_selection":
      return `Selected executor workflow ${output.executorWorkflowId ?? output.workflowId ?? "none"}.`;
  }
  return "Recorded bounded router front-door protocol evidence.";
}

export function buildRouterFrontDoorToolProtocolResult(input: {
  requestId: string;
  promptHash: string;
  routerOutput: CanonicalRouterOutput;
  validation?: IntentValidationDecision | null;
  toolInvocations?: RouterFrontDoorToolInvocationSummary[];
}): RouterFrontDoorToolProtocolResult {
  const invocationByTool = new Map(
    (input.toolInvocations ?? []).map((invocation) => [invocation.toolId, invocation]),
  );
  const phaseStatuses: RouterFrontDoorToolPhaseStatus[] = ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS.map(
    (toolId) => {
      const invocation = invocationByTool.get(toolId);
      return {
        toolId,
        status: invocation?.status ?? ("not_invoked" as const),
        summary: phaseSummary(toolId, input.routerOutput),
        invocationRef: invocation?.invocationRef ?? null,
        reasonCodes: invocation?.reasonCodes ?? [`${toolId.replaceAll(".", "_")}_compiled`],
      };
    },
  );
  const notInvoked = phaseStatuses.filter((phase) => phase.status === "not_invoked");
  const failed = phaseStatuses.filter((phase) => phase.status === "failed");
  const status =
    failed.length > 0 ? "failed" : notInvoked.length > 0 ? "needs_review" : "succeeded";
  return {
    artifactKind: "router_front_door_tool_protocol_result",
    protocolVersion: ROUTER_FRONT_DOOR_TOOL_PROTOCOL_VERSION,
    requestId: input.requestId,
    promptHash: input.promptHash,
    status,
    phaseStatuses,
    toolInvocationRefs: phaseStatuses.flatMap((phase) =>
      phase.invocationRef ? [phase.invocationRef] : [],
    ),
    executorWorkflowId: input.routerOutput.executorWorkflowId ?? input.routerOutput.workflowId,
    subjectWorkflowIds: input.routerOutput.subjectWorkflowIds,
    targetSubjectRefs: input.routerOutput.targetSubjectRefs.map((ref) => ({
      targetKind: ref.targetKind,
      targetRef: ref.targetRef,
      confidence: ref.confidence ?? null,
    })),
    requestedCapabilities: input.routerOutput.requestedCapabilities,
    constraintSummaries: input.routerOutput.constraints,
    requirementMapHandoffRef: `requirement-map-handoff://${input.requestId}#${input.promptHash.slice(
      0,
      16,
    )}`,
    validationOutcome: input.validation?.outcome ?? null,
    validationReasonCodes: input.validation?.reasonCodes.slice(0, 30) ?? [],
    reasonCodes: [
      "router_front_door_tool_protocol_compiled",
      ...(status === "succeeded" ? ["router_front_door_tool_protocol_traced"] : []),
      ...(notInvoked.length > 0 ? ["router_front_door_tool_protocol_missing_trace"] : []),
      ...(failed.length > 0 ? ["router_front_door_tool_protocol_failed_trace"] : []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
    authorityGranted: false,
  };
}

export function assertRouterFrontDoorToolProtocolCanCompile(
  protocol: RouterFrontDoorToolProtocolResult | null | undefined,
): void {
  if (!protocol) {
    return;
  }
  if (
    protocol.rawPromptStored ||
    protocol.rawResponseStored ||
    protocol.rawTranscriptStored ||
    protocol.rawProviderLogStored ||
    protocol.rawToolLogStored ||
    protocol.rawDbRowsStored ||
    protocol.secretsStored
  ) {
    throw new Error("router front-door tool protocol raw storage rejected");
  }
  if (protocol.workQueueLifecycleMutated || protocol.authorityGranted) {
    throw new Error("router front-door tool protocol cannot grant authority or mutate lifecycle");
  }
  const seen = new Set(protocol.phaseStatuses.map((phase) => phase.toolId));
  const missing = ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS.filter((toolId) => !seen.has(toolId));
  if (missing.length > 0) {
    throw new Error(`router front-door tool protocol missing phases: ${missing.join(",")}`);
  }
}

export function routerFrontDoorToolProtocolMetadata(
  protocol: RouterFrontDoorToolProtocolResult,
): JsonValue {
  return {
    artifactKind: protocol.artifactKind,
    protocolVersion: protocol.protocolVersion,
    status: protocol.status,
    requirementMapHandoffRef: protocol.requirementMapHandoffRef,
    toolInvocationRefs: protocol.toolInvocationRefs,
    phaseStatuses: protocol.phaseStatuses,
    rawPromptStored: false,
    rawResponseStored: false,
  } satisfies JsonValue;
}
