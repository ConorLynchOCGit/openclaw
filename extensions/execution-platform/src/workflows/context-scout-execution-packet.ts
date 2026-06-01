import { createHash } from "node:crypto";
import { modelTaskPolicyFor } from "../model-tasks/model-task-classification.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  buildResourceRequirementPacketManifest,
  deriveResourceRequirementPacketStructuralShard,
  type ResourceRequirementPacket,
  type ResourceRequirementStructuralShardUnitKind,
} from "./resource-requirement-packet.ts";
import type {
  SourcePromptContextIndex,
  SourcePromptExcerptDecision,
} from "./source-prompt-context.ts";

export type ContextScoutSourceContract = {
  packetRef: string;
  commitmentId: string;
  workerObjective: string;
  contextScoutObjective: string;
  requiredContextQuestions: string[];
  expectedContextScoutOutput: string[];
  likelyRepoAreas: string[];
  stopIfMissing: string[];
  acceptanceCriteria: string[];
};

export const CONTEXT_SCOUT_EXECUTION_PACKET_ARTIFACT_TYPE =
  "execution_platform.resource_scout_execution_packet";
export const CONTEXT_FRONTIER_REQUEST_ARTIFACT_TYPE =
  "execution_platform.resource_frontier.request";
export const CONTEXT_SHARD_MANIFEST_ARTIFACT_TYPE =
  "execution_platform.resource_frontier.shard_manifest";
export const CONTEXT_SHARD_HANDOFF_ARTIFACT_TYPE =
  "execution_platform.resource_frontier.shard_handoff";
export const CONTEXT_SHARD_HANDOFF_REVIEW_ARTIFACT_TYPE =
  "execution_platform.resource_frontier.shard_handoff_review";
export const CONTEXT_MERGE_PACKET_ARTIFACT_TYPE =
  "execution_platform.resource_frontier.merge_packet";
export const WORK_INTENT_CONTEXT_SATISFACTION_ARTIFACT_TYPE =
  "execution_platform.work_intent.context_satisfaction_state";
export const CONTEXT_FRONTIER_SINGLE_UNIT_BLOCKER_ARTIFACT_TYPE =
  "execution_platform.resource_frontier.single_unit_blocker";

export type ContextScoutExecutionPacketCompileStatus = "ready" | "needs_review" | "blocked";
export type ContextScoutProviderInputBudgetStatus = "accepted" | "blocked";

export type ContextScoutProviderInputPreflight = {
  artifactKind: "resource_scout_provider_input_preflight";
  schemaVersion: "execution-platform.context-scout-provider-input-preflight.v1";
  accepted: boolean;
  modelTaskClass: "local_semantic_extraction";
  modelPolicyRef: string;
  providerPath: "openrouter";
  parserMode: "runtime_json_object";
  responseFormatMode: "prompt_only_json";
  reasoningMode: "none";
  inputBytes: number;
  maxInputBytes: number;
  timeoutMs: number;
  maxTimeoutMs: number;
  providerEnvelopeReserveBytes: number;
  blockingReason: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ContextScoutBrokerRequestSummary = {
  requestRef: string;
  status: string;
  consumerNodeId: string;
  semanticQuestion: string;
  candidateResourceRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ContextScoutExecutionPacket = {
  artifactKind: "resource_scout_execution_packet";
  schemaVersion: "execution-platform.resource-scout-execution-packet.v1";
  packetId: string;
  packetRef: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  targetNodeIds: string[];
  targetCommitmentIds: string[];
  resourceRequirementRefs: string[];
  resourceRequirementSummaries: Array<{
    resourceRequirementRef: string;
    resourceRequirementHash: string;
    consumerNodeId: string;
    consumerBranchId: string;
    workIntentRef: string;
    contextPurpose: string;
    semanticQuestions: string[];
    requiredResourceKinds: string[];
    downstreamCapabilityId: string;
    downstreamExecutionIntent: string;
    downstreamEvidenceMode: string[];
    candidateRepoAreaRefs: string[];
    knownTargetRefs: string[];
    knownValidationNeedRefs: string[];
    sourceContextBrokerRequestRef: string | null;
  }>;
  objectiveSummary: string;
  nodeObjective: string;
  downstreamConsumer: string;
  contextBrokerRequest: ContextScoutBrokerRequestSummary | null;
  sourceContractRefs: string[];
  sourceContractSummaries: Array<{
    packetRef: string;
    commitmentId: string;
    workerObjective: string;
    contextScoutObjective: string;
    requiredContextQuestions: string[];
    expectedContextScoutOutput: string;
    likelyRepoAreas: string[];
    stopIfMissing: string[];
    acceptanceCriteria: string[];
  }>;
  sourcePrompt: {
    promptHash: string | null;
    promptLength: number | null;
    resolutionStatus: string | null;
    sectionRefs: string[];
    sectionSummaries: Array<{
      sectionRef: string;
      heading: string | null;
      boundedSummary: string;
    }>;
    excerptDecisionRefs: string[];
    providedExcerptSummaries: Array<{
      decisionRef: string;
      sectionRef: string;
      boundedExcerptSummary: string;
      status: "provided" | "denied";
    }>;
    rawPromptStored: false;
  };
  boundedRepoContextRefs: Array<{
    fileRef: string;
    evidenceHash: string;
    boundedSummary: string;
    rawFileContentStored: false;
  }>;
  candidateFileRefs: string[];
  validationCommandRefs: string[];
  requestedOutputShape: "resource_scout_handoff_json";
  modelTaskClass: "local_semantic_extraction";
  modelPolicyRef: string;
  providerTimeoutMs: number;
  maxInputBytes: number;
  estimatedPromptBytes: number;
  exactProviderInputBytes: number;
  providerEnvelopeReserveBytes: number;
  providerInputBudgetStatus: ContextScoutProviderInputBudgetStatus;
  providerInputPreflight: ContextScoutProviderInputPreflight;
  status: ContextScoutExecutionPacketCompileStatus;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ContextScoutExecutionPacketCompileResult = {
  status: ContextScoutExecutionPacketCompileStatus;
  packet: ContextScoutExecutionPacket;
  prompt: string;
  reasonCodes: string[];
};

export type ContextScoutExecutionPacketCompileInput = {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  targetNodeIds?: string[];
  targetCommitmentIds: string[];
  resourceRequirementPackets: ResourceRequirementPacket[];
  objectiveSummary: string;
  nodeObjective: string;
  downstreamConsumer?: string | null;
  contextBrokerRequest?: ContextScoutBrokerRequestSummary | null;
  contextBrokerRequestsByRef?: Record<string, ContextScoutBrokerRequestSummary>;
  sourceContracts: ContextScoutSourceContract[];
  sourcePromptContextIndex: SourcePromptContextIndex | null;
  sourcePromptExcerptDecisions?: SourcePromptExcerptDecision[];
  boundedRepoContextIndex: ContextScoutBoundedRepoContextEntry[];
  candidateFileRefs: string[];
  validationCommandRefs: string[];
  nodeBudgetMs: number;
  requestedTimeoutMs?: number | null;
};

export type ContextScoutStructuralShardCoverageManifest = {
  artifactKind: "resource_scout_structural_shard_coverage_manifest";
  schemaVersion: "execution-platform.context-scout-structural-shard-coverage.v1";
  parentPacketRef: string;
  parentNodeId: string;
  parentResourceRequirementRefs: string[];
  parentTargetCommitmentIds: string[];
  shardUnitKind: ResourceRequirementStructuralShardUnitKind;
  shardCount: number;
  shardPacketRefs: string[];
  shardResourceRequirementRefs: string[];
  shardTargetCommitmentIds: string[][];
  maxShardInputBytes: number;
  maxInputBytes: number;
  losslessStructuralSplit: true;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ContextScoutSingleUnitOverProfileBlocker = {
  artifactKind: "resource_scout_single_unit_over_profile_blocker";
  schemaVersion: "execution-platform.context-scout-single-unit-over-profile-blocker.v1";
  blockerRef: string;
  parentPacketRef: string;
  nodeId: string;
  unitKind: ResourceRequirementStructuralShardUnitKind | "resource_scout_execution_packet";
  unitRefs: string[];
  inputBytes: number;
  maxInputBytes: number;
  blockingReason: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ResourceFrontierRequest = {
  artifactKind: "resource_frontier_request";
  schemaVersion: "execution-platform.context-frontier-request.v1";
  requestRef: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  parentPacketRef: string;
  targetNodeIds: string[];
  targetCommitmentIds: string[];
  resourceRequirementRefs: string[];
  requestedTransition:
    | "split_for_profile"
    | "record_single_unit_blocker"
    | "execute_shards_then_merge_handoffs";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ContextShardManifest = {
  artifactKind: "context_shard_manifest";
  schemaVersion: "execution-platform.context-shard-manifest.v1";
  manifestRef: string;
  frontierRequestRef: string;
  parentPacketRef: string;
  parentNodeId: string;
  parentResourceRequirementRefs: string[];
  parentTargetCommitmentIds: string[];
  shardUnitKind: ResourceRequirementStructuralShardUnitKind;
  shardCount: number;
  shardPacketRefs: string[];
  shardPackets: ContextScoutExecutionPacket[];
  shardSummaries: Array<{
    shardPacketRef: string;
    shardNodeId: string;
    status: ContextScoutExecutionPacketCompileStatus;
    inputBytes: number;
    maxInputBytes: number;
    resourceRequirementRefs: string[];
    targetCommitmentIds: string[];
  }>;
  maxShardInputBytes: number;
  maxInputBytes: number;
  mergeRequired: true;
  graphNodeExpansionAllowed: false;
  payloadBackedShardPackets: true;
  losslessStructuralSplit: true;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ContextMergePacket = {
  artifactKind: "context_merge_packet";
  schemaVersion: "execution-platform.context-merge-packet.v1";
  mergePacketRef: string;
  frontierRequestRef: string;
  shardManifestRef: string;
  parentPacketRef: string;
  parentNodeId: string;
  consumerNodeIds: string[];
  targetCommitmentIds: string[];
  shardPacketRefs: string[];
  requiredShardHandoffRefs: string[];
  mergeStatus: "pending_shard_handoffs";
  canUnlockConsumer: false;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ContextShardHandoffStatus =
  | "accepted"
  | "accepted_with_limitations"
  | "needs_review_nonblocking"
  | "blocked";

export type ContextShardHandoff = {
  artifactKind: "context_shard_handoff";
  schemaVersion: "execution-platform.context-shard-handoff.v1";
  shardHandoffRef: string;
  frontierRequestRef: string;
  shardManifestRef: string;
  shardPacketRef: string;
  shardNodeId: string;
  consumerNodeIds: string[];
  workIntentRefs: string[];
  targetCommitmentIds: string[];
  relevantFileRefs: string[];
  existingPatterns: string[];
  risks: string[];
  recommendedEditPoints: string[];
  validationSuggestions: string[];
  handoffSummaryForImplementation: string;
  limitations: string[];
  modelAuthoredSufficiencySignal: "sufficient" | "partial" | "insufficient";
  status: ContextShardHandoffStatus;
  providerDiagnosticsRef: string | null;
  hasModelAuthoredHandoffSubstance: boolean;
  runtimeSuppliedRefsUsed: boolean;
  semanticQualityJudgedByDeterministicCode: false;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawFileContentStored: false;
};

export type ContextShardHandoffReview = {
  artifactKind: "context_shard_handoff_review";
  schemaVersion: "execution-platform.context-shard-handoff-review.v1";
  reviewRef: string;
  frontierRequestRef: string;
  shardManifestRef: string;
  acceptedShardHandoffRefs: string[];
  partialShardHandoffRefs: string[];
  rejectedShardHandoffRefs: string[];
  missingShardPacketRefs: string[];
  limitationRefs: string[];
  status: "accepted" | "accepted_with_limitations" | "blocked" | "needs_review";
  sufficientForImplementation: boolean;
  sufficientForValidation: boolean;
  reviewerSummary: string;
  consumerWaiverRef: string | null;
  semanticQualityJudgedByDeterministicCode: false;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type AcceptedContextMergePacket = Omit<
  ContextMergePacket,
  "requiredShardHandoffRefs" | "mergeStatus" | "canUnlockConsumer" | "reasonCodes"
> & {
  requiredShardHandoffRefs: string[];
  acceptedShardHandoffRefs: string[];
  partialShardHandoffRefs: string[];
  rejectedShardHandoffRefs: string[];
  missingShardPacketRefs: string[];
  mergedRelevantFileRefs: string[];
  mergedRecommendedEditPointRefs: string[];
  mergedValidationSuggestionRefs: string[];
  modelAuthoredSufficiencyReviewRef: string;
  limitations: string[];
  consumerWaiverRef: string | null;
  mergeStatus: "accepted" | "accepted_with_limitations" | "blocked" | "needs_review";
  canUnlockConsumer: boolean;
  reasonCodes: string[];
};

export type WorkIntentContextSatisfactionState = {
  artifactKind: "work_intent_context_satisfaction_state";
  schemaVersion: "execution-platform.work-intent-context-satisfaction-state.v1";
  satisfactionStateRef: string;
  frontierRequestRef: string;
  contextMergePacketRef: string;
  consumerNodeIds: string[];
  workIntentRefs: string[];
  acceptedResourceHandoffRefs: string[];
  limitationRefs: string[];
  consumerWaiverRef: string | null;
  contextStatus:
    | "satisfied"
    | "satisfied_with_limitations"
    | "blocked"
    | "needs_review";
  nextLegalTransition:
    | "scheduler.promote_resource_satisfied_intent"
    | "scheduler.accept_resource_limitation_waiver"
    | "scheduler.request_resource_requirement_for_work_intent"
    | "needs_review";
  reasonCodes: string[];
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ContextScoutStructuralReshardResult =
  | {
      status: "not_required";
      parentResult: ContextScoutExecutionPacketCompileResult;
      reasonCodes: string[];
    }
  | {
      status: "ready";
      parentResult: ContextScoutExecutionPacketCompileResult;
      shardResults: ContextScoutExecutionPacketCompileResult[];
      coverageManifest: ContextScoutStructuralShardCoverageManifest;
      reasonCodes: string[];
    }
  | {
      status: "blocked";
      parentResult: ContextScoutExecutionPacketCompileResult;
      shardResults: ContextScoutExecutionPacketCompileResult[];
      blocker: ContextScoutSingleUnitOverProfileBlocker;
      reasonCodes: string[];
    };

export type ContextScoutBoundedRepoContextEntry = {
  fileRef: string;
  evidenceHash: string;
  boundedSummary: string;
  rawFileContentStored: false;
};

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: string | null | undefined, max = 1_000): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function uniqueStrings(
  values: Array<string | null | undefined>,
  max: number,
  chars = 260,
): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .map((value) => bounded(value, chars))
    .slice(0, max);
}

function bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown, max = 40, chars = 320): string[] {
  return Array.isArray(value)
    ? uniqueStrings(
        value.filter((entry): entry is string => typeof entry === "string"),
        max,
        chars,
      )
    : [];
}

export function contextScoutBrokerRequestSummaryFromMetadata(
  metadata: unknown,
): ContextScoutBrokerRequestSummary | null {
  const record = asRecord(metadata);
  const requestRef =
    typeof record.contextBrokerRequestRef === "string" ? record.contextBrokerRequestRef.trim() : "";
  if (!requestRef) {
    return null;
  }
  return {
    requestRef: bounded(requestRef, 420),
    status:
      typeof record.contextBrokerRequestStatus === "string"
        ? bounded(record.contextBrokerRequestStatus, 120)
        : typeof record.contextBrokerStatus === "string"
          ? bounded(record.contextBrokerStatus, 120)
          : "context_specialist_required",
    consumerNodeId:
      typeof record.contextBrokerConsumerNodeId === "string"
        ? bounded(record.contextBrokerConsumerNodeId, 180)
        : typeof record.targetWorkNodeId === "string"
          ? bounded(record.targetWorkNodeId, 180)
          : "unknown_consumer",
    semanticQuestion:
      typeof record.contextBrokerSemanticQuestion === "string"
        ? bounded(record.contextBrokerSemanticQuestion, 1_200)
        : typeof record.exactObjective === "string"
          ? bounded(record.exactObjective, 1_200)
          : "Supply node-scoped context for the target consumer.",
    candidateResourceRefs: stringArray(
      record.contextBrokerCandidateResourceRefs ?? record.targetRefs,
      40,
      320,
    ),
    reasonCodes: stringArray(record.contextBrokerReasonCodes, 40, 180),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function packetRef(input: {
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  packetId: string;
}): string {
  return `runtime-job://${input.runtimeJobId}/runtime-work-graph/${input.graphId}/context-scout/execution-packet/${input.nodeId}/${input.packetId}`;
}

function frontierRef(input: {
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  kind:
    | "request"
    | "shard-manifest"
    | "merge-packet"
    | "single-unit-blocker"
    | "shard-handoff"
    | "shard-review"
    | "context-satisfaction";
  fingerprint: string;
}): string {
  return `runtime-job://${input.runtimeJobId}/runtime-work-graph/${input.graphId}/context-frontier/${input.kind}/${input.nodeId}/${input.fingerprint}`;
}

function parseFrontierRuntimeRef(ref: string): { runtimeJobId: string; graphId: string } {
  const parts = ref.split("/");
  return {
    runtimeJobId: parts[2] || "unknown-runtime-job",
    graphId: parts[4] || "unknown-graph",
  };
}

function modelPolicySummary(): { policyRef: string; maxInputBytes: number; timeoutMs: number } {
  const policy = modelTaskPolicyFor("local_semantic_extraction");
  return {
    policyRef: policy.policyRef,
    maxInputBytes: policy.maxInputBytes ?? 32_000,
    timeoutMs: policy.timeoutMs,
  };
}

function providerInputPreflight(input: {
  inputBytes: number;
  timeoutMs: number;
  providerEnvelopeReserveBytes?: number;
}): ContextScoutProviderInputPreflight {
  const policy = modelPolicySummary();
  const reasonCodes = ["resource_scout_exact_provider_input_preflight_evaluated"];
  let blockingReason: string | null = null;
  if (input.inputBytes > policy.maxInputBytes) {
    reasonCodes.push("context_specialist_payload_over_profile_bound");
    blockingReason = `resource scout provider input is ${input.inputBytes} bytes but policy allows ${policy.maxInputBytes}.`;
  }
  if (input.timeoutMs > policy.timeoutMs) {
    reasonCodes.push("resource_scout_timeout_over_profile_bound");
    blockingReason = `resource scout timeout is ${input.timeoutMs}ms but policy allows ${policy.timeoutMs}ms.`;
  }
  if (!blockingReason) {
    reasonCodes.push("resource_scout_exact_provider_input_preflight_accepted");
  }
  return {
    artifactKind: "resource_scout_provider_input_preflight",
    schemaVersion: "execution-platform.context-scout-provider-input-preflight.v1",
    accepted: blockingReason === null,
    modelTaskClass: "local_semantic_extraction",
    modelPolicyRef: policy.policyRef,
    providerPath: "openrouter",
    parserMode: "runtime_json_object",
    responseFormatMode: "prompt_only_json",
    reasoningMode: "none",
    inputBytes: input.inputBytes,
    maxInputBytes: policy.maxInputBytes,
    timeoutMs: input.timeoutMs,
    maxTimeoutMs: policy.timeoutMs,
    providerEnvelopeReserveBytes: Math.max(
      0,
      Math.floor(input.providerEnvelopeReserveBytes ?? 0),
    ),
    blockingReason,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function deriveContextScoutProviderTimeoutMs(input: {
  nodeBudgetMs: number;
  requestedTimeoutMs?: number | null;
}): { timeoutMs: number; reasonCodes: string[] } {
  const policy = modelPolicySummary();
  const nodeBudgetMs = Math.max(1, Math.floor(input.nodeBudgetMs));
  const requestedTimeoutMs =
    typeof input.requestedTimeoutMs === "number" && Number.isFinite(input.requestedTimeoutMs)
      ? Math.max(1, Math.floor(input.requestedTimeoutMs))
      : policy.timeoutMs;
  return {
    timeoutMs: Math.max(1, Math.min(nodeBudgetMs, requestedTimeoutMs, policy.timeoutMs)),
    reasonCodes: [
      "resource_scout_provider_timeout_derived_from_model_task_policy",
      `resource_scout_provider_timeout_ms:${Math.max(
        1,
        Math.min(nodeBudgetMs, requestedTimeoutMs, policy.timeoutMs),
      )}`,
      `resource_scout_policy_hard_timeout_ms:${policy.timeoutMs}`,
    ],
  };
}

export function buildContextScoutPromptFromExecutionPacket(
  packet: ContextScoutExecutionPacket,
): string {
  const modelFacingPacket = {
    packetRef: packet.packetRef,
    runtimeJobId: packet.runtimeJobId,
    workflowId: packet.workflowId,
    graphId: packet.graphId,
    nodeId: packet.nodeId,
    targetNodeIds: packet.targetNodeIds,
    targetCommitmentIds: packet.targetCommitmentIds,
    resourceRequirementRefs: packet.resourceRequirementRefs,
    resourceRequirementSummaries: packet.resourceRequirementSummaries,
    objectiveSummary: packet.objectiveSummary,
    nodeObjective: packet.nodeObjective,
    downstreamConsumer: packet.downstreamConsumer,
    contextBrokerRequest: packet.contextBrokerRequest,
    sourceContractRefs: packet.sourceContractRefs,
    sourceContractSummaries: packet.sourceContractSummaries,
    sourcePrompt: packet.sourcePrompt,
    boundedRepoContextRefs: packet.boundedRepoContextRefs,
    candidateFileRefs: packet.candidateFileRefs,
    validationCommandRefs: packet.validationCommandRefs,
    requestedOutputShape: packet.requestedOutputShape,
  };
  return [
    "You are the OpenClaw resource_scout node.",
    "Use only bounded runtime-provided evidence from contextScoutExecutionPacket. Do not invent repo paths.",
    "resource scouts may run only from resourceRequirementRefs. Answer those exact semanticQuestions for their declared consumerNodeId values.",
    "If the packet lacks enough bounded context, request exact missing context in limitations instead of guessing.",
    "Bounded repo summaries and evidence hashes are the expected evidence format for this shard; do not list missing raw file content as a limitation unless it prevents this handoff from being useful.",
    "Use limitations only for non-speculative blockers or concrete missing refs that would prevent the declared consumer from using this handoff.",
    "Return strict JSON only with relevantFiles, existingPatterns, risks, recommendedEditPoints, validationSuggestions, handoffSummaryForImplementation, confidence, limitations.",
    "A valid handoff must contain model-authored implementation substance tied to the packet objective, not just copied file refs.",
    "Use exact fileRef values from boundedRepoContextRefs for relevantFiles and recommendedEditPoints.",
    "Name specific file areas or symbols from bounded summaries; do not use runtime_verified_context as a symbol.",
    packet.contextBrokerRequest
      ? "This scout was dispatched by a contextBrokerRequest. Answer contextBrokerRequest.semanticQuestion for contextBrokerRequest.consumerNodeId and do not broaden the handoff."
      : "If no contextBrokerRequest is present, keep the handoff scoped to targetNodeIds and target commitments.",
    'Required JSON shape: {"relevantFiles":[{"path":"relative/file.ts","whyRelevant":"why this exact existing file matters","keySymbolsOrFunctions":["symbol or area"]}],"existingPatterns":["concrete pattern from bounded repo summaries"],"risks":["concrete implementation or validation risk"],"recommendedEditPoints":[{"path":"relative/file.ts","symbolOrRegion":"specific symbol or file area","reason":"why downstream worker should inspect or edit it"}],"validationSuggestions":["specific test/build/readback command or check"],"handoffSummaryForImplementation":"detailed worker handoff grounded in the files above","confidence":0.8,"limitations":[]}',
    `contextScoutExecutionPacket: ${JSON.stringify(modelFacingPacket)}`,
  ].join("\n");
}

function resolveContextBrokerRequestForRequirements(
  input: ContextScoutExecutionPacketCompileInput,
): ContextScoutBrokerRequestSummary | null {
  if (input.contextBrokerRequest) {
    return input.contextBrokerRequest;
  }
  const sourceRefs = uniqueStrings(
    input.resourceRequirementPackets
      .map((packet) => packet.sourceContextBrokerRequestRef)
      .filter((ref): ref is string => Boolean(ref)),
    2,
    420,
  );
  if (sourceRefs.length !== 1) {
    return null;
  }
  return input.contextBrokerRequestsByRef?.[sourceRefs[0]] ?? null;
}

export function compileContextScoutExecutionPacket(
  input: ContextScoutExecutionPacketCompileInput,
): ContextScoutExecutionPacketCompileResult {
  const policy = modelPolicySummary();
  const timeout = deriveContextScoutProviderTimeoutMs({
    nodeBudgetMs: input.nodeBudgetMs,
    requestedTimeoutMs: input.requestedTimeoutMs,
  });
  const targetCommitmentIds = uniqueStrings(input.targetCommitmentIds, 24);
  const resourceRequirementPackets = input.resourceRequirementPackets.slice(0, 12);
  const resourceRequirementManifests = resourceRequirementPackets.map((packet) =>
    buildResourceRequirementPacketManifest(packet),
  );
  const requirementConsumerIds = uniqueStrings(
    resourceRequirementPackets.map((packet) => packet.consumerNodeId),
    8,
    180,
  );
  const requirementCapabilityIds = uniqueStrings(
    resourceRequirementPackets.map((packet) => packet.downstreamCapabilityId),
    8,
    180,
  );
  const requirementContextPurposes = uniqueStrings(
    resourceRequirementPackets.map((packet) => packet.contextPurpose),
    8,
    180,
  );
  const requirementBlockedReasonCodes = [
    ...(resourceRequirementPackets.length === 0
      ? ["resource_scout_execution_packet_resource_requirement_missing"]
      : []),
    ...(requirementConsumerIds.length > 1
      ? ["resource_scout_execution_packet_mixed_requirement_consumers_blocked"]
      : []),
    ...(requirementCapabilityIds.length > 1
      ? ["resource_scout_execution_packet_mixed_requirement_capabilities_blocked"]
      : []),
    ...(requirementContextPurposes.length > 1
      ? ["resource_scout_execution_packet_mixed_requirement_purposes_blocked"]
      : []),
  ];
  const structuralCommitmentIds = uniqueStrings(
    [
      ...targetCommitmentIds,
      ...resourceRequirementPackets.flatMap((packet) => packet.sourceCommitmentIds),
    ],
    40,
    180,
  );
  const scopedSourceContracts =
    structuralCommitmentIds.length > 0
      ? input.sourceContracts.filter((packet) =>
          structuralCommitmentIds.includes(packet.commitmentId),
        )
      : input.sourceContracts;
  const sourceContracts =
    scopedSourceContracts.length > 0 ? scopedSourceContracts : input.sourceContracts;
  const packetId = sha256Text(
    JSON.stringify({
      runtimeJobId: input.runtimeJobId,
      graphId: input.graphId,
      nodeId: input.nodeId,
      targetCommitmentIds,
      resourceRequirementRefs: resourceRequirementPackets.map(
        (packet) => packet.resourceRequirementRef,
      ),
      sourceContractRefs: sourceContracts.map((packet) => packet.packetRef),
      boundedRepoContextRefs: input.boundedRepoContextIndex.map((entry) => entry.fileRef),
    }),
  ).slice(0, 20);
  const ref = packetRef({
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    packetId,
  });
  const excerptDecisions = input.sourcePromptExcerptDecisions ?? [];
  const contextBrokerRequest = resolveContextBrokerRequestForRequirements(input);
  const base: ContextScoutExecutionPacket = {
    artifactKind: "resource_scout_execution_packet",
    schemaVersion: "execution-platform.resource-scout-execution-packet.v1",
    packetId,
    packetRef: ref,
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    targetNodeIds: uniqueStrings(
      [...(input.targetNodeIds ?? []), ...resourceRequirementPackets.map((packet) => packet.consumerNodeId)],
      24,
    ),
    targetCommitmentIds: structuralCommitmentIds.slice(0, 24),
    resourceRequirementRefs: resourceRequirementPackets
      .map((packet) => packet.resourceRequirementRef)
      .slice(0, 12),
    resourceRequirementSummaries: resourceRequirementPackets.map((packet) => ({
      resourceRequirementRef: bounded(packet.resourceRequirementRef, 420),
      resourceRequirementHash: bounded(packet.resourceRequirementHash, 90),
      consumerNodeId: bounded(packet.consumerNodeId, 180),
      consumerBranchId: bounded(packet.consumerBranchId, 180),
      workIntentRef: bounded(packet.workIntentRef, 420),
      contextPurpose: bounded(packet.contextPurpose, 180),
      semanticQuestions: uniqueStrings(packet.semanticQuestions, 12, 420),
      requiredResourceKinds: uniqueStrings(packet.requiredResourceKinds, 16, 160),
      downstreamCapabilityId: bounded(packet.downstreamCapabilityId, 180),
      downstreamExecutionIntent: bounded(packet.downstreamExecutionIntent, 120),
      downstreamEvidenceMode: uniqueStrings(packet.downstreamEvidenceMode, 12, 160),
      candidateRepoAreaRefs: uniqueStrings(packet.candidateRepoAreaRefs, 24, 320),
      knownTargetRefs: uniqueStrings(packet.knownTargetRefs, 24, 320),
      knownValidationNeedRefs: uniqueStrings(packet.knownValidationNeedRefs, 12, 320),
      sourceContextBrokerRequestRef: packet.sourceContextBrokerRequestRef
        ? bounded(packet.sourceContextBrokerRequestRef, 420)
        : null,
    })),
    objectiveSummary: bounded(input.objectiveSummary, 1_200),
    nodeObjective: bounded(input.nodeObjective, 1_200),
    downstreamConsumer: bounded(input.downstreamConsumer ?? "implementation_and_validation", 260),
    contextBrokerRequest: contextBrokerRequest
      ? {
          requestRef: bounded(contextBrokerRequest.requestRef, 420),
          status: bounded(contextBrokerRequest.status, 120),
          consumerNodeId: bounded(contextBrokerRequest.consumerNodeId, 180),
          semanticQuestion: bounded(contextBrokerRequest.semanticQuestion, 1_200),
          candidateResourceRefs: uniqueStrings(
            contextBrokerRequest.candidateResourceRefs,
            40,
            320,
          ),
          reasonCodes: uniqueStrings(contextBrokerRequest.reasonCodes, 40, 180),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        }
      : null,
    sourceContractRefs: sourceContracts
      .map((packet) => packet.packetRef)
      .slice(0, 24),
    sourceContractSummaries: sourceContracts.slice(0, 12).map((packet) => ({
      packetRef: bounded(packet.packetRef, 320),
      commitmentId: bounded(packet.commitmentId, 160),
      workerObjective: bounded(packet.workerObjective, 900),
      contextScoutObjective: bounded(packet.contextScoutObjective, 900),
      requiredContextQuestions: uniqueStrings(packet.requiredContextQuestions, 10, 260),
      expectedContextScoutOutput: bounded(packet.expectedContextScoutOutput.join(" | "), 700),
      likelyRepoAreas: uniqueStrings(packet.likelyRepoAreas, 16, 260),
      stopIfMissing: uniqueStrings(packet.stopIfMissing, 8, 260),
      acceptanceCriteria: uniqueStrings(packet.acceptanceCriteria, 10, 260),
    })),
    sourcePrompt: {
      promptHash: input.sourcePromptContextIndex?.promptHash ?? null,
      promptLength: input.sourcePromptContextIndex?.promptLength ?? null,
      resolutionStatus: input.sourcePromptContextIndex?.resolutionStatus ?? null,
      sectionRefs:
        input.sourcePromptContextIndex?.sections
          .map((section) => section.sectionRef)
          .slice(0, 16) ?? [],
      sectionSummaries:
        input.sourcePromptContextIndex?.sections.slice(0, 16).map((section) => ({
          sectionRef: bounded(section.sectionRef, 260),
          heading: section.heading ? bounded(section.heading, 180) : null,
          boundedSummary: bounded(section.boundedSummary, 360),
        })) ?? [],
      excerptDecisionRefs: excerptDecisions
        .map((decision) => `source-prompt://${decision.promptHash}/${decision.requestId}`)
        .slice(0, 12),
      providedExcerptSummaries: excerptDecisions.slice(0, 8).map((decision) => ({
        decisionRef: `source-prompt://${decision.promptHash}/${decision.requestId}`,
        sectionRef: bounded(decision.sectionRef, 260),
        boundedExcerptSummary: bounded(decision.boundedExcerptSummary, 500),
        status: decision.status,
      })),
      rawPromptStored: false,
    },
    boundedRepoContextRefs: input.boundedRepoContextIndex.slice(0, 40).map((entry) => ({
      fileRef: bounded(entry.fileRef, 260),
      evidenceHash: bounded(entry.evidenceHash, 90),
      boundedSummary: bounded(entry.boundedSummary, 800),
      rawFileContentStored: false,
    })),
    candidateFileRefs: uniqueStrings(input.candidateFileRefs, 80),
    validationCommandRefs: uniqueStrings(input.validationCommandRefs, 12, 320),
    requestedOutputShape: "resource_scout_handoff_json",
    modelTaskClass: "local_semantic_extraction",
    modelPolicyRef: policy.policyRef,
    providerTimeoutMs: timeout.timeoutMs,
    maxInputBytes: policy.maxInputBytes,
    estimatedPromptBytes: 0,
    exactProviderInputBytes: 0,
    providerEnvelopeReserveBytes: 0,
    providerInputBudgetStatus: "accepted",
    providerInputPreflight: providerInputPreflight({
      inputBytes: 0,
      timeoutMs: timeout.timeoutMs,
    }),
    status: "ready",
    reasonCodes: [
      "resource_scout_execution_packet_compiled",
      ...(sourceContracts.length < input.sourceContracts.length
        ? ["resource_scout_execution_packet_source_contracts_scoped_to_requirements"]
        : []),
      ...timeout.reasonCodes,
      input.sourcePromptContextIndex
        ? "resource_scout_execution_packet_source_prompt_index_ref_used"
        : "resource_scout_execution_packet_source_prompt_index_missing",
      input.boundedRepoContextIndex.length > 0
        ? "resource_scout_execution_packet_repo_context_refs_ready"
        : "resource_scout_execution_packet_repo_context_refs_missing",
      contextBrokerRequest
        ? "resource_scout_execution_packet_resource_broker_request_ref_used"
        : "resource_scout_execution_packet_resource_broker_request_missing",
      resourceRequirementPackets.length > 0
        ? "resource_scout_execution_packet_resource_requirements_attached"
        : "resource_scout_execution_packet_resource_requirements_missing",
      ...requirementBlockedReasonCodes,
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  const initialPrompt = buildContextScoutPromptFromExecutionPacket(base);
  const preflight = providerInputPreflight({
    inputBytes: bytes(initialPrompt),
    timeoutMs: timeout.timeoutMs,
  });
  const status: ContextScoutExecutionPacketCompileStatus =
    !preflight.accepted || requirementBlockedReasonCodes.length > 0
      ? "blocked"
      : input.boundedRepoContextIndex.length === 0
        ? "needs_review"
        : "ready";
  const packet: ContextScoutExecutionPacket = {
    ...base,
    status,
    estimatedPromptBytes: preflight.inputBytes,
    exactProviderInputBytes: preflight.inputBytes,
    providerEnvelopeReserveBytes: preflight.providerEnvelopeReserveBytes,
    providerInputBudgetStatus: preflight.accepted ? "accepted" : "blocked",
    providerInputPreflight: preflight,
    reasonCodes: [
      ...base.reasonCodes,
      ...preflight.reasonCodes,
      ...(!preflight.accepted && sourceContracts.length > 1
        ? ["resource_scout_structural_reshard_by_commitment_required"]
        : []),
      ...(!preflight.accepted && resourceRequirementPackets.length > 1
        ? ["resource_scout_structural_reshard_by_resource_requirement_required"]
        : []),
      status === "ready"
        ? "resource_scout_execution_packet_exact_provider_input_within_model_task_policy"
        : status === "needs_review"
          ? "resource_scout_execution_packet_lacks_repo_context"
          : "resource_scout_execution_packet_blocked",
    ],
  };
  return {
    status,
    packet,
    prompt: buildContextScoutPromptFromExecutionPacket(packet),
    reasonCodes: packet.reasonCodes,
  };
}

function isProviderProfileBlock(result: ContextScoutExecutionPacketCompileResult): boolean {
  return (
    result.status === "blocked" &&
    result.reasonCodes.includes("context_specialist_payload_over_profile_bound")
  );
}

function referencesForRequirement(packet: ResourceRequirementPacket): string[] {
  return uniqueStrings(
    [
      ...packet.candidateRepoAreaRefs,
      ...packet.knownTargetRefs,
      ...packet.candidateSourceRefs,
      ...packet.knownValidationNeedRefs,
    ],
    240,
    420,
  );
}

function filterBoundedRepoContextByExactRefs(
  entries: ContextScoutBoundedRepoContextEntry[],
  refs: string[],
): ContextScoutBoundedRepoContextEntry[] {
  const refSet = new Set(refs);
  const filtered = entries.filter((entry) => refSet.has(entry.fileRef));
  return filtered.length > 0 ? filtered : entries;
}

function filterStringsByExactRefs(values: string[], refs: string[]): string[] {
  const refSet = new Set(refs);
  const filtered = values.filter((value) => refSet.has(value));
  return filtered.length > 0 ? filtered : values;
}

function sourcePromptIndexWithSections(
  index: SourcePromptContextIndex | null,
  sectionRefs: string[],
): SourcePromptContextIndex | null {
  if (!index) {
    return null;
  }
  const sectionRefSet = new Set(sectionRefs);
  const sections = index.sections.filter((section) => sectionRefSet.has(section.sectionRef));
  if (sections.length === 0) {
    return index;
  }
  return {
    ...index,
    sections,
  };
}

function buildContextScoutShardAttempts(
  input: ContextScoutExecutionPacketCompileInput,
): Array<{
  shardUnitKind: ResourceRequirementStructuralShardUnitKind;
  shardInputs: ContextScoutExecutionPacketCompileInput[];
}> {
  const requirementPackets = input.resourceRequirementPackets;
  const attempts: Array<{
    shardUnitKind: ResourceRequirementStructuralShardUnitKind;
    shardInputs: ContextScoutExecutionPacketCompileInput[];
  }> = [];

  if (requirementPackets.length > 1) {
    attempts.push({
      shardUnitKind: "resource_requirement",
      shardInputs: requirementPackets.map((requirement, index) => {
        const refs = referencesForRequirement(requirement);
        return {
          ...input,
          nodeId: `${input.nodeId}__ctxreq_${index + 1}`,
          targetNodeIds: uniqueStrings(
            [...(input.targetNodeIds ?? []), requirement.consumerNodeId],
            24,
          ),
          targetCommitmentIds: requirement.sourceCommitmentIds,
          resourceRequirementPackets: [
            deriveResourceRequirementPacketStructuralShard({
              parent: requirement,
              shardUnitKind: "resource_requirement",
              shardUnitRefs: [requirement.resourceRequirementRef],
              shardIndex: index,
              shardCount: requirementPackets.length,
              reasonCodes: ["resource_requirement_shard_by_resource_requirement"],
            }),
          ],
          boundedRepoContextIndex: filterBoundedRepoContextByExactRefs(
            input.boundedRepoContextIndex,
            refs,
          ),
          candidateFileRefs: filterStringsByExactRefs(input.candidateFileRefs, refs),
        };
      }),
    });
  }

  const commitmentIds = uniqueStrings(
    [
      ...input.targetCommitmentIds,
      ...requirementPackets.flatMap((packet) => packet.sourceCommitmentIds),
    ],
    80,
    180,
  );
  if (commitmentIds.length > 1) {
    attempts.push({
      shardUnitKind: "source_commitment",
      shardInputs: commitmentIds.map((commitmentId, index) => {
        const shardRequirements = requirementPackets.flatMap((requirement) => {
          if (
            requirement.sourceCommitmentIds.length > 0 &&
            !requirement.sourceCommitmentIds.includes(commitmentId)
          ) {
            return [];
          }
          return [
            deriveResourceRequirementPacketStructuralShard({
              parent: requirement,
              shardUnitKind: "source_commitment",
              shardUnitRefs: [commitmentId],
              shardIndex: index,
              shardCount: commitmentIds.length,
              sourceCommitmentIds: [commitmentId],
              reasonCodes: ["resource_requirement_shard_by_source_commitment"],
            }),
          ];
        });
        return {
          ...input,
          nodeId: `${input.nodeId}__commitment_${index + 1}`,
          targetCommitmentIds: [commitmentId],
          resourceRequirementPackets: shardRequirements,
          sourceContracts: input.sourceContracts.filter(
            (packet) => packet.commitmentId === commitmentId,
          ),
        };
      }),
    });
  }

  const semanticQuestionUnits = requirementPackets.flatMap((requirement) =>
    requirement.semanticQuestions.map((question) => ({ requirement, question })),
  );
  if (semanticQuestionUnits.length > 1) {
    attempts.push({
      shardUnitKind: "semantic_question",
      shardInputs: semanticQuestionUnits.map((unit, index) => ({
        ...input,
        nodeId: `${input.nodeId}__question_${index + 1}`,
        targetNodeIds: uniqueStrings(
          [...(input.targetNodeIds ?? []), unit.requirement.consumerNodeId],
          24,
        ),
        targetCommitmentIds: unit.requirement.sourceCommitmentIds,
        resourceRequirementPackets: [
          deriveResourceRequirementPacketStructuralShard({
            parent: unit.requirement,
            shardUnitKind: "semantic_question",
            shardUnitRefs: [unit.question],
            shardIndex: index,
            shardCount: semanticQuestionUnits.length,
            semanticQuestions: [unit.question],
            reasonCodes: ["resource_requirement_shard_by_semantic_question"],
          }),
        ],
      })),
    });
  }

  if (input.boundedRepoContextIndex.length > 1) {
    attempts.push({
      shardUnitKind: "bounded_repo_context_ref",
      shardInputs: input.boundedRepoContextIndex.map((entry, index) => ({
        ...input,
        nodeId: `${input.nodeId}__repoctx_${index + 1}`,
        resourceRequirementPackets: requirementPackets.map((requirement) =>
          deriveResourceRequirementPacketStructuralShard({
            parent: requirement,
            shardUnitKind: "bounded_repo_context_ref",
            shardUnitRefs: [entry.fileRef],
            shardIndex: index,
            shardCount: input.boundedRepoContextIndex.length,
            candidateRepoAreaRefs: [entry.fileRef],
            knownTargetRefs: requirement.knownTargetRefs.includes(entry.fileRef)
              ? [entry.fileRef]
              : requirement.knownTargetRefs,
            reasonCodes: ["resource_requirement_shard_by_bounded_repo_context_ref"],
          }),
        ),
        boundedRepoContextIndex: [entry],
        candidateFileRefs: input.candidateFileRefs.includes(entry.fileRef)
          ? [entry.fileRef]
          : input.candidateFileRefs,
      })),
    });
  }

  const sourcePromptSectionRefs =
    input.sourcePromptContextIndex?.sections.map((section) => section.sectionRef) ?? [];
  if (sourcePromptSectionRefs.length > 1) {
    attempts.push({
      shardUnitKind: "source_prompt_section_ref",
      shardInputs: sourcePromptSectionRefs.map((sectionRef, index) => ({
        ...input,
        nodeId: `${input.nodeId}__prompt_section_${index + 1}`,
        resourceRequirementPackets: requirementPackets.map((requirement) =>
          deriveResourceRequirementPacketStructuralShard({
            parent: requirement,
            shardUnitKind: "source_prompt_section_ref",
            shardUnitRefs: [sectionRef],
            shardIndex: index,
            shardCount: sourcePromptSectionRefs.length,
            reasonCodes: ["resource_requirement_shard_by_source_prompt_section_ref"],
          }),
        ),
        sourcePromptContextIndex: sourcePromptIndexWithSections(
          input.sourcePromptContextIndex,
          [sectionRef],
        ),
      })),
    });
  }

  return attempts.filter((attempt) => attempt.shardInputs.length > 1);
}

function buildCoverageManifest(input: {
  parentResult: ContextScoutExecutionPacketCompileResult;
  shardUnitKind: ResourceRequirementStructuralShardUnitKind;
  shardResults: ContextScoutExecutionPacketCompileResult[];
}): ContextScoutStructuralShardCoverageManifest {
  const maxShardInputBytes = Math.max(
    0,
    ...input.shardResults.map((result) => result.packet.exactProviderInputBytes),
  );
  return {
    artifactKind: "resource_scout_structural_shard_coverage_manifest",
    schemaVersion: "execution-platform.context-scout-structural-shard-coverage.v1",
    parentPacketRef: input.parentResult.packet.packetRef,
    parentNodeId: input.parentResult.packet.nodeId,
    parentResourceRequirementRefs: input.parentResult.packet.resourceRequirementRefs,
    parentTargetCommitmentIds: input.parentResult.packet.targetCommitmentIds,
    shardUnitKind: input.shardUnitKind,
    shardCount: input.shardResults.length,
    shardPacketRefs: input.shardResults.map((result) => result.packet.packetRef),
    shardResourceRequirementRefs: uniqueStrings(
      input.shardResults.flatMap((result) => result.packet.resourceRequirementRefs),
      200,
      420,
    ),
    shardTargetCommitmentIds: input.shardResults.map((result) =>
      result.packet.targetCommitmentIds.slice(0, 40),
    ),
    maxShardInputBytes,
    maxInputBytes: input.parentResult.packet.maxInputBytes,
    losslessStructuralSplit: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function buildSingleUnitBlocker(input: {
  parentResult: ContextScoutExecutionPacketCompileResult;
  shardResults: ContextScoutExecutionPacketCompileResult[];
}): ContextScoutSingleUnitOverProfileBlocker {
  const largestResult =
    input.shardResults
      .slice()
      .toSorted(
        (left, right) =>
          right.packet.exactProviderInputBytes - left.packet.exactProviderInputBytes,
      )[0] ?? input.parentResult;
  const structuralShard = largestResult.packet.resourceRequirementSummaries
    .map((summary) => summary.resourceRequirementRef)
    .slice(0, 24);
  return {
    artifactKind: "resource_scout_single_unit_over_profile_blocker",
    schemaVersion: "execution-platform.context-scout-single-unit-over-profile-blocker.v1",
    blockerRef: frontierRef({
      runtimeJobId: input.parentResult.packet.runtimeJobId,
      graphId: input.parentResult.packet.graphId,
      nodeId: largestResult.packet.nodeId,
      kind: "single-unit-blocker",
      fingerprint: sha256Text(
        JSON.stringify({
          parentPacketRef: input.parentResult.packet.packetRef,
          nodeId: largestResult.packet.nodeId,
          inputBytes: largestResult.packet.exactProviderInputBytes,
          maxInputBytes: largestResult.packet.maxInputBytes,
        }),
      ).slice(0, 20),
    }),
    parentPacketRef: input.parentResult.packet.packetRef,
    nodeId: largestResult.packet.nodeId,
    unitKind:
      largestResult.packet.resourceRequirementSummaries.length === 1
        ? "resource_requirement"
        : "resource_scout_execution_packet",
    unitRefs:
      structuralShard.length > 0
        ? structuralShard
        : [largestResult.packet.packetRef],
    inputBytes: largestResult.packet.exactProviderInputBytes,
    maxInputBytes: largestResult.packet.maxInputBytes,
    blockingReason:
      largestResult.packet.providerInputPreflight.blockingReason ??
      "A single declared resource scout unit still exceeds the provider profile bound.",
    reasonCodes: uniqueStrings(
      [
        "resource_scout_single_structural_unit_over_profile_bound",
        ...largestResult.reasonCodes,
      ],
      80,
      220,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function buildResourceFrontierRequest(
  result: ContextScoutStructuralReshardResult,
): ResourceFrontierRequest {
  const parent = result.parentResult.packet;
  const fingerprint = sha256Text(
    JSON.stringify({
      parentPacketRef: parent.packetRef,
      status: result.status,
      reasonCodes: result.reasonCodes.slice(0, 20),
    }),
  ).slice(0, 20);
  return {
    artifactKind: "resource_frontier_request",
    schemaVersion: "execution-platform.context-frontier-request.v1",
    requestRef: frontierRef({
      runtimeJobId: parent.runtimeJobId,
      graphId: parent.graphId,
      nodeId: parent.nodeId,
      kind: "request",
      fingerprint,
    }),
    runtimeJobId: parent.runtimeJobId,
    workflowId: parent.workflowId,
    graphId: parent.graphId,
    nodeId: parent.nodeId,
    parentPacketRef: parent.packetRef,
    targetNodeIds: parent.targetNodeIds.slice(0, 40),
    targetCommitmentIds: parent.targetCommitmentIds.slice(0, 40),
    resourceRequirementRefs: parent.resourceRequirementRefs.slice(0, 80),
    requestedTransition:
      result.status === "ready"
        ? "execute_shards_then_merge_handoffs"
        : result.status === "blocked"
          ? "record_single_unit_blocker"
          : "split_for_profile",
    reasonCodes: uniqueStrings(
      [
        "resource_frontier_request_compiled",
        `resource_frontier_structural_reshard_status:${result.status}`,
        ...result.reasonCodes,
      ],
      80,
      220,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function buildContextShardManifest(input: {
  frontierRequest: ResourceFrontierRequest;
  structuralReshard: Extract<ContextScoutStructuralReshardResult, { status: "ready" }>;
}): ContextShardManifest {
  const parent = input.structuralReshard.parentResult.packet;
  const maxShardInputBytes = Math.max(
    0,
    ...input.structuralReshard.shardResults.map((result) => result.packet.exactProviderInputBytes),
  );
  const fingerprint = sha256Text(
    JSON.stringify({
      frontierRequestRef: input.frontierRequest.requestRef,
      parentPacketRef: parent.packetRef,
      shardPacketRefs: input.structuralReshard.shardResults.map((result) => result.packet.packetRef),
    }),
  ).slice(0, 20);
  return {
    artifactKind: "context_shard_manifest",
    schemaVersion: "execution-platform.context-shard-manifest.v1",
    manifestRef: frontierRef({
      runtimeJobId: parent.runtimeJobId,
      graphId: parent.graphId,
      nodeId: parent.nodeId,
      kind: "shard-manifest",
      fingerprint,
    }),
    frontierRequestRef: input.frontierRequest.requestRef,
    parentPacketRef: parent.packetRef,
    parentNodeId: parent.nodeId,
    parentResourceRequirementRefs: parent.resourceRequirementRefs.slice(0, 120),
    parentTargetCommitmentIds: parent.targetCommitmentIds.slice(0, 80),
    shardUnitKind: input.structuralReshard.coverageManifest.shardUnitKind,
    shardCount: input.structuralReshard.shardResults.length,
    shardPacketRefs: input.structuralReshard.shardResults.map((result) => result.packet.packetRef),
    shardPackets: input.structuralReshard.shardResults.map((result) => result.packet),
    shardSummaries: input.structuralReshard.shardResults.map((result) => ({
      shardPacketRef: result.packet.packetRef,
      shardNodeId: result.packet.nodeId,
      status: result.status,
      inputBytes: result.packet.exactProviderInputBytes,
      maxInputBytes: result.packet.maxInputBytes,
      resourceRequirementRefs: result.packet.resourceRequirementRefs.slice(0, 80),
      targetCommitmentIds: result.packet.targetCommitmentIds.slice(0, 40),
    })),
    maxShardInputBytes,
    maxInputBytes: parent.maxInputBytes,
    mergeRequired: true,
    graphNodeExpansionAllowed: false,
    payloadBackedShardPackets: true,
    losslessStructuralSplit: true,
    reasonCodes: uniqueStrings(
      [
        "resource_frontier_shard_manifest_compiled",
        "resource_frontier_shards_payload_backed",
        "resource_frontier_graph_node_expansion_disabled",
        ...input.structuralReshard.reasonCodes,
      ],
      100,
      220,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function buildContextMergePacket(input: {
  frontierRequest: ResourceFrontierRequest;
  shardManifest: ContextShardManifest;
}): ContextMergePacket {
  const fingerprint = sha256Text(
    JSON.stringify({
      frontierRequestRef: input.frontierRequest.requestRef,
      shardManifestRef: input.shardManifest.manifestRef,
      shardCount: input.shardManifest.shardCount,
    }),
  ).slice(0, 20);
  return {
    artifactKind: "context_merge_packet",
    schemaVersion: "execution-platform.context-merge-packet.v1",
    mergePacketRef: frontierRef({
      runtimeJobId: input.frontierRequest.runtimeJobId,
      graphId: input.frontierRequest.graphId,
      nodeId: input.frontierRequest.nodeId,
      kind: "merge-packet",
      fingerprint,
    }),
    frontierRequestRef: input.frontierRequest.requestRef,
    shardManifestRef: input.shardManifest.manifestRef,
    parentPacketRef: input.shardManifest.parentPacketRef,
    parentNodeId: input.shardManifest.parentNodeId,
    consumerNodeIds: input.frontierRequest.targetNodeIds.slice(0, 40),
    targetCommitmentIds: input.frontierRequest.targetCommitmentIds.slice(0, 80),
    shardPacketRefs: input.shardManifest.shardPacketRefs,
    requiredShardHandoffRefs: [],
    mergeStatus: "pending_shard_handoffs",
    canUnlockConsumer: false,
    reasonCodes: [
      "resource_frontier_merge_packet_compiled",
      "resource_frontier_merge_requires_model_authored_shard_handoffs",
      "resource_frontier_merge_cannot_unlock_consumer_until_handoffs_accepted",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function hasModelAuthoredShardSubstance(input: {
  handoffSummaryForImplementation?: string | null;
  existingPatterns?: string[];
  risks?: string[];
  recommendedEditPoints?: string[];
  validationSuggestions?: string[];
}): boolean {
  const summaryLength = (input.handoffSummaryForImplementation ?? "").trim().length;
  const nonSummarySignalCount = [
    (input.existingPatterns ?? []).length > 0,
    (input.risks ?? []).length > 0,
    (input.recommendedEditPoints ?? []).length > 0,
    (input.validationSuggestions ?? []).length > 0,
  ].filter(Boolean).length;
  return summaryLength > 0 && nonSummarySignalCount > 0;
}

export function buildContextShardHandoff(input: {
  frontierRequest: ResourceFrontierRequest;
  shardManifest: ContextShardManifest;
  shardPacket: ContextScoutExecutionPacket;
  relevantFileRefs?: string[];
  existingPatterns?: string[];
  risks?: string[];
  recommendedEditPoints?: string[];
  validationSuggestions?: string[];
  handoffSummaryForImplementation?: string | null;
  limitations?: string[];
  modelAuthoredSufficiencySignal?: "sufficient" | "partial" | "insufficient";
  runtimeSuppliedRefsUsed?: boolean;
  providerDiagnosticsRef?: string | null;
}): ContextShardHandoff {
  const relevantFileRefs = uniqueStrings(input.relevantFileRefs ?? [], 80, 260);
  const existingPatterns = uniqueStrings(input.existingPatterns ?? [], 40, 700);
  const risks = uniqueStrings(input.risks ?? [], 40, 700);
  const recommendedEditPoints = uniqueStrings(input.recommendedEditPoints ?? [], 60, 700);
  const validationSuggestions = uniqueStrings(input.validationSuggestions ?? [], 40, 700);
  const limitations = uniqueStrings(input.limitations ?? [], 40, 700);
  const handoffSummaryForImplementation = bounded(
    input.handoffSummaryForImplementation ?? "",
    1_500,
  );
  const modelAuthoredSufficiencySignal =
    input.modelAuthoredSufficiencySignal ??
    (limitations.length > 0 ? "partial" : relevantFileRefs.length > 0 ? "sufficient" : "insufficient");
  const hasSubstance = hasModelAuthoredShardSubstance({
    handoffSummaryForImplementation,
    existingPatterns,
    risks,
    recommendedEditPoints,
    validationSuggestions,
  });
  const runtimeSuppliedRefsUsed = input.runtimeSuppliedRefsUsed === true;
  const structurallyHasRefs = relevantFileRefs.length > 0 || recommendedEditPoints.length > 0;
  const status: ContextShardHandoffStatus =
    hasSubstance && structurallyHasRefs && !runtimeSuppliedRefsUsed && limitations.length === 0
      ? "accepted"
      : hasSubstance && structurallyHasRefs
        ? "accepted_with_limitations"
        : structurallyHasRefs
          ? "needs_review_nonblocking"
          : "blocked";
  const fingerprint = sha256Text(
    JSON.stringify({
      frontierRequestRef: input.frontierRequest.requestRef,
      shardManifestRef: input.shardManifest.manifestRef,
      shardPacketRef: input.shardPacket.packetRef,
      relevantFileRefs,
      recommendedEditPoints,
      status,
    }),
  ).slice(0, 20);
  const workIntentRefs = uniqueStrings(
    input.shardPacket.resourceRequirementSummaries.map((summary) => summary.workIntentRef),
    40,
    420,
  );
  return {
    artifactKind: "context_shard_handoff",
    schemaVersion: "execution-platform.context-shard-handoff.v1",
    shardHandoffRef: frontierRef({
      runtimeJobId: input.frontierRequest.runtimeJobId,
      graphId: input.frontierRequest.graphId,
      nodeId: input.shardPacket.nodeId,
      kind: "shard-handoff",
      fingerprint,
    }),
    frontierRequestRef: input.frontierRequest.requestRef,
    shardManifestRef: input.shardManifest.manifestRef,
    shardPacketRef: input.shardPacket.packetRef,
    shardNodeId: input.shardPacket.nodeId,
    consumerNodeIds: input.frontierRequest.targetNodeIds.slice(0, 40),
    workIntentRefs,
    targetCommitmentIds: input.shardPacket.targetCommitmentIds.slice(0, 80),
    relevantFileRefs,
    existingPatterns,
    risks,
    recommendedEditPoints,
    validationSuggestions,
    handoffSummaryForImplementation,
    limitations: uniqueStrings(
      [
        ...limitations,
        ...(runtimeSuppliedRefsUsed
          ? [
              "Runtime-supplied verified refs were used; this shard cannot count as clean context success without model-authored verification.",
            ]
          : []),
        ...(!hasSubstance
          ? [
              "Shard handoff lacks required model-authored implementation substance beyond structural refs.",
            ]
          : []),
      ],
      40,
      700,
    ),
    modelAuthoredSufficiencySignal,
    status,
    providerDiagnosticsRef: input.providerDiagnosticsRef ?? null,
    hasModelAuthoredHandoffSubstance: hasSubstance,
    runtimeSuppliedRefsUsed,
    semanticQualityJudgedByDeterministicCode: false,
    reasonCodes: uniqueStrings(
      [
        "context_shard_handoff_compiled",
        `context_shard_handoff_status:${status}`,
        ...(hasSubstance
          ? ["context_shard_handoff_model_authored_substance_present"]
          : ["context_shard_handoff_model_authored_substance_missing"]),
        ...(runtimeSuppliedRefsUsed ? ["context_shard_handoff_runtime_supplied_refs_used"] : []),
        ...(status === "accepted_with_limitations"
          ? ["context_shard_handoff_accepted_with_limitations"]
          : []),
        ...(status === "needs_review_nonblocking"
          ? ["context_shard_handoff_needs_review_nonblocking"]
          : []),
        ...(status === "blocked" ? ["context_shard_handoff_blocked"] : []),
      ],
      80,
      220,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawFileContentStored: false,
  };
}

export function reviewContextShardHandoffs(input: {
  frontierRequest: ResourceFrontierRequest;
  shardManifest: ContextShardManifest;
  handoffs: ContextShardHandoff[];
  reviewerSummary?: string | null;
  consumerWaiverRef?: string | null;
}): ContextShardHandoffReview {
  const handoffsByPacketRef = new Map(input.handoffs.map((handoff) => [handoff.shardPacketRef, handoff]));
  const accepted = input.handoffs.filter((handoff) => handoff.status === "accepted");
  const acceptedWithLimitations = input.handoffs.filter(
    (handoff) => handoff.status === "accepted_with_limitations",
  );
  const partial = [...acceptedWithLimitations, ...input.handoffs.filter((handoff) => handoff.status === "needs_review_nonblocking")];
  const rejected = input.handoffs.filter((handoff) => handoff.status === "blocked");
  const missingShardPacketRefs = input.shardManifest.shardPacketRefs.filter(
    (shardPacketRef) => !handoffsByPacketRef.has(shardPacketRef),
  );
  const limitationRefs = uniqueStrings(
    partial.flatMap((handoff) => handoff.limitations.map(
        (limitation) =>
          `${handoff.shardHandoffRef}#limitation-${sha256Text(limitation).slice(0, 10)}`,
      )),
    80,
    420,
  );
  const allShardPacketsCovered = missingShardPacketRefs.length === 0;
  const consumerWaiverRef = input.consumerWaiverRef ?? null;
  const status: ContextShardHandoffReview["status"] =
    rejected.length > 0 || !allShardPacketsCovered || input.handoffs.length === 0
      ? "blocked"
      : acceptedWithLimitations.length > 0 || partial.length > acceptedWithLimitations.length
        ? consumerWaiverRef
          ? "accepted_with_limitations"
          : "needs_review"
        : "accepted";
  const fingerprint = sha256Text(
    JSON.stringify({
      frontierRequestRef: input.frontierRequest.requestRef,
      shardManifestRef: input.shardManifest.manifestRef,
      handoffRefs: input.handoffs.map((handoff) => handoff.shardHandoffRef),
      status,
      consumerWaiverRef,
    }),
  ).slice(0, 20);
  return {
    artifactKind: "context_shard_handoff_review",
    schemaVersion: "execution-platform.context-shard-handoff-review.v1",
    reviewRef: frontierRef({
      runtimeJobId: input.frontierRequest.runtimeJobId,
      graphId: input.frontierRequest.graphId,
      nodeId: input.frontierRequest.nodeId,
      kind: "shard-review",
      fingerprint,
    }),
    frontierRequestRef: input.frontierRequest.requestRef,
    shardManifestRef: input.shardManifest.manifestRef,
    acceptedShardHandoffRefs: accepted.map((handoff) => handoff.shardHandoffRef),
    partialShardHandoffRefs: partial.map((handoff) => handoff.shardHandoffRef),
    rejectedShardHandoffRefs: rejected.map((handoff) => handoff.shardHandoffRef),
    missingShardPacketRefs,
    limitationRefs,
    status,
    sufficientForImplementation:
      (status === "accepted" || status === "accepted_with_limitations") &&
      input.handoffs.every((handoff) => handoff.modelAuthoredSufficiencySignal !== "insufficient"),
    sufficientForValidation: status === "accepted" || status === "accepted_with_limitations",
    reviewerSummary: bounded(
      input.reviewerSummary ??
        (status === "accepted"
          ? "All context shard handoffs were accepted with model-authored substance."
          : "Context shard handoffs include limitations, missing handoffs, or blocked shards."),
      1_200,
    ),
    consumerWaiverRef,
    semanticQualityJudgedByDeterministicCode: false,
    reasonCodes: uniqueStrings(
      [
        "context_shard_handoff_review_compiled",
        `context_shard_handoff_review_status:${status}`,
        ...(missingShardPacketRefs.length > 0 ? ["context_shard_handoff_review_missing_shards"] : []),
        ...(partial.length > 0 ? ["context_shard_handoff_review_limitations_present"] : []),
        ...(status === "needs_review" ? ["context_shard_handoff_review_consumer_waiver_required"] : []),
      ],
      80,
      220,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function mergeAcceptedContextShardHandoffs(input: {
  pendingMergePacket: ContextMergePacket;
  shardManifest: ContextShardManifest;
  handoffs: ContextShardHandoff[];
  review: ContextShardHandoffReview;
}): AcceptedContextMergePacket {
  const acceptedHandoffs = input.handoffs.filter((handoff) =>
    input.review.acceptedShardHandoffRefs.includes(handoff.shardHandoffRef),
  );
  const partialHandoffs = input.handoffs.filter((handoff) =>
    input.review.partialShardHandoffRefs.includes(handoff.shardHandoffRef),
  );
  const allAcceptedRefs = [...acceptedHandoffs, ...partialHandoffs].map(
    (handoff) => handoff.shardHandoffRef,
  );
  const mergeStatus: AcceptedContextMergePacket["mergeStatus"] =
    input.review.status === "accepted"
      ? "accepted"
      : input.review.status === "accepted_with_limitations"
        ? "accepted_with_limitations"
        : input.review.status === "needs_review"
          ? "needs_review"
          : "blocked";
  return {
    ...input.pendingMergePacket,
    requiredShardHandoffRefs: input.shardManifest.shardPacketRefs.map(
      (shardPacketRef) => `${input.shardManifest.manifestRef}#handoff-required:${sha256Text(shardPacketRef).slice(0, 12)}`,
    ),
    acceptedShardHandoffRefs: allAcceptedRefs,
    partialShardHandoffRefs: input.review.partialShardHandoffRefs,
    rejectedShardHandoffRefs: input.review.rejectedShardHandoffRefs,
    missingShardPacketRefs: input.review.missingShardPacketRefs,
    mergedRelevantFileRefs: uniqueStrings(
      [...acceptedHandoffs, ...partialHandoffs].flatMap((handoff) => handoff.relevantFileRefs),
      120,
      260,
    ),
    mergedRecommendedEditPointRefs: uniqueStrings(
      [...acceptedHandoffs, ...partialHandoffs].flatMap((handoff) => handoff.recommendedEditPoints),
      120,
      700,
    ),
    mergedValidationSuggestionRefs: uniqueStrings(
      [...acceptedHandoffs, ...partialHandoffs].flatMap((handoff) => handoff.validationSuggestions),
      80,
      700,
    ),
    modelAuthoredSufficiencyReviewRef: input.review.reviewRef,
    limitations: uniqueStrings(
      [...acceptedHandoffs, ...partialHandoffs].flatMap((handoff) => handoff.limitations),
      80,
      700,
    ),
    consumerWaiverRef: input.review.consumerWaiverRef,
    mergeStatus,
    canUnlockConsumer: mergeStatus === "accepted" || mergeStatus === "accepted_with_limitations",
    reasonCodes: uniqueStrings(
      [
        "resource_frontier_merge_packet_handoffs_merged",
        `resource_frontier_merge_status:${mergeStatus}`,
        ...(allAcceptedRefs.length > 0
          ? ["resource_frontier_merge_has_accepted_shard_handoff_refs"]
          : ["resource_frontier_merge_missing_accepted_shard_handoff_refs"]),
        ...(mergeStatus === "accepted_with_limitations"
          ? ["resource_frontier_merge_accepted_with_limitations"]
          : []),
        ...input.review.reasonCodes,
      ],
      100,
      220,
    ),
  };
}

export function buildWorkIntentContextSatisfactionState(input: {
  mergePacket: AcceptedContextMergePacket;
  handoffReview: ContextShardHandoffReview;
  workIntentRefs?: string[];
}): WorkIntentContextSatisfactionState {
  const workIntentRefs = uniqueStrings(input.workIntentRefs ?? [], 80, 420);
  const contextStatus: WorkIntentContextSatisfactionState["contextStatus"] =
    input.mergePacket.mergeStatus === "accepted"
      ? "satisfied"
      : input.mergePacket.mergeStatus === "accepted_with_limitations"
        ? input.mergePacket.consumerWaiverRef
          ? "satisfied_with_limitations"
          : "needs_review"
        : input.mergePacket.mergeStatus === "needs_review"
          ? "needs_review"
          : "blocked";
  const nextLegalTransition: WorkIntentContextSatisfactionState["nextLegalTransition"] =
    contextStatus === "satisfied" || contextStatus === "satisfied_with_limitations"
      ? "scheduler.promote_resource_satisfied_intent"
      : contextStatus === "needs_review"
        ? "scheduler.accept_resource_limitation_waiver"
        : "scheduler.request_resource_requirement_for_work_intent";
  const fingerprint = sha256Text(
    JSON.stringify({
      mergePacketRef: input.mergePacket.mergePacketRef,
      acceptedResourceHandoffRefs: input.mergePacket.acceptedShardHandoffRefs,
      contextStatus,
      workIntentRefs,
    }),
  ).slice(0, 20);
  const runtimeRef = parseFrontierRuntimeRef(input.mergePacket.frontierRequestRef);
  return {
    artifactKind: "work_intent_context_satisfaction_state",
    schemaVersion: "execution-platform.work-intent-context-satisfaction-state.v1",
    satisfactionStateRef: frontierRef({
      runtimeJobId: runtimeRef.runtimeJobId,
      graphId: runtimeRef.graphId,
      nodeId: input.mergePacket.parentNodeId,
      kind: "context-satisfaction",
      fingerprint,
    }),
    frontierRequestRef: input.mergePacket.frontierRequestRef,
    contextMergePacketRef: input.mergePacket.mergePacketRef,
    consumerNodeIds: input.mergePacket.consumerNodeIds.slice(0, 40),
    workIntentRefs,
    acceptedResourceHandoffRefs: input.mergePacket.acceptedShardHandoffRefs.slice(0, 120),
    limitationRefs: input.handoffReview.limitationRefs.slice(0, 80),
    consumerWaiverRef: input.mergePacket.consumerWaiverRef,
    contextStatus,
    nextLegalTransition,
    reasonCodes: uniqueStrings(
      [
        "work_intent_context_satisfaction_state_compiled",
        `work_intent_context_satisfaction_status:${contextStatus}`,
        ...(contextStatus === "needs_review"
          ? ["work_intent_context_accepted_with_limitations_waiver_missing"]
          : []),
        ...input.mergePacket.reasonCodes,
      ],
      100,
      220,
    ),
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function structurallyReshardContextScoutExecutionPacket(
  input: ContextScoutExecutionPacketCompileInput,
): ContextScoutStructuralReshardResult {
  const parentResult = compileContextScoutExecutionPacket(input);
  if (!isProviderProfileBlock(parentResult)) {
    return {
      status: "not_required",
      parentResult,
      reasonCodes: [
        "resource_scout_structural_reshard_not_required",
        ...parentResult.reasonCodes,
      ],
    };
  }

  let lastShardResults: ContextScoutExecutionPacketCompileResult[] = [];
  for (const attempt of buildContextScoutShardAttempts(input)) {
    const shardResults = attempt.shardInputs.map((shardInput) =>
      compileContextScoutExecutionPacket(shardInput),
    );
    lastShardResults = shardResults;
    const providerBlocked = shardResults.filter(isProviderProfileBlock);
    if (providerBlocked.length === 0) {
      return {
        status: "ready",
        parentResult,
        shardResults,
        coverageManifest: buildCoverageManifest({
          parentResult,
          shardUnitKind: attempt.shardUnitKind,
          shardResults,
        }),
        reasonCodes: uniqueStrings(
          [
            "resource_scout_structural_reshard_compiled",
            `resource_scout_structural_reshard_unit_kind:${attempt.shardUnitKind}`,
            `resource_scout_structural_reshard_shard_count:${shardResults.length}`,
            ...parentResult.reasonCodes,
          ],
          100,
          220,
        ),
      };
    }
  }

  const blocker = buildSingleUnitBlocker({
    parentResult,
    shardResults: lastShardResults,
  });
  return {
    status: "blocked",
    parentResult,
    shardResults: lastShardResults,
    blocker,
    reasonCodes: uniqueStrings(
      [
        "resource_scout_structural_reshard_failed_single_unit_over_profile",
        ...blocker.reasonCodes,
      ],
      100,
      220,
    ),
  };
}

export function contextScoutStructuralReshardMetadata(
  result: ContextScoutStructuralReshardResult,
): JsonValue {
  const shardResults =
    result.status === "ready" || result.status === "blocked" ? result.shardResults : [];
  return {
    status: result.status,
    parentPacketRef: result.parentResult.packet.packetRef,
    parentStatus: result.parentResult.status,
    parentInputBytes: result.parentResult.packet.exactProviderInputBytes,
    parentMaxInputBytes: result.parentResult.packet.maxInputBytes,
    shardCount: shardResults.length,
    shardPacketRefSample: shardResults.map((shard) => shard.packet.packetRef).slice(0, 12),
    shardInputByteSample: shardResults
      .map((shard) => shard.packet.exactProviderInputBytes)
      .slice(0, 12),
    shardStatusSample: shardResults.map((shard) => shard.status).slice(0, 12),
    shardUnitKind: result.status === "ready" ? result.coverageManifest.shardUnitKind : null,
    shardManifestRef: null,
    singleUnitBlockerRef: result.status === "blocked" ? result.blocker.blockerRef : null,
    maxShardInputBytes:
      shardResults.length > 0
        ? Math.max(0, ...shardResults.map((shard) => shard.packet.exactProviderInputBytes))
        : 0,
    reasonCodes: result.reasonCodes.slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

export function resourceFrontierRequestMetadata(request: ResourceFrontierRequest): JsonValue {
  return {
    requestRef: request.requestRef,
    parentPacketRef: request.parentPacketRef,
    nodeId: request.nodeId,
    targetNodeIds: request.targetNodeIds.slice(0, 24),
    targetCommitmentIds: request.targetCommitmentIds.slice(0, 24),
    resourceRequirementRefs: request.resourceRequirementRefs.slice(0, 24),
    requestedTransition: request.requestedTransition,
    reasonCodes: request.reasonCodes.slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

export function contextShardManifestMetadata(manifest: ContextShardManifest): JsonValue {
  return {
    manifestRef: manifest.manifestRef,
    frontierRequestRef: manifest.frontierRequestRef,
    parentPacketRef: manifest.parentPacketRef,
    parentNodeId: manifest.parentNodeId,
    shardUnitKind: manifest.shardUnitKind,
    shardCount: manifest.shardCount,
    shardPacketRefSample: manifest.shardPacketRefs.slice(0, 12),
    shardNodeIdSample: manifest.shardSummaries
      .map((summary) => summary.shardNodeId)
      .slice(0, 12),
    maxShardInputBytes: manifest.maxShardInputBytes,
    maxInputBytes: manifest.maxInputBytes,
    mergeRequired: manifest.mergeRequired,
    graphNodeExpansionAllowed: manifest.graphNodeExpansionAllowed,
    payloadBackedShardPackets: manifest.payloadBackedShardPackets,
    reasonCodes: manifest.reasonCodes.slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

type ContextMergePacketMetadataInput = {
  mergePacketRef: string;
  frontierRequestRef: string;
  shardManifestRef: string;
  parentPacketRef: string;
  parentNodeId: string;
  consumerNodeIds: string[];
  targetCommitmentIds: string[];
  shardPacketRefs: string[];
  mergeStatus: string;
  canUnlockConsumer: boolean;
  reasonCodes: string[];
};

export function contextMergePacketMetadata(
  packet: ContextMergePacketMetadataInput,
): { [key: string]: JsonValue } {
  return {
    mergePacketRef: packet.mergePacketRef,
    frontierRequestRef: packet.frontierRequestRef,
    shardManifestRef: packet.shardManifestRef,
    parentPacketRef: packet.parentPacketRef,
    parentNodeId: packet.parentNodeId,
    consumerNodeIds: packet.consumerNodeIds.slice(0, 24),
    targetCommitmentIds: packet.targetCommitmentIds.slice(0, 24),
    shardCount: packet.shardPacketRefs.length,
    shardPacketRefSample: packet.shardPacketRefs.slice(0, 12),
    mergeStatus: packet.mergeStatus,
    canUnlockConsumer: packet.canUnlockConsumer,
    reasonCodes: packet.reasonCodes.slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

export function contextShardHandoffMetadata(handoff: ContextShardHandoff): JsonValue {
  return {
    shardHandoffRef: handoff.shardHandoffRef,
    frontierRequestRef: handoff.frontierRequestRef,
    shardManifestRef: handoff.shardManifestRef,
    shardPacketRef: handoff.shardPacketRef,
    shardNodeId: handoff.shardNodeId,
    consumerNodeIds: handoff.consumerNodeIds.slice(0, 24),
    workIntentRefs: handoff.workIntentRefs.slice(0, 24),
    targetCommitmentIds: handoff.targetCommitmentIds.slice(0, 24),
    relevantFileRefs: handoff.relevantFileRefs.slice(0, 40),
    recommendedEditPointCount: handoff.recommendedEditPoints.length,
    validationSuggestionCount: handoff.validationSuggestions.length,
    limitationCount: handoff.limitations.length,
    modelAuthoredSufficiencySignal: handoff.modelAuthoredSufficiencySignal,
    status: handoff.status,
    providerDiagnosticsRef: handoff.providerDiagnosticsRef,
    hasModelAuthoredHandoffSubstance: handoff.hasModelAuthoredHandoffSubstance,
    runtimeSuppliedRefsUsed: handoff.runtimeSuppliedRefsUsed,
    semanticQualityJudgedByDeterministicCode: false,
    reasonCodes: handoff.reasonCodes.slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

export function contextShardHandoffReviewMetadata(
  review: ContextShardHandoffReview,
): JsonValue {
  return {
    reviewRef: review.reviewRef,
    frontierRequestRef: review.frontierRequestRef,
    shardManifestRef: review.shardManifestRef,
    acceptedShardHandoffRefs: review.acceptedShardHandoffRefs.slice(0, 40),
    partialShardHandoffRefs: review.partialShardHandoffRefs.slice(0, 40),
    rejectedShardHandoffRefs: review.rejectedShardHandoffRefs.slice(0, 40),
    missingShardPacketRefs: review.missingShardPacketRefs.slice(0, 40),
    limitationRefs: review.limitationRefs.slice(0, 40),
    status: review.status,
    sufficientForImplementation: review.sufficientForImplementation,
    sufficientForValidation: review.sufficientForValidation,
    consumerWaiverRef: review.consumerWaiverRef,
    semanticQualityJudgedByDeterministicCode: false,
    reasonCodes: review.reasonCodes.slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

export function acceptedContextMergePacketMetadata(
  packet: AcceptedContextMergePacket,
): JsonValue {
  return {
    ...contextMergePacketMetadata(packet),
    requiredShardHandoffRefs: packet.requiredShardHandoffRefs.slice(0, 40),
    acceptedShardHandoffRefs: packet.acceptedShardHandoffRefs.slice(0, 40),
    partialShardHandoffRefs: packet.partialShardHandoffRefs.slice(0, 40),
    rejectedShardHandoffRefs: packet.rejectedShardHandoffRefs.slice(0, 40),
    missingShardPacketRefs: packet.missingShardPacketRefs.slice(0, 40),
    mergedRelevantFileRefs: packet.mergedRelevantFileRefs.slice(0, 40),
    mergedRecommendedEditPointCount: packet.mergedRecommendedEditPointRefs.length,
    mergedValidationSuggestionCount: packet.mergedValidationSuggestionRefs.length,
    modelAuthoredSufficiencyReviewRef: packet.modelAuthoredSufficiencyReviewRef,
    limitationCount: packet.limitations.length,
    consumerWaiverRef: packet.consumerWaiverRef,
    mergeStatus: packet.mergeStatus,
    canUnlockConsumer: packet.canUnlockConsumer,
    reasonCodes: packet.reasonCodes.slice(0, 80),
  } satisfies JsonValue;
}

export function workIntentContextSatisfactionStateMetadata(
  state: WorkIntentContextSatisfactionState,
): JsonValue {
  return {
    satisfactionStateRef: state.satisfactionStateRef,
    frontierRequestRef: state.frontierRequestRef,
    contextMergePacketRef: state.contextMergePacketRef,
    consumerNodeIds: state.consumerNodeIds.slice(0, 24),
    workIntentRefs: state.workIntentRefs.slice(0, 24),
    acceptedResourceHandoffRefs: state.acceptedResourceHandoffRefs.slice(0, 40),
    limitationRefs: state.limitationRefs.slice(0, 40),
    consumerWaiverRef: state.consumerWaiverRef,
    contextStatus: state.contextStatus,
    nextLegalTransition: state.nextLegalTransition,
    semanticQualityJudgedByDeterministicCode: false,
    reasonCodes: state.reasonCodes.slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

export function resourceFrontierSingleUnitBlockerMetadata(
  blocker: ContextScoutSingleUnitOverProfileBlocker,
): JsonValue {
  return {
    blockerRef: blocker.blockerRef,
    parentPacketRef: blocker.parentPacketRef,
    nodeId: blocker.nodeId,
    unitKind: blocker.unitKind,
    unitRefs: blocker.unitRefs.slice(0, 24),
    inputBytes: blocker.inputBytes,
    maxInputBytes: blocker.maxInputBytes,
    blockingReason: blocker.blockingReason,
    reasonCodes: blocker.reasonCodes.slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

export function contextScoutExecutionPacketMetadata(
  packet: ContextScoutExecutionPacket,
): JsonValue {
  return {
    packetRef: packet.packetRef,
    packetId: packet.packetId,
    status: packet.status,
    targetCommitmentIds: packet.targetCommitmentIds,
    targetNodeIds: packet.targetNodeIds,
    resourceRequirementRefs: packet.resourceRequirementRefs,
    resourceRequirementSummaries: packet.resourceRequirementSummaries.slice(0, 8),
    contextBrokerRequestRef: packet.contextBrokerRequest?.requestRef ?? null,
    contextBrokerStatus: packet.contextBrokerRequest?.status ?? null,
    contextBrokerConsumerNodeId: packet.contextBrokerRequest?.consumerNodeId ?? null,
    contextBrokerReasonCodes: packet.contextBrokerRequest?.reasonCodes ?? [],
    sourceContractRefs: packet.sourceContractRefs,
    boundedRepoContextRefs: packet.boundedRepoContextRefs.map((entry) => entry.fileRef),
    candidateFileRefs: packet.candidateFileRefs,
    sourcePromptHash: packet.sourcePrompt.promptHash,
    sourcePromptSectionRefs: packet.sourcePrompt.sectionRefs,
    estimatedPromptBytes: packet.estimatedPromptBytes,
    exactProviderInputBytes: packet.exactProviderInputBytes,
    maxInputBytes: packet.maxInputBytes,
    providerTimeoutMs: packet.providerTimeoutMs,
    providerEnvelopeReserveBytes: packet.providerEnvelopeReserveBytes,
    providerInputBudgetStatus: packet.providerInputBudgetStatus,
    providerInputPreflight: packet.providerInputPreflight as unknown as JsonValue,
    modelPolicyRef: packet.modelPolicyRef,
    reasonCodes: packet.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}
