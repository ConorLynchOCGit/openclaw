import { createHash } from "node:crypto";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type {
  AgentTeamModelClient,
  AgentTeamModelClientResult,
} from "./live-agent-team-runner.ts";
import {
  CONTEXT_SCOUT_EXECUTION_PACKET_ARTIFACT_TYPE,
  type ContextScoutExecutionPacket,
  type ContextScoutExecutionPacketCompileInput,
  type ContextScoutExecutionPacketCompileResult,
  type ContextScoutSingleUnitOverProfileBlocker,
  compileContextScoutExecutionPacket,
  contextScoutExecutionPacketMetadata,
} from "../workflows/context-scout-execution-packet.ts";
import {
  CONTEXT_SCOUT_FIELD_REPAIR_REQUEST_ARTIFACT_TYPE,
  CONTEXT_SCOPE_REVISION_DECISION_ARTIFACT_TYPE,
  CONTEXT_SCOPE_REVISION_PROPOSAL_ARTIFACT_TYPE,
  CONTEXT_SCOPE_REVISION_REQUEST_ARTIFACT_TYPE,
  assertContextScopeRevisionManifestMetadata,
  buildContextScoutFieldRepairRequest,
  buildContextScopeRevisionPrompt,
  buildContextScopeRevisionRepairRequest,
  buildContextScopeRevisionRequest,
  compileContextScopeRevisionDecision,
  contextScopeRevisionCompileInputFromDecision,
  contextScopeRevisionDecisionMetadata,
  contextScopeRevisionProposalMetadata,
  contextScopeRevisionRequestMetadata,
  contextScoutFieldRepairRequestMetadata,
  parseContextScopeRevisionProposal,
  type ContextScoutFieldRepairRequest,
  type ContextScopeRevisionDecision,
  type ContextScopeRevisionProposal,
  type ContextScopeRevisionRequest,
} from "../workflows/context-scope-revision.ts";
import type {
  SchedulerRuntimeToolId,
  SchedulerRuntimeToolInvocationSummary,
} from "../workflows/scheduler-runtime-tools.ts";

const SAFETY_FLAGS = {
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  secretsStored: false,
} as const;

export type ContextScopeRevisionProductionToolInvoker = (input: {
  toolId: SchedulerRuntimeToolId;
  idempotencyKey: string;
  inputRef: string;
  inputSummary: string;
  metadata: JsonValue;
  volatileInput?: unknown;
}) => Promise<SchedulerRuntimeToolInvocationSummary | null>;

export type ContextScopeRevisionProductionResult = {
  status: "succeeded" | "needs_review";
  request: ContextScopeRevisionRequest;
  proposal: ContextScopeRevisionProposal | null;
  decision: ContextScopeRevisionDecision | null;
  repairRequest: ContextScoutFieldRepairRequest | null;
  narrowedResult: ContextScoutExecutionPacketCompileResult | null;
  artifactRefs: string[];
  runtimeToolInvocationRefs: string[];
  reasonCodes: string[];
  providerSummary: JsonValue;
  revisedPacketProviderSummary: JsonValue | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function bytes(value: unknown): number {
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function summarizeScopeRevisionProviderDiagnostics(
  response: AgentTeamModelClientResult | null,
  input: {
    modelId: string;
    modelCandidateId: string;
    promptBytes: number;
    latencyMs: number | null;
    timeoutMs: number;
    retryNumber?: number | null;
    concurrencySlot?: string | null;
    inputBundleHash?: string | null;
    inputBundleRef?: string | null;
  },
): JsonValue {
  const diagnostics = asRecord(response?.providerResponseDiagnostics);
  const finishReasons = Array.isArray(diagnostics.finishReasons)
    ? diagnostics.finishReasons.filter((entry): entry is string => typeof entry === "string")
    : [];
  const contentLengths = Array.isArray(diagnostics.contentLengths)
    ? diagnostics.contentLengths.filter((entry): entry is number => typeof entry === "number")
    : [];
  const timeoutMs =
    typeof diagnostics.timeoutMs === "number" ? diagnostics.timeoutMs : input.timeoutMs;
  const responseBytes = bytes(response?.responseText ?? "");
  return {
    modelRef:
      typeof diagnostics.modelRef === "string" ? diagnostics.modelRef : input.modelId,
    modelCandidateId:
      typeof diagnostics.modelCandidateId === "string"
        ? diagnostics.modelCandidateId
        : input.modelCandidateId,
    providerId: typeof diagnostics.providerId === "string" ? diagnostics.providerId : "openrouter",
    providerPath:
      typeof diagnostics.providerPath === "string" ? diagnostics.providerPath : "openrouter",
    requestByteCount:
      typeof diagnostics.promptByteLength === "number"
        ? diagnostics.promptByteLength
        : input.promptBytes,
    responseByteCount: responseBytes,
    timeoutMs,
    timeoutState:
      response?.errorReasonCode?.includes("timeout") || response?.status === "failed"
        ? "unknown_or_failed"
        : "not_timed_out",
    nativeFinishReason: finishReasons[0] ?? null,
    choiceCount: typeof diagnostics.choiceCount === "number" ? diagnostics.choiceCount : null,
    contentLengths,
    parsedContentLength: response?.responseText ? response.responseText.length : 0,
    retryNumber: input.retryNumber ?? 0,
    concurrencySlot: input.concurrencySlot ?? "resource_scope_revision",
    inputBundleHash: input.inputBundleHash ?? null,
    inputBundleRef: input.inputBundleRef ?? null,
    latencyMs: input.latencyMs,
    usage: response?.usage ?? null,
    usageUnavailableReason:
      response?.usage == null
        ? typeof diagnostics.usageUnavailableReason === "string"
          ? diagnostics.usageUnavailableReason
          : response?.errorReasonCode ?? "usage_unavailable"
        : null,
    status: response?.status ?? "not_called",
    errorReasonCode: response?.errorReasonCode ?? null,
    httpStatus: response?.httpStatus ?? null,
    ...SAFETY_FLAGS,
  } satisfies JsonValue;
}

function metadataRecord(value: JsonValue): Record<string, JsonValue> {
  return asRecord(value) as Record<string, JsonValue>;
}

async function attachArtifact(input: {
  runtimeJobs: RuntimeJobRepository;
  jobId: string;
  artifactType: string;
  uri: string;
  body: JsonValue;
  boundedSummary: string;
  targetCommitmentIds: string[];
  targetNodeIds: string[];
  resourcePacketKind: string;
  readinessStatus: string;
  reasonCodes: string[];
  metadata: JsonValue;
}): Promise<void> {
  assertContextScopeRevisionManifestMetadata(input.metadata);
  await input.runtimeJobs.attachRuntimeArtifactByContract({
    jobId: input.jobId,
    artifactType: input.artifactType,
    uri: input.uri,
    contentType: "application/json",
    body: input.body,
    boundedSummary: input.boundedSummary,
    targetCommitmentIds: input.targetCommitmentIds,
    targetNodeIds: input.targetNodeIds,
    resourcePacketKind: input.resourcePacketKind,
    readinessStatus: input.readinessStatus,
    reasonCodes: input.reasonCodes,
    metadata: metadataRecord(input.metadata),
  });
}

export async function executeContextScopeRevisionProductionTransition(input: {
  runtimeJobs: RuntimeJobRepository;
  jobId: string;
  graphId: string;
  nodeId: string;
  originalInput: ContextScoutExecutionPacketCompileInput;
  parentPacket: ContextScoutExecutionPacket;
  blocker: ContextScoutSingleUnitOverProfileBlocker;
  invokeTool: ContextScopeRevisionProductionToolInvoker;
  modelClient?: AgentTeamModelClient | null;
  modelId: string;
  modelCandidateId: string;
  maxTokens: number;
  timeoutMs: number;
  maxAttempts?: number | null;
  targetCommitmentIds?: string[];
  roleRef?: string | null;
}): Promise<ContextScopeRevisionProductionResult> {
  const artifactRefs: string[] = [];
  const runtimeToolInvocationRefs: string[] = [];
  const request = buildContextScopeRevisionRequest({
    packet: input.parentPacket,
    blocker: input.blocker,
  });
  const requestMetadata = contextScopeRevisionRequestMetadata(request);
  await attachArtifact({
    runtimeJobs: input.runtimeJobs,
    jobId: input.jobId,
    artifactType: CONTEXT_SCOPE_REVISION_REQUEST_ARTIFACT_TYPE,
    uri: request.requestRef,
    body: request as unknown as JsonValue,
    boundedSummary:
      "Model-authored resource scope revision is required for a single over-profile resource unit.",
    targetCommitmentIds: input.parentPacket.targetCommitmentIds,
    targetNodeIds: request.consumerNodeIds,
    resourcePacketKind: "resource_scope_revision_request",
    readinessStatus: request.status,
    reasonCodes: request.reasonCodes,
    metadata: requestMetadata,
  });
  artifactRefs.push(request.requestRef);
  const requestTool = await input.invokeTool({
    toolId: "scheduler.request_resource_scope_revision",
    idempotencyKey: `${input.nodeId}:context-scope-revision-request`,
    inputRef: request.requestRef,
    inputSummary:
      "Request a model-authored legal subset for a single over-profile resource unit.",
    metadata: requestMetadata,
  });
  if (requestTool) {
    runtimeToolInvocationRefs.push(requestTool.invocationRef);
  }

  const prompt = buildContextScopeRevisionPrompt(request);
  const promptBytes = bytes(prompt);
  const promptHash = `sha256:${sha256Text(prompt)}`;
  let response: AgentTeamModelClientResult | null = null;
  const startedAt = Date.now();
  if (input.modelClient) {
    response = await input.modelClient.callRole({
      roleId: "resource_specialist_subturn",
      modelId: input.modelId,
      modelCandidateId: input.modelCandidateId,
      prompt,
      responseFormat: "json_object",
      requestProfileOverride: {
        responseFormatMode: "prompt_only",
        reasoningMode: "none",
        maxTokens: input.maxTokens,
      },
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
      maxAttempts: Math.max(1, Math.min(3, Math.floor(input.maxAttempts ?? 1))),
      taskClass: "local_semantic_extraction",
      modelTaskCallSite: "resource_scope_revision_production_transition",
    });
  }
  const latencyMs = Date.now() - startedAt;
  const providerSummary = summarizeScopeRevisionProviderDiagnostics(response, {
    modelId: input.modelId,
    modelCandidateId: input.modelCandidateId,
    promptBytes,
    latencyMs,
    timeoutMs: input.timeoutMs,
    inputBundleHash: promptHash,
    inputBundleRef: request.requestRef,
    concurrencySlot: `${input.graphId}:${input.nodeId}:scope_revision`,
  });

  if (!response || response.status !== "succeeded" || !response.responseText) {
    const repairRequest = buildContextScoutFieldRepairRequest({
      repairFor: "provider_diagnostics",
      failedArtifactRef: request.requestRef,
      failedDecisionRef: null,
      inputBundleRef: request.requestRef,
      inputBundleHash: promptHash,
      preserveAcceptedFields: [],
      acceptedFieldRefs: [],
      fieldRepairs: [
        {
          fieldPath: "provider.responseText",
          reasonCode: response?.errorReasonCode ?? "resource_scope_revision_model_call_failed",
          expectedType: "nonempty_json_object",
          currentValueRef: response?.status ?? "model_client_missing",
          allowedValueRefs: [],
          repairInstruction:
            "Retry the same scope-revision request with a valid provider response, or terminalize this branch as a provider root cause.",
        },
      ],
      legalCandidateRefs: request.legalCandidateRefs,
      legalWindows: request.legalWindows,
      runtimeJobId: request.runtimeJobId,
      graphId: request.graphId,
      nodeId: request.nodeId,
      reasonCodes: [
        "resource_scope_revision_provider_call_failed",
        response?.errorReasonCode ?? "resource_scope_revision_model_client_missing",
      ],
    });
    await attachArtifact({
      runtimeJobs: input.runtimeJobs,
      jobId: input.jobId,
      artifactType: CONTEXT_SCOUT_FIELD_REPAIR_REQUEST_ARTIFACT_TYPE,
      uri: repairRequest.repairRequestRef,
      body: repairRequest as unknown as JsonValue,
      boundedSummary: "Provider diagnostics blocked resource scope revision execution.",
      targetCommitmentIds: input.parentPacket.targetCommitmentIds,
      targetNodeIds: request.consumerNodeIds,
      resourcePacketKind: "resource_scout_field_repair_request",
      readinessStatus: repairRequest.status,
      reasonCodes: repairRequest.reasonCodes,
      metadata: {
        ...metadataRecord(contextScoutFieldRepairRequestMetadata(repairRequest)),
        providerDiagnostics: providerSummary,
      },
    });
    artifactRefs.push(repairRequest.repairRequestRef);
    const repairTool = await input.invokeTool({
      toolId: "resource.scout.request_field_repair",
      idempotencyKey: `${input.nodeId}:context-scope-revision-provider-repair`,
      inputRef: repairRequest.repairRequestRef,
      inputSummary: "Record provider/root-cause blocker for resource scope revision.",
      metadata: contextScoutFieldRepairRequestMetadata(repairRequest),
    });
    if (repairTool) {
      runtimeToolInvocationRefs.push(repairTool.invocationRef);
    }
    return {
      status: "needs_review",
      request,
      proposal: null,
      decision: null,
      repairRequest,
      narrowedResult: null,
      artifactRefs,
      runtimeToolInvocationRefs,
      providerSummary,
      revisedPacketProviderSummary: null,
      reasonCodes: [
        ...request.reasonCodes,
        "resource_scope_revision_provider_call_failed",
        response?.errorReasonCode ?? "resource_scope_revision_model_client_missing",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
  }

  const proposal = parseContextScopeRevisionProposal({
    request,
    responseText: response.responseText,
  });
  const proposalMetadata = {
    ...metadataRecord(contextScopeRevisionProposalMetadata(proposal)),
    providerDiagnostics: providerSummary,
    responseHash: response.responseHash ? `sha256:${response.responseHash}` : null,
  } satisfies JsonValue;
  await attachArtifact({
    runtimeJobs: input.runtimeJobs,
    jobId: input.jobId,
    artifactType: CONTEXT_SCOPE_REVISION_PROPOSAL_ARTIFACT_TYPE,
    uri: proposal.proposalRef,
    body: proposal as unknown as JsonValue,
    boundedSummary: proposal.scopeRationale || proposal.unshardableRationale || proposal.toolId,
    targetCommitmentIds: input.parentPacket.targetCommitmentIds,
    targetNodeIds: request.consumerNodeIds,
    resourcePacketKind: "resource_scope_revision_proposal",
    readinessStatus: proposal.parseStatus,
    reasonCodes: proposal.reasonCodes,
    metadata: proposalMetadata,
  });
  artifactRefs.push(proposal.proposalRef);
  const proposalTool = await input.invokeTool({
    toolId:
      proposal.toolId === "resource.scope.explain_unshardable_unit"
        ? "resource.scope.explain_unshardable_unit"
        : "resource.scope.select_legal_subset",
    idempotencyKey: `${input.nodeId}:context-scope-revision-proposal`,
    inputRef: proposal.proposalRef,
    inputSummary:
      "Record model-authored resource scope revision proposal from legal refs/windows.",
    metadata: contextScopeRevisionProposalMetadata(proposal),
  });
  if (proposalTool) {
    runtimeToolInvocationRefs.push(proposalTool.invocationRef);
  }

  const decision = compileContextScopeRevisionDecision({ request, proposal });
  const decisionMetadata = contextScopeRevisionDecisionMetadata(decision);
  await attachArtifact({
    runtimeJobs: input.runtimeJobs,
    jobId: input.jobId,
    artifactType: CONTEXT_SCOPE_REVISION_DECISION_ARTIFACT_TYPE,
    uri: decision.decisionRef,
    body: decision as unknown as JsonValue,
    boundedSummary: `resource scope revision decision: ${decision.status}`,
    targetCommitmentIds: input.parentPacket.targetCommitmentIds,
    targetNodeIds: request.consumerNodeIds,
    resourcePacketKind: "resource_scope_revision_decision",
    readinessStatus: decision.status,
    reasonCodes: decision.reasonCodes,
    metadata: decisionMetadata,
  });
  artifactRefs.push(decision.decisionRef);

  let repairRequest: ContextScoutFieldRepairRequest | null = null;
  let narrowedResult: ContextScoutExecutionPacketCompileResult | null = null;
  let revisedPacketProviderSummary: JsonValue | null = null;
  let revisedPacketProviderSucceeded = false;
  if (decision.status === "repair_required") {
    repairRequest = buildContextScopeRevisionRepairRequest({
      request,
      decision,
      inputBundleRef: request.requestRef,
      inputBundleHash: promptHash,
    });
    const repairMetadata = contextScoutFieldRepairRequestMetadata(repairRequest);
    await attachArtifact({
      runtimeJobs: input.runtimeJobs,
      jobId: input.jobId,
      artifactType: CONTEXT_SCOUT_FIELD_REPAIR_REQUEST_ARTIFACT_TYPE,
      uri: repairRequest.repairRequestRef,
      body: repairRequest as unknown as JsonValue,
      boundedSummary: "Field-specific resource scope revision repair request.",
      targetCommitmentIds: input.parentPacket.targetCommitmentIds,
      targetNodeIds: request.consumerNodeIds,
      resourcePacketKind: "resource_scout_field_repair_request",
      readinessStatus: repairRequest.status,
      reasonCodes: repairRequest.reasonCodes,
      metadata: repairMetadata,
    });
    artifactRefs.push(repairRequest.repairRequestRef);
    const repairTool = await input.invokeTool({
      toolId: "resource.scout.request_field_repair",
      idempotencyKey: `${input.nodeId}:context-scope-revision-field-repair`,
      inputRef: repairRequest.repairRequestRef,
      inputSummary: "Request only field-specific scope-revision repair.",
      metadata: repairMetadata,
    });
    if (repairTool) {
      runtimeToolInvocationRefs.push(repairTool.invocationRef);
    }
  }

  if (decision.status === "accepted") {
    const narrowedInput = contextScopeRevisionCompileInputFromDecision({
      originalInput: input.originalInput,
      decision,
    });
    narrowedResult = compileContextScoutExecutionPacket(narrowedInput);
    const narrowedMetadata = contextScoutExecutionPacketMetadata(narrowedResult.packet);
    await input.runtimeJobs.attachRuntimeArtifactByContract({
      jobId: input.jobId,
      artifactType: CONTEXT_SCOUT_EXECUTION_PACKET_ARTIFACT_TYPE,
      uri: narrowedResult.packet.packetRef,
      contentType: "application/json",
      body: narrowedResult.packet as unknown as JsonValue,
      boundedSummary: narrowedResult.packet.nodeObjective,
      targetCommitmentIds: narrowedResult.packet.targetCommitmentIds,
      targetNodeIds: [narrowedResult.packet.nodeId],
      resourcePacketKind: "resource_scout_execution_packet",
      readinessStatus: narrowedResult.status,
      reasonCodes: narrowedResult.reasonCodes,
      metadata: metadataRecord(narrowedMetadata),
    });
    artifactRefs.push(narrowedResult.packet.packetRef);
    const recompileTool = await input.invokeTool({
      toolId: "resource.demand.recompile_from_scope_revision",
      idempotencyKey: `${input.nodeId}:context-scope-revision-recompile`,
      inputRef: narrowedResult.packet.packetRef,
      inputSummary:
        "Recompile the context demand/scout packet from the accepted model-authored scope revision.",
      metadata: {
        scopeRevisionRequestRef: request.requestRef,
        scopeRevisionDecisionRef: decision.decisionRef,
        recompiledPacketRef: narrowedResult.packet.packetRef,
        estimatedProviderInputBytes: narrowedResult.packet.exactProviderInputBytes,
        maxInputBytes: narrowedResult.packet.maxInputBytes,
        reasonCodes: narrowedResult.reasonCodes,
        ...SAFETY_FLAGS,
      },
    });
    if (recompileTool) {
      runtimeToolInvocationRefs.push(recompileTool.invocationRef);
    }
    const acceptTool = await input.invokeTool({
      toolId: "resource.frontier.accept_scope_revision",
      idempotencyKey: `${input.nodeId}:context-scope-revision-accepted`,
      inputRef: decision.decisionRef,
      inputSummary:
        "Accept model-authored legal subset and continue with the recompiled provider-safe resource packet.",
      metadata: decisionMetadata,
    });
    if (acceptTool) {
      runtimeToolInvocationRefs.push(acceptTool.invocationRef);
    }
    if (narrowedResult.status === "ready") {
      const revisedStartedAt = Date.now();
      const revisedResponse = await input.modelClient!.callRole({
        roleId: "resource_specialist_subturn",
        modelId: input.modelId,
        modelCandidateId: input.modelCandidateId,
        prompt: narrowedResult.prompt,
        responseFormat: "json_object",
        requestProfileOverride: {
          responseFormatMode: "prompt_only",
          reasoningMode: "none",
          maxTokens: input.maxTokens,
        },
        maxTokens: input.maxTokens,
        timeoutMs: input.timeoutMs,
        maxAttempts: Math.max(1, Math.min(3, Math.floor(input.maxAttempts ?? 1))),
        taskClass: "local_semantic_extraction",
        modelTaskCallSite: "resource_scope_revision_revised_context_packet_execution",
      });
      revisedPacketProviderSummary = summarizeScopeRevisionProviderDiagnostics(revisedResponse, {
        modelId: input.modelId,
        modelCandidateId: input.modelCandidateId,
        promptBytes: bytes(narrowedResult.prompt),
        latencyMs: Date.now() - revisedStartedAt,
        timeoutMs: input.timeoutMs,
        inputBundleHash: `sha256:${sha256Text(narrowedResult.prompt)}`,
        inputBundleRef: narrowedResult.packet.packetRef,
        concurrencySlot: `${input.graphId}:${input.nodeId}:scope_revision_revised_packet`,
      });
      revisedPacketProviderSucceeded =
        revisedResponse.status === "succeeded" && Boolean(revisedResponse.responseText);
      const executeTool = await input.invokeTool({
        toolId: "resource.demand.execute_recompiled_packet",
        idempotencyKey: `${input.nodeId}:context-scope-revision-execute-recompiled-packet`,
        inputRef: narrowedResult.packet.packetRef,
        inputSummary:
          "Execute the provider-safe resource packet recompiled from scope revision.",
        metadata: {
          recompiledPacketRef: narrowedResult.packet.packetRef,
          scopeRevisionDecisionRef: decision.decisionRef,
          providerDiagnostics: revisedPacketProviderSummary,
          providerExecutionSucceeded: revisedPacketProviderSucceeded,
          ...SAFETY_FLAGS,
        },
      });
      if (executeTool) {
        runtimeToolInvocationRefs.push(executeTool.invocationRef);
      }
    }
  }

  const succeeded =
    decision.status === "accepted" &&
    narrowedResult?.status === "ready" &&
    narrowedResult.packet.exactProviderInputBytes <= narrowedResult.packet.maxInputBytes &&
    revisedPacketProviderSucceeded;
  return {
    status: succeeded ? "succeeded" : "needs_review",
    request,
    proposal,
    decision,
    repairRequest,
    narrowedResult,
    artifactRefs,
    runtimeToolInvocationRefs,
    providerSummary,
    revisedPacketProviderSummary,
    reasonCodes: [
      ...request.reasonCodes,
      ...proposal.reasonCodes,
      ...decision.reasonCodes,
      ...(repairRequest?.reasonCodes ?? []),
      ...(narrowedResult?.reasonCodes ?? []),
      ...(revisedPacketProviderSucceeded
        ? ["resource_scope_revision_recompiled_packet_executed"]
        : decision.status === "accepted"
          ? ["resource_scope_revision_recompiled_packet_execution_blocked"]
          : []),
      ...(succeeded
        ? ["resource_scope_revision_production_transition_succeeded"]
        : ["resource_scope_revision_production_transition_needs_review"]),
    ].slice(0, 160),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}
