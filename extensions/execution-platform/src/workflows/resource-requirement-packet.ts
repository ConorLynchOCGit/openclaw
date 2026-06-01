import { createHash } from "node:crypto";
import { modelTaskPolicyFor } from "../model-tasks/model-task-classification.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  EvidenceModeSchema,
  ExecutionIntentSchema,
  type EvidenceMode,
  type ExecutionIntent,
} from "./execution-intent.ts";
import type { ContextBrokerRequest } from "./context-broker.ts";
import {
  selectedRefsFromResourceObjectiveFocus,
  type ResourceObjectiveFocus,
  type ResourceObjectiveFocusLegalRefKind,
  type ResourceObjectiveFocusLegalRefUniverse,
} from "./resource-objective-focus.ts";

export const RESOURCE_REQUIREMENT_PACKET_ARTIFACT_TYPE =
  "execution_platform.resource_requirement_packet" as const;

export const RESOURCE_REQUIREMENT_PACKET_SCHEMA_VERSION =
  "execution-platform.resource-requirement-packet.v1" as const;

export type ResourceRequirementStructuralShardUnitKind =
  | "resource_requirement"
  | "source_commitment"
  | "semantic_question"
  | "candidate_repo_ref"
  | "bounded_repo_context_ref"
  | "source_prompt_section_ref"
  | "source_contract_ref";

export type ResourceRequirementStructuralShard = {
  parentResourceRequirementRef: string;
  parentResourceRequirementHash: string;
  shardId: string;
  shardIndex: number;
  shardCount: number;
  shardUnitKind: ResourceRequirementStructuralShardUnitKind;
  shardUnitRefs: string[];
  losslessStructuralSplit: true;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

const boundedString = (max: number) => (value: string | null | undefined): string =>
  (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);

function uniqueStrings(
  values: Array<string | null | undefined>,
  max: number,
  chars = 300,
): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = boundedString(chars)(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export type ResourceRequirementAcceptanceContract = {
  requiredHandoffFields: string[];
  sufficiencyCriteria: string[];
  acceptedStatuses: Array<"accepted" | "accepted_with_limitations">;
  limitationWaiverRequiredForAcceptedWithLimitations: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ResourceRequirementLimitationPolicy = {
  acceptedWithLimitationsRequiresConsumerWaiver: boolean;
  blockingLimitationRefs: string[];
  nonblockingLimitationRefs: string[];
  allowedLimitationOutcomes: Array<
    "accepted" | "accepted_with_limitations" | "needs_review_nonblocking" | "needs_repair_blocking"
  >;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ResourceRequirementPacket = {
  artifactKind: "resource_requirement_packet";
  schemaVersion: typeof RESOURCE_REQUIREMENT_PACKET_SCHEMA_VERSION;
  resourceRequirementId: string;
  resourceRequirementRef: string;
  resourceRequirementHash: string;
  structuralShard: ResourceRequirementStructuralShard | null;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  consumerBranchId: string;
  consumerNodeId: string;
  workIntentRef: string;
  sourceCommitmentIds: string[];
  resourceObjectiveFocusRef: string | null;
  legalRefUniverseRef: string | null;
  contextPurpose: string;
  semanticQuestions: string[];
  requiredResourceKinds: string[];
  candidateSourceRefs: string[];
  candidateRepoAreaRefs: string[];
  candidateMemoryContextPackRefs: string[];
  knownTargetRefs: string[];
  knownValidationNeedRefs: string[];
  downstreamCapabilityId: string;
  downstreamExecutionIntent: ExecutionIntent;
  downstreamEvidenceMode: EvidenceMode[];
  contextAcceptanceContract: ResourceRequirementAcceptanceContract;
  limitationPolicy: ResourceRequirementLimitationPolicy;
  byteBudget: {
    maxRequirementBytes: number;
    maxScoutInputBytes: number;
    rawPromptStored: false;
  };
  toolBudget: {
    maxToolCalls: number;
    allowedToolIds: string[];
    rawPromptStored: false;
  };
  providerTimeoutPolicy: {
    modelTaskClass: "local_semantic_extraction";
    modelPolicyRef: string;
    timeoutMs: number;
    rawProviderLogStored: false;
  };
  repairPolicy: {
    nextLegalTransitions: string[];
    blockerReasonCodes: string[];
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
  };
  sourceContextBrokerRequestRef: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type ResourceRequirementPacketManifest = {
  resourceRequirementRef: string;
  resourceRequirementId: string;
  resourceRequirementHash: string;
  parentResourceRequirementRef: string | null;
  structuralShardUnitKind: ResourceRequirementStructuralShardUnitKind | null;
  structuralShardUnitRefs: string[];
  schemaVersion: typeof RESOURCE_REQUIREMENT_PACKET_SCHEMA_VERSION;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  consumerBranchId: string;
  consumerNodeId: string;
  workIntentRef: string;
  sourceCommitmentIds: string[];
  resourceObjectiveFocusRef: string | null;
  legalRefUniverseRef: string | null;
  contextPurpose: string;
  semanticQuestionCount: number;
  semanticQuestionSample: string[];
  requiredResourceKinds: string[];
  downstreamCapabilityId: string;
  downstreamExecutionIntent: ExecutionIntent;
  downstreamEvidenceMode: EvidenceMode[];
  candidateRepoAreaRefCount: number;
  knownTargetRefCount: number;
  knownValidationNeedRefCount: number;
  sourceContextBrokerRequestRef: string | null;
  byteCount: number;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ResourceRequirementCompileResult = {
  status: "ready" | "blocked";
  packet: ResourceRequirementPacket;
  manifest: ResourceRequirementPacketManifest;
  reasonCodes: string[];
};

function resourceRequirementRef(input: {
  runtimeJobId: string;
  graphId: string;
  consumerNodeId: string;
  requirementId: string;
}): string {
  return `runtime-job://${boundedString(180)(input.runtimeJobId)}/runtime-work-graph/${boundedString(
    140,
  )(input.graphId)}/resource-requirement/${boundedString(140)(
    input.consumerNodeId,
  )}/${input.requirementId}`;
}

function parseExecutionIntent(value: string): ExecutionIntent | null {
  const parsed = ExecutionIntentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseEvidenceMode(values: string[]): EvidenceMode[] {
  return values
    .map((value) => EvidenceModeSchema.safeParse(value))
    .filter((value): value is { success: true; data: EvidenceMode } => value.success)
    .map((value) => value.data)
    .slice(0, 12);
}

export function buildResourceRequirementPacketManifest(
  packet: ResourceRequirementPacket,
): ResourceRequirementPacketManifest {
  return {
    resourceRequirementRef: packet.resourceRequirementRef,
    resourceRequirementId: packet.resourceRequirementId,
    resourceRequirementHash: packet.resourceRequirementHash,
    parentResourceRequirementRef: packet.structuralShard?.parentResourceRequirementRef ?? null,
    structuralShardUnitKind: packet.structuralShard?.shardUnitKind ?? null,
    structuralShardUnitRefs: packet.structuralShard?.shardUnitRefs.slice(0, 24) ?? [],
    schemaVersion: packet.schemaVersion,
    runtimeJobId: packet.runtimeJobId,
    workflowId: packet.workflowId,
    graphId: packet.graphId,
    consumerBranchId: packet.consumerBranchId,
    consumerNodeId: packet.consumerNodeId,
    workIntentRef: packet.workIntentRef,
    sourceCommitmentIds: packet.sourceCommitmentIds.slice(0, 24),
    resourceObjectiveFocusRef: packet.resourceObjectiveFocusRef,
    legalRefUniverseRef: packet.legalRefUniverseRef,
    contextPurpose: packet.contextPurpose,
    semanticQuestionCount: packet.semanticQuestions.length,
    semanticQuestionSample: packet.semanticQuestions.slice(0, 4),
    requiredResourceKinds: packet.requiredResourceKinds.slice(0, 16),
    downstreamCapabilityId: packet.downstreamCapabilityId,
    downstreamExecutionIntent: packet.downstreamExecutionIntent,
    downstreamEvidenceMode: packet.downstreamEvidenceMode.slice(0, 12),
    candidateRepoAreaRefCount: packet.candidateRepoAreaRefs.length,
    knownTargetRefCount: packet.knownTargetRefs.length,
    knownValidationNeedRefCount: packet.knownValidationNeedRefs.length,
    sourceContextBrokerRequestRef: packet.sourceContextBrokerRequestRef,
    byteCount: bytes(packet),
    reasonCodes: packet.reasonCodes.slice(0, 30),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function resourceRequirementPacketMetadata(packet: ResourceRequirementPacket): JsonValue {
  return {
    ...buildResourceRequirementPacketManifest(packet),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

export function summarizeResourceRequirementPacketForReadback(
  packet: ResourceRequirementPacket,
): JsonValue {
  const manifest = buildResourceRequirementPacketManifest(packet);
  return {
    resourceRequirementRef: manifest.resourceRequirementRef,
    resourceRequirementHash: manifest.resourceRequirementHash,
    parentResourceRequirementRef: manifest.parentResourceRequirementRef,
    structuralShardUnitKind: manifest.structuralShardUnitKind,
    structuralShardUnitRefs: manifest.structuralShardUnitRefs,
    consumerNodeId: manifest.consumerNodeId,
    consumerBranchId: manifest.consumerBranchId,
    workIntentRef: manifest.workIntentRef,
    resourceObjectiveFocusRef: manifest.resourceObjectiveFocusRef,
    legalRefUniverseRef: manifest.legalRefUniverseRef,
    contextPurpose: manifest.contextPurpose,
    semanticQuestionSample: manifest.semanticQuestionSample,
    requiredResourceKinds: manifest.requiredResourceKinds,
    downstreamCapabilityId: manifest.downstreamCapabilityId,
    downstreamExecutionIntent: manifest.downstreamExecutionIntent,
    downstreamEvidenceMode: manifest.downstreamEvidenceMode,
    sourceContextBrokerRequestRef: manifest.sourceContextBrokerRequestRef,
    byteCount: manifest.byteCount,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

export function compileResourceRequirementPacketFromBrokerRequest(input: {
  request: ContextBrokerRequest;
  workIntentRef: string | null;
  consumerBranchId?: string | null;
  downstreamCapabilityId: string | null;
  downstreamExecutionIntent: string | null;
  downstreamEvidenceMode?: string[];
  contextPurpose?: string | null;
  semanticQuestions?: string[];
  requiredResourceKinds?: string[];
  knownTargetRefs?: string[];
  knownValidationNeedRefs?: string[];
  candidateMemoryContextPackRefs?: string[];
  resourceObjectiveFocus?: ResourceObjectiveFocus | null;
  legalRefUniverse?: ResourceObjectiveFocusLegalRefUniverse | null;
  nextLegalTransitions?: string[];
  blockerReasonCodes?: string[];
  maxToolCalls?: number;
}): ResourceRequirementCompileResult {
  const policy = modelTaskPolicyFor("local_semantic_extraction");
  const focus = input.resourceObjectiveFocus ?? null;
  const legalRefUniverse = input.legalRefUniverse ?? null;
  const focusAccepted =
    focus?.status === "accepted" &&
    legalRefUniverse !== null &&
    focus.legalRefUniverseRef === legalRefUniverse.legalRefUniverseRef;
  const selectedFocusRefs = focusAccepted
    ? {
        source: selectedRefsFromResourceObjectiveFocus({
          focus,
          legalRefUniverse,
          kinds: ["source_prompt_section", "bounded_file_window", "symbol", "resource_requirement"],
        }),
        repo: selectedRefsFromResourceObjectiveFocus({
          focus,
          legalRefUniverse,
          kinds: ["repo_area", "candidate_resource_ref", "other"],
        }),
        target: selectedRefsFromResourceObjectiveFocus({
          focus,
          legalRefUniverse,
          kinds: ["candidate_resource_ref"],
        }),
        memory: selectedRefsFromResourceObjectiveFocus({
          focus,
          legalRefUniverse,
          kinds: ["memory_pack"],
        }),
        validation: selectedRefsFromResourceObjectiveFocus({
          focus,
          legalRefUniverse,
          kinds: ["validation_ref"],
        }),
      }
    : { source: [], repo: [], target: [], memory: [], validation: [] };
  const semanticQuestions = focusAccepted
    ? uniqueStrings(focus.selectedSemanticQuestions, 8, 500)
    : [];
  const contextPurpose = boundedString(180)(
    input.contextPurpose ??
      (focusAccepted
        ? `${focus.resourceUseKind}_resource_requirement`
        : "consumer_scoped_resource_handoff"),
  );
  const downstreamExecutionIntent = input.downstreamExecutionIntent
    ? parseExecutionIntent(input.downstreamExecutionIntent)
    : null;
  const downstreamEvidenceMode = parseEvidenceMode(input.downstreamEvidenceMode ?? []);
  const missingReasonCodes = [
    ...(input.workIntentRef ? [] : ["resource_requirement_work_intent_ref_missing"]),
    ...(input.downstreamCapabilityId
      ? []
      : ["resource_requirement_downstream_capability_id_missing"]),
    ...(downstreamExecutionIntent
      ? []
      : ["resource_requirement_downstream_execution_intent_missing"]),
    ...(downstreamEvidenceMode.length > 0
      ? []
      : ["resource_requirement_downstream_evidence_mode_missing"]),
    ...(semanticQuestions.length > 0 ? [] : ["resource_requirement_semantic_questions_missing"]),
    ...(contextPurpose ? [] : ["resource_requirement_context_purpose_missing"]),
    ...(focusAccepted ? [] : ["resource_requirement_accepted_focus_missing"]),
    ...(focus && focus.status !== "accepted"
      ? ["resource_requirement_focus_not_accepted"]
      : []),
    ...(focus &&
    legalRefUniverse &&
    focus.legalRefUniverseRef !== legalRefUniverse.legalRefUniverseRef
      ? ["resource_requirement_focus_legal_ref_universe_mismatch"]
      : []),
  ];
  const requirementId = hashValue({
    requestRef: input.request.requestRef,
    workIntentRef: input.workIntentRef,
    consumerNodeId: input.request.consumerNodeId,
    sourceCommitmentIds: input.request.targetCommitmentIds,
    downstreamCapabilityId: input.downstreamCapabilityId,
    downstreamExecutionIntent,
    semanticQuestions,
    contextPurpose,
  }).slice(0, 24);
  const ref = resourceRequirementRef({
    runtimeJobId: input.request.runtimeJobId,
    graphId: input.request.graphId,
    consumerNodeId: input.request.consumerNodeId,
    requirementId,
  });
  const baseWithoutHash = {
    artifactKind: "resource_requirement_packet" as const,
    schemaVersion: RESOURCE_REQUIREMENT_PACKET_SCHEMA_VERSION,
    resourceRequirementId: requirementId,
    resourceRequirementRef: ref,
    resourceRequirementHash: "",
    structuralShard: null,
    runtimeJobId: boundedString(180)(input.request.runtimeJobId),
    workflowId: boundedString(180)(input.request.workflowId),
    graphId: boundedString(180)(input.request.graphId),
    consumerBranchId: boundedString(180)(input.consumerBranchId ?? input.request.consumerNodeId),
    consumerNodeId: boundedString(180)(input.request.consumerNodeId),
    workIntentRef: boundedString(420)(input.workIntentRef),
    sourceCommitmentIds: uniqueStrings(input.request.targetCommitmentIds, 40, 180),
    resourceObjectiveFocusRef: focusAccepted ? focus.focusRef : null,
    legalRefUniverseRef: focusAccepted ? legalRefUniverse.legalRefUniverseRef : null,
    contextPurpose,
    semanticQuestions,
    requiredResourceKinds: uniqueStrings(
      input.requiredResourceKinds ?? [input.request.requiredResourceKind, "repo_context"],
      24,
      160,
    ),
    candidateSourceRefs: uniqueStrings(
      selectedFocusRefs.source,
      24,
      320,
    ),
    candidateRepoAreaRefs: uniqueStrings(
      selectedFocusRefs.repo,
      24,
      320,
    ),
    candidateMemoryContextPackRefs: uniqueStrings(
      selectedFocusRefs.memory,
      12,
      320,
    ),
    knownTargetRefs: uniqueStrings(selectedFocusRefs.target, 16, 320),
    knownValidationNeedRefs: uniqueStrings(
      [...selectedFocusRefs.validation, ...(focusAccepted ? input.knownValidationNeedRefs ?? [] : [])],
      16,
      320,
    ),
    downstreamCapabilityId: boundedString(180)(input.downstreamCapabilityId),
    downstreamExecutionIntent: downstreamExecutionIntent ?? "source_grounding",
    downstreamEvidenceMode,
    contextAcceptanceContract: {
      requiredHandoffFields: [
        "relevantFiles",
        "existingPatterns",
        "recommendedEditPoints",
        "validationSuggestions",
        "handoffSummaryForImplementation",
        "limitations",
      ],
      sufficiencyCriteria: [
        "answers_declared_semantic_questions",
        "maps_context_to_declared_consumer",
        "uses_bounded_verified_refs",
        "states_blocking_limitations_without_guessing",
      ],
      acceptedStatuses: ["accepted", "accepted_with_limitations"],
      limitationWaiverRequiredForAcceptedWithLimitations: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    limitationPolicy: {
      acceptedWithLimitationsRequiresConsumerWaiver: true,
      blockingLimitationRefs: input.request.blockingLimitations.slice(0, 40),
      nonblockingLimitationRefs: input.request.nonblockingLimitations.slice(0, 40),
      allowedLimitationOutcomes: [
        "accepted",
        "accepted_with_limitations",
        "needs_review_nonblocking",
        "needs_repair_blocking",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    byteBudget: {
      maxRequirementBytes: 24_000,
      maxScoutInputBytes: policy.maxInputBytes ?? 32_000,
      rawPromptStored: false,
    },
    toolBudget: {
      maxToolCalls: Math.max(1, Math.min(input.maxToolCalls ?? 24, 80)),
      allowedToolIds: [
        "resource.requirement.get",
        "resource.scout.request_prompt_excerpt",
        "repo.search",
        "repo.find_files",
        "repo.open_file_window",
        "repo.open_symbol",
        "repo.get_related_tests",
        "resource.scout.add_finding",
        "resource.scout.mark_limitation",
        "resource.scout.submit_handoff",
      ],
      rawPromptStored: false,
    },
    providerTimeoutPolicy: {
      modelTaskClass: "local_semantic_extraction" as const,
      modelPolicyRef: policy.policyRef,
      timeoutMs: policy.timeoutMs,
      rawProviderLogStored: false,
    },
    repairPolicy: {
      nextLegalTransitions: uniqueStrings(
        input.nextLegalTransitions ?? ["dispatch_context_specialist_subturn", "needs_review"],
        12,
        180,
      ),
      blockerReasonCodes: uniqueStrings(
        [...(input.blockerReasonCodes ?? []), ...missingReasonCodes],
        60,
        180,
      ),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    sourceContextBrokerRequestRef: input.request.requestRef,
    reasonCodes: uniqueStrings(
      [
        "resource_requirement_packet_compiled",
        focusAccepted
          ? "resource_requirement_packet_compiled_from_resource_objective_focus"
          : "resource_requirement_packet_blocked_without_resource_objective_focus",
        "resource_requirement_runtime_did_not_copy_broad_broker_refs",
        "resource_requirement_packet_source_resource_broker_request",
        ...input.request.reasonCodes,
        ...missingReasonCodes,
      ],
      100,
      180,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  } satisfies Omit<ResourceRequirementPacket, "resourceRequirementHash"> & {
    resourceRequirementHash: string;
  };
  const packet: ResourceRequirementPacket = {
    ...baseWithoutHash,
    resourceRequirementHash: hashValue({ ...baseWithoutHash, resourceRequirementHash: null }),
  };
  const oversize =
    bytes(packet) > packet.byteBudget.maxRequirementBytes
      ? [
          "resource_requirement_packet_exceeds_byte_budget",
          "resource_requirement_scope_revision_required",
        ]
      : [];
  const finalPacket: ResourceRequirementPacket = {
    ...packet,
    reasonCodes: uniqueStrings([...packet.reasonCodes, ...oversize], 100, 180),
  };
  const status: ResourceRequirementCompileResult["status"] =
    missingReasonCodes.length > 0 || oversize.length > 0 ? "blocked" : "ready";
  return {
    status,
    packet: finalPacket,
    manifest: buildResourceRequirementPacketManifest(finalPacket),
    reasonCodes: finalPacket.reasonCodes,
  };
}

export function deriveResourceRequirementPacketStructuralShard(input: {
  parent: ResourceRequirementPacket;
  shardUnitKind: ResourceRequirementStructuralShardUnitKind;
  shardUnitRefs: string[];
  shardIndex: number;
  shardCount: number;
  sourceCommitmentIds?: string[];
  semanticQuestions?: string[];
  requiredResourceKinds?: string[];
  candidateSourceRefs?: string[];
  candidateRepoAreaRefs?: string[];
  candidateMemoryContextPackRefs?: string[];
  knownTargetRefs?: string[];
  knownValidationNeedRefs?: string[];
  contextPurpose?: string | null;
  reasonCodes?: string[];
}): ResourceRequirementPacket {
  const shardUnitRefs = uniqueStrings(input.shardUnitRefs, 80, 420);
  const shardId = hashValue({
    parentResourceRequirementRef: input.parent.resourceRequirementRef,
    parentResourceRequirementHash: input.parent.resourceRequirementHash,
    shardUnitKind: input.shardUnitKind,
    shardUnitRefs,
    shardIndex: input.shardIndex,
    shardCount: input.shardCount,
  }).slice(0, 24);
  const ref = resourceRequirementRef({
    runtimeJobId: input.parent.runtimeJobId,
    graphId: input.parent.graphId,
    consumerNodeId: input.parent.consumerNodeId,
    requirementId: shardId,
  });
  const structuralShard: ResourceRequirementStructuralShard = {
    parentResourceRequirementRef: input.parent.resourceRequirementRef,
    parentResourceRequirementHash: input.parent.resourceRequirementHash,
    shardId,
    shardIndex: Math.max(0, Math.floor(input.shardIndex)),
    shardCount: Math.max(1, Math.floor(input.shardCount)),
    shardUnitKind: input.shardUnitKind,
    shardUnitRefs,
    losslessStructuralSplit: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
  const base: ResourceRequirementPacket = {
    ...input.parent,
    resourceRequirementId: shardId,
    resourceRequirementRef: ref,
    resourceRequirementHash: "",
    structuralShard,
    sourceCommitmentIds: uniqueStrings(
      input.sourceCommitmentIds ?? input.parent.sourceCommitmentIds,
      40,
      180,
    ),
    contextPurpose: boundedString(180)(
      input.contextPurpose ?? input.parent.contextPurpose,
    ),
    semanticQuestions: uniqueStrings(
      input.semanticQuestions ?? input.parent.semanticQuestions,
      24,
      500,
    ),
    requiredResourceKinds: uniqueStrings(
      input.requiredResourceKinds ?? input.parent.requiredResourceKinds,
      24,
      160,
    ),
    candidateSourceRefs: uniqueStrings(
      input.candidateSourceRefs ?? input.parent.candidateSourceRefs,
      80,
      320,
    ),
    candidateRepoAreaRefs: uniqueStrings(
      input.candidateRepoAreaRefs ?? input.parent.candidateRepoAreaRefs,
      100,
      320,
    ),
    candidateMemoryContextPackRefs: uniqueStrings(
      input.candidateMemoryContextPackRefs ?? input.parent.candidateMemoryContextPackRefs,
      40,
      320,
    ),
    knownTargetRefs: uniqueStrings(input.knownTargetRefs ?? input.parent.knownTargetRefs, 80, 320),
    knownValidationNeedRefs: uniqueStrings(
      input.knownValidationNeedRefs ?? input.parent.knownValidationNeedRefs,
      40,
      320,
    ),
    repairPolicy: {
      ...input.parent.repairPolicy,
      nextLegalTransitions: uniqueStrings(
        [
          "dispatch_context_specialist_subturn",
          "merge_context_shard_handoffs",
          ...input.parent.repairPolicy.nextLegalTransitions,
        ],
        12,
        180,
      ),
      blockerReasonCodes: uniqueStrings(
        input.parent.repairPolicy.blockerReasonCodes,
        60,
        180,
      ),
    },
    reasonCodes: uniqueStrings(
      [
        ...input.parent.reasonCodes,
        "resource_requirement_packet_structural_shard_compiled",
        `resource_requirement_shard_unit_kind:${input.shardUnitKind}`,
        ...(input.reasonCodes ?? []),
      ],
      100,
      180,
    ),
  };
  return {
    ...base,
    resourceRequirementHash: hashValue({ ...base, resourceRequirementHash: null }),
  };
}
