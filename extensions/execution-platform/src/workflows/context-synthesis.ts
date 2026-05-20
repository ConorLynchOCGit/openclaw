import { createHash } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  ContextSnapshotRefSchema,
  mergeContextSnapshotRefs,
  validateContextSnapshotFreshness,
  type ContextSnapshotRef,
} from "./context-snapshot.ts";
import {
  assertBoundedStringArray,
  assertRuntimeWorkGraphNoRawStorage,
  boundedRuntimeWorkGraphString,
} from "./runtime-work-graph.ts";

export const CONTEXT_SYNTHESIS_ARTIFACT_TYPE = "execution_platform.context_synthesis" as const;

export const CONTEXT_SYNTHESIS_READINESS = [
  "ready",
  "needs_more_context",
  "needs_human_decision",
  "needs_review",
] as const;

const CONTEXT_SYNTHESIS_SOURCE_CONTEXT_BOUND = 160;
const CONTEXT_SYNTHESIS_METADATA_BYTE_BOUND = 16_000;
const CONTEXT_SYNTHESIS_METADATA_GROUP_BOUND = 4;
const CONTEXT_SYNTHESIS_METADATA_STRING_BOUND = 180;
const CONTEXT_SYNTHESIS_METADATA_ARRAY_BOUND = 2;
const CONTEXT_SYNTHESIS_GRAPH_COMPILE_BYTE_BOUND = 58_000;
const CONTEXT_SYNTHESIS_GRAPH_COMPILE_GROUP_BOUND = 24;
const SYNTHESIS_MANIFEST_DEFAULT_MAX_INPUT_BYTES = 96_000;
const SYNTHESIS_MANIFEST_MAX_COMMITMENTS = 80;
const SYNTHESIS_MANIFEST_MAX_REFS = 160;

export type ContextSynthesisReadiness = (typeof CONTEXT_SYNTHESIS_READINESS)[number];

export type ContextSynthesisImplementationGroup = {
  groupId: string;
  title: string;
  objective: string;
  commitmentIds: string[];
  inputHandoffRefs: string[];
  targetRefs: string[];
  fileOwnershipRefs: string[];
  recommendedCapabilityIds: string[];
  cheaperWorkerSuitability: string;
  codexEscalationRationale: string | null;
  downstreamConsumer: string;
  successCriteria: string[];
  expectedOutput: string;
  evidenceClaimExpectations: string[];
  validationNeeds: string[];
  reviewNeeds: string[];
  stopIfMissing: string[];
  riskRefs: string[];
  integrationRequirements: string[];
  dependsOnGroupIds: string[];
  parallelizableWithGroupIds: string[];
  workerFitRationale: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ContextSynthesisArtifact = {
  artifactKind: "context_synthesis";
  schemaVersion: "execution-platform.context-synthesis.v1";
  synthesisId: string;
  synthesisRef: string;
  sourceRuntimeJobId: string | null;
  sourceGraphId: string;
  workflowId: string;
  sourceCommitmentIds: string[];
  sourcePacketRefs: string[];
  sourceContextHandoffRefs: string[];
  sourcePromptRef: string | null;
  sourcePromptHash: string | null;
  sourceContextSnapshotRefs: string[];
  semanticCodeIntelligenceRefs: string[];
  scoutStateSummaries: Array<{
    contextHandoffRef: string;
    commitmentIds: string[];
    status: "accepted" | "accepted_with_limitations" | "needs_review" | "rejected" | "unknown";
    limitationSummary: string | null;
    verifiedFileRefs: string[];
    semanticCodeIntelligenceRefs: string[];
  }>;
  commitmentCoverage: Array<{
    commitmentId: string;
    covered: boolean;
    groupIds: string[];
    contextHandoffRefs: string[];
    limitationSummary: string | null;
  }>;
  recommendedImplementationGroups: ContextSynthesisImplementationGroup[];
  dependencyMap: Array<{
    fromGroupId: string;
    toGroupId: string;
    dependencyKind: string;
    rationale: string;
  }>;
  fileOwnershipProposals: Array<{
    groupId: string;
    targetRefs: string[];
    ownershipRationale: string;
  }>;
  contextHandoffRefMap: Array<{
    contextHandoffRef: string;
    consumedByGroupIds: string[];
    commitmentIds: string[];
  }>;
  parallelismPlan: string;
  stopIfMissing: string[];
  knownRisks: string[];
  likelyValidationLanes: string[];
  reviewLanes: string[];
  integrationRequirements: string[];
  workerFitSummary: string;
  validationStrategy: string[];
  escalationTriggers: string[];
  implementationReadiness: ContextSynthesisReadiness;
  limitations: string[];
  evidenceClaimExpectations: string[];
  schedulerHandoff: {
    readyForGraphCompile: boolean;
    graphCompileInputSummary: string;
    implementationGroupCount: number;
    dependencyCount: number;
    parallelGroupCount: number;
    blockerCount: number;
    workerFitSummary: string;
    validationLaneCount: number;
    reviewLaneCount: number;
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
  };
  requiredContextSnapshotRefs: ContextSnapshotRef[];
  providedContextSnapshotRefs: ContextSnapshotRef[];
  staleContextSnapshotRefs: string[];
  missingContextSnapshotRefs: string[];
  rejectedContextSnapshotRefs: string[];
  contextFreshnessStatus: "fresh" | "stale" | "missing" | "rejected" | "unknown";
  contextRefreshAction:
    | "none"
    | "request_excerpt"
    | "rerun_context_scout"
    | "rerun_context_synthesis"
    | "refresh_replay_checkpoint"
    | "block_implementation"
    | "ask_human";
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  createdAt: string;
};

export type ContextSynthesisInputManifestCommitment = {
  commitmentId: string;
  packetRef: string | null;
  packetSynthesisBrief: string;
  contextHandoffRefs: string[];
  contextScoutSynthesisBriefs: string[];
  verifiedRepoRefs: string[];
  unresolvedQuestions: string[];
  stopIfMissing: string[];
  expectedImplementationOutput: string[];
  expectedValidationOutput: string[];
  downstreamConsumers: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ContextSynthesisInputManifest = {
  artifactKind: "context_synthesis_input_manifest";
  schemaVersion: "execution-platform.context-synthesis-input-manifest.v1";
  manifestId: string;
  missionId: string;
  sourcePromptRef: string | null;
  sourcePromptHash: string | null;
  sourcePromptSectionRefs: string[];
  workflowEvidenceProfileRef: string | null;
  globalConstraints: string[];
  commitments: ContextSynthesisInputManifestCommitment[];
  budget: {
    maxInputBytes: number;
    maxCommitments: number;
    maxRefs: number;
    actualBytes: number;
    budgetStatus: "within_budget" | "split_required" | "model_selection_required";
    splitPolicy: "none" | "split_by_commitment_or_group" | "model_select_refs_or_stop";
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
  };
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
};

export type ContextSynthesisInputManifestArtifactSummary = {
  artifactKind: "context_synthesis_input_manifest_summary";
  schemaVersion: "execution-platform.context-synthesis-input-manifest-summary.v1";
  manifestId: string;
  manifestHash: string;
  missionId: string;
  sourcePromptRef: string | null;
  sourcePromptHash: string | null;
  sourcePromptSectionRefs: string[];
  workflowEvidenceProfileRef: string | null;
  globalConstraints: string[];
  budget: ContextSynthesisInputManifest["budget"];
  commitmentCount: number;
  commitments: Array<{
    commitmentId: string;
    packetRef: string | null;
    packetSynthesisBriefPreview: string;
    contextHandoffRefs: string[];
    contextScoutSynthesisBriefPreviews: string[];
    verifiedRepoRefs: string[];
    unresolvedQuestions: string[];
    stopIfMissing: string[];
    expectedImplementationOutput: string[];
    expectedValidationOutput: string[];
    downstreamConsumers: string[];
  }>;
  truncatedCommitmentCount: number;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
};

export type ContextSynthesisGraphCompileHandoff = {
  artifactKind: "context_synthesis_graph_compile_handoff";
  schemaVersion: "execution-platform.context-synthesis-graph-compile-handoff.v1";
  synthesisRef: string;
  synthesisHash: string;
  workflowId: string;
  implementationReadiness: ContextSynthesisReadiness;
  implementationGroupCount: number;
  implementationGroupsIncludedCount: number;
  dependencyCount: number;
  dependencyMapIncludedCount: number;
  compileHandoffComplete: boolean;
  compileHandoffDetailReducedForMetadataBound: boolean;
  compileHandoffByteLength: number;
  implementationGroups: Array<{
    groupId: string;
    title: string | null;
    objective: string | null;
    commitmentIds: string[];
    inputHandoffRefs: string[];
    targetRefs: string[];
    fileOwnershipRefs: string[];
    recommendedCapabilityIds: string[];
    cheaperWorkerSuitability: string | null;
    codexEscalationRationale: string | null;
    downstreamConsumer: string | null;
    successCriteria: string[];
    expectedOutput: string | null;
    evidenceClaimExpectations: string[];
    validationNeeds: string[];
    reviewNeeds: string[];
    stopIfMissing: string[];
    riskRefs: string[];
    integrationRequirements: string[];
    dependsOnGroupIds: string[];
    parallelizableWithGroupIds: string[];
    workerFitRationale: string | null;
  }>;
  dependencyMap: Array<{
    fromGroupId: string;
    toGroupId: string;
    dependencyKind: string;
    rationale: string | null;
  }>;
  parallelismPlan: string | null;
  stopIfMissing: string[];
  knownRisks: string[];
  likelyValidationLanes: string[];
  reviewLanes: string[];
  integrationRequirements: string[];
  workerFitSummary: string | null;
  validationStrategy: string[];
  escalationTriggers: string[];
  evidenceClaimExpectations: string[];
  schedulerHandoff: ContextSynthesisArtifact["schedulerHandoff"];
  contextFreshnessStatus: ContextSynthesisArtifact["contextFreshnessStatus"];
  contextRefreshAction: ContextSynthesisArtifact["contextRefreshAction"];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim()
    ? boundedRuntimeWorkGraphString(value)
    : fallback;
}

function stringArray(value: unknown, max = 32): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .map((item) => boundedRuntimeWorkGraphString(item)),
        ),
      ].slice(0, max)
    : [];
}

function firstStringValue(record: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return stringValue(value);
    }
  }
  return fallback;
}

function joinedBrief(record: Record<string, unknown>, keys: string[], max = 1_200): string {
  const parts: string[] = [];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      parts.push(value.trim());
    } else if (Array.isArray(value)) {
      parts.push(
        ...value.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0,
        ),
      );
    }
  }
  return boundedRuntimeWorkGraphString([...new Set(parts)].slice(0, 8).join(" "), max);
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function snapshotArray(value: unknown): ContextSnapshotRef[] {
  return Array.isArray(value)
    ? value
        .map((item) => ContextSnapshotRefSchema.safeParse(item))
        .filter((result): result is { success: true; data: ContextSnapshotRef } => result.success)
        .map((result) => result.data)
        .slice(0, 120)
    : [];
}

function groupFromValue(value: unknown, index: number): ContextSynthesisImplementationGroup {
  const record = asRecord(value);
  const objective = stringValue(record.objective ?? record.exactObjective ?? record.taskObjective);
  const successCriteria = stringArray(
    record.successCriteria ?? record.acceptanceCriteria ?? record.validationCriteria,
  );
  const validationNeeds = stringArray(record.validationNeeds ?? record.validationRequirements);
  const reviewNeeds = stringArray(record.reviewNeeds ?? record.reviewRequirements);
  const evidenceClaimExpectations = stringArray(
    record.evidenceClaimExpectations ?? record.expectedEvidenceClaims,
  );
  const expectedOutput = stringValue(
    record.expectedOutput ??
      record.outputExpectation ??
      record.expectedImplementationOutput ??
      record.workerOutput,
    objective
      ? `Worker output proving this group objective: ${objective}`
      : successCriteria.length > 0
        ? `Worker output satisfying: ${successCriteria.slice(0, 3).join("; ")}`
        : `Worker output for implementation group ${index + 1}`,
  );
  return {
    groupId: stringValue(record.groupId ?? record.workUnitId ?? record.id, `group-${index + 1}`),
    title: stringValue(record.title ?? record.name, `Implementation group ${index + 1}`),
    objective,
    commitmentIds: stringArray(
      record.commitmentIds ?? record.targetCommitmentIds ?? record.commitmentIdsAdvanced,
    ),
    inputHandoffRefs: stringArray(
      record.inputHandoffRefs ?? record.contextHandoffRefs ?? record.handoffRefs,
    ),
    targetRefs: stringArray(record.targetRefs ?? record.fileRefs ?? record.sourceRefs),
    fileOwnershipRefs: stringArray(
      record.fileOwnershipRefs ?? record.fileOwnershipProposals ?? record.ownedFileRefs,
    ),
    recommendedCapabilityIds: stringArray(
      record.recommendedCapabilityIds ??
        record.capabilityIds ??
        record.recommendedCapabilities ??
        record.selectedCapabilityIds,
    ),
    cheaperWorkerSuitability: stringValue(
      record.cheaperWorkerSuitability ??
        record.nonCodexSuitability ??
        record.scopedWorkerSuitability,
    ),
    codexEscalationRationale:
      stringValue(record.codexEscalationRationale ?? record.premiumWorkerRationale) || null,
    downstreamConsumer: stringValue(record.downstreamConsumer ?? record.consumer, "scheduler"),
    successCriteria,
    expectedOutput,
    evidenceClaimExpectations,
    validationNeeds,
    reviewNeeds,
    stopIfMissing: stringArray(record.stopIfMissing ?? record.blockers),
    riskRefs: stringArray(record.riskRefs ?? record.risks),
    integrationRequirements: stringArray(record.integrationRequirements ?? record.integrationNeeds),
    dependsOnGroupIds: stringArray(
      record.dependsOnGroupIds ?? record.dependencyGroupIds ?? record.upstreamGroupIds,
    ),
    parallelizableWithGroupIds: stringArray(
      record.parallelizableWithGroupIds ?? record.parallelGroupIds,
    ),
    workerFitRationale: stringValue(
      record.workerFitRationale ?? record.rationale ?? record.utilityRationale,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function packetSummaryText(
  packet: Record<string, unknown> | undefined,
  keys: string[],
  max = 3,
): string[] {
  if (!packet) {
    return [];
  }
  const values: string[] = [];
  for (const key of keys) {
    const value = packet[key];
    if (typeof value === "string" && value.trim()) {
      values.push(value.trim());
    } else if (Array.isArray(value)) {
      values.push(
        ...value.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0,
        ),
      );
    }
  }
  return [...new Set(values)].slice(0, max);
}

function enrichGroupWithPacketDefaults(
  group: ContextSynthesisImplementationGroup,
  packetByCommitmentId: Map<string, Record<string, unknown>>,
): ContextSynthesisImplementationGroup {
  const packets = group.commitmentIds
    .map((commitmentId) => packetByCommitmentId.get(commitmentId))
    .filter((packet): packet is Record<string, unknown> => Boolean(packet));
  const derivedValidationNeeds = packets.flatMap((packet) =>
    packetSummaryText(
      packet,
      ["validationObjective", "validationNeeds", "validationCommandRefs"],
      2,
    ),
  );
  const derivedEvidenceExpectations = packets.flatMap((packet) =>
    packetSummaryText(
      packet,
      ["expectedEvidenceDescription", "evidenceClaimExpectations", "expectedEvidenceClaims"],
      2,
    ),
  );
  const derivedReviewNeeds = packets.flatMap((packet) =>
    packetSummaryText(packet, ["reviewObjective", "reviewNeeds", "acceptanceCriteria"], 2),
  );
  const commitmentSummary = group.commitmentIds.slice(0, 6).join(", ");
  return {
    ...group,
    evidenceClaimExpectations:
      group.evidenceClaimExpectations.length > 0
        ? group.evidenceClaimExpectations
        : derivedEvidenceExpectations.length > 0
          ? [...new Set(derivedEvidenceExpectations)].slice(0, 8)
          : commitmentSummary
            ? [`Evidence claims must map outputs to commitment(s): ${commitmentSummary}.`]
            : [],
    validationNeeds:
      group.validationNeeds.length > 0
        ? group.validationNeeds
        : derivedValidationNeeds.length > 0
          ? [...new Set(derivedValidationNeeds)].slice(0, 8)
          : commitmentSummary
            ? [`Run focused validation for commitment(s): ${commitmentSummary}.`]
            : [],
    reviewNeeds:
      group.reviewNeeds.length > 0
        ? group.reviewNeeds
        : derivedReviewNeeds.length > 0
          ? [...new Set(derivedReviewNeeds)].slice(0, 8)
          : commitmentSummary
            ? [
                `Review implementation evidence and limitations for commitment(s): ${commitmentSummary}.`,
              ]
            : [],
    workerFitRationale:
      group.workerFitRationale ||
      (commitmentSummary
        ? `Worker fit is derived from accepted commitment packets for: ${commitmentSummary}.`
        : group.cheaperWorkerSuitability),
  };
}

function scoutStateStatus(
  value: unknown,
): ContextSynthesisArtifact["scoutStateSummaries"][number]["status"] {
  const status = stringValue(value);
  return status === "accepted" ||
    status === "accepted_with_limitations" ||
    status === "needs_review" ||
    status === "rejected" ||
    status === "unknown"
    ? status
    : "unknown";
}

function scoutStateFromValue(
  value: unknown,
): ContextSynthesisArtifact["scoutStateSummaries"][number] {
  const record = asRecord(value);
  return {
    contextHandoffRef: stringValue(record.contextHandoffRef ?? record.handoffRef),
    commitmentIds: stringArray(record.commitmentIds),
    status: scoutStateStatus(record.status ?? record.qualityStatus),
    limitationSummary: stringValue(record.limitationSummary ?? record.limitationsSummary) || null,
    verifiedFileRefs: stringArray(record.verifiedFileRefs ?? record.fileRefs),
    semanticCodeIntelligenceRefs: stringArray(
      record.semanticCodeIntelligenceRefs ??
        record.codeIntelligenceResultRefs ??
        record.codeIntelligenceRefs,
    ),
  };
}

function fileOwnershipProposalFromValue(
  value: unknown,
): ContextSynthesisArtifact["fileOwnershipProposals"][number] {
  const record = asRecord(value);
  return {
    groupId: stringValue(record.groupId),
    targetRefs: stringArray(record.targetRefs ?? record.fileRefs),
    ownershipRationale: stringValue(record.ownershipRationale ?? record.rationale),
  };
}

export function contextSynthesisRef(input: { graphId: string; synthesisId: string }): string {
  return `runtime-work-graph://${input.graphId}/context-synthesis/${input.synthesisId}`;
}

export function contextSynthesisHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function contextSynthesisGroupGuidanceArray(
  value: unknown,
  max = 48,
): Record<string, unknown>[] {
  const record = asRecord(value);
  const groups = Array.isArray(record.groupPlanningGuidance)
    ? record.groupPlanningGuidance
    : Array.isArray(record.recommendedImplementationGroups)
      ? record.recommendedImplementationGroups
      : Array.isArray(record.implementationGroups)
        ? record.implementationGroups
        : Array.isArray(record.workGroups)
          ? record.workGroups
          : Array.isArray(record.groups)
            ? record.groups
            : [];
  return groups
    .map(asRecord)
    .filter((group) => Object.keys(group).length > 0)
    .slice(0, max);
}

export function buildContextSynthesisInputManifest(input: {
  missionId: string;
  sourcePromptRef?: string | null;
  sourcePromptHash?: string | null;
  sourcePromptSectionRefs?: string[];
  workflowEvidenceProfileRef?: string | null;
  globalConstraints?: string[];
  commitmentPackets: unknown[];
  contextScoutSummaries?: unknown[];
  sourceContextHandoffRefs?: string[];
  maxInputBytes?: number;
  maxCommitments?: number;
  maxRefs?: number;
}): ContextSynthesisInputManifest {
  const maxInputBytes = Math.max(
    8_000,
    Math.trunc(input.maxInputBytes ?? SYNTHESIS_MANIFEST_DEFAULT_MAX_INPUT_BYTES),
  );
  const maxCommitments = Math.max(
    1,
    Math.min(SYNTHESIS_MANIFEST_MAX_COMMITMENTS, Math.trunc(input.maxCommitments ?? 60)),
  );
  const maxRefs = Math.max(
    1,
    Math.min(SYNTHESIS_MANIFEST_MAX_REFS, Math.trunc(input.maxRefs ?? 120)),
  );
  const scouts = (input.contextScoutSummaries ?? []).map(asRecord);
  const handoffRefs = stringArray(input.sourceContextHandoffRefs, maxRefs);
  const commitments = input.commitmentPackets.slice(0, maxCommitments).map((packetValue) => {
    const packet = asRecord(packetValue);
    const commitmentId = firstStringValue(packet, ["commitmentId", "id"]);
    const matchingScouts = scouts.filter((scout) =>
      stringArray(scout.commitmentIds, 24).includes(commitmentId),
    );
    const packetRef = firstStringValue(packet, ["packetRef", "ref"]) || null;
    return {
      commitmentId,
      packetRef,
      packetSynthesisBrief: joinedBrief(
        packet,
        [
          "commitmentMeaning",
          "workerObjective",
          "implementationObjective",
          "validationObjective",
          "reviewObjective",
          "acceptanceCriteria",
          "requiredEvidenceClaimDescriptions",
        ],
        1_600,
      ),
      contextHandoffRefs: [
        ...new Set([
          ...stringArray(packet.contextHandoffRefs, 24),
          ...stringArray(packet.inputHandoffRefs, 24),
          ...matchingScouts.flatMap((scout) => stringArray(scout.outputArtifactRefs, 24)),
          ...handoffRefs.filter((ref) => (commitmentId ? ref.includes(commitmentId) : false)),
        ]),
      ].slice(0, 40),
      contextScoutSynthesisBriefs: matchingScouts
        .map((scout) =>
          joinedBrief(
            scout,
            [
              "contextScoutHandoffSummaryForSynthesis",
              "contextScoutSufficiencySummary",
              "objective",
              "currentObjective",
              "eli5Progress",
              "reasonCodes",
            ],
            900,
          ),
        )
        .filter(Boolean)
        .slice(0, 4),
      verifiedRepoRefs: [
        ...new Set([
          ...stringArray(packet.likelyRepoAreas, 16),
          ...matchingScouts.flatMap((scout) => stringArray(scout.verifiedFileRefs, 24)),
          ...matchingScouts.flatMap((scout) => stringArray(scout.targetRefs, 24)),
        ]),
      ].slice(0, 32),
      unresolvedQuestions: [
        ...new Set([
          ...stringArray(packet.requiredContextQuestions, 12),
          ...matchingScouts.flatMap((scout) =>
            stringArray(scout.contextScoutSynthesisBlockers, 12),
          ),
        ]),
      ].slice(0, 16),
      stopIfMissing: stringArray(packet.stopIfMissing, 12),
      expectedImplementationOutput: stringArray(packet.expectedImplementationOutput, 12),
      expectedValidationOutput: stringArray(packet.expectedValidationOutput, 12),
      downstreamConsumers: [
        firstStringValue(packet, ["downstreamConsumer"], "scheduler_node_executor"),
      ].filter(Boolean),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    } satisfies ContextSynthesisInputManifestCommitment;
  });
  let manifest: ContextSynthesisInputManifest = {
    artifactKind: "context_synthesis_input_manifest",
    schemaVersion: "execution-platform.context-synthesis-input-manifest.v1",
    manifestId: `context-synthesis-input-${contextSynthesisHash({
      missionId: input.missionId,
      commitments: commitments.map((commitment) => commitment.commitmentId),
      handoffs: handoffRefs,
    }).slice(0, 16)}`,
    missionId: stringValue(input.missionId, "unknown-mission"),
    sourcePromptRef: input.sourcePromptRef ? stringValue(input.sourcePromptRef) : null,
    sourcePromptHash: input.sourcePromptHash ? stringValue(input.sourcePromptHash) : null,
    sourcePromptSectionRefs: stringArray(input.sourcePromptSectionRefs, 80),
    workflowEvidenceProfileRef: input.workflowEvidenceProfileRef
      ? stringValue(input.workflowEvidenceProfileRef)
      : null,
    globalConstraints: stringArray(input.globalConstraints, 40),
    commitments,
    budget: {
      maxInputBytes,
      maxCommitments,
      maxRefs,
      actualBytes: 0,
      budgetStatus: "within_budget",
      splitPolicy: "none",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    reasonCodes: [
      "context_synthesis_input_manifest_model_authored_briefs_only",
      "context_synthesis_input_manifest_runtime_refs_bounds_only",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
  };
  const actualBytes = Buffer.byteLength(JSON.stringify(manifest), "utf8");
  const budgetStatus =
    actualBytes <= maxInputBytes
      ? "within_budget"
      : commitments.length > 1
        ? "split_required"
        : "model_selection_required";
  manifest = {
    ...manifest,
    budget: {
      ...manifest.budget,
      actualBytes,
      budgetStatus,
      splitPolicy:
        budgetStatus === "within_budget"
          ? "none"
          : budgetStatus === "split_required"
            ? "split_by_commitment_or_group"
            : "model_select_refs_or_stop",
    },
    reasonCodes:
      budgetStatus === "within_budget"
        ? manifest.reasonCodes
        : [...manifest.reasonCodes, `context_synthesis_input_manifest_${budgetStatus}`],
  };
  assertRuntimeWorkGraphNoRawStorage(manifest, "context synthesis input manifest");
  return manifest;
}

export function summarizeContextSynthesisInputManifestForArtifact(
  manifest: ContextSynthesisInputManifest,
  options: { maxCommitments?: number; maxRefs?: number; maxBriefChars?: number } = {},
): ContextSynthesisInputManifestArtifactSummary {
  const maxCommitments = Math.max(1, Math.min(80, Math.trunc(options.maxCommitments ?? 40)));
  const maxRefs = Math.max(1, Math.min(80, Math.trunc(options.maxRefs ?? 4)));
  const maxBriefChars = Math.max(80, Math.min(900, Math.trunc(options.maxBriefChars ?? 120)));
  const commitments = manifest.commitments.slice(0, maxCommitments).map((commitment) => ({
    commitmentId: commitment.commitmentId,
    packetRef: commitment.packetRef,
    packetSynthesisBriefPreview: boundedRuntimeWorkGraphString(
      commitment.packetSynthesisBrief,
      maxBriefChars,
    ),
    contextHandoffRefs: commitment.contextHandoffRefs.slice(0, maxRefs),
    contextScoutSynthesisBriefPreviews: commitment.contextScoutSynthesisBriefs
      .map((brief) => boundedRuntimeWorkGraphString(brief, maxBriefChars))
      .slice(0, 4),
    verifiedRepoRefs: commitment.verifiedRepoRefs.slice(0, maxRefs),
    unresolvedQuestions: commitment.unresolvedQuestions.slice(0, Math.min(12, maxRefs)),
    stopIfMissing: commitment.stopIfMissing.slice(0, Math.min(8, maxRefs)),
    expectedImplementationOutput: commitment.expectedImplementationOutput.slice(
      0,
      Math.min(8, maxRefs),
    ),
    expectedValidationOutput: commitment.expectedValidationOutput.slice(0, Math.min(8, maxRefs)),
    downstreamConsumers: commitment.downstreamConsumers.slice(0, Math.min(8, maxRefs)),
  }));
  const summary: ContextSynthesisInputManifestArtifactSummary = {
    artifactKind: "context_synthesis_input_manifest_summary",
    schemaVersion: "execution-platform.context-synthesis-input-manifest-summary.v1",
    manifestId: manifest.manifestId,
    manifestHash: `sha256:${contextSynthesisHash(manifest)}`,
    missionId: manifest.missionId,
    sourcePromptRef: manifest.sourcePromptRef,
    sourcePromptHash: manifest.sourcePromptHash,
    sourcePromptSectionRefs: manifest.sourcePromptSectionRefs.slice(0, maxRefs),
    workflowEvidenceProfileRef: manifest.workflowEvidenceProfileRef,
    globalConstraints: manifest.globalConstraints.slice(0, Math.min(20, maxRefs)),
    budget: manifest.budget,
    commitmentCount: manifest.commitments.length,
    commitments,
    truncatedCommitmentCount: Math.max(0, manifest.commitments.length - commitments.length),
    reasonCodes: [
      ...manifest.reasonCodes,
      "context_synthesis_input_manifest_full_value_not_stored_in_artifact_metadata",
      "context_synthesis_input_manifest_summary_hashes_full_manifest",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
  };
  assertRuntimeWorkGraphNoRawStorage(summary, "context synthesis input manifest summary");
  return summary;
}

function boundedNullableString(value: string | null | undefined, maxChars: number): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? boundedRuntimeWorkGraphString(trimmed, maxChars) : null;
}

function boundedCompileStrings(values: string[], maxItems: number, maxChars: number): string[] {
  return values.slice(0, maxItems).map((value) => boundedRuntimeWorkGraphString(value, maxChars));
}

function buildContextSynthesisGraphCompileHandoff(
  artifact: ContextSynthesisArtifact,
  options: {
    maxGroups: number;
    stringMax: number;
    arrayMax: number;
    dependencyMax: number;
    byteBound: number;
    detailReduced: boolean;
  },
): ContextSynthesisGraphCompileHandoff {
  const groups = artifact.recommendedImplementationGroups
    .slice(0, options.maxGroups)
    .map((group) => ({
      groupId: boundedRuntimeWorkGraphString(group.groupId, 160),
      title: boundedNullableString(group.title, Math.min(options.stringMax, 160)),
      objective: boundedNullableString(group.objective, options.stringMax),
      commitmentIds: boundedCompileStrings(group.commitmentIds, 40, 180),
      inputHandoffRefs: boundedCompileStrings(group.inputHandoffRefs, options.arrayMax, 240),
      targetRefs: boundedCompileStrings(group.targetRefs, options.arrayMax, 240),
      fileOwnershipRefs: boundedCompileStrings(group.fileOwnershipRefs, options.arrayMax, 240),
      recommendedCapabilityIds: boundedCompileStrings(group.recommendedCapabilityIds, 10, 140),
      cheaperWorkerSuitability: boundedNullableString(
        group.cheaperWorkerSuitability,
        options.stringMax,
      ),
      codexEscalationRationale: boundedNullableString(
        group.codexEscalationRationale,
        options.stringMax,
      ),
      downstreamConsumer: boundedNullableString(group.downstreamConsumer, 160),
      successCriteria: boundedCompileStrings(
        group.successCriteria,
        options.arrayMax,
        options.stringMax,
      ),
      expectedOutput: boundedNullableString(group.expectedOutput, options.stringMax),
      evidenceClaimExpectations: boundedCompileStrings(
        group.evidenceClaimExpectations,
        options.arrayMax,
        options.stringMax,
      ),
      validationNeeds: boundedCompileStrings(
        group.validationNeeds,
        options.arrayMax,
        options.stringMax,
      ),
      reviewNeeds: boundedCompileStrings(group.reviewNeeds, options.arrayMax, options.stringMax),
      stopIfMissing: boundedCompileStrings(
        group.stopIfMissing,
        options.arrayMax,
        options.stringMax,
      ),
      riskRefs: boundedCompileStrings(group.riskRefs, options.arrayMax, options.stringMax),
      integrationRequirements: boundedCompileStrings(
        group.integrationRequirements,
        options.arrayMax,
        options.stringMax,
      ),
      dependsOnGroupIds: boundedCompileStrings(group.dependsOnGroupIds, 24, 140),
      parallelizableWithGroupIds: boundedCompileStrings(group.parallelizableWithGroupIds, 24, 140),
      workerFitRationale: boundedNullableString(group.workerFitRationale, options.stringMax),
    }));
  const dependencyMap = artifact.dependencyMap
    .slice(0, options.dependencyMax)
    .map((dependency) => ({
      fromGroupId: boundedRuntimeWorkGraphString(dependency.fromGroupId, 160),
      toGroupId: boundedRuntimeWorkGraphString(dependency.toGroupId, 160),
      dependencyKind: boundedRuntimeWorkGraphString(dependency.dependencyKind, 120),
      rationale: boundedNullableString(dependency.rationale, options.stringMax),
    }));
  const complete =
    groups.length === artifact.recommendedImplementationGroups.length &&
    dependencyMap.length === artifact.dependencyMap.length;
  const handoff: ContextSynthesisGraphCompileHandoff = {
    artifactKind: "context_synthesis_graph_compile_handoff",
    schemaVersion: "execution-platform.context-synthesis-graph-compile-handoff.v1",
    synthesisRef: artifact.synthesisRef,
    synthesisHash: `sha256:${contextSynthesisHash(artifact)}`,
    workflowId: artifact.workflowId,
    implementationReadiness: artifact.implementationReadiness,
    implementationGroupCount: artifact.recommendedImplementationGroups.length,
    implementationGroupsIncludedCount: groups.length,
    dependencyCount: artifact.dependencyMap.length,
    dependencyMapIncludedCount: dependencyMap.length,
    compileHandoffComplete: complete,
    compileHandoffDetailReducedForMetadataBound: options.detailReduced,
    compileHandoffByteLength: 0,
    implementationGroups: groups,
    dependencyMap,
    parallelismPlan: boundedNullableString(artifact.parallelismPlan, options.stringMax),
    stopIfMissing: boundedCompileStrings(
      artifact.stopIfMissing,
      options.arrayMax,
      options.stringMax,
    ),
    knownRisks: boundedCompileStrings(artifact.knownRisks, options.arrayMax, options.stringMax),
    likelyValidationLanes: boundedCompileStrings(
      artifact.likelyValidationLanes,
      options.arrayMax,
      options.stringMax,
    ),
    reviewLanes: boundedCompileStrings(artifact.reviewLanes, options.arrayMax, options.stringMax),
    integrationRequirements: boundedCompileStrings(
      artifact.integrationRequirements,
      options.arrayMax,
      options.stringMax,
    ),
    workerFitSummary: boundedNullableString(artifact.workerFitSummary, options.stringMax),
    validationStrategy: boundedCompileStrings(
      artifact.validationStrategy,
      options.arrayMax,
      options.stringMax,
    ),
    escalationTriggers: boundedCompileStrings(
      artifact.escalationTriggers,
      options.arrayMax,
      options.stringMax,
    ),
    evidenceClaimExpectations: boundedCompileStrings(
      artifact.evidenceClaimExpectations,
      options.arrayMax,
      options.stringMax,
    ),
    schedulerHandoff: {
      ...artifact.schedulerHandoff,
      graphCompileInputSummary: boundedRuntimeWorkGraphString(
        artifact.schedulerHandoff.graphCompileInputSummary,
        options.stringMax,
      ),
      workerFitSummary: boundedRuntimeWorkGraphString(
        artifact.schedulerHandoff.workerFitSummary,
        options.stringMax,
      ),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    contextFreshnessStatus: artifact.contextFreshnessStatus,
    contextRefreshAction: artifact.contextRefreshAction,
    reasonCodes: [
      "context_synthesis_graph_compile_handoff_runtime_owned",
      "context_synthesis_graph_compile_handoff_preserves_group_count",
      ...(complete ? [] : ["context_synthesis_graph_compile_handoff_incomplete"]),
      ...(options.detailReduced
        ? ["context_synthesis_graph_compile_handoff_detail_reduced_for_metadata_bound"]
        : []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
  };
  return {
    ...handoff,
    compileHandoffByteLength: Buffer.byteLength(JSON.stringify(handoff), "utf8"),
  };
}

export function summarizeContextSynthesisForGraphCompile(
  artifact: ContextSynthesisArtifact,
): ContextSynthesisGraphCompileHandoff {
  const variants = [
    { stringMax: 240, arrayMax: 10, dependencyMax: 60, detailReduced: false },
    { stringMax: 180, arrayMax: 8, dependencyMax: 48, detailReduced: true },
    { stringMax: 140, arrayMax: 6, dependencyMax: 36, detailReduced: true },
    { stringMax: 100, arrayMax: 4, dependencyMax: 24, detailReduced: true },
  ];
  for (const variant of variants) {
    const handoff = buildContextSynthesisGraphCompileHandoff(artifact, {
      ...variant,
      maxGroups: CONTEXT_SYNTHESIS_GRAPH_COMPILE_GROUP_BOUND,
      byteBound: CONTEXT_SYNTHESIS_GRAPH_COMPILE_BYTE_BOUND,
    });
    if (handoff.compileHandoffByteLength <= CONTEXT_SYNTHESIS_GRAPH_COMPILE_BYTE_BOUND) {
      assertRuntimeWorkGraphNoRawStorage(handoff, "context synthesis graph compile handoff");
      return handoff;
    }
  }
  const minimal = buildContextSynthesisGraphCompileHandoff(artifact, {
    maxGroups: CONTEXT_SYNTHESIS_GRAPH_COMPILE_GROUP_BOUND,
    stringMax: 80,
    arrayMax: 3,
    dependencyMax: 16,
    byteBound: CONTEXT_SYNTHESIS_GRAPH_COMPILE_BYTE_BOUND,
    detailReduced: true,
  });
  const handoff =
    minimal.compileHandoffByteLength <= CONTEXT_SYNTHESIS_GRAPH_COMPILE_BYTE_BOUND
      ? minimal
      : {
          ...minimal,
          compileHandoffComplete: false,
          reasonCodes: [
            ...minimal.reasonCodes,
            "context_synthesis_graph_compile_handoff_exceeds_metadata_bound",
          ],
        };
  assertRuntimeWorkGraphNoRawStorage(handoff, "context synthesis graph compile handoff");
  return handoff;
}

export function normalizeContextSynthesisArtifact(input: {
  value: unknown;
  sourceRuntimeJobId?: string | null;
  sourceGraphId: string;
  workflowId: string;
  sourceCommitmentIds: string[];
  sourcePacketRefs: string[];
  sourceContextHandoffRefs: string[];
  sourcePacketSummaries?: unknown[];
  requiredContextSnapshotRefs?: ContextSnapshotRef[];
  providedContextSnapshotRefs?: ContextSnapshotRef[];
  createdAt?: string;
}): ContextSynthesisArtifact {
  assertRuntimeWorkGraphNoRawStorage(input.value, "context synthesis");
  const record = asRecord(input.value);
  const synthesisId =
    stringValue(record.synthesisId ?? record.id) ||
    `context-synthesis-${contextSynthesisHash({
      graphId: input.sourceGraphId,
      commitments: input.sourceCommitmentIds,
      handoffs: input.sourceContextHandoffRefs,
    }).slice(0, 16)}`;
  const packetByCommitmentId = new Map(
    (input.sourcePacketSummaries ?? [])
      .map(asRecord)
      .map((packet) => [stringValue(packet.commitmentId), packet] as const)
      .filter(([commitmentId]) => Boolean(commitmentId)),
  );
  const groups = contextSynthesisGroupGuidanceArray(record)
    .map(groupFromValue)
    .map((group) => enrichGroupWithPacketDefaults(group, packetByCommitmentId));
  const coverage = (Array.isArray(record.commitmentCoverage) ? record.commitmentCoverage : []).map(
    (item) => {
      const coverageRecord = asRecord(item);
      return {
        commitmentId: stringValue(coverageRecord.commitmentId),
        covered: booleanValue(coverageRecord.covered),
        groupIds: stringArray(coverageRecord.groupIds),
        contextHandoffRefs: stringArray(coverageRecord.contextHandoffRefs),
        limitationSummary: stringValue(coverageRecord.limitationSummary) || null,
      };
    },
  );
  const dependencyMap = (Array.isArray(record.dependencyMap) ? record.dependencyMap : []).map(
    (item) => {
      const dependency = asRecord(item);
      return {
        fromGroupId: stringValue(dependency.fromGroupId ?? dependency.from),
        toGroupId: stringValue(dependency.toGroupId ?? dependency.to),
        dependencyKind: stringValue(dependency.dependencyKind ?? dependency.kind, "handoff"),
        rationale: stringValue(dependency.rationale ?? dependency.reason),
      };
    },
  );
  const contextHandoffRefMap = (
    Array.isArray(record.contextHandoffRefMap) ? record.contextHandoffRefMap : []
  ).map((item) => {
    const handoff = asRecord(item);
    return {
      contextHandoffRef: stringValue(handoff.contextHandoffRef ?? handoff.handoffRef),
      consumedByGroupIds: stringArray(handoff.consumedByGroupIds ?? handoff.groupIds),
      commitmentIds: stringArray(handoff.commitmentIds),
    };
  });
  const scoutStateSummaries = (
    Array.isArray(record.scoutStateSummaries)
      ? record.scoutStateSummaries
      : Array.isArray(record.contextScoutStates)
        ? record.contextScoutStates
        : []
  ).map(scoutStateFromValue);
  const fileOwnershipProposals = (
    Array.isArray(record.fileOwnershipProposals)
      ? record.fileOwnershipProposals
      : Array.isArray(record.fileOwnership)
        ? record.fileOwnership
        : []
  ).map(fileOwnershipProposalFromValue);
  const readiness = stringValue(record.implementationReadiness ?? record.readiness);
  const implementationReadiness = CONTEXT_SYNTHESIS_READINESS.includes(
    readiness as ContextSynthesisReadiness,
  )
    ? (readiness as ContextSynthesisReadiness)
    : "needs_review";
  const requiredContextSnapshotRefs = mergeContextSnapshotRefs(
    input.requiredContextSnapshotRefs ?? [],
    snapshotArray(record.requiredContextSnapshotRefs),
  );
  const providedContextSnapshotRefs = mergeContextSnapshotRefs(
    input.providedContextSnapshotRefs ?? [],
    snapshotArray(record.providedContextSnapshotRefs),
  );
  const freshness = validateContextSnapshotFreshness({
    requiredRefs: requiredContextSnapshotRefs,
    providedRefs: providedContextSnapshotRefs,
  });
  const sourceContextSnapshotRefs =
    stringArray(record.sourceContextSnapshotRefs).length > 0
      ? stringArray(record.sourceContextSnapshotRefs)
      : mergeContextSnapshotRefs(requiredContextSnapshotRefs, providedContextSnapshotRefs)
          .map((snapshot) => snapshot.snapshotRef)
          .slice(0, CONTEXT_SYNTHESIS_SOURCE_CONTEXT_BOUND);
  const semanticCodeIntelligenceRefs = stringArray(
    record.semanticCodeIntelligenceRefs ??
      record.codeIntelligenceResultRefs ??
      record.codeIntelligenceRefs,
  );
  const likelyValidationLanes =
    stringArray(record.likelyValidationLanes ?? record.validationLanes).length > 0
      ? stringArray(record.likelyValidationLanes ?? record.validationLanes)
      : [...new Set(groups.flatMap((group) => group.validationNeeds))].slice(0, 24);
  const reviewLanes =
    stringArray(record.reviewLanes).length > 0
      ? stringArray(record.reviewLanes)
      : [...new Set(groups.flatMap((group) => group.reviewNeeds))].slice(0, 24);
  const integrationRequirements = stringArray(
    record.integrationRequirements ?? record.integrationNeeds,
  );
  const workerFitSummary =
    stringValue(record.workerFitSummary) ||
    [...new Set(groups.map((group) => group.workerFitRationale).filter(Boolean))]
      .slice(0, 4)
      .join(" ");
  const readyForGraphCompile =
    implementationReadiness === "ready" &&
    groups.length > 0 &&
    (dependencyMap.length > 0 ||
      stringValue(record.parallelismPlan ?? record.parallelIndependentNodesJustification).length >
        0);
  const artifact = {
    artifactKind: "context_synthesis",
    schemaVersion: "execution-platform.context-synthesis.v1",
    synthesisId,
    synthesisRef: contextSynthesisRef({ graphId: input.sourceGraphId, synthesisId }),
    sourceRuntimeJobId: input.sourceRuntimeJobId ?? null,
    sourceGraphId: input.sourceGraphId,
    workflowId: input.workflowId,
    sourceCommitmentIds: [...new Set(input.sourceCommitmentIds)].slice(0, 60),
    sourcePacketRefs: [...new Set(input.sourcePacketRefs)].slice(0, 80),
    sourceContextHandoffRefs: [...new Set(input.sourceContextHandoffRefs)].slice(
      0,
      CONTEXT_SYNTHESIS_SOURCE_CONTEXT_BOUND,
    ),
    sourcePromptRef: stringValue(record.sourcePromptRef) || null,
    sourcePromptHash: stringValue(record.sourcePromptHash) || null,
    sourceContextSnapshotRefs,
    semanticCodeIntelligenceRefs,
    scoutStateSummaries,
    commitmentCoverage: coverage,
    recommendedImplementationGroups: groups,
    dependencyMap,
    fileOwnershipProposals,
    contextHandoffRefMap,
    parallelismPlan: stringValue(
      record.parallelismPlan ?? record.parallelIndependentNodesJustification,
    ),
    stopIfMissing: stringArray(record.stopIfMissing),
    knownRisks: stringArray(record.knownRisks ?? record.risks),
    likelyValidationLanes,
    reviewLanes,
    integrationRequirements,
    workerFitSummary,
    validationStrategy:
      stringArray(record.validationStrategy ?? record.validationPlan).length > 0
        ? stringArray(record.validationStrategy ?? record.validationPlan)
        : likelyValidationLanes,
    escalationTriggers: stringArray(record.escalationTriggers ?? record.escalationRules),
    implementationReadiness,
    limitations: stringArray(record.limitations),
    evidenceClaimExpectations:
      stringArray(record.evidenceClaimExpectations ?? record.expectedEvidenceClaims).length > 0
        ? stringArray(record.evidenceClaimExpectations ?? record.expectedEvidenceClaims)
        : [...new Set(groups.flatMap((group) => group.evidenceClaimExpectations))].slice(0, 40),
    schedulerHandoff: {
      readyForGraphCompile,
      graphCompileInputSummary:
        stringValue(record.graphCompileInputSummary) ||
        `Context synthesis has ${groups.length} implementation group(s), ${dependencyMap.length} dependency edge(s), and ${likelyValidationLanes.length} validation lane(s).`,
      implementationGroupCount: groups.length,
      dependencyCount: dependencyMap.length,
      parallelGroupCount: groups.filter((group) => group.parallelizableWithGroupIds.length > 0)
        .length,
      blockerCount:
        stringArray(record.stopIfMissing).length +
        freshness.missingRefs.length +
        freshness.staleRefs.length +
        freshness.rejectedRefs.length,
      workerFitSummary,
      validationLaneCount:
        likelyValidationLanes.length ||
        stringArray(record.validationStrategy ?? record.validationPlan).length,
      reviewLaneCount: reviewLanes.length,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    requiredContextSnapshotRefs,
    providedContextSnapshotRefs,
    staleContextSnapshotRefs: freshness.staleRefs,
    missingContextSnapshotRefs: freshness.missingRefs,
    rejectedContextSnapshotRefs: freshness.rejectedRefs,
    contextFreshnessStatus: freshness.freshnessStatus,
    contextRefreshAction: freshness.requiredRefreshAction,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    createdAt: input.createdAt ?? new Date().toISOString(),
  } satisfies ContextSynthesisArtifact;
  assertRuntimeWorkGraphNoRawStorage(artifact, "context synthesis artifact");
  assertBoundedStringArray(artifact.sourceCommitmentIds, "context synthesis commitment ids");
  assertBoundedStringArray(
    artifact.sourceContextHandoffRefs,
    "context synthesis handoff refs",
    CONTEXT_SYNTHESIS_SOURCE_CONTEXT_BOUND,
  );
  return artifact;
}

export function validateContextSynthesisArtifact(artifact: ContextSynthesisArtifact): {
  valid: boolean;
  reasonCodes: string[];
} {
  const reasonCodes: string[] = [];
  if (artifact.implementationReadiness === "ready") {
    if (
      artifact.sourcePacketRefs.length > 1 &&
      artifact.sourceContextHandoffRefs.length < artifact.sourcePacketRefs.length
    ) {
      reasonCodes.push("context_synthesis_packet_handoff_coverage_missing");
    }
    if (artifact.recommendedImplementationGroups.length === 0) {
      reasonCodes.push("context_synthesis_ready_groups_missing");
    }
    if (!artifact.schedulerHandoff.readyForGraphCompile) {
      reasonCodes.push("context_synthesis_scheduler_handoff_not_ready");
    }
    if (artifact.dependencyMap.length === 0 && !artifact.parallelismPlan) {
      reasonCodes.push("context_synthesis_dependency_or_parallelism_missing");
    }
    if (artifact.validationStrategy.length === 0 && artifact.likelyValidationLanes.length === 0) {
      reasonCodes.push("context_synthesis_validation_strategy_missing");
    }
    if (artifact.reviewLanes.length === 0) {
      reasonCodes.push("context_synthesis_review_lanes_missing");
    }
    if (!artifact.workerFitSummary) {
      reasonCodes.push("context_synthesis_worker_fit_summary_missing");
    }
    if (artifact.evidenceClaimExpectations.length === 0) {
      reasonCodes.push("context_synthesis_evidence_expectations_missing");
    }
    if (
      artifact.requiredContextSnapshotRefs.length > 0 &&
      artifact.contextFreshnessStatus !== "fresh"
    ) {
      reasonCodes.push(`context_synthesis_context_${artifact.contextFreshnessStatus}`);
    }
    const coveredCommitments = new Set(
      artifact.commitmentCoverage
        .filter((coverage) => coverage.covered)
        .map((coverage) => coverage.commitmentId),
    );
    for (const commitmentId of artifact.sourceCommitmentIds) {
      if (!coveredCommitments.has(commitmentId)) {
        reasonCodes.push(`context_synthesis_commitment_not_covered:${commitmentId}`);
      }
    }
    for (const coverage of artifact.commitmentCoverage) {
      if (coverage.covered && coverage.contextHandoffRefs.length === 0) {
        reasonCodes.push(
          `context_synthesis_commitment_handoff_refs_missing:${coverage.commitmentId}`,
        );
      }
    }
    for (const group of artifact.recommendedImplementationGroups) {
      if (group.commitmentIds.length === 0) {
        reasonCodes.push(`context_synthesis_group_commitments_missing:${group.groupId}`);
      }
      if (group.inputHandoffRefs.length === 0) {
        reasonCodes.push(`context_synthesis_group_handoffs_missing:${group.groupId}`);
      }
      if (!group.objective) {
        reasonCodes.push(`context_synthesis_group_objective_missing:${group.groupId}`);
      }
      if (group.successCriteria.length === 0) {
        reasonCodes.push(`context_synthesis_group_success_criteria_missing:${group.groupId}`);
      }
      if (!group.expectedOutput) {
        reasonCodes.push(`context_synthesis_group_expected_output_missing:${group.groupId}`);
      }
      if (group.validationNeeds.length === 0) {
        reasonCodes.push(`context_synthesis_group_validation_needs_missing:${group.groupId}`);
      }
      if (group.reviewNeeds.length === 0) {
        reasonCodes.push(`context_synthesis_group_review_needs_missing:${group.groupId}`);
      }
      if (!group.workerFitRationale) {
        reasonCodes.push(`context_synthesis_group_worker_fit_missing:${group.groupId}`);
      }
    }
  }
  return { valid: reasonCodes.length === 0, reasonCodes };
}

export function summarizeContextSynthesisArtifact(artifact: ContextSynthesisArtifact): JsonValue {
  const boundedString = (
    value: string | null | undefined,
    max = CONTEXT_SYNTHESIS_METADATA_STRING_BOUND,
  ): string | null => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) {
      return null;
    }
    return boundedRuntimeWorkGraphString(trimmed, max);
  };
  const boundedStrings = (
    values: string[],
    maxItems = CONTEXT_SYNTHESIS_METADATA_ARRAY_BOUND,
    maxChars = 180,
  ): string[] =>
    values.slice(0, maxItems).map((value) => boundedRuntimeWorkGraphString(value, maxChars));
  const implementationGroups = artifact.recommendedImplementationGroups
    .slice(0, CONTEXT_SYNTHESIS_METADATA_GROUP_BOUND)
    .map((group) => ({
      groupId: group.groupId,
      title: boundedString(group.title, 180),
      objective: boundedString(group.objective),
      commitmentIds: boundedStrings(group.commitmentIds, 12, 160),
      inputHandoffRefs: boundedStrings(group.inputHandoffRefs, 8, 220),
      targetRefs: boundedStrings(group.targetRefs, 8, 220),
      fileOwnershipRefs: boundedStrings(group.fileOwnershipRefs, 8, 220),
      recommendedCapabilityIds: boundedStrings(group.recommendedCapabilityIds, 6, 120),
      cheaperWorkerSuitability: boundedString(group.cheaperWorkerSuitability, 240),
      codexEscalationRationale: boundedString(group.codexEscalationRationale, 240),
      downstreamConsumer: boundedString(group.downstreamConsumer, 160),
      successCriteria: boundedStrings(group.successCriteria, 6),
      expectedOutput: boundedString(group.expectedOutput, 240),
      evidenceClaimExpectations: boundedStrings(group.evidenceClaimExpectations, 6),
      validationNeeds: boundedStrings(group.validationNeeds, 6),
      reviewNeeds: boundedStrings(group.reviewNeeds, 6),
      stopIfMissing: boundedStrings(group.stopIfMissing, 6),
      riskRefs: boundedStrings(group.riskRefs, 6),
      integrationRequirements: boundedStrings(group.integrationRequirements, 6),
      dependsOnGroupIds: boundedStrings(group.dependsOnGroupIds, 12, 120),
      parallelizableWithGroupIds: boundedStrings(group.parallelizableWithGroupIds, 12, 120),
      workerFitRationale: boundedString(group.workerFitRationale, 240),
    }));
  const summary = {
    artifactKind: artifact.artifactKind,
    synthesisRef: artifact.synthesisRef,
    synthesisHash: `sha256:${contextSynthesisHash(artifact)}`,
    workflowId: artifact.workflowId,
    implementationReadiness: artifact.implementationReadiness,
    sourceCommitmentCount: artifact.sourceCommitmentIds.length,
    sourceContextHandoffCount: artifact.sourceContextHandoffRefs.length,
    sourcePacketRefs: boundedStrings(artifact.sourcePacketRefs, 8, 180),
    sourceContextSnapshotRefs: boundedStrings(artifact.sourceContextSnapshotRefs, 8, 180),
    semanticCodeIntelligenceRefs: boundedStrings(artifact.semanticCodeIntelligenceRefs, 8, 180),
    scoutStateSummaries: artifact.scoutStateSummaries.slice(0, 8).map((summary) => ({
      contextHandoffRef: boundedRuntimeWorkGraphString(summary.contextHandoffRef, 220),
      commitmentIds: boundedStrings(summary.commitmentIds, 4, 140),
      status: summary.status,
      limitationSummary: boundedString(summary.limitationSummary, 180),
      verifiedFileRefs: boundedStrings(summary.verifiedFileRefs, 4, 180),
      semanticCodeIntelligenceRefs: boundedStrings(summary.semanticCodeIntelligenceRefs, 3, 180),
    })),
    scoutStateSummariesTruncated: artifact.scoutStateSummaries.length > 8,
    implementationGroupCount: artifact.recommendedImplementationGroups.length,
    implementationGroupsTruncated:
      artifact.recommendedImplementationGroups.length > implementationGroups.length,
    implementationGroups,
    dependencyCount: artifact.dependencyMap.length,
    dependencyMap: artifact.dependencyMap.slice(0, 8).map((dependency) => ({
      fromGroupId: dependency.fromGroupId,
      toGroupId: dependency.toGroupId,
      dependencyKind: dependency.dependencyKind,
      rationale: boundedString(dependency.rationale, 160),
    })),
    dependencyMapTruncated: artifact.dependencyMap.length > 8,
    fileOwnershipProposals: artifact.fileOwnershipProposals.slice(0, 4).map((proposal) => ({
      groupId: proposal.groupId,
      targetRefs: boundedStrings(proposal.targetRefs, 4, 180),
      ownershipRationale: boundedString(proposal.ownershipRationale, 160),
    })),
    fileOwnershipProposalsTruncated: artifact.fileOwnershipProposals.length > 4,
    contextHandoffRefMap: artifact.contextHandoffRefMap.slice(0, 8).map((entry) => ({
      contextHandoffRef: boundedRuntimeWorkGraphString(entry.contextHandoffRef, 180),
      consumedByGroupIds: boundedStrings(entry.consumedByGroupIds, 4, 100),
      commitmentIds: boundedStrings(entry.commitmentIds, 4, 140),
    })),
    contextHandoffRefMapTruncated: artifact.contextHandoffRefMap.length > 8,
    parallelismPlan: boundedString(artifact.parallelismPlan),
    stopIfMissing: boundedStrings(artifact.stopIfMissing, 6),
    knownRisks: boundedStrings(artifact.knownRisks, 6),
    likelyValidationLanes: boundedStrings(artifact.likelyValidationLanes, 6),
    reviewLanes: boundedStrings(artifact.reviewLanes, 6),
    integrationRequirements: boundedStrings(artifact.integrationRequirements, 6),
    workerFitSummary: boundedString(artifact.workerFitSummary),
    validationStrategy: boundedStrings(artifact.validationStrategy, 6),
    escalationTriggers: boundedStrings(artifact.escalationTriggers, 6),
    limitations: boundedStrings(artifact.limitations, 6),
    evidenceClaimExpectations: boundedStrings(artifact.evidenceClaimExpectations, 8),
    schedulerHandoff: artifact.schedulerHandoff,
    contextFreshnessStatus: artifact.contextFreshnessStatus,
    contextRefreshAction: artifact.contextRefreshAction,
    contextSnapshotRefs: artifact.providedContextSnapshotRefs
      .map((ref) => ref.snapshotRef)
      .slice(0, 8),
    staleContextSnapshotRefs: artifact.staleContextSnapshotRefs.slice(0, 8),
    missingContextSnapshotRefs: artifact.missingContextSnapshotRefs.slice(0, 8),
    rejectedContextSnapshotRefs: artifact.rejectedContextSnapshotRefs.slice(0, 8),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
  if (Buffer.byteLength(JSON.stringify(summary), "utf8") <= CONTEXT_SYNTHESIS_METADATA_BYTE_BOUND) {
    return summary;
  }
  return {
    artifactKind: artifact.artifactKind,
    synthesisRef: artifact.synthesisRef,
    synthesisHash: `sha256:${contextSynthesisHash(artifact)}`,
    workflowId: artifact.workflowId,
    implementationReadiness: artifact.implementationReadiness,
    summaryTruncatedForMetadataBound: true,
    sourceCommitmentCount: artifact.sourceCommitmentIds.length,
    sourceContextHandoffCount: artifact.sourceContextHandoffRefs.length,
    implementationGroupCount: artifact.recommendedImplementationGroups.length,
    implementationGroupsTruncated:
      artifact.recommendedImplementationGroups.length > implementationGroups.slice(0, 2).length,
    dependencyCount: artifact.dependencyMap.length,
    scoutStateSummaryCount: artifact.scoutStateSummaries.length,
    fileOwnershipProposalCount: artifact.fileOwnershipProposals.length,
    contextHandoffRefMapCount: artifact.contextHandoffRefMap.length,
    implementationGroups: implementationGroups.slice(0, 2).map((group) => ({
      groupId: group.groupId,
      title: group.title,
      objective: boundedString(group.objective, 180),
      commitmentIds: Array.isArray(group.commitmentIds) ? group.commitmentIds.slice(0, 2) : [],
      targetRefs: Array.isArray(group.targetRefs) ? group.targetRefs.slice(0, 2) : [],
      recommendedCapabilityIds: Array.isArray(group.recommendedCapabilityIds)
        ? group.recommendedCapabilityIds.slice(0, 2)
        : [],
      downstreamConsumer: group.downstreamConsumer,
    })),
    dependencyMap: artifact.dependencyMap.slice(0, 8).map((dependency) => ({
      fromGroupId: dependency.fromGroupId,
      toGroupId: dependency.toGroupId,
      dependencyKind: dependency.dependencyKind,
    })),
    schedulerHandoff: {
      readyForGraphCompile: artifact.schedulerHandoff.readyForGraphCompile,
      implementationGroupCount: artifact.schedulerHandoff.implementationGroupCount,
      dependencyCount: artifact.schedulerHandoff.dependencyCount,
      parallelGroupCount: artifact.schedulerHandoff.parallelGroupCount,
      blockerCount: artifact.schedulerHandoff.blockerCount,
      validationLaneCount: artifact.schedulerHandoff.validationLaneCount,
      reviewLaneCount: artifact.schedulerHandoff.reviewLaneCount,
      graphCompileInputSummary: boundedString(
        artifact.schedulerHandoff.graphCompileInputSummary,
        220,
      ),
      workerFitSummary: boundedString(artifact.schedulerHandoff.workerFitSummary, 220),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    contextFreshnessStatus: artifact.contextFreshnessStatus,
    contextRefreshAction: artifact.contextRefreshAction,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}
