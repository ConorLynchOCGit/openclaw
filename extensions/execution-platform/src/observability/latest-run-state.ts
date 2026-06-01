import type { JsonValue } from "../runtime-job-repository.ts";
import {
  buildCanonicalReadbackGate,
  type CanonicalReadbackGate,
} from "./canonical-readback-gate.ts";
import type { HeapPhaseSnapshot } from "./runtime-diagnostics.ts";

export type LatestRunFrontierStatus =
  | "missing"
  | "planning"
  | "ready"
  | "running"
  | "blocked"
  | "needs_review"
  | "finalizing"
  | "terminal";

export type LatestRunActiveFrontier = {
  state: "present" | "missing";
  status: LatestRunFrontierStatus;
  graphId: string | null;
  currentSuperstep: number | null;
  selectedNodeIds: string[];
  runningNodeIds: string[];
  completedNodeIds: string[];
  blockedNodeIds: string[];
  failedNodeIds: string[];
  needsReviewNodeIds: string[];
  waitingForHumanNodeIds: string[];
  openCommitmentIds: string[];
  nextTransition: string | null;
  schedulerNextLegalTransition: string | null;
  noProgress: {
    state: "present" | "missing";
    signatureHash: string | null;
    repeatCount: number | null;
    terminalBlockerCode: string | null;
    reasonCodes: string[];
  };
  rootCause: {
    state: "present" | "missing";
    signatureHash: string | null;
    repeatCount: number | null;
    systemic: boolean | null;
    recommendedRepairBoundary: string | null;
    affectedNodeIds: string[];
    affectedBranchIds: string[];
    successfulSiblingEvidenceRefs: string[];
    missingFields: string[];
    schemaErrorPaths: string[];
    policyErrorPaths: string[];
    contractRefs: string[];
    domainResourcePacketKinds: string[];
    providerProfileIds: string[];
    nextLegalTransitions: string[];
    reasonCodes: string[];
  };
  missionLedgerEvaluationThrottle: {
    state: "present" | "missing";
    nodeId: string | null;
    shouldEvaluate: boolean | null;
    reasonCodes: string[];
  };
  counts: {
    selected: number;
    running: number;
    completed: number;
    blocked: number;
    failed: number;
    needsReview: number;
    waitingForHuman: number;
    branchStates: number;
    truncated: boolean;
  };
  branchStates: Array<{
    branchId: string | null;
    nodeId: string;
    nodeKind: string | null;
    capabilityId: string | null;
    executorKey: string | null;
    executionIntent: string | null;
    evidenceMode: string[];
    targetCommitmentIds: string[];
    status: string | null;
    blockerSummary: string | null;
    failureClass: string | null;
    errorPath: string | null;
    repairAction: string | null;
    nextTransition: string | null;
    readinessStateRef: string | null;
    contractRef: string | null;
    resourceRequirementRefs: string[];
    nodeResourceDemandSessionRefs: string[];
    nodeResourceDemandStatus: string | null;
    nodeResourceLedgerManifestRefs: string[];
    nodeResourceLedgerStatus: string | null;
    domainResourceSelectionRefs: string[];
    domainResourceSelectionStatus: string | null;
    actionGateStatus: string | null;
    actionGateMissingFields: string[];
    providerDiagnosticRefs: string[];
    providerDiagnosticStatus: string | null;
    domainResourcePacketRef: string | null;
    resourcePacketRef: string | null;
    blockerCode: string | null;
    blockerSchemaPath: string | null;
    blockerPolicyPath: string | null;
    blockerSignature: string | null;
    consumerRefs: string[];
    dependentConsumers: string[];
    siblingBranchIds: string[];
    successfulEvidenceRefs: string[];
    failedEvidenceRefs: string[];
    repairNodeRefs: string[];
    diagnosticOnlyNodeRefs: string[];
    rootCauseRef: string | null;
    rootCauseSystemic: boolean | null;
    evidenceRefs: string[];
    reasonCodes: string[];
  }>;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type LatestRunState = {
  artifactKind: "execution_platform_latest_run_state";
  schemaVersion: "execution-platform.latest-run-state.v1";
  generatedAt: string;
  runtimeJobId: string | null;
  workItemId: string | null;
  promptHash: string | null;
  promptRef: string | null;
  promptLength: number | null;
  process: {
    isRunning: boolean;
    terminalStatus: string | null;
    adapterTerminalStatus: string | null;
    retryState: string | null;
  };
  runtimeJob: {
    state: string | null;
    attempts: number | null;
    maxAttempts: number | null;
    workerId: string | null;
    startedAt: string | null;
    completedAt: string | null;
  };
  current: {
    phase: string | null;
    schedulerPhase: string | null;
    stage: string | null;
    graphId: string | null;
    nodeId: string | null;
    nodeKind: string | null;
    workIntentId: string | null;
    workIntentTitle: string | null;
    executionIntent: string | null;
    evidenceMode: string[];
    capabilityId: string | null;
    executorKey: string | null;
    workerRef: string | null;
    activeToolId: string | null;
    readinessStateRef: string | null;
    readinessStatus: string | null;
    readinessProjectionStatus: string | null;
    readinessProjectionDriftReasonCodes: string[];
    readinessProjectionMissingFields: string[];
    readinessStale: boolean | null;
    nodeResourceDemandSessionRefs: string[];
    nodeResourceDemandStatus: string | null;
    nodeResourceLedgerManifestRefs: string[];
    nodeResourceLedgerStatus: string | null;
    domainResourceSelectionRefs: string[];
    domainResourceSelectionStatus: string | null;
    actionGateStatus: string | null;
    actionGateMissingFields: string[];
    providerDiagnosticRefs: string[];
    providerDiagnosticStatus: string | null;
    schemaPath: string | null;
    policyPath: string | null;
    roleId: string | null;
    modelRef: string | null;
    providerPath: string | null;
    modelTaskClass: string | null;
    modelPolicyRef: string | null;
    contractBoundaryId: string | null;
    modelPolicyBindingRef: string | null;
    reasoningMode: string | null;
    parserMode: string | null;
    proofCleanlinessState: string | null;
    objective: string | null;
    blockerSummary: string | null;
    nextAction: string | null;
    eli5: string | null;
    validationPhase: string | null;
    validationPhaseCompatibility: string | null;
    validationPhaseReasonCodes: string[];
  };
  latestReasonCodes: string[];
  latestArtifactRefs: string[];
  wallTime: {
    totalMs: number | null;
    byPhase: JsonValue;
  };
  modelUsage: {
    byModel: JsonValue;
    byPhase: JsonValue;
    missingUsageEventCount: number | null;
    usageUnavailableReasons: JsonValue;
  };
  proofEnvironment: {
    state: "present" | "missing";
    heapPhaseSnapshots: HeapPhaseSnapshot[];
    largestMetadataBytes: number | null;
    largestMetadataRef: string | null;
    largestArtifactBodyBytes: number | null;
    largestArtifactBodyRef: string | null;
    latestRunStateMetadataBytes: number | null;
    schedulerProgressMetadataBytes: number | null;
    workQueueProjectionMetadataBytes: number | null;
    providerRequestMaxBytes: number | null;
    reasonCodes: string[];
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
    rawToolLogStored: false;
    rawDbRowsStored: false;
    secretsStored: false;
  };
  schedulerModelCallEnvelope: JsonValue | null;
  activeFrontier: LatestRunActiveFrontier;
  graphPatch: {
    state: "present" | "missing";
    ref: string | null;
    payloadRef: string | null;
    kind: string | null;
    byteCount: number | null;
    nodeCount: number | null;
    edgeCount: number | null;
    affectedNodeIds: string[];
    affectedBranchIds: string[];
    reasonCodes: string[];
  };
  contextBroker: {
    state: "present" | "missing";
    requirementRefs: string[];
    requirementStatuses: string[];
    requirementReasonCodes: string[];
    requestRefs: string[];
    statuses: string[];
    consumerNodeIds: string[];
    nextTransition: string | null;
    reasonCodes: string[];
  };
  resourceFrontier: {
    state: "present" | "missing";
    status: string | null;
    requestRef: string | null;
    shardManifestRef: string | null;
    shardCount: number | null;
    shardUnitKind: string | null;
    mergePacketRef: string | null;
    singleUnitBlockerRef: string | null;
    nextTransition: string | null;
  };
  expansionAdmission: {
    state: "present" | "missing";
    decisionRef: string | null;
    policyRef: string | null;
    status: string | null;
    originalNodeCount: number | null;
    originalEdgeCount: number | null;
    admittedNodeCount: number | null;
    admittedEdgeCount: number | null;
    deferredNodeCount: number | null;
    deferredEdgeCount: number | null;
    readyFrontierNodeIds: string[];
    admittedNodeIds: string[];
    deferredNodeIds: string[];
    nextTransition: string | null;
    prerequisiteCritical: boolean | null;
    reasonCodes: string[];
  };
  boundaryReplay: {
    state: "present" | "missing";
    latestCheckpointKind: string | null;
    checkpointRefs: string[];
    graphCheckpointRefs: string[];
    planRefs: string[];
    replayStartPolicy: string | null;
    replaySafetyStatus: string | null;
    replayFreshnessStatus: string | null;
    replayContinuationMode: string | null;
    exactContinuationMode: string | null;
    exactContinuationAction: string | null;
    latestAcceptedCheckpointRef: string | null;
    currentReplayBoundary: string | null;
    nextReplayBoundary: string | null;
    productionPathEquivalence: string | null;
    boundaryEpoch: string | null;
    currentChildEpoch: string | null;
    supersededChildCount: number | null;
    supersededChildNodeIds: string[];
    proofClosureAllowed: boolean | null;
    resumeFromArtifactRefs: string[];
    invalidReasonCodes: string[];
    reasonCodes: string[];
  };
  canonicalReadbackGate: CanonicalReadbackGate;
  recommendedOperatorAction: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

function bounded(value: unknown, max = 700): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function boundedStrings(value: unknown, max = 24): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0,
          ),
        ),
      ]
        .map((item) => item.trim().slice(0, 260))
        .slice(0, max)
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function jobString(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return bounded(value, 260);
}

function mapNextTransition(value: string | null, status: LatestRunFrontierStatus): string | null {
  if (value === "execute_frontier") {
    return "run_frontier";
  }
  if (value === "repair_or_create_prerequisite") {
    return "repair_or_create_prerequisite";
  }
  if (value === "wait_for_locks_or_provider_budget") {
    return "wait_for_locks_or_provider_budget";
  }
  if (status === "blocked" || status === "needs_review") {
    return "needs_review";
  }
  if (status === "running" || status === "ready") {
    return "continue_frontier";
  }
  if (status === "terminal") {
    return "inspect_terminal_evidence";
  }
  return value;
}

function explicitFrontierStatus(value: unknown): LatestRunFrontierStatus | null {
  const status = bounded(value, 120);
  return status === "missing" ||
    status === "planning" ||
    status === "ready" ||
    status === "running" ||
    status === "blocked" ||
    status === "needs_review" ||
    status === "finalizing" ||
    status === "terminal"
    ? status
    : null;
}

function buildBranchStates(input: {
  parallelFrontier: Record<string, unknown> | null;
  latest: Record<string, unknown>;
  nodeId: string | null;
  currentPhase: string | null;
  blockerSummary: string | null;
}): LatestRunActiveFrontier["branchStates"] {
  const explicitBranchStates = Array.isArray(input.latest.branchScopedFrontierStates)
    ? input.latest.branchScopedFrontierStates
        .map((branch) => asRecord(branch))
        .filter((branch): branch is Record<string, unknown> => Boolean(branch))
    : Array.isArray(input.parallelFrontier?.branchScopedFrontierStates)
      ? input.parallelFrontier.branchScopedFrontierStates
          .map((branch) => asRecord(branch))
          .filter((branch): branch is Record<string, unknown> => Boolean(branch))
      : [];
  const branchRecords = Array.isArray(input.parallelFrontier?.branchResults)
    ? input.parallelFrontier.branchResults
        .map((branch) => asRecord(branch))
        .filter((branch): branch is Record<string, unknown> => Boolean(branch))
    : [];
  const branches =
    explicitBranchStates.length > 0
      ? explicitBranchStates
      : branchRecords.length > 0
      ? branchRecords
      : input.nodeId
        ? [
            {
              branchId: bounded(input.latest.branchId, 180),
              nodeId: input.nodeId,
              nodeKind: input.latest.activeNodeKind,
              capabilityId: input.latest.capabilityId ?? input.latest.selectedCapabilityId,
              executorKey: input.latest.executorKey ?? input.latest.selectedExecutorKey,
              executionIntent: input.latest.executionIntent,
              evidenceMode: input.latest.evidenceMode,
              status: input.currentPhase,
              blockerSummary: input.blockerSummary,
              failureClass: input.latest.failureClass,
              errorPath: input.latest.errorPath ?? input.latest.schemaPath,
              repairAction:
                input.latest.nodeReadinessRepairAction ?? input.latest.nextDecisionNeeded,
              nextTransition: input.latest.nextDecisionNeeded,
              readinessStateRef: input.latest.nodeReadinessStateRef,
              contractRef: input.latest.nodeExecutionContractRef,
              resourceRequirementRefs: input.latest.resourceRequirementRefs,
              nodeResourceDemandSessionRefs: input.latest.nodeResourceDemandSessionRefs,
              nodeResourceDemandStatus: input.latest.nodeResourceDemandStatus,
              nodeResourceLedgerManifestRefs: input.latest.nodeResourceLedgerManifestRefs,
              nodeResourceLedgerStatus: input.latest.nodeResourceLedgerStatus,
              domainResourceSelectionRefs: input.latest.domainResourceSelectionRefs,
              domainResourceSelectionStatus: input.latest.domainResourceSelectionStatus,
              actionGateStatus: input.latest.actionGateStatus,
              actionGateMissingFields: input.latest.actionGateMissingFields,
              providerDiagnosticRefs: input.latest.providerDiagnosticRefs,
              providerDiagnosticStatus: input.latest.providerDiagnosticStatus,
              domainResourcePacketRef: input.latest.resourcePacketRef,
              resourcePacketRef: input.latest.resourcePacketRef,
              consumerRefs: input.latest.contextBrokerConsumerNodeIds,
              dependentConsumers: input.latest.contextBrokerConsumerNodeIds,
              evidenceRefs: input.latest.evidenceProducedRefs,
              reasonCodes: input.latest.reasonCodes,
            },
          ]
        : [];

  return branches
    .map((branch) => ({
      branchId: bounded(branch.branchId, 180),
      nodeId: bounded(branch.nodeId, 260) ?? "",
      nodeKind: bounded(branch.nodeKind, 180),
      capabilityId: bounded(branch.capabilityId, 240),
      executorKey: bounded(branch.executorKey, 240),
      executionIntent: bounded(branch.executionIntent, 160),
      evidenceMode: boundedStrings(branch.evidenceMode, 12),
      targetCommitmentIds: boundedStrings(branch.targetCommitmentIds, 20),
      status: bounded(branch.status, 120),
      blockerSummary: bounded(branch.blockerSummary ?? branch.summary, 700),
      failureClass: bounded(branch.failureClass, 180),
      errorPath: bounded(branch.errorPath ?? branch.schemaPath, 260),
      repairAction: bounded(branch.repairAction, 360),
      nextTransition:
        bounded(branch.nextTransition, 260) ?? boundedStrings(branch.nextLegalTransitions, 1)[0] ?? null,
      readinessStateRef: bounded(branch.readinessStateRef ?? branch.readinessRef, 360),
      contractRef: bounded(branch.contractRef, 360),
      resourceRequirementRefs: boundedStrings(branch.resourceRequirementRefs, 20),
      nodeResourceDemandSessionRefs: [
        ...new Set([
          ...boundedStrings(branch.nodeResourceDemandSessionRefs, 20),
          bounded(branch.nodeResourceDemandSessionRef, 360),
        ].filter((ref): ref is string => Boolean(ref))),
      ].slice(0, 20),
      nodeResourceDemandStatus: bounded(branch.nodeResourceDemandStatus, 160),
      nodeResourceLedgerManifestRefs: [
        ...new Set([
          ...boundedStrings(branch.nodeResourceLedgerManifestRefs, 20),
          bounded(branch.nodeResourceLedgerManifestRef, 360),
        ].filter((ref): ref is string => Boolean(ref))),
      ].slice(0, 20),
      nodeResourceLedgerStatus: bounded(branch.nodeResourceLedgerStatus, 160),
      domainResourceSelectionRefs: [
        ...new Set([
          ...boundedStrings(branch.domainResourceSelectionRefs, 20),
          bounded(branch.domainResourceSelectionRef, 360),
        ].filter((ref): ref is string => Boolean(ref))),
      ].slice(0, 20),
      domainResourceSelectionStatus: bounded(branch.domainResourceSelectionStatus, 160),
      actionGateStatus: bounded(branch.actionGateStatus, 160),
      actionGateMissingFields: boundedStrings(branch.actionGateMissingFields, 20),
      providerDiagnosticRefs: [
        ...new Set([
          ...boundedStrings(branch.providerDiagnosticRefs, 20),
          bounded(branch.providerDiagnosticRef, 360),
        ].filter((ref): ref is string => Boolean(ref))),
      ].slice(0, 20),
      providerDiagnosticStatus: bounded(branch.providerDiagnosticStatus, 160),
      domainResourcePacketRef: bounded(branch.domainResourcePacketRef, 360),
      resourcePacketRef: bounded(branch.resourcePacketRef, 360),
      blockerCode: bounded(asRecord(branch.blocker)?.code ?? branch.blockerCode, 220),
      blockerSchemaPath: bounded(
        asRecord(branch.blocker)?.schemaPath ?? branch.blockerSchemaPath,
        260,
      ),
      blockerPolicyPath: bounded(
        asRecord(branch.blocker)?.policyPath ?? branch.blockerPolicyPath,
        260,
      ),
      blockerSignature: bounded(branch.blockerSignature, 180),
      consumerRefs: boundedStrings(branch.consumerRefs, 20),
      dependentConsumers: boundedStrings(branch.dependentConsumers, 20),
      siblingBranchIds: boundedStrings(branch.siblingBranchIds, 20),
      successfulEvidenceRefs: boundedStrings(branch.successfulEvidenceRefs, 20),
      failedEvidenceRefs: boundedStrings(branch.failedEvidenceRefs, 20),
      repairNodeRefs: boundedStrings(branch.repairNodeRefs, 20),
      diagnosticOnlyNodeRefs: boundedStrings(branch.diagnosticOnlyNodeRefs, 20),
      rootCauseRef: bounded(branch.rootCauseRef, 360),
      rootCauseSystemic: booleanOrNull(branch.rootCauseSystemic),
      evidenceRefs: [
        ...new Set([
          ...boundedStrings(branch.evidenceRefs, 20),
          ...boundedStrings(branch.successfulEvidenceRefs, 20),
          ...boundedStrings(branch.failedEvidenceRefs, 20),
        ]),
      ].slice(0, 20),
      reasonCodes: boundedStrings(branch.reasonCodes, 30),
    }))
    .filter((branch) => branch.nodeId.length > 0)
    .slice(0, 40);
}

function buildActiveFrontier(input: {
  graphId?: string | null;
  latest: Record<string, unknown>;
  terminalStatus?: string | null;
  processRunning?: boolean;
}): LatestRunActiveFrontier {
  const schedulerFrontier = asRecord(input.latest.schedulerFrontierState);
  const parallelFrontier = asRecord(input.latest.parallelFrontier);
  const noProgressSignature = asRecord(input.latest.noProgressSignature);
  const frontierRootCause = asRecord(input.latest.frontierRootCauseArtifact);
  const missionLedgerThrottle = asRecord(input.latest.missionLedgerEvaluationThrottle);
  const selectedNodeIds = boundedStrings(
    schedulerFrontier?.selectedExecutableNodeIds ?? parallelFrontier?.selectedNodeIds,
    80,
  );
  const runningNodeIds = boundedStrings(parallelFrontier?.runningNodeIds, 80);
  const completedNodeIds = boundedStrings(parallelFrontier?.completedNodeIds, 80);
  const blockedNodeIds = boundedStrings(
    schedulerFrontier?.blockedFrontierNodeIds ?? parallelFrontier?.blockedNodeIds,
    80,
  );
  const failedNodeIds = boundedStrings(parallelFrontier?.failedNodeIds, 80);
  const needsReviewNodeIds = boundedStrings(parallelFrontier?.needsReviewNodeIds, 80);
  const waitingForHumanNodeIds = boundedStrings(parallelFrontier?.waitingForHumanNodeIds, 80);
  const openCommitmentIds = boundedStrings(
    schedulerFrontier?.openCommitmentIds ?? noProgressSignature?.openCommitmentIds,
    80,
  );
  const hasFrontier = Boolean(
    schedulerFrontier ||
    parallelFrontier ||
    noProgressSignature ||
    selectedNodeIds.length ||
    runningNodeIds.length ||
    blockedNodeIds.length ||
    failedNodeIds.length ||
    needsReviewNodeIds.length,
  );
  const currentPhase = bounded(input.latest.currentPhase, 180);
  const blockerSummary = bounded(input.latest.blockerSummary, 700);
  const terminalStatus = bounded(input.terminalStatus, 180);
  const schedulerNextLegalTransition = bounded(schedulerFrontier?.nextLegalTransition, 180);
  const manifestFrontierStatus = explicitFrontierStatus(input.latest.frontierStatus);
  const finalizationSignal = Boolean(
    bounded(input.latest.finalizationState, 120) ||
      bounded(input.latest.closeoutFinalizationState, 120),
  );
  const branchStates = buildBranchStates({
    parallelFrontier,
    latest: input.latest,
    nodeId: bounded(input.latest.nodeId, 260),
    currentPhase,
    blockerSummary,
  });
  const status: LatestRunFrontierStatus = terminalStatus
    ? "terminal"
    : failedNodeIds.length > 0 || needsReviewNodeIds.length > 0 || noProgressSignature
      ? "needs_review"
      : blockedNodeIds.length > 0
        ? "blocked"
        : runningNodeIds.length > 0 || input.processRunning === true
          ? "running"
          : selectedNodeIds.length > 0
            ? "ready"
            : manifestFrontierStatus === "finalizing" || finalizationSignal
              ? "finalizing"
              : hasFrontier
                ? "planning"
                : "missing";
  const allBoundedCounts = [
    selectedNodeIds.length,
    runningNodeIds.length,
    completedNodeIds.length,
    blockedNodeIds.length,
    failedNodeIds.length,
    needsReviewNodeIds.length,
    waitingForHumanNodeIds.length,
    branchStates.length,
  ];
  return {
    state: hasFrontier ? "present" : "missing",
    status,
    graphId: bounded(input.graphId ?? input.latest.graphId, 260),
    currentSuperstep: numberOrNull(
      schedulerFrontier?.currentSuperstep ?? parallelFrontier?.currentSuperstep,
    ),
    selectedNodeIds,
    runningNodeIds,
    completedNodeIds,
    blockedNodeIds,
    failedNodeIds,
    needsReviewNodeIds,
    waitingForHumanNodeIds,
    openCommitmentIds,
    nextTransition: mapNextTransition(schedulerNextLegalTransition, status),
    schedulerNextLegalTransition,
    noProgress: {
      state: noProgressSignature ? "present" : "missing",
      signatureHash: bounded(noProgressSignature?.signatureHash, 180),
      repeatCount: numberOrNull(input.latest.noProgressRepeatCount),
      terminalBlockerCode: bounded(noProgressSignature?.terminalBlockerCode, 220),
      reasonCodes: boundedStrings(noProgressSignature?.blockerReasonCodes, 40),
    },
    rootCause: {
      state: frontierRootCause ? "present" : "missing",
      signatureHash: bounded(frontierRootCause?.signatureHash, 180),
      repeatCount: numberOrNull(frontierRootCause?.repeatCount),
      systemic: booleanOrNull(frontierRootCause?.systemic),
      recommendedRepairBoundary: bounded(frontierRootCause?.recommendedRepairBoundary, 220),
      affectedNodeIds: boundedStrings(frontierRootCause?.affectedNodeIds, 40),
      affectedBranchIds: boundedStrings(frontierRootCause?.affectedBranchIds, 40),
      successfulSiblingEvidenceRefs: boundedStrings(
        frontierRootCause?.successfulSiblingEvidenceRefs,
        20,
      ),
      missingFields: boundedStrings(frontierRootCause?.missingFields, 40),
      schemaErrorPaths: boundedStrings(frontierRootCause?.schemaErrorPaths, 20),
      policyErrorPaths: boundedStrings(frontierRootCause?.policyErrorPaths, 20),
      contractRefs: boundedStrings(frontierRootCause?.contractRefs, 20),
      domainResourcePacketKinds: boundedStrings(frontierRootCause?.domainResourcePacketKinds, 20),
      providerProfileIds: boundedStrings(frontierRootCause?.providerProfileIds, 20),
      nextLegalTransitions: boundedStrings(frontierRootCause?.nextLegalTransitions, 20),
      reasonCodes: boundedStrings(frontierRootCause?.reasonCodes, 40),
    },
    missionLedgerEvaluationThrottle: {
      state: missionLedgerThrottle ? "present" : "missing",
      nodeId: bounded(missionLedgerThrottle?.nodeId, 260),
      shouldEvaluate: booleanOrNull(missionLedgerThrottle?.shouldEvaluate),
      reasonCodes: boundedStrings(missionLedgerThrottle?.reasonCodes, 40),
    },
    counts: {
      selected: selectedNodeIds.length,
      running: runningNodeIds.length,
      completed: completedNodeIds.length,
      blocked: blockedNodeIds.length,
      failed: failedNodeIds.length,
      needsReview: needsReviewNodeIds.length,
      waitingForHuman: waitingForHumanNodeIds.length,
      branchStates: branchStates.length,
      truncated: allBoundedCounts.some((count) => count >= 40),
    },
    branchStates,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

function buildBoundaryReplayState(
  latest: Record<string, unknown>,
): LatestRunState["boundaryReplay"] {
  const artifactRefs = boundedStrings(latest.artifactRefs, 80);
  const checkpointRefs = [
    ...new Set(
      [
        ...artifactRefs.filter((ref) => ref.includes("/boundary-replay/")),
        ...boundedStrings(latest.boundaryReplayCheckpointRefs, 40),
        bounded(latest.boundaryReplayCheckpointRef, 700),
        bounded(latest.checkpointRef, 700),
      ].filter((ref): ref is string => Boolean(ref)),
    ),
  ].slice(0, 40);
  const graphCheckpointRefs = [
    ...new Set(
      [
        ...artifactRefs.filter((ref) => ref.startsWith("runtime-work-graph://checkpoint/")),
        ...boundedStrings(latest.boundaryReplayGraphCheckpointRefs, 40),
        bounded(latest.graphCheckpointRef, 700),
      ].filter((ref): ref is string => Boolean(ref)),
    ),
  ].slice(0, 40);
  const planRefs = [
    ...new Set(
      [
        ...artifactRefs.filter((ref) => ref.includes("/boundary-replay-plan/")),
        ...boundedStrings(latest.boundaryReplayPlanRefs, 20),
        bounded(latest.planRef, 700),
      ].filter((ref): ref is string => Boolean(ref)),
    ),
  ].slice(0, 20);
  const currentPhase = bounded(latest.currentPhase, 260);
  const latestCheckpointKind =
    bounded(latest.boundaryReplayCheckpointKind, 220) ??
    bounded(latest.checkpointKind, 220) ??
    (currentPhase?.startsWith("boundary_replay_")
      ? currentPhase.replace(/^boundary_replay_/u, "").slice(0, 220)
      : null);
  const state =
    latestCheckpointKind ||
    checkpointRefs.length > 0 ||
    graphCheckpointRefs.length > 0 ||
    planRefs.length > 0
      ? "present"
      : "missing";
  return {
    state,
    latestCheckpointKind,
    checkpointRefs,
    graphCheckpointRefs,
    planRefs,
    replayStartPolicy: bounded(latest.replayStartPolicy, 160),
    replaySafetyStatus: bounded(latest.replaySafetyStatus, 160),
    replayFreshnessStatus: bounded(latest.replayFreshnessStatus, 160),
    replayContinuationMode: bounded(latest.replayContinuationMode, 160),
    exactContinuationMode: bounded(latest.exactContinuationMode, 160),
    exactContinuationAction: bounded(latest.exactContinuationAction, 700),
    latestAcceptedCheckpointRef: bounded(latest.latestAcceptedCheckpointRef, 700),
    currentReplayBoundary: latestCheckpointKind,
    nextReplayBoundary: bounded(latest.nextReplayBoundary, 220),
    productionPathEquivalence: bounded(latest.productionPathEquivalence, 180),
    boundaryEpoch: bounded(latest.boundaryEpoch, 220),
    currentChildEpoch: bounded(latest.currentChildEpoch, 220),
    supersededChildCount:
      typeof latest.supersededChildCount === "number" ? latest.supersededChildCount : null,
    supersededChildNodeIds: boundedStrings(latest.supersededChildNodeIds, 80),
    proofClosureAllowed:
      typeof latest.proofClosureAllowed === "boolean" ? latest.proofClosureAllowed : null,
    resumeFromArtifactRefs: boundedStrings(latest.resumeFromArtifactRefs, 40),
    invalidReasonCodes: boundedStrings(latest.invalidReasonCodes, 40),
    reasonCodes: boundedStrings(latest.reasonCodes, 60),
  };
}

function heapPhaseSnapshotFrom(value: unknown): HeapPhaseSnapshot | null {
  const snapshot = asRecord(value);
  if (!snapshot) {
    return null;
  }
  return {
    artifactKind: "execution_platform.heap_phase_snapshot",
    schemaVersion: "execution-platform.heap-phase-snapshot.v1",
    snapshotRef:
      bounded(snapshot.snapshotRef, 600) ??
      bounded(snapshot.ref, 600) ??
      "heap-phase://execution-platform/unknown",
    phase: bounded(snapshot.phase, 180) ?? "unknown",
    gateKind: bounded(snapshot.gateKind, 180),
    graphId: bounded(snapshot.graphId, 260),
    nodeId: bounded(snapshot.nodeId, 260),
    branchId: bounded(snapshot.branchId, 260),
    heapUsedBytes: numberOrNull(snapshot.heapUsedBytes) ?? 0,
    heapTotalBytes: numberOrNull(snapshot.heapTotalBytes) ?? 0,
    rssBytes: numberOrNull(snapshot.rssBytes) ?? 0,
    externalBytes: numberOrNull(snapshot.externalBytes) ?? 0,
    arrayBuffersBytes: numberOrNull(snapshot.arrayBuffersBytes) ?? 0,
    graphNodeCount: numberOrNull(snapshot.graphNodeCount),
    graphEdgeCount: numberOrNull(snapshot.graphEdgeCount),
    activeBranchCount: numberOrNull(snapshot.activeBranchCount),
    largestMetadataBytes: numberOrNull(snapshot.largestMetadataBytes),
    largestMetadataRef: bounded(snapshot.largestMetadataRef, 600),
    largestArtifactBodyBytes: numberOrNull(snapshot.largestArtifactBodyBytes),
    largestArtifactBodyRef: bounded(snapshot.largestArtifactBodyRef, 600),
    latestRunStateMetadataBytes: numberOrNull(snapshot.latestRunStateMetadataBytes),
    schedulerProgressMetadataBytes: numberOrNull(snapshot.schedulerProgressMetadataBytes),
    workQueueProjectionMetadataBytes: numberOrNull(snapshot.workQueueProjectionMetadataBytes),
    providerRequestByteCount: numberOrNull(snapshot.providerRequestByteCount),
    reasonCodes: boundedStrings(snapshot.reasonCodes, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

function buildProofEnvironment(latest: Record<string, unknown>): LatestRunState["proofEnvironment"] {
  const explicitSnapshots = Array.isArray(latest.heapPhaseSnapshots)
    ? latest.heapPhaseSnapshots
    : Array.isArray(latest.proofEnvironmentHeapSnapshots)
      ? latest.proofEnvironmentHeapSnapshots
      : [];
  const heapPhaseSnapshots = [
    ...explicitSnapshots
      .map((snapshot) => heapPhaseSnapshotFrom(snapshot))
      .filter((snapshot): snapshot is HeapPhaseSnapshot => Boolean(snapshot)),
    ...(heapPhaseSnapshotFrom(latest.heapPhaseSnapshot)
      ? [heapPhaseSnapshotFrom(latest.heapPhaseSnapshot) as HeapPhaseSnapshot]
      : []),
  ].slice(0, 12);
  const observedLargestMetadataBytes = Math.max(
    0,
    ...heapPhaseSnapshots.map((snapshot) => snapshot.largestMetadataBytes ?? 0),
  );
  const observedLargestArtifactBodyBytes = Math.max(
    0,
    ...heapPhaseSnapshots.map((snapshot) => snapshot.largestArtifactBodyBytes ?? 0),
  );
  const observedProviderRequestMaxBytes = Math.max(
    0,
    ...heapPhaseSnapshots.map((snapshot) => snapshot.providerRequestByteCount ?? 0),
  );
  const largestMetadataBytes =
    numberOrNull(latest.largestMetadataBytes) ??
    (observedLargestMetadataBytes > 0 ? observedLargestMetadataBytes : null);
  const largestArtifactBodyBytes =
    numberOrNull(latest.largestArtifactBodyBytes) ??
    (observedLargestArtifactBodyBytes > 0 ? observedLargestArtifactBodyBytes : null);
  const providerRequestMaxBytes =
    numberOrNull(latest.providerRequestMaxBytes) ??
    (observedProviderRequestMaxBytes > 0 ? observedProviderRequestMaxBytes : null);
  const state =
    heapPhaseSnapshots.length > 0 ||
    largestMetadataBytes !== null ||
    largestArtifactBodyBytes !== null ||
    providerRequestMaxBytes !== null
      ? "present"
      : "missing";
  return {
    state,
    heapPhaseSnapshots,
    largestMetadataBytes,
    largestMetadataRef:
      bounded(latest.largestMetadataRef, 600) ??
      heapPhaseSnapshots.find((snapshot) => snapshot.largestMetadataRef)?.largestMetadataRef ??
      null,
    largestArtifactBodyBytes,
    largestArtifactBodyRef:
      bounded(latest.largestArtifactBodyRef, 600) ??
      heapPhaseSnapshots.find((snapshot) => snapshot.largestArtifactBodyRef)?.largestArtifactBodyRef ??
      null,
    latestRunStateMetadataBytes:
      numberOrNull(latest.latestRunStateMetadataBytes) ??
      heapPhaseSnapshots.find((snapshot) => snapshot.latestRunStateMetadataBytes !== null)
        ?.latestRunStateMetadataBytes ??
      null,
    schedulerProgressMetadataBytes:
      numberOrNull(latest.schedulerProgressMetadataBytes) ??
      heapPhaseSnapshots.find((snapshot) => snapshot.schedulerProgressMetadataBytes !== null)
        ?.schedulerProgressMetadataBytes ??
      null,
    workQueueProjectionMetadataBytes:
      numberOrNull(latest.workQueueProjectionMetadataBytes) ??
      heapPhaseSnapshots.find((snapshot) => snapshot.workQueueProjectionMetadataBytes !== null)
        ?.workQueueProjectionMetadataBytes ??
      null,
    providerRequestMaxBytes,
    reasonCodes: [
      ...new Set([
        ...boundedStrings(latest.proofEnvironmentReasonCodes, 40),
        ...heapPhaseSnapshots.flatMap((snapshot) => snapshot.reasonCodes),
      ]),
    ].slice(0, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

export function buildLatestRunState(input: {
  runtimeJobId?: string | null;
  workItemId?: string | null;
  promptHash?: string | null;
  promptRef?: string | null;
  promptLength?: number | null;
  processRunning?: boolean;
  terminalStatus?: string | null;
  adapterTerminalStatus?: string | null;
  retryState?: string | null;
  runtimeJob?: Record<string, unknown> | null;
  graphId?: string | null;
  latestProgress?: Record<string, unknown> | null;
  latestReasonCodes?: string[];
  latestArtifactRefs?: string[];
  totalWallMs?: number | null;
  phaseWallClock?: JsonValue;
  modelUsageByModel?: JsonValue;
  modelUsageByPhase?: JsonValue;
  missingUsageEventCount?: number | null;
  usageUnavailableReasons?: JsonValue;
  recommendedOperatorAction?: string | null;
  generatedAt?: string;
}): LatestRunState {
  const latest = input.latestProgress ?? {};
  const job = input.runtimeJob ?? {};
  const boundaryReplay = buildBoundaryReplayState(latest);
  const schedulerFrontier = asRecord(latest.schedulerFrontierState);
  const parallelFrontier = asRecord(latest.parallelFrontier);
  const rootCause = asRecord(latest.frontierRootCauseArtifact);
  const noProgress = asRecord(latest.noProgressSignature);
  const schedulerModelCallEnvelope = asRecord(latest.schedulerModelCallEnvelope);
  const proofEnvironment = buildProofEnvironment(latest);
  const activeFrontier = buildActiveFrontier({
    graphId: input.graphId,
    latest,
    terminalStatus: input.terminalStatus ?? input.adapterTerminalStatus,
    processRunning: input.processRunning,
  });
  const canonicalReadbackGate = buildCanonicalReadbackGate({
    graphId: input.graphId,
    progress: latest,
    schedulerFrontier,
    parallelFrontier,
    rootCause,
    noProgress,
    schedulerModelCallEnvelope,
    checkpointKind: boundaryReplay.latestCheckpointKind,
    terminalStatus: input.terminalStatus,
    adapterTerminalStatus: input.adapterTerminalStatus,
  });
  return {
    artifactKind: "execution_platform_latest_run_state",
    schemaVersion: "execution-platform.latest-run-state.v1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runtimeJobId: bounded(input.runtimeJobId, 260),
    workItemId: bounded(input.workItemId, 260),
    promptHash: bounded(input.promptHash, 140),
    promptRef: bounded(input.promptRef, 260),
    promptLength: numberOrNull(input.promptLength),
    process: {
      isRunning: input.processRunning === true,
      terminalStatus: bounded(input.terminalStatus, 180),
      adapterTerminalStatus: bounded(input.adapterTerminalStatus, 180),
      retryState: bounded(input.retryState, 180),
    },
    runtimeJob: {
      state: bounded(job.state, 120),
      attempts: numberOrNull(job.attempts),
      maxAttempts: numberOrNull(job.maxAttempts ?? job.max_attempts),
      workerId: bounded(job.workerId ?? job.worker_id, 180),
      startedAt: jobString(job.startedAt ?? job.started_at),
      completedAt: jobString(job.completedAt ?? job.completed_at),
    },
    current: {
      phase: bounded(latest.currentPhase, 180),
      schedulerPhase: bounded(latest.schedulerPhase, 180),
      stage: bounded(latest.stage, 180),
      graphId: bounded(input.graphId, 260),
      nodeId: bounded(latest.nodeId, 260),
      nodeKind: bounded(latest.activeNodeKind ?? latest.nodeKind, 180),
      workIntentId: bounded(latest.workIntentId ?? latest.workUnitId, 260),
      workIntentTitle: bounded(latest.workIntentTitle ?? latest.workUnitTitle, 500),
      executionIntent: bounded(latest.executionIntent, 160),
      evidenceMode: boundedStrings(latest.evidenceMode, 12),
      capabilityId: bounded(latest.capabilityId ?? latest.selectedCapabilityId, 240),
      executorKey: bounded(latest.executorKey ?? latest.selectedExecutorKey, 240),
      workerRef: bounded(latest.workerRef, 240),
      activeToolId: bounded(latest.schedulerToolId ?? latest.latestToolEventKind, 240),
      readinessStateRef: bounded(latest.nodeReadinessStateRef, 600),
      readinessStatus: bounded(latest.nodeReadinessStatus, 160),
      readinessProjectionStatus: bounded(latest.readinessProjectionStatus, 160),
      readinessProjectionDriftReasonCodes: boundedStrings(
        latest.readinessProjectionDriftReasonCodes,
        40,
      ),
      readinessProjectionMissingFields: boundedStrings(
        latest.readinessProjectionMissingFields,
        40,
      ),
      readinessStale:
        typeof latest.nodeReadinessStale === "boolean" ? latest.nodeReadinessStale : null,
      nodeResourceDemandSessionRefs: boundedStrings(latest.nodeResourceDemandSessionRefs, 20),
      nodeResourceDemandStatus: bounded(latest.nodeResourceDemandStatus, 160),
      nodeResourceLedgerManifestRefs: boundedStrings(latest.nodeResourceLedgerManifestRefs, 20),
      nodeResourceLedgerStatus: bounded(latest.nodeResourceLedgerStatus, 160),
      domainResourceSelectionRefs: boundedStrings(latest.domainResourceSelectionRefs, 20),
      domainResourceSelectionStatus: bounded(latest.domainResourceSelectionStatus, 160),
      actionGateStatus: bounded(latest.actionGateStatus, 160),
      actionGateMissingFields: boundedStrings(latest.actionGateMissingFields, 20),
      providerDiagnosticRefs: boundedStrings(latest.providerDiagnosticRefs, 20),
      providerDiagnosticStatus: bounded(latest.providerDiagnosticStatus, 160),
      schemaPath: bounded(latest.schemaPath ?? latest.errorPath, 260),
      policyPath: bounded(latest.policyPath, 260),
      roleId: bounded(latest.roleId, 180),
      modelRef: bounded(latest.modelRef ?? schedulerModelCallEnvelope?.modelRef, 240),
      providerPath: bounded(latest.providerPath ?? schedulerModelCallEnvelope?.providerPath, 240),
      modelTaskClass: bounded(
        latest.modelTaskClass ?? schedulerModelCallEnvelope?.modelTaskClass,
        120,
      ),
      modelPolicyRef: bounded(
        latest.modelPolicyRef ?? schedulerModelCallEnvelope?.modelPolicyRef,
        260,
      ),
      contractBoundaryId: bounded(
        latest.contractBoundaryId ?? schedulerModelCallEnvelope?.contractBoundaryId,
        180,
      ),
      modelPolicyBindingRef: bounded(
        latest.modelPolicyBindingRef ?? schedulerModelCallEnvelope?.modelPolicyBindingRef,
        260,
      ),
      reasoningMode: bounded(latest.reasoningMode ?? schedulerModelCallEnvelope?.reasoningMode, 80),
      parserMode: bounded(latest.parserMode ?? schedulerModelCallEnvelope?.parserMode, 80),
      proofCleanlinessState: bounded(
        latest.proofCleanlinessState ?? schedulerModelCallEnvelope?.proofCleanlinessState,
        80,
      ),
      objective: bounded(latest.objective ?? latest.currentObjective, 700),
      blockerSummary: bounded(latest.blockerSummary, 700),
      nextAction: bounded(latest.nextDecisionNeeded ?? latest.nextAction, 500),
      eli5: bounded(latest.eli5Progress ?? latest.eli5, 700),
      validationPhase: bounded(latest.validationPhase, 120),
      validationPhaseCompatibility: bounded(latest.validationPhaseCompatibility, 120),
      validationPhaseReasonCodes: boundedStrings(latest.validationPhaseReasonCodes, 12),
    },
    latestReasonCodes: boundedStrings(input.latestReasonCodes ?? latest.reasonCodes, 40),
    latestArtifactRefs: boundedStrings(input.latestArtifactRefs ?? latest.artifactRefs, 40),
    wallTime: {
      totalMs: numberOrNull(input.totalWallMs),
      byPhase: input.phaseWallClock ?? [],
    },
    modelUsage: {
      byModel: input.modelUsageByModel ?? [],
      byPhase: input.modelUsageByPhase ?? [],
      missingUsageEventCount: numberOrNull(input.missingUsageEventCount),
      usageUnavailableReasons: input.usageUnavailableReasons ?? [],
    },
    proofEnvironment,
    schedulerModelCallEnvelope: (schedulerModelCallEnvelope as JsonValue) ?? null,
    activeFrontier,
    graphPatch: {
      state: typeof latest.graphPatchRef === "string" ? "present" : "missing",
      ref: bounded(latest.graphPatchRef, 600),
      payloadRef: bounded(latest.graphPatchPayloadRef, 600),
      kind: bounded(latest.graphPatchKind, 180),
      byteCount: numberOrNull(latest.graphPatchByteCount),
      nodeCount: numberOrNull(latest.graphPatchNodeCount),
      edgeCount: numberOrNull(latest.graphPatchEdgeCount),
      affectedNodeIds: boundedStrings(latest.graphPatchAffectedNodeIds, 24),
      affectedBranchIds: boundedStrings(latest.graphPatchAffectedBranchIds, 24),
      reasonCodes: boundedStrings(latest.graphPatchReasonCodes, 24),
    },
    contextBroker: {
      state:
        boundedStrings(latest.resourceRequirementRefs, 24).length > 0 ||
        boundedStrings(latest.contextBrokerRequestRefs, 24).length > 0
          ? "present"
          : "missing",
      requirementRefs: boundedStrings(latest.resourceRequirementRefs, 24),
      requirementStatuses: boundedStrings(latest.resourceRequirementStatuses, 24),
      requirementReasonCodes: boundedStrings(latest.resourceRequirementReasonCodes, 40),
      requestRefs: boundedStrings(latest.contextBrokerRequestRefs, 24),
      statuses: boundedStrings(latest.contextBrokerStatuses, 24),
      consumerNodeIds: boundedStrings(latest.contextBrokerConsumerNodeIds, 24),
      nextTransition: bounded(latest.contextBrokerNextTransition, 180),
      reasonCodes: boundedStrings(latest.contextBrokerReasonCodes, 40),
    },
    resourceFrontier: {
      state:
        bounded(latest.resourceFrontierRequestRef, 600) ||
        bounded(latest.contextShardManifestRef, 600) ||
        bounded(latest.contextMergePacketRef, 600) ||
        bounded(latest.contextSingleUnitBlockerRef, 600)
          ? "present"
          : "missing",
      status: bounded(latest.resourceFrontierStatus, 180),
      requestRef: bounded(latest.resourceFrontierRequestRef, 600),
      shardManifestRef: bounded(latest.contextShardManifestRef, 600),
      shardCount: numberOrNull(latest.contextShardCount),
      shardUnitKind: bounded(latest.contextShardUnitKind, 180),
      mergePacketRef: bounded(latest.contextMergePacketRef, 600),
      singleUnitBlockerRef: bounded(latest.contextSingleUnitBlockerRef, 600),
      nextTransition:
        bounded(latest.contextMergePacketRef, 600)
          ? "execute_shards_then_merge_handoffs"
          : bounded(latest.contextSingleUnitBlockerRef, 600)
            ? "operator_review_single_unit_over_profile"
            : bounded(latest.resourceFrontierRequestRef, 600)
              ? "split_for_profile"
              : null,
    },
    expansionAdmission: {
      state:
        bounded(latest.expansionAdmissionDecisionRef, 600) ||
        bounded(latest.expansionAdmissionStatus, 120)
          ? "present"
          : "missing",
      decisionRef: bounded(latest.expansionAdmissionDecisionRef, 600),
      policyRef: bounded(latest.expansionAdmissionPolicyRef, 260),
      status: bounded(latest.expansionAdmissionStatus, 120),
      originalNodeCount: numberOrNull(latest.expansionAdmissionOriginalNodeCount),
      originalEdgeCount: numberOrNull(latest.expansionAdmissionOriginalEdgeCount),
      admittedNodeCount: numberOrNull(latest.expansionAdmissionAdmittedNodeCount),
      admittedEdgeCount: numberOrNull(latest.expansionAdmissionAdmittedEdgeCount),
      deferredNodeCount: numberOrNull(latest.expansionAdmissionDeferredNodeCount),
      deferredEdgeCount: numberOrNull(latest.expansionAdmissionDeferredEdgeCount),
      readyFrontierNodeIds: boundedStrings(latest.expansionAdmissionReadyFrontierNodeIds, 24),
      admittedNodeIds: boundedStrings(latest.expansionAdmissionAdmittedNodeIds, 24),
      deferredNodeIds: boundedStrings(latest.expansionAdmissionDeferredNodeIds, 24),
      nextTransition: bounded(latest.expansionAdmissionNextTransition, 180),
      prerequisiteCritical: booleanOrNull(latest.expansionAdmissionPrerequisiteCritical),
      reasonCodes: boundedStrings(latest.expansionAdmissionReasonCodes, 40),
    },
    boundaryReplay,
    canonicalReadbackGate,
    recommendedOperatorAction: bounded(input.recommendedOperatorAction, 700),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}
