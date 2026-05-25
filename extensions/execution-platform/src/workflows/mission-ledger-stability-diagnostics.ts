import { createHash } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { MissionCommitment, MissionContractLedger } from "./mission-contract-ledger.ts";
import type { CommitmentWorkPacket } from "./mission-work-packets.ts";

export const MISSION_LEDGER_STABILITY_DIAGNOSTIC_SCHEMA_VERSION =
  "execution-platform.mission-ledger-stability-diagnostic.v1" as const;

export const MISSION_LEDGER_STABILITY_DIAGNOSTIC_RUN_ARTIFACT_TYPE =
  "execution_platform.mission_ledger_stability_diagnostic_run" as const;

export const MISSION_LEDGER_STABILITY_DIAGNOSTIC_PAIR_ARTIFACT_TYPE =
  "execution_platform.mission_ledger_stability_diagnostic_pair" as const;

export const MISSION_LEDGER_STABILITY_VERDICT_ARTIFACT_TYPE =
  "execution_platform.mission_ledger_stability_verdict" as const;

export type MissionLedgerStabilityVerdictStatus =
  | "stable"
  | "stable_with_provider_variance"
  | "needs_review_structural_drift"
  | "failed_runtime_boundary";

export type MissionLedgerStabilityDiagnosticRun = {
  artifactKind: "mission_ledger_stability_diagnostic_run";
  schemaVersion: typeof MISSION_LEDGER_STABILITY_DIAGNOSTIC_SCHEMA_VERSION;
  runLabel: "A" | "B" | string;
  runId: string;
  runtimeJobId: string | null;
  workItemId: string | null;
  prompt: {
    promptPath: string;
    promptHash: string;
    promptLength: number;
    promptModifiedAt: string | null;
    rawPromptStored: false;
  };
  startedAt: string;
  completedAt: string | null;
  phaseWallClockMs: Record<string, number>;
  modelUsage: Array<{
    phase: string;
    modelRef: string | null;
    providerPath: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    estimated: boolean;
  }>;
  missionLedger: MissionLedgerStructuralSummary | null;
  commitmentPackets: CommitmentPacketStabilitySummary | null;
  providerVariance: ProviderVarianceDiagnostic;
  runtimeBoundary: RuntimeBoundaryVarianceDiagnostic;
  artifactRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
};

export type MissionLedgerStabilityDiagnosticPair = {
  artifactKind: "mission_ledger_stability_diagnostic_pair";
  schemaVersion: typeof MISSION_LEDGER_STABILITY_DIAGNOSTIC_SCHEMA_VERSION;
  pairId: string;
  promptHash: string;
  promptLength: number;
  runA: MissionLedgerStabilityDiagnosticRun;
  runB: MissionLedgerStabilityDiagnosticRun;
  missionLedgerComparison: MissionLedgerCommitmentComparison;
  packetComparison: CommitmentPacketPairComparison;
  providerVariance: ProviderVarianceDiagnostic;
  runtimeBoundary: RuntimeBoundaryVarianceDiagnostic;
  verdict: MissionLedgerStabilityVerdict;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
};

export type MissionLedgerStructuralSummary = {
  artifactKind: "mission_ledger_structural_summary";
  missionId: string;
  ledgerStatus: string;
  missionGate: string;
  blockingCommitmentCount: number;
  nonBlockingCommitmentCount: number;
  safetyConstraintCount: number;
  explicitNonGoalCount: number;
  commitmentFingerprints: string[];
  commitments: Array<{
    commitmentId: string;
    blocking: boolean;
    status: string;
    textFingerprint: string;
    evidenceFingerprint: string;
    textLength: number;
    expectedEvidenceLength: number;
    remainingWorkCount: number;
    hasWhyItMatters: boolean;
    hasExpectedEvidenceDescription: boolean;
  }>;
  missingStructuralFields: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type MissionLedgerCommitmentComparison = {
  artifactKind: "mission_ledger_commitment_comparison";
  status:
    | "exact_structure_match"
    | "bounded_structural_drift"
    | "material_structural_drift"
    | "runtime_boundary_missing";
  missionGateChanged: boolean;
  blockingCommitmentCountDelta: number | null;
  nonBlockingCommitmentCountDelta: number | null;
  matchingCommitmentFingerprintCount: number;
  runAOnlyCommitmentFingerprints: string[];
  runBOnlyCommitmentFingerprints: string[];
  missingCommitmentIds: string[];
  structuralDriftScore: number;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type CommitmentPacketStabilitySummary = {
  artifactKind: "commitment_packet_stability_summary";
  packetCount: number;
  completedCount: number;
  acceptedCount: number;
  acceptedWithLimitationsCount: number;
  needsReviewCount: number;
  missingRequiredFieldCount: number;
  packetFingerprints: string[];
  packets: CommitmentPacketLaneDiagnostics[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type CommitmentPacketLaneDiagnostics = {
  artifactKind: "commitment_packet_lane_diagnostics";
  commitmentId: string;
  packetRef: string | null;
  authoringSource: string | null;
  qualityStatus: string | null;
  status: string | null;
  modelRef: string | null;
  providerPath: string | null;
  profileRef: string | null;
  authoringPhase: string | null;
  inputByteLength: number | null;
  outputContentLength: number | null;
  outputHash: string | null;
  latencyMs: number | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  choiceCount: number | null;
  contentLengthByChoice: number[];
  parsedContentLength: number | null;
  noContentReasonClass: string | null;
  retryEligibility: string | null;
  inputBundleRef: string | null;
  inputBundleHash: string | null;
  concurrencySlot: string | null;
  timedOut: boolean;
  retryCount: number;
  rescueUsed: boolean;
  rescueReasonCodes: string[];
  noContent: boolean;
  providerError: boolean;
  missingRequiredFields: string[];
  substance: {
    workerObjectiveLength: number;
    contextScoutObjectiveLength: number;
    implementationObjectiveLength: number;
    validationObjectiveLength: number;
    reviewObjectiveLength: number;
    likelyRepoAreaCount: number;
    requiredContextQuestionCount: number;
    acceptanceCriteriaCount: number;
    stopIfMissingCount: number;
    evidenceClaimDescriptionCount: number;
  };
  packetFingerprint: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type CommitmentPacketPairComparison = {
  artifactKind: "commitment_packet_pair_comparison";
  status:
    | "exact_structure_match"
    | "bounded_structural_drift"
    | "material_structural_drift"
    | "runtime_boundary_missing";
  packetCountDelta: number | null;
  matchingPacketFingerprintCount: number;
  runAOnlyPacketFingerprints: string[];
  runBOnlyPacketFingerprints: string[];
  missingCommitmentPacketIds: string[];
  rescueDependence: boolean;
  noContentRetryCount: number;
  structuralDriftScore: number;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type ProviderVarianceDiagnostic = {
  artifactKind: "provider_variance_diagnostic";
  noContentCount: number;
  retryCount: number;
  rescueCount: number;
  longLatencyCount: number;
  providerErrorCount: number;
  repeatedSamePacketFailureCount: number;
  inputSizeCorrelated: boolean;
  timeoutCorrelated: boolean;
  schemaNormalizationCorrelated: boolean;
  noContentReasonCounts: Record<string, number>;
  failedPacketReplayRequired: boolean;
  classifications: string[];
  affectedCommitmentIds: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type RuntimeBoundaryVarianceDiagnostic = {
  artifactKind: "runtime_boundary_variance_diagnostic";
  promptResolverStable: boolean;
  promptHashMismatch: boolean;
  missionLedgerMissing: boolean;
  packetManifestMissing: boolean;
  artifactContractFailure: boolean;
  lifecycleClassificationFailure: boolean;
  schemaNormalizationMismatch: boolean;
  runtimePreflightBlocked: boolean;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type MissionLedgerStabilityVerdict = {
  artifactKind: "mission_ledger_stability_verdict";
  schemaVersion: typeof MISSION_LEDGER_STABILITY_DIAGNOSTIC_SCHEMA_VERSION;
  status: MissionLedgerStabilityVerdictStatus;
  safeToRunProductSpecProof: boolean;
  summary: string;
  blockerSummary: string | null;
  qwenNoContentCount: number;
  gptRescueCount: number;
  structuralDriftScore: number;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/_:-]+/gu, " ")
    .replace(/\s+/gu, " ");
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashText(value: string): string {
  return createHash("sha256").update(normalizeText(value)).digest("hex");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringArray(value: unknown, maxItems = 40): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .slice(0, maxItems)
    : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function commitmentFingerprint(commitment: MissionCommitment): string {
  return hashValue({
    text: normalizeText(commitment.commitmentText),
    evidence: normalizeText(commitment.expectedEvidenceDescription),
    blocking: commitment.blocking,
  }).slice(0, 20);
}

export function summarizeMissionLedgerForStability(
  ledger: MissionContractLedger | null | undefined,
): MissionLedgerStructuralSummary | null {
  if (!ledger) {
    return null;
  }
  const commitments = [...ledger.blockingCommitments, ...ledger.nonBlockingCommitments].map(
    (commitment) => {
      const textFingerprint = hashText(commitment.commitmentText).slice(0, 20);
      const evidenceFingerprint = hashText(commitment.expectedEvidenceDescription).slice(0, 20);
      return {
        commitmentId: commitment.commitmentId,
        blocking: commitment.blocking,
        status: commitment.status,
        textFingerprint,
        evidenceFingerprint,
        textLength: commitment.commitmentText.length,
        expectedEvidenceLength: commitment.expectedEvidenceDescription.length,
        remainingWorkCount: commitment.remainingWork.length,
        hasWhyItMatters: commitment.whyItMatters.trim().length > 0,
        hasExpectedEvidenceDescription: commitment.expectedEvidenceDescription.trim().length > 0,
      };
    },
  );
  const missingStructuralFields = commitments.flatMap((commitment) => [
    ...(commitment.textLength === 0 ? [`commitmentText:${commitment.commitmentId}`] : []),
    ...(!commitment.hasWhyItMatters ? [`whyItMatters:${commitment.commitmentId}`] : []),
    ...(!commitment.hasExpectedEvidenceDescription
      ? [`expectedEvidenceDescription:${commitment.commitmentId}`]
      : []),
  ]);
  return {
    artifactKind: "mission_ledger_structural_summary",
    missionId: ledger.missionId,
    ledgerStatus: ledger.ledgerStatus,
    missionGate: ledger.missionGate,
    blockingCommitmentCount: ledger.blockingCommitments.length,
    nonBlockingCommitmentCount: ledger.nonBlockingCommitments.length,
    safetyConstraintCount: ledger.safetyConstraints.length,
    explicitNonGoalCount: ledger.explicitNonGoals.length,
    commitmentFingerprints: [...ledger.blockingCommitments, ...ledger.nonBlockingCommitments]
      .map(commitmentFingerprint)
      .toSorted((a, b) => a.localeCompare(b)),
    commitments,
    missingStructuralFields,
    reasonCodes: [
      ...(ledger.missionGate === "clear_to_execute" ? [] : [`mission_gate:${ledger.missionGate}`]),
      ...(missingStructuralFields.length > 0 ? ["mission_ledger_structural_fields_missing"] : []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

const requiredPacketFields = [
  "workerObjective",
  "contextScoutObjective",
  "implementationObjective",
  "validationObjective",
  "reviewObjective",
  "likelyRepoAreas",
  "requiredContextQuestions",
  "acceptanceCriteria",
  "stopIfMissing",
  "requiredEvidenceClaimDescriptions",
] as const;

function missingPacketFields(packet: Partial<CommitmentWorkPacket>): string[] {
  return requiredPacketFields.filter((field) => {
    const value = packet[field];
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    return typeof value !== "string" || value.trim().length < 20;
  });
}

function packetFingerprint(packet: Partial<CommitmentWorkPacket>): string {
  return hashValue({
    commitmentId: packet.commitmentId ?? "",
    workerObjective: normalizeText(packet.workerObjective),
    contextScoutObjective: normalizeText(packet.contextScoutObjective),
    implementationObjective: normalizeText(packet.implementationObjective),
    validationObjective: normalizeText(packet.validationObjective),
    reviewObjective: normalizeText(packet.reviewObjective),
    likelyRepoAreas: packet.likelyRepoAreas ?? [],
    requiredContextQuestions: packet.requiredContextQuestions ?? [],
    acceptanceCriteria: packet.acceptanceCriteria ?? [],
  }).slice(0, 20);
}

function packetLikeFingerprint(packet: Record<string, unknown>): string {
  return hashValue({
    commitmentId: stringValue(packet.commitmentId) ?? "",
    workerObjective: normalizeText(stringValue(packet.workerObjective)),
    contextScoutObjective: normalizeText(stringValue(packet.contextScoutObjective)),
    implementationObjective: normalizeText(stringValue(packet.implementationObjective)),
    validationObjective: normalizeText(stringValue(packet.validationObjective)),
    likelyRepoAreas: stringArray(packet.likelyRepoAreas, 12),
    requiredContextQuestions: stringArray(packet.requiredContextQuestions, 12),
  }).slice(0, 20);
}

export function summarizeMissionLedgerCheckpointEvidenceForStability(
  evidence: unknown,
): MissionLedgerStructuralSummary | null {
  const source = record(evidence);
  if (!source.missionId && !source.commitments) {
    return null;
  }
  const commitments = Array.isArray(source.commitments)
    ? source.commitments
        .map((entry) => record(entry))
        .filter((entry) => stringValue(entry.commitmentId) || stringValue(entry.commitmentText))
    : [];
  const normalizedCommitments = commitments.map((commitment, index) => {
    const commitmentText = stringValue(commitment.commitmentText) ?? "";
    const expectedEvidenceDescription = stringValue(commitment.expectedEvidenceDescription) ?? "";
    return {
      commitmentId: stringValue(commitment.commitmentId) ?? `checkpoint-commitment-${index + 1}`,
      blocking: booleanValue(commitment.blocking) ?? true,
      status: stringValue(commitment.status) ?? "unknown",
      textFingerprint: hashText(commitmentText).slice(0, 20),
      evidenceFingerprint: hashText(expectedEvidenceDescription).slice(0, 20),
      textLength: commitmentText.length,
      expectedEvidenceLength: expectedEvidenceDescription.length,
      remainingWorkCount: stringArray(commitment.remainingWork, 12).length,
      hasWhyItMatters: Boolean(stringValue(commitment.whyItMatters)),
      hasExpectedEvidenceDescription: expectedEvidenceDescription.length > 0,
    };
  });
  const commitmentFingerprints = normalizedCommitments
    .map((commitment) =>
      hashValue({
        text: commitment.textFingerprint,
        evidence: commitment.evidenceFingerprint,
        blocking: commitment.blocking,
      }).slice(0, 20),
    )
    .toSorted((a, b) => a.localeCompare(b));
  const missingStructuralFields = normalizedCommitments.flatMap((commitment) => [
    ...(commitment.textLength === 0 ? [`commitmentText:${commitment.commitmentId}`] : []),
    ...(!commitment.hasWhyItMatters ? [`whyItMatters:${commitment.commitmentId}`] : []),
    ...(!commitment.hasExpectedEvidenceDescription
      ? [`expectedEvidenceDescription:${commitment.commitmentId}`]
      : []),
  ]);
  const blockingCommitmentCount =
    numberValue(source.blockingCommitmentCount) ??
    normalizedCommitments.filter((commitment) => commitment.blocking).length;
  const nonBlockingCommitmentCount =
    numberValue(source.nonBlockingCommitmentCount) ??
    normalizedCommitments.filter((commitment) => !commitment.blocking).length;
  const missionGate = stringValue(source.missionGate) ?? "unknown";
  return {
    artifactKind: "mission_ledger_structural_summary",
    missionId: stringValue(source.missionId) ?? "unknown-mission",
    ledgerStatus: stringValue(source.ledgerStatus) ?? "unknown",
    missionGate,
    blockingCommitmentCount,
    nonBlockingCommitmentCount,
    safetyConstraintCount: 0,
    explicitNonGoalCount: 0,
    commitmentFingerprints,
    commitments: normalizedCommitments,
    missingStructuralFields,
    reasonCodes: [
      ...(missionGate === "clear_to_execute" ? [] : [`mission_gate:${missionGate}`]),
      ...(missingStructuralFields.length > 0 ? ["mission_ledger_structural_fields_missing"] : []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function summarizeCommitmentPacketsForStability(input: {
  packets: CommitmentWorkPacket[];
  packetDiagnostics?: JsonValue | null;
}): CommitmentPacketStabilitySummary {
  const diagnosticsByCommitment = new Map<string, Record<string, unknown>>();
  const diagnosticRecord = record(input.packetDiagnostics);
  const packetDiagnosticList = Array.isArray(diagnosticRecord.packetDiagnostics)
    ? diagnosticRecord.packetDiagnostics
    : Array.isArray(diagnosticRecord.packetAuthorFanout)
      ? diagnosticRecord.packetAuthorFanout
      : [];
  for (const diagnostic of packetDiagnosticList) {
    const diagnosticEntry = record(diagnostic);
    const commitmentId = stringValue(diagnosticEntry.commitmentId);
    if (commitmentId) {
      diagnosticsByCommitment.set(commitmentId, diagnosticEntry);
    }
  }
  const packets: CommitmentPacketLaneDiagnostics[] = input.packets.map(
    (packet): CommitmentPacketLaneDiagnostics => {
      const diagnostic = diagnosticsByCommitment.get(packet.commitmentId) ?? {};
      const latestDiagnostics = record(diagnostic.latestDiagnostics);
      const reasonCodes = [
        ...stringArray(diagnostic.reasonCodes, 20),
        ...stringArray(latestDiagnostics.reasonCodes, 20),
      ].slice(0, 20);
      const noContentDiagnostic = record(latestDiagnostics.noContentDiagnostic);
      const noContentReasonClass =
        stringValue(latestDiagnostics.noContentReasonClass) ??
        stringValue(noContentDiagnostic.classifiedReason);
      const parsedContentLength = numberValue(latestDiagnostics.parsedContentLength);
      const rescueUsed =
        booleanValue(diagnostic.rescueUsed) === true ||
        stringValue(diagnostic.authoringPhase) === "rescue" ||
        reasonCodes.some((code) => code.includes("rescue"));
      const noContent =
        Boolean(noContentReasonClass) ||
        parsedContentLength === 0 ||
        reasonCodes.some((code) => code.includes("no_content") || code.includes("empty_output")) ||
        stringValue(latestDiagnostics.errorReasonCode)?.includes("no_content") === true;
      const missingRequiredFields = missingPacketFields(packet);
      return {
        artifactKind: "commitment_packet_lane_diagnostics" as const,
        commitmentId: packet.commitmentId,
        packetRef: packet.packetRef,
        authoringSource: packet.authoringSource,
        qualityStatus: packet.qualityStatus,
        status: stringValue(diagnostic.status) ?? packet.qualityStatus,
        modelRef: stringValue(diagnostic.modelRef) ?? stringValue(latestDiagnostics.modelRef),
        providerPath:
          stringValue(diagnostic.providerPath) ?? stringValue(latestDiagnostics.providerPath),
        profileRef:
          stringValue(diagnostic.profileRef) ?? stringValue(latestDiagnostics.requestProfileRef),
        authoringPhase:
          stringValue(diagnostic.authoringPhase) ?? stringValue(latestDiagnostics.authoringPhase),
        inputByteLength: numberValue(latestDiagnostics.inputByteLength),
        outputContentLength: numberValue(latestDiagnostics.outputContentLength),
        outputHash: stringValue(latestDiagnostics.outputHash),
        latencyMs: numberValue(latestDiagnostics.latencyMs),
        finishReason: stringValue(latestDiagnostics.finishReason),
        nativeFinishReason: stringValue(latestDiagnostics.nativeFinishReason),
        choiceCount: numberValue(latestDiagnostics.choiceCount),
        contentLengthByChoice: Array.isArray(latestDiagnostics.contentLengthByChoice)
          ? latestDiagnostics.contentLengthByChoice
              .filter((value): value is number => typeof value === "number")
              .slice(0, 16)
          : [],
        parsedContentLength,
        noContentReasonClass,
        retryEligibility:
          stringValue(latestDiagnostics.retryEligibility) ??
          stringValue(noContentDiagnostic.retryEligibility),
        inputBundleRef: stringValue(latestDiagnostics.inputBundleRef),
        inputBundleHash: stringValue(latestDiagnostics.inputBundleHash),
        concurrencySlot: stringValue(latestDiagnostics.concurrencySlot),
        timedOut:
          booleanValue(latestDiagnostics.timedOut) ??
          reasonCodes.some((code) => code.includes("timeout")),
        retryCount:
          numberValue(diagnostic.retryCount) ??
          (reasonCodes.some((code) => code.includes("retry")) ? 1 : 0),
        rescueUsed,
        rescueReasonCodes: reasonCodes.filter((code) => code.includes("rescue")).slice(0, 8),
        noContent,
        providerError:
          noContent ||
          reasonCodes.some((code) => code.includes("provider") || code.includes("openrouter")),
        missingRequiredFields,
        substance: {
          workerObjectiveLength: packet.workerObjective.length,
          contextScoutObjectiveLength: packet.contextScoutObjective.length,
          implementationObjectiveLength: packet.implementationObjective.length,
          validationObjectiveLength: packet.validationObjective.length,
          reviewObjectiveLength: packet.reviewObjective.length,
          likelyRepoAreaCount: packet.likelyRepoAreas.length,
          requiredContextQuestionCount: packet.requiredContextQuestions.length,
          acceptanceCriteriaCount: packet.acceptanceCriteria.length,
          stopIfMissingCount: packet.stopIfMissing.length,
          evidenceClaimDescriptionCount: packet.requiredEvidenceClaimDescriptions.length,
        },
        packetFingerprint: packetFingerprint(packet),
        reasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    },
  );
  return {
    artifactKind: "commitment_packet_stability_summary",
    packetCount: packets.length,
    completedCount: packets.filter(
      (packet) => packet.status === "completed" || packet.qualityStatus,
    ).length,
    acceptedCount: packets.filter((packet) => packet.qualityStatus === "accepted").length,
    acceptedWithLimitationsCount: packets.filter(
      (packet) => packet.qualityStatus === "accepted_with_limitations",
    ).length,
    needsReviewCount: packets.filter(
      (packet) =>
        packet.qualityStatus === "needs_review" || packet.missingRequiredFields.length > 0,
    ).length,
    missingRequiredFieldCount: packets.reduce(
      (sum, packet) => sum + packet.missingRequiredFields.length,
      0,
    ),
    packetFingerprints: packets
      .map((packet) => packet.packetFingerprint)
      .toSorted((a, b) => a.localeCompare(b)),
    packets,
    reasonCodes: [
      ...(packets.some((packet) => packet.rescueUsed) ? ["commitment_packet_rescue_used"] : []),
      ...(packets.some((packet) => packet.noContent) ? ["commitment_packet_no_content_seen"] : []),
      ...(packets.some((packet) => packet.missingRequiredFields.length > 0)
        ? ["commitment_packet_required_fields_missing"]
        : []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function summarizeCommitmentPacketCheckpointEvidenceForStability(input: {
  evidence: unknown;
  packetDiagnostics?: JsonValue | null;
}): CommitmentPacketStabilitySummary | null {
  const source = record(input.evidence);
  const rawPackets = Array.isArray(source.packets)
    ? source.packets
        .map((packet) => record(packet))
        .filter((packet) => stringValue(packet.commitmentId))
    : [];
  if (!source.packetCount && rawPackets.length === 0) {
    return null;
  }
  const diagnosticRecord = record(input.packetDiagnostics);
  const packetDiagnosticList = Array.isArray(diagnosticRecord.packetDiagnostics)
    ? diagnosticRecord.packetDiagnostics
    : [];
  const diagnosticsByCommitment = new Map<string, Record<string, unknown>>();
  for (const diagnostic of packetDiagnosticList) {
    const entry = record(diagnostic);
    const commitmentId = stringValue(entry.commitmentId);
    if (commitmentId) {
      diagnosticsByCommitment.set(commitmentId, entry);
    }
  }
  const packets: CommitmentPacketLaneDiagnostics[] = rawPackets.map(
    (packet): CommitmentPacketLaneDiagnostics => {
      const commitmentId = stringValue(packet.commitmentId) ?? "unknown";
      const diagnostic = diagnosticsByCommitment.get(commitmentId) ?? {};
      const retryAttempts = Array.isArray(diagnostic.retryAttempts) ? diagnostic.retryAttempts : [];
      const reasonCodes = [
        ...stringArray(diagnostic.reasonCodes, 20),
        ...stringArray(diagnostic.retryReasonCodes, 20),
        ...stringArray(diagnostic.failureClasses, 20),
      ].slice(0, 40);
      const status = stringValue(diagnostic.status) ?? stringValue(packet.qualityStatus);
      const rescueUsed =
        booleanValue(diagnostic.rescueUsed) === true ||
        Boolean(stringValue(diagnostic.fallbackReasonCode)) ||
        reasonCodes.some((code) => code.includes("rescue") || code.includes("fallback"));
      const noContentDiagnostic = record(diagnostic.noContentDiagnostic);
      const noContentReasonClass =
        stringValue(diagnostic.noContentReasonClass) ??
        stringValue(noContentDiagnostic.classifiedReason);
      const parsedContentLength = numberValue(diagnostic.parsedContentLength);
      const noContent =
        Boolean(noContentReasonClass) ||
        parsedContentLength === 0 ||
        stringValue(diagnostic.errorReasonCode)?.includes("no_content") === true ||
        reasonCodes.some((code) => code.includes("no_content") || code.includes("empty_output"));
      const retryAttemptCount = numberValue(diagnostic.retryAttemptCount);
      const retryCount =
        numberValue(diagnostic.retryCount) ??
        (retryAttemptCount !== null ? Math.max(0, retryAttemptCount - 1) : retryAttempts.length);
      const fingerprint = packetLikeFingerprint(packet);
      const missingRequiredFields = [
        ...(stringValue(packet.workerObjective) ? [] : ["workerObjective"]),
        ...(stringValue(packet.contextScoutObjective) ? [] : ["contextScoutObjective"]),
        ...(stringValue(packet.implementationObjective) ? [] : ["implementationObjective"]),
        ...(stringValue(packet.validationObjective) ? [] : ["validationObjective"]),
        ...(stringArray(packet.likelyRepoAreas, 12).length > 0 ? [] : ["likelyRepoAreas"]),
        ...(stringArray(packet.requiredContextQuestions, 12).length > 0
          ? []
          : ["requiredContextQuestions"]),
      ];
      return {
        artifactKind: "commitment_packet_lane_diagnostics" as const,
        commitmentId,
        packetRef: stringValue(packet.packetRef),
        authoringSource: stringValue(packet.authoringSource),
        qualityStatus: stringValue(packet.qualityStatus),
        status,
        modelRef: stringValue(diagnostic.modelRef),
        providerPath: stringValue(diagnostic.providerPath),
        profileRef: stringValue(diagnostic.profileRef),
        authoringPhase: stringValue(diagnostic.authoringPhase),
        inputByteLength: numberValue(diagnostic.inputByteLength),
        outputContentLength: numberValue(diagnostic.outputContentLength),
        outputHash: stringValue(diagnostic.outputHash),
        latencyMs: numberValue(diagnostic.latencyMs),
        finishReason: stringValue(diagnostic.finishReason),
        nativeFinishReason: stringValue(diagnostic.nativeFinishReason),
        choiceCount: numberValue(diagnostic.choiceCount),
        contentLengthByChoice: Array.isArray(diagnostic.contentLengthByChoice)
          ? diagnostic.contentLengthByChoice
              .filter((value): value is number => typeof value === "number")
              .slice(0, 16)
          : [],
        parsedContentLength,
        noContentReasonClass,
        retryEligibility:
          stringValue(diagnostic.retryEligibility) ??
          stringValue(noContentDiagnostic.retryEligibility),
        inputBundleRef: stringValue(diagnostic.inputBundleRef),
        inputBundleHash: stringValue(diagnostic.inputBundleHash),
        concurrencySlot: stringValue(diagnostic.concurrencySlot),
        timedOut:
          booleanValue(diagnostic.timedOut) ?? reasonCodes.some((code) => code.includes("timeout")),
        retryCount,
        rescueUsed,
        rescueReasonCodes: reasonCodes.filter((code) => code.includes("rescue")).slice(0, 8),
        noContent,
        providerError:
          noContent ||
          Boolean(stringValue(diagnostic.errorReasonCode)) ||
          reasonCodes.some((code) => code.includes("provider") || code.includes("openrouter")),
        missingRequiredFields,
        substance: {
          workerObjectiveLength: stringValue(packet.workerObjective)?.length ?? 0,
          contextScoutObjectiveLength: stringValue(packet.contextScoutObjective)?.length ?? 0,
          implementationObjectiveLength: stringValue(packet.implementationObjective)?.length ?? 0,
          validationObjectiveLength: stringValue(packet.validationObjective)?.length ?? 0,
          reviewObjectiveLength: stringValue(packet.reviewObjective)?.length ?? 0,
          likelyRepoAreaCount: stringArray(packet.likelyRepoAreas, 12).length,
          requiredContextQuestionCount: stringArray(packet.requiredContextQuestions, 12).length,
          acceptanceCriteriaCount:
            numberValue(packet.acceptanceCriteriaCount) ??
            stringArray(packet.acceptanceCriteria, 12).length,
          stopIfMissingCount: stringArray(packet.stopIfMissing, 12).length,
          evidenceClaimDescriptionCount: stringArray(packet.requiredEvidenceClaimDescriptions, 12)
            .length,
        },
        packetFingerprint: fingerprint,
        reasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    },
  );
  const declaredPacketCount = numberValue(source.packetCount) ?? packets.length;
  return {
    artifactKind: "commitment_packet_stability_summary",
    packetCount: declaredPacketCount,
    completedCount: packets.filter(
      (packet) => packet.status === "completed" || packet.qualityStatus,
    ).length,
    acceptedCount: packets.filter((packet) => packet.qualityStatus === "accepted").length,
    acceptedWithLimitationsCount: packets.filter(
      (packet) => packet.qualityStatus === "accepted_with_limitations",
    ).length,
    needsReviewCount: packets.filter(
      (packet) =>
        packet.qualityStatus === "needs_review" || packet.missingRequiredFields.length > 0,
    ).length,
    missingRequiredFieldCount: packets.reduce(
      (sum, packet) => sum + packet.missingRequiredFields.length,
      0,
    ),
    packetFingerprints: packets
      .map((packet) => packet.packetFingerprint)
      .toSorted((a, b) => a.localeCompare(b)),
    packets,
    reasonCodes: [
      ...(declaredPacketCount !== packets.length
        ? ["commitment_packet_manifest_count_mismatch"]
        : []),
      ...(packets.some((packet) => packet.rescueUsed) ? ["commitment_packet_rescue_used"] : []),
      ...(packets.some((packet) => packet.noContent) ? ["commitment_packet_no_content_seen"] : []),
      ...(packets.some((packet) => packet.missingRequiredFields.length > 0)
        ? ["commitment_packet_required_fields_missing"]
        : []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function setDiff(left: string[], right: string[]): string[] {
  return left.filter((value) => !right.includes(value));
}

function countMatches(left: string[], right: string[]): number {
  return left.filter((value) => right.includes(value)).length;
}

export function compareMissionLedgers(input: {
  runA: MissionLedgerStructuralSummary | null;
  runB: MissionLedgerStructuralSummary | null;
}): MissionLedgerCommitmentComparison {
  if (!input.runA || !input.runB) {
    return {
      artifactKind: "mission_ledger_commitment_comparison",
      status: "runtime_boundary_missing",
      missionGateChanged: false,
      blockingCommitmentCountDelta: null,
      nonBlockingCommitmentCountDelta: null,
      matchingCommitmentFingerprintCount: 0,
      runAOnlyCommitmentFingerprints: [],
      runBOnlyCommitmentFingerprints: [],
      missingCommitmentIds: [],
      structuralDriftScore: 1,
      reasonCodes: ["mission_ledger_missing_for_comparison"],
      rawPromptStored: false,
      rawResponseStored: false,
    };
  }
  const runAOnly = setDiff(input.runA.commitmentFingerprints, input.runB.commitmentFingerprints);
  const runBOnly = setDiff(input.runB.commitmentFingerprints, input.runA.commitmentFingerprints);
  const blockingCommitmentCountDelta =
    input.runB.blockingCommitmentCount - input.runA.blockingCommitmentCount;
  const nonBlockingCommitmentCountDelta =
    input.runB.nonBlockingCommitmentCount - input.runA.nonBlockingCommitmentCount;
  const missionGateChanged = input.runA.missionGate !== input.runB.missionGate;
  const maxCommitments = Math.max(
    1,
    input.runA.commitmentFingerprints.length,
    input.runB.commitmentFingerprints.length,
  );
  const structuralDriftScore = (runAOnly.length + runBOnly.length) / (maxCommitments * 2);
  const material =
    missionGateChanged ||
    input.runA.blockingCommitmentCount === 0 ||
    input.runB.blockingCommitmentCount === 0 ||
    input.runA.missingStructuralFields.length > 0 ||
    input.runB.missingStructuralFields.length > 0;
  const bounded =
    !material &&
    (runAOnly.length > 0 ||
      runBOnly.length > 0 ||
      blockingCommitmentCountDelta !== 0 ||
      nonBlockingCommitmentCountDelta !== 0);
  return {
    artifactKind: "mission_ledger_commitment_comparison",
    status: material
      ? "material_structural_drift"
      : bounded
        ? "bounded_structural_drift"
        : "exact_structure_match",
    missionGateChanged,
    blockingCommitmentCountDelta,
    nonBlockingCommitmentCountDelta,
    matchingCommitmentFingerprintCount: countMatches(
      input.runA.commitmentFingerprints,
      input.runB.commitmentFingerprints,
    ),
    runAOnlyCommitmentFingerprints: runAOnly.slice(0, 30),
    runBOnlyCommitmentFingerprints: runBOnly.slice(0, 30),
    missingCommitmentIds: [
      ...input.runA.commitments
        .filter(
          (commitment) =>
            !input.runB?.commitments.some(
              (other) => other.commitmentId === commitment.commitmentId,
            ),
        )
        .map((commitment) => commitment.commitmentId),
      ...input.runB.commitments
        .filter(
          (commitment) =>
            !input.runA?.commitments.some(
              (other) => other.commitmentId === commitment.commitmentId,
            ),
        )
        .map((commitment) => commitment.commitmentId),
    ].slice(0, 40),
    structuralDriftScore,
    reasonCodes: [
      ...(missionGateChanged ? ["mission_ledger_gate_changed"] : []),
      ...(blockingCommitmentCountDelta !== 0
        ? ["mission_ledger_blocking_count_changed_diagnostic_only"]
        : []),
      ...(structuralDriftScore > 0 ? ["mission_ledger_commitment_fingerprints_differ"] : []),
      ...(material ? ["mission_ledger_material_structural_drift"] : []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function compareCommitmentPackets(input: {
  runA: CommitmentPacketStabilitySummary | null;
  runB: CommitmentPacketStabilitySummary | null;
}): CommitmentPacketPairComparison {
  if (!input.runA || !input.runB) {
    return {
      artifactKind: "commitment_packet_pair_comparison",
      status: "runtime_boundary_missing",
      packetCountDelta: null,
      matchingPacketFingerprintCount: 0,
      runAOnlyPacketFingerprints: [],
      runBOnlyPacketFingerprints: [],
      missingCommitmentPacketIds: [],
      rescueDependence: false,
      noContentRetryCount: 0,
      structuralDriftScore: 1,
      reasonCodes: ["commitment_packet_summary_missing_for_comparison"],
      rawPromptStored: false,
      rawResponseStored: false,
    };
  }
  const runAOnly = setDiff(input.runA.packetFingerprints, input.runB.packetFingerprints);
  const runBOnly = setDiff(input.runB.packetFingerprints, input.runA.packetFingerprints);
  const packetCountDelta = input.runB.packetCount - input.runA.packetCount;
  const maxPackets = Math.max(1, input.runA.packetCount, input.runB.packetCount);
  const structuralDriftScore = (runAOnly.length + runBOnly.length) / (maxPackets * 2);
  const rescueDependence =
    input.runA.packets.some((packet) => packet.rescueUsed) ||
    input.runB.packets.some((packet) => packet.rescueUsed);
  const noContentRetryCount =
    input.runA.packets.filter((packet) => packet.noContent).length +
    input.runB.packets.filter((packet) => packet.noContent).length;
  const missingCommitmentPacketIds = [
    ...input.runA.packets
      .filter(
        (packet) =>
          !input.runB?.packets.some((other) => other.commitmentId === packet.commitmentId),
      )
      .map((packet) => packet.commitmentId),
    ...input.runB.packets
      .filter(
        (packet) =>
          !input.runA?.packets.some((other) => other.commitmentId === packet.commitmentId),
      )
      .map((packet) => packet.commitmentId),
  ].slice(0, 40);
  const material =
    input.runA.packetCount === 0 ||
    input.runB.packetCount === 0 ||
    input.runA.completedCount < input.runA.packetCount ||
    input.runB.completedCount < input.runB.packetCount ||
    input.runA.missingRequiredFieldCount > 0 ||
    input.runB.missingRequiredFieldCount > 0 ||
    rescueDependence;
  const bounded =
    !material && (packetCountDelta !== 0 || structuralDriftScore > 0 || noContentRetryCount > 0);
  return {
    artifactKind: "commitment_packet_pair_comparison",
    status: material
      ? "material_structural_drift"
      : bounded
        ? "bounded_structural_drift"
        : "exact_structure_match",
    packetCountDelta,
    matchingPacketFingerprintCount: countMatches(
      input.runA.packetFingerprints,
      input.runB.packetFingerprints,
    ),
    runAOnlyPacketFingerprints: runAOnly.slice(0, 30),
    runBOnlyPacketFingerprints: runBOnly.slice(0, 30),
    missingCommitmentPacketIds,
    rescueDependence,
    noContentRetryCount,
    structuralDriftScore,
    reasonCodes: [
      ...(packetCountDelta !== 0 ? ["commitment_packet_count_changed_diagnostic_only"] : []),
      ...(input.runA.completedCount < input.runA.packetCount ||
      input.runB.completedCount < input.runB.packetCount
        ? ["commitment_packet_coverage_incomplete"]
        : []),
      ...(structuralDriftScore > 0 ? ["commitment_packet_fingerprints_differ"] : []),
      ...(rescueDependence ? ["commitment_packet_rescue_dependence"] : []),
      ...(noContentRetryCount > 0 ? ["commitment_packet_no_content_retry_observed"] : []),
      ...(material ? ["commitment_packet_material_structural_drift"] : []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function summarizeProviderVariance(
  runs: Array<CommitmentPacketStabilitySummary | null>,
): ProviderVarianceDiagnostic {
  const packets = runs.flatMap((run) => run?.packets ?? []);
  const longLatencyThresholdMs = 120_000;
  const inputLengths = packets
    .map((packet) => packet.inputByteLength)
    .filter((value): value is number => typeof value === "number");
  const averageInputLength =
    inputLengths.length > 0
      ? inputLengths.reduce((sum, value) => sum + value, 0) / inputLengths.length
      : 0;
  const noContentPackets = packets.filter((packet) => packet.noContent);
  const noContentReasonCounts = noContentPackets.reduce<Record<string, number>>(
    (counts, packet) => {
      const reason = packet.noContentReasonClass ?? "unclassified";
      counts[reason] = (counts[reason] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const repeatedFailures = new Map<string, number>();
  for (const packet of packets.filter((entry) => entry.noContent || entry.providerError)) {
    repeatedFailures.set(packet.commitmentId, (repeatedFailures.get(packet.commitmentId) ?? 0) + 1);
  }
  const classifications = [
    ...(noContentPackets.length > 0 ? ["provider_no_content_observed"] : []),
    ...(packets.some((packet) => packet.rescueUsed) ? ["gpt_rescue_used"] : []),
    ...(packets.some((packet) => packet.timedOut) ? ["timeout_observed"] : []),
    ...Object.keys(noContentReasonCounts).map((reason) => `no_content_reason:${reason}`),
    ...([...repeatedFailures.values()].some((count) => count > 1)
      ? ["repeated_same_packet_failure"]
      : []),
  ];
  return {
    artifactKind: "provider_variance_diagnostic",
    noContentCount: noContentPackets.length,
    retryCount: packets.reduce((sum, packet) => sum + packet.retryCount, 0),
    rescueCount: packets.filter((packet) => packet.rescueUsed).length,
    longLatencyCount: packets.filter((packet) => (packet.latencyMs ?? 0) > longLatencyThresholdMs)
      .length,
    providerErrorCount: packets.filter((packet) => packet.providerError).length,
    repeatedSamePacketFailureCount: [...repeatedFailures.values()].filter((count) => count > 1)
      .length,
    inputSizeCorrelated:
      averageInputLength > 0 &&
      noContentPackets.some((packet) => (packet.inputByteLength ?? 0) > averageInputLength * 1.25),
    timeoutCorrelated: packets.some(
      (packet) => packet.timedOut && (packet.noContent || packet.providerError),
    ),
    schemaNormalizationCorrelated: packets.some(
      (packet) =>
        packet.authoringPhase === "targeted_normalization" &&
        (packet.noContent || packet.providerError),
    ),
    noContentReasonCounts,
    failedPacketReplayRequired:
      noContentPackets.some((packet) => packet.inputBundleHash !== null) &&
      [...repeatedFailures.values()].some((count) => count > 1),
    classifications,
    affectedCommitmentIds: [
      ...new Set(
        packets
          .filter((packet) => packet.noContent || packet.rescueUsed || packet.providerError)
          .map((packet) => packet.commitmentId),
      ),
    ].slice(0, 40),
    reasonCodes: classifications,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function summarizeRuntimeBoundaryVariance(input: {
  runA: MissionLedgerStabilityDiagnosticRun;
  runB: MissionLedgerStabilityDiagnosticRun;
}): RuntimeBoundaryVarianceDiagnostic {
  const reasonCodes = [
    ...(input.runA.prompt.promptHash !== input.runB.prompt.promptHash
      ? ["prompt_hash_mismatch"]
      : []),
    ...(input.runA.missionLedger || input.runB.missionLedger ? [] : ["mission_ledger_missing"]),
    ...(input.runA.commitmentPackets || input.runB.commitmentPackets
      ? []
      : ["commitment_packet_manifest_missing"]),
    ...input.runA.runtimeBoundary.reasonCodes,
    ...input.runB.runtimeBoundary.reasonCodes,
  ];
  return {
    artifactKind: "runtime_boundary_variance_diagnostic",
    promptResolverStable:
      input.runA.prompt.promptHash === input.runB.prompt.promptHash &&
      input.runA.prompt.promptLength === input.runB.prompt.promptLength,
    promptHashMismatch: input.runA.prompt.promptHash !== input.runB.prompt.promptHash,
    missionLedgerMissing: !input.runA.missionLedger || !input.runB.missionLedger,
    packetManifestMissing: !input.runA.commitmentPackets || !input.runB.commitmentPackets,
    artifactContractFailure: reasonCodes.some((code) => code.includes("artifact")),
    lifecycleClassificationFailure: reasonCodes.some((code) => code.includes("lifecycle")),
    schemaNormalizationMismatch: reasonCodes.some((code) => code.includes("schema_normalization")),
    runtimePreflightBlocked: reasonCodes.some((code) => code.includes("preflight")),
    reasonCodes: [...new Set(reasonCodes)].slice(0, 60),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function buildMissionLedgerStabilityVerdict(input: {
  missionLedgerComparison: MissionLedgerCommitmentComparison;
  packetComparison: CommitmentPacketPairComparison;
  providerVariance: ProviderVarianceDiagnostic;
  runtimeBoundary: RuntimeBoundaryVarianceDiagnostic;
}): MissionLedgerStabilityVerdict {
  const runtimeFailed =
    input.runtimeBoundary.promptHashMismatch ||
    input.runtimeBoundary.missionLedgerMissing ||
    input.runtimeBoundary.packetManifestMissing ||
    input.runtimeBoundary.artifactContractFailure ||
    input.runtimeBoundary.runtimePreflightBlocked;
  const structuralFailed =
    input.missionLedgerComparison.status === "material_structural_drift" ||
    input.packetComparison.status === "material_structural_drift" ||
    input.packetComparison.rescueDependence;
  const providerVarianceOnly =
    !runtimeFailed &&
    !structuralFailed &&
    (input.providerVariance.noContentCount > 0 ||
      input.providerVariance.retryCount > 0 ||
      input.providerVariance.providerErrorCount > 0);
  const status: MissionLedgerStabilityVerdictStatus = runtimeFailed
    ? "failed_runtime_boundary"
    : structuralFailed
      ? "needs_review_structural_drift"
      : providerVarianceOnly
        ? "stable_with_provider_variance"
        : "stable";
  const reasonCodes = [
    ...input.missionLedgerComparison.reasonCodes,
    ...input.packetComparison.reasonCodes,
    ...input.providerVariance.reasonCodes,
    ...input.runtimeBoundary.reasonCodes,
    `mission_ledger_stability_verdict:${status}`,
  ];
  const blockerSummary =
    status === "failed_runtime_boundary"
      ? "Runtime boundary failed before ledger/packet stability could be trusted."
      : status === "needs_review_structural_drift"
        ? "Mission Ledger or packet output drifted materially, or packet authoring depended on GPT rescue."
        : null;
  return {
    artifactKind: "mission_ledger_stability_verdict",
    schemaVersion: MISSION_LEDGER_STABILITY_DIAGNOSTIC_SCHEMA_VERSION,
    status,
    safeToRunProductSpecProof: status === "stable" || status === "stable_with_provider_variance",
    summary:
      status === "stable"
        ? "Mission Ledger and Commitment Work Packet outputs were structurally stable."
        : status === "stable_with_provider_variance"
          ? "Mission Ledger and packets were structurally stable, with provider variance recorded as a proof concern."
          : (blockerSummary ?? "Mission Ledger stability diagnostic needs review."),
    blockerSummary,
    qwenNoContentCount: input.providerVariance.noContentCount,
    gptRescueCount: input.providerVariance.rescueCount,
    structuralDriftScore: Math.max(
      input.missionLedgerComparison.structuralDriftScore,
      input.packetComparison.structuralDriftScore,
    ),
    reasonCodes: [...new Set(reasonCodes)].slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function buildMissionLedgerStabilityDiagnosticPair(input: {
  pairId: string;
  runA: MissionLedgerStabilityDiagnosticRun;
  runB: MissionLedgerStabilityDiagnosticRun;
}): MissionLedgerStabilityDiagnosticPair {
  const missionLedgerComparison = compareMissionLedgers({
    runA: input.runA.missionLedger,
    runB: input.runB.missionLedger,
  });
  const packetComparison = compareCommitmentPackets({
    runA: input.runA.commitmentPackets,
    runB: input.runB.commitmentPackets,
  });
  const providerVariance = summarizeProviderVariance([
    input.runA.commitmentPackets,
    input.runB.commitmentPackets,
  ]);
  const runtimeBoundary = summarizeRuntimeBoundaryVariance({
    runA: input.runA,
    runB: input.runB,
  });
  const verdict = buildMissionLedgerStabilityVerdict({
    missionLedgerComparison,
    packetComparison,
    providerVariance,
    runtimeBoundary,
  });
  return {
    artifactKind: "mission_ledger_stability_diagnostic_pair",
    schemaVersion: MISSION_LEDGER_STABILITY_DIAGNOSTIC_SCHEMA_VERSION,
    pairId: input.pairId,
    promptHash: input.runA.prompt.promptHash,
    promptLength: input.runA.prompt.promptLength,
    runA: input.runA,
    runB: input.runB,
    missionLedgerComparison,
    packetComparison,
    providerVariance,
    runtimeBoundary,
    verdict,
    reasonCodes: verdict.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
  };
}

export function missionLedgerStabilityDiagnosticMetadata(
  pair: MissionLedgerStabilityDiagnosticPair,
): JsonValue {
  return {
    artifactKind: "mission_ledger_stability_diagnostic_manifest",
    schemaVersion: MISSION_LEDGER_STABILITY_DIAGNOSTIC_SCHEMA_VERSION,
    pairId: pair.pairId,
    promptHash: pair.promptHash,
    promptLength: pair.promptLength,
    verdictStatus: pair.verdict.status,
    safeToRunProductSpecProof: pair.verdict.safeToRunProductSpecProof,
    qwenNoContentCount: pair.verdict.qwenNoContentCount,
    gptRescueCount: pair.verdict.gptRescueCount,
    structuralDriftScore: pair.verdict.structuralDriftScore,
    blockingCommitmentCountA: pair.runA.missionLedger?.blockingCommitmentCount ?? null,
    blockingCommitmentCountB: pair.runB.missionLedger?.blockingCommitmentCount ?? null,
    packetCountA: pair.runA.commitmentPackets?.packetCount ?? null,
    packetCountB: pair.runB.commitmentPackets?.packetCount ?? null,
    providerClassifications: pair.providerVariance.classifications.slice(0, 20),
    reasonCodes: pair.reasonCodes.slice(0, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
  } as JsonValue;
}
