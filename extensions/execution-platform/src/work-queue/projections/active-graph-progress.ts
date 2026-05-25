import { runtimeExecutionSpanReadback } from "../../observability/runtime-execution-span.ts";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobEvent,
} from "../../runtime-job-repository.ts";
import { projectBoundaryReplayReadback } from "./boundary-replay-readback.ts";
import { projectModelCallProgress } from "./model-usage-walltime.ts";
import {
  asRecord,
  booleanValue,
  eventDataRecord,
  latestArtifact,
  numberValue,
  stringArrayValue,
  stringValue,
} from "./projection-utils.ts";
import { projectWorkerInternalProgress } from "./worker-internal-progress.ts";

export function activeGraphProgressReadback(
  events: RuntimeJobEvent[],
  artifacts: RuntimeJobArtifact[],
) {
  const progressEvents = events.filter(
    (event) => event.eventType === "agent_team.scheduler_progress",
  );
  const terminal = progressEvents.findLast((event) => {
    const eventData = eventDataRecord(event);
    return Boolean(
      stringValue(eventData.finalizationState) ??
      (stringValue(eventData.currentPhase) === "scheduler_terminal" ? "scheduler_terminal" : null),
    );
  });
  const latest = terminal ?? progressEvents.at(-1);
  const data = eventDataRecord(latest);
  const latestNodeProgress = progressEvents.findLast((event) => {
    const record = eventDataRecord(event);
    return Boolean(
      stringValue(record.nodeId) &&
      (stringValue(record.currentObjective) ||
        stringValue(record.whyThisNodeWasChosen) ||
        stringValue(record.activeNodeKind) ||
        stringValue(record.modelRef) ||
        stringArrayValue(record.targetRefs, 1).length > 0),
    );
  });
  const nodeData = eventDataRecord(latestNodeProgress);
  const collect = (key: string, maxItems: number): string[] =>
    [
      ...new Set(
        progressEvents.flatMap((event) => {
          const value = eventDataRecord(event)[key];
          return [
            ...(typeof value === "string" && value ? [value] : []),
            ...stringArrayValue(value, maxItems),
          ];
        }),
      ),
    ].slice(0, maxItems);
  const latestStringArray = (key: string, maxItems: number): string[] =>
    stringArrayValue(data[key], maxItems);
  const collectedString = (key: string): string | null => {
    for (let index = progressEvents.length - 1; index >= 0; index -= 1) {
      const value = stringValue(eventDataRecord(progressEvents[index]!)[key]);
      if (value) {
        return value;
      }
    }
    return null;
  };
  const collectedNumber = (key: string): number | null => {
    for (let index = progressEvents.length - 1; index >= 0; index -= 1) {
      const value = numberValue(eventDataRecord(progressEvents[index]!)[key]);
      if (value !== null) {
        return value;
      }
    }
    return null;
  };
  const collectedBoolean = (key: string): boolean | null => {
    for (let index = progressEvents.length - 1; index >= 0; index -= 1) {
      const value = booleanValue(eventDataRecord(progressEvents[index]!)[key]);
      if (value !== null) {
        return value;
      }
    }
    return null;
  };
  const latestEvidenceClaims = Array.isArray(data.evidenceClaims)
    ? data.evidenceClaims
        .map((claim) => asRecord(claim))
        .filter((claim): claim is Record<string, unknown> => Boolean(claim))
        .map((claim) => ({
          evidenceClaimId: stringValue(claim.evidenceClaimId) ?? "",
          commitmentId: stringValue(claim.commitmentId) ?? "",
          evidenceKind: stringValue(claim.evidenceKind) ?? "unknown",
          evidenceRef: stringValue(claim.evidenceRef) ?? "",
          claimSummary: stringValue(claim.claimSummary) ?? "",
          producedByNodeId: stringValue(claim.producedByNodeId) ?? "",
          producedByCapabilityId: stringValue(claim.producedByCapabilityId),
          producedByExecutorKey: stringValue(claim.producedByExecutorKey),
          validationRefs: stringArrayValue(claim.validationRefs, 8),
          changedFileRefs: stringArrayValue(claim.changedFileRefs, 8),
          limitations: stringArrayValue(claim.limitations, 8),
        }))
        .filter((claim) => claim.evidenceClaimId.length > 0 && claim.evidenceRef.length > 0)
        .slice(0, 20)
    : [];
  const reasonCodes = collect("reasonCodes", 60);
  const workerToolIds = [
    ...new Set(
      [
        ...collect("workerToolIds", 40),
        ...collect("toolIds", 40),
        ...reasonCodes
          .map((code) => code.match(/^scheduler_tool_invoked:(worker\.[a-z0-9_.:-]+)$/u)?.[1])
          .filter((toolId): toolId is string => Boolean(toolId)),
      ].filter((toolId) => toolId.startsWith("worker.")),
    ),
  ].slice(0, 20);
  const latestWorkerToolId =
    typeof data.schedulerToolId === "string" && data.schedulerToolId.startsWith("worker.")
      ? data.schedulerToolId
      : (workerToolIds.at(-1) ?? null);
  const latestCommitmentPacketData = eventDataRecord(
    progressEvents.findLast((event) => {
      const record = eventDataRecord(event);
      return (
        stringValue(record.schedulerToolId) === "scheduler.draft_commitment_work_breakdown" &&
        Array.isArray(record.commitmentWorkPacketSummaries)
      );
    }),
  );
  const commitmentWorkPackets = Array.isArray(
    latestCommitmentPacketData.commitmentWorkPacketSummaries,
  )
    ? latestCommitmentPacketData.commitmentWorkPacketSummaries
        .map((packet) => asRecord(packet))
        .filter((packet): packet is Record<string, unknown> => Boolean(packet))
        .map((packet) => ({
          packetRef: stringValue(packet.packetRef) ?? "",
          commitmentId: stringValue(packet.commitmentId) ?? "unknown",
          authoringSource: stringValue(packet.authoringSource) ?? "unknown",
          qualityStatus: stringValue(packet.qualityStatus) ?? "unknown",
          workerObjective: stringValue(packet.workerObjective),
          contextScoutObjective: stringValue(packet.contextScoutObjective),
          implementationObjective: stringValue(packet.implementationObjective),
          acceptanceCriteriaCount: numberValue(packet.acceptanceCriteriaCount),
          acceptanceCriteria: stringArrayValue(packet.acceptanceCriteria, 6),
          expectedEvidenceKinds: stringArrayValue(packet.expectedEvidenceKinds, 8),
          likelyRepoAreas: stringArrayValue(packet.likelyRepoAreas, 8),
          requiredContextQuestions: stringArrayValue(packet.requiredContextQuestions, 6),
          downstreamConsumer: stringValue(packet.downstreamConsumer),
        }))
        .filter((packet) => packet.packetRef.length > 0)
        .slice(0, 30)
    : [];
  const latestValidationQaData = eventDataRecord(
    progressEvents.findLast((event) => {
      const record = eventDataRecord(event);
      return (
        stringArrayValue(record.validationQaToolInvocationRefs, 1).length > 0 ||
        stringArrayValue(record.validationQaEvidencePacketRefs, 1).length > 0 ||
        stringValue(record.currentValidationCommandRef) ||
        stringArrayValue(record.validationCommandSummaries, 1).length > 0
      );
    }),
  );
  const latestValidationQaState = stringValue(latestValidationQaData.validationState);
  const validationQaToolInvocationRefs = collect("validationQaToolInvocationRefs", 30);
  const validationQaEvidencePacketRefs = collect("validationQaEvidencePacketRefs", 20);
  const latestCloseoutFinalizationData = eventDataRecord(
    progressEvents.findLast((event) => {
      const record = eventDataRecord(event);
      return (
        stringValue(record.closeoutFinalizationState) ||
        stringArrayValue(record.closeoutFinalizationEvidencePacketRefs, 1).length > 0 ||
        stringArrayValue(record.closeoutFinalizationToolInvocationRefs, 1).length > 0
      );
    }),
  );
  const closeoutFinalizationEvidencePacketRefs = collect(
    "closeoutFinalizationEvidencePacketRefs",
    20,
  );
  const closeoutFinalizationToolInvocationRefs = collect(
    "closeoutFinalizationToolInvocationRefs",
    30,
  );
  const closeoutFinalizationState =
    stringValue(latestCloseoutFinalizationData.closeoutFinalizationState) ??
    stringValue(data.closeoutFinalizationState);
  const latestRunArtifact = latestArtifact(artifacts, "execution_platform.latest_run_state");
  const latestRunStateMetadata = asRecord(latestRunArtifact?.metadata);
  const latestRunCurrent = asRecord(latestRunStateMetadata?.current);
  const latestRunProcess = asRecord(latestRunStateMetadata?.process);
  const latestRunFrontier = asRecord(latestRunStateMetadata?.activeFrontier);
  const latestRunGraphPatch = asRecord(latestRunStateMetadata?.graphPatch);
  const latestRunBoundaryReplay = asRecord(latestRunStateMetadata?.boundaryReplay);
  const boundaryCheckpointProgressEvents = progressEvents.filter((event) => {
    const record = eventDataRecord(event);
    return (
      stringValue(record.stage) === "boundary_replay_checkpoint" ||
      (stringValue(record.currentPhase) ?? "").startsWith("boundary_replay_")
    );
  });
  const boundaryCheckpointEvents = events.filter(
    (event) => event.eventType === "execution.boundary_replay_checkpoint",
  );
  const boundaryPlanEvents = events.filter(
    (event) => event.eventType === "execution.boundary_replay_plan",
  );
  const latestBoundaryData = eventDataRecord(
    boundaryCheckpointEvents.at(-1) ?? boundaryCheckpointProgressEvents.at(-1),
  );
  const latestBoundaryProgressData = eventDataRecord(boundaryCheckpointProgressEvents.at(-1));
  const latestBoundaryPlanData = eventDataRecord(boundaryPlanEvents.at(-1));
  const boundaryReplayCheckpointRefs = [
    ...new Set(
      [
        ...boundaryCheckpointProgressEvents.flatMap((event) =>
          stringArrayValue(eventDataRecord(event).artifactRefs, 20),
        ),
        ...boundaryCheckpointEvents
          .map((event) => stringValue(eventDataRecord(event).checkpointRef))
          .filter((ref): ref is string => Boolean(ref)),
        ...stringArrayValue(latestRunBoundaryReplay?.checkpointRefs, 40),
      ].filter((ref) => ref.includes("/boundary-replay/")),
    ),
  ].slice(0, 40);
  const boundaryReplayGraphCheckpointRefs = [
    ...new Set(
      [
        ...boundaryCheckpointProgressEvents.flatMap((event) =>
          stringArrayValue(eventDataRecord(event).artifactRefs, 20),
        ),
        ...boundaryCheckpointEvents
          .map((event) => stringValue(eventDataRecord(event).graphCheckpointRef))
          .filter((ref): ref is string => Boolean(ref)),
        ...stringArrayValue(latestRunBoundaryReplay?.graphCheckpointRefs, 40),
      ].filter((ref) => ref.startsWith("runtime-work-graph://checkpoint/")),
    ),
  ].slice(0, 40);
  const boundaryReplayPlanRefs = [
    ...new Set([
      ...boundaryPlanEvents
        .map((event) => stringValue(eventDataRecord(event).planRef))
        .filter((ref): ref is string => Boolean(ref)),
      ...stringArrayValue(latestRunBoundaryReplay?.planRefs, 20),
    ]),
  ].slice(0, 20);
  const latestBoundaryCheckpointKind =
    stringValue(latestBoundaryData.checkpointKind) ??
    stringValue(latestRunBoundaryReplay?.latestCheckpointKind) ??
    (stringValue(latestBoundaryProgressData.currentPhase)?.startsWith("boundary_replay_")
      ? (stringValue(latestBoundaryProgressData.currentPhase)?.replace(/^boundary_replay_/u, "") ??
        null)
      : null);
  const latestModelCallData = eventDataRecord(
    progressEvents.findLast((event) => {
      const record = eventDataRecord(event);
      return Boolean(stringValue(record.modelCallSpanId));
    }),
  );
  const latestWorkerInternalData = eventDataRecord(
    progressEvents.findLast((event) => {
      const record = eventDataRecord(event);
      const phase = stringValue(record.currentPhase) ?? "";
      return (
        stringValue(record.stage) === "non_codex_worker_loop" ||
        phase.startsWith("worker.") ||
        stringArrayValue(record.workerPhaseRefs, 1).length > 0 ||
        stringArrayValue(record.workerInternalInputPacketRefs, 1).length > 0 ||
        stringValue(record.workerInternalToolStatus)
      );
    }),
  );
  const spanProgress = runtimeExecutionSpanReadback({
    events,
    maxRecentSpans: 16,
  });
  const latestRepairClassification = asRecord(
    eventDataRecord(
      progressEvents.findLast((event) => {
        const classification = asRecord(eventDataRecord(event).repairClassification);
        return Boolean(classification);
      }),
    ).repairClassification,
  );
  const latestParallelFrontierData = asRecord(
    eventDataRecord(
      progressEvents.findLast((event) => {
        const frontier = asRecord(eventDataRecord(event).parallelFrontier);
        return Boolean(frontier);
      }),
    ).parallelFrontier,
  );
  const frontierStringArray = (key: string, maxItems: number): string[] =>
    latestParallelFrontierData ? stringArrayValue(latestParallelFrontierData[key], maxItems) : [];
  const latestSchedulerFrontierData = asRecord(
    eventDataRecord(
      progressEvents.findLast((event) => {
        const frontier = asRecord(eventDataRecord(event).schedulerFrontierState);
        return Boolean(frontier);
      }),
    ).schedulerFrontierState,
  );
  const schedulerFrontierStringArray = (key: string, maxItems: number): string[] =>
    latestSchedulerFrontierData ? stringArrayValue(latestSchedulerFrontierData[key], maxItems) : [];
  const latestNoProgressData = asRecord(
    eventDataRecord(
      progressEvents.findLast((event) => {
        const signature = asRecord(eventDataRecord(event).noProgressSignature);
        return Boolean(signature);
      }),
    ).noProgressSignature,
  );
  const noProgressStringArray = (key: string, maxItems: number): string[] =>
    latestNoProgressData ? stringArrayValue(latestNoProgressData[key], maxItems) : [];
  const latestMissionLedgerThrottleData = asRecord(
    eventDataRecord(
      progressEvents.findLast((event) => {
        const throttle = asRecord(eventDataRecord(event).missionLedgerEvaluationThrottle);
        return Boolean(throttle);
      }),
    ).missionLedgerEvaluationThrottle,
  );
  const schedulerToolId = stringValue(data.schedulerToolId);
  const codeIntelligenceToolIds = [
    ...new Set(
      [
        ...collect("codeIntelligenceToolIds", 40),
        ...collect("codeIntelligenceToolId", 40),
        ...collect("toolIds", 40),
        stringValue(data.codeIntelligenceToolId),
        schedulerToolId?.startsWith("code.") ? schedulerToolId : null,
        ...reasonCodes
          .map((code) => code.match(/^scheduler_tool_invoked:(code\.[a-z0-9_.:-]+)$/u)?.[1])
          .filter((toolId): toolId is string => Boolean(toolId)),
      ].filter(
        (toolId): toolId is string => typeof toolId === "string" && toolId.startsWith("code."),
      ),
    ),
  ].slice(0, 20);
  const codeIntelligenceResultRefs = collect("codeIntelligenceResultRefs", 40);
  const codeIntelligenceDiagnosticRefs = collect("codeIntelligenceDiagnosticRefs", 40);
  const codeIntelligenceState =
    codeIntelligenceResultRefs.length > 0 ||
    collect("codeIntelligenceSymbolRefs", 1).length > 0 ||
    codeIntelligenceDiagnosticRefs.length > 0
      ? collect("codeIntelligenceNeedsReviewRefs", 1).length > 0
        ? "needs_review"
        : "present"
      : "missing";
  const frontierConflictDomains = Array.isArray(latestParallelFrontierData?.conflictDomains)
    ? latestParallelFrontierData.conflictDomains
        .map((domain) => asRecord(domain))
        .filter((domain): domain is Record<string, unknown> => Boolean(domain))
        .map((domain) => ({
          nodeId: stringValue(domain.nodeId) ?? "",
          keys: stringArrayValue(domain.keys, 12),
        }))
        .filter((domain) => domain.nodeId.length > 0)
        .slice(0, 30)
    : [];
  const frontierProviderConcurrencyBudgets = Array.isArray(
    latestParallelFrontierData?.providerConcurrencyBudgets,
  )
    ? latestParallelFrontierData.providerConcurrencyBudgets
        .map((budget) => asRecord(budget))
        .filter((budget): budget is Record<string, unknown> => Boolean(budget))
        .map((budget) => ({
          key: stringValue(budget.key) ?? "",
          limit: numberValue(budget.limit),
          runnableNodeIds: stringArrayValue(budget.runnableNodeIds, 40),
          selectedNodeIds: stringArrayValue(budget.selectedNodeIds, 40),
          skippedNodeIds: stringArrayValue(budget.skippedNodeIds, 40),
        }))
        .filter((budget) => budget.key.length > 0)
        .slice(0, 20)
    : [];
  const frontierBranchResults = Array.isArray(latestParallelFrontierData?.branchResults)
    ? latestParallelFrontierData.branchResults
        .map((branch) => asRecord(branch))
        .filter((branch): branch is Record<string, unknown> => Boolean(branch))
        .map((branch) => ({
          superstepId: stringValue(branch.superstepId),
          branchId: stringValue(branch.branchId),
          nodeId: stringValue(branch.nodeId) ?? "",
          nodeKind: stringValue(branch.nodeKind),
          capabilityId: stringValue(branch.capabilityId),
          targetCommitmentIds: stringArrayValue(branch.targetCommitmentIds, 24),
          status: stringValue(branch.status),
          failureClass: stringValue(branch.failureClass),
          errorPath: stringValue(branch.errorPath),
          blockerSummary: stringValue(branch.blockerSummary ?? branch.errorSummary),
          repairAction: stringValue(branch.repairAction),
          nextTransition: stringValue(branch.nextTransition),
          evidenceRefs: stringArrayValue(branch.evidenceRefs, 40),
          readinessStateRef: stringValue(branch.readinessStateRef),
          reasonCodes: stringArrayValue(branch.reasonCodes, 40),
        }))
        .filter((branch) => branch.nodeId.length > 0)
        .slice(0, 40)
    : [];
  const latestRunNoProgress = asRecord(latestRunFrontier?.noProgress);
  const latestRunThrottle = asRecord(latestRunFrontier?.missionLedgerEvaluationThrottle);
  const latestRunBranchStates = Array.isArray(latestRunFrontier?.branchStates)
    ? latestRunFrontier.branchStates
        .map((branch) => asRecord(branch))
        .filter((branch): branch is Record<string, unknown> => Boolean(branch))
        .map((branch) => ({
          branchId: stringValue(branch.branchId),
          nodeId: stringValue(branch.nodeId) ?? "",
          status: stringValue(branch.status),
          blockerSummary: stringValue(branch.blockerSummary),
          errorPath: stringValue(branch.errorPath),
          readinessStateRef: stringValue(branch.readinessStateRef),
          reasonCodes: stringArrayValue(branch.reasonCodes, 20),
        }))
        .filter((branch) => branch.nodeId.length > 0)
        .slice(0, 30)
    : [];
  const latestRunSelectedNodeIds = latestRunFrontier
    ? stringArrayValue(latestRunFrontier.selectedNodeIds, 80)
    : [];
  const latestRunRunningNodeIds = latestRunFrontier
    ? stringArrayValue(latestRunFrontier.runningNodeIds, 80)
    : [];
  const latestRunBlockedNodeIds = latestRunFrontier
    ? stringArrayValue(latestRunFrontier.blockedNodeIds, 80)
    : [];
  const sameStringSet = (left: string[], right: string[]): boolean =>
    left.length === right.length && left.every((value) => right.includes(value));
  const compareStringSets = (observed: string[], expected: string[]): boolean | null =>
    latestRunArtifact
      ? expected.length > 0 || observed.length > 0
        ? sameStringSet(observed, expected)
        : null
      : null;
  const graphId = stringValue(data.graphId) ?? stringValue(nodeData.graphId);
  const latestRunGraphId =
    stringValue(latestRunFrontier?.graphId) ?? stringValue(latestRunCurrent?.graphId);
  const schedulerNextTransition = latestSchedulerFrontierData
    ? stringValue(latestSchedulerFrontierData.nextLegalTransition)
    : null;
  const latestPacketAuthorFanout = asRecord(data.packetAuthorFanout) ?? {};
  const latestPacketAuthorFanoutPresent = Object.keys(latestPacketAuthorFanout).length > 0;
  const normalizeTransition = (value: string | null): string | null =>
    value === "execute_frontier" ? "run_frontier" : value;
  const contextBrokerRequestRefs = collect("contextBrokerRequestRefs", 40);
  const contextBrokerStatuses = collect("contextBrokerStatuses", 40);
  const latestRunAgreementReasonCodes = [
    ...(latestRunArtifact ? [] : ["latest_run_state_missing"]),
    ...(latestRunArtifact && graphId && latestRunGraphId && graphId !== latestRunGraphId
      ? ["latest_run_state_graph_mismatch"]
      : []),
    ...(latestRunArtifact &&
    !sameStringSet(
      latestRunSelectedNodeIds,
      latestSchedulerFrontierData
        ? schedulerFrontierStringArray("selectedExecutableNodeIds", 80)
        : frontierStringArray("selectedNodeIds", 80),
    )
      ? ["latest_run_state_selected_nodes_mismatch"]
      : []),
    ...(latestRunArtifact &&
    !sameStringSet(
      latestRunBlockedNodeIds,
      latestSchedulerFrontierData
        ? schedulerFrontierStringArray("blockedFrontierNodeIds", 80)
        : frontierStringArray("blockedNodeIds", 80),
    )
      ? ["latest_run_state_blocked_nodes_mismatch"]
      : []),
    ...(latestRunArtifact &&
    normalizeTransition(stringValue(latestRunFrontier?.schedulerNextLegalTransition)) !==
      normalizeTransition(schedulerNextTransition)
      ? ["latest_run_state_next_transition_mismatch"]
      : []),
  ];
  return {
    state: latest || latestRunArtifact ? "present" : "missing",
    graphId,
    activeNodeId: stringValue(nodeData.nodeId) ?? stringValue(data.nodeId),
    activeNodeKind: stringValue(nodeData.activeNodeKind) ?? stringValue(data.activeNodeKind),
    roleId: stringValue(nodeData.roleId) ?? stringValue(data.roleId),
    modelRef: stringValue(nodeData.modelRef) ?? stringValue(data.modelRef),
    objective: stringValue(nodeData.currentObjective) ?? stringValue(data.currentObjective),
    whySelected:
      stringValue(nodeData.whyThisNodeWasChosen) ?? stringValue(data.whyThisNodeWasChosen),
    targetRefs: collect("targetRefs", 12),
    inputHandoffRefs: collect("inputHandoffRefs", 12),
    expectedOutput: stringValue(nodeData.expectedOutput) ?? stringValue(data.expectedOutput),
    currentPhase: stringValue(data.currentPhase) ?? stringValue(data.stage),
    validationState: stringValue(data.validationState),
    evidenceProducedRefs: collect("evidenceProducedRefs", 12),
    evidenceClaimRefs: collect("evidenceClaimRefs", 20),
    genericNodeExecutionResultRefs: collect("genericNodeExecutionResultRefs", 20),
    evidenceClaims: latestEvidenceClaims,
    acceptedCommitmentIds: latestStringArray("acceptedCommitmentIds", 12),
    rejectedCommitmentIds: latestStringArray("rejectedCommitmentIds", 12),
    openCommitmentIds: latestStringArray("remainingOpenCommitmentIds", 12),
    nextDecisionNeeded: stringValue(data.nextDecisionNeeded),
    blockerSummary: stringValue(data.blockerSummary),
    finalizationState: stringValue(data.finalizationState),
    latestToolEventKind: stringValue(data.latestToolEventKind),
    eli5Progress: stringValue(data.eli5Progress),
    budget: {
      policyRef: stringValue(data.budgetPolicyRef) ?? stringValue(nodeData.budgetPolicyRef),
      budgetClass: stringValue(data.budgetClass) ?? stringValue(nodeData.budgetClass),
      runtimeToolTimeoutMs:
        numberValue(data.runtimeToolTimeoutMs) ?? numberValue(nodeData.runtimeToolTimeoutMs),
      modelCallTimeoutMs:
        numberValue(data.modelCallTimeoutMs) ?? numberValue(nodeData.modelCallTimeoutMs),
      workerLoopTurnTimeoutMs:
        numberValue(data.workerLoopTurnTimeoutMs) ?? numberValue(nodeData.workerLoopTurnTimeoutMs),
      validationCommandTimeoutMs:
        numberValue(data.validationCommandTimeoutMs) ??
        numberValue(nodeData.validationCommandTimeoutMs),
      progressEmissionIntervalMs:
        numberValue(data.progressEmissionIntervalMs) ??
        numberValue(nodeData.progressEmissionIntervalMs),
      staleProgressAfterMs:
        numberValue(data.staleProgressAfterMs) ?? numberValue(nodeData.staleProgressAfterMs),
      leaseTimeoutMs: numberValue(data.leaseTimeoutMs) ?? numberValue(nodeData.leaseTimeoutMs),
      leaseHeartbeatMs:
        numberValue(data.leaseHeartbeatMs) ?? numberValue(nodeData.leaseHeartbeatMs),
      elapsedMs: numberValue(data.elapsedMs) ?? numberValue(nodeData.elapsedMs),
      budgetRemainingMs:
        numberValue(data.budgetRemainingMs) ?? numberValue(nodeData.budgetRemainingMs),
      heartbeatState: stringValue(data.heartbeatState) ?? stringValue(nodeData.heartbeatState),
    },
    sourcePrompt: {
      promptHash: stringValue(data.sourcePromptHash),
      promptLength: numberValue(data.sourcePromptLength),
      resolutionStatus: stringValue(data.sourcePromptResolutionStatus),
      sectionRefs: collect("sourcePromptSectionRefs", 20),
      excerptRequestRefs: collect("sourcePromptExcerptRequestRefs", 20),
      excerptProvidedRefs: collect("sourcePromptExcerptProvidedRefs", 20),
      excerptDeniedRefs: collect("sourcePromptExcerptDeniedRefs", 20),
    },
    contextFreshness: {
      state:
        stringValue(data.contextFreshnessStatus) === "fresh" ||
        stringValue(data.contextFreshnessStatus) === "stale" ||
        stringValue(data.contextFreshnessStatus) === "missing" ||
        stringValue(data.contextFreshnessStatus) === "rejected" ||
        stringValue(data.contextFreshnessStatus) === "unknown"
          ? (stringValue(data.contextFreshnessStatus) as
              | "fresh"
              | "stale"
              | "missing"
              | "rejected"
              | "unknown")
          : collect("missingContextSnapshotRefs", 1).length > 0
            ? "missing"
            : collect("staleContextSnapshotRefs", 1).length > 0
              ? "stale"
              : collect("rejectedContextSnapshotRefs", 1).length > 0
                ? "rejected"
                : collect("contextSnapshotRefs", 1).length > 0
                  ? "fresh"
                  : "unknown",
      refreshAction: stringValue(data.contextRefreshAction),
      contextSnapshotRefs: collect("contextSnapshotRefs", 40),
      staleContextSnapshotRefs: collect("staleContextSnapshotRefs", 40),
      missingContextSnapshotRefs: collect("missingContextSnapshotRefs", 40),
      rejectedContextSnapshotRefs: collect("rejectedContextSnapshotRefs", 40),
      sourcePromptHash: stringValue(data.sourcePromptHash),
      repoRevision: stringValue(data.repoRevision),
      worktreeFingerprint: stringValue(data.worktreeFingerprint),
      freshnessSummary: stringValue(data.contextFreshnessSummary),
      blockingContextReason:
        stringValue(data.currentPhase) === "context_freshness_blocked"
          ? stringValue(data.blockerSummary)
          : null,
    },
    contextScout: {
      qualityState: stringValue(data.contextQualityState),
      verifiedFileRefs: collect("verifiedContextFileRefs", 30),
      handoffPacketRefs: collect("contextHandoffPacketRefs", 20),
      toolLoopRefs: collect("contextScoutToolLoopRefs", 20),
      runtimeToolInvocationRefs: collect("contextScoutRuntimeToolInvocationRefs", 40),
      executionPacketRefs: collect("contextScoutExecutionPacketRefs", 20),
      executionPacketInputBytes: numberValue(data.contextScoutExecutionPacketInputBytes),
      executionPacketMaxInputBytes: numberValue(data.contextScoutExecutionPacketMaxInputBytes),
      providerTimeoutMs: numberValue(data.contextScoutProviderTimeoutMs),
      packetCompileStatus: stringValue(data.contextScoutPacketCompileStatus),
      packetCompileReasonCodes: collect("contextScoutPacketCompileReasonCodes", 20),
      rejectedRefs: collect("contextScoutRejectedRefs", 20),
      sufficiencySummary: stringValue(data.contextScoutSufficiencySummary),
      synthesisReadiness: stringValue(data.contextScoutSynthesisReadiness),
      synthesisBlockers: collect("contextScoutSynthesisBlockers", 20),
      repoAnalysisFindingCount: numberValue(data.contextScoutRepoAnalysisFindingCount),
      symbolRefs: collect("contextScoutSymbolRefs", 40),
      testRefs: collect("contextScoutTestRefs", 32),
      handoffSummaryForSynthesis: stringValue(data.contextScoutHandoffSummaryForSynthesis),
      openBlockers: collect("openContextBlockers", 12),
    },
    contextSynthesis: {
      state:
        collect("contextSynthesisRef", 1).length > 0 ||
        collect("contextSynthesisImplementationGroupIds", 1).length > 0
          ? collectedString("contextSynthesisStatus") === "accepted"
            ? "accepted"
            : collectedString("contextSynthesisStatus") === "needs_review"
              ? "needs_review"
              : "present"
          : "missing",
      synthesisRef: collectedString("contextSynthesisRef"),
      status: collectedString("contextSynthesisStatus"),
      implementationGroupCount: collectedNumber("contextSynthesisImplementationGroupCount"),
      dependencyCount: collectedNumber("contextSynthesisDependencyCount"),
      parallelGroupCount: collectedNumber("contextSynthesisParallelGroupCount"),
      blockerCount: collectedNumber("contextSynthesisBlockerCount"),
      validationLaneCount: collectedNumber("contextSynthesisValidationLaneCount"),
      reviewLaneCount: collectedNumber("contextSynthesisReviewLaneCount"),
      workerFitSummary: collectedString("contextSynthesisWorkerFitSummary"),
      graphCompileInputSummary: collectedString("contextSynthesisGraphCompileInputSummary"),
      implementationGroupIds: collect("contextSynthesisImplementationGroupIds", 40),
      targetRefs: collect("contextSynthesisTargetRefs", 40),
      validationLanes: collect("contextSynthesisValidationLanes", 20),
      reviewLanes: collect("contextSynthesisReviewLanes", 20),
      semanticCodeIntelligenceRefs: collect("contextSynthesisSemanticCodeIntelligenceRefs", 40),
      contextSnapshotRefs: collect("contextSnapshotRefs", 40),
      nextDecision:
        collectedString("contextSynthesisStatus") === "accepted"
          ? "compile_post_synthesis_graph"
          : collectedString("contextSynthesisStatus") === "needs_review"
            ? "repair_context_synthesis"
            : stringValue(data.nextDecisionNeeded),
      eli5:
        collectedString("contextSynthesisStatus") === "accepted"
          ? "Context synthesis accepted the scout handoffs and produced worker-ready implementation groups for scheduler graph compile."
          : collectedString("contextSynthesisStatus") === "needs_review"
            ? "Context synthesis needs repair before implementation can start."
            : null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    resourceMaterialization: {
      state:
        collectedString("nodeReadinessStatus") === "ready"
          ? "ready"
          : collectedString("nodeReadinessStatus") === "ready_with_limitations"
            ? "ready_with_limitations"
            : collect("resourceBlockingLimitations", 1).length > 0 ||
                collectedString("nodeReadinessStatus") === "blocked"
              ? "blocked"
              : "missing",
      materializationStatus: collectedString("implementationResourceMaterializationStatus"),
      materializationPacketRef: collectedString("implementationResourceMaterializationPacketRef"),
      materializationBlockingReasonCodes: collect(
        "implementationResourceMaterializationBlockingReasonCodes",
        40,
      ),
      materializationNonblockingReasonCodes: collect(
        "implementationResourceMaterializationNonblockingReasonCodes",
        40,
      ),
      materializationSchemaDiagnostics: Array.isArray(
        data.implementationResourceMaterializationSchemaDiagnostics,
      )
        ? (data.implementationResourceMaterializationSchemaDiagnostics as JsonValue)
        : ((asRecord(
            data.implementationResourceMaterializationSchemaDiagnostics,
          ) as JsonValue | null) ?? null),
      materializationInputCounts:
        (asRecord(data.implementationResourceMaterializationInputCounts) as JsonValue | null) ??
        null,
      materializationOutputCounts:
        (asRecord(data.implementationResourceMaterializationOutputCounts) as JsonValue | null) ??
        null,
      materializationMaxBounds:
        (asRecord(data.implementationResourceMaterializationMaxBounds) as JsonValue | null) ?? null,
      materializationSuggestedSplitIds: collect(
        "implementationResourceMaterializationSuggestedSplitIds",
        40,
      ),
      materializationSuggestedSplitCount: collectedNumber(
        "implementationResourceMaterializationSuggestedSplitCount",
      ),
      implementationContextPacketRef: collectedString("implementationContextPacketRef"),
      implementationContextReadinessStatus: collectedString("implementationContextReadinessStatus"),
      implementationTaskPacketRefs: collect("implementationTaskPacketRefs", 40),
      resolvedTargetFileRefs: collect("resolvedTargetFileRefs", 40),
      readableTargetFileRefs: collect("readableTargetFileRefs", 40),
      missingTargetRefs: collect("missingTargetRefs", 40),
      unreadableTargetRefs: collect("unreadableTargetRefs", 40),
      directoryOnlyTargetRefs: collect("directoryOnlyTargetRefs", 30),
      candidateConcreteFileRefs: collect("candidateConcreteFileRefs", 50),
      targetFileSnapshotRefs: collect("targetFileSnapshotRefs", 40),
      targetFileSnapshotHashes: collect("targetFileSnapshotHashes", 40),
      implementationContextRepairAction: collectedString("implementationContextRepairAction"),
      nodeExecutionPacketRef: collectedString("nodeExecutionPacketRef"),
      nodeExecutionPacketStatus: collectedString("nodeExecutionPacketStatus"),
      resourcePacketKind: collectedString("resourcePacketKind"),
      resourcePacketRef: collectedString("resourcePacketRef"),
      nodeReadinessState: (asRecord(data.nodeReadinessState) as JsonValue | null) ?? null,
      nodeReadinessStateRef: collectedString("nodeReadinessStateRef"),
      nodeReadinessPhase: collectedString("nodeReadinessPhase"),
      nodeReadinessStatus: collectedString("nodeReadinessStatus"),
      nodeReadinessRepairAction: collectedString("nodeReadinessRepairAction"),
      nodeReadinessNextAllowedTransitions: collect("nodeReadinessNextAllowedTransitions", 16),
      nodeReadinessFreshnessStatus: collectedString("nodeReadinessFreshnessStatus"),
      nodeReadinessSnapshotStatus: collectedString("nodeReadinessSnapshotStatus"),
      nodeReadinessContextStatus: collectedString("nodeReadinessContextStatus"),
      nodeReadinessValidationStatus: collectedString("nodeReadinessValidationStatus"),
      nodeReadinessAuthorityStatus: collectedString("nodeReadinessAuthorityStatus"),
      nodeReadinessEvidenceStatus: collectedString("nodeReadinessEvidenceStatus"),
      readinessReasonCodes: collect("resourceReadinessReasonCodes", 40),
      blockingLimitations: collect("resourceBlockingLimitations", 20),
      nonblockingLimitations: collect("resourceNonblockingLimitations", 20),
      nextDecision:
        collect("resourceBlockingLimitations", 1).length > 0
          ? (collectedString("nodeReadinessRepairAction") ?? "repair_node_execution_packet")
          : collect("nodeReadinessNextAllowedTransitions", 16).includes("execute_node")
            ? "execute_node"
            : null,
      eli5:
        collect("resourceBlockingLimitations", 1).length > 0
          ? "The worker is waiting because runtime resources for this node are incomplete."
          : collectedString("nodeReadinessStatus") === "ready" ||
              collectedString("nodeReadinessStatus") === "ready_with_limitations"
            ? "Runtime compiled a worker-ready resource packet for this node."
            : null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    codeIntelligence: {
      state: codeIntelligenceState,
      semanticMode: collectedString("codeIntelligenceSemanticMode"),
      backendId: collectedString("codeIntelligenceBackendId"),
      backendState: collectedString("codeIntelligenceBackendState"),
      backendHealthRef: collectedString("codeIntelligenceBackendHealthRef"),
      workspaceSnapshotRef: collectedString("codeIntelligenceWorkspaceSnapshotRef"),
      semanticConfidence: collectedString("codeIntelligenceSemanticConfidence"),
      fallbackUsed: collectedBoolean("codeIntelligenceFallbackUsed"),
      fallbackReasonCodes: collect("codeIntelligenceFallbackReasonCodes", 20),
      diagnosticVersionRef: collectedString("codeIntelligenceDiagnosticVersionRef"),
      projectConfigRefs: collect("codeIntelligenceProjectConfigRefs", 20),
      limitations: collect("codeIntelligenceLimitations", 20),
      backendLatencyMs: collectedNumber("codeIntelligenceBackendLatencyMs"),
      resultCounts: {
        symbols: collectedNumber("codeIntelligenceSymbolCount"),
        locations: collectedNumber("codeIntelligenceLocationCount"),
        diagnostics: collectedNumber("codeIntelligenceDiagnosticCount"),
        importEdges: collectedNumber("codeIntelligenceImportEdgeCount"),
        relatedTests: collectedNumber("codeIntelligenceRelatedTestCount"),
        codeActions: collectedNumber("codeIntelligenceCodeActionCount"),
      },
      activeToolId: codeIntelligenceToolIds.at(-1) ?? null,
      runtimeToolInvocationRefs: collect("codeIntelligenceRuntimeToolInvocationRefs", 40),
      resultRefs: codeIntelligenceResultRefs,
      symbolRefs: collect("codeIntelligenceSymbolRefs", 40),
      diagnosticRefs: codeIntelligenceDiagnosticRefs,
      relatedTestRefs: collect("codeIntelligenceRelatedTestRefs", 40),
      impactRefs: collect("codeIntelligenceImpactRefs", 40),
      staleRefBlockers: collect("codeIntelligenceStaleRefBlockers", 20),
      latestSummary: collectedString("codeIntelligenceSummary"),
      reasonCodes: collect("codeIntelligenceReasonCodes", 20),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    commitmentWorkPackets,
    commitmentPacketFanout: {
      state: latestPacketAuthorFanoutPresent ? "present" : "missing",
      totalCount: numberValue(latestPacketAuthorFanout.totalCount),
      completedCount: numberValue(latestPacketAuthorFanout.completedCount),
      failedCount: numberValue(latestPacketAuthorFanout.failedCount),
      runningCount: numberValue(latestPacketAuthorFanout.runningCount),
      retryCount: numberValue(latestPacketAuthorFanout.retryCount),
      fallbackCount: numberValue(latestPacketAuthorFanout.fallbackCount),
      longLatencyCount: numberValue(latestPacketAuthorFanout.longLatencyCount),
      noContentCount: numberValue(latestPacketAuthorFanout.noContentCount),
      runningCommitmentIds: stringArrayValue(latestPacketAuthorFanout.runningCommitmentIds, 12),
      affectedCommitmentIds: stringArrayValue(latestPacketAuthorFanout.affectedCommitmentIds, 20),
      topBlockerSummaries: stringArrayValue(latestPacketAuthorFanout.topBlockerSummaries, 3),
      diagnosticArtifactRef: stringValue(latestPacketAuthorFanout.diagnosticArtifactRef),
      diagnosticArtifactHash: stringValue(latestPacketAuthorFanout.diagnosticArtifactHash),
      diagnosticHydrationToolId: stringValue(latestPacketAuthorFanout.diagnosticHydrationToolId),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    costAwareDecision: {
      selectedCapabilityId:
        stringValue(nodeData.selectedCapabilityId) ?? stringValue(data.selectedCapabilityId),
      selectedProviderCapabilityProfileId:
        stringValue(nodeData.selectedProviderCapabilityProfileId) ??
        stringValue(data.selectedProviderCapabilityProfileId),
      workerRef: stringValue(nodeData.workerRef) ?? stringValue(data.workerRef),
      roleClass: stringValue(nodeData.capabilityRoleClass) ?? stringValue(data.capabilityRoleClass),
      costClass: stringValue(nodeData.capabilityCostClass) ?? stringValue(data.capabilityCostClass),
      latencyClass:
        stringValue(nodeData.capabilityLatencyClass) ?? stringValue(data.capabilityLatencyClass),
      contextCapacity:
        stringValue(nodeData.capabilityContextCapacity) ??
        stringValue(data.capabilityContextCapacity),
      productionSelectable:
        booleanValue(nodeData.providerProfileProductionSelectable) ??
        booleanValue(data.providerProfileProductionSelectable),
      productionSelectionRequiresQualification:
        booleanValue(nodeData.providerProfileRequiresQualification) ??
        booleanValue(data.providerProfileRequiresQualification),
      selectedModelQualificationProfileId:
        stringValue(nodeData.selectedModelQualificationProfileId) ??
        stringValue(data.selectedModelQualificationProfileId),
      qualificationEvidenceRefs: collect("qualificationEvidenceRefs", 12),
      utilityRationale:
        stringValue(nodeData.capabilityUtilityRationale) ??
        stringValue(data.capabilityUtilityRationale),
      costRationale:
        stringValue(nodeData.capabilityCostRationale) ?? stringValue(data.capabilityCostRationale),
      whyCheaperOptionsWereInsufficient: stringValue(data.whyCheaperOptionsWereInsufficient),
      consideredCapabilityIds: collect("consideredCapabilityIds", 12),
      consideredProviderCapabilityProfileIds: collect("consideredProviderCapabilityProfileIds", 12),
    },
    schedulerToolTrace: {
      schedulerPhase: stringValue(data.schedulerPhase),
      latestToolId: stringValue(data.schedulerToolId),
      invocationRefs: collect("schedulerToolInvocationRefs", 20),
    },
    contextBroker: {
      state: contextBrokerRequestRefs.length > 0 ? "present" : "missing",
      requestRefs: contextBrokerRequestRefs,
      statuses: contextBrokerStatuses,
      dedupeKeys: collect("contextBrokerDedupeKeys", 40),
      consumerNodeIds: collect("contextBrokerConsumerNodeIds", 40),
      scoutRequiredCount: contextBrokerStatuses.filter(
        (status) => status === "context_scout_required",
      ).length,
      inheritedSatisfiedCount: contextBrokerStatuses.filter(
        (status) =>
          status === "satisfied_from_inherited_context" || status === "satisfied_from_cache",
      ).length,
      blockedCount: contextBrokerStatuses.filter((status) => status === "blocked_needs_review")
        .length,
      reasonCodes: collect("contextBrokerReasonCodes", 40),
      nextTransition: collectedString("contextBrokerNextTransition"),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    expansionAdmission: {
      state:
        collectedString("expansionAdmissionDecisionRef") ||
        collectedString("expansionAdmissionStatus")
          ? "present"
          : "missing",
      decisionRef: collectedString("expansionAdmissionDecisionRef"),
      policyRef: collectedString("expansionAdmissionPolicyRef"),
      status: collectedString("expansionAdmissionStatus"),
      originalNodeCount: collectedNumber("expansionAdmissionOriginalNodeCount"),
      originalEdgeCount: collectedNumber("expansionAdmissionOriginalEdgeCount"),
      admittedNodeCount: collectedNumber("expansionAdmissionAdmittedNodeCount"),
      admittedEdgeCount: collectedNumber("expansionAdmissionAdmittedEdgeCount"),
      deferredNodeCount: collectedNumber("expansionAdmissionDeferredNodeCount"),
      deferredEdgeCount: collectedNumber("expansionAdmissionDeferredEdgeCount"),
      readyFrontierNodeIds: collect("expansionAdmissionReadyFrontierNodeIds", 40),
      admittedNodeIds: collect("expansionAdmissionAdmittedNodeIds", 40),
      deferredNodeIds: collect("expansionAdmissionDeferredNodeIds", 40),
      nextTransition: collectedString("expansionAdmissionNextTransition"),
      prerequisiteCritical: collectedBoolean("expansionAdmissionPrerequisiteCritical"),
      reasonCodes: collect("expansionAdmissionReasonCodes", 40),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    graphPatch: {
      state:
        stringValue(data.graphPatchRef) || stringValue(latestRunGraphPatch?.ref)
          ? "present"
          : "missing",
      ref: stringValue(data.graphPatchRef) ?? stringValue(latestRunGraphPatch?.ref),
      payloadRef:
        stringValue(data.graphPatchPayloadRef) ?? stringValue(latestRunGraphPatch?.payloadRef),
      kind: stringValue(data.graphPatchKind) ?? stringValue(latestRunGraphPatch?.kind),
      byteCount:
        numberValue(data.graphPatchByteCount) ?? numberValue(latestRunGraphPatch?.byteCount),
      nodeCount:
        numberValue(data.graphPatchNodeCount) ?? numberValue(latestRunGraphPatch?.nodeCount),
      edgeCount:
        numberValue(data.graphPatchEdgeCount) ?? numberValue(latestRunGraphPatch?.edgeCount),
      affectedNodeIds:
        stringArrayValue(data.graphPatchAffectedNodeIds, 24).length > 0
          ? stringArrayValue(data.graphPatchAffectedNodeIds, 24)
          : stringArrayValue(latestRunGraphPatch?.affectedNodeIds, 24),
      affectedBranchIds:
        stringArrayValue(data.graphPatchAffectedBranchIds, 24).length > 0
          ? stringArrayValue(data.graphPatchAffectedBranchIds, 24)
          : stringArrayValue(latestRunGraphPatch?.affectedBranchIds, 24),
      reasonCodes:
        stringArrayValue(data.graphPatchReasonCodes, 24).length > 0
          ? stringArrayValue(data.graphPatchReasonCodes, 24)
          : stringArrayValue(latestRunGraphPatch?.reasonCodes, 24),
    },
    parallelFrontier: {
      state: latestParallelFrontierData ? "present" : "missing",
      currentSuperstep: latestParallelFrontierData
        ? numberValue(latestParallelFrontierData.currentSuperstep)
        : null,
      maxParallelNodeExecutions: latestParallelFrontierData
        ? numberValue(latestParallelFrontierData.maxParallelNodeExecutions)
        : null,
      dependencyLayerCount: latestParallelFrontierData
        ? numberValue(latestParallelFrontierData.dependencyLayerCount)
        : null,
      readyNodeIds: frontierStringArray("readyNodeIds", 40),
      selectedNodeIds: frontierStringArray("selectedNodeIds", 40),
      runningNodeIds: frontierStringArray("runningNodeIds", 40),
      completedNodeIds: frontierStringArray("completedNodeIds", 40),
      blockedNodeIds: frontierStringArray("blockedNodeIds", 40),
      failedNodeIds: frontierStringArray("failedNodeIds", 40),
      needsReviewNodeIds: frontierStringArray("needsReviewNodeIds", 40),
      waitingForHumanNodeIds: frontierStringArray("waitingForHumanNodeIds", 40),
      skippedReasonCodes: frontierStringArray("skippedReasonCodes", 60),
      conflictDomains: frontierConflictDomains,
      providerConcurrencyBudgets: frontierProviderConcurrencyBudgets,
      branchResults: frontierBranchResults,
      joinReadyNodeIds: frontierStringArray("joinReadyNodeIds", 30),
      contextSynthesisRefs: frontierStringArray("contextSynthesisRefs", 12),
      implementationGroupCount: latestParallelFrontierData
        ? numberValue(latestParallelFrontierData.implementationGroupCount)
        : null,
    },
    schedulerFrontier: {
      state: latestSchedulerFrontierData ? "present" : "missing",
      currentSuperstep: latestSchedulerFrontierData
        ? numberValue(latestSchedulerFrontierData.currentSuperstep)
        : null,
      executableReadyNodeIds: schedulerFrontierStringArray("executableReadyNodeIds", 80),
      selectedExecutableNodeIds: schedulerFrontierStringArray("selectedExecutableNodeIds", 80),
      blockedFrontierNodeIds: schedulerFrontierStringArray("blockedFrontierNodeIds", 80),
      aggregateBlockedNodeIds: schedulerFrontierStringArray("aggregateBlockedNodeIds", 40),
      dependencyBlockedNodeIds: schedulerFrontierStringArray("dependencyBlockedNodeIds", 80),
      contextBlockedNodeIds: schedulerFrontierStringArray("contextBlockedNodeIds", 80),
      resourceBlockedNodeIds: schedulerFrontierStringArray("resourceBlockedNodeIds", 80),
      lockConflictNodeIds: schedulerFrontierStringArray("lockConflictNodeIds", 40),
      providerBudgetBlockedNodeIds: schedulerFrontierStringArray(
        "providerBudgetBlockedNodeIds",
        40,
      ),
      readinessRefs: schedulerFrontierStringArray("readinessRefs", 80),
      resourceRefs: schedulerFrontierStringArray("resourceRefs", 60),
      contextRefs: schedulerFrontierStringArray("contextRefs", 60),
      openCommitmentIds: schedulerFrontierStringArray("openCommitmentIds", 80),
      nextLegalTransition: latestSchedulerFrontierData
        ? stringValue(latestSchedulerFrontierData.nextLegalTransition)
        : null,
      reasonCodes: schedulerFrontierStringArray("reasonCodes", 80),
    },
    latestRunState: {
      state: latestRunArtifact ? "present" : "missing",
      artifactRef: latestRunArtifact?.uri ?? null,
      generatedAt: stringValue(latestRunStateMetadata?.generatedAt),
      processStatus: stringValue(asRecord(latestRunStateMetadata?.runtimeJob)?.state),
      terminalStatus: stringValue(latestRunProcess?.terminalStatus),
      adapterTerminalStatus: stringValue(latestRunProcess?.adapterTerminalStatus),
      retryState: stringValue(latestRunProcess?.retryState),
      currentPhase: stringValue(latestRunCurrent?.phase),
      graphId: latestRunGraphId,
      activeFrontierStatus: stringValue(latestRunFrontier?.status),
      selectedNodeIds: latestRunSelectedNodeIds,
      runningNodeIds: latestRunRunningNodeIds,
      blockedNodeIds: latestRunBlockedNodeIds,
      branchStates: latestRunBranchStates,
      nextTransition: stringValue(latestRunFrontier?.nextTransition),
      schedulerNextLegalTransition: stringValue(latestRunFrontier?.schedulerNextLegalTransition),
      noProgressRepeatCount: numberValue(latestRunNoProgress?.repeatCount),
      terminalBlockerCode: stringValue(latestRunNoProgress?.terminalBlockerCode),
      missionLedgerThrottleShouldEvaluate: booleanValue(latestRunThrottle?.shouldEvaluate),
      agreement: {
        state: latestRunArtifact ? "present" : "missing",
        graphIdMatches: latestRunArtifact
          ? graphId && latestRunGraphId
            ? graphId === latestRunGraphId
            : null
          : null,
        selectedNodeIdsMatch: compareStringSets(
          latestRunSelectedNodeIds,
          latestSchedulerFrontierData
            ? schedulerFrontierStringArray("selectedExecutableNodeIds", 80)
            : frontierStringArray("selectedNodeIds", 80),
        ),
        blockedNodeIdsMatch: compareStringSets(
          latestRunBlockedNodeIds,
          latestSchedulerFrontierData
            ? schedulerFrontierStringArray("blockedFrontierNodeIds", 80)
            : frontierStringArray("blockedNodeIds", 80),
        ),
        nextTransitionMatches: latestRunArtifact
          ? schedulerNextTransition || stringValue(latestRunFrontier?.schedulerNextLegalTransition)
            ? normalizeTransition(stringValue(latestRunFrontier?.schedulerNextLegalTransition)) ===
              normalizeTransition(schedulerNextTransition)
            : null
          : null,
        reasonCodes: latestRunAgreementReasonCodes,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    },
    noProgress: {
      state: latestNoProgressData ? "present" : "missing",
      signatureHash: latestNoProgressData ? stringValue(latestNoProgressData.signatureHash) : null,
      repeatCount: collectedNumber("noProgressRepeatCount"),
      selectedDecisionId: latestNoProgressData
        ? stringValue(latestNoProgressData.selectedDecisionId)
        : null,
      selectedDecisionKind: latestNoProgressData
        ? stringValue(latestNoProgressData.selectedDecisionKind)
        : null,
      terminalBlockerCode: latestNoProgressData
        ? stringValue(latestNoProgressData.terminalBlockerCode)
        : null,
      executableFrontierNodeIds: noProgressStringArray("executableFrontierNodeIds", 80),
      blockedFrontierNodeIds: noProgressStringArray("blockedFrontierNodeIds", 80),
      openCommitmentIds: noProgressStringArray("openCommitmentIds", 80),
      reusedNodeIds: noProgressStringArray("reusedNodeIds", 80),
      reusedEdgeIds: noProgressStringArray("reusedEdgeIds", 80),
      reasonCodes: noProgressStringArray("blockerReasonCodes", 80),
    },
    missionLedgerEvaluationThrottle: {
      state: latestMissionLedgerThrottleData ? "present" : "missing",
      nodeId: latestMissionLedgerThrottleData
        ? stringValue(latestMissionLedgerThrottleData.nodeId)
        : null,
      nodeKind: latestMissionLedgerThrottleData
        ? stringValue(latestMissionLedgerThrottleData.nodeKind)
        : null,
      eventClass: latestMissionLedgerThrottleData
        ? stringValue(latestMissionLedgerThrottleData.eventClass)
        : null,
      shouldEvaluate: latestMissionLedgerThrottleData
        ? booleanValue(latestMissionLedgerThrottleData.shouldEvaluate)
        : null,
      evidenceClaimCount: latestMissionLedgerThrottleData
        ? numberValue(latestMissionLedgerThrottleData.evidenceClaimCount)
        : null,
      reasonCodes: latestMissionLedgerThrottleData
        ? stringArrayValue(latestMissionLedgerThrottleData.reasonCodes, 80)
        : [],
    },
    modelCallProgress: projectModelCallProgress({ latestModelCallData }),
    spanProgress,
    repairClassification: {
      state: latestRepairClassification ? "present" : "missing",
      classificationRef: stringValue(latestRepairClassification?.classificationRef),
      failureClass: stringValue(latestRepairClassification?.failureClass),
      failedBoundaryKind: stringValue(latestRepairClassification?.failedBoundaryKind),
      repairStrategy: stringValue(latestRepairClassification?.repairStrategy),
      selectedRepairBoundary: stringValue(latestRepairClassification?.selectedRepairBoundary),
      failedSpanRefs: latestRepairClassification
        ? stringArrayValue(latestRepairClassification.failedSpanRefs, 12)
        : [],
      failedRuntimeToolInvocationRefs: latestRepairClassification
        ? stringArrayValue(latestRepairClassification.failedRuntimeToolInvocationRefs, 12)
        : [],
      failedCommitmentIds: latestRepairClassification
        ? stringArrayValue(latestRepairClassification.failedCommitmentIds, 20)
        : [],
      failedFieldPaths: latestRepairClassification
        ? stringArrayValue(latestRepairClassification.failedFieldPaths, 20)
        : [],
      reasonCodes: latestRepairClassification
        ? stringArrayValue(latestRepairClassification.reasonCodes, 20)
        : [],
      expectedNextAction: stringValue(latestRepairClassification?.expectedNextAction),
      semanticReviewRequired:
        typeof latestRepairClassification?.semanticReviewRequired === "boolean"
          ? latestRepairClassification.semanticReviewRequired
          : null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      workQueueLifecycleMutated: false,
    },
    postSynthesisGraphQuality: {
      state: stringValue(data.postSynthesisGraphQualityState),
      presentRoleObligations: collect("postSynthesisPresentRoleObligations", 12),
      missingRoleObligations: collect("postSynthesisMissingRoleObligations", 12),
      broadCodexShare: numberValue(data.postSynthesisBroadCodexShare),
      premiumShare: numberValue(data.postSynthesisPremiumShare),
    },
    workerToolTrace: {
      latestWorkerToolId,
      workerToolIds,
      invocationRefs: [
        ...new Set([
          ...collect("schedulerToolInvocationRefs", 20),
          ...collect("artifactRefs", 20).filter((ref) => ref.startsWith("runtime-tool://")),
          ...collect("evidenceProducedRefs", 20).filter((ref) => ref.startsWith("runtime-tool://")),
        ]),
      ].slice(0, 20),
      changedFileRefs: collect("changedFileRefs", 20),
      validationRefs: collect("validationRefs", 20),
      contextRequestRefs: collect("contextRequestRefs", 20),
      editStepIds: collect("editStepIds", 20),
      evidenceClaimRefs: collect("evidenceClaimRefs", 20),
      editTransactionRefs: collect("editTransactionRefs", 20),
      workerPhaseRefs: collect("workerPhaseRefs", 30),
      editTransactionPhase: stringValue(data.editTransactionPhase),
      editTransactionStatus: stringValue(data.editTransactionStatus),
      editTransactionRepairCount: numberValue(data.editTransactionRepairCount),
    },
    workerInternal: projectWorkerInternalProgress({
      latestWorkerInternalData,
      latestWorkerToolId,
    }),
    validationQa: {
      state:
        validationQaToolInvocationRefs.length > 0 || validationQaEvidencePacketRefs.length > 0
          ? latestValidationQaState === "needs_review" ||
            latestValidationQaState === "failed" ||
            latestValidationQaState === "not_run"
            ? "needs_review"
            : "present"
          : "missing",
      taskPacketRefs: collect("validationTaskPacketRefs", 20),
      planRefs: collect("validationPlanRefs", 20),
      commandRefs: collect("validationCommandRefs", 20),
      commandSummaries: collect("validationCommandSummaries", 20),
      currentCommandRef: stringValue(latestValidationQaData.currentValidationCommandRef),
      currentCommandSummary: stringValue(latestValidationQaData.currentValidationCommandSummary),
      currentCommandStatus: stringValue(latestValidationQaData.currentValidationCommandStatus),
      resultRefs: collect("validationResultRefs", 20),
      failureRefs: collect("validationFailureRefs", 20),
      repairPlanRefs: collect("validationRepairPlanRefs", 20),
      repairNodeRefs: collect("validationRepairNodeRefs", 20),
      repairHandoffRefs: collect("validationRepairHandoffRefs", 20),
      coverageReviewRefs: collect("validationCoverageReviewRefs", 20),
      qaReviewRefs: collect("validationQaReviewRefs", 20),
      evidencePacketRefs: validationQaEvidencePacketRefs,
      toolInvocationRefs: validationQaToolInvocationRefs,
      blockingCommitmentIds: collect("validationBlockingCommitmentIds", 20),
      latestSummary:
        stringValue(latestValidationQaData.validationQaLatestSummary) ??
        stringValue(data.validationQaLatestSummary),
      rawCommandLogsStored: false,
    },
    closeoutFinalization: {
      state:
        closeoutFinalizationState === "accepted"
          ? "accepted"
          : closeoutFinalizationEvidencePacketRefs.length > 0 ||
              closeoutFinalizationToolInvocationRefs.length > 0
            ? "needs_review"
            : "missing",
      evidencePacketRefs: closeoutFinalizationEvidencePacketRefs,
      handoffRefs: collect("closeoutFinalizationHandoffRefs", 20),
      toolInvocationRefs: closeoutFinalizationToolInvocationRefs,
      acceptRefs: collect("closeoutFinalizationAcceptRefs", 20),
      rejectRefs: collect("closeoutFinalizationRejectRefs", 20),
      missingReasonCodes: collect("closeoutFinalizationMissingReasonCodes", 30),
      maximalitySummary:
        stringValue(latestCloseoutFinalizationData.closeoutFinalizationMaximalitySummary) ??
        stringValue(data.closeoutFinalizationMaximalitySummary),
      limitationsSummary:
        stringValue(latestCloseoutFinalizationData.closeoutFinalizationLimitationsSummary) ??
        stringValue(data.closeoutFinalizationLimitationsSummary),
      eli5:
        stringValue(latestCloseoutFinalizationData.closeoutFinalizationEli5) ??
        stringValue(data.closeoutFinalizationEli5),
      recommendedNextAction:
        stringValue(latestCloseoutFinalizationData.closeoutFinalizationRecommendedNextAction) ??
        stringValue(data.closeoutFinalizationRecommendedNextAction),
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    boundaryReplay: projectBoundaryReplayReadback({
      checkpointRefs: boundaryReplayCheckpointRefs,
      graphCheckpointRefs: boundaryReplayGraphCheckpointRefs,
      latestBoundaryData,
      latestBoundaryPlanData,
      latestBoundaryProgressData,
      latestCheckpointKind: latestBoundaryCheckpointKind,
      latestRunBoundaryReplay,
      planRefs: boundaryReplayPlanRefs,
    }),
    latestProgressEventRefs: progressEvents
      .slice(-6)
      .map((event) => `runtime-event://${event.eventId}`),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export type ActiveGraphProgressReadback = ReturnType<typeof activeGraphProgressReadback>;
