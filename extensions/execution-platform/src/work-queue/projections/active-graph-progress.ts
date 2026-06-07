import { buildCanonicalReadbackGate } from "../../observability/canonical-readback-gate.ts";
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
  const numberArray = (value: unknown, maxItems: number): number[] =>
    Array.isArray(value)
      ? value
          .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
          .map((item) => Math.trunc(item))
          .slice(0, maxItems)
      : [];
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
          validationPhase: stringValue(claim.validationPhase),
          validationPhaseCompatibility: stringValue(claim.validationPhaseCompatibility),
          validationPhaseReasonCodes: stringArrayValue(claim.validationPhaseReasonCodes, 8),
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
  const reviewArtifactRefs = [
    ...new Set([
      ...collect("reviewArtifactRefs", 40),
      ...collect("artifactRefs", 40).filter(
        (ref) =>
          ref.startsWith("worker-edit-review://") ||
          ref.startsWith("action-review://") ||
          ref.includes("worker_edit_review_artifact"),
      ),
    ]),
  ].slice(0, 40);
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
  const latestRunCanonicalReadbackGate = asRecord(latestRunStateMetadata?.canonicalReadbackGate);
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
  const latestSchedulerModelCallEnvelopeData =
    asRecord(
      eventDataRecord(
        progressEvents.findLast((event) => {
          const record = eventDataRecord(event);
          return Boolean(asRecord(record.schedulerModelCallEnvelope));
        }),
      ).schedulerModelCallEnvelope,
    ) ?? asRecord(latestRunStateMetadata?.schedulerModelCallEnvelope);
  const latestSchedulerModelCallFrontierCounts = asRecord(
    latestSchedulerModelCallEnvelopeData?.activeFrontierCounts,
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
  const latestRootCauseData = asRecord(
    eventDataRecord(
      progressEvents.findLast((event) => {
        const rootCause = asRecord(eventDataRecord(event).frontierRootCauseArtifact);
        return Boolean(rootCause);
      }),
    ).frontierRootCauseArtifact,
  );
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
          nodeLifecycleProjectionRef: stringValue(branch.nodeLifecycleProjectionRef),
          reasonCodes: stringArrayValue(branch.reasonCodes, 40),
        }))
        .filter((branch) => branch.nodeId.length > 0)
        .slice(0, 40)
    : [];
  const latestBranchScopedData = Array.isArray(data.branchScopedFrontierStates)
    ? data.branchScopedFrontierStates
    : Array.isArray(latestParallelFrontierData?.branchScopedFrontierStates)
      ? latestParallelFrontierData.branchScopedFrontierStates
      : [];
  const branchScopedFrontierStates = latestBranchScopedData
    .map((branch) => asRecord(branch))
    .filter((branch): branch is Record<string, unknown> => Boolean(branch))
    .map((branch) => {
      const blocker = asRecord(branch.blocker);
      return {
        branchId: stringValue(branch.branchId),
        parentBranchId: stringValue(branch.parentBranchId),
        nodeId: stringValue(branch.nodeId) ?? "",
        nodeKind: stringValue(branch.nodeKind),
        sourceRequirementRef: stringValue(branch.sourceRequirementRef),
        contractRef: stringValue(branch.contractRef),
        readinessRef: stringValue(branch.readinessRef),
        sourceMaterialRequirementRefs: stringArrayValue(branch.sourceMaterialRequirementRefs, 20),
        domainResourceSelectionRefs: stringArrayValue(branch.domainResourceSelectionRefs, 20),
        domainResourceSelectionStatus: stringValue(branch.domainResourceSelectionStatus),
        actionGateStatus: stringValue(branch.actionGateStatus),
        actionGateMissingFields: stringArrayValue(branch.actionGateMissingFields, 20),
        providerDiagnosticRefs: stringArrayValue(branch.providerDiagnosticRefs, 20),
        providerDiagnosticStatus: stringValue(branch.providerDiagnosticStatus),
        domainSourceMaterialRef: stringValue(branch.domainSourceMaterialRef),
        sourceMaterialRef: stringValue(branch.sourceMaterialRef),
        status: stringValue(branch.status),
        blockerCode: stringValue(blocker?.code ?? branch.blockerCode),
        blockerSummary: stringValue(blocker?.summary ?? branch.blockerSummary),
        blockerSchemaPath: stringValue(blocker?.schemaPath ?? branch.blockerSchemaPath),
        blockerPolicyPath: stringValue(blocker?.policyPath ?? branch.blockerPolicyPath),
        blockerSignature: stringValue(branch.blockerSignature),
        consumerRefs: stringArrayValue(branch.consumerRefs, 20),
        dependentConsumers: stringArrayValue(branch.dependentConsumers, 20),
        siblingBranchIds: stringArrayValue(branch.siblingBranchIds, 20),
        successfulEvidenceRefs: stringArrayValue(branch.successfulEvidenceRefs, 20),
        failedEvidenceRefs: stringArrayValue(branch.failedEvidenceRefs, 20),
        repairNodeRefs: stringArrayValue(branch.repairNodeRefs, 20),
        diagnosticOnlyNodeRefs: stringArrayValue(branch.diagnosticOnlyNodeRefs, 20),
        nextLegalTransitions: stringArrayValue(branch.nextLegalTransitions, 20),
        capabilityId: stringValue(branch.capabilityId),
        executorKey: stringValue(branch.executorKey),
        modelRef: stringValue(branch.modelRef),
        workerRef: stringValue(branch.workerRef),
        phase: stringValue(branch.phase),
        currentToolId: stringValue(branch.currentToolId),
        rootCauseRef: stringValue(branch.rootCauseRef),
        rootCauseSystemic: booleanValue(branch.rootCauseSystemic),
        reasonCodes: stringArrayValue(blocker?.reasonCodes ?? branch.reasonCodes, 40),
      };
    })
    .filter((branch) => branch.nodeId.length > 0)
    .slice(0, 80);
  const latestRunNoProgress = asRecord(latestRunFrontier?.noProgress);
  const latestRunRootCause = asRecord(latestRunFrontier?.rootCause);
  const projectedRootCauseData = latestRootCauseData ?? latestRunRootCause;
  const projectedRootCauseStringArray = (key: string, maxItems: number): string[] =>
    projectedRootCauseData ? stringArrayValue(projectedRootCauseData[key], maxItems) : [];
  const latestRunThrottle = asRecord(latestRunFrontier?.missionLedgerEvaluationThrottle);
  const latestRunBranchStates = Array.isArray(latestRunFrontier?.branchStates)
    ? latestRunFrontier.branchStates
        .map((branch) => asRecord(branch))
        .filter((branch): branch is Record<string, unknown> => Boolean(branch))
        .map((branch) => ({
          branchId: stringValue(branch.branchId),
          nodeId: stringValue(branch.nodeId) ?? "",
          nodeKind: stringValue(branch.nodeKind),
          capabilityId: stringValue(branch.capabilityId),
          contractRef: stringValue(branch.contractRef),
          readinessRef: stringValue(branch.nodeLifecycleProjectionRef ?? branch.readinessRef),
          sourceMaterialRequirementRefs: stringArrayValue(branch.sourceMaterialRequirementRefs, 20),
          domainResourceSelectionRefs: stringArrayValue(branch.domainResourceSelectionRefs, 20),
          domainResourceSelectionStatus: stringValue(branch.domainResourceSelectionStatus),
          actionGateStatus: stringValue(branch.actionGateStatus),
          actionGateMissingFields: stringArrayValue(branch.actionGateMissingFields, 20),
          providerDiagnosticRefs: stringArrayValue(branch.providerDiagnosticRefs, 20),
          providerDiagnosticStatus: stringValue(branch.providerDiagnosticStatus),
          domainSourceMaterialRef: stringValue(branch.domainSourceMaterialRef),
          sourceMaterialRef: stringValue(branch.sourceMaterialRef),
          consumerRefs: stringArrayValue(branch.consumerRefs, 20),
          dependentConsumers: stringArrayValue(branch.dependentConsumers, 20),
          siblingBranchIds: stringArrayValue(branch.siblingBranchIds, 20),
          successfulEvidenceRefs: stringArrayValue(branch.successfulEvidenceRefs, 20),
          failedEvidenceRefs: stringArrayValue(branch.failedEvidenceRefs, 20),
          repairNodeRefs: stringArrayValue(branch.repairNodeRefs, 20),
          diagnosticOnlyNodeRefs: stringArrayValue(branch.diagnosticOnlyNodeRefs, 20),
          rootCauseRef: stringValue(branch.rootCauseRef),
          rootCauseSystemic: booleanValue(branch.rootCauseSystemic),
          targetCommitmentIds: stringArrayValue(branch.targetCommitmentIds, 24),
          status: stringValue(branch.status),
          blockerSummary: stringValue(branch.blockerSummary),
          errorPath: stringValue(branch.errorPath),
          nodeLifecycleProjectionRef: stringValue(branch.nodeLifecycleProjectionRef),
          nodeLifecycleProjectionGate: stringValue(branch.nodeLifecycleProjectionGate),
          nodeLifecycleProjectionStatus: stringValue(branch.nodeLifecycleProjectionStatus),
          evidenceRefs: stringArrayValue(branch.evidenceRefs, 20),
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
  const normalizeTransition = (value: string | null): string | null =>
    value === "execute_frontier" ? "run_frontier" : value;
  const sourceMaterialRequirementRefs = collect("sourceMaterialRequirementRefs", 40);
  const sourceMaterialRequirementStatuses = collect("sourceMaterialRequirementStatuses", 40);
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
  const latestRunWallTime = asRecord(latestRunStateMetadata?.wallTime);
  const latestRunModelUsage = asRecord(latestRunStateMetadata?.modelUsage);
  const latestRunProofEnvironment = asRecord(latestRunStateMetadata?.proofEnvironment);
  const artifactPayloadRefs = [
    ...new Set(
      artifacts
        .map((artifact) => stringValue(asRecord(artifact.metadata)?.payloadRef))
        .filter((ref): ref is string => Boolean(ref)),
    ),
  ].slice(0, 30);
  const artifactManifestRefs = artifacts
    .filter((artifact) => stringValue(asRecord(artifact.metadata)?.payloadRef))
    .map((artifact) => artifact.uri)
    .slice(0, 30);
  const latestOwnerBranch =
    branchScopedFrontierStates.at(0) ??
    frontierBranchResults.at(0) ??
    latestRunBranchStates.at(0) ??
    null;
  const latestOwnerBranchRecord = asRecord(latestOwnerBranch);
  const latestOwnerLifecycleProjectionRef =
    stringValue(data.nodeLifecycleProjectionRef) ??
    stringValue(latestOwnerBranchRecord?.readinessRef) ??
    stringValue(latestOwnerBranchRecord?.nodeLifecycleProjectionRef) ??
    stringValue(latestRunCurrent?.nodeLifecycleProjectionRef);
  const latestOwnerLifecycleProjectionStatus =
    stringValue(data.nodeLifecycleProjectionStatus) ??
    stringValue(latestRunCurrent?.nodeLifecycleProjectionStatus);
  const ownerExecutionIntent =
    collectedString("executionIntent") ?? stringValue(latestRunCurrent?.executionIntent);
  const ownerEvidenceMode = [
    ...new Set([
      ...collect("evidenceMode", 12),
      ...stringArrayValue(latestRunCurrent?.evidenceMode, 12),
    ]),
  ].slice(0, 12);
  const latestRunUsageUnavailableReasonRecords = Array.isArray(
    latestRunModelUsage?.usageUnavailableReasons,
  )
    ? latestRunModelUsage.usageUnavailableReasons
    : [];
  const ownerUsageUnavailableReasons = [
    ...stringArrayValue(latestRunModelUsage?.usageUnavailableReasons, 20),
    ...latestRunUsageUnavailableReasonRecords
      .map((entry) => stringValue(asRecord(entry)?.reason))
      .filter((reason): reason is string => Boolean(reason)),
    stringValue(asRecord(latestModelCallData.modelProviderDiagnostics)?.usageUnavailableReason),
    stringValue(latestWorkerInternalData.workerInternalUsageUnavailableReason),
  ]
    .filter((reason): reason is string => Boolean(reason))
    .slice(0, 30);
  const providerUsage =
    asRecord(asRecord(latestModelCallData.modelProviderDiagnostics)?.usage) ??
    asRecord(latestWorkerInternalData.workerInternalProviderUsage);
  const estimatedTokenRange = asRecord(
    asRecord(latestModelCallData.modelProviderDiagnostics)?.estimatedTokenRange,
  );
  const latestProviderDiagnosticData =
    asRecord(latestModelCallData.modelProviderDiagnostics) ??
    asRecord(latestWorkerInternalData.providerDiagnostics) ??
    asRecord(data.providerDiagnostics);
  const latestProviderDiagnosticShape =
    asRecord(latestProviderDiagnosticData?.providerResponseShape) ??
    asRecord(latestProviderDiagnosticData?.responseShape);
  const latestProviderDiagnosticProfile =
    asRecord(latestProviderDiagnosticData?.requestProfileDiagnostics) ??
    asRecord(latestProviderDiagnosticData?.modelTaskClassification);
  const latestProviderDiagnosticPreflight = asRecord(
    latestProviderDiagnosticData?.structuredAdapterPreflight,
  );
  const latestProviderDiagnosticUsage =
    asRecord(latestProviderDiagnosticData?.usage) ??
    asRecord(latestProviderDiagnosticData?.providerUsage) ??
    providerUsage;
  const latestProviderDiagnosticRefs = [
    ...new Set([
      ...collect("providerDiagnosticRefs", 20),
      ...collect("providerDiagnosticsRefs", 20),
      stringValue(latestProviderDiagnosticData?.diagnosticRef),
      stringValue(latestProviderDiagnosticData?.providerDiagnosticRef),
    ]),
  ]
    .filter((ref): ref is string => Boolean(ref))
    .slice(0, 20);
  const canonicalReadbackGate = buildCanonicalReadbackGate({
    graphId: graphId ?? latestRunGraphId,
    progress: data,
    latestRunState: latestRunStateMetadata,
    schedulerFrontier: latestSchedulerFrontierData,
    parallelFrontier: latestParallelFrontierData,
    rootCause: projectedRootCauseData,
    noProgress: latestNoProgressData ?? latestRunNoProgress,
    schedulerModelCallEnvelope: latestSchedulerModelCallEnvelopeData,
    checkpointKind: latestBoundaryCheckpointKind,
    terminalStatus:
      stringValue(latestRunProcess?.terminalStatus) ?? stringValue(data.finalizationState),
    adapterTerminalStatus: stringValue(latestRunProcess?.adapterTerminalStatus),
  });
  const latestNodeAgentSessionData = eventDataRecord(
    progressEvents.findLast((event) => {
      const record = eventDataRecord(event);
      return Boolean(
        stringValue(record.nodeRunId) ||
        stringValue(record.nodeAgentId) ||
        stringValue(record.nodeAgentSessionKey) ||
        stringValue(record.nodeExecutionSnapshotRef) ||
        stringValue(record.nodeAgentStartReceiptRef) ||
        stringValue(record.nodeFinishArtifactRef) ||
        asRecord(record.nodeAgentTraceEventRefs) ||
        asRecord(record.nodeAgentTraceObservations),
      );
    }),
  );
  const latestNodeFinishArtifact = latestArtifact(artifacts, "execution_platform.node_finish");
  const latestNodeFinishMetadata = asRecord(latestNodeFinishArtifact?.metadata);
  const latestNodeAgentSessionTraceArtifact = latestArtifact(
    artifacts,
    "execution_platform.node_agent_session_trace",
  );
  const latestNodeAgentStartReceiptArtifact = latestArtifact(
    artifacts,
    "execution_platform.node_agent_start_receipt",
  );
  const latestNodeAgentSessionTraceMetadata = asRecord(
    latestNodeAgentSessionTraceArtifact?.metadata,
  );
  const latestNodeAgentStartReceiptMetadata = asRecord(
    latestNodeAgentStartReceiptArtifact?.metadata,
  );
  const latestNodeAgentSessionTraceEventRefs = {
    ...asRecord(latestNodeAgentSessionData.nodeAgentTraceEventRefs),
    ...asRecord(latestNodeAgentSessionTraceMetadata?.nodeAgentTraceEventRefs),
  };
  const latestNodeAgentSessionTraceObservations = {
    ...asRecord(latestNodeAgentSessionData.nodeAgentTraceObservations),
    ...asRecord(latestNodeAgentSessionTraceMetadata?.nodeAgentTraceObservations),
  };
  const nodeAgentSnapshotRefs = collect("nodeExecutionSnapshotRef", 30);
  const nodeAgentSessionTraceRefs = [
    ...new Set(
      [...collect("nodeAgentSessionTraceRef", 20), latestNodeAgentSessionTraceArtifact?.uri].filter(
        (ref): ref is string => Boolean(ref),
      ),
    ),
  ].slice(0, 20);
  const nodeAgentStartReceiptRefs = [
    ...new Set(
      [...collect("nodeAgentStartReceiptRef", 20), latestNodeAgentStartReceiptArtifact?.uri].filter(
        (ref): ref is string => Boolean(ref),
      ),
    ),
  ].slice(0, 20);
  const nodeAgentStartBlockedTools = [
    ...(Array.isArray(latestNodeAgentSessionData.nodeAgentStartBlockedTools)
      ? latestNodeAgentSessionData.nodeAgentStartBlockedTools
      : []),
    ...(Array.isArray(latestNodeAgentStartReceiptMetadata?.nodeAgentStartBlockedTools)
      ? latestNodeAgentStartReceiptMetadata.nodeAgentStartBlockedTools
      : []),
  ]
    .map((entry): Record<string, JsonValue> | null => {
      const record = asRecord(entry);
      if (!record) {
        return null;
      }
      const toolName = stringValue(record.toolName);
      const agentId = stringValue(record.agentId);
      if (!toolName && !agentId) {
        return null;
      }
      return {
        agentId: agentId ?? null,
        toolName: toolName ?? null,
        blockedBy: stringArrayValue(record.blockedBy, 8),
        effectiveProfileSource: stringValue(record.effectiveProfileSource),
        localPolicyExplicit: booleanValue(record.localPolicyExplicit),
      };
    })
    .filter((entry): entry is Record<string, JsonValue> => Boolean(entry))
    .slice(0, 20);
  const nodeAgentStartRuntimeAliases = [
    ...(Array.isArray(latestNodeAgentSessionData.nodeAgentStartRuntimeAliases)
      ? latestNodeAgentSessionData.nodeAgentStartRuntimeAliases
      : []),
    ...(Array.isArray(latestNodeAgentStartReceiptMetadata?.nodeAgentStartRuntimeAliases)
      ? latestNodeAgentStartReceiptMetadata.nodeAgentStartRuntimeAliases
      : []),
  ]
    .map((entry): Record<string, JsonValue> | null => {
      const record = asRecord(entry);
      if (!record) {
        return null;
      }
      const aliasPath = stringValue(record.aliasPath);
      const canonicalPath = stringValue(record.canonicalPath);
      if (!aliasPath || !canonicalPath) {
        return null;
      }
      return {
        aliasPath,
        canonicalPath,
        label: stringValue(record.label),
      };
    })
    .filter((entry): entry is Record<string, JsonValue> => Boolean(entry))
    .slice(0, 10);
  const nodeFinishArtifactRefs = [
    ...new Set(
      [
        ...collect("nodeFinishArtifactRef", 20),
        stringValue(latestNodeAgentSessionTraceMetadata?.nodeFinishArtifactRef),
        latestNodeFinishArtifact?.uri,
      ].filter((ref): ref is string => Boolean(ref)),
    ),
  ].slice(0, 20);
  return {
    state: latest || latestRunArtifact ? "present" : "missing",
    graphId,
    canonicalReadbackGate,
    firstOpenGate: canonicalReadbackGate,
    firstOpenGateKind: canonicalReadbackGate.gateKind,
    firstOpenGateStatus: canonicalReadbackGate.gateStatus,
    firstOpenGateReasonCodes: canonicalReadbackGate.reasonCodes,
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
    nodeLocalLifecycle: {
      state:
        collect("domainResourceSelectionRefs", 1).length > 0 || collectedString("actionGateStatus")
          ? "present"
          : "missing",
      domainResourceSelection: {
        status: collectedString("domainResourceSelectionStatus"),
        refs: collect("domainResourceSelectionRefs", 30),
        selectedTargetRefs: collect("selectedTargetRefs", 30),
        missingRefs: collect("domainResourceSelectionMissingRefs", 20),
        reasonCodes: collect("domainResourceSelectionReasonCodes", 30),
      },
      actionGate: {
        status: collectedString("actionGateStatus"),
        refs: collect("actionGateRefs", 20),
        missingFields: collect("actionGateMissingFields", 20),
        nextTransition: collectedString("actionGateNextTransition"),
      },
      evidenceClosure: {
        status: collectedString("evidenceClosureStatus"),
        evidenceClaimRefs: collect("evidenceClaimRefs", 30),
        validationRefs: collect("validationRefs", 30),
        reasonCodes: collect("evidenceClosureReasonCodes", 30),
      },
      providerDiagnosticRefs: latestProviderDiagnosticRefs,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    nodeAgentSession: {
      state:
        stringValue(latestNodeAgentSessionData.nodeRunId) ||
        stringValue(latestNodeAgentSessionData.nodeAgentSessionKey) ||
        stringValue(latestNodeAgentSessionTraceMetadata?.nodeRunId) ||
        stringValue(latestNodeAgentSessionTraceMetadata?.nodeAgentSessionKey) ||
        stringValue(latestNodeAgentStartReceiptMetadata?.nodeAgentSessionKey) ||
        nodeAgentSnapshotRefs.length > 0 ||
        nodeAgentStartReceiptRefs.length > 0 ||
        nodeAgentSessionTraceRefs.length > 0 ||
        nodeFinishArtifactRefs.length > 0
          ? "present"
          : "missing",
      nodeRunId:
        stringValue(latestNodeAgentSessionData.nodeRunId) ??
        stringValue(latestNodeAgentSessionTraceMetadata?.nodeRunId),
      agentId:
        stringValue(latestNodeAgentSessionData.nodeAgentId) ??
        stringValue(latestNodeAgentSessionTraceMetadata?.nodeAgentId),
      sessionKey:
        stringValue(latestNodeAgentSessionData.nodeAgentSessionKey) ??
        stringValue(latestNodeAgentSessionTraceMetadata?.nodeAgentSessionKey) ??
        stringValue(latestNodeAgentStartReceiptMetadata?.nodeAgentSessionKey),
      snapshotRefs: nodeAgentSnapshotRefs,
      startReceiptRefs: nodeAgentStartReceiptRefs,
      startStatus:
        stringValue(latestNodeAgentSessionData.nodeAgentStartStatus) ??
        stringValue(latestNodeAgentStartReceiptMetadata?.nodeAgentStartStatus),
      startBlockerKind:
        stringValue(latestNodeAgentSessionData.nodeAgentStartBlockerKind) ??
        stringValue(latestNodeAgentStartReceiptMetadata?.nodeAgentStartBlockerKind),
      startConfigFingerprint:
        stringValue(latestNodeAgentSessionData.nodeAgentStartConfigFingerprint) ??
        stringValue(latestNodeAgentStartReceiptMetadata?.nodeAgentStartConfigFingerprint),
      startConfigEpoch:
        stringValue(latestNodeAgentSessionData.nodeAgentStartConfigEpoch) ??
        stringValue(latestNodeAgentStartReceiptMetadata?.nodeAgentStartConfigEpoch),
      startProjectRoot:
        stringValue(latestNodeAgentSessionData.nodeAgentStartProjectRoot) ??
        stringValue(latestNodeAgentStartReceiptMetadata?.nodeAgentStartProjectRoot),
      startExecutionPlatformDocsRoot:
        stringValue(latestNodeAgentSessionData.nodeAgentStartExecutionPlatformDocsRoot) ??
        stringValue(latestNodeAgentStartReceiptMetadata?.nodeAgentStartExecutionPlatformDocsRoot),
      startRuntimeHome:
        stringValue(latestNodeAgentSessionData.nodeAgentStartRuntimeHome) ??
        stringValue(latestNodeAgentStartReceiptMetadata?.nodeAgentStartRuntimeHome),
      startRuntimeAliases: nodeAgentStartRuntimeAliases,
      startSourceRuntimeManifestRef:
        stringValue(latestNodeAgentSessionData.nodeAgentStartSourceRuntimeManifestRef) ??
        stringValue(latestNodeAgentStartReceiptMetadata?.nodeAgentStartSourceRuntimeManifestRef),
      startLockAcquisitionOutcome:
        stringValue(latestNodeAgentSessionData.nodeAgentStartLockAcquisitionOutcome) ??
        stringValue(latestNodeAgentStartReceiptMetadata?.nodeAgentStartLockAcquisitionOutcome),
      startBlockedTools: nodeAgentStartBlockedTools,
      traceRefs: nodeAgentSessionTraceRefs,
      finishArtifactRefs: nodeFinishArtifactRefs,
      finishStatus:
        stringValue(latestNodeAgentSessionData.nodeFinishStatus) ??
        stringValue(latestNodeFinishMetadata?.status),
      finishBlockerKind:
        stringValue(latestNodeAgentSessionData.nodeFinishBlockerKind) ??
        stringValue(latestNodeFinishMetadata?.blockerKind),
      latestToolId:
        stringValue(latestNodeAgentSessionData.schedulerToolId) ??
        (workerToolIds.includes("node.agent_session.invoke") ? "node.agent_session.invoke" : null),
      observedToolNames: [
        ...new Set([
          ...stringArrayValue(latestNodeAgentSessionData.nodeAgentObservedToolNames, 80),
          ...stringArrayValue(latestNodeAgentSessionTraceMetadata?.nodeAgentObservedToolNames, 80),
        ]),
      ].slice(0, 80),
      toolCallCount:
        numberValue(latestNodeAgentSessionData.nodeAgentToolCallCount) ??
        numberValue(latestNodeAgentSessionTraceMetadata?.nodeAgentToolCallCount),
      traceMissingOptics: [
        ...new Set([
          ...stringArrayValue(latestNodeAgentSessionData.nodeAgentTraceMissingOptics, 40),
          ...stringArrayValue(latestNodeAgentSessionTraceMetadata?.nodeAgentTraceMissingOptics, 40),
        ]),
      ].slice(0, 40),
      traceEventRefs: {
        workerPromptAuthoredRef: stringValue(
          latestNodeAgentSessionTraceEventRefs?.workerPromptAuthoredRef,
        ),
        workerPromptHashRef: stringValue(latestNodeAgentSessionTraceEventRefs?.workerPromptHashRef),
        parentSessionKeyRef: stringValue(latestNodeAgentSessionTraceEventRefs?.parentSessionKeyRef),
        firstPlanUpdateRef: stringValue(latestNodeAgentSessionTraceEventRefs?.firstPlanUpdateRef),
        scoutSpawnRef: stringValue(latestNodeAgentSessionTraceEventRefs?.scoutSpawnRef),
        childSessionKeyRef: stringValue(latestNodeAgentSessionTraceEventRefs?.childSessionKeyRef),
        childResultRef: stringValue(latestNodeAgentSessionTraceEventRefs?.childResultRef),
        parentSynthesisRef: stringValue(latestNodeAgentSessionTraceEventRefs?.parentSynthesisRef),
        firstEditRef: stringValue(latestNodeAgentSessionTraceEventRefs?.firstEditRef),
        validationActionRef: stringValue(latestNodeAgentSessionTraceEventRefs?.validationActionRef),
        validationScoutResultRef: stringValue(
          latestNodeAgentSessionTraceEventRefs?.validationScoutResultRef,
        ),
        repairLoopEvidenceRef: stringValue(
          latestNodeAgentSessionTraceEventRefs?.repairLoopEvidenceRef,
        ),
        terminalNodeFinishRef: stringValue(
          latestNodeAgentSessionTraceEventRefs?.terminalNodeFinishRef,
        ),
        waitingOnSubagentStateRef: stringValue(
          latestNodeAgentSessionTraceEventRefs?.waitingOnSubagentStateRef,
        ),
      },
      traceObservations: {
        workerPromptAuthored: booleanValue(
          latestNodeAgentSessionTraceObservations?.workerPromptAuthored,
        ),
        parentSessionStarted: booleanValue(
          latestNodeAgentSessionTraceObservations?.parentSessionStarted,
        ),
        firstPlanUpdateObserved: booleanValue(
          latestNodeAgentSessionTraceObservations?.firstPlanUpdateObserved,
        ),
        contextScoutSpawnObserved: booleanValue(
          latestNodeAgentSessionTraceObservations?.contextScoutSpawnObserved,
        ),
        sessionsYieldObserved: booleanValue(
          latestNodeAgentSessionTraceObservations?.sessionsYieldObserved,
        ),
        childResultObserved: booleanValue(
          latestNodeAgentSessionTraceObservations?.childResultObserved,
        ),
        parentSynthesisObserved: booleanValue(
          latestNodeAgentSessionTraceObservations?.parentSynthesisObserved,
        ),
        firstEditObserved: booleanValue(latestNodeAgentSessionTraceObservations?.firstEditObserved),
        validationActionObserved: booleanValue(
          latestNodeAgentSessionTraceObservations?.validationActionObserved,
        ),
        validationScoutObserved: booleanValue(
          latestNodeAgentSessionTraceObservations?.validationScoutObserved,
        ),
        repairLoopEvidenceObserved: booleanValue(
          latestNodeAgentSessionTraceObservations?.repairLoopEvidenceObserved,
        ),
        terminalNodeFinishObserved: booleanValue(
          latestNodeAgentSessionTraceObservations?.terminalNodeFinishObserved,
        ),
        waitingOnSubagentObserved: booleanValue(
          latestNodeAgentSessionTraceObservations?.waitingOnSubagentObserved,
        ),
      },
      nativeCompactionCount:
        numberValue(latestNodeAgentSessionData.nodeAgentNativeCompactionCount) ??
        numberValue(latestNodeAgentSessionTraceMetadata?.nodeAgentNativeCompactionCount),
      reasonCodes: [
        ...new Set([
          ...stringArrayValue(latestNodeAgentSessionData.reasonCodes, 30),
          ...collect("nodeAgentSessionReasonCodes", 30),
        ]),
      ].slice(0, 30),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    },
    acceptedCommitmentIds: latestStringArray("acceptedCommitmentIds", 12),
    rejectedCommitmentIds: latestStringArray("rejectedCommitmentIds", 12),
    openCommitmentIds: latestStringArray("remainingOpenCommitmentIds", 12),
    nextDecisionNeeded: stringValue(data.nextDecisionNeeded),
    blockerSummary: stringValue(data.blockerSummary),
    finalizationState: stringValue(data.finalizationState),
    latestToolEventKind: stringValue(data.latestToolEventKind),
    eli5Progress: stringValue(data.eli5Progress),
    ownerTelemetry: {
      state: latest || latestRunArtifact ? "present" : "missing",
      workIntent: {
        workIntentId:
          collectedString("workIntentId") ??
          collectedString("workUnitId") ??
          stringValue(latestRunCurrent?.workIntentId),
        title:
          collectedString("workIntentTitle") ??
          collectedString("workUnitTitle") ??
          stringValue(latestRunCurrent?.workIntentTitle) ??
          stringValue(nodeData.currentObjective) ??
          stringValue(data.currentObjective),
        executionIntent: ownerExecutionIntent,
        evidenceMode: ownerEvidenceMode,
        targetCommitmentIds: [
          ...new Set([
            ...collect("commitmentIdsAdvanced", 40),
            ...collect("targetCommitmentIds", 40),
            ...stringArrayValue(latestOwnerBranchRecord?.targetCommitmentIds, 40),
          ]),
        ].slice(0, 40),
      },
      capability: {
        capabilityId:
          stringValue(nodeData.capabilityId) ??
          stringValue(nodeData.selectedCapabilityId) ??
          stringValue(data.capabilityId) ??
          stringValue(data.selectedCapabilityId) ??
          stringValue(latestOwnerBranchRecord?.capabilityId) ??
          stringValue(latestRunCurrent?.capabilityId),
        executorKey:
          collectedString("executorKey") ??
          collectedString("selectedExecutorKey") ??
          stringValue(latestRunCurrent?.executorKey),
        workerRef:
          stringValue(nodeData.workerRef) ??
          stringValue(data.workerRef) ??
          stringValue(latestRunCurrent?.workerRef),
        roleId: stringValue(nodeData.roleId) ?? stringValue(data.roleId),
        modelRef: stringValue(nodeData.modelRef) ?? stringValue(data.modelRef),
        providerPath: collectedString("providerPath"),
      },
      runtime: {
        runtimeJobId:
          stringValue(latestRunStateMetadata?.runtimeJobId) ??
          latestRunArtifact?.jobId ??
          stringValue(data.runtimeJobId),
        graphId: graphId ?? latestRunGraphId,
        branchId: stringValue(latestOwnerBranchRecord?.branchId),
        superstepId: stringValue(latestOwnerBranchRecord?.superstepId),
        currentSuperstep:
          numberValue(latestParallelFrontierData?.currentSuperstep) ??
          numberValue(latestSchedulerFrontierData?.currentSuperstep) ??
          numberValue(latestRunFrontier?.currentSuperstep),
        nodeId:
          stringValue(nodeData.nodeId) ??
          stringValue(data.nodeId) ??
          stringValue(latestOwnerBranchRecord?.nodeId) ??
          stringValue(latestRunCurrent?.nodeId),
        nodeKind:
          stringValue(nodeData.activeNodeKind) ??
          stringValue(data.activeNodeKind) ??
          stringValue(latestOwnerBranchRecord?.nodeKind) ??
          stringValue(latestRunCurrent?.nodeKind),
        currentPhase:
          stringValue(data.currentPhase) ??
          stringValue(data.stage) ??
          stringValue(latestRunCurrent?.phase),
        currentToolId:
          stringValue(data.schedulerToolId) ??
          latestWorkerToolId ??
          stringValue(latestRunCurrent?.activeToolId),
        nextLegalTransition:
          stringValue(latestSchedulerFrontierData?.nextLegalTransition) ??
          stringValue(latestRunFrontier?.schedulerNextLegalTransition) ??
          stringValue(latestRunFrontier?.nextTransition),
      },
      nodeLifecycleProjection: {
        status: latestOwnerLifecycleProjectionStatus,
        ref: latestOwnerLifecycleProjectionRef,
        gate: collectedString("nodeLifecycleProjectionGate"),
        blockerSummary:
          stringValue(data.blockerSummary) ??
          stringValue(latestOwnerBranchRecord?.blockerSummary) ??
          stringValue(latestRunCurrent?.blockerSummary),
        schemaPath:
          stringValue(data.schemaPath) ??
          stringValue(latestOwnerBranchRecord?.blockerSchemaPath) ??
          stringValue(latestOwnerBranchRecord?.errorPath) ??
          stringValue(latestRunCurrent?.schemaPath),
        policyPath:
          stringValue(data.policyPath) ??
          stringValue(latestOwnerBranchRecord?.blockerPolicyPath) ??
          stringValue(latestRunCurrent?.policyPath),
        nextAllowedTransitions: collect("nodeLifecycleNextLegalTransitions", 16),
        reasonCodes: [
          ...new Set([
            ...collect("nodeLifecycleReasonCodes", 40),
            ...stringArrayValue(latestOwnerBranchRecord?.reasonCodes, 40),
          ]),
        ].slice(0, 40),
      },
      refs: {
        payloadRefs: artifactPayloadRefs,
        artifactRefs: [
          ...new Set(
            [
              ...artifactManifestRefs,
              ...collect("artifactRefs", 40),
              stringValue(data.graphPatchRef),
              stringValue(data.graphPatchPayloadRef),
            ].filter((ref): ref is string => Boolean(ref)),
          ),
        ].slice(0, 40),
        inputHandoffRefs: collect("inputHandoffRefs", 30),
        contextRefs: [
          ...new Set([
            ...collect("contextRefs", 30),
            ...collect("contextSnapshotRefs", 30),
            ...collect("contextBrokerRequestRefs", 30),
            ...collect("sourceMaterialRefs", 30),
            ...collect("nodeAgentSessionTraceRef", 30),
            ...stringArrayValue(latestOwnerBranchRecord?.sourceMaterialRequirementRefs, 30),
          ]),
        ].slice(0, 30),
        changedFileRefs: collect("changedFileRefs", 30),
        validationRefs: collect("validationRefs", 30),
        reviewArtifactRefs,
        evidenceRefs: [
          ...new Set([
            ...collect("evidenceProducedRefs", 30),
            ...stringArrayValue(latestOwnerBranchRecord?.evidenceRefs, 30),
            ...stringArrayValue(latestOwnerBranchRecord?.successfulEvidenceRefs, 30),
            ...stringArrayValue(latestOwnerBranchRecord?.failedEvidenceRefs, 30),
          ]),
        ].slice(0, 30),
        evidenceClaimRefs: collect("evidenceClaimRefs", 30),
      },
      lifecycle: {
        rollbackState: collectedString("rollbackState") ?? collectedString("editTransactionStatus"),
        reviewState: collectedString("reviewState"),
        validationState: stringValue(data.validationState),
        closeoutState:
          stringValue(latestCloseoutFinalizationData.closeoutFinalizationState) ??
          stringValue(data.closeoutFinalizationState),
      },
      telemetry: {
        wallTimeByPhase: (latestRunWallTime?.byPhase as JsonValue | undefined) ?? [],
        modelUsageByModel: (latestRunModelUsage?.byModel as JsonValue | undefined) ?? [],
        modelUsageByPhase: (latestRunModelUsage?.byPhase as JsonValue | undefined) ?? [],
        measuredTokenUsageAvailable: Boolean(providerUsage),
        estimatedTokenUsageAvailable: Boolean(estimatedTokenRange),
        usageUnavailableReasons: ownerUsageUnavailableReasons,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    },
    providerDiagnostics: {
      state:
        latestProviderDiagnosticData || latestProviderDiagnosticRefs.length > 0
          ? "present"
          : "missing",
      diagnosticRefs: latestProviderDiagnosticRefs,
      modelRef:
        stringValue(latestProviderDiagnosticData?.modelRef) ??
        stringValue(latestModelCallData.modelRef) ??
        stringValue(latestWorkerInternalData.modelRef) ??
        stringValue(data.modelRef),
      providerPath:
        stringValue(latestProviderDiagnosticData?.providerPath) ??
        stringValue(latestProviderDiagnosticData?.providerId) ??
        stringValue(latestModelCallData.providerPath) ??
        stringValue(latestWorkerInternalData.providerPath) ??
        stringValue(data.providerPath),
      modelTaskClass:
        stringValue(latestProviderDiagnosticData?.modelTaskClass) ??
        stringValue(latestProviderDiagnosticData?.taskClass) ??
        stringValue(latestProviderDiagnosticProfile?.taskClass),
      providerRequestId: stringValue(latestProviderDiagnosticData?.providerRequestId),
      profileRef:
        stringValue(latestProviderDiagnosticData?.profileRef) ??
        stringValue(latestProviderDiagnosticProfile?.profileRef),
      reasoningModeSent:
        stringValue(latestProviderDiagnosticData?.reasoningModeSent) ??
        stringValue(latestProviderDiagnosticProfile?.reasoningMode),
      responseFormatSent:
        stringValue(latestProviderDiagnosticData?.responseFormatSent) ??
        stringValue(latestProviderDiagnosticProfile?.responseFormatMode),
      parserMode:
        stringValue(latestProviderDiagnosticData?.parserMode) ??
        stringValue(latestProviderDiagnosticProfile?.parserMode),
      requestByteCount:
        numberValue(latestProviderDiagnosticData?.requestByteCount) ??
        numberValue(latestProviderDiagnosticData?.inputByteLength) ??
        numberValue(latestProviderDiagnosticData?.inputByteCount),
      maxInputBytes:
        numberValue(latestProviderDiagnosticProfile?.maxInputBytes) ??
        numberValue(latestProviderDiagnosticData?.maxInputBytes),
      requestedMaxOutputTokens:
        numberValue(latestProviderDiagnosticData?.maxOutputTokens) ??
        numberValue(latestProviderDiagnosticProfile?.maxOutputTokens),
      requestedTimeoutMs:
        numberValue(latestProviderDiagnosticData?.timeoutMs) ??
        numberValue(latestProviderDiagnosticProfile?.timeoutMs),
      profileTimeoutMs: numberValue(latestProviderDiagnosticProfile?.timeoutMs),
      providerStarted:
        booleanValue(latestProviderDiagnosticData?.providerStarted) ??
        (latestProviderDiagnosticPreflight ? false : latestProviderDiagnosticData ? true : null),
      preflightStatus:
        stringValue(latestProviderDiagnosticPreflight?.status) ??
        stringValue(latestProviderDiagnosticData?.preflightStatus),
      preflightBlockingReason:
        stringValue(latestProviderDiagnosticData?.preflightBlockingReason) ??
        stringValue(latestProviderDiagnosticPreflight?.blockingReason),
      preflightReasonCodes: [
        ...new Set([
          ...stringArrayValue(latestProviderDiagnosticPreflight?.reasonCodes, 20),
          ...stringArrayValue(latestProviderDiagnosticData?.preflightReasonCodes, 20),
        ]),
      ].slice(0, 20),
      timeoutState: stringValue(latestProviderDiagnosticData?.timeoutState),
      elapsedMs:
        numberValue(latestProviderDiagnosticData?.elapsedMs) ??
        numberValue(latestProviderDiagnosticData?.latencyMs) ??
        numberValue(latestModelCallData.modelCallSpanElapsedMs) ??
        numberValue(latestWorkerInternalData.workerInternalProviderLatencyMs),
      finishReason: stringValue(latestProviderDiagnosticData?.finishReason),
      nativeFinishReason: stringValue(latestProviderDiagnosticData?.nativeFinishReason),
      choiceCount:
        numberValue(latestProviderDiagnosticData?.choiceCount) ??
        numberValue(latestProviderDiagnosticShape?.choicesLength),
      contentLengthByChoice: [
        ...new Set([
          ...numberArray(latestProviderDiagnosticData?.contentLengthByChoice, 12),
          ...numberArray(latestProviderDiagnosticData?.contentLengths, 12),
          ...numberArray(latestProviderDiagnosticShape?.contentLengths, 12),
        ]),
      ].slice(0, 12),
      parsedContentLength: numberValue(latestProviderDiagnosticData?.parsedContentLength),
      usage: (latestProviderDiagnosticUsage as JsonValue | null) ?? null,
      usageUnavailableReason:
        stringValue(latestProviderDiagnosticData?.usageUnavailableReason) ??
        ownerUsageUnavailableReasons[0] ??
        null,
      retryNumber:
        numberValue(latestProviderDiagnosticData?.retryNumber) ??
        numberValue(latestProviderDiagnosticData?.attemptNumber),
      concurrencySlot: stringValue(latestProviderDiagnosticData?.concurrencySlot),
      inputBundleRef: stringValue(latestProviderDiagnosticData?.inputBundleRef),
      inputBundleHash:
        stringValue(latestProviderDiagnosticData?.inputBundleHash) ??
        stringValue(latestProviderDiagnosticData?.promptHash),
      responseShapeRef: stringValue(latestProviderDiagnosticData?.responseShapeRef),
      responseBodyKeys: [
        ...new Set([
          ...stringArrayValue(latestProviderDiagnosticData?.bodyKeys, 24),
          ...stringArrayValue(latestProviderDiagnosticData?.providerBodyKeys, 24),
        ]),
      ].slice(0, 24),
      choiceKeys: stringArrayValue(latestProviderDiagnosticData?.choiceKeys, 24),
      messageKeys: stringArrayValue(latestProviderDiagnosticData?.messageKeys, 24),
      errorKeys: stringArrayValue(latestProviderDiagnosticData?.errorKeys, 24),
      failureClass:
        stringValue(latestProviderDiagnosticData?.failureClass) ??
        (latestProviderDiagnosticPreflight ? "structured_adapter_preflight_blocked" : null),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    },
    proofEnvironment: {
      state:
        latestRunProofEnvironment ||
        asRecord(data.heapPhaseSnapshot) ||
        Array.isArray(data.heapPhaseSnapshots)
          ? "present"
          : "missing",
      heapPhaseSnapshotRefs: [
        ...new Set(
          [
            ...stringArrayValue(latestRunProofEnvironment?.heapPhaseSnapshotRefs, 20),
            ...stringArrayValue(data.heapPhaseSnapshotRefs, 20),
            ...(Array.isArray(latestRunProofEnvironment?.heapPhaseSnapshots)
              ? latestRunProofEnvironment.heapPhaseSnapshots
              : Array.isArray(data.heapPhaseSnapshots)
                ? data.heapPhaseSnapshots
                : []
            )
              .map((snapshot) => stringValue(asRecord(snapshot)?.snapshotRef))
              .filter((ref): ref is string => Boolean(ref)),
            stringValue(asRecord(data.heapPhaseSnapshot)?.snapshotRef),
          ].filter((ref): ref is string => Boolean(ref)),
        ),
      ].slice(0, 20),
      largestMetadataBytes:
        numberValue(latestRunProofEnvironment?.largestMetadataBytes) ??
        numberValue(data.largestMetadataBytes),
      largestMetadataRef:
        stringValue(latestRunProofEnvironment?.largestMetadataRef) ??
        stringValue(data.largestMetadataRef),
      largestArtifactBodyBytes:
        numberValue(latestRunProofEnvironment?.largestArtifactBodyBytes) ??
        numberValue(data.largestArtifactBodyBytes),
      largestArtifactBodyRef:
        stringValue(latestRunProofEnvironment?.largestArtifactBodyRef) ??
        stringValue(data.largestArtifactBodyRef),
      latestRunStateMetadataBytes:
        numberValue(latestRunProofEnvironment?.latestRunStateMetadataBytes) ??
        numberValue(data.latestRunStateMetadataBytes),
      schedulerProgressMetadataBytes:
        numberValue(latestRunProofEnvironment?.schedulerProgressMetadataBytes) ??
        numberValue(data.schedulerProgressMetadataBytes),
      workQueueProjectionMetadataBytes:
        numberValue(latestRunProofEnvironment?.workQueueProjectionMetadataBytes) ??
        numberValue(data.workQueueProjectionMetadataBytes),
      providerRequestMaxBytes:
        numberValue(latestRunProofEnvironment?.providerRequestMaxBytes) ??
        numberValue(data.providerRequestMaxBytes),
      reasonCodes: [
        ...new Set([
          ...stringArrayValue(latestRunProofEnvironment?.reasonCodes, 40),
          ...stringArrayValue(data.proofEnvironmentReasonCodes, 40),
        ]),
      ].slice(0, 40),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    },
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
      sourcePromptBodyRef: stringValue(data.sourcePromptBodyRef),
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
      blockingContextReason: null,
    },
    contextScout: {
      qualityState:
        booleanValue(latestNodeAgentSessionTraceObservations?.contextScoutSpawnObserved) === true
          ? "native_subagent_spawn_observed"
          : null,
      verifiedFileRefs: [],
      scoutSpawnRef: stringValue(latestNodeAgentSessionTraceEventRefs?.scoutSpawnRef),
      childSessionKeyRef: stringValue(latestNodeAgentSessionTraceEventRefs?.childSessionKeyRef),
      childResultRef: stringValue(latestNodeAgentSessionTraceEventRefs?.childResultRef),
      parentSynthesisRef: stringValue(latestNodeAgentSessionTraceEventRefs?.parentSynthesisRef),
      sessionsYieldObserved: booleanValue(
        latestNodeAgentSessionTraceObservations?.sessionsYieldObserved,
      ),
      childResultObserved: booleanValue(
        latestNodeAgentSessionTraceObservations?.childResultObserved,
      ),
      parentSynthesisObserved: booleanValue(
        latestNodeAgentSessionTraceObservations?.parentSynthesisObserved,
      ),
      openBlockers: collect("openContextBlockers", 12),
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
      state:
        sourceMaterialRequirementRefs.length > 0 || contextBrokerRequestRefs.length > 0
          ? "present"
          : "missing",
      requirementRefs: sourceMaterialRequirementRefs,
      requirementStatuses: sourceMaterialRequirementStatuses,
      requirementReasonCodes: collect("sourceMaterialRequirementReasonCodes", 40),
      requestRefs: contextBrokerRequestRefs,
      statuses: contextBrokerStatuses,
      dedupeKeys: collect("contextBrokerDedupeKeys", 40),
      consumerNodeIds: collect("contextBrokerConsumerNodeIds", 40),
      scoutRequiredCount: contextBrokerStatuses.filter(
        (status) => status === "context_specialist_required",
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
      branchScopedFrontierStates,
      branchResults: frontierBranchResults,
      joinReadyNodeIds: frontierStringArray("joinReadyNodeIds", 30),
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
      branchScopedFrontierStates,
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
      rootCauseRecommendedRepairBoundary: stringValue(
        latestRunRootCause?.recommendedRepairBoundary,
      ),
      missionLedgerThrottleShouldEvaluate: booleanValue(latestRunThrottle?.shouldEvaluate),
      canonicalReadbackGate: latestRunCanonicalReadbackGate
        ? {
            gateKind: stringValue(latestRunCanonicalReadbackGate.gateKind),
            gateStatus: stringValue(latestRunCanonicalReadbackGate.gateStatus),
            sourceKind: stringValue(latestRunCanonicalReadbackGate.sourceKind),
            nodeId: stringValue(latestRunCanonicalReadbackGate.nodeId),
            branchId: stringValue(latestRunCanonicalReadbackGate.branchId),
            contractRef: stringValue(latestRunCanonicalReadbackGate.contractRef),
            nodeLifecycleProjectionRef: stringValue(
              latestRunCanonicalReadbackGate.nodeLifecycleProjectionRef,
            ),
            nodeLifecycleProjectionGate: stringValue(
              latestRunCanonicalReadbackGate.nodeLifecycleProjectionGate,
            ),
            schemaPath: stringValue(latestRunCanonicalReadbackGate.schemaPath),
            nextLegalTransition: stringValue(latestRunCanonicalReadbackGate.nextLegalTransition),
            reasonCodes: stringArrayValue(latestRunCanonicalReadbackGate.reasonCodes, 40),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            rawDbRowsStored: false,
          }
        : null,
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
        canonicalGateMatches: latestRunCanonicalReadbackGate
          ? stringValue(latestRunCanonicalReadbackGate.gateKind) ===
              canonicalReadbackGate.gateKind &&
            stringValue(latestRunCanonicalReadbackGate.nodeId) === canonicalReadbackGate.nodeId &&
            stringValue(latestRunCanonicalReadbackGate.nodeLifecycleProjectionRef) ===
              canonicalReadbackGate.nodeLifecycleProjectionRef
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
    rootCause: {
      state: projectedRootCauseData ? "present" : "missing",
      signatureHash: projectedRootCauseData
        ? stringValue(projectedRootCauseData.signatureHash)
        : null,
      repeatCount: projectedRootCauseData ? numberValue(projectedRootCauseData.repeatCount) : null,
      systemic: projectedRootCauseData ? booleanValue(projectedRootCauseData.systemic) : null,
      recommendedRepairBoundary: projectedRootCauseData
        ? stringValue(projectedRootCauseData.recommendedRepairBoundary)
        : null,
      affectedNodeIds: projectedRootCauseStringArray("affectedNodeIds", 80),
      affectedBranchIds: projectedRootCauseStringArray("affectedBranchIds", 80),
      successfulSiblingEvidenceRefs: projectedRootCauseStringArray(
        "successfulSiblingEvidenceRefs",
        40,
      ),
      missingFields: projectedRootCauseStringArray("missingFields", 80),
      schemaErrorPaths: projectedRootCauseStringArray("schemaErrorPaths", 40),
      policyErrorPaths: projectedRootCauseStringArray("policyErrorPaths", 40),
      contractRefs: projectedRootCauseStringArray("contractRefs", 40),
      domainResourcePacketKinds: projectedRootCauseStringArray("domainResourcePacketKinds", 40),
      providerProfileIds: projectedRootCauseStringArray("providerProfileIds", 40),
      nextLegalTransitions: projectedRootCauseStringArray("nextLegalTransitions", 40),
      reasonCodes: projectedRootCauseStringArray("reasonCodes", 80),
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
    schedulerModelCallEnvelope: {
      state: latestSchedulerModelCallEnvelopeData ? "present" : "missing",
      envelopeRef: stringValue(latestSchedulerModelCallEnvelopeData?.envelopeRef),
      envelopeId: stringValue(latestSchedulerModelCallEnvelopeData?.envelopeId),
      phase: stringValue(latestSchedulerModelCallEnvelopeData?.phase),
      decisionSlot: stringValue(latestSchedulerModelCallEnvelopeData?.decisionSlot),
      schedulerPhase: stringValue(latestSchedulerModelCallEnvelopeData?.schedulerPhase),
      modelRef: stringValue(latestSchedulerModelCallEnvelopeData?.modelRef),
      providerPath: stringValue(latestSchedulerModelCallEnvelopeData?.providerPath),
      providerProfileId: stringValue(latestSchedulerModelCallEnvelopeData?.providerProfileId),
      modelTaskClass: stringValue(latestSchedulerModelCallEnvelopeData?.modelTaskClass),
      modelPolicyRef: stringValue(latestSchedulerModelCallEnvelopeData?.modelPolicyRef),
      contractBoundaryId: stringValue(latestSchedulerModelCallEnvelopeData?.contractBoundaryId),
      modelPolicyBindingRef: stringValue(
        latestSchedulerModelCallEnvelopeData?.modelPolicyBindingRef,
      ),
      reasoningMode: stringValue(latestSchedulerModelCallEnvelopeData?.reasoningMode),
      parserMode: stringValue(latestSchedulerModelCallEnvelopeData?.parserMode),
      allowedToolFamily: stringValue(latestSchedulerModelCallEnvelopeData?.allowedToolFamily),
      allowedOutputContractId: stringValue(
        latestSchedulerModelCallEnvelopeData?.allowedOutputContractId,
      ),
      allowedOutputContractVersion: stringValue(
        latestSchedulerModelCallEnvelopeData?.allowedOutputContractVersion,
      ),
      proofCleanlinessState: stringValue(
        latestSchedulerModelCallEnvelopeData?.proofCleanlinessState,
      ),
      proofCleanlinessReasonCodes: latestSchedulerModelCallEnvelopeData
        ? stringArrayValue(latestSchedulerModelCallEnvelopeData.proofCleanlinessReasonCodes, 20)
        : [],
      policyMismatchFields: Array.isArray(
        latestSchedulerModelCallEnvelopeData?.policyMismatchFields,
      )
        ? latestSchedulerModelCallEnvelopeData.policyMismatchFields
            .map((field) => asRecord(field))
            .filter((field): field is Record<string, unknown> => Boolean(field))
            .map((field) => ({
              fieldPath: stringValue(field.fieldPath) ?? "",
              reasonCode: stringValue(field.reasonCode) ?? "",
            }))
            .filter((field) => field.fieldPath.length > 0 && field.reasonCode.length > 0)
            .slice(0, 16)
        : [],
      inputByteCount: numberValue(latestSchedulerModelCallEnvelopeData?.inputByteCount),
      outputByteCount: numberValue(latestSchedulerModelCallEnvelopeData?.outputByteCount),
      graphNodeCount: numberValue(latestSchedulerModelCallEnvelopeData?.graphNodeCount),
      graphEdgeCount: numberValue(latestSchedulerModelCallEnvelopeData?.graphEdgeCount),
      commitmentCount: numberValue(latestSchedulerModelCallEnvelopeData?.commitmentCount),
      sourceRequirementCount: numberValue(
        latestSchedulerModelCallEnvelopeData?.sourceRequirementCount,
      ),
      activeFrontierCounts: {
        ready: numberValue(latestSchedulerModelCallFrontierCounts?.ready),
        selected: numberValue(latestSchedulerModelCallFrontierCounts?.selected),
        blocked: numberValue(latestSchedulerModelCallFrontierCounts?.blocked),
        running: numberValue(latestSchedulerModelCallFrontierCounts?.running),
        completed: numberValue(latestSchedulerModelCallFrontierCounts?.completed),
        failed: numberValue(latestSchedulerModelCallFrontierCounts?.failed),
        needsReview: numberValue(latestSchedulerModelCallFrontierCounts?.needsReview),
        waitingForHuman: numberValue(latestSchedulerModelCallFrontierCounts?.waitingForHuman),
        branches: numberValue(latestSchedulerModelCallFrontierCounts?.branches),
      },
      elapsedMs: numberValue(latestSchedulerModelCallEnvelopeData?.elapsedMs),
      timeoutMs: numberValue(latestSchedulerModelCallEnvelopeData?.timeoutMs),
      heartbeatCount: numberValue(latestSchedulerModelCallEnvelopeData?.heartbeatCount),
      heartbeatAgeMs: numberValue(latestSchedulerModelCallEnvelopeData?.heartbeatAgeMs),
      finishReason: stringValue(latestSchedulerModelCallEnvelopeData?.finishReason),
      nativeFinishReason: stringValue(latestSchedulerModelCallEnvelopeData?.nativeFinishReason),
      providerResponseShape:
        (asRecord(latestSchedulerModelCallEnvelopeData?.providerResponseShape) as JsonValue) ??
        null,
      acceptedToolCallSummary:
        (asRecord(latestSchedulerModelCallEnvelopeData?.acceptedToolCallSummary) as JsonValue) ??
        null,
      rejectedToolCallSummary:
        (asRecord(latestSchedulerModelCallEnvelopeData?.rejectedToolCallSummary) as JsonValue) ??
        null,
      schemaErrorPath: stringValue(latestSchedulerModelCallEnvelopeData?.schemaErrorPath),
      policyErrorPath: stringValue(latestSchedulerModelCallEnvelopeData?.policyErrorPath),
      repairFieldHints: latestSchedulerModelCallEnvelopeData
        ? stringArrayValue(latestSchedulerModelCallEnvelopeData.repairFieldHints, 20)
        : [],
      missingFields: latestSchedulerModelCallEnvelopeData
        ? stringArrayValue(latestSchedulerModelCallEnvelopeData.missingFields, 20)
        : [],
      rejectedDecisionRef: stringValue(latestSchedulerModelCallEnvelopeData?.rejectedDecisionRef),
      rejectedDecisionId: stringValue(latestSchedulerModelCallEnvelopeData?.rejectedDecisionId),
      rejectedDecisionKind: stringValue(latestSchedulerModelCallEnvelopeData?.rejectedDecisionKind),
      reasonCodes: latestSchedulerModelCallEnvelopeData
        ? stringArrayValue(latestSchedulerModelCallEnvelopeData.reasonCodes, 40)
        : [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    },
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
      reviewArtifactRefs: reviewArtifactRefs.slice(0, 20),
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
