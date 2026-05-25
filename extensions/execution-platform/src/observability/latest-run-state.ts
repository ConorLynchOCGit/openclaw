import type { JsonValue } from "../runtime-job-repository.ts";

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
    targetCommitmentIds: string[];
    status: string | null;
    blockerSummary: string | null;
    failureClass: string | null;
    errorPath: string | null;
    repairAction: string | null;
    nextTransition: string | null;
    readinessStateRef: string | null;
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
    roleId: string | null;
    modelRef: string | null;
    providerPath: string | null;
    objective: string | null;
    blockerSummary: string | null;
    nextAction: string | null;
    eli5: string | null;
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
    requestRefs: string[];
    statuses: string[];
    consumerNodeIds: string[];
    nextTransition: string | null;
    reasonCodes: string[];
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
    resumeFromArtifactRefs: string[];
    invalidReasonCodes: string[];
    reasonCodes: string[];
  };
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

function buildBranchStates(input: {
  parallelFrontier: Record<string, unknown> | null;
  latest: Record<string, unknown>;
  nodeId: string | null;
  currentPhase: string | null;
  blockerSummary: string | null;
}): LatestRunActiveFrontier["branchStates"] {
  const branchRecords = Array.isArray(input.parallelFrontier?.branchResults)
    ? input.parallelFrontier.branchResults
        .map((branch) => asRecord(branch))
        .filter((branch): branch is Record<string, unknown> => Boolean(branch))
    : [];
  const branches =
    branchRecords.length > 0
      ? branchRecords
      : input.nodeId
        ? [
            {
              branchId: bounded(input.latest.branchId, 180),
              nodeId: input.nodeId,
              nodeKind: input.latest.activeNodeKind,
              capabilityId: input.latest.capabilityId ?? input.latest.selectedCapabilityId,
              status: input.currentPhase,
              blockerSummary: input.blockerSummary,
              failureClass: input.latest.failureClass,
              errorPath: input.latest.errorPath ?? input.latest.schemaPath,
              repairAction:
                input.latest.nodeReadinessRepairAction ?? input.latest.nextDecisionNeeded,
              nextTransition: input.latest.nextDecisionNeeded,
              readinessStateRef: input.latest.nodeReadinessStateRef,
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
      targetCommitmentIds: boundedStrings(branch.targetCommitmentIds, 20),
      status: bounded(branch.status, 120),
      blockerSummary: bounded(branch.blockerSummary ?? branch.summary, 700),
      failureClass: bounded(branch.failureClass, 180),
      errorPath: bounded(branch.errorPath ?? branch.schemaPath, 260),
      repairAction: bounded(branch.repairAction, 360),
      nextTransition: bounded(branch.nextTransition, 260),
      readinessStateRef: bounded(branch.readinessStateRef, 360),
      evidenceRefs: boundedStrings(branch.evidenceRefs, 20),
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
            : currentPhase?.includes("closeout") || currentPhase?.includes("final")
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
    resumeFromArtifactRefs: boundedStrings(latest.resumeFromArtifactRefs, 40),
    invalidReasonCodes: boundedStrings(latest.invalidReasonCodes, 40),
    reasonCodes: boundedStrings(latest.reasonCodes, 60),
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
  const activeFrontier = buildActiveFrontier({
    graphId: input.graphId,
    latest,
    terminalStatus: input.terminalStatus ?? input.adapterTerminalStatus,
    processRunning: input.processRunning,
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
      roleId: bounded(latest.roleId, 180),
      modelRef: bounded(latest.modelRef, 240),
      providerPath: bounded(latest.providerPath, 240),
      objective: bounded(latest.objective ?? latest.currentObjective, 700),
      blockerSummary: bounded(latest.blockerSummary, 700),
      nextAction: bounded(latest.nextDecisionNeeded ?? latest.nextAction, 500),
      eli5: bounded(latest.eli5Progress ?? latest.eli5, 700),
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
      state: boundedStrings(latest.contextBrokerRequestRefs, 24).length > 0 ? "present" : "missing",
      requestRefs: boundedStrings(latest.contextBrokerRequestRefs, 24),
      statuses: boundedStrings(latest.contextBrokerStatuses, 24),
      consumerNodeIds: boundedStrings(latest.contextBrokerConsumerNodeIds, 24),
      nextTransition: bounded(latest.contextBrokerNextTransition, 180),
      reasonCodes: boundedStrings(latest.contextBrokerReasonCodes, 40),
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
    boundaryReplay: buildBoundaryReplayState(latest),
    recommendedOperatorAction: bounded(input.recommendedOperatorAction, 700),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}
