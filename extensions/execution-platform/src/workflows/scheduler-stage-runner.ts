import type { DynamicCodingTeamModelClient } from "../codex-bridge/dynamic-coding-team-orchestrator.ts";
import {
  missingField,
  repairRequestForMissingFields,
  type ModelDecisionRepairRequest,
} from "../model-decision-contracts/index.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  ModelToolTurnRequest,
  ModelToolTurnParallelismPolicy,
  ModelToolTurnTransportRequirement,
} from "./model-tool-turn-transport.ts";
import { executeModelToolTurn } from "./model-tool-turn-transport.ts";
import type {
  OrchestratorGraphEdgeSpec,
  OrchestratorGraphNodeSpec,
  OrchestratorGraphRejectedNodeDiagnostic,
} from "./orchestrator-graph-decision.ts";
import {
  roleDefaultEvidenceKinds,
  summarizeRequirementMapForScheduler,
  type RequirementMap,
  type RequirementMapSummary,
} from "./requirement-map.ts";
import {
  findRuntimeNodeCapability,
  type RuntimeNodeCapabilityManifest,
} from "./runtime-node-capability-registry.ts";
import type { RuntimeWorkGraphSchedulerSnapshotSummary } from "./runtime-work-graph-scheduler-contracts.ts";
import { graphRef } from "./runtime-work-graph.ts";
import type {
  SchedulerClosurePolicy,
  SchedulerClosureRunMode,
} from "./scheduler-graph-closure-policy.ts";
import {
  compileSchedulerGraphPatch,
  type SchedulerGraphPatch,
  type SchedulerGraphAmendmentRequest,
} from "./scheduler-graph-patch.ts";

export type SchedulerRequirementInventory = {
  artifactKind: "scheduler_requirement_inventory";
  schemaVersion: "execution-platform.scheduler-requirement-inventory.v1";
  inventoryId: string;
  inventoryRef: string;
  inventoryHash: string;
  graphId: string;
  graphRef: string;
  graphHash: string;
  sourceRequirementMapRef: string;
  requirements: Array<{
    requirementId: string;
    requirementKind:
      | "implementation"
      | "validation"
      | "review"
      | "closeout"
      | "constraint"
      | "context";
    primaryMissionRole:
      | "core_execution"
      | "validation"
      | "review"
      | "closeout"
      | "constraint"
      | "source_grounding";
    commitmentIds: string[];
    ownerIntentSummary: string;
    successCondition: string;
    evidenceExpectation: string;
    expectedEvidenceModes: string[];
    authorityScopeRefs: string[];
    dependencyRefs: string[];
    independentRootRationale: string | null;
    constraintRefs: string[];
    sourceRefs: string[];
    targetSubjectRefs: string[];
    riskRefs: string[];
    selectedCapabilityHints: string[];
    executionIntentHint: string | null;
    sourceMaterialRequirementKinds: string[];
  }>;
  blockedRequirementIds: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type SchedulerStageToolCall = {
  toolId: string;
  input: Record<string, unknown>;
};

export type SchedulerNativeToolDefinition = {
  name: string;
  canonicalToolId: SchedulerStageSmallVerbToolId;
  description: string;
  inputSchema: JsonValue;
};

export const SCHEDULER_STAGE_SMALL_VERB_TOOL_IDS = [
  "scheduler.open_work_unit_from_requirement",
  "scheduler.open_work_units_from_requirements",
  "scheduler.group_requirements_into_work_unit",
  "scheduler.mark_requirement_covered_by_work_unit",
  "scheduler.add_work_unit",
  "scheduler.patch_work_unit",
  "scheduler.split_requirement_work",
  "scheduler.add_capability_selection",
  "scheduler.patch_capability_selection",
  "scheduler.add_node_contract",
  "scheduler.patch_node_contract",
  "scheduler.patch_edge_or_parallelism",
  "scheduler.patch_work_unit_commitment_ids",
  "scheduler.patch_work_unit_execution_intent",
  "scheduler.add_target_subject_ref",
  "scheduler.mark_distinct_work_unit",
  "scheduler.merge_work_units",
  "scheduler.retire_work_unit",
  "scheduler.replace_work_unit_commitment_ids",
] as const;

export type SchedulerStageSmallVerbToolId = (typeof SCHEDULER_STAGE_SMALL_VERB_TOOL_IDS)[number];

export type SchedulerStagePhase =
  | "work_unit_coverage_required"
  | "capability_selection_required"
  | "node_contracts_required"
  | "dependency_ordering_required"
  | "compiled_graph_policy_repair_required"
  | "compiled_graph_ready"
  | "scheduler_stage_blocked";

export type SchedulerDraftState = {
  decisionId: string;
  decisionKind: "add_nodes";
  rationaleForDecision: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
  workBreakdownUnitsById: Record<string, Record<string, unknown>>;
  capabilitySelectionsByWorkUnitId: Record<string, Record<string, unknown>>;
  nodeContractDraftsByWorkUnitId: Record<string, Record<string, unknown>>;
  edgeOrParallelismDraft: Record<string, unknown>;
};

export type SchedulerStageProjection = {
  phase: SchedulerStagePhase;
  allowedToolIds: SchedulerStageSmallVerbToolId[];
  reasonCodes: string[];
  missingRequirementIds: string[];
  uncoveredRunnableRequirementIds: string[];
  missingCapabilityWorkUnitIds: string[];
  missingContractWorkUnitIds: string[];
  missingDependencyWorkUnitIds: string[];
  duplicateWorkUnitSignatures: string[];
  activeWorkUnitIds: string[];
  runnableRequirementIds: string[];
  canCompile: boolean;
};

export type SchedulerDraftPatchResult = {
  draft: SchedulerDraftState;
  modelToolCallCount: number;
  appliedToolIds: string[];
  rejectedToolIds: string[];
  omittedToolCallCount: number;
  reasonCodes: string[];
};

export type SchedulerStageBlockerKind =
  | "missing_scheduler_field"
  | "policy_failure"
  | "no_progress"
  | "provider_failure";

export type SchedulerStageBlockingDiagnostic = {
  blockerKind: SchedulerStageBlockerKind;
  reasonCode: string;
  affectedWorkUnitIds: string[];
  affectedRequirementIds: string[];
  missingFieldPaths: string[];
  policyRuleId: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type SchedulerCompiledGraphClassification = {
  acceptedTraceCodes: string[];
  blockingDiagnostics: SchedulerStageBlockingDiagnostic[];
  blockingReasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type SchedulerStageRunnerAcceptedGraphResult = {
  status: "accepted_graph";
  graphPatch: SchedulerGraphPatch;
  nodeSpecs: OrchestratorGraphNodeSpec[];
  edgeSpecs: OrchestratorGraphEdgeSpec[];
  acceptedTraceCodes: string[];
  artifactRefs: string[];
  reasonCodes: string[];
};

export type SchedulerStageRunnerBlockedResult = {
  status:
    | "blocked_missing_scheduler_field"
    | "blocked_policy_failure"
    | "blocked_no_progress"
    | "blocked_provider_failure";
  blocker: {
    blockerKind: SchedulerStageBlockerKind;
    reasonCodes: string[];
    diagnostics: SchedulerStageBlockingDiagnostic[];
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
  };
  artifactRefs: string[];
  reasonCodes: string[];
};

export type SchedulerStageRunnerNeedsToolTurnResult = {
  status: "needs_scheduler_tool_turn";
  projection: JsonValue;
  allowedToolIds: string[];
  artifactRefs: string[];
  reasonCodes: string[];
};

export type SchedulerStageRunnerResult =
  | SchedulerStageRunnerAcceptedGraphResult
  | SchedulerStageRunnerNeedsToolTurnResult
  | SchedulerStageRunnerBlockedResult;

export type SchedulerStageModelDecisionInput = {
  graphId: string;
  iteration: number;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  requirementMapSummary?: RequirementMapSummary | null;
  requirementInventorySummary?: JsonValue | null;
  recentNodeResultSummaries?: JsonValue[];
  capabilityRegistrySummary?: JsonValue | null;
  schedulerStagePhase?: SchedulerStagePhase | null;
  schedulerStageState?: JsonValue | null;
  schedulerStageDraft?: JsonValue | null;
  allowedSchedulerToolIds?: SchedulerStageSmallVerbToolId[];
  repairAttempt?: number;
  rejectedDecisionReasonCodes?: string[];
  rejectedDecisionDiagnostics?: OrchestratorGraphRejectedNodeDiagnostic[];
  rejectedDecisionRef?: string | null;
  repairFieldHints?: string[];
  repairDiagnostics?: ModelDecisionRepairRequest | null;
  acceptedDecisionFieldRefs?: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type SchedulerStageCompilerTelemetry = {
  repairRequest: ModelDecisionRepairRequest;
  rejectedNodeDiagnostics: OrchestratorGraphRejectedNodeDiagnostic[];
  reasonCodes: string[];
};

export type SchedulerStageTraceToolInput = {
  graphId: string;
  iteration: number;
  toolId: string;
  idempotencyKey: string;
  inputRef?: string | null;
  inputHash?: string | null;
  inputSummary: string;
  nodeId?: string | null;
  roleRef?: string | null;
  modelRef?: string | null;
  metadata?: JsonValue;
};

export type SchedulerStageTraceToolResult = {
  refs: string[];
  reasonCodes: string[];
};

export type SchedulerStageCheckpointInput = {
  graphId: string;
  checkpointKind: string;
  stateSummary: string;
  artifactRefs: string[];
};

export type SchedulerStageNativeToolCallInput = {
  graphId: string;
  iteration: number;
  repairAttempt: number;
  phase: SchedulerStagePhase;
  stage: string;
  currentObjective: string;
  modelRef: string;
  providerPath: string;
  systemPrompt: string;
  userPayload: JsonValue;
  tools: SchedulerNativeToolDefinition[];
  allowedToolNames: string[];
  requiredTransport: ModelToolTurnTransportRequirement;
  parallelismPolicy: ModelToolTurnParallelismPolicy;
  maxAcceptedToolCalls: number;
  maxOutputTokens: number;
  timeoutMs: number;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  taskClass?: string;
  modelTaskCallSite: string;
  reasonCodes: string[];
};

export type SchedulerStageModelPolicy = {
  modelRef: string;
  providerPath: ModelToolTurnRequest["providerPath"];
  taskClass: NonNullable<ModelToolTurnRequest["taskClass"]>;
  maxOutputTokens: number;
  timeoutMs: number;
  reasoningEffort?: NonNullable<ModelToolTurnRequest["reasoningEffort"]>;
  requiredTransport: ModelToolTurnTransportRequirement;
  parallelismPolicy: ModelToolTurnParallelismPolicy;
};

export type SchedulerStageNativeToolCallResult = {
  toolId: SchedulerStageSmallVerbToolId;
  input: Record<string, unknown>;
  modelRef: string;
  providerPath: string;
  providerToolName: string;
  latencyMs: number;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type SchedulerStageRunInput = {
  graphId: string;
  iteration: number;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  requirementMap: RequirementMap | null;
  requirementMapSummary: RequirementMapSummary | null;
  requirementMapAccepted: boolean;
  requirementInventory: SchedulerRequirementInventory | null;
  requirementInventorySummary: JsonValue | null;
  graphAmendmentRequest?: SchedulerGraphAmendmentRequest | null;
  schedulerClosurePolicy?: SchedulerClosurePolicy | null;
  closureRunMode?: SchedulerClosureRunMode;
  recentNodeResultSummaries: JsonValue[];
  capabilityRegistrySummary: JsonValue | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
  maxSchedulerToolTurns: number;
  callSchedulerTool(
    input: SchedulerStageNativeToolCallInput,
  ): Promise<SchedulerStageNativeToolCallResult>;
  callSchedulerTools?(
    input: SchedulerStageNativeToolCallInput,
  ): Promise<SchedulerStageNativeToolCallResult[]>;
  recordTool(input: SchedulerStageTraceToolInput): Promise<SchedulerStageTraceToolResult>;
  recordCheckpoint(input: SchedulerStageCheckpointInput): Promise<void>;
};

const ACCEPTED_TRACE_REASON_CODES = new Set([
  "scheduler_graph_patch_compiled",
  "scheduler_graph_patch_requirement_map_source",
  "scheduler_graph_patch_mission_tail_policy_applied",
  "scheduler_phase_compiled_graph_ready",
]);

const ACCEPTED_TRACE_REASON_CODE_PREFIXES = [
  "scheduler_dependency_ordering_runtime_hydrated:",
  "scheduler_node_contract_runtime_hydrated:",
  "scheduler_graph_patch_closure_run_mode:",
  "scheduler_graph_patch_node_seed_count:",
  "scheduler_graph_patch_edge_count:",
];

const BLOCKING_REASON_CODE_MARKERS = [
  "_missing",
  "_unknown",
  "_invalid",
  "_rejected",
  "_conflict",
  "_not_allowed",
  "_duplicate",
  "_required",
  "requires_",
  "_requires_",
  "not_satisfied",
  "runtime_owned_field",
  "policy",
  "block",
  "scheduler_graph_patch_model_authored_runtime_envelope_not_allowed",
];

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function stringArraySchema(): JsonValue {
  return { type: "array", items: { type: "string" } };
}

function enumStringSchema(values: readonly string[]): JsonValue {
  return { type: "string", enum: [...values] };
}

const SCHEDULER_EXECUTION_INTENTS = [
  "source_grounding",
  "source_edit",
  "validation",
  "review",
  "docs",
  "readback",
  "closeout",
  "human_decision",
] as const;

export function schedulerProviderToolName(toolId: SchedulerStageSmallVerbToolId): string {
  return toolId.replace(/[^a-zA-Z0-9_-]/gu, "_");
}

export function schedulerCanonicalToolIdFromProviderName(
  providerToolName: string,
): SchedulerStageSmallVerbToolId | null {
  for (const toolId of SCHEDULER_STAGE_SMALL_VERB_TOOL_IDS) {
    if (schedulerProviderToolName(toolId) === providerToolName) {
      return toolId;
    }
  }
  return null;
}

export type SchedulerStageNativeToolProgress = NonNullable<ModelToolTurnRequest["progress"]>;

function schedulerStageToolTurnTaskClass(
  value: SchedulerStageNativeToolCallInput["taskClass"],
): ModelToolTurnRequest["taskClass"] {
  return value as ModelToolTurnRequest["taskClass"];
}

function schedulerStageToolTurnRequest(input: {
  toolInput: SchedulerStageNativeToolCallInput;
  progress: SchedulerStageNativeToolProgress;
  maxAcceptedToolCalls: number;
  telemetryBudget: ModelToolTurnRequest["telemetryBudget"];
}): ModelToolTurnRequest {
  const toolInput = input.toolInput;
  return {
    owner: "scheduler",
    phaseId: toolInput.phase,
    modelRef: toolInput.modelRef,
    providerPath: toolInput.providerPath,
    systemPrompt: toolInput.systemPrompt,
    userPayload: toolInput.userPayload,
    tools: toolInput.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
    allowedToolNames: toolInput.allowedToolNames,
    requiredToolName: null,
    requiredTransport: toolInput.requiredTransport,
    parallelismPolicy: toolInput.parallelismPolicy,
    maxAcceptedToolCalls: input.maxAcceptedToolCalls,
    maxOutputTokens: toolInput.maxOutputTokens,
    timeoutMs: toolInput.timeoutMs,
    reasoningEffort: toolInput.reasoningEffort,
    taskClass: schedulerStageToolTurnTaskClass(toolInput.taskClass),
    modelTaskCallSite: toolInput.modelTaskCallSite,
    telemetryBudget: input.telemetryBudget,
    progress: input.progress,
  };
}

function schedulerStageToolCallResult(input: {
  toolInput: SchedulerStageNativeToolCallInput;
  toolCall: { toolName: string; toolArguments: unknown };
  latencyMs: number;
  reasonCode: "scheduler_native_tool_call_completed" | "scheduler_native_tool_batch_call_completed";
}): SchedulerStageNativeToolCallResult {
  const canonicalToolId = schedulerCanonicalToolIdFromProviderName(input.toolCall.toolName);
  if (!canonicalToolId) {
    throw new Error(`scheduler_provider_tool_name_unmapped:${input.toolCall.toolName}`);
  }
  const toolArguments =
    input.toolCall.toolArguments &&
    typeof input.toolCall.toolArguments === "object" &&
    !Array.isArray(input.toolCall.toolArguments)
      ? (input.toolCall.toolArguments as Record<string, unknown>)
      : { value: input.toolCall.toolArguments };
  return {
    toolId: canonicalToolId,
    input: toolArguments,
    modelRef: input.toolInput.modelRef,
    providerPath: input.toolInput.providerPath,
    providerToolName: input.toolCall.toolName,
    latencyMs: input.latencyMs,
    reasonCodes: [
      input.reasonCode,
      `scheduler_native_tool:${canonicalToolId}`,
      ...input.toolInput.reasonCodes,
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export async function executeSchedulerStageNativeTool(input: {
  modelClient: DynamicCodingTeamModelClient | null;
  toolInput: SchedulerStageNativeToolCallInput;
  progress: SchedulerStageNativeToolProgress;
}): Promise<SchedulerStageNativeToolCallResult> {
  const toolTurn = await executeModelToolTurn({
    modelClient: input.modelClient,
    request: schedulerStageToolTurnRequest({
      toolInput: input.toolInput,
      progress: input.progress,
      maxAcceptedToolCalls: 1,
      telemetryBudget: {
        inlineToolCallNameLimit: 12,
        inlineRejectedCallLimit: 8,
      },
    }),
  });
  const toolCall = toolTurn.acceptedToolCalls[0];
  if (!toolCall) {
    throw new Error(`scheduler_native_tool_call_missing:${input.toolInput.phase}`);
  }
  return schedulerStageToolCallResult({
    toolInput: input.toolInput,
    toolCall,
    latencyMs: toolTurn.latencyMs,
    reasonCode: "scheduler_native_tool_call_completed",
  });
}

export async function executeSchedulerStageNativeToolBatch(input: {
  modelClient: DynamicCodingTeamModelClient | null;
  toolInput: SchedulerStageNativeToolCallInput;
  progress: SchedulerStageNativeToolProgress;
}): Promise<SchedulerStageNativeToolCallResult[]> {
  const toolTurn = await executeModelToolTurn({
    modelClient: input.modelClient,
    request: schedulerStageToolTurnRequest({
      toolInput: input.toolInput,
      progress: input.progress,
      maxAcceptedToolCalls: input.toolInput.maxAcceptedToolCalls,
      telemetryBudget: {
        inlineToolCallNameLimit: 32,
        inlineRejectedCallLimit: 12,
      },
    }),
  });
  return toolTurn.acceptedToolCalls.map((toolCall) =>
    schedulerStageToolCallResult({
      toolInput: input.toolInput,
      toolCall,
      latencyMs: toolTurn.latencyMs,
      reasonCode: "scheduler_native_tool_batch_call_completed",
    }),
  );
}

function schedulerToolRequiredFields(toolId: SchedulerStageSmallVerbToolId): string[] {
  const byTool: Partial<Record<SchedulerStageSmallVerbToolId, string[]>> = {
    "scheduler.open_work_unit_from_requirement": ["requirementId"],
    "scheduler.open_work_units_from_requirements": ["requirementIds"],
    "scheduler.group_requirements_into_work_unit": [
      "workUnitId",
      "requirementIds",
      "executionIntent",
      "objective",
      "expectedOutcome",
      "successCriteria",
    ],
    "scheduler.mark_requirement_covered_by_work_unit": ["workUnitId", "requirementIds"],
    "scheduler.add_work_unit": [
      "workUnitId",
      "objective",
      "executionIntent",
      "commitmentIds",
      "expectedOutcome",
      "successCriteria",
    ],
    "scheduler.patch_work_unit": ["workUnitId"],
    "scheduler.split_requirement_work": ["requirementId"],
    "scheduler.add_capability_selection": ["workUnitId", "selectedCapabilityId"],
    "scheduler.patch_capability_selection": ["workUnitId", "selectedCapabilityId"],
    "scheduler.add_node_contract": ["workUnitId", "objective", "expectedOutput", "successCriteria"],
    "scheduler.patch_node_contract": ["workUnitId"],
    "scheduler.patch_edge_or_parallelism": [],
    "scheduler.patch_work_unit_commitment_ids": ["workUnitId", "commitmentIds"],
    "scheduler.patch_work_unit_execution_intent": ["workUnitId", "executionIntent"],
    "scheduler.add_target_subject_ref": ["workUnitId", "targetSubjectRef"],
    "scheduler.mark_distinct_work_unit": ["workUnitId", "distinctRationale"],
    "scheduler.merge_work_units": ["sourceWorkUnitId", "targetWorkUnitId"],
    "scheduler.retire_work_unit": ["workUnitId"],
    "scheduler.replace_work_unit_commitment_ids": ["workUnitId", "commitmentIds"],
  };
  return byTool[toolId] ?? ["workUnitId"];
}

function schedulerToolInputProperties(
  toolId: SchedulerStageSmallVerbToolId,
): Record<string, JsonValue> {
  const properties: Record<string, JsonValue> = {
    workUnitId: { type: "string" },
    sourceWorkUnitId: { type: "string" },
    targetWorkUnitId: { type: "string" },
    requirementId: { type: "string" },
    requirementIds: stringArraySchema(),
    commitmentIds: stringArraySchema(),
    objective: { type: "string" },
    executionIntent: enumStringSchema(SCHEDULER_EXECUTION_INTENTS),
    expectedOutcome: { type: "string" },
    successCriteria: stringArraySchema(),
    rationale: { type: "string" },
    reasonCodes: stringArraySchema(),
    selectedCapabilityId: { type: "string" },
    consideredCapabilityIds: stringArraySchema(),
    utilityRationale: { type: "string" },
    costRationale: { type: "string" },
    whyCheaperOptionsWereInsufficient: { type: "string" },
    whyThisIsNotDuplicateWork: { type: "string" },
    stopOrEscalationCondition: { type: "string" },
    selectedModelQualificationProfileId: { type: "string" },
    qualificationEvidenceRefs: stringArraySchema(),
    roleRationale: { type: "string" },
    inputRefs: stringArraySchema(),
    resourceRefs: stringArraySchema(),
    expectedOutput: { type: "string" },
    downstreamConsumer: { type: "string" },
    dependencyWorkUnitIds: stringArraySchema(),
    dependencyPatches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          workUnitId: { type: "string" },
          dependencyWorkUnitIds: stringArraySchema(),
          validationPhase: { type: "string" },
        },
        required: ["workUnitId", "dependencyWorkUnitIds"],
      },
    },
    dependencyEdges: { type: "array", items: { type: "object" } },
    parallelIndependentNodesJustification: { type: "string" },
    validationPhase: enumStringSchema([
      "preflight_validation",
      "pre_proof_validation",
      "integration_validation",
      "final_proof_validation",
      "review_validation",
      "closeout_validation",
    ]),
    targetSubjectRef: { type: "string" },
    distinctRationale: { type: "string" },
  };
  if (toolId === "scheduler.patch_edge_or_parallelism") {
    return properties;
  }
  return properties;
}

export function schedulerStagedSmallVerbToolDefinitions(
  allowedToolIds: readonly SchedulerStageSmallVerbToolId[] = SCHEDULER_STAGE_SMALL_VERB_TOOL_IDS,
): SchedulerNativeToolDefinition[] {
  const descriptionByTool: Partial<Record<SchedulerStageSmallVerbToolId, string>> = {
    "scheduler.open_work_unit_from_requirement":
      "Open one runnable SchedulerRequirementInventory requirement as a scheduler work unit. Provide requirementId; runtime hydrates objective, commitments, execution intent, evidence, refs, and requirements from the accepted SchedulerRequirementInventory.",
    "scheduler.open_work_units_from_requirements":
      "Open every listed runnable SchedulerRequirementInventory requirement as separate scheduler work units in one bounded coverage turn. Provide requirementIds; runtime hydrates fields from the accepted SchedulerRequirementInventory.",
    "scheduler.group_requirements_into_work_unit":
      "Cover multiple related scheduler-visible requirements with one scheduler work unit. Group only requirements that share one execution home; runtime derives mission-tail validation, review, and closeout aggregate work units from accepted RequirementMap roles.",
    "scheduler.mark_requirement_covered_by_work_unit":
      "Attach one or more remaining requirementIds to an existing workUnitId when the existing work unit is the correct execution home.",
    "scheduler.patch_work_unit":
      "Patch an existing incomplete scheduler work unit only for missing structural fields reported in schedulerStageState.",
    "scheduler.patch_work_unit_execution_intent":
      "Patch only an existing work unit executionIntent when compiled graph policy reports execution intent missing or capability/intent conflict.",
    "scheduler.add_capability_selection":
      "Select the cheapest sufficiently capable runtime capability for one work unit.",
    "scheduler.patch_capability_selection":
      "Patch only one existing capability selection when compiled graph policy reports a capability conflict or missing qualification field.",
    "scheduler.add_node_contract":
      "Author worker-facing node contract fields for one work unit after capability selection is complete.",
    "scheduler.patch_node_contract":
      "Patch missing worker-facing node contract fields for one existing work unit.",
  };
  return allowedToolIds.map((toolId) => ({
    name: schedulerProviderToolName(toolId),
    canonicalToolId: toolId,
    description:
      descriptionByTool[toolId] ??
      `OpenClaw scheduler small verb ${toolId}. Runtime applies and validates the staged graph draft; the model authors only this bounded scheduler phase field.`,
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: schedulerToolInputProperties(toolId),
      required: schedulerToolRequiredFields(toolId),
    },
  }));
}

function unknownRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function unknownString(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function unknownStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? uniqueStrings(
        value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean),
      )
    : [];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R | undefined>({ length: values.length });
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), values.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(values[currentIndex]!, currentIndex);
      }
    }),
  );
  return results as R[];
}

export function createSchedulerDraftState(iteration: number): SchedulerDraftState {
  return {
    decisionId: `scheduler-decision-${iteration}`,
    decisionKind: "add_nodes",
    rationaleForDecision:
      "Compile SchedulerGraphPatch node seeds from the accepted SchedulerRequirementInventory using scheduler small verbs.",
    reasonCodes: ["scheduler_graph_patch_small_verb_authoring"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
    workBreakdownUnitsById: {},
    capabilitySelectionsByWorkUnitId: {},
    nodeContractDraftsByWorkUnitId: {},
    edgeOrParallelismDraft: {},
  };
}

function cloneSchedulerDraftState(value: SchedulerDraftState): SchedulerDraftState {
  return {
    ...value,
    reasonCodes: [...value.reasonCodes],
    workBreakdownUnitsById: JSON.parse(JSON.stringify(value.workBreakdownUnitsById)) as Record<
      string,
      Record<string, unknown>
    >,
    capabilitySelectionsByWorkUnitId: JSON.parse(
      JSON.stringify(value.capabilitySelectionsByWorkUnitId),
    ) as Record<string, Record<string, unknown>>,
    nodeContractDraftsByWorkUnitId: JSON.parse(
      JSON.stringify(value.nodeContractDraftsByWorkUnitId),
    ) as Record<string, Record<string, unknown>>,
    edgeOrParallelismDraft: JSON.parse(JSON.stringify(value.edgeOrParallelismDraft)) as Record<
      string,
      unknown
    >,
  };
}

function upsertSchedulerDraftRecord(input: {
  target: Record<string, Record<string, unknown>>;
  workUnitId: string;
  patch: Record<string, unknown>;
}): void {
  input.target[input.workUnitId] = {
    ...(input.target[input.workUnitId] ?? { workUnitId: input.workUnitId }),
    ...input.patch,
    workUnitId: input.workUnitId,
  };
}

function mergeSchedulerDraftRecords(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...source, ...target };
  for (const key of [
    "commitmentIds",
    "successCriteria",
    "resourceRefs",
    "inputRefs",
    "targetSubjectRefs",
    "dependencyWorkUnitIds",
    "consideredCapabilityIds",
    "qualificationEvidenceRefs",
  ]) {
    const values = uniqueStrings([
      ...unknownStringArray(source[key]),
      ...unknownStringArray(target[key]),
    ]);
    if (values.length > 0) {
      merged[key] = values;
    }
  }
  return merged;
}

function schedulerDraftWorkUnitIds(state: SchedulerDraftState): string[] {
  return Object.keys(state.workBreakdownUnitsById).toSorted();
}

function retireSchedulerDraftWorkUnit(state: SchedulerDraftState, workUnitId: string): void {
  delete state.workBreakdownUnitsById[workUnitId];
  delete state.capabilitySelectionsByWorkUnitId[workUnitId];
  delete state.nodeContractDraftsByWorkUnitId[workUnitId];
  const edges = Array.isArray(state.edgeOrParallelismDraft.edges)
    ? state.edgeOrParallelismDraft.edges
    : [];
  if (edges.length > 0) {
    state.edgeOrParallelismDraft = {
      ...state.edgeOrParallelismDraft,
      edges: edges.filter((edge) => {
        const record = unknownRecord(edge);
        return (
          unknownString(record.fromWorkUnitId ?? record.fromNodeId) !== workUnitId &&
          unknownString(record.toWorkUnitId ?? record.toNodeId) !== workUnitId
        );
      }),
    };
  }
}

function replaceSchedulerDraftWorkUnitRef(
  state: SchedulerDraftState,
  sourceWorkUnitId: string,
  targetWorkUnitId: string,
): void {
  for (const record of [
    ...Object.values(state.workBreakdownUnitsById),
    ...Object.values(state.nodeContractDraftsByWorkUnitId),
  ]) {
    const dependencies = unknownStringArray(
      record.dependencyWorkUnitIds ?? record.dependsOnWorkUnitIds ?? record.dependencies,
    );
    if (dependencies.includes(sourceWorkUnitId)) {
      record.dependencyWorkUnitIds = uniqueStrings(
        dependencies.map((id) => (id === sourceWorkUnitId ? targetWorkUnitId : id)),
      ).filter((id) => id !== unknownString(record.workUnitId));
    }
  }
  const edges = Array.isArray(state.edgeOrParallelismDraft.edges)
    ? state.edgeOrParallelismDraft.edges
    : [];
  if (edges.length > 0) {
    state.edgeOrParallelismDraft = {
      ...state.edgeOrParallelismDraft,
      edges: edges
        .map((edge) => {
          const record = { ...unknownRecord(edge) };
          if (unknownString(record.fromWorkUnitId ?? record.fromNodeId) === sourceWorkUnitId) {
            record.fromWorkUnitId = targetWorkUnitId;
          }
          if (unknownString(record.toWorkUnitId ?? record.toNodeId) === sourceWorkUnitId) {
            record.toWorkUnitId = targetWorkUnitId;
          }
          return record;
        })
        .filter((edge) => unknownString(edge.fromWorkUnitId) !== unknownString(edge.toWorkUnitId)),
    };
  }
}

export function schedulerVisibleRequirements(
  requirementInventory: SchedulerRequirementInventory | null,
): SchedulerRequirementInventory["requirements"] {
  return (requirementInventory?.requirements ?? []).filter(
    (requirement) => requirement.requirementKind === "implementation",
  );
}

function requirementRoleToSchedulerRequirementKind(
  role: RequirementMap["requirements"][number]["role"],
): SchedulerRequirementInventory["requirements"][number]["requirementKind"] {
  switch (role) {
    case "runnable_work":
      return "implementation";
    case "validation":
      return "validation";
    case "review":
      return "review";
    case "closeout":
      return "closeout";
    case "constraint":
      return "constraint";
    case "context":
      return "context";
    case "non_goal":
      return "constraint";
  }
  return "constraint";
}

function requirementRoleToPrimaryMissionRole(
  role: RequirementMap["requirements"][number]["role"],
): SchedulerRequirementInventory["requirements"][number]["primaryMissionRole"] {
  switch (role) {
    case "runnable_work":
      return "core_execution";
    case "validation":
      return "validation";
    case "review":
      return "review";
    case "closeout":
      return "closeout";
    case "constraint":
    case "non_goal":
      return "constraint";
    case "context":
      return "source_grounding";
  }
  return "constraint";
}

function requirementRoleToExecutionIntent(
  role: RequirementMap["requirements"][number]["role"],
): string | null {
  switch (role) {
    case "runnable_work":
      return "source_edit";
    case "validation":
      return "validation";
    case "review":
      return "review";
    case "closeout":
      return "closeout";
    case "context":
      return "source_grounding";
    case "constraint":
    case "non_goal":
      return null;
  }
  return null;
}

function requirementMapAsSchedulerInventory(
  requirementMap: RequirementMap | null,
): SchedulerRequirementInventory | null {
  if (!requirementMap) {
    return null;
  }
  return {
    artifactKind: "scheduler_requirement_inventory",
    schemaVersion: "execution-platform.scheduler-requirement-inventory.v1",
    inventoryId: `${requirementMap.mapId}:scheduler-inventory`,
    inventoryRef: requirementMap.mapRef,
    inventoryHash: requirementMap.mapHash,
    graphId: `${requirementMap.mapId}:scheduler-inventory`,
    graphRef: requirementMap.mapRef,
    graphHash: requirementMap.mapHash,
    sourceRequirementMapRef: requirementMap.mapRef,
    requirements: requirementMap.requirements.map((requirement) => {
      const executionIntentHint = requirementRoleToExecutionIntent(requirement.role);
      return {
        requirementId: requirement.requirementId,
        requirementKind: requirementRoleToSchedulerRequirementKind(requirement.role),
        primaryMissionRole: requirementRoleToPrimaryMissionRole(requirement.role),
        commitmentIds: [requirement.requirementId],
        ownerIntentSummary: requirement.text,
        successCondition: requirement.text,
        evidenceExpectation: requirement.text,
        expectedEvidenceModes: roleDefaultEvidenceKinds(requirement.role),
        authorityScopeRefs: [],
        dependencyRefs: [],
        independentRootRationale: null,
        constraintRefs:
          requirement.role === "constraint" || requirement.role === "non_goal"
            ? [requirement.requirementId]
            : [],
        sourceRefs: [requirementMap.sourcePromptBodyRef, ...requirement.sourceRefs],
        targetSubjectRefs: [],
        riskRefs: [],
        selectedCapabilityHints: [],
        executionIntentHint,
        sourceMaterialRequirementKinds: requirement.role === "runnable_work" ? ["repo_files"] : [],
      };
    }),
    blockedRequirementIds: [],
    reasonCodes: [
      "requirement_map_scheduler_inventory_projected",
      "requirement_map_is_canonical_intake_product",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function schedulerWorkUnitIdForRequirement(requirementId: string): string {
  const suffix = requirementId
    .replace(/^req(?:uirement)?[-_:]?/iu, "")
    .replace(/[^a-zA-Z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);
  return `wu-${suffix || requirementId.slice(0, 120)}`;
}

function schedulerWorkUnitPatchFromRequirement(input: {
  requirement: SchedulerRequirementInventory["requirements"][number];
  body: Record<string, unknown>;
}): Record<string, unknown> {
  const workUnitId =
    unknownString(input.body.workUnitId ?? input.body.unitId ?? input.body.id) ||
    schedulerWorkUnitIdForRequirement(input.requirement.requirementId);
  const executionIntent =
    unknownString(input.body.executionIntent) ||
    unknownString(input.requirement.executionIntentHint) ||
    (input.requirement.requirementKind === "validation"
      ? "validation"
      : input.requirement.requirementKind === "review"
        ? "review"
        : input.requirement.requirementKind === "closeout"
          ? "closeout"
          : input.requirement.primaryMissionRole === "source_grounding"
            ? "source_grounding"
            : "source_edit");
  const objective =
    unknownString(input.body.objective ?? input.body.title) || input.requirement.ownerIntentSummary;
  const expectedOutcome =
    unknownString(input.body.expectedOutcome ?? input.body.expectedOutput) ||
    input.requirement.evidenceExpectation ||
    input.requirement.successCondition;
  return {
    ...input.body,
    workUnitId,
    requirementIds: uniqueStrings([
      ...unknownStringArray(input.body.requirementIds),
      unknownString(input.body.requirementId),
      unknownString(input.body.sourceRequirementId),
      input.requirement.requirementId,
    ]),
    objective,
    title: unknownString(input.body.title) || objective.slice(0, 180),
    executionIntent,
    commitmentIds: uniqueStrings([
      ...input.requirement.commitmentIds,
      ...unknownStringArray(input.body.commitmentIds),
    ]),
    expectedOutcome,
    successCriteria: uniqueStrings([
      ...unknownStringArray(input.body.successCriteria),
      input.requirement.successCondition,
    ]),
    evidenceExpectation:
      unknownString(input.body.evidenceExpectation) || input.requirement.evidenceExpectation,
    expectedEvidenceModes: uniqueStrings([
      ...input.requirement.expectedEvidenceModes,
      ...unknownStringArray(input.body.expectedEvidenceModes),
    ]),
    authorityScopeRefs: uniqueStrings([
      ...input.requirement.authorityScopeRefs,
      ...unknownStringArray(input.body.authorityScopeRefs),
    ]),
    inputRefs: uniqueStrings([
      ...input.requirement.sourceRefs,
      ...unknownStringArray(input.body.inputRefs),
    ]),
    targetSubjectRefs: uniqueStrings([
      ...input.requirement.targetSubjectRefs,
      ...unknownStringArray(input.body.targetSubjectRefs),
    ]),
    sourceMaterialRequirementKinds: uniqueStrings([
      ...input.requirement.sourceMaterialRequirementKinds,
      ...unknownStringArray(input.body.sourceMaterialRequirementKinds),
    ]),
    selectedCapabilityHints: uniqueStrings([
      ...input.requirement.selectedCapabilityHints,
      ...unknownStringArray(input.body.selectedCapabilityHints),
    ]),
    sourceRequirementId: input.requirement.requirementId,
  };
}

function schedulerRequirementIdsFromBody(body: Record<string, unknown>): string[] {
  return uniqueStrings([
    ...unknownStringArray(body.requirementIds),
    ...unknownStringArray(body.sourceRequirementIds),
    unknownString(body.requirementId),
    unknownString(body.sourceRequirementId),
  ]);
}

function schedulerRequirementById(
  requirementInventory: SchedulerRequirementInventory | null,
  requirementId: string,
): SchedulerRequirementInventory["requirements"][number] | null {
  return (
    schedulerVisibleRequirements(requirementInventory).find(
      (candidate) => candidate.requirementId === requirementId,
    ) ?? null
  );
}

function schedulerCombinedWorkUnitPatchFromRequirements(input: {
  requirements: SchedulerRequirementInventory["requirements"];
  body: Record<string, unknown>;
}): Record<string, unknown> {
  const first = input.requirements[0];
  const requirementIds = input.requirements.map((requirement) => requirement.requirementId);
  const preferredImplementation = input.requirements.find((requirement) =>
    ["source_edit", "implementation", "docs", "test_authoring"].includes(
      unknownString(requirement.executionIntentHint) ||
        (requirement.requirementKind === "implementation" ? "implementation" : ""),
    ),
  );
  const intentSource = preferredImplementation ?? first;
  const workUnitId =
    unknownString(input.body.workUnitId ?? input.body.unitId ?? input.body.id) ||
    (requirementIds.length === 1
      ? schedulerWorkUnitIdForRequirement(requirementIds[0] ?? "")
      : `wu-${requirementIds
          .map((id) => id.replace(/^obl(?:igation)?[-_:]?/iu, ""))
          .join("-")
          .replace(/[^a-zA-Z0-9_-]+/gu, "-")
          .replace(/^-+|-+$/gu, "")
          .slice(0, 120)}`);
  const executionIntent =
    unknownString(input.body.executionIntent) ||
    unknownString(intentSource?.executionIntentHint) ||
    (intentSource?.requirementKind === "validation"
      ? "validation"
      : intentSource?.requirementKind === "review"
        ? "review"
        : intentSource?.requirementKind === "closeout"
          ? "closeout"
          : intentSource?.primaryMissionRole === "source_grounding"
            ? "source_grounding"
            : "source_edit");
  const objective =
    unknownString(input.body.objective ?? input.body.title) ||
    input.requirements
      .map((requirement) => requirement.ownerIntentSummary)
      .filter(Boolean)
      .join(" / ")
      .slice(0, 360) ||
    `Cover requirements ${requirementIds.join(", ")}.`;
  const expectedOutcome =
    unknownString(input.body.expectedOutcome ?? input.body.expectedOutput) ||
    input.requirements
      .map((requirement) => requirement.evidenceExpectation || requirement.successCondition)
      .filter(Boolean)
      .join(" / ")
      .slice(0, 360) ||
    "Runtime evidence refs mapped to covered requirements.";
  return {
    ...input.body,
    workUnitId,
    requirementIds: uniqueStrings([
      ...schedulerRequirementIdsFromBody(input.body),
      ...requirementIds,
    ]),
    sourceRequirementIds: requirementIds,
    objective,
    title: unknownString(input.body.title) || objective.slice(0, 180),
    executionIntent,
    commitmentIds: uniqueStrings([
      ...input.requirements.flatMap((requirement) => requirement.commitmentIds),
      ...unknownStringArray(input.body.commitmentIds),
    ]),
    expectedOutcome,
    successCriteria: uniqueStrings([
      ...input.requirements.map((requirement) => requirement.successCondition),
      ...unknownStringArray(input.body.successCriteria),
    ]),
    evidenceExpectation:
      unknownString(input.body.evidenceExpectation) ||
      input.requirements
        .map((requirement) => requirement.evidenceExpectation)
        .filter(Boolean)
        .join(" / ")
        .slice(0, 360),
    expectedEvidenceModes: uniqueStrings([
      ...input.requirements.flatMap((requirement) => requirement.expectedEvidenceModes),
      ...unknownStringArray(input.body.expectedEvidenceModes),
    ]),
    authorityScopeRefs: uniqueStrings([
      ...input.requirements.flatMap((requirement) => requirement.authorityScopeRefs),
      ...unknownStringArray(input.body.authorityScopeRefs),
    ]),
    inputRefs: uniqueStrings([
      ...input.requirements.flatMap((requirement) => requirement.sourceRefs),
      ...unknownStringArray(input.body.inputRefs),
    ]),
    targetSubjectRefs: uniqueStrings([
      ...input.requirements.flatMap((requirement) => requirement.targetSubjectRefs),
      ...unknownStringArray(input.body.targetSubjectRefs),
    ]),
    sourceMaterialRequirementKinds: uniqueStrings([
      ...input.requirements.flatMap((requirement) => requirement.sourceMaterialRequirementKinds),
      ...unknownStringArray(input.body.sourceMaterialRequirementKinds),
    ]),
    selectedCapabilityHints: uniqueStrings([
      ...input.requirements.flatMap((requirement) => requirement.selectedCapabilityHints),
      ...unknownStringArray(input.body.selectedCapabilityHints),
    ]),
  };
}

function schedulerNodeContractStructurallyComplete(
  contract: Record<string, unknown> | null,
): boolean {
  if (!contract) {
    return false;
  }
  return (
    Boolean(unknownString(contract.executionIntent)) &&
    Boolean(unknownString(contract.objective)) &&
    Boolean(unknownString(contract.expectedOutput) || unknownString(contract.expectedOutcome)) &&
    unknownStringArray(contract.successCriteria).length > 0
  );
}

function schedulerNodeContractFromWorkUnit(input: {
  workUnit: Record<string, unknown>;
  selection: Record<string, unknown> | null;
}): Record<string, unknown> {
  const workUnitId = unknownString(input.workUnit.workUnitId);
  const executionIntent =
    unknownString(input.workUnit.executionIntent) ||
    unknownString(input.selection?.executionIntent) ||
    "source_edit";
  const objective =
    unknownString(input.workUnit.objective ?? input.workUnit.title) ||
    `Execute scheduler work unit ${workUnitId}.`;
  const expectedOutput =
    unknownString(input.workUnit.expectedOutput ?? input.workUnit.expectedOutcome) ||
    unknownString(input.workUnit.evidenceExpectation) ||
    "Runtime evidence refs mapped to covered commitments.";
  return {
    workUnitId,
    executionIntent,
    roleRationale:
      unknownString(input.workUnit.rationale ?? input.selection?.utilityRationale) ||
      "Runtime-hydrated node contract from accepted scheduler work unit.",
    objective,
    inputRefs: uniqueStrings([
      ...unknownStringArray(input.workUnit.inputRefs),
      ...unknownStringArray(input.workUnit.sourceRefs),
    ]),
    expectedOutput,
    expectedOutcome: expectedOutput,
    successCriteria: uniqueStrings([
      ...unknownStringArray(input.workUnit.successCriteria),
      unknownString(input.workUnit.expectedOutcome),
      unknownString(input.workUnit.evidenceExpectation),
    ]),
    downstreamConsumer:
      unknownString(input.workUnit.downstreamConsumer) ||
      (executionIntent === "source_edit" ? "validation" : "closeout"),
    resourceRefs: uniqueStrings([
      ...unknownStringArray(input.workUnit.resourceRefs),
      ...unknownStringArray(input.workUnit.authorityScopeRefs),
      ...unknownStringArray(input.workUnit.targetSubjectRefs),
    ]),
    dependencyWorkUnitIds: unknownStringArray(
      input.workUnit.dependencyWorkUnitIds ??
        input.workUnit.dependsOnWorkUnitIds ??
        input.workUnit.dependencies,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function hydrateSchedulerNodeContractsFromWorkUnits(state: SchedulerDraftState): string[] {
  const hydratedWorkUnitIds: string[] = [];
  for (const workUnitId of schedulerDraftWorkUnitIds(state)) {
    const existing = state.nodeContractDraftsByWorkUnitId[workUnitId] ?? null;
    if (schedulerNodeContractStructurallyComplete(existing)) {
      continue;
    }
    const workUnit = state.workBreakdownUnitsById[workUnitId];
    if (!workUnit) {
      continue;
    }
    state.nodeContractDraftsByWorkUnitId[workUnitId] = {
      ...schedulerNodeContractFromWorkUnit({
        workUnit,
        selection: state.capabilitySelectionsByWorkUnitId[workUnitId] ?? null,
      }),
      ...existing,
      workUnitId,
    };
    hydratedWorkUnitIds.push(workUnitId);
  }
  return hydratedWorkUnitIds;
}

function schedulerWorkUnitExecutionIntent(state: SchedulerDraftState, workUnitId: string): string {
  return (
    unknownString(state.nodeContractDraftsByWorkUnitId[workUnitId]?.executionIntent) ||
    unknownString(state.workBreakdownUnitsById[workUnitId]?.executionIntent)
  );
}

const SCHEDULER_CORE_EXECUTION_INTENTS = new Set([
  "source_edit",
  "implementation",
  "docs",
  "test_authoring",
]);

const SCHEDULER_DOWNSTREAM_EXECUTION_INTENTS = new Set([
  "validation",
  "review",
  "readback",
  "closeout",
]);

function schedulerDraftEdges(state: SchedulerDraftState): Record<string, unknown>[] {
  return Array.isArray(state.edgeOrParallelismDraft.edges)
    ? state.edgeOrParallelismDraft.edges.map(unknownRecord)
    : [];
}

function schedulerCoreWorkUnitIds(state: SchedulerDraftState): string[] {
  return schedulerDraftWorkUnitIds(state).filter((workUnitId) =>
    SCHEDULER_CORE_EXECUTION_INTENTS.has(schedulerWorkUnitExecutionIntent(state, workUnitId)),
  );
}

function schedulerDownstreamWorkUnitIds(state: SchedulerDraftState): string[] {
  return schedulerDraftWorkUnitIds(state).filter((workUnitId) =>
    SCHEDULER_DOWNSTREAM_EXECUTION_INTENTS.has(schedulerWorkUnitExecutionIntent(state, workUnitId)),
  );
}

function schedulerIncomingDependencyWorkUnitIds(
  state: SchedulerDraftState,
  workUnitId: string,
): string[] {
  const workUnit = state.workBreakdownUnitsById[workUnitId] ?? {};
  const contract = state.nodeContractDraftsByWorkUnitId[workUnitId] ?? {};
  const explicitDependencies = unknownStringArray(
    workUnit.dependencyWorkUnitIds ??
      workUnit.dependsOnWorkUnitIds ??
      workUnit.dependencies ??
      contract.dependencyWorkUnitIds ??
      contract.dependsOnWorkUnitIds ??
      contract.dependencies,
  );
  const edgeDependencies = schedulerDraftEdges(state)
    .filter((edge) => unknownString(edge.toWorkUnitId ?? edge.toNodeId) === workUnitId)
    .map((edge) => unknownString(edge.fromWorkUnitId ?? edge.fromNodeId))
    .filter(Boolean);
  return uniqueStrings([...explicitDependencies, ...edgeDependencies]).filter(
    (dependencyId) => dependencyId !== workUnitId,
  );
}

function schedulerDefaultDependenciesForDownstreamWorkUnit(
  state: SchedulerDraftState,
  workUnitId: string,
): string[] {
  const intent = schedulerWorkUnitExecutionIntent(state, workUnitId);
  const coreWorkUnitIds = schedulerCoreWorkUnitIds(state);
  const validationWorkUnitIds = schedulerDraftWorkUnitIds(state).filter(
    (candidateId) =>
      candidateId !== workUnitId &&
      schedulerWorkUnitExecutionIntent(state, candidateId) === "validation",
  );
  const reviewWorkUnitIds = schedulerDraftWorkUnitIds(state).filter(
    (candidateId) =>
      candidateId !== workUnitId &&
      schedulerWorkUnitExecutionIntent(state, candidateId) === "review",
  );
  const readbackWorkUnitIds = schedulerDraftWorkUnitIds(state).filter(
    (candidateId) =>
      candidateId !== workUnitId &&
      schedulerWorkUnitExecutionIntent(state, candidateId) === "readback",
  );
  if (intent === "validation") {
    return coreWorkUnitIds;
  }
  if (intent === "review") {
    return uniqueStrings([...validationWorkUnitIds, ...coreWorkUnitIds]);
  }
  if (intent === "readback") {
    return uniqueStrings([...reviewWorkUnitIds, ...validationWorkUnitIds, ...coreWorkUnitIds]);
  }
  if (intent === "closeout") {
    return uniqueStrings([
      ...readbackWorkUnitIds,
      ...reviewWorkUnitIds,
      ...validationWorkUnitIds,
      ...coreWorkUnitIds,
    ]);
  }
  return [];
}

function schedulerMissingDependencyWorkUnitIds(state: SchedulerDraftState): string[] {
  const downstreamWorkUnitIds = schedulerDownstreamWorkUnitIds(state);
  if (downstreamWorkUnitIds.length === 0) {
    return [];
  }
  const coreWorkUnitIds = schedulerCoreWorkUnitIds(state);
  const independentRootAllowed =
    coreWorkUnitIds.length === 0 &&
    Boolean(unknownString(state.edgeOrParallelismDraft.parallelIndependentNodesJustification));
  if (independentRootAllowed) {
    return [];
  }
  return downstreamWorkUnitIds.filter((workUnitId) => {
    const dependencies = schedulerIncomingDependencyWorkUnitIds(state, workUnitId);
    const requiredDefaults = schedulerDefaultDependenciesForDownstreamWorkUnit(state, workUnitId);
    if (requiredDefaults.length === 0) {
      return dependencies.length === 0;
    }
    return !dependencies.some((dependencyId) => requiredDefaults.includes(dependencyId));
  });
}

function deriveSchedulerDependencyEdgesFromDraft(
  state: SchedulerDraftState,
): Record<string, unknown>[] {
  const workUnitIds = schedulerDraftWorkUnitIds(state);
  const coreWorkUnitIds = schedulerCoreWorkUnitIds(state);
  const sourceGroundingWorkUnitIds = workUnitIds.filter(
    (workUnitId) => schedulerWorkUnitExecutionIntent(state, workUnitId) === "source_grounding",
  );
  const downstreamWorkUnitIds = schedulerDownstreamWorkUnitIds(state);
  const edges: Record<string, unknown>[] = [];
  for (const groundingId of sourceGroundingWorkUnitIds) {
    for (const coreId of coreWorkUnitIds) {
      if (groundingId !== coreId) {
        edges.push({
          edgeId: `${groundingId}-to-${coreId}`,
          fromWorkUnitId: groundingId,
          toWorkUnitId: coreId,
          edgeKind: "handoff",
          rationale: "Source-grounding work must complete before dependent implementation work.",
        });
      }
    }
  }
  for (const downstreamId of downstreamWorkUnitIds) {
    for (const dependencyId of schedulerDefaultDependenciesForDownstreamWorkUnit(
      state,
      downstreamId,
    )) {
      if (downstreamId !== dependencyId) {
        edges.push({
          edgeId: `${dependencyId}-to-${downstreamId}`,
          fromWorkUnitId: dependencyId,
          toWorkUnitId: downstreamId,
          edgeKind: "handoff",
          rationale: "Validation, review, readback, and closeout work runs after core execution.",
        });
      }
    }
  }
  return edges;
}

function hydrateSchedulerDependencyOrderingFromDraft(state: SchedulerDraftState): string[] {
  const existingEdges = Array.isArray(state.edgeOrParallelismDraft.edges)
    ? state.edgeOrParallelismDraft.edges
    : [];
  if (schedulerDraftWorkUnitIds(state).length <= 1) {
    return [];
  }
  const edges = deriveSchedulerDependencyEdgesFromDraft(state);
  if (edges.length === 0) {
    state.edgeOrParallelismDraft = {
      ...state.edgeOrParallelismDraft,
      parallelIndependentNodesJustification:
        unknownString(state.edgeOrParallelismDraft.parallelIndependentNodesJustification) ||
        "Scheduler found no role-derived dependency edge between work units; units are independent roots.",
    };
    return ["scheduler_dependency_ordering_runtime_marked_parallel_roots"];
  }
  const existingEdgeKeys = new Set(
    existingEdges
      .map(unknownRecord)
      .map(
        (edge) =>
          `${unknownString(edge.fromWorkUnitId ?? edge.fromNodeId)}->${unknownString(edge.toWorkUnitId ?? edge.toNodeId)}`,
      ),
  );
  const missingEdges = edges.filter(
    (edge) =>
      !existingEdgeKeys.has(
        `${unknownString(edge.fromWorkUnitId ?? edge.fromNodeId)}->${unknownString(edge.toWorkUnitId ?? edge.toNodeId)}`,
      ),
  );
  if (missingEdges.length === 0) {
    return [];
  }
  state.edgeOrParallelismDraft = {
    ...state.edgeOrParallelismDraft,
    edges: [...existingEdges, ...missingEdges],
  };
  return missingEdges.map(
    (edge) =>
      `scheduler_dependency_ordering_runtime_hydrated:${unknownString(edge.fromWorkUnitId)}:${unknownString(edge.toWorkUnitId)}`,
  );
}

function schedulerCapabilityCandidateIdsForWorkUnit(input: {
  state: SchedulerDraftState;
  workUnitId: string;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): string[] {
  const workUnit = input.state.workBreakdownUnitsById[input.workUnitId] ?? {};
  const existingHints = uniqueStrings([
    ...unknownStringArray(workUnit.selectedCapabilityHints),
    ...unknownStringArray(workUnit.capabilityHints),
    unknownString(workUnit.selectedCapabilityId),
    unknownString(workUnit.capabilityId),
  ]);
  const validHintIds = existingHints.filter((capabilityId) =>
    Boolean(findRuntimeNodeCapability(capabilityId, input.capabilityManifest)),
  );
  if (validHintIds.length > 0) {
    return uniqueStrings(validHintIds);
  }
  const executionIntent = unknownString(workUnit.executionIntent);
  if (!executionIntent) {
    return [];
  }
  return input.capabilityManifest.capabilities
    .filter(
      (capability) =>
        capability.canRunAsExecutable &&
        (capability.supportedExecutionIntents as readonly string[]).includes(executionIntent),
    )
    .map((capability) => capability.capabilityId)
    .toSorted();
}

function applySchedulerRuntimeDerivations(input: {
  state: SchedulerDraftState;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): string[] {
  const reasonCodes: string[] = [];
  for (const workUnitId of schedulerDraftWorkUnitIds(input.state)) {
    const existing = input.state.capabilitySelectionsByWorkUnitId[workUnitId] ?? {};
    if (unknownString(existing.selectedCapabilityId ?? existing.capabilityId)) {
      continue;
    }
    const candidateIds = schedulerCapabilityCandidateIdsForWorkUnit({
      state: input.state,
      workUnitId,
      capabilityManifest: input.capabilityManifest,
    });
    if (candidateIds.length === 1) {
      input.state.capabilitySelectionsByWorkUnitId[workUnitId] = {
        workUnitId,
        selectedCapabilityId: candidateIds[0],
        consideredCapabilityIds: candidateIds,
        utilityRationale:
          "Runtime auto-bound the only legal scheduler capability candidate for this work unit.",
        costRationale:
          "No semantic model choice was required because exactly one legal candidate remained.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
      reasonCodes.push(`scheduler_capability_runtime_auto_bound:${workUnitId}:${candidateIds[0]}`);
    }
  }
  const hydratedContracts = hydrateSchedulerNodeContractsFromWorkUnits(input.state);
  reasonCodes.push(
    ...hydratedContracts.map((id) => `scheduler_node_contract_runtime_hydrated:${id}`),
  );
  reasonCodes.push(...hydrateSchedulerDependencyOrderingFromDraft(input.state));
  return uniqueStrings(reasonCodes);
}

function applySchedulerToolCallToDraft(input: {
  draft: SchedulerDraftState;
  call: SchedulerStageToolCall;
  requirementInventory: SchedulerRequirementInventory | null;
}): string[] {
  const toolId = input.call.toolId;
  const body = input.call.input;
  const workUnitId = unknownString(body.workUnitId ?? body.unitId ?? body.id);
  const reasonCodes = [`scheduler_staged_small_verb_applied:${toolId}`];
  if (toolId === "scheduler.open_work_unit_from_requirement") {
    const requirementId = unknownString(body.requirementId ?? body.sourceRequirementId);
    const requirement = schedulerRequirementById(input.requirementInventory, requirementId);
    if (!requirement) {
      return [...reasonCodes, "scheduler_open_work_unit_requirement_ref_missing"];
    }
    const patch = schedulerWorkUnitPatchFromRequirement({ requirement, body });
    upsertSchedulerDraftRecord({
      target: input.draft.workBreakdownUnitsById,
      workUnitId: unknownString(patch.workUnitId),
      patch,
    });
    return reasonCodes;
  }
  if (toolId === "scheduler.open_work_units_from_requirements") {
    const requirementIds = schedulerRequirementIdsFromBody(body);
    const requirements = requirementIds
      .map((requirementId) => schedulerRequirementById(input.requirementInventory, requirementId))
      .filter((requirement): requirement is SchedulerRequirementInventory["requirements"][number] =>
        Boolean(requirement),
      );
    if (requirements.length === 0) {
      return [...reasonCodes, "scheduler_open_work_units_requirement_refs_missing"];
    }
    for (const requirement of requirements) {
      const patch = schedulerWorkUnitPatchFromRequirement({
        requirement,
        body: {
          ...body,
          workUnitId:
            unknownRecord(body.workUnitIdsByRequirementId)[requirement.requirementId] ??
            schedulerWorkUnitIdForRequirement(requirement.requirementId),
        },
      });
      upsertSchedulerDraftRecord({
        target: input.draft.workBreakdownUnitsById,
        workUnitId: unknownString(patch.workUnitId),
        patch,
      });
    }
    return uniqueStrings([
      ...reasonCodes,
      ...requirements.map(
        (requirement) => `scheduler_work_unit_batch_opened:${requirement.requirementId}`,
      ),
    ]);
  }
  if (toolId === "scheduler.group_requirements_into_work_unit") {
    const requirementIds = schedulerRequirementIdsFromBody(body);
    const requirements = requirementIds
      .map((requirementId) => schedulerRequirementById(input.requirementInventory, requirementId))
      .filter((requirement): requirement is SchedulerRequirementInventory["requirements"][number] =>
        Boolean(requirement),
      );
    if (requirements.length === 0) {
      return [...reasonCodes, "scheduler_group_requirements_refs_missing"];
    }
    const patch = schedulerCombinedWorkUnitPatchFromRequirements({ requirements, body });
    upsertSchedulerDraftRecord({
      target: input.draft.workBreakdownUnitsById,
      workUnitId: unknownString(patch.workUnitId),
      patch,
    });
    return uniqueStrings([
      ...reasonCodes,
      ...requirements.map(
        (requirement) => `scheduler_work_unit_grouped_requirement:${requirement.requirementId}`,
      ),
    ]);
  }
  if (toolId === "scheduler.mark_requirement_covered_by_work_unit") {
    const requirementIds = schedulerRequirementIdsFromBody(body);
    const coveredRequirementIds = requirementIds.filter((requirementId) =>
      Boolean(schedulerRequirementById(input.requirementInventory, requirementId)),
    );
    if (!workUnitId || !input.draft.workBreakdownUnitsById[workUnitId]) {
      return [...reasonCodes, "scheduler_mark_requirement_covered_work_unit_ref_missing"];
    }
    if (coveredRequirementIds.length === 0) {
      return [...reasonCodes, "scheduler_mark_requirement_covered_requirement_ref_missing"];
    }
    const existing = input.draft.workBreakdownUnitsById[workUnitId] ?? {};
    const requirements = coveredRequirementIds
      .map((requirementId) => schedulerRequirementById(input.requirementInventory, requirementId))
      .filter((requirement): requirement is SchedulerRequirementInventory["requirements"][number] =>
        Boolean(requirement),
      );
    upsertSchedulerDraftRecord({
      target: input.draft.workBreakdownUnitsById,
      workUnitId,
      patch: {
        requirementIds: uniqueStrings([
          ...unknownStringArray(existing.requirementIds),
          ...coveredRequirementIds,
        ]),
        commitmentIds: uniqueStrings([
          ...unknownStringArray(existing.commitmentIds),
          ...requirements.flatMap((requirement) => requirement.commitmentIds),
        ]),
        successCriteria: uniqueStrings([
          ...unknownStringArray(existing.successCriteria),
          ...requirements.map((requirement) => requirement.successCondition),
        ]),
      },
    });
    return uniqueStrings([
      ...reasonCodes,
      ...coveredRequirementIds.map(
        (requirementId) => `scheduler_requirement_marked_covered:${requirementId}`,
      ),
    ]);
  }
  if (toolId === "scheduler.set_decision") {
    input.draft.decisionId = unknownString(body.decisionId) || input.draft.decisionId;
    input.draft.rationaleForDecision =
      unknownString(body.rationaleForDecision ?? body.rationale) ||
      input.draft.rationaleForDecision;
    input.draft.reasonCodes = uniqueStrings([
      ...input.draft.reasonCodes,
      ...unknownStringArray(body.reasonCodes),
    ]);
    return reasonCodes;
  }
  if (toolId === "scheduler.add_work_unit" || toolId === "scheduler.patch_work_unit") {
    if (workUnitId) {
      upsertSchedulerDraftRecord({
        target: input.draft.workBreakdownUnitsById,
        workUnitId,
        patch: body,
      });
    }
    return reasonCodes;
  }
  if (toolId === "scheduler.split_requirement_work") {
    const requirementId = unknownString(body.requirementId);
    const workUnits = Array.isArray(body.workUnits) ? body.workUnits : [];
    for (const unit of workUnits) {
      const record = unknownRecord(unit);
      const splitWorkUnitId = unknownString(record.workUnitId ?? record.unitId ?? record.id);
      if (!splitWorkUnitId) {
        continue;
      }
      upsertSchedulerDraftRecord({
        target: input.draft.workBreakdownUnitsById,
        workUnitId: splitWorkUnitId,
        patch: {
          ...record,
          requirementIds: uniqueStrings([
            ...unknownStringArray(record.requirementIds),
            requirementId,
          ]).filter(Boolean),
          splitRationale:
            unknownString(record.splitRationale ?? body.splitRationale ?? body.rationale) ||
            "Model-authored requirement split.",
        },
      });
    }
    return reasonCodes;
  }
  if (toolId === "scheduler.patch_work_unit_commitment_ids" && workUnitId) {
    upsertSchedulerDraftRecord({
      target: input.draft.workBreakdownUnitsById,
      workUnitId,
      patch: { commitmentIds: unknownStringArray(body.commitmentIds) },
    });
    return reasonCodes;
  }
  if (toolId === "scheduler.patch_work_unit_execution_intent" && workUnitId) {
    upsertSchedulerDraftRecord({
      target: input.draft.workBreakdownUnitsById,
      workUnitId,
      patch: { executionIntent: unknownString(body.executionIntent) },
    });
    return reasonCodes;
  }
  if (toolId === "scheduler.replace_work_unit_commitment_ids" && workUnitId) {
    upsertSchedulerDraftRecord({
      target: input.draft.workBreakdownUnitsById,
      workUnitId,
      patch: { commitmentIds: unknownStringArray(body.commitmentIds) },
    });
    return reasonCodes;
  }
  if (toolId === "scheduler.add_target_subject_ref" && workUnitId) {
    const existing = unknownStringArray(
      input.draft.workBreakdownUnitsById[workUnitId]?.targetSubjectRefs,
    );
    const targetSubjectRefs = uniqueStrings([
      ...existing,
      ...unknownStringArray(body.targetSubjectRefs),
      unknownString(body.targetSubjectRef),
    ]).filter(Boolean);
    upsertSchedulerDraftRecord({
      target: input.draft.workBreakdownUnitsById,
      workUnitId,
      patch: { targetSubjectRefs },
    });
    return reasonCodes;
  }
  if (toolId === "scheduler.retire_work_unit" && workUnitId) {
    retireSchedulerDraftWorkUnit(input.draft, workUnitId);
    return reasonCodes;
  }
  if (toolId === "scheduler.merge_work_units") {
    const sourceWorkUnitId = unknownString(body.sourceWorkUnitId ?? body.sourceUnitId);
    const targetWorkUnitId = unknownString(body.targetWorkUnitId ?? body.targetUnitId);
    if (!sourceWorkUnitId || !targetWorkUnitId || sourceWorkUnitId === targetWorkUnitId) {
      return [...reasonCodes, "scheduler_staged_merge_work_units_invalid_refs"];
    }
    const sourceWorkUnit = input.draft.workBreakdownUnitsById[sourceWorkUnitId];
    const targetWorkUnit = input.draft.workBreakdownUnitsById[targetWorkUnitId];
    if (!sourceWorkUnit || !targetWorkUnit) {
      return [...reasonCodes, "scheduler_staged_merge_work_units_ref_missing"];
    }
    input.draft.workBreakdownUnitsById[targetWorkUnitId] = {
      ...mergeSchedulerDraftRecords(targetWorkUnit, sourceWorkUnit),
      workUnitId: targetWorkUnitId,
    };
    const sourceSelection = input.draft.capabilitySelectionsByWorkUnitId[sourceWorkUnitId];
    const targetSelection = input.draft.capabilitySelectionsByWorkUnitId[targetWorkUnitId];
    if (sourceSelection || targetSelection) {
      input.draft.capabilitySelectionsByWorkUnitId[targetWorkUnitId] = {
        ...mergeSchedulerDraftRecords(targetSelection ?? {}, sourceSelection ?? {}),
        workUnitId: targetWorkUnitId,
      };
    }
    const sourceContract = input.draft.nodeContractDraftsByWorkUnitId[sourceWorkUnitId];
    const targetContract = input.draft.nodeContractDraftsByWorkUnitId[targetWorkUnitId];
    if (sourceContract || targetContract) {
      input.draft.nodeContractDraftsByWorkUnitId[targetWorkUnitId] = {
        ...mergeSchedulerDraftRecords(targetContract ?? {}, sourceContract ?? {}),
        workUnitId: targetWorkUnitId,
      };
    }
    replaceSchedulerDraftWorkUnitRef(input.draft, sourceWorkUnitId, targetWorkUnitId);
    retireSchedulerDraftWorkUnit(input.draft, sourceWorkUnitId);
    return reasonCodes;
  }
  if (toolId === "scheduler.mark_distinct_work_unit" && workUnitId) {
    upsertSchedulerDraftRecord({
      target: input.draft.capabilitySelectionsByWorkUnitId,
      workUnitId,
      patch: {
        duplicateDisposition: "distinct",
        whyThisIsNotDuplicateWork:
          unknownString(body.whyThisIsNotDuplicateWork ?? body.rationale) ||
          "Model marked this duplicate-shaped scheduler work unit as structurally distinct.",
      },
    });
    return reasonCodes;
  }
  if (
    toolId === "scheduler.add_capability_selection" ||
    toolId === "scheduler.patch_capability_selection"
  ) {
    if (workUnitId) {
      upsertSchedulerDraftRecord({
        target: input.draft.capabilitySelectionsByWorkUnitId,
        workUnitId,
        patch: body,
      });
    }
    return reasonCodes;
  }
  if (toolId === "scheduler.add_node_contract" || toolId === "scheduler.patch_node_contract") {
    if (workUnitId) {
      const hydratedBase = schedulerNodeContractFromWorkUnit({
        workUnit: input.draft.workBreakdownUnitsById[workUnitId] ?? { workUnitId },
        selection: input.draft.capabilitySelectionsByWorkUnitId[workUnitId] ?? null,
      });
      upsertSchedulerDraftRecord({
        target: input.draft.nodeContractDraftsByWorkUnitId,
        workUnitId,
        patch: { ...hydratedBase, ...body },
      });
    }
    return reasonCodes;
  }
  if (toolId === "scheduler.patch_edge_or_parallelism") {
    input.draft.edgeOrParallelismDraft = {
      ...input.draft.edgeOrParallelismDraft,
      ...(Array.isArray(body.edges) ? { edges: body.edges } : {}),
      ...(unknownString(body.parallelIndependentNodesJustification)
        ? {
            parallelIndependentNodesJustification: unknownString(
              body.parallelIndependentNodesJustification,
            ),
          }
        : {}),
    };
    return reasonCodes;
  }
  return [`scheduler_staged_small_verb_ignored:${toolId}`];
}

export function applySchedulerStageToolResults(input: {
  baseDraft: SchedulerDraftState;
  toolCalls: readonly SchedulerStageToolCall[];
  requirementInventory: SchedulerRequirementInventory | null;
  maxToolCalls?: number;
  allowedToolIds?: readonly SchedulerStageSmallVerbToolId[];
}): SchedulerDraftPatchResult {
  const calls = input.toolCalls;
  if (calls.length > 0) {
    const draft = cloneSchedulerDraftState(input.baseDraft);
    const reasonCodes: string[] = [];
    const rejectedToolIds: string[] = [];
    const maxToolCalls = Math.max(1, input.maxToolCalls ?? calls.length);
    const selectedCalls = calls.slice(0, maxToolCalls);
    const omittedToolCallCount = Math.max(0, calls.length - selectedCalls.length);
    const appliedToolIds: string[] = [];
    for (const call of selectedCalls) {
      if (
        input.allowedToolIds &&
        !input.allowedToolIds.includes(call.toolId as SchedulerStageSmallVerbToolId)
      ) {
        rejectedToolIds.push(call.toolId);
        reasonCodes.push(
          `scheduler_stage_tool_rejected:${call.toolId}`,
          "scheduler_stage_tool_not_allowed",
        );
        continue;
      }
      const callReasonCodes = applySchedulerToolCallToDraft({
        draft,
        call,
        requirementInventory: input.requirementInventory,
      });
      reasonCodes.push(...callReasonCodes);
      appliedToolIds.push(call.toolId);
      if (
        callReasonCodes.some(
          (code) =>
            code.startsWith("scheduler_staged_small_verb_ignored:") ||
            code.endsWith("_invalid_refs") ||
            code.endsWith("_ref_missing"),
        )
      ) {
        rejectedToolIds.push(call.toolId);
      }
    }
    return {
      draft,
      modelToolCallCount: calls.length,
      appliedToolIds,
      rejectedToolIds: uniqueStrings(rejectedToolIds),
      omittedToolCallCount,
      reasonCodes: uniqueStrings([
        ...reasonCodes,
        ...(omittedToolCallCount > 0
          ? [`scheduler_staged_small_verb_calls_omitted_for_bounded_turn:${omittedToolCallCount}`]
          : []),
      ]),
    };
  }
  return {
    draft: cloneSchedulerDraftState(input.baseDraft),
    modelToolCallCount: 0,
    appliedToolIds: [],
    rejectedToolIds: [],
    omittedToolCallCount: 0,
    reasonCodes: ["scheduler_stage_native_tool_calls_missing"],
  };
}

function schedulerWorkUnitCoversRequirement(input: {
  workUnit: Record<string, unknown>;
  requirement: SchedulerRequirementInventory["requirements"][number];
}): boolean {
  const requirementIds = uniqueStrings([
    ...unknownStringArray(input.workUnit.requirementIds),
    unknownString(input.workUnit.requirementId),
    unknownString(input.workUnit.sourceRequirementId),
  ]);
  if (requirementIds.includes(input.requirement.requirementId)) {
    return true;
  }
  if (requirementIds.length > 0) {
    return false;
  }
  const workUnitCommitmentIds = unknownStringArray(input.workUnit.commitmentIds);
  return (
    input.requirement.commitmentIds.length > 0 &&
    input.requirement.commitmentIds.every((commitmentId) =>
      workUnitCommitmentIds.includes(commitmentId),
    )
  );
}

function schedulerDraftCoveredRunnableRequirementIds(input: {
  state: SchedulerDraftState;
  requirementInventory: SchedulerRequirementInventory | null;
}): string[] {
  const workUnits = Object.values(input.state.workBreakdownUnitsById);
  return schedulerVisibleRequirements(input.requirementInventory)
    .filter((requirement) =>
      workUnits.some((workUnit) =>
        schedulerWorkUnitCoversRequirement({
          workUnit,
          requirement,
        }),
      ),
    )
    .map((requirement) => requirement.requirementId);
}

function schedulerDraftWorkUnitMissingStructuralFields(
  workUnit: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  if (!unknownString(workUnit.workUnitId)) {
    missing.push("workUnitId");
  }
  if (!unknownString(workUnit.objective ?? workUnit.title)) {
    missing.push("objective");
  }
  if (!unknownString(workUnit.executionIntent)) {
    missing.push("executionIntent");
  }
  if (unknownStringArray(workUnit.commitmentIds).length === 0) {
    missing.push("commitmentIds");
  }
  if (
    !unknownString(workUnit.expectedOutcome) &&
    !unknownString(workUnit.expectedOutput) &&
    unknownStringArray(workUnit.successCriteria).length === 0
  ) {
    missing.push("expectedOutcome_or_successCriteria");
  }
  return missing;
}

function schedulerDraftDuplicateWorkUnitSignatures(state: SchedulerDraftState): string[] {
  const bySignature = new Map<string, string[]>();
  for (const workUnit of Object.values(state.workBreakdownUnitsById)) {
    const workUnitId = unknownString(workUnit.workUnitId);
    if (!workUnitId) {
      continue;
    }
    const capabilitySelection = state.capabilitySelectionsByWorkUnitId[workUnitId] ?? {};
    if (unknownString(capabilitySelection.duplicateDisposition) === "distinct") {
      continue;
    }
    const signature = [
      unknownString(workUnit.executionIntent),
      unknownStringArray(workUnit.commitmentIds).toSorted().join(","),
      unknownStringArray(workUnit.targetSubjectRefs).toSorted().join(","),
    ].join("|");
    const existing = bySignature.get(signature) ?? [];
    existing.push(workUnitId);
    bySignature.set(signature, existing);
  }
  return [...bySignature.entries()]
    .filter(([signature, workUnitIds]) => signature !== "||" && workUnitIds.length > 1)
    .map(([signature, workUnitIds]) => `${signature}:${workUnitIds.toSorted().join(",")}`);
}

function schedulerDraftMissingCapabilityWorkUnitIds(state: SchedulerDraftState): string[] {
  return schedulerDraftWorkUnitIds(state).filter((workUnitId) => {
    const selection = state.capabilitySelectionsByWorkUnitId[workUnitId] ?? {};
    return !unknownString(selection.selectedCapabilityId ?? selection.capabilityId);
  });
}

function schedulerDraftMissingContractWorkUnitIds(state: SchedulerDraftState): string[] {
  return schedulerDraftWorkUnitIds(state).filter((workUnitId) => {
    const contract = state.nodeContractDraftsByWorkUnitId[workUnitId] ?? null;
    return !schedulerNodeContractStructurallyComplete(contract);
  });
}

function schedulerDraftDependencyOrderingComplete(state: SchedulerDraftState): boolean {
  const workUnitIds = schedulerDraftWorkUnitIds(state);
  if (workUnitIds.length <= 1) {
    return true;
  }
  if (schedulerMissingDependencyWorkUnitIds(state).length > 0) {
    return false;
  }
  const edges = Array.isArray(state.edgeOrParallelismDraft.edges)
    ? state.edgeOrParallelismDraft.edges
    : [];
  if (edges.length > 0) {
    return true;
  }
  return Boolean(unknownString(state.edgeOrParallelismDraft.parallelIndependentNodesJustification));
}

export function evaluateSchedulerStage(input: {
  state: SchedulerDraftState;
  requirementInventory: SchedulerRequirementInventory | null;
  postCompileRepairReasonCodes?: string[];
}): SchedulerStageProjection {
  const postCompileRepairReasonCodes = (input.postCompileRepairReasonCodes ?? []).filter(
    (code) => !isSchedulerAcceptedTraceReasonCode(code),
  );
  const activeWorkUnitIds = schedulerDraftWorkUnitIds(input.state);
  const runnableRequirementIds = schedulerVisibleRequirements(input.requirementInventory).map(
    (requirement) => requirement.requirementId,
  );
  const coveredRunnableRequirementIds = schedulerDraftCoveredRunnableRequirementIds(input);
  const uncoveredRunnableRequirementIds = runnableRequirementIds.filter(
    (requirementId) => !coveredRunnableRequirementIds.includes(requirementId),
  );
  const incompleteWorkUnitIds = activeWorkUnitIds.filter(
    (workUnitId) =>
      schedulerDraftWorkUnitMissingStructuralFields(
        input.state.workBreakdownUnitsById[workUnitId] ?? {},
      ).length > 0,
  );
  const duplicateWorkUnitSignatures = schedulerDraftDuplicateWorkUnitSignatures(input.state);
  const workUnitCoverageComplete =
    activeWorkUnitIds.length > 0 &&
    uncoveredRunnableRequirementIds.length === 0 &&
    incompleteWorkUnitIds.length === 0 &&
    duplicateWorkUnitSignatures.length === 0;
  const missingCapabilityWorkUnitIds = schedulerDraftMissingCapabilityWorkUnitIds(input.state);
  const missingContractWorkUnitIds = schedulerDraftMissingContractWorkUnitIds(input.state);
  const missingDependencyWorkUnitIds = schedulerMissingDependencyWorkUnitIds(input.state);
  const dependencyOrderingComplete = schedulerDraftDependencyOrderingComplete(input.state);

  let phase: SchedulerStagePhase;
  let allowedToolIds: SchedulerStageSmallVerbToolId[];
  const reasonCodes: string[] = [];
  if (!workUnitCoverageComplete) {
    phase = "work_unit_coverage_required";
    allowedToolIds = uniqueStrings([
      ...(uncoveredRunnableRequirementIds.length > 0
        ? ([
            "scheduler.open_work_units_from_requirements",
            "scheduler.group_requirements_into_work_unit",
            "scheduler.open_work_unit_from_requirement",
            "scheduler.mark_requirement_covered_by_work_unit",
            "scheduler.add_work_unit",
            "scheduler.split_requirement_work",
          ] as SchedulerStageSmallVerbToolId[])
        : []),
      ...(incompleteWorkUnitIds.length > 0
        ? ([
            "scheduler.patch_work_unit",
            "scheduler.replace_work_unit_commitment_ids",
            "scheduler.add_target_subject_ref",
          ] as SchedulerStageSmallVerbToolId[])
        : []),
      ...(duplicateWorkUnitSignatures.length > 0
        ? ([
            "scheduler.merge_work_units",
            "scheduler.retire_work_unit",
            "scheduler.replace_work_unit_commitment_ids",
            "scheduler.add_target_subject_ref",
            "scheduler.mark_distinct_work_unit",
          ] as SchedulerStageSmallVerbToolId[])
        : []),
    ]) as SchedulerStageSmallVerbToolId[];
    reasonCodes.push(
      "scheduler_phase_work_unit_coverage_required",
      ...uncoveredRunnableRequirementIds.map(
        (requirementId) => `scheduler_work_unit_requirement_uncovered:${requirementId}`,
      ),
      ...incompleteWorkUnitIds.map(
        (workUnitId) => `scheduler_work_unit_structural_fields_missing:${workUnitId}`,
      ),
      ...duplicateWorkUnitSignatures.map(
        (signature) => `scheduler_work_unit_duplicate_signature:${signature}`,
      ),
    );
  } else if (missingCapabilityWorkUnitIds.length > 0) {
    phase = "capability_selection_required";
    allowedToolIds = ["scheduler.add_capability_selection", "scheduler.patch_capability_selection"];
    reasonCodes.push(
      "scheduler_phase_capability_selection_required",
      ...missingCapabilityWorkUnitIds.map(
        (workUnitId) => `scheduler_capability_selection_missing:${workUnitId}`,
      ),
    );
  } else if (missingContractWorkUnitIds.length > 0) {
    phase = "node_contracts_required";
    allowedToolIds = ["scheduler.add_node_contract", "scheduler.patch_node_contract"];
    reasonCodes.push(
      "scheduler_phase_node_contracts_required",
      ...missingContractWorkUnitIds.map(
        (workUnitId) => `scheduler_node_contract_missing:${workUnitId}`,
      ),
    );
  } else if (!dependencyOrderingComplete) {
    phase = "dependency_ordering_required";
    allowedToolIds = ["scheduler.patch_edge_or_parallelism"];
    reasonCodes.push(
      "scheduler_phase_dependency_ordering_required",
      ...missingDependencyWorkUnitIds.map((workUnitId) => {
        const intent = schedulerWorkUnitExecutionIntent(input.state, workUnitId);
        if (intent === "validation") {
          return `scheduler_validation_dependency_missing:${workUnitId}`;
        }
        if (intent === "review" || intent === "readback") {
          return `scheduler_review_dependency_missing:${workUnitId}`;
        }
        if (intent === "closeout") {
          return `scheduler_closeout_dependency_missing:${workUnitId}`;
        }
        return `scheduler_downstream_dependency_missing:${workUnitId}`;
      }),
    );
  } else if (postCompileRepairReasonCodes.length > 0) {
    phase = "compiled_graph_policy_repair_required";
    const repairReasonCodes = postCompileRepairReasonCodes;
    allowedToolIds = uniqueStrings([
      ...(repairReasonCodes.some(
        (code) => code.includes("commitment") || code.includes("target_commitments"),
      )
        ? ([
            "scheduler.patch_work_unit_commitment_ids",
            "scheduler.replace_work_unit_commitment_ids",
          ] as SchedulerStageSmallVerbToolId[])
        : []),
      ...(repairReasonCodes.some(
        (code) =>
          code.includes("edge") ||
          code.includes("parallel") ||
          code.includes("dependency_missing") ||
          code.includes("post_work_dependency"),
      )
        ? ([
            "scheduler.patch_edge_or_parallelism",
            "scheduler.patch_edge_or_parallelism",
          ] as SchedulerStageSmallVerbToolId[])
        : []),
      ...(repairReasonCodes.some(
        (code) => code.includes("qualification") || code.includes("capability"),
      )
        ? ([
            "scheduler.patch_capability_selection",
            "scheduler.add_capability_selection",
          ] as SchedulerStageSmallVerbToolId[])
        : []),
      ...(repairReasonCodes.some(
        (code) =>
          code.includes("execution_intent") ||
          code.includes("executionIntent") ||
          code.includes("required_model_field_missing"),
      )
        ? ([
            "scheduler.patch_work_unit_execution_intent",
            "scheduler.patch_work_unit",
            "scheduler.patch_node_contract",
            "scheduler.patch_capability_selection",
          ] as SchedulerStageSmallVerbToolId[])
        : []),
      ...(repairReasonCodes.some((code) => code.includes("decision_new_nodes_missing"))
        ? ([
            "scheduler.patch_work_unit",
            "scheduler.add_work_unit",
          ] as SchedulerStageSmallVerbToolId[])
        : []),
    ]) as SchedulerStageSmallVerbToolId[];
    if (allowedToolIds.length === 0) {
      allowedToolIds = ["scheduler.patch_work_unit"];
    }
    reasonCodes.push(
      "scheduler_phase_compiled_graph_policy_repair_required",
      ...repairReasonCodes
        .slice(0, 20)
        .map((code) => `scheduler_compiled_graph_policy_repair:${code}`),
    );
  } else {
    phase = "compiled_graph_ready";
    allowedToolIds = [];
    reasonCodes.push("scheduler_phase_compiled_graph_ready");
  }
  return {
    phase,
    allowedToolIds,
    reasonCodes: uniqueStrings(reasonCodes),
    missingRequirementIds: uncoveredRunnableRequirementIds,
    uncoveredRunnableRequirementIds,
    missingCapabilityWorkUnitIds,
    missingContractWorkUnitIds,
    missingDependencyWorkUnitIds,
    duplicateWorkUnitSignatures,
    activeWorkUnitIds,
    runnableRequirementIds,
    canCompile: phase === "compiled_graph_ready",
  };
}

export function schedulerStageProjectionForModel(projection: SchedulerStageProjection): JsonValue {
  return {
    phase: projection.phase,
    allowedToolIds: projection.allowedToolIds,
    reasonCodes: projection.reasonCodes.slice(0, 40),
    missingRequirementIds: projection.missingRequirementIds.slice(0, 40),
    uncoveredRunnableRequirementIds: projection.uncoveredRunnableRequirementIds.slice(0, 40),
    missingCapabilityWorkUnitIds: projection.missingCapabilityWorkUnitIds.slice(0, 40),
    missingContractWorkUnitIds: projection.missingContractWorkUnitIds.slice(0, 40),
    missingDependencyWorkUnitIds: projection.missingDependencyWorkUnitIds.slice(0, 40),
    duplicateWorkUnitSignatures: projection.duplicateWorkUnitSignatures.slice(0, 20),
    activeWorkUnitIds: projection.activeWorkUnitIds.slice(0, 80),
    runnableRequirementIds: projection.runnableRequirementIds.slice(0, 80),
    canCompile: projection.canCompile,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function schedulerDraftStateForModel(state: SchedulerDraftState): JsonValue {
  return {
    decisionId: state.decisionId,
    workUnits: Object.values(state.workBreakdownUnitsById).map((workUnit) => ({
      workUnitId: unknownString(workUnit.workUnitId),
      objective: unknownString(workUnit.objective ?? workUnit.title),
      executionIntent: unknownString(workUnit.executionIntent),
      commitmentIds: unknownStringArray(workUnit.commitmentIds).slice(0, 20),
      expectedOutcome: unknownString(workUnit.expectedOutcome ?? workUnit.expectedOutput),
      successCriteria: unknownStringArray(workUnit.successCriteria).slice(0, 12),
      targetSubjectRefs: unknownStringArray(workUnit.targetSubjectRefs).slice(0, 20),
      inputRefs: unknownStringArray(workUnit.inputRefs).slice(0, 20),
      sourceMaterialRequirementKinds: unknownStringArray(
        workUnit.sourceMaterialRequirementKinds,
      ).slice(0, 12),
      dependencyWorkUnitIds: schedulerIncomingDependencyWorkUnitIds(
        state,
        unknownString(workUnit.workUnitId),
      ).slice(0, 20),
      capabilityHints: unknownStringArray(workUnit.capabilityHints).slice(0, 12),
      rawPromptStored: false,
      rawResponseStored: false,
    })),
    capabilitySelections: Object.values(state.capabilitySelectionsByWorkUnitId).map(
      (selection) => ({
        workUnitId: unknownString(selection.workUnitId),
        selectedCapabilityId: unknownString(
          selection.selectedCapabilityId ?? selection.capabilityId,
        ),
        duplicateDisposition: unknownString(selection.duplicateDisposition),
        rawPromptStored: false,
        rawResponseStored: false,
      }),
    ),
    nodeContractWorkUnitIds: Object.keys(state.nodeContractDraftsByWorkUnitId).toSorted(),
    edgeOrParallelismDraft: {
      edgeCount: Array.isArray(state.edgeOrParallelismDraft.edges)
        ? state.edgeOrParallelismDraft.edges.length
        : 0,
      edges: schedulerDraftEdges(state)
        .map((edge) => ({
          fromWorkUnitId: unknownString(edge.fromWorkUnitId ?? edge.fromNodeId),
          toWorkUnitId: unknownString(edge.toWorkUnitId ?? edge.toNodeId),
          edgeKind: unknownString(edge.edgeKind),
        }))
        .slice(0, 80),
      parallelIndependentNodesJustification: unknownString(
        state.edgeOrParallelismDraft.parallelIndependentNodesJustification,
      ),
    },
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function schedulerStageMaxToolCalls(projection: SchedulerStageProjection | null): number {
  if (!projection) {
    return 1;
  }
  if (projection.phase === "work_unit_coverage_required") {
    const repairSurfaceCount =
      projection.uncoveredRunnableRequirementIds.length +
      projection.duplicateWorkUnitSignatures.length +
      projection.activeWorkUnitIds.length;
    return Math.max(4, Math.min(32, repairSurfaceCount + 4));
  }
  if (projection.phase === "capability_selection_required") {
    return Math.max(1, Math.min(12, projection.missingCapabilityWorkUnitIds.length));
  }
  if (projection.phase === "dependency_ordering_required") {
    return Math.max(1, Math.min(8, projection.missingDependencyWorkUnitIds.length + 1));
  }
  if (projection.phase === "compiled_graph_policy_repair_required") {
    return 12;
  }
  return 1;
}

export function isSchedulerAcceptedTraceReasonCode(reasonCode: string): boolean {
  if (ACCEPTED_TRACE_REASON_CODES.has(reasonCode)) {
    return true;
  }
  for (const prefix of ACCEPTED_TRACE_REASON_CODE_PREFIXES) {
    if (reasonCode.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function isSchedulerBlockingReasonCode(reasonCode: string): boolean {
  if (isSchedulerAcceptedTraceReasonCode(reasonCode)) {
    return false;
  }
  return BLOCKING_REASON_CODE_MARKERS.some((marker) => reasonCode.includes(marker));
}

function schedulerGraphPatchDiagnosticIsModelRepairable(reasonCode: string): boolean {
  return ![
    "scheduler_graph_admission_",
    "scheduler_graph_patch_tail_capability_missing_or_unknown:",
    "scheduler_graph_patch_mission_tail_",
  ].some((prefix) => reasonCode.startsWith(prefix));
}

function affectedWorkUnitIdsFromReasonCode(reasonCode: string): string[] {
  const matches = reasonCode.match(/\bwu-[a-zA-Z0-9_-]+/gu) ?? [];
  return [...new Set(matches)];
}

function affectedRequirementIdsFromReasonCode(reasonCode: string): string[] {
  const matches = reasonCode.match(/\bobl(?:igation)?-[a-zA-Z0-9_-]+/giu) ?? [];
  return [...new Set(matches)];
}

function missingFieldPathsFromReasonCode(reasonCode: string): string[] {
  if (!reasonCode.includes("missing") && !reasonCode.includes("required")) {
    return [];
  }
  const [, path] = reasonCode.split(":", 2);
  return path ? [path] : [];
}

function blockerKindForReasonCode(reasonCode: string): SchedulerStageBlockerKind {
  if (reasonCode.includes("provider") || reasonCode.includes("model_call")) {
    return "provider_failure";
  }
  if (reasonCode.includes("no_progress")) {
    return "no_progress";
  }
  if (reasonCode.includes("missing") || reasonCode.includes("required")) {
    return "missing_scheduler_field";
  }
  return "policy_failure";
}

export function classifySchedulerCompiledGraphOutcome(input: {
  compiledReasonCodes: string[];
  validationReasonCodes: string[];
  policyReasonCodes: string[];
  utilityPolicyReasonCodes: string[];
  genericStagedPolicyReasonCodes: string[];
  validationNodePhaseReasonCodes: string[];
  needsReviewRetryPolicyReasonCodes: string[];
}): SchedulerCompiledGraphClassification {
  const allReasonCodes = [
    ...input.compiledReasonCodes,
    ...input.validationReasonCodes,
    ...input.policyReasonCodes,
    ...input.utilityPolicyReasonCodes,
    ...input.genericStagedPolicyReasonCodes,
    ...input.validationNodePhaseReasonCodes,
    ...input.needsReviewRetryPolicyReasonCodes,
  ].filter((code) => typeof code === "string" && code.trim().length > 0);
  const acceptedTraceCodes = [
    ...new Set(allReasonCodes.filter(isSchedulerAcceptedTraceReasonCode)),
  ];
  const blockingReasonCodes = [...new Set(allReasonCodes.filter(isSchedulerBlockingReasonCode))];
  const blockingDiagnostics = blockingReasonCodes.map((reasonCode) => ({
    blockerKind: blockerKindForReasonCode(reasonCode),
    reasonCode,
    affectedWorkUnitIds: affectedWorkUnitIdsFromReasonCode(reasonCode),
    affectedRequirementIds: affectedRequirementIdsFromReasonCode(reasonCode),
    missingFieldPaths: missingFieldPathsFromReasonCode(reasonCode),
    policyRuleId: reasonCode.split(":")[0] || null,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
  }));
  return {
    acceptedTraceCodes,
    blockingDiagnostics,
    blockingReasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function schedulerTypedNoProgressSignature(input: {
  phase: string;
  blockingDiagnostics: SchedulerStageBlockingDiagnostic[];
}): string {
  return JSON.stringify({
    phase: input.phase,
    blockers: input.blockingDiagnostics.map((diagnostic) => ({
      blockerKind: diagnostic.blockerKind,
      reasonCode: diagnostic.reasonCode,
      affectedWorkUnitIds: diagnostic.affectedWorkUnitIds,
      affectedRequirementIds: diagnostic.affectedRequirementIds,
      missingFieldPaths: diagnostic.missingFieldPaths,
      policyRuleId: diagnostic.policyRuleId,
    })),
  });
}

export function schedulerStageProgressSignature(projection: SchedulerStageProjection): string {
  const classification = classifySchedulerCompiledGraphOutcome({
    compiledReasonCodes: [],
    validationReasonCodes: [],
    policyReasonCodes: projection.reasonCodes,
    utilityPolicyReasonCodes: [],
    genericStagedPolicyReasonCodes: [],
    validationNodePhaseReasonCodes: [],
    needsReviewRetryPolicyReasonCodes: [],
  });
  return schedulerTypedNoProgressSignature({
    phase: projection.phase,
    blockingDiagnostics: [
      ...classification.blockingDiagnostics,
      {
        blockerKind: "missing_scheduler_field",
        reasonCode: `coverage_state:${stableJson({
          uncoveredRunnableRequirementIds: projection.uncoveredRunnableRequirementIds,
          missingCapabilityWorkUnitIds: projection.missingCapabilityWorkUnitIds,
          missingContractWorkUnitIds: projection.missingContractWorkUnitIds,
          missingDependencyWorkUnitIds: projection.missingDependencyWorkUnitIds,
          duplicateWorkUnitSignatures: projection.duplicateWorkUnitSignatures,
          activeWorkUnitIds: projection.activeWorkUnitIds,
        })}`,
        affectedWorkUnitIds: projection.activeWorkUnitIds,
        affectedRequirementIds: projection.uncoveredRunnableRequirementIds,
        missingFieldPaths: [],
        policyRuleId: "scheduler_stage_coverage_delta",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    ],
  });
}

function schedulerNativeSystemPrompt(phase: SchedulerStagePhase): string {
  return [
    "You are the OpenClaw SchedulerStageRunner native tool phase executor.",
    "Call one or more visible scheduler provider tools when they belong to this same runner-owned semantic phase. Do not return prose. Do not return JSON-shaped tool calls. Do not return a draft graph.",
    `Current scheduler phase: ${phase}. Only tools visible in this phase are legal.`,
    "Runtime owns the graph patch state, applies native tool calls, compiles SchedulerGraphPatch node seeds, validates policy, and decides the next phase.",
    "work_unit_coverage_required: cover the full scheduler-visible core RequirementMap inventory. Use visible scheduler work-unit tools for separate implementation/test-authoring requirements or grouped implementation work. Do not author validation, review, or closeout work units; the SchedulerGraphPatch compiler derives those mission-tail nodes from closure policy. Constraints and prompt context are carried as inputs, not executable work units. Do not select capabilities, contracts, dependencies, or submit in this phase.",
    "capability_selection_required: choose the cheapest sufficiently capable runtime capability for the indicated work unit. Do not author contracts or graph nodes.",
    "node_contracts_required: author or patch worker-facing node contract fields only.",
    "dependency_ordering_required: patch exact non-obvious dependency/parallelism structure between core work units only. Runtime derives mission validation/review/closeout tail ordering.",
    "compiled_graph_policy_repair_required: repair only listed model-owned policy blockers with a visible repair tool. Do not attempt to repair runtime-owned tail creation, tail dependencies, tail capabilities, validation phase, or closure ordering.",
    "Valid executionIntent values are source_grounding, source_edit, validation, review, docs, readback, closeout, and human_decision.",
    "Do not create durable context_scout/context_scout graph nodes. Context discovery is node-local worker demand.",
    "Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
  ].join("\n");
}

function schedulerNativePayload(input: {
  graphId: string;
  iteration: number;
  projection: SchedulerStageProjection;
  draft: SchedulerDraftState;
  repairAttempt: number;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  requirementMapSummary: RequirementMapSummary | null;
  requirementInventorySummary: JsonValue | null;
  recentNodeResultSummaries: JsonValue[];
  capabilityRegistrySummary: JsonValue | null;
  rejectedDecisionReasonCodes: string[];
  rejectedDecisionDiagnostics: OrchestratorGraphRejectedNodeDiagnostic[];
  rejectedDecisionRef: string | null;
  repairDiagnostics: ModelDecisionRepairRequest | null;
  acceptedDecisionFieldRefs: string[];
  focus?: JsonValue | null;
}): JsonValue {
  return {
    graphId: input.graphId,
    iteration: input.iteration,
    schedulerStagePhase: input.projection.phase,
    schedulerStageState: schedulerStageProjectionForModel(input.projection),
    schedulerStageDraft: schedulerDraftStateForModel(input.draft),
    schedulerFocus: input.focus ?? null,
    schedulerSnapshot: input.snapshotSummary,
    requirementMapSummary: input.requirementMapSummary,
    schedulerIntakeSummary: input.requirementMapSummary ?? input.requirementInventorySummary,
    recentNodeResultSummaries: input.recentNodeResultSummaries.slice(-8),
    runtimeNodeCapabilityManifest: input.capabilityRegistrySummary,
    repairAttempt: input.repairAttempt,
    rejectedDecisionReasonCodes: input.rejectedDecisionReasonCodes.slice(0, 40),
    rejectedDecisionDiagnostics: input.rejectedDecisionDiagnostics.slice(0, 8),
    rejectedDecisionRef: input.rejectedDecisionRef,
    repairDiagnostics: input.repairDiagnostics,
    acceptedDecisionFieldRefs: input.acceptedDecisionFieldRefs.slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  } as JsonValue;
}

function schedulerNativeToolCallStage(phase: SchedulerStagePhase): string {
  if (phase === "capability_selection_required") {
    return "scheduler_capability_selection_native_tool";
  }
  if (phase === "compiled_graph_policy_repair_required") {
    return "scheduler_compiled_graph_policy_native_tool";
  }
  return "scheduler_orchestrator_native_tool";
}

const SCHEDULER_CODEX_MULTI_TOOL_STAGE_POLICY: SchedulerStageModelPolicy = {
  modelRef: "openai-codex/gpt-5.5",
  providerPath: "codex_app_server",
  taskClass: "global_reasoning",
  maxOutputTokens: 2_000,
  timeoutMs: 900_000,
  reasoningEffort: "high",
  requiredTransport: "native_multi_tool_turn",
  parallelismPolicy: "single_turn_multi_tool",
};

const SCHEDULER_CODEX_REPAIR_STAGE_POLICY: SchedulerStageModelPolicy = {
  modelRef: "openai-codex/gpt-5.5",
  providerPath: "codex_app_server",
  taskClass: "global_reasoning",
  maxOutputTokens: 2_000,
  timeoutMs: 900_000,
  reasoningEffort: "high",
  requiredTransport: "native_single_tool",
  parallelismPolicy: "sequential_repair",
};

const SCHEDULER_QWEN_FOCUSED_FILL_POLICY: SchedulerStageModelPolicy = {
  modelRef: "qwen/qwen3-coder-next",
  providerPath: "openrouter",
  taskClass: "tool_selection",
  maxOutputTokens: 1_800,
  timeoutMs: 120_000,
  reasoningEffort: "none",
  requiredTransport: "native_single_tool",
  parallelismPolicy: "parallel_focused_sessions",
};

export function resolveSchedulerStageModelPolicy(
  phase: SchedulerStagePhase,
): SchedulerStageModelPolicy {
  if (phase === "capability_selection_required") {
    return SCHEDULER_QWEN_FOCUSED_FILL_POLICY;
  }
  if (phase === "compiled_graph_policy_repair_required") {
    return SCHEDULER_CODEX_REPAIR_STAGE_POLICY;
  }
  if (
    phase === "work_unit_coverage_required" ||
    phase === "node_contracts_required" ||
    phase === "dependency_ordering_required"
  ) {
    return SCHEDULER_CODEX_MULTI_TOOL_STAGE_POLICY;
  }
  return SCHEDULER_CODEX_REPAIR_STAGE_POLICY;
}

function schedulerPolicyRepairFocuses(reasonCodes: readonly string[]): JsonValue[] {
  const repairCodes = reasonCodes
    .filter((code) => code.includes("scheduler_compiled_graph_policy_repair:"))
    .slice(0, 12);
  return (repairCodes.length > 0 ? repairCodes : reasonCodes.slice(0, 8)).map(
    (reasonCode, index) =>
      ({
        repairReasonCode: reasonCode,
        batchIndex: index,
        rawPromptStored: false,
        rawResponseStored: false,
      }) as JsonValue,
  );
}

async function schedulerNativeToolCallsForPhase(input: {
  runInput: SchedulerStageRunInput;
  projection: SchedulerStageProjection;
  draft: SchedulerDraftState;
  repairAttempt: number;
  rejectedDecisionReasonCodes: string[];
  rejectedDecisionDiagnostics: OrchestratorGraphRejectedNodeDiagnostic[];
  rejectedDecisionRef: string | null;
  repairDiagnostics: ModelDecisionRepairRequest | null;
  acceptedDecisionFieldRefs: string[];
}): Promise<SchedulerStageToolCall[]> {
  const allowedToolIds = input.projection.allowedToolIds;
  if (allowedToolIds.length === 0) {
    return [];
  }
  const modelPolicy = resolveSchedulerStageModelPolicy(input.projection.phase);
  const buildToolInput = (
    focus: JsonValue | null,
    allowed: readonly SchedulerStageSmallVerbToolId[],
    index: number,
  ): SchedulerStageNativeToolCallInput => {
    return {
      graphId: input.runInput.graphId,
      iteration: input.runInput.iteration,
      repairAttempt: input.repairAttempt,
      phase: input.projection.phase,
      stage: schedulerNativeToolCallStage(input.projection.phase),
      currentObjective:
        input.projection.phase === "compiled_graph_policy_repair_required"
          ? "Repair one or more compiled scheduler graph policy blockers with native scheduler tools."
          : input.projection.phase === "capability_selection_required"
            ? "Fill scheduler capability selections with native scheduler tools."
            : "Call the next scheduler-stage native small verbs.",
      modelRef: modelPolicy.modelRef,
      providerPath: modelPolicy.providerPath,
      systemPrompt: schedulerNativeSystemPrompt(input.projection.phase),
      userPayload: schedulerNativePayload({
        graphId: input.runInput.graphId,
        iteration: input.runInput.iteration,
        projection: input.projection,
        draft: input.draft,
        repairAttempt: input.repairAttempt,
        snapshotSummary: input.runInput.snapshotSummary,
        requirementMapSummary: input.runInput.requirementMapSummary,
        requirementInventorySummary: input.runInput.requirementInventorySummary,
        recentNodeResultSummaries: input.runInput.recentNodeResultSummaries,
        capabilityRegistrySummary: input.runInput.capabilityRegistrySummary,
        rejectedDecisionReasonCodes: input.rejectedDecisionReasonCodes,
        rejectedDecisionDiagnostics: input.rejectedDecisionDiagnostics,
        rejectedDecisionRef: input.rejectedDecisionRef,
        repairDiagnostics: input.repairDiagnostics,
        acceptedDecisionFieldRefs: input.acceptedDecisionFieldRefs,
        focus,
      }),
      tools: schedulerStagedSmallVerbToolDefinitions(allowed),
      allowedToolNames: allowed.map(schedulerProviderToolName),
      requiredTransport: modelPolicy.requiredTransport,
      parallelismPolicy: modelPolicy.parallelismPolicy,
      maxAcceptedToolCalls: schedulerStageMaxToolCalls(input.projection),
      maxOutputTokens: modelPolicy.maxOutputTokens,
      timeoutMs: modelPolicy.timeoutMs,
      reasoningEffort: modelPolicy.reasoningEffort,
      taskClass: modelPolicy.taskClass,
      modelTaskCallSite:
        input.projection.phase === "compiled_graph_policy_repair_required"
          ? "scheduler.compiled_graph_policy.native_tool"
          : input.projection.phase === "capability_selection_required"
            ? "scheduler.capability_selection.native_tool"
            : "scheduler.stage.native_tool",
      reasonCodes: [
        "scheduler_native_tool_call",
        `scheduler_stage_phase:${input.projection.phase}`,
        `scheduler_native_tool_batch_index:${index}`,
        `scheduler_stage_required_transport:${modelPolicy.requiredTransport}`,
        `scheduler_stage_parallelism_policy:${modelPolicy.parallelismPolicy}`,
        `scheduler_stage_model_ref:${modelPolicy.modelRef}`,
        `scheduler_stage_provider_path:${modelPolicy.providerPath}`,
        `scheduler_stage_task_class:${modelPolicy.taskClass}`,
        `scheduler_stage_reasoning_effort:${modelPolicy.reasoningEffort ?? "unset"}`,
      ],
    };
  };
  const callBatch = async (
    focus: JsonValue | null,
    allowed: readonly SchedulerStageSmallVerbToolId[],
    index: number,
  ): Promise<SchedulerStageToolCall[]> => {
    const toolInput = buildToolInput(focus, allowed, index);
    if (!input.runInput.callSchedulerTools) {
      throw new Error(`scheduler_stage_transport_unsupported:${input.projection.phase}`);
    }
    const results = await input.runInput.callSchedulerTools(toolInput);
    return results.map((result) => ({ toolId: result.toolId, input: result.input }));
  };
  const callOne = async (
    focus: JsonValue | null,
    allowed: readonly SchedulerStageSmallVerbToolId[],
    index: number,
  ): Promise<SchedulerStageToolCall> => {
    const result = await input.runInput.callSchedulerTool(buildToolInput(focus, allowed, index));
    return { toolId: result.toolId, input: result.input };
  };

  if (
    input.runInput.callSchedulerTools &&
    [
      "work_unit_coverage_required",
      "node_contracts_required",
      "dependency_ordering_required",
    ].includes(input.projection.phase)
  ) {
    return callBatch(null, allowedToolIds, 0);
  }

  if (
    input.projection.phase === "capability_selection_required" &&
    input.projection.missingCapabilityWorkUnitIds.length > 1 &&
    allowedToolIds.includes("scheduler.add_capability_selection")
  ) {
    return mapWithConcurrency(
      input.projection.missingCapabilityWorkUnitIds,
      4,
      (workUnitId, index) =>
        callOne(
          {
            workUnitId,
            missingField: "selectedCapabilityId",
            rawPromptStored: false,
            rawResponseStored: false,
          } as JsonValue,
          ["scheduler.add_capability_selection"],
          index,
        ),
    );
  }

  if (input.projection.phase === "capability_selection_required") {
    return [await callOne(null, allowedToolIds, 0)];
  }

  if (input.projection.phase === "compiled_graph_policy_repair_required") {
    const focuses = schedulerPolicyRepairFocuses(input.projection.reasonCodes).slice(0, 8);
    if (modelPolicy.parallelismPolicy === "parallel_focused_sessions") {
      return mapWithConcurrency(focuses, 4, (focus, index) =>
        callOne(focus, allowedToolIds, index),
      );
    }
    return [await callOne(focuses[0] ?? null, allowedToolIds, 0)];
  }

  return callBatch(null, allowedToolIds, 0);
}

export function schedulerToolCallTelemetry(input: {
  repairAttempt: number;
  draftPatch: SchedulerDraftPatchResult;
  compiled?: SchedulerStageCompilerTelemetry | null;
  validationReasonCodes?: string[];
  rejectionReasonCodes?: string[];
}): JsonValue {
  const draft = input.draftPatch.draft;
  const repairRequest = input.compiled?.repairRequest ?? null;
  const repairFields = Array.isArray(repairRequest?.missingFields)
    ? repairRequest.missingFields
        .map((field) => unknownRecord(field))
        .map((field) => unknownString(field.path ?? field.fieldPath ?? field.name))
        .filter(Boolean)
        .slice(0, 24)
    : [];
  return {
    artifactKind: "scheduler_tool_call_telemetry",
    schemaVersion: "execution-platform.tool-call-telemetry.v1",
    stage: "scheduler_graph_authoring",
    repairAttempt: input.repairAttempt,
    modelToolCallCount: input.draftPatch.modelToolCallCount,
    acceptedToolCallCount: input.draftPatch.appliedToolIds.length,
    acceptedToolNames: input.draftPatch.appliedToolIds.slice(0, 80),
    rejectedToolCallCount: input.draftPatch.rejectedToolIds.length,
    rejectedToolNames: input.draftPatch.rejectedToolIds.slice(0, 40),
    omittedToolCallCount: input.draftPatch.omittedToolCallCount,
    draftWorkUnitCount: Object.keys(draft.workBreakdownUnitsById).length,
    draftCapabilitySelectionCount: Object.keys(draft.capabilitySelectionsByWorkUnitId).length,
    draftNodeContractCount: Object.keys(draft.nodeContractDraftsByWorkUnitId).length,
    draftEdgeCount: Array.isArray(draft.edgeOrParallelismDraft.edges)
      ? draft.edgeOrParallelismDraft.edges.length
      : 0,
    compilerDecisionAccepted: false,
    compilerReasonCodes: (input.compiled?.reasonCodes ?? []).slice(0, 80),
    compilerRejectedDiagnosticCount: input.compiled?.rejectedNodeDiagnostics.length ?? 0,
    compilerRejectedDiagnostics: (input.compiled?.rejectedNodeDiagnostics ?? []).slice(0, 8),
    repairFieldPaths: repairFields,
    validationReasonCodes: (input.validationReasonCodes ?? []).slice(0, 80),
    rejectionReasonCodes: (input.rejectionReasonCodes ?? []).slice(0, 80),
    patchReasonCodes: input.draftPatch.reasonCodes.slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function blockedResult(input: {
  status: SchedulerStageRunnerBlockedResult["status"];
  artifactRefs: string[];
  reasonCodes: string[];
}): SchedulerStageRunnerBlockedResult {
  const classification = classifySchedulerCompiledGraphOutcome({
    compiledReasonCodes: [],
    validationReasonCodes: [],
    policyReasonCodes: input.reasonCodes,
    utilityPolicyReasonCodes: [],
    genericStagedPolicyReasonCodes: [],
    validationNodePhaseReasonCodes: [],
    needsReviewRetryPolicyReasonCodes: [],
  });
  return {
    status: input.status,
    artifactRefs: input.artifactRefs,
    reasonCodes: uniqueStrings(input.reasonCodes),
    blocker: {
      blockerKind: classification.blockingDiagnostics[0]?.blockerKind ?? "policy_failure",
      reasonCodes: uniqueStrings(input.reasonCodes),
      diagnostics: classification.blockingDiagnostics,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  };
}

export class SchedulerStageRunner {
  async run(input: SchedulerStageRunInput): Promise<SchedulerStageRunnerResult> {
    input = {
      ...input,
      requirementMapSummary:
        input.requirementMapSummary ?? summarizeRequirementMapForScheduler(input.requirementMap),
      requirementInventory:
        input.requirementInventory ?? requirementMapAsSchedulerInventory(input.requirementMap),
      requirementInventorySummary:
        input.requirementInventorySummary ??
        input.requirementMapSummary ??
        summarizeRequirementMapForScheduler(input.requirementMap),
    };
    const decisionRefs: string[] = [];
    const reasonCodes: string[] = [];
    if (!input.requirementMapAccepted && !input.requirementMap) {
      const missingReasonCodes = [
        "model_authored_requirement_map_missing",
        "scheduler_stage_requirement_map_required",
      ];
      const tool = await input.recordTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.reject_graph_patch",
        idempotencyKey: `iteration:${input.iteration}:scheduler-stage-requirement-map-missing`,
        inputRef: null,
        inputSummary:
          "SchedulerStageRunner requires an accepted RequirementMap before graph authoring.",
        metadata: {
          reasonCodes: missingReasonCodes,
          schedulerStagePhase: "scheduler_stage_blocked",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      return blockedResult({
        status: "blocked_missing_scheduler_field",
        artifactRefs: tool.refs,
        reasonCodes: uniqueStrings([...tool.reasonCodes, ...missingReasonCodes]),
      });
    }

    let rejectedDecisionReasonCodes: string[] = [];
    let rejectedDecisionDiagnostics: OrchestratorGraphRejectedNodeDiagnostic[] = [];
    let rejectedDecisionRef: string | null = null;
    let rejectedDecisionRepairRequest: ModelDecisionRepairRequest | null = null;
    let compiledGraphRejectionReasonCodes: string[] = [];
    let cumulativeSchedulerDraft = createSchedulerDraftState(input.iteration);
    let cumulativeDecisionFieldRefs: string[] = [];
    const schedulerStageNoProgressCounts = new Map<string, number>();
    reasonCodes.push(
      ...applySchedulerRuntimeDerivations({
        state: cumulativeSchedulerDraft,
        capabilityManifest: input.capabilityManifest,
      }),
    );

    for (let repairAttempt = 0; repairAttempt < input.maxSchedulerToolTurns; repairAttempt += 1) {
      const stageProjection = evaluateSchedulerStage({
        state: cumulativeSchedulerDraft,
        requirementInventory: input.requirementInventory,
        postCompileRepairReasonCodes: compiledGraphRejectionReasonCodes,
      });
      const compileReadyBeforeModel = stageProjection.canCompile;
      const nativeToolCalls = compileReadyBeforeModel
        ? []
        : await schedulerNativeToolCallsForPhase({
            runInput: input,
            projection: stageProjection,
            draft: cumulativeSchedulerDraft,
            repairAttempt,
            rejectedDecisionReasonCodes,
            rejectedDecisionDiagnostics,
            rejectedDecisionRef,
            repairDiagnostics: rejectedDecisionRepairRequest,
            acceptedDecisionFieldRefs: cumulativeDecisionFieldRefs,
          });
      const draftPatch: SchedulerDraftPatchResult = compileReadyBeforeModel
        ? {
            draft: cumulativeSchedulerDraft,
            modelToolCallCount: 0,
            appliedToolIds: [],
            rejectedToolIds: [],
            omittedToolCallCount: 0,
            reasonCodes: ["scheduler_phase_compiled_graph_ready"],
          }
        : applySchedulerStageToolResults({
            baseDraft: cumulativeSchedulerDraft,
            toolCalls: nativeToolCalls,
            requirementInventory: input.requirementInventory,
            maxToolCalls: schedulerStageMaxToolCalls(stageProjection),
            allowedToolIds: stageProjection.allowedToolIds,
          });

      cumulativeSchedulerDraft = draftPatch.draft;
      const runtimeDerivationReasonCodes = applySchedulerRuntimeDerivations({
        state: cumulativeSchedulerDraft,
        capabilityManifest: input.capabilityManifest,
      });
      draftPatch.reasonCodes = uniqueStrings([
        ...draftPatch.reasonCodes,
        ...runtimeDerivationReasonCodes,
      ]);
      if (
        stageProjection.phase === "compiled_graph_policy_repair_required" &&
        draftPatch.appliedToolIds.length > 0
      ) {
        rejectedDecisionReasonCodes = [];
        rejectedDecisionDiagnostics = [];
        rejectedDecisionRepairRequest = null;
        compiledGraphRejectionReasonCodes = [];
      }
      cumulativeDecisionFieldRefs = uniqueStrings([
        ...cumulativeDecisionFieldRefs,
        ...draftPatch.appliedToolIds,
      ]);

      const disallowedAppliedToolIds = draftPatch.rejectedToolIds.filter((toolId) =>
        draftPatch.reasonCodes.includes(`scheduler_stage_tool_rejected:${toolId}`),
      );
      if (disallowedAppliedToolIds.length > 0) {
        rejectedDecisionReasonCodes = [
          "scheduler_stage_tool_not_allowed",
          `scheduler_stage_phase:${stageProjection.phase}`,
          ...disallowedAppliedToolIds.map((toolId) => `scheduler_stage_tool_rejected:${toolId}`),
        ];
        rejectedDecisionRepairRequest = repairRequestForMissingFields({
          failedDecisionId: rejectedDecisionRef,
          missingFields: [
            missingField(
              "schedulerStageToolCall.toolId",
              "Scheduler phase legal tool",
              `Current scheduler phase ${stageProjection.phase} only permits ${stageProjection.allowedToolIds.join(", ")}.`,
              stageProjection.allowedToolIds.map((toolId) => ({ toolId, input: {} })),
            ),
          ],
          preserveFields: cumulativeDecisionFieldRefs,
          acceptedFields: cumulativeDecisionFieldRefs,
          rejectedReasonCodes: rejectedDecisionReasonCodes,
        });
        const rejectedTool = await input.recordTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.reject_graph_patch",
          idempotencyKey: `iteration:${input.iteration}:repair:${repairAttempt}:scheduler-stage-tool-not-allowed:${disallowedAppliedToolIds.join("|").slice(0, 120)}`,
          inputRef: rejectedDecisionRef,
          inputSummary:
            "Scheduler model called a small verb that is not legal for the current scheduler stage.",
          metadata: {
            repairAttempt,
            schedulerStagePhase: stageProjection.phase,
            allowedSchedulerToolIds: stageProjection.allowedToolIds,
            disallowedAppliedToolIds,
            reasonCodes: rejectedDecisionReasonCodes,
            repairDiagnostics: rejectedDecisionRepairRequest,
            cumulativeDecisionFieldRefs,
            toolCallTelemetry: schedulerToolCallTelemetry({
              repairAttempt,
              draftPatch,
              rejectionReasonCodes: rejectedDecisionReasonCodes,
            }),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
        decisionRefs.push(...rejectedTool.refs);
        reasonCodes.push(...rejectedTool.reasonCodes, ...rejectedDecisionReasonCodes);
        continue;
      }

      if (!compileReadyBeforeModel && draftPatch.appliedToolIds.length === 0) {
        rejectedDecisionReasonCodes = [
          "scheduler_stage_native_tool_calls_missing",
          "scheduler_native_small_verb_contract_violation",
          ...draftPatch.reasonCodes,
        ];
        rejectedDecisionRepairRequest = repairRequestForMissingFields({
          failedDecisionId: rejectedDecisionRef,
          missingFields: [
            missingField(
              "schedulerStageToolCall",
              "Scheduler native small verb",
              "Scheduler graph authoring must use provider-native scheduler tools. JSON-shaped tool calls and full graph drafts are not accepted in the canonical path.",
              [
                {
                  toolId: "scheduler.add_work_unit",
                  input: {
                    workUnitId: "wu-core-implementation",
                    objective: "Implement the core requirement.",
                    commitmentIds: ["commitment-id"],
                    executionIntent: "source_edit",
                  },
                },
              ],
            ),
          ],
          preserveFields: cumulativeDecisionFieldRefs,
          acceptedFields: cumulativeDecisionFieldRefs,
          rejectedReasonCodes: rejectedDecisionReasonCodes,
        });
        const rejectedTool = await input.recordTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.reject_graph_patch",
          idempotencyKey: `iteration:${input.iteration}:repair:${repairAttempt}:scheduler-tool-calls-missing`,
          inputRef: rejectedDecisionRef,
          inputSummary:
            "Scheduler model output was rejected because graph authoring must use provider-native scheduler tools.",
          metadata: {
            repairAttempt,
            reasonCodes: rejectedDecisionReasonCodes,
            repairDiagnostics: rejectedDecisionRepairRequest,
            cumulativeDecisionFieldRefs,
            toolCallTelemetry: schedulerToolCallTelemetry({
              repairAttempt,
              draftPatch,
              rejectionReasonCodes: rejectedDecisionReasonCodes,
            }),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
        decisionRefs.push(...rejectedTool.refs);
        reasonCodes.push(...rejectedTool.reasonCodes, ...rejectedDecisionReasonCodes);
        continue;
      }

      const nextStageProjection = evaluateSchedulerStage({
        state: cumulativeSchedulerDraft,
        requirementInventory: input.requirementInventory,
        postCompileRepairReasonCodes: compiledGraphRejectionReasonCodes,
      });
      const patchTool = await input.recordTool({
        graphId: input.graphId,
        iteration: input.iteration,
        toolId: "scheduler.apply_graph_patch_tool_calls",
        idempotencyKey: `iteration:${input.iteration}:repair:${repairAttempt}:scheduler-tool-calls:${draftPatch.appliedToolIds.join("|").slice(0, 160)}`,
        inputRef: rejectedDecisionRef,
        inputSummary:
          "Apply scheduler native small-verb tool calls to the runtime-owned graph patch state before recompilation.",
        metadata: {
          repairAttempt,
          appliedToolIds: draftPatch.appliedToolIds,
          schedulerStagePhase: nextStageProjection.phase,
          allowedSchedulerToolIds: nextStageProjection.allowedToolIds,
          schedulerStageState: schedulerStageProjectionForModel(nextStageProjection),
          reasonCodes: uniqueStrings([
            ...draftPatch.reasonCodes,
            ...nextStageProjection.reasonCodes,
          ]),
          acceptedDecisionFieldRefs: cumulativeDecisionFieldRefs,
          schedulerPhase: nextStageProjection.phase,
          toolCallTelemetry: schedulerToolCallTelemetry({ repairAttempt, draftPatch }),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      decisionRefs.push(...patchTool.refs);
      reasonCodes.push(
        ...patchTool.reasonCodes,
        ...draftPatch.reasonCodes,
        ...nextStageProjection.reasonCodes,
      );
      if (!nextStageProjection.canCompile) {
        const noProgressSignature = schedulerStageProgressSignature(nextStageProjection);
        const noProgressCount = (schedulerStageNoProgressCounts.get(noProgressSignature) ?? 0) + 1;
        schedulerStageNoProgressCounts.set(noProgressSignature, noProgressCount);
        if (noProgressCount >= 3) {
          const collapseReasonCodes = uniqueStrings([
            "scheduler_stage_no_progress_collapsed",
            `scheduler_stage_no_progress_phase:${nextStageProjection.phase}`,
            ...nextStageProjection.reasonCodes,
          ]);
          const collapseTool = await input.recordTool({
            graphId: input.graphId,
            iteration: input.iteration,
            toolId: "scheduler.reject_graph_patch",
            idempotencyKey: `iteration:${input.iteration}:repair:${repairAttempt}:scheduler-stage-no-progress:${nextStageProjection.phase}`,
            inputRef: rejectedDecisionRef,
            inputSummary:
              "SchedulerStageRunner stopped a repeated small-verb loop with unchanged blockers.",
            metadata: {
              repairAttempt,
              schedulerStagePhase: nextStageProjection.phase,
              allowedSchedulerToolIds: nextStageProjection.allowedToolIds,
              schedulerStageState: schedulerStageProjectionForModel(nextStageProjection),
              appliedToolIds: draftPatch.appliedToolIds,
              noProgressCount,
              reasonCodes: collapseReasonCodes,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          });
          decisionRefs.push(...collapseTool.refs);
          return blockedResult({
            status: "blocked_no_progress",
            artifactRefs: decisionRefs,
            reasonCodes: uniqueStrings([
              ...reasonCodes,
              ...collapseTool.reasonCodes,
              ...collapseReasonCodes,
            ]),
          });
        }
        rejectedDecisionReasonCodes = nextStageProjection.reasonCodes;
        rejectedDecisionRepairRequest = repairRequestForMissingFields({
          failedDecisionId: rejectedDecisionRef,
          missingFields: nextStageProjection.reasonCodes.slice(0, 12).map((code) =>
            missingField(
              `schedulerStage.${nextStageProjection.phase}`,
              "Scheduler stage transition",
              code,
              nextStageProjection.allowedToolIds.map((toolId) => ({ toolId, input: {} })),
            ),
          ),
          preserveFields: cumulativeDecisionFieldRefs,
          acceptedFields: cumulativeDecisionFieldRefs,
          rejectedReasonCodes: nextStageProjection.reasonCodes,
        });
        continue;
      }

      if (repairAttempt === 0) {
        const requirementTool = await input.recordTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.draft_requirement_work_breakdown",
          idempotencyKey: `iteration:${input.iteration}:requirement-inventory`,
          inputRef: input.requirementInventory?.graphRef ?? null,
          inputSummary:
            "Runtime accepted a typed SchedulerRequirementInventory as the scheduler-facing breakdown contract.",
          metadata: {
            requirementInventorySummary: input.requirementInventorySummary,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
        decisionRefs.push(...requirementTool.refs);
        reasonCodes.push(...requirementTool.reasonCodes);
      }

      if (!input.requirementMap) {
        const missingReasonCodes = [
          "scheduler_graph_patch_requirement_map_missing",
          "scheduler_graph_patch_compile_blocked",
        ];
        return blockedResult({
          status: "blocked_missing_scheduler_field",
          artifactRefs: decisionRefs,
          reasonCodes: uniqueStrings([...reasonCodes, ...missingReasonCodes]),
        });
      }
      const compiledPatch = compileSchedulerGraphPatch({
        graphId: input.graphId,
        iteration: input.iteration,
        requirementMap: input.requirementMap,
        capabilityManifest: input.capabilityManifest,
        patchMode: input.graphAmendmentRequest ? "graph_amendment" : "initial_graph",
        schedulerClosurePolicy: input.schedulerClosurePolicy ?? null,
        closureRunMode: input.closureRunMode ?? "standard",
        workUnits: Object.values(cumulativeSchedulerDraft.workBreakdownUnitsById),
        capabilitySelections: Object.values(
          cumulativeSchedulerDraft.capabilitySelectionsByWorkUnitId,
        ),
        nodeContracts: Object.values(cumulativeSchedulerDraft.nodeContractDraftsByWorkUnitId),
        dependencyEdges: schedulerDraftEdges(cumulativeSchedulerDraft),
      });
      const graphPatchRef =
        compiledPatch.patch?.patchRef ??
        graphRef(
          "scheduler-graph-patch-rejected",
          `${input.graphId}-${input.iteration}-${repairAttempt}`,
        );
      if (!compiledPatch.valid || !compiledPatch.patch) {
        const rejectionReasonCodes = uniqueStrings([
          "scheduler_graph_patch_compile_blocked",
          ...compiledPatch.reasonCodes,
        ]);
        const repairDiagnostics = repairRequestForMissingFields({
          failedDecisionId: graphPatchRef,
          missingFields: compiledPatch.diagnostics
            .slice(0, 12)
            .map((diagnostic) =>
              missingField(
                diagnostic.missingFieldPaths[0] ?? diagnostic.reasonCode,
                "SchedulerGraphPatch field",
                diagnostic.reasonCode,
                diagnostic.affectedNodeSeedIds.length > 0
                  ? diagnostic.affectedNodeSeedIds
                  : diagnostic.affectedRequirementIds,
              ),
            ),
          preserveFields: cumulativeDecisionFieldRefs,
          acceptedFields: cumulativeDecisionFieldRefs,
          rejectedReasonCodes: rejectionReasonCodes,
        });
        const rejectedTool = await input.recordTool({
          graphId: input.graphId,
          iteration: input.iteration,
          toolId: "scheduler.reject_graph_patch",
          idempotencyKey: `iteration:${input.iteration}:repair:${repairAttempt}:scheduler-graph-patch-compile-blocked`,
          inputRef: graphPatchRef,
          inputSummary:
            "SchedulerGraphPatch compiler rejected the runner-owned graph patch state before graph persistence.",
          metadata: {
            repairAttempt,
            reasonCodes: rejectionReasonCodes.slice(0, 80),
            repairDiagnostics,
            schedulerGraphPatchDiagnostics: compiledPatch.diagnostics.slice(0, 12),
            toolCallTelemetry: schedulerToolCallTelemetry({
              repairAttempt,
              draftPatch,
              rejectionReasonCodes,
            }),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
        decisionRefs.push(...rejectedTool.refs);
        reasonCodes.push(...rejectedTool.reasonCodes, ...rejectionReasonCodes);
        await input.recordCheckpoint({
          graphId: input.graphId,
          checkpointKind: "scheduler_graph_patch_rejected",
          stateSummary:
            "SchedulerGraphPatch compiler rejected the runner-owned scheduler draft; no fallback graph was injected.",
          artifactRefs: [graphPatchRef],
        });
        if (
          compiledPatch.diagnostics.length > 0 &&
          compiledPatch.diagnostics.every(
            (diagnostic) => !schedulerGraphPatchDiagnosticIsModelRepairable(diagnostic.reasonCode),
          )
        ) {
          return blockedResult({
            status: "blocked_policy_failure",
            artifactRefs: decisionRefs,
            reasonCodes: uniqueStrings([
              ...reasonCodes,
              ...rejectedTool.reasonCodes,
              ...rejectionReasonCodes,
              "scheduler_graph_patch_compile_blocked_non_model_repairable",
            ]),
          });
        }
        rejectedDecisionReasonCodes = rejectionReasonCodes;
        rejectedDecisionDiagnostics = [];
        compiledGraphRejectionReasonCodes = rejectionReasonCodes;
        rejectedDecisionRepairRequest = repairDiagnostics;
        continue;
      }

      const acceptedTraceCodes = [
        "scheduler_graph_patch_compiled",
        "scheduler_graph_patch_ready_for_runtime_persistence",
      ];
      decisionRefs.push(compiledPatch.patch.patchRef);
      await input.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind:
          repairAttempt > 0
            ? "scheduler_graph_patch_repaired_accepted"
            : "scheduler_graph_patch_accepted",
        stateSummary: `SchedulerGraphPatch accepted with ${compiledPatch.nodeSpecs.length} node(s) and ${compiledPatch.edgeSpecs.length} edge(s).`,
        artifactRefs: [compiledPatch.patch.patchRef],
      });
      return {
        status: "accepted_graph",
        graphPatch: compiledPatch.patch,
        nodeSpecs: compiledPatch.nodeSpecs,
        edgeSpecs: compiledPatch.edgeSpecs,
        acceptedTraceCodes,
        artifactRefs: decisionRefs,
        reasonCodes:
          repairAttempt > 0
            ? [...reasonCodes, ...compiledPatch.reasonCodes, "scheduler_graph_patch_repaired"]
            : [...reasonCodes, ...compiledPatch.reasonCodes],
      };
    }
    return blockedResult({
      status: "blocked_no_progress",
      artifactRefs: decisionRefs,
      reasonCodes: uniqueStrings([...reasonCodes, "scheduler_decision_max_tool_turns_exhausted"]),
    });
  }
}
