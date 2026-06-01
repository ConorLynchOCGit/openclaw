import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  buildModelTaskTelemetryEnvelope,
  classifyModelTaskCall,
  evaluateModelPolicyBindingPreflight,
  type ModelContractBoundaryId,
  type ModelPolicyBindingPreflight,
  type ModelTaskClass,
  type ModelTaskProviderPath,
  type ModelTaskReasoningMode,
  type ModelTaskResponseFormatMode,
} from "../model-tasks/model-task-classification.ts";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const optionalBoundedString = (max: number) => z.string().trim().max(max).nullable().default(null);
const stringList = (maxItems: number, maxChars = 320) =>
  z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() ? [value] : value),
      z.array(z.string().trim().min(1).max(maxChars)).max(maxItems),
    )
    .default([]);

export const RESOURCE_SELECTION_SCHEMA_VERSION =
  "execution-platform.resource-selection.v1";
export const RESOURCE_SELECTION_PACKET_SCHEMA_VERSION =
  "execution-platform.resource-selection-packet.v1";
export const RESOURCE_SELECTION_HANDLE_MANIFEST_SCHEMA_VERSION =
  "execution-platform.resource-selection-handle-manifest.v1";
export const RESOURCE_SELECTION_MODEL_RESULT_SCHEMA_VERSION =
  "execution-platform.resource-selection-model-result.v1";
export const RESOURCE_SELECTION_FIELD_REPAIR_SCHEMA_VERSION =
  "execution-platform.resource-selection-field-repair.v1";
export const DOMAIN_RESOURCE_SELECTION_REQUEST_SCHEMA_VERSION =
  "execution-platform.domain-resource-selection-request.v1";
export const DOMAIN_RESOURCE_SELECTION_PROPOSAL_SCHEMA_VERSION =
  "execution-platform.domain-resource-selection-proposal.v1";
export const DOMAIN_RESOURCE_SELECTION_DECISION_SCHEMA_VERSION =
  "execution-platform.domain-resource-selection-decision.v1";

export const ResourceSelectionCandidateHandleSchema = z
  .object({
    candidateId: boundedString(180),
    resourceRef: boundedString(420),
    resourceKind: boundedString(120),
    candidateSource: boundedString(160),
    sourceRefs: stringList(24, 420),
    authorityScopeRefs: stringList(24, 420),
    targetCommitmentIds: stringList(24, 180),
    capabilityIds: stringList(12, 180),
    evidenceRequirements: stringList(16, 360),
    objectiveSnippet: optionalBoundedString(900),
    contextSummary: optionalBoundedString(900),
    payloadRef: optionalBoundedString(420),
    payloadHash: optionalBoundedString(180),
    omittedBodyRef: optionalBoundedString(420),
    omittedBodyHash: optionalBoundedString(180),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type ResourceSelectionCandidateHandle = z.infer<
  typeof ResourceSelectionCandidateHandleSchema
>;

export const ResourceSelectionIntentSchema = z
  .object({
    resourceRef: boundedString(420),
    intentKind: boundedString(120),
    intendedUse: boundedString(1_000),
    rationale: boundedString(1_000),
    validationHintRefs: stringList(12, 420),
  })
  .strict();

export type ResourceSelectionIntent = z.infer<typeof ResourceSelectionIntentSchema>;

const SubmitSelectionArgumentsSchema = z
  .object({
    selectedResourceRefs: stringList(80, 420),
    resourceIntents: z.array(ResourceSelectionIntentSchema).max(80).default([]),
    validationDiscoveryPlan: stringList(24, 700),
    selectionRationale: boundedString(1_200),
  })
  .strict();

const MarkBlockedArgumentsSchema = z
  .object({
    blockerSummary: boundedString(1_200),
    missingContextQuestions: stringList(24, 700),
    selectionRationale: boundedString(1_200),
  })
  .strict();

export const ResourceSelectionToolCallSchema = z.discriminatedUnion("toolName", [
  z
    .object({
      toolName: z.literal("resource.selection.propose"),
      arguments: SubmitSelectionArgumentsSchema,
      rawPromptStored: z.literal(false),
      rawResponseStored: z.literal(false),
      rawProviderLogStored: z.literal(false),
      rawToolLogStored: z.literal(false),
    })
    .strict(),
  z
    .object({
      toolName: z.literal("resource.selection.mark_blocked"),
      arguments: MarkBlockedArgumentsSchema,
      rawPromptStored: z.literal(false),
      rawResponseStored: z.literal(false),
      rawProviderLogStored: z.literal(false),
      rawToolLogStored: z.literal(false),
    })
    .strict(),
]);

export type ResourceSelectionToolCall = z.infer<typeof ResourceSelectionToolCallSchema>;

export const DomainResourceSelectionOperationSchema = z.enum([
  "modify",
  "create",
  "delete",
  "inspect_only",
  "test_add",
  "validation_only",
  "documentation_update",
  "evidence_only",
]);

export type DomainResourceSelectionOperation = z.infer<typeof DomainResourceSelectionOperationSchema>;

export const DomainResourceSelectionModelFileChangeIntentSchema = z
  .object({
    targetRef: boundedString(420),
    operation: DomainResourceSelectionOperationSchema,
    intendedChange: boundedString(1_000),
    sourceCommitmentIds: stringList(24, 180),
    resourceHandoffRefs: stringList(40, 420),
    expectedEvidenceMode: stringList(16, 240),
    validationDiscoveryNeed: boundedString(700),
    authorityScopeRef: boundedString(420),
    rationale: boundedString(1_000),
  })
  .strict();

export type DomainResourceSelectionModelFileChangeIntent = z.infer<
  typeof DomainResourceSelectionModelFileChangeIntentSchema
>;

const DomainResourceSelectionProposeArgumentsSchema = z
  .object({
    selectedTargetRefs: stringList(80, 420),
    fileChangeIntents: z.array(DomainResourceSelectionModelFileChangeIntentSchema).max(80).default([]),
    validationDiscoveryPlan: stringList(24, 700),
    selectionRationale: boundedString(1_200),
    excludedCandidateRefs: stringList(80, 420),
  })
  .strict();

const RuntimeStorageFlagSchema = z.literal(false).default(false);

const DomainResourceSelectionBlockedArgumentsSchema = z
  .object({
    blockerSummary: boundedString(1_200),
    missingContextQuestions: stringList(24, 700),
    selectionRationale: boundedString(1_200),
    excludedCandidateRefs: stringList(80, 420),
  })
  .strict();

export const DomainResourceSelectionToolCallSchema = z.discriminatedUnion("toolName", [
  z
    .object({
      toolName: z.literal("resource.selection.propose"),
      arguments: DomainResourceSelectionProposeArgumentsSchema,
      rawPromptStored: RuntimeStorageFlagSchema,
      rawResponseStored: RuntimeStorageFlagSchema,
      rawProviderLogStored: RuntimeStorageFlagSchema,
      rawToolLogStored: RuntimeStorageFlagSchema,
    })
    .strict(),
  z
    .object({
      toolName: z.literal("resource.selection.mark_blocked"),
      arguments: DomainResourceSelectionBlockedArgumentsSchema,
      rawPromptStored: RuntimeStorageFlagSchema,
      rawResponseStored: RuntimeStorageFlagSchema,
      rawProviderLogStored: RuntimeStorageFlagSchema,
      rawToolLogStored: RuntimeStorageFlagSchema,
    })
    .strict(),
]);

export type DomainResourceSelectionToolCall = z.infer<typeof DomainResourceSelectionToolCallSchema>;

export const DomainResourceSelectionRequestSchema = z
  .object({
    artifactKind: z.literal("domain_resource_selection_request"),
    schemaVersion: z.literal(DOMAIN_RESOURCE_SELECTION_REQUEST_SCHEMA_VERSION),
    requestId: boundedString(180),
    requestRef: boundedString(420),
    requestHash: boundedString(180),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    nodeId: boundedString(180),
    sourceWorkUnitId: boundedString(180),
    workIntentRef: optionalBoundedString(420),
    workIntentContextResolutionRef: optionalBoundedString(420),
    contextSatisfactionStateRef: optionalBoundedString(420),
    acceptedResourceHandoffRefs: stringList(120, 420),
    targetCommitmentIds: stringList(24, 180),
    capabilityIds: stringList(12, 180),
    evidenceRequirements: stringList(16, 360),
    authorityScopeRefs: stringList(40, 420),
    candidateHandleManifestRef: boundedString(420),
    candidateHandleManifestHash: boundedString(180),
    candidateResourceRefs: stringList(160, 420),
    nextLegalTools: z
      .array(
        z.enum([
          "resource.selection.propose",
          "resource.selection.mark_blocked",
        ]),
      )
      .max(2),
    reasonCodes: stringList(80, 180),
    semanticQualityJudgedByDeterministicCode: z.literal(false),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
  })
  .strict();

export type DomainResourceSelectionRequest = z.infer<typeof DomainResourceSelectionRequestSchema>;

export const DomainResourceSelectionProposalSchema = z
  .object({
    artifactKind: z.literal("domain_resource_selection_proposal"),
    schemaVersion: z.literal(DOMAIN_RESOURCE_SELECTION_PROPOSAL_SCHEMA_VERSION),
    status: z.enum(["proposed", "blocked"]),
    selectedTargetRefs: stringList(80, 420),
    fileChangeIntents: z.array(DomainResourceSelectionModelFileChangeIntentSchema).max(80).default([]),
    validationDiscoveryPlan: stringList(24, 700),
    selectionRationale: boundedString(1_200),
    excludedCandidateRefs: stringList(80, 420),
    blockerSummary: z.string().trim().max(1_200).nullable().default(null),
    missingContextQuestions: stringList(24, 700),
    sourceToolName: z.enum([
      "resource.selection.propose",
      "resource.selection.mark_blocked",
    ]),
    semanticQualityJudgedByDeterministicCode: z.literal(false),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type DomainResourceSelectionProposal = z.infer<typeof DomainResourceSelectionProposalSchema>;

export const DomainResourceSelectionDecisionSchema = z
  .object({
    artifactKind: z.literal("domain_resource_selection_decision"),
    schemaVersion: z.literal(DOMAIN_RESOURCE_SELECTION_DECISION_SCHEMA_VERSION),
    decisionId: boundedString(180),
    decisionRef: boundedString(420),
    decisionHash: boundedString(180),
    requestRef: boundedString(420),
    candidateHandleManifestRef: boundedString(420),
    status: z.enum(["accepted", "needs_review"]),
    selectedTargetRefs: stringList(80, 420),
    fileChangeIntents: z.array(DomainResourceSelectionModelFileChangeIntentSchema).max(80).default([]),
    validationDiscoveryPlan: stringList(24, 700),
    selectionRationale: boundedString(1_200),
    blockerSummary: z.string().trim().max(1_200).nullable().default(null),
    missingContextQuestions: stringList(24, 700),
    invalidSelections: stringList(80, 420),
    uncoveredSelectedTargetRefs: stringList(80, 420),
    unauthorizedSelections: stringList(80, 420),
    resourceHandoffCoverageMissingRefs: stringList(80, 420),
    excludedCandidateRefs: stringList(80, 420),
    reasonCodes: stringList(100, 180),
    nextLegalTransition: z.enum([
      "resource.selection.accept",
      "resource.selection.request_revision",
      "scheduler.request_resource_requirement_for_work_intent",
    ]),
    semanticQualityJudgedByDeterministicCode: z.literal(false),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
  })
  .strict();

export type DomainResourceSelectionDecision = z.infer<typeof DomainResourceSelectionDecisionSchema>;

export const ResourceSelectionDecisionSchema = z
  .object({
    artifactKind: z.literal("resource_selection_decision"),
    schemaVersion: z.literal(RESOURCE_SELECTION_SCHEMA_VERSION),
    status: z.enum(["selected", "blocked"]),
    selectedResourceRefs: stringList(80, 420),
    resourceIntents: z.array(ResourceSelectionIntentSchema).max(80).default([]),
    validationDiscoveryPlan: stringList(24, 700),
    selectionRationale: boundedString(1_200),
    blockerSummary: z.string().trim().max(1_200).nullable().default(null),
    missingContextQuestions: stringList(24, 700),
    sourceToolName: z.enum([
      "resource.selection.propose",
      "resource.selection.mark_blocked",
    ]),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type ResourceSelectionDecision = z.infer<typeof ResourceSelectionDecisionSchema>;

export const ResourceSelectionPacketSchema = z
  .object({
    packetKind: z.literal("resource_selection_packet"),
    schemaVersion: z.literal(RESOURCE_SELECTION_PACKET_SCHEMA_VERSION),
    packetId: boundedString(180),
    packetRef: boundedString(420),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    nodeId: boundedString(180),
    sourceWorkUnitId: boundedString(180),
    domainKind: boundedString(120),
    targetCommitmentIds: stringList(24, 180),
    candidateResourceRefs: stringList(160, 420),
    selectedResourceRefs: stringList(80, 420),
    resourceIntents: z.array(ResourceSelectionIntentSchema).max(80).default([]),
    validationDiscoveryPlan: stringList(24, 700),
    selectionRationale: boundedString(1_200),
    blockerSummary: z.string().trim().max(1_200).nullable().default(null),
    missingContextQuestions: stringList(24, 700),
    status: z.enum(["accepted", "needs_review"]),
    reasonCodes: stringList(80, 180),
    invalidSelections: stringList(80, 420),
    uncoveredSelectedResourceRefs: stringList(80, 420),
    candidateHandleManifestRef: boundedString(420),
    candidateHandleManifestHash: boundedString(180),
    modelTaskBoundaryId: boundedString(180),
    modelTaskPolicyRef: boundedString(260),
    providerPath: boundedString(120),
    modelRef: boundedString(260),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type ResourceSelectionPacket = z.infer<typeof ResourceSelectionPacketSchema>;

export const ResourceSelectionHandleManifestSchema = z
  .object({
    artifactKind: z.literal("resource_selection_handle_manifest"),
    schemaVersion: z.literal(RESOURCE_SELECTION_HANDLE_MANIFEST_SCHEMA_VERSION),
    manifestId: boundedString(180),
    manifestRef: boundedString(420),
    manifestHash: boundedString(180),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    nodeId: boundedString(180),
    sourceWorkUnitId: boundedString(180),
    domainKind: boundedString(120),
    objectiveSnippet: boundedString(1_200),
    targetCommitmentIds: stringList(24, 180),
    capabilityIds: stringList(12, 180),
    evidenceRequirements: stringList(16, 360),
    candidateHandles: z.array(ResourceSelectionCandidateHandleSchema).max(160),
    omittedPayloadRefs: stringList(160, 420),
    omittedPayloadHashes: stringList(160, 180),
    inputByteCount: z.number().int().nonnegative(),
    maxInputBytes: z.number().int().positive(),
    budgetStatus: z.enum(["within_budget", "over_budget"]),
    reasonCodes: stringList(80, 180),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
  })
  .strict();

export type ResourceSelectionHandleManifest = z.infer<
  typeof ResourceSelectionHandleManifestSchema
>;

export const ResourceSelectionFieldRepairSchema = z
  .object({
    fieldPath: boundedString(240),
    reasonCode: boundedString(180),
    currentValueRef: optionalBoundedString(420),
    allowedValueRefs: stringList(80, 420),
    repairInstruction: boundedString(900),
  })
  .strict();

export const ResourceSelectionFieldRepairRequestSchema = z
  .object({
    artifactKind: z.literal("resource_selection_field_repair_request"),
    schemaVersion: z.literal(RESOURCE_SELECTION_FIELD_REPAIR_SCHEMA_VERSION),
    repairRequestId: boundedString(180),
    repairRequestRef: boundedString(420),
    packetRef: optionalBoundedString(420),
    candidateHandleManifestRef: optionalBoundedString(420),
    status: z.enum(["repair_required", "no_repair_required"]),
    fieldRepairs: z.array(ResourceSelectionFieldRepairSchema).max(40),
    reasonCodes: stringList(80, 180),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type ResourceSelectionFieldRepairRequest = z.infer<
  typeof ResourceSelectionFieldRepairRequestSchema
>;

export type ResourceSelectionModelTaskRouterAdapterInput = {
  modelRef: string;
  providerPath: ModelTaskProviderPath;
  systemPrompt: string;
  userPayload: JsonValue;
  maxOutputTokens: number;
  timeoutMs: number;
  reasoningMode: ModelTaskReasoningMode;
  responseFormatMode: ModelTaskResponseFormatMode;
  taskClass: ModelTaskClass;
  callSite: string;
};

export type ResourceSelectionModelTaskRouterAdapterResult = {
  status: "succeeded" | "needs_review";
  responseText: string | null;
  responseHash: string | null;
  latencyMs: number | null;
  usage?: JsonValue | null;
  providerResponseDiagnostics?: JsonValue | null;
  errorReasonCode?: string | null;
};

export type ResourceSelectionModelTaskRouterAdapter = {
  providerPath: Exclude<ModelTaskProviderPath, "runtime_only">;
  executeJson(
    input: ResourceSelectionModelTaskRouterAdapterInput,
  ): Promise<ResourceSelectionModelTaskRouterAdapterResult>;
};

export type ResourceSelectionModelTaskRouterResult =
  | {
      status: "blocked";
      responseText: null;
      responseHash: null;
      latencyMs: null;
      classification: JsonValue;
      preflight: ModelPolicyBindingPreflight;
      telemetry: JsonValue;
      providerResponseDiagnostics: null;
      reasonCodes: string[];
      rawPromptStored: false;
      rawResponseStored: false;
      rawProviderLogStored: false;
      rawToolLogStored: false;
    }
  | {
      status: "succeeded" | "needs_review";
      responseText: string | null;
      responseHash: string | null;
      latencyMs: number | null;
      classification: JsonValue;
      preflight: ModelPolicyBindingPreflight;
      telemetry: JsonValue;
      providerResponseDiagnostics: JsonValue | null;
      reasonCodes: string[];
      rawPromptStored: false;
      rawResponseStored: false;
      rawProviderLogStored: false;
      rawToolLogStored: false;
    };

export class ModelTaskClientRouter {
  private readonly adapters: Map<string, ResourceSelectionModelTaskRouterAdapter>;

  constructor(input: { adapters: ResourceSelectionModelTaskRouterAdapter[] }) {
    this.adapters = new Map(input.adapters.map((adapter) => [adapter.providerPath, adapter]));
  }

  async runJson(input: {
    boundaryId: ModelContractBoundaryId;
    taskClass: ModelTaskClass;
    callSite: string;
    systemPrompt: string;
    userPayload: JsonValue;
    requestedInputBytes: number;
    maxOutputTokens: number;
    timeoutMs: number;
    proofMode?: boolean;
  }): Promise<ResourceSelectionModelTaskRouterResult> {
    const classification = classifyModelTaskCall({
      taskClass: input.taskClass,
      callSite: input.callSite,
    });
    const preflight = evaluateModelPolicyBindingPreflight({
      classification,
      providerCallRequested: true,
      actualModelRef: classification.selectedModelRef,
      actualProviderPath: classification.providerPath,
      actualReasoningMode: classification.reasoningMode,
      actualParserMode: classification.parserMode,
      actualResponseFormatMode: classification.responseFormatMode,
      actualAllowedToolFamily: classification.allowedToolFamily,
      actualOutputContractId: classification.allowedOutputContractId,
      actualOutputContractVersion: classification.allowedOutputContractVersion,
      requestedInputBytes: input.requestedInputBytes,
      requestedMaxOutputTokens: input.maxOutputTokens,
      requestedTimeoutMs: input.timeoutMs,
      proofMode: input.proofMode,
    });
    const telemetry = buildModelTaskTelemetryEnvelope({
      classification,
      usage: null,
      usageUnavailableReason: preflight.accepted ? "not_returned_before_provider_call" : "preflight_blocked",
    });
    const boundaryMismatch =
      classification.contractBoundaryId !== input.boundaryId
        ? "model_task_client_router_contract_boundary_mismatch"
        : null;
    const blockedReasonCodes = [
      ...preflight.reasonCodes,
      ...preflight.mismatches.map((mismatch) => mismatch.reasonCode),
      boundaryMismatch,
    ].filter((code): code is string => Boolean(code));
    if (!preflight.accepted || boundaryMismatch) {
      return {
        status: "blocked",
        responseText: null,
        responseHash: null,
        latencyMs: null,
        classification: classification as unknown as JsonValue,
        preflight,
        telemetry,
        providerResponseDiagnostics: null,
        reasonCodes: unique(["model_task_client_router_preflight_blocked", ...blockedReasonCodes], 80),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      };
    }
    if (classification.providerPath === "runtime_only" || !classification.selectedModelRef) {
      return {
        status: "blocked",
        responseText: null,
        responseHash: null,
        latencyMs: null,
        classification: classification as unknown as JsonValue,
        preflight,
        telemetry,
        providerResponseDiagnostics: null,
        reasonCodes: ["model_task_client_router_provider_not_callable"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      };
    }
    const adapter = this.adapters.get(classification.providerPath);
    if (!adapter) {
      return {
        status: "blocked",
        responseText: null,
        responseHash: null,
        latencyMs: null,
        classification: classification as unknown as JsonValue,
        preflight,
        telemetry,
        providerResponseDiagnostics: null,
        reasonCodes: [`model_task_client_router_provider_adapter_missing:${classification.providerPath}`],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      };
    }
    const result = await adapter.executeJson({
      modelRef: classification.selectedModelRef,
      providerPath: classification.providerPath,
      systemPrompt: input.systemPrompt,
      userPayload: input.userPayload,
      maxOutputTokens: input.maxOutputTokens,
      timeoutMs: input.timeoutMs,
      reasoningMode: classification.reasoningMode,
      responseFormatMode: classification.responseFormatMode,
      taskClass: classification.taskClass,
      callSite: classification.callSite,
    });
    return {
      status: result.status,
      responseText: result.responseText,
      responseHash: result.responseHash,
      latencyMs: result.latencyMs,
      classification: classification as unknown as JsonValue,
      preflight,
      telemetry: buildModelTaskTelemetryEnvelope({
        classification,
        usage: result.usage ?? null,
        usageUnavailableReason: result.usage ? null : "provider_usage_not_returned",
      }),
      providerResponseDiagnostics: result.providerResponseDiagnostics ?? null,
      reasonCodes: unique(
        [
          "model_task_client_router_provider_call_completed",
          result.errorReasonCode ?? null,
          ...preflight.reasonCodes,
        ],
        80,
      ),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
  }
}

export function normalizeResourceSelectionToolCall(
  value: unknown,
): ResourceSelectionToolCall {
  return ResourceSelectionToolCallSchema.parse(value);
}

export function resourceSelectionDecisionFromToolCall(
  toolCall: ResourceSelectionToolCall,
): ResourceSelectionDecision {
  if (toolCall.toolName === "resource.selection.mark_blocked") {
    return ResourceSelectionDecisionSchema.parse({
      artifactKind: "resource_selection_decision",
      schemaVersion: RESOURCE_SELECTION_SCHEMA_VERSION,
      status: "blocked",
      selectedResourceRefs: [],
      resourceIntents: [],
      validationDiscoveryPlan: [],
      selectionRationale: toolCall.arguments.selectionRationale,
      blockerSummary: toolCall.arguments.blockerSummary,
      missingContextQuestions: toolCall.arguments.missingContextQuestions,
      sourceToolName: toolCall.toolName,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  return ResourceSelectionDecisionSchema.parse({
    artifactKind: "resource_selection_decision",
    schemaVersion: RESOURCE_SELECTION_SCHEMA_VERSION,
    status: "selected",
    selectedResourceRefs: toolCall.arguments.selectedResourceRefs,
    resourceIntents: toolCall.arguments.resourceIntents,
    validationDiscoveryPlan: toolCall.arguments.validationDiscoveryPlan,
    selectionRationale: toolCall.arguments.selectionRationale,
    blockerSummary: null,
    missingContextQuestions: [],
    sourceToolName: toolCall.toolName,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  });
}

export function parseResourceSelectionModelToolCall(responseText: string | null): {
  status: "accepted" | "needs_review";
  toolCall: ResourceSelectionToolCall | null;
  decision: ResourceSelectionDecision | null;
  schemaErrorPath: string | null;
  reasonCodes: string[];
} {
  const text = responseText?.trim() ?? "";
  const jsonTexts = extractJsonObjectTexts(text);
  let firstError: unknown = null;
  let parseCandidateCount = 0;
  for (const jsonText of jsonTexts) {
    parseCandidateCount += 1;
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const toolCall = normalizeResourceSelectionToolCall(parsed);
      return {
        status: "accepted",
        toolCall,
        decision: resourceSelectionDecisionFromToolCall(toolCall),
        schemaErrorPath: null,
        reasonCodes: [
          "resource_selection_tool_call_accepted",
          ...(parseCandidateCount > 1 ? ["resource_selection_tool_call_candidate_scan_used"] : []),
        ],
      };
    } catch (error) {
      firstError ??= error;
    }
  }
  try {
    throw firstError ?? new SyntaxError("resource_selection_tool_call_json_missing");
  } catch (error) {
    return {
      status: "needs_review",
      toolCall: null,
      decision: null,
      schemaErrorPath: error instanceof z.ZodError ? (error.issues[0]?.path.join(".") ?? null) : null,
      reasonCodes: [
        "resource_selection_tool_call_invalid",
        error instanceof SyntaxError ? "resource_selection_tool_call_json_parse_failed" : null,
      ].filter((code): code is string => Boolean(code)),
    };
  }
}

export function buildDomainResourceSelectionRequest(input: {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  sourceWorkUnitId?: string | null;
  workIntentRef?: string | null;
  workIntentContextResolutionRef?: string | null;
  contextSatisfactionStateRef?: string | null;
  acceptedResourceHandoffRefs?: string[];
  targetCommitmentIds?: string[];
  capabilityIds?: string[];
  evidenceRequirements?: string[];
  authorityScopeRefs?: string[];
  manifest: ResourceSelectionHandleManifest;
}): DomainResourceSelectionRequest {
  const requestBase = {
    artifactKind: "domain_resource_selection_request" as const,
    schemaVersion: DOMAIN_RESOURCE_SELECTION_REQUEST_SCHEMA_VERSION,
    requestId: `${input.nodeId}:domain-resource-selection-request`,
    requestRef: "pending",
    requestHash: "pending",
    runtimeJobId: bounded(input.runtimeJobId, 180),
    workflowId: bounded(input.workflowId, 180),
    graphId: bounded(input.graphId, 180),
    nodeId: bounded(input.nodeId, 180),
    sourceWorkUnitId: bounded(input.sourceWorkUnitId ?? input.nodeId, 180),
    workIntentRef: input.workIntentRef ? bounded(input.workIntentRef, 420) : null,
    workIntentContextResolutionRef: input.workIntentContextResolutionRef
      ? bounded(input.workIntentContextResolutionRef, 420)
      : null,
    contextSatisfactionStateRef: input.contextSatisfactionStateRef
      ? bounded(input.contextSatisfactionStateRef, 420)
      : null,
    acceptedResourceHandoffRefs: unique(input.acceptedResourceHandoffRefs ?? [], 120),
    targetCommitmentIds: unique(input.targetCommitmentIds ?? input.manifest.targetCommitmentIds, 24),
    capabilityIds: unique(input.capabilityIds ?? input.manifest.capabilityIds, 12),
    evidenceRequirements: unique(
      input.evidenceRequirements ?? input.manifest.evidenceRequirements,
      16,
    ),
    authorityScopeRefs: unique(input.authorityScopeRefs ?? [], 40),
    candidateHandleManifestRef: input.manifest.manifestRef,
    candidateHandleManifestHash: input.manifest.manifestHash,
    candidateResourceRefs: unique(
      input.manifest.candidateHandles.map((handle) => handle.resourceRef),
      160,
    ),
    nextLegalTools: [
      "resource.selection.propose" as const,
      "resource.selection.mark_blocked" as const,
    ],
    reasonCodes: unique(
      [
        "domain_resource_selection_request_compiled",
        ...(input.manifest.budgetStatus === "over_budget"
          ? ["domain_resource_selection_request_manifest_over_budget"]
          : ["domain_resource_selection_request_manifest_within_budget"]),
      ],
      80,
    ),
    semanticQualityJudgedByDeterministicCode: false as const,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawDbRowsStored: false as const,
  };
  const requestHash = `sha256:${hashValue(requestBase)}`;
  return DomainResourceSelectionRequestSchema.parse({
    ...requestBase,
    requestHash,
    requestRef: `runtime-work-graph://domain-resource-selection-request/${requestBase.requestId}/${requestHash.slice(7, 23)}`,
  });
}

export function domainResourceSelectionProposalFromToolCall(
  toolCall: DomainResourceSelectionToolCall,
): DomainResourceSelectionProposal {
  if (toolCall.toolName === "resource.selection.mark_blocked") {
    return DomainResourceSelectionProposalSchema.parse({
      artifactKind: "domain_resource_selection_proposal",
      schemaVersion: DOMAIN_RESOURCE_SELECTION_PROPOSAL_SCHEMA_VERSION,
      status: "blocked",
      selectedTargetRefs: [],
      fileChangeIntents: [],
      validationDiscoveryPlan: [],
      selectionRationale: toolCall.arguments.selectionRationale,
      excludedCandidateRefs: toolCall.arguments.excludedCandidateRefs,
      blockerSummary: toolCall.arguments.blockerSummary,
      missingContextQuestions: toolCall.arguments.missingContextQuestions,
      sourceToolName: toolCall.toolName,
      semanticQualityJudgedByDeterministicCode: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  return DomainResourceSelectionProposalSchema.parse({
    artifactKind: "domain_resource_selection_proposal",
    schemaVersion: DOMAIN_RESOURCE_SELECTION_PROPOSAL_SCHEMA_VERSION,
    status: "proposed",
    selectedTargetRefs: toolCall.arguments.selectedTargetRefs,
    fileChangeIntents: toolCall.arguments.fileChangeIntents,
    validationDiscoveryPlan: toolCall.arguments.validationDiscoveryPlan,
    selectionRationale: toolCall.arguments.selectionRationale,
    excludedCandidateRefs: toolCall.arguments.excludedCandidateRefs,
    blockerSummary: null,
    missingContextQuestions: [],
    sourceToolName: toolCall.toolName,
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  });
}

function normalizeDomainResourceSelectionToolCall(
  value: unknown,
): DomainResourceSelectionToolCall {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const toolName =
    typeof record.toolName === "string"
      ? record.toolName
      : typeof record.toolId === "string"
        ? record.toolId
        : typeof record.tool === "string"
          ? record.tool
          : typeof record.name === "string"
            ? record.name
            : null;
  const argumentsValue =
    record.arguments && typeof record.arguments === "object" && !Array.isArray(record.arguments)
      ? record.arguments
      : record.input && typeof record.input === "object" && !Array.isArray(record.input)
        ? record.input
        : record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
          ? record.payload
          : null;
  if (toolName && argumentsValue) {
    return DomainResourceSelectionToolCallSchema.parse({
      toolName,
      arguments: normalizeDomainResourceSelectionArguments(toolName, argumentsValue),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  if (
    Array.isArray(record.selectedTargetRefs) ||
    Array.isArray(record.fileChangeIntents) ||
    typeof record.selectionRationale === "string"
  ) {
    return DomainResourceSelectionToolCallSchema.parse({
      toolName: "resource.selection.propose",
      arguments: normalizeDomainResourceSelectionArguments("resource.selection.propose", record),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  if (
    typeof record.blockerSummary === "string" ||
    Array.isArray(record.missingContextQuestions)
  ) {
    return DomainResourceSelectionToolCallSchema.parse({
      toolName: "resource.selection.mark_blocked",
      arguments: normalizeDomainResourceSelectionArguments("resource.selection.mark_blocked", record),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  return DomainResourceSelectionToolCallSchema.parse(value);
}

function normalizeDomainResourceSelectionArguments(
  toolName: string,
  value: unknown,
): Record<string, unknown> {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  if (toolName === "resource.selection.mark_blocked") {
    return {
      blockerSummary:
        stringValue(record.blockerSummary) ??
        stringValue(record.summary) ??
        stringValue(record.reason) ??
        "Model marked domain resource selection blocked.",
      missingContextQuestions: stringArrayValue(
        record.missingContextQuestions ??
          record.questions ??
          record.missingQuestions,
      ),
      selectionRationale:
        stringValue(record.selectionRationale) ??
        stringValue(record.rationale) ??
        stringValue(record.reason) ??
        "Model reported insufficient domain resources.",
      excludedCandidateRefs: stringArrayValue(
        record.excludedCandidateRefs ??
          record.excludedRefs ??
          record.rejectedRefs,
      ),
    };
  }
  const selectedTargetRefs = stringArrayValue(
    record.selectedTargetRefs ??
      record.selectedResourceRefs ??
      record.targetRefs ??
      record.resourceRefs ??
      record.selectedRefs,
  );
  const fileChangeIntents = normalizeDomainResourceSelectionFileChangeIntents(
    record.fileChangeIntents ??
      record.resourceIntents ??
      record.intents ??
      record.targetIntents,
  );
  return {
    selectedTargetRefs:
      selectedTargetRefs.length > 0
        ? selectedTargetRefs
        : unique(
            fileChangeIntents
              .map((intent) => intent.targetRef)
              .filter((ref): ref is string => typeof ref === "string" && ref.length > 0),
            80,
          ),
    fileChangeIntents,
    validationDiscoveryPlan: stringArrayValue(
      record.validationDiscoveryPlan ??
        record.validationPlan ??
        record.validationRefs ??
        record.validation,
    ),
    selectionRationale:
      stringValue(record.selectionRationale) ??
      stringValue(record.rationale) ??
      stringValue(record.reason) ??
      stringValue(record.summary) ??
      "Model selected target refs from legal domain resource candidates.",
    excludedCandidateRefs: stringArrayValue(
      record.excludedCandidateRefs ??
        record.excludedRefs ??
        record.rejectedRefs,
    ),
  };
}

function normalizeDomainResourceSelectionFileChangeIntents(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const record = item as Record<string, unknown>;
      const targetRef =
        stringValue(record.targetRef) ??
        stringValue(record.resourceRef) ??
        stringValue(record.ref) ??
        stringValue(record.fileRef) ??
        "";
      const rationale =
        stringValue(record.rationale) ??
        stringValue(record.reason) ??
        stringValue(record.summary) ??
        "Model selected this target resource.";
      return {
        targetRef,
        operation: normalizeDomainResourceSelectionOperation(record.operation),
        intendedChange:
          stringValue(record.intendedChange) ??
          stringValue(record.intendedUse) ??
          stringValue(record.change) ??
          rationale,
        sourceCommitmentIds: stringArrayValue(
          record.sourceCommitmentIds ??
            record.commitmentIds ??
            record.targetCommitmentIds,
        ),
        resourceHandoffRefs: stringArrayValue(
          record.resourceHandoffRefs ??
            record.handoffRefs ??
            record.sourceRefs,
        ),
        expectedEvidenceMode: stringArrayValue(
          record.expectedEvidenceMode ??
            record.evidenceMode ??
            record.evidenceRequirements,
        ),
        validationDiscoveryNeed:
          stringValue(record.validationDiscoveryNeed) ??
          stringValue(record.validationNeed) ??
          stringValue(record.validation) ??
          "Run the relevant validation for this selected target.",
        authorityScopeRef:
          stringValue(record.authorityScopeRef) ??
          stringValue(record.authorityRef) ??
          targetRef,
        rationale,
      };
    });
}

function normalizeDomainResourceSelectionOperation(value: unknown): DomainResourceSelectionOperation {
  const operation = String(value ?? "").trim().toLowerCase();
  if (operation === "edit" || operation === "update" || operation === "change") {
    return "modify";
  }
  if (operation === "add" || operation === "new") {
    return "create";
  }
  if (operation === "remove") {
    return "delete";
  }
  if (operation === "inspect" || operation === "read" || operation === "readonly") {
    return "inspect_only";
  }
  return DomainResourceSelectionOperationSchema.safeParse(operation).success
    ? (operation as DomainResourceSelectionOperation)
    : "modify";
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stringArrayValue(value: unknown): string[] {
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  return Array.isArray(value)
    ? unique(
        value
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim()),
        80,
      )
    : [];
}

export function parseDomainResourceSelectionModelToolCall(responseText: string | null): {
  status: "accepted" | "needs_review";
  toolCall: DomainResourceSelectionToolCall | null;
  proposal: DomainResourceSelectionProposal | null;
  schemaErrorPath: string | null;
  reasonCodes: string[];
} {
  const text = responseText?.trim() ?? "";
  const jsonTexts = extractJsonObjectTexts(text);
  let firstError: unknown = null;
  let parseCandidateCount = 0;
  for (const jsonText of jsonTexts) {
    parseCandidateCount += 1;
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const toolCall = normalizeDomainResourceSelectionToolCall(parsed);
      return {
        status: "accepted",
        toolCall,
        proposal: domainResourceSelectionProposalFromToolCall(toolCall),
        schemaErrorPath: null,
        reasonCodes: [
          "domain_resource_selection_tool_call_accepted",
          ...(parseCandidateCount > 1 ? ["domain_resource_selection_tool_call_candidate_scan_used"] : []),
        ],
      };
    } catch (error) {
      firstError ??= error;
    }
  }
  try {
    throw firstError ?? new SyntaxError("domain_resource_selection_tool_call_json_missing");
  } catch (error) {
    return {
      status: "needs_review",
      toolCall: null,
      proposal: null,
      schemaErrorPath: error instanceof z.ZodError ? (error.issues[0]?.path.join(".") ?? null) : null,
      reasonCodes: [
        "domain_resource_selection_tool_call_invalid",
        error instanceof SyntaxError ? "domain_resource_selection_tool_call_json_parse_failed" : null,
      ].filter((code): code is string => Boolean(code)),
    };
  }
}

export function compileDomainResourceSelectionDecision(input: {
  request: DomainResourceSelectionRequest;
  manifest: ResourceSelectionHandleManifest;
  proposal: DomainResourceSelectionProposal;
}): DomainResourceSelectionDecision {
  const candidateRefs = unique(input.manifest.candidateHandles.map((handle) => handle.resourceRef), 160);
  const candidateSet = new Set(candidateRefs);
  const requestAuthorityRefs = unique(input.request.authorityScopeRefs, 120);
  const selectedTargetRefs =
    input.proposal.status === "blocked" ? [] : unique(input.proposal.selectedTargetRefs, 80);
  const intentTargetRefs = new Set(input.proposal.fileChangeIntents.map((intent) => intent.targetRef));
  const invalidSelections = selectedTargetRefs.filter((ref) => !candidateSet.has(ref));
  const uncoveredSelectedTargetRefs = selectedTargetRefs.filter((ref) => !intentTargetRefs.has(ref));
  const unauthorizedSelections = selectedTargetRefs.filter((ref) => {
    if (requestAuthorityRefs.length === 0) {
      return false;
    }
    const handle = input.manifest.candidateHandles.find((candidate) => candidate.resourceRef === ref);
    if (!handle) {
      return false;
    }
    return !requestAuthorityRefs.some((authorityRef) => authorityScopeCoversRef(authorityRef, ref));
  });
  const resourceHandoffRefs = new Set(input.request.acceptedResourceHandoffRefs);
  const handleProvenanceCoversResourceHandoff = (targetRef: string): boolean => {
    if (resourceHandoffRefs.size === 0) {
      return true;
    }
    const handle = input.manifest.candidateHandles.find((candidate) => candidate.resourceRef === targetRef);
    if (!handle) {
      return false;
    }
    return [
      ...handle.sourceRefs,
      handle.payloadRef,
      handle.omittedBodyRef,
    ].some((ref) => typeof ref === "string" && resourceHandoffRefs.has(ref));
  };
  const resourceHandoffCoverageMissingRefs = input.proposal.fileChangeIntents
    .filter(
      (intent) =>
        resourceHandoffRefs.size > 0 &&
        !intent.resourceHandoffRefs.some((ref) => resourceHandoffRefs.has(ref)) &&
        !handleProvenanceCoversResourceHandoff(intent.targetRef),
    )
    .map((intent) => intent.targetRef);
  const reasonCodes = unique(
    [
      "domain_resource_selection_decision_compiled",
      ...(input.proposal.status === "blocked" ? ["domain_resource_selection_model_marked_blocked"] : []),
      ...(selectedTargetRefs.length > 0 ? [] : ["domain_resource_selection_selected_refs_missing"]),
      ...(invalidSelections.length > 0 ? ["domain_resource_selection_selected_refs_not_in_candidate_set"] : []),
      ...(uncoveredSelectedTargetRefs.length > 0
        ? ["domain_resource_selection_file_change_intent_coverage_missing"]
        : []),
      ...(unauthorizedSelections.length > 0 ? ["domain_resource_selection_authority_scope_mismatch"] : []),
      ...(resourceHandoffCoverageMissingRefs.length > 0
        ? ["domain_resource_selection_resource_handoff_coverage_missing"]
        : []),
      ...(input.proposal.fileChangeIntents.length > 0
        ? ["domain_resource_selection_file_change_intents_model_authored"]
        : []),
    ],
    100,
  );
  const status =
    input.manifest.budgetStatus === "within_budget" &&
    input.proposal.status === "proposed" &&
    selectedTargetRefs.length > 0 &&
    invalidSelections.length === 0 &&
    uncoveredSelectedTargetRefs.length === 0 &&
    unauthorizedSelections.length === 0 &&
    resourceHandoffCoverageMissingRefs.length === 0
      ? "accepted"
      : "needs_review";
  const decisionBase = {
    artifactKind: "domain_resource_selection_decision" as const,
    schemaVersion: DOMAIN_RESOURCE_SELECTION_DECISION_SCHEMA_VERSION,
    decisionId: `${input.request.nodeId}:domain-resource-selection-decision`,
    decisionRef: "pending",
    decisionHash: "pending",
    requestRef: input.request.requestRef,
    candidateHandleManifestRef: input.manifest.manifestRef,
    status,
    selectedTargetRefs,
    fileChangeIntents: input.proposal.status === "blocked" ? [] : input.proposal.fileChangeIntents,
    validationDiscoveryPlan: input.proposal.validationDiscoveryPlan,
    selectionRationale: input.proposal.selectionRationale,
    blockerSummary: input.proposal.blockerSummary,
    missingContextQuestions: input.proposal.missingContextQuestions,
    invalidSelections: unique(invalidSelections, 80),
    uncoveredSelectedTargetRefs: unique(uncoveredSelectedTargetRefs, 80),
    unauthorizedSelections: unique(unauthorizedSelections, 80),
    resourceHandoffCoverageMissingRefs: unique(resourceHandoffCoverageMissingRefs, 80),
    excludedCandidateRefs: input.proposal.excludedCandidateRefs,
    reasonCodes,
    nextLegalTransition:
      status === "accepted"
        ? "resource.selection.accept" as const
        : input.proposal.status === "blocked"
          ? "scheduler.request_resource_requirement_for_work_intent" as const
          : "resource.selection.request_revision" as const,
    semanticQualityJudgedByDeterministicCode: false as const,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawDbRowsStored: false as const,
  };
  const decisionHash = `sha256:${hashValue(decisionBase)}`;
  return DomainResourceSelectionDecisionSchema.parse({
    ...decisionBase,
    decisionHash,
    decisionRef: `runtime-work-graph://domain-resource-selection-decision/${decisionBase.decisionId}/${decisionHash.slice(7, 23)}`,
  });
}

export function resourceSelectionDecisionFromDomainResourceSelectionDecision(
  decision: DomainResourceSelectionDecision,
): ResourceSelectionDecision {
  if (decision.status !== "accepted") {
    return ResourceSelectionDecisionSchema.parse({
      artifactKind: "resource_selection_decision",
      schemaVersion: RESOURCE_SELECTION_SCHEMA_VERSION,
      status: "blocked",
      selectedResourceRefs: [],
      resourceIntents: [],
      validationDiscoveryPlan: [],
      selectionRationale: decision.selectionRationale,
      blockerSummary:
        decision.blockerSummary ?? decision.reasonCodes.slice(0, 12).join(", "),
      missingContextQuestions: decision.missingContextQuestions,
      sourceToolName: "resource.selection.mark_blocked",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  return ResourceSelectionDecisionSchema.parse({
    artifactKind: "resource_selection_decision",
    schemaVersion: RESOURCE_SELECTION_SCHEMA_VERSION,
    status: "selected",
    selectedResourceRefs: decision.selectedTargetRefs,
    resourceIntents: decision.fileChangeIntents.map((intent) => ({
      resourceRef: intent.targetRef,
      intentKind: intent.operation,
      intendedUse: intent.intendedChange,
      rationale: intent.rationale,
      validationHintRefs: unique(intent.resourceHandoffRefs, 12),
    })),
    validationDiscoveryPlan: decision.validationDiscoveryPlan,
    selectionRationale: decision.selectionRationale,
    blockerSummary: null,
    missingContextQuestions: [],
    sourceToolName: "resource.selection.propose",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  });
}

export function buildResourceSelectionHandleManifest(input: {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  sourceWorkUnitId?: string | null;
  domainKind: string;
  objectiveSnippet: string;
  targetCommitmentIds?: string[];
  capabilityIds?: string[];
  evidenceRequirements?: string[];
  candidateHandles: ResourceSelectionCandidateHandle[];
  maxInputBytes: number;
}): ResourceSelectionHandleManifest {
  const manifestBase = {
    artifactKind: "resource_selection_handle_manifest" as const,
    schemaVersion: "execution-platform.resource-selection-handle-manifest.v1" as const,
    manifestId: `${input.nodeId}:resource-selection-handles`,
    manifestRef: "pending",
    manifestHash: "pending",
    runtimeJobId: bounded(input.runtimeJobId, 180),
    workflowId: bounded(input.workflowId, 180),
    graphId: bounded(input.graphId, 180),
    nodeId: bounded(input.nodeId, 180),
    sourceWorkUnitId: bounded(input.sourceWorkUnitId ?? input.nodeId, 180),
    domainKind: bounded(input.domainKind, 120),
    objectiveSnippet: bounded(input.objectiveSnippet, 1_200),
    targetCommitmentIds: unique(input.targetCommitmentIds ?? [], 24),
    capabilityIds: unique(input.capabilityIds ?? [], 12),
    evidenceRequirements: unique(input.evidenceRequirements ?? [], 16),
    candidateHandles: input.candidateHandles.map((handle) =>
      ResourceSelectionCandidateHandleSchema.parse({
        ...handle,
        objectiveSnippet: handle.objectiveSnippet ? bounded(handle.objectiveSnippet, 900) : null,
        contextSummary: handle.contextSummary ? bounded(handle.contextSummary, 900) : null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      }),
    ),
    omittedPayloadRefs: unique(
      input.candidateHandles.flatMap((handle) => [handle.payloadRef, handle.omittedBodyRef]),
      160,
    ),
    omittedPayloadHashes: unique(
      input.candidateHandles.flatMap((handle) => [handle.payloadHash, handle.omittedBodyHash]),
      160,
    ),
    inputByteCount: 0,
    maxInputBytes: Math.max(1, Math.trunc(input.maxInputBytes)),
    budgetStatus: "within_budget" as const,
    reasonCodes: ["resource_selection_handle_manifest_compiled"],
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawDbRowsStored: false as const,
  };
  const hash = `sha256:${hashValue(manifestBase)}`;
  const withRef = {
    ...manifestBase,
    manifestHash: hash,
    manifestRef: `runtime-work-graph://resource-selection-handle-manifest/${manifestBase.manifestId}/${hash.slice(7, 23)}`,
  };
  const inputByteCount = Buffer.byteLength(JSON.stringify(withRef), "utf8");
  return ResourceSelectionHandleManifestSchema.parse({
    ...withRef,
    inputByteCount,
    budgetStatus: inputByteCount <= withRef.maxInputBytes ? "within_budget" : "over_budget",
    reasonCodes: [
      ...withRef.reasonCodes,
      ...(inputByteCount <= withRef.maxInputBytes
        ? ["resource_selection_payload_within_budget"]
        : ["resource_selection_payload_over_budget", "domain_resource_selection_payload_over_budget"]),
    ],
  });
}

export function compileResourceSelectionPacket(input: {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  sourceWorkUnitId?: string | null;
  domainKind: string;
  targetCommitmentIds?: string[];
  manifest: ResourceSelectionHandleManifest;
  decision: ResourceSelectionDecision;
  modelTaskBoundaryId?: string | null;
  modelTaskPolicyRef?: string | null;
  providerPath?: string | null;
  modelRef?: string | null;
}): ResourceSelectionPacket {
  const candidateRefs = unique(input.manifest.candidateHandles.map((handle) => handle.resourceRef), 160);
  const candidateSet = new Set(candidateRefs);
  const selectedResourceRefs =
    input.decision.status === "blocked" ? [] : unique(input.decision.selectedResourceRefs, 80);
  const intentRefs = new Set(input.decision.resourceIntents.map((intent) => intent.resourceRef));
  const invalidSelections = selectedResourceRefs.filter((ref) => !candidateSet.has(ref));
  const uncoveredSelectedResourceRefs = selectedResourceRefs.filter((ref) => !intentRefs.has(ref));
  const reasonCodes = [
    "resource_selection_packet_compiler_used",
    ...(input.manifest.budgetStatus === "over_budget"
      ? ["resource_selection_payload_over_budget", "domain_resource_selection_payload_over_budget"]
      : []),
    ...(input.decision.status === "blocked" ? ["resource_selection_model_marked_blocked"] : []),
    ...(selectedResourceRefs.length > 0 ? [] : ["resource_selection_selected_refs_missing"]),
    ...(invalidSelections.length > 0 ? ["resource_selection_selected_refs_not_in_candidate_set"] : []),
    ...(uncoveredSelectedResourceRefs.length > 0
      ? ["resource_selection_intent_coverage_missing"]
      : []),
    ...(input.decision.resourceIntents.length > 0
      ? ["resource_selection_intents_model_authored"]
      : []),
  ];
  const status =
    input.manifest.budgetStatus === "within_budget" &&
    input.decision.status === "selected" &&
    selectedResourceRefs.length > 0 &&
    invalidSelections.length === 0 &&
    uncoveredSelectedResourceRefs.length === 0
      ? "accepted"
      : "needs_review";
  const packetBase = {
    packetKind: "resource_selection_packet" as const,
    schemaVersion: "execution-platform.resource-selection-packet.v1" as const,
    packetId: `${input.nodeId}:resource-selection`,
    packetRef: "pending",
    runtimeJobId: bounded(input.runtimeJobId, 180),
    workflowId: bounded(input.workflowId, 180),
    graphId: bounded(input.graphId, 180),
    nodeId: bounded(input.nodeId, 180),
    sourceWorkUnitId: bounded(input.sourceWorkUnitId ?? input.nodeId, 180),
    domainKind: bounded(input.domainKind, 120),
    targetCommitmentIds: unique(input.targetCommitmentIds ?? [], 24),
    candidateResourceRefs: candidateRefs,
    selectedResourceRefs,
    resourceIntents:
      input.decision.status === "blocked"
        ? []
        : input.decision.resourceIntents.map((intent) => ({
            ...intent,
            validationHintRefs: unique(intent.validationHintRefs, 12),
          })),
    validationDiscoveryPlan: unique(input.decision.validationDiscoveryPlan, 24),
    selectionRationale: input.decision.selectionRationale,
    blockerSummary: input.decision.blockerSummary,
    missingContextQuestions: input.decision.missingContextQuestions,
    status,
    reasonCodes: unique(reasonCodes, 80),
    invalidSelections: unique(invalidSelections, 80),
    uncoveredSelectedResourceRefs: unique(uncoveredSelectedResourceRefs, 80),
    candidateHandleManifestRef: input.manifest.manifestRef,
    candidateHandleManifestHash: input.manifest.manifestHash,
    modelTaskBoundaryId: bounded(input.modelTaskBoundaryId ?? "domain_resource_selection", 180),
    modelTaskPolicyRef: bounded(input.modelTaskPolicyRef ?? "model-task-policy://unknown", 260),
    providerPath: bounded(input.providerPath ?? "unknown", 120),
    modelRef: bounded(input.modelRef ?? "unknown", 260),
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
  };
  const hash = hashValue(packetBase).slice(0, 16);
  return ResourceSelectionPacketSchema.parse({
    ...packetBase,
    packetRef: `runtime-work-graph://resource-selection-packet/${packetBase.packetId}/${hash}`,
  });
}

export function buildResourceSelectionFieldRepairRequest(input: {
  nodeId: string;
  packet?: ResourceSelectionPacket | null;
  manifest?: ResourceSelectionHandleManifest | null;
  schemaErrorPath?: string | null;
  parserReasonCodes?: string[];
}): ResourceSelectionFieldRepairRequest {
  const packet = input.packet ?? null;
  const manifest = input.manifest ?? null;
  const allowedRefs = packet?.candidateResourceRefs ?? manifest?.candidateHandles.map((handle) => handle.resourceRef) ?? [];
  const fieldRepairs = [
    ...(input.schemaErrorPath
      ? [
          {
            fieldPath: input.schemaErrorPath,
            reasonCode: "resource_selection_tool_call_schema_field_invalid",
            currentValueRef: null,
            allowedValueRefs: [],
            repairInstruction:
              "Repair only this invalid tool-call field and keep the same selected-resource semantics where possible.",
          },
        ]
      : []),
    ...(packet?.invalidSelections ?? []).map((ref) => ({
      fieldPath: "selectedResourceRefs",
      reasonCode: "resource_selection_selected_refs_not_in_candidate_set",
      currentValueRef: ref,
      allowedValueRefs: allowedRefs.slice(0, 80),
      repairInstruction:
        "Replace invalid selected resource refs with refs from candidateResourceRefs or mark the selection blocked.",
    })),
    ...(packet?.uncoveredSelectedResourceRefs ?? []).map((ref) => ({
      fieldPath: "resourceIntents",
      reasonCode: "resource_selection_intent_coverage_missing",
      currentValueRef: ref,
      allowedValueRefs: [ref],
      repairInstruction:
        "Add one resourceIntents entry for this already-selected resource ref; do not regenerate unrelated selections.",
    })),
    ...(packet?.reasonCodes.includes("resource_selection_selected_refs_missing")
      ? [
          {
            fieldPath: "selectedResourceRefs",
            reasonCode: "resource_selection_selected_refs_missing",
            currentValueRef: null,
            allowedValueRefs: allowedRefs.slice(0, 80),
            repairInstruction:
              "Select at least one candidate resource ref or call resource.selection.mark_blocked with precise missing context.",
          },
        ]
      : []),
  ];
  const reasonCodes = unique(
    [
      "resource_selection_field_repair_request_compiled",
      ...(input.parserReasonCodes ?? []),
      ...(packet?.reasonCodes ?? []),
      ...(fieldRepairs.length > 0 ? ["resource_selection_field_specific_repair_required"] : []),
    ],
    80,
  );
  const repairRequestBase = {
    artifactKind: "resource_selection_field_repair_request" as const,
    schemaVersion: RESOURCE_SELECTION_FIELD_REPAIR_SCHEMA_VERSION,
    repairRequestId: `${input.nodeId}:resource-selection-field-repair`,
    repairRequestRef: "pending",
    packetRef: packet?.packetRef ?? null,
    candidateHandleManifestRef: manifest?.manifestRef ?? packet?.candidateHandleManifestRef ?? null,
    status: fieldRepairs.length > 0 ? "repair_required" as const : "no_repair_required" as const,
    fieldRepairs,
    reasonCodes,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
  };
  return ResourceSelectionFieldRepairRequestSchema.parse({
    ...repairRequestBase,
    repairRequestRef: `runtime-work-graph://resource-selection-field-repair/${repairRequestBase.repairRequestId}/${hashValue(repairRequestBase).slice(0, 16)}`,
  });
}

function bounded(value: string, max: number): string {
  const trimmed = String(value ?? "").trim();
  return (trimmed || "unspecified").slice(0, max);
}

function unique(values: Array<string | null | undefined>, max: number): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))].slice(0, max);
}

function authorityScopeCoversRef(authorityScopeRef: string, resourceRef: string): boolean {
  const scope = authorityScopeRef.trim();
  const ref = resourceRef.trim().startsWith("file-window://")
    ? resourceRef.trim().slice("file-window://".length).split("#L")[0] ?? resourceRef.trim()
    : resourceRef.trim();
  if (!scope || !ref) {
    return false;
  }
  return ref === scope || (scope.endsWith("/") && ref.startsWith(scope));
}

function extractJsonObjectTexts(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [trimmed];
  }
  const candidates: string[] = [];
  const fencedMatches = trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu);
  for (const match of fencedMatches) {
    if (match[1]?.trim()) {
      candidates.push(match[1].trim());
    }
  }
  const starts = [...trimmed.matchAll(/\{/gu)].map((match) => match.index ?? -1).filter((index) => index >= 0);
  for (const start of starts) {
    const candidate = extractBalancedJsonObjectFrom(trimmed, start);
    if (candidate) {
      candidates.push(candidate);
    }
  }
  return [...new Set(candidates.length > 0 ? candidates : [trimmed])].slice(0, 20);
}

function extractBalancedJsonObjectFrom(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1).trim();
      }
    }
  }
  return null;
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
