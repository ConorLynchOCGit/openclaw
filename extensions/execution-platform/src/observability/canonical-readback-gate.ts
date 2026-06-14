export type CanonicalReadbackGateKind =
  | "missing_runtime_state"
  | "prompt_submission"
  | "front_door_routing"
  | "mission_ledger"
  | "requirement_map"
  | "requirement_map_blocked"
  | "discovery_brief_required"
  | "discovery_brief_blocked"
  | "discovery_brief_payload_over_profile"
  | "graph_compile_invalid"
  | "node_agent_session_ready"
  | "node_agent_session_escalation_required"
  | "discovery_brief_missing"
  | "discovery_brief_weak"
  | "split_child_contract"
  | "frontier_execution"
  | "worker_execution"
  | "node_lifecycle_root_cause_collapsed"
  | "review_validation"
  | "closeout"
  | "terminal_needs_review"
  | "terminal_failed"
  | "terminal_succeeded";

export type CanonicalReadbackGate = {
  artifactKind: "execution_platform.canonical_readback_gate";
  schemaVersion: "execution-platform.canonical-readback-gate.v1";
  state: "present" | "missing";
  gateKind: CanonicalReadbackGateKind;
  gateStatus: "ready" | "running" | "blocked" | "needs_review" | "terminal" | "missing";
  confidence: "canonical" | "derived";
  sourceKind:
    | "terminal_outcome"
    | "frontier_root_cause"
    | "no_progress_signature"
    | "branch_scoped_frontier"
    | "scheduler_frontier"
    | "latest_run_state"
    | "missing";
  sourceRefs: string[];
  graphId: string | null;
  branchId: string | null;
  nodeId: string | null;
  nodeKind: string | null;
  workIntentRef: string | null;
  executionIntent: string | null;
  evidenceMode: string[];
  capabilityId: string | null;
  executorKey: string | null;
  workerRef: string | null;
  modelRef: string | null;
  providerPath: string | null;
  contractRef: string | null;
  nodeExecutionSnapshotRef: string | null;
  nodeWorkerPromptRef: string | null;
  nodeWorkerPromptArtifactRef: string | null;
  nodeWorkerPromptHash: string | null;
  nodeWorkerPromptByteCount: number | null;
  nodeWorkerPromptStatus: string | null;
  nodeWorkerPromptAuthorModelRunRef: string | null;
  nodeAgentSessionKey: string | null;
  nodeAgentSessionMessageId: string | null;
  nodeAgentSessionTranscriptRef: string | null;
  nodeAgentInitialMessageHash: string | null;
  nodeAgentPromptSessionHashMatch: boolean | null;
  nodeAgentStartReceiptRef: string | null;
  nodeAgentStartStatus: string | null;
  nodeAgentStartBlockerKind: string | null;
  nodeLifecycleProjectionRef: string | null;
  nodeLifecycleProjectionGate: string | null;
  domainSourceMaterialRef: string | null;
  sourceMaterialRef: string | null;
  sourceMaterialRequirementRefs: string[];
  nodeAgentStartReceiptRefs: string[];
  nodeAgentSessionTraceRefs: string[];
  nodeAgentFinishArtifactRefs: string[];
  domainResourceSelectionRefs: string[];
  actionGateStatus: string | null;
  providerDiagnosticRefs: string[];
  providerDiagnosticStatus: string | null;
  blockerCode: string | null;
  blockerSummary: string | null;
  missingFields: string[];
  schemaPath: string | null;
  policyPath: string | null;
  reasonCodes: string[];
  nextLegalTransition: string | null;
  dependentConsumers: string[];
  consumerRefs: string[];
  successfulSiblingEvidenceRefs: string[];
  failedEvidenceRefs: string[];
  validationPhase: string | null;
  validationPhaseCompatibility: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

type GateInput = {
  graphId?: unknown;
  progress?: Record<string, unknown> | null;
  latestRunState?: Record<string, unknown> | null;
  schedulerFrontier?: Record<string, unknown> | null;
  parallelFrontier?: Record<string, unknown> | null;
  rootCause?: Record<string, unknown> | null;
  noProgress?: Record<string, unknown> | null;
  schedulerModelCallEnvelope?: Record<string, unknown> | null;
  terminalStatus?: unknown;
  adapterTerminalStatus?: unknown;
};

type GateBranch = {
  branchId: string | null;
  nodeId: string | null;
  nodeKind: string | null;
  workIntentRef: string | null;
  executionIntent: string | null;
  evidenceMode: string[];
  capabilityId: string | null;
  executorKey: string | null;
  workerRef: string | null;
  modelRef: string | null;
  contractRef: string | null;
  sourceMaterialRequirementRefs: string[];
  nodeAgentStartReceiptRefs: string[];
  nodeAgentSessionTraceRefs: string[];
  nodeAgentFinishArtifactRefs: string[];
  domainResourceSelectionRefs: string[];
  actionGateStatus: string | null;
  providerDiagnosticRefs: string[];
  providerDiagnosticStatus: string | null;
  domainSourceMaterialRef: string | null;
  sourceMaterialRef: string | null;
  nodeExecutionSnapshotRef: string | null;
  nodeWorkerPromptRef: string | null;
  nodeWorkerPromptArtifactRef: string | null;
  nodeWorkerPromptHash: string | null;
  nodeWorkerPromptByteCount: number | null;
  nodeWorkerPromptStatus: string | null;
  nodeWorkerPromptAuthorModelRunRef: string | null;
  nodeAgentSessionKey: string | null;
  nodeAgentSessionMessageId: string | null;
  nodeAgentSessionTranscriptRef: string | null;
  nodeAgentInitialMessageHash: string | null;
  nodeAgentPromptSessionHashMatch: boolean | null;
  nodeAgentStartReceiptRef: string | null;
  nodeAgentStartStatus: string | null;
  nodeAgentStartBlockerKind: string | null;
  nodeLifecycleProjectionRef: string | null;
  nodeLifecycleProjectionGate: string | null;
  status: string | null;
  phase: string | null;
  blockerCode: string | null;
  blockerSummary: string | null;
  schemaPath: string | null;
  policyPath: string | null;
  reasonCodes: string[];
  missingFields: string[];
  consumerRefs: string[];
  dependentConsumers: string[];
  successfulSiblingEvidenceRefs: string[];
  failedEvidenceRefs: string[];
  nextLegalTransitions: string[];
  rootCauseRef: string | null;
  validationPhase: string | null;
  validationPhaseCompatibility: string | null;
};

const BLOCKED_STATUSES = new Set(["blocked", "blocked_context", "needs_review", "failed"]);

const RUNNING_STATUSES = new Set(["running", "in_progress", "executing"]);
const READY_STATUSES = new Set(["ready", "executable", "selected"]);

const CANONICAL_READBACK_GATE_KIND_VALUES = new Set<CanonicalReadbackGateKind>([
  "missing_runtime_state",
  "prompt_submission",
  "front_door_routing",
  "mission_ledger",
  "requirement_map",
  "requirement_map_blocked",
  "discovery_brief_required",
  "discovery_brief_blocked",
  "discovery_brief_payload_over_profile",
  "graph_compile_invalid",
  "node_agent_session_ready",
  "node_agent_session_escalation_required",
  "discovery_brief_missing",
  "discovery_brief_weak",
  "split_child_contract",
  "frontier_execution",
  "worker_execution",
  "node_lifecycle_root_cause_collapsed",
  "review_validation",
  "closeout",
  "terminal_needs_review",
  "terminal_failed",
  "terminal_succeeded",
]);

function explicitCanonicalGateKind(value: unknown): CanonicalReadbackGateKind | null {
  const normalized = bounded(value, 180);
  if (!normalized) {
    return null;
  }
  return CANONICAL_READBACK_GATE_KIND_VALUES.has(normalized as CanonicalReadbackGateKind)
    ? (normalized as CanonicalReadbackGateKind)
    : null;
}

function bounded(value: unknown, max = 700): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedStrings(value: unknown, max = 24): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.map((item) => bounded(item, 500)).filter((item): item is string => Boolean(item)),
        ),
      ].slice(0, max)
    : [];
}

function firstBounded(...values: unknown[]): string | null {
  for (const value of values) {
    const boundedValue = bounded(value, 700);
    if (boundedValue) {
      return boundedValue;
    }
  }
  return null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function branchFromRecord(value: unknown): GateBranch | null {
  const branch = asRecord(value);
  if (!branch) {
    return null;
  }
  const blocker = asRecord(branch.blocker);
  const nodeId = bounded(branch.nodeId, 260);
  if (!nodeId) {
    return null;
  }
  return {
    branchId: bounded(branch.branchId, 180),
    nodeId,
    nodeKind: bounded(branch.nodeKind, 180),
    workIntentRef: firstBounded(branch.workIntentRef, branch.workIntentId),
    executionIntent: bounded(branch.executionIntent, 160),
    evidenceMode: boundedStrings(branch.evidenceMode, 12),
    capabilityId: bounded(branch.capabilityId, 240),
    executorKey: bounded(branch.executorKey, 240),
    workerRef: bounded(branch.workerRef, 240),
    modelRef: bounded(branch.modelRef, 240),
    contractRef: bounded(branch.contractRef, 600),
    sourceMaterialRequirementRefs: boundedStrings(branch.sourceMaterialRequirementRefs, 20),
    nodeAgentStartReceiptRefs: [
      ...new Set(
        [
          ...boundedStrings(branch.nodeAgentStartReceiptRefs, 20),
          bounded(branch.nodeAgentStartReceiptRef, 600),
        ].filter((ref): ref is string => Boolean(ref)),
      ),
    ].slice(0, 20),
    nodeAgentSessionTraceRefs: boundedStrings(branch.nodeAgentSessionTraceRefs, 20),
    nodeAgentFinishArtifactRefs: boundedStrings(branch.nodeFinishArtifactRefs, 20),
    domainResourceSelectionRefs: [
      ...new Set(
        [
          ...boundedStrings(branch.domainResourceSelectionRefs, 20),
          bounded(branch.domainResourceSelectionRef, 600),
        ].filter((ref): ref is string => Boolean(ref)),
      ),
    ].slice(0, 20),
    actionGateStatus: bounded(branch.actionGateStatus, 160),
    providerDiagnosticRefs: [
      ...new Set(
        [
          ...boundedStrings(branch.providerDiagnosticRefs, 20),
          bounded(branch.providerDiagnosticRef, 600),
        ].filter((ref): ref is string => Boolean(ref)),
      ),
    ].slice(0, 20),
    providerDiagnosticStatus: bounded(branch.providerDiagnosticStatus, 160),
    domainSourceMaterialRef: bounded(branch.domainSourceMaterialRef, 600),
    sourceMaterialRef: bounded(branch.sourceMaterialRef, 600),
    nodeExecutionSnapshotRef: bounded(branch.nodeExecutionSnapshotRef, 600),
    nodeWorkerPromptRef: bounded(branch.nodeWorkerPromptRef, 600),
    nodeWorkerPromptArtifactRef: bounded(branch.nodeWorkerPromptArtifactRef, 600),
    nodeWorkerPromptHash: bounded(branch.nodeWorkerPromptHash, 180),
    nodeWorkerPromptByteCount: numberOrNull(branch.nodeWorkerPromptByteCount),
    nodeWorkerPromptStatus: bounded(branch.nodeWorkerPromptStatus, 120),
    nodeWorkerPromptAuthorModelRunRef: bounded(branch.nodeWorkerPromptAuthorModelRunRef, 600),
    nodeAgentSessionKey: bounded(branch.nodeAgentSessionKey, 300),
    nodeAgentSessionMessageId: bounded(branch.nodeAgentSessionMessageId, 700),
    nodeAgentSessionTranscriptRef: bounded(branch.nodeAgentSessionTranscriptRef, 700),
    nodeAgentInitialMessageHash: bounded(branch.nodeAgentInitialMessageHash, 180),
    nodeAgentPromptSessionHashMatch: booleanOrNull(branch.nodeAgentPromptSessionHashMatch),
    nodeAgentStartReceiptRef: bounded(branch.nodeAgentStartReceiptRef, 700),
    nodeAgentStartStatus: bounded(branch.nodeAgentStartStatus, 120),
    nodeAgentStartBlockerKind: bounded(branch.nodeAgentStartBlockerKind, 180),
    nodeLifecycleProjectionRef: bounded(branch.nodeLifecycleProjectionRef, 600),
    nodeLifecycleProjectionGate: bounded(branch.nodeLifecycleProjectionGate, 220),
    status: firstBounded(branch.nodeLifecycleProjectionStatus, branch.status),
    phase: firstBounded(branch.nodeLifecycleProjectionGate, branch.phase),
    blockerCode: firstBounded(blocker?.code, branch.blockerCode, branch.failureClass),
    blockerSummary: firstBounded(blocker?.summary, branch.blockerSummary, branch.errorSummary),
    schemaPath: firstBounded(blocker?.schemaPath, branch.blockerSchemaPath, branch.errorPath),
    policyPath: firstBounded(blocker?.policyPath, branch.blockerPolicyPath),
    reasonCodes: [
      ...new Set([
        ...boundedStrings(blocker?.reasonCodes, 40),
        ...boundedStrings(branch.reasonCodes, 40),
      ]),
    ].slice(0, 40),
    missingFields: [
      ...new Set([
        ...boundedStrings(blocker?.missingFields, 20),
        ...boundedStrings(branch.missingFields, 20),
      ]),
    ].slice(0, 20),
    consumerRefs: boundedStrings(branch.consumerRefs, 20),
    dependentConsumers: boundedStrings(branch.dependentConsumers, 20),
    successfulSiblingEvidenceRefs: boundedStrings(branch.successfulEvidenceRefs, 20),
    failedEvidenceRefs: boundedStrings(branch.failedEvidenceRefs, 20),
    nextLegalTransitions: [
      ...new Set([
        ...boundedStrings(branch.nextLegalTransitions, 20),
        ...boundedStrings(branch.nodeLifecycleNextLegalTransitions, 20),
        ...boundedStrings(branch.nextTransition ? [branch.nextTransition] : [], 1),
      ]),
    ].slice(0, 20),
    rootCauseRef: bounded(branch.rootCauseRef, 600),
    validationPhase: bounded(branch.validationPhase, 160),
    validationPhaseCompatibility: bounded(branch.validationPhaseCompatibility, 160),
  };
}

function branchRecords(input: GateInput): GateBranch[] {
  const progress = input.progress ?? {};
  const latestRunFrontier = asRecord(input.latestRunState?.activeFrontier);
  const fromExplicit = Array.isArray(progress.branchScopedFrontierStates)
    ? progress.branchScopedFrontierStates
    : Array.isArray(input.parallelFrontier?.branchScopedFrontierStates)
      ? input.parallelFrontier.branchScopedFrontierStates
      : [];
  const fromBranchResults = Array.isArray(input.parallelFrontier?.branchResults)
    ? input.parallelFrontier.branchResults
    : [];
  const fromLatestRun = Array.isArray(latestRunFrontier?.branchStates)
    ? latestRunFrontier.branchStates
    : [];
  const fallbackNodeId =
    bounded(progress.nodeId, 260) ?? bounded(asRecord(input.latestRunState?.current)?.nodeId, 260);
  const hasFallbackProjection =
    Boolean(fallbackNodeId) &&
    Boolean(
      bounded(progress.nodeLifecycleProjectionRef, 600) ||
      bounded(progress.nodeLifecycleProjectionGate, 180) ||
      bounded(progress.nodeLifecycleProjectionStatus, 180),
    );
  const fallback = hasFallbackProjection
    ? [
        {
          branchId: progress.branchId,
          nodeId: fallbackNodeId,
          nodeKind: progress.nodeKind ?? progress.activeNodeKind,
          workIntentRef: progress.workIntentRef ?? progress.workIntentId,
          executionIntent: progress.executionIntent,
          evidenceMode: progress.evidenceMode,
          capabilityId: progress.capabilityId ?? progress.selectedCapabilityId,
          executorKey: progress.executorKey ?? progress.selectedExecutorKey,
          workerRef: progress.workerRef,
          modelRef: progress.modelRef,
          contractRef: progress.nodeExecutionContractRef,
          sourceMaterialRequirementRefs: progress.sourceMaterialRequirementRefs,
          nodeAgentStartReceiptRefs: progress.nodeAgentStartReceiptRefs,
          nodeAgentSessionTraceRefs: progress.nodeAgentSessionTraceRefs,
          nodeAgentFinishArtifactRefs: progress.nodeFinishArtifactRefs,
          domainResourceSelectionRefs: progress.domainResourceSelectionRefs,
          actionGateStatus: progress.actionGateStatus,
          providerDiagnosticRefs: progress.providerDiagnosticRefs,
          providerDiagnosticStatus: progress.providerDiagnosticStatus,
          sourceMaterialRef: progress.sourceMaterialRef,
          nodeExecutionSnapshotRef: progress.nodeExecutionSnapshotRef,
          nodeLifecycleProjectionRef: progress.nodeLifecycleProjectionRef,
          nodeLifecycleProjectionStatus: progress.nodeLifecycleProjectionStatus,
          nodeLifecycleProjectionGate: progress.nodeLifecycleProjectionGate,
          nodeLifecycleNextLegalTransitions: progress.nodeLifecycleNextLegalTransitions,
          status: progress.nodeLifecycleProjectionStatus,
          phase: progress.nodeLifecycleProjectionGate,
          blockerCode: progress.blockerCode,
          blockerSummary: progress.blockerSummary,
          blockerSchemaPath: progress.schemaPath ?? progress.errorPath,
          blockerPolicyPath: progress.policyPath,
          reasonCodes: [...boundedStrings(progress.reasonCodes, 40)],
          missingFields: boundedStrings(progress.missingFields, 40),
          nextLegalTransitions: progress.nodeLifecycleNextLegalTransitions,
          validationPhase: progress.validationPhase,
          validationPhaseCompatibility: progress.validationPhaseCompatibility,
        },
      ]
    : [];

  return [...fromExplicit, ...fromLatestRun, ...fromBranchResults, ...fallback]
    .map((record) => branchFromRecord(record))
    .filter((branch): branch is GateBranch => Boolean(branch));
}

function selectOwnerBranch(branches: GateBranch[]): GateBranch | null {
  return (
    branches.find(
      (branch) =>
        (branch.status && BLOCKED_STATUSES.has(branch.status)) ||
        Boolean(branch.blockerCode) ||
        branch.missingFields.length > 0 ||
        branch.reasonCodes.length > 0,
    ) ??
    branches.find((branch) => branch.status && RUNNING_STATUSES.has(branch.status)) ??
    branches[0] ??
    null
  );
}

function gateKindFromCanonicalState(input: {
  branch: GateBranch | null;
  progress: Record<string, unknown>;
  rootCause: Record<string, unknown> | null;
  schedulerFrontier: Record<string, unknown> | null;
}): CanonicalReadbackGateKind {
  const branch = input.branch;
  const reasonCodes = [
    ...(branch?.reasonCodes ?? []),
    ...boundedStrings(input.progress.reasonCodes, 40),
    ...boundedStrings(input.rootCause?.reasonCodes, 40),
  ];
  const currentPhase =
    typeof input.progress.currentPhase === "string" ? input.progress.currentPhase : "";
  if (
    reasonCodes.some((code) => code.includes("structured_adapter_input_exceeds_policy_bound")) ||
    reasonCodes.some((code) => code.includes("discovery_brief_payload_over_profile"))
  ) {
    return "discovery_brief_payload_over_profile";
  }
  if (
    currentPhase === "requirement_map_authoring" ||
    currentPhase === "requirement_map_blocked" ||
    currentPhase === "requirement_map_compile" ||
    reasonCodes.some((code) => code.includes("requirement_map_authoring_blocked"))
  ) {
    return reasonCodes.some((code) => code.includes("requirement_map_authoring_blocked"))
      ? "requirement_map_blocked"
      : "requirement_map";
  }
  if (
    currentPhase === "implementation_discovery_brief_authoring" ||
    currentPhase === "implementation_discovery_brief_repair" ||
    reasonCodes.some((code) => code.includes("worker_discovery_brief_phase:implementation"))
  ) {
    return reasonCodes.some((code) => code.includes("discovery_brief_blocked"))
      ? "discovery_brief_blocked"
      : "discovery_brief_required";
  }
  if (
    reasonCodes.some(
      (code) => code.includes("discovery_brief_missing") || code.includes("discoveryBrief"),
    )
  ) {
    return "discovery_brief_missing";
  }
  if (
    reasonCodes.some(
      (code) => code.includes("discovery_brief_weak") || code.includes("discovery_brief_"),
    )
  ) {
    return "discovery_brief_weak";
  }
  if (
    reasonCodes.some(
      (code) =>
        code.includes("node_worker_prompt_authoring_failed") ||
        code.includes("node_worker_prompt_authoring_unavailable") ||
        code.includes("node_worker_prompt_missing_source_material") ||
        code.includes("node_agent_session_blocked") ||
        code.includes("node_agent_start_blocked") ||
        code.includes("node_agent_tool_policy_insufficient") ||
        code.includes("node_agent_required_scout_tool_policy_insufficient") ||
        code.includes("node_agent_skill_missing") ||
        code.includes("node_agent_asset_missing") ||
        code.includes("node_agent_workspace_boundary_invalid") ||
        code.includes("node_agent_session_lock_active") ||
        code.includes("node_agent_session_lock_owner_live") ||
        code.includes("node_agent_session_lock_unreclaimable") ||
        code.includes("node_agent_session_lock_acquisition_timeout"),
    )
  ) {
    return "node_agent_session_ready";
  }
  const projectionGate = explicitCanonicalGateKind(
    branch?.nodeLifecycleProjectionGate ?? input.progress.nodeLifecycleProjectionGate,
  );
  if (projectionGate) {
    return projectionGate;
  }
  const rootCauseGate = explicitCanonicalGateKind(
    input.rootCause?.nodeLifecycleProjectionGate ??
      input.rootCause?.currentGate ??
      input.rootCause?.gateKind,
  );
  if (rootCauseGate) {
    return rootCauseGate;
  }
  if (input.rootCause) {
    return "node_lifecycle_root_cause_collapsed";
  }
  if (bounded(input.progress.closeoutFinalizationState, 160)) {
    return "closeout";
  }
  return "missing_runtime_state";
}

function terminalGateKind(status: string): CanonicalReadbackGateKind {
  if (status === "succeeded" || status === "success" || status === "completed") {
    return "terminal_succeeded";
  }
  if (status === "failed" || status === "error") {
    return "terminal_failed";
  }
  return "terminal_needs_review";
}

function gateStatus(
  branch: GateBranch | null,
  terminalStatus: string | null,
  sourceKind: CanonicalReadbackGate["sourceKind"],
) {
  if (terminalStatus) {
    return "terminal";
  }
  if (sourceKind === "frontier_root_cause" || sourceKind === "no_progress_signature") {
    return "needs_review";
  }
  if (sourceKind === "scheduler_frontier") {
    return "blocked";
  }
  if (!branch) {
    return "missing";
  }
  if (Boolean(branch.blockerCode) || branch.missingFields.length > 0) {
    return "blocked";
  }
  if (branch.status && RUNNING_STATUSES.has(branch.status)) {
    return "running";
  }
  if (branch.status && READY_STATUSES.has(branch.status)) {
    return "ready";
  }
  if (branch.status === "needs_review" || branch.status === "failed") {
    return "needs_review";
  }
  return "blocked";
}

function sourceRefsFor(input: {
  rootCause: Record<string, unknown> | null;
  noProgress: Record<string, unknown> | null;
  branch: GateBranch | null;
  schedulerModelCallEnvelope: Record<string, unknown> | null;
}): string[] {
  return [
    bounded(input.branch?.rootCauseRef, 600),
    bounded(input.branch?.nodeLifecycleProjectionRef, 600),
    bounded(input.branch?.contractRef, 600),
    ...boundedStrings(input.branch?.nodeAgentStartReceiptRefs, 20),
    ...boundedStrings(input.branch?.nodeAgentSessionTraceRefs, 20),
    ...boundedStrings(input.branch?.nodeAgentFinishArtifactRefs, 20),
    ...boundedStrings(input.branch?.domainResourceSelectionRefs, 20),
    ...boundedStrings(input.branch?.providerDiagnosticRefs, 20),
    bounded(input.rootCause?.artifactRef, 600),
    bounded(input.rootCause?.rootCauseRef, 600),
    bounded(input.noProgress?.signatureRef, 600),
    bounded(input.schedulerModelCallEnvelope?.envelopeRef, 600),
  ]
    .filter((ref): ref is string => Boolean(ref))
    .slice(0, 20);
}

function progressHasIntakeGate(progress: Record<string, unknown>): boolean {
  const currentPhase = typeof progress.currentPhase === "string" ? progress.currentPhase : "";
  const schedulerPhase = typeof progress.schedulerPhase === "string" ? progress.schedulerPhase : "";
  const reasonCodes = boundedStrings(progress.reasonCodes, 40);
  return (
    currentPhase.startsWith("requirement_map_") ||
    currentPhase.startsWith("implementation_discovery_brief_") ||
    schedulerPhase.startsWith("requirement_map_") ||
    schedulerPhase.startsWith("implementation_discovery_brief_") ||
    reasonCodes.some((code) => code.startsWith("requirement_map_"))
  );
}

export function buildCanonicalReadbackGate(input: GateInput): CanonicalReadbackGate {
  const progress = input.progress ?? {};
  const latestRunCurrent = asRecord(input.latestRunState?.current);
  const latestRunFrontier = asRecord(input.latestRunState?.activeFrontier);
  const rootCause = input.rootCause ?? asRecord(latestRunFrontier?.rootCause);
  const noProgress = input.noProgress ?? asRecord(latestRunFrontier?.noProgress);
  const schedulerModelCallEnvelope =
    input.schedulerModelCallEnvelope ?? asRecord(input.latestRunState?.schedulerModelCallEnvelope);
  const branches = branchRecords(input);
  const branch = selectOwnerBranch(branches);
  const terminalStatus = firstBounded(input.terminalStatus, input.adapterTerminalStatus);
  const rootCauseMissingFields = boundedStrings(rootCause?.missingFields, 40);
  const rootCauseReasonCodes = boundedStrings(rootCause?.reasonCodes, 40);
  const schedulerMissingFields = boundedStrings(schedulerModelCallEnvelope?.missingFields, 20);
  const schedulerReasonCodes = boundedStrings(schedulerModelCallEnvelope?.reasonCodes, 40);
  const sourceKind: CanonicalReadbackGate["sourceKind"] = terminalStatus
    ? "terminal_outcome"
    : rootCause
      ? "frontier_root_cause"
      : noProgress
        ? "no_progress_signature"
        : branch
          ? branch.contractRef ||
            branch.nodeLifecycleProjectionRef ||
            branch.nodeAgentStartReceiptRefs.length > 0 ||
            branch.nodeAgentSessionTraceRefs.length > 0 ||
            branch.nodeAgentFinishArtifactRefs.length > 0 ||
            branch.domainResourceSelectionRefs.length > 0 ||
            branch.providerDiagnosticRefs.length > 0 ||
            branch.blockerCode
            ? "branch_scoped_frontier"
            : "latest_run_state"
          : input.schedulerFrontier
            ? "scheduler_frontier"
            : progressHasIntakeGate(progress)
              ? "latest_run_state"
              : "missing";
  const confidence: CanonicalReadbackGate["confidence"] =
    sourceKind === "latest_run_state" || sourceKind === "missing" ? "derived" : "canonical";
  const gateKind = terminalStatus
    ? terminalGateKind(terminalStatus)
    : sourceKind === "missing"
      ? "missing_runtime_state"
      : gateKindFromCanonicalState({
          branch,
          progress,
          rootCause,
          schedulerFrontier: input.schedulerFrontier ?? null,
        });

  return {
    artifactKind: "execution_platform.canonical_readback_gate",
    schemaVersion: "execution-platform.canonical-readback-gate.v1",
    state: sourceKind === "missing" ? "missing" : "present",
    gateKind,
    gateStatus: gateStatus(branch, terminalStatus, sourceKind),
    confidence,
    sourceKind,
    sourceRefs: sourceRefsFor({
      rootCause,
      noProgress,
      branch,
      schedulerModelCallEnvelope,
    }),
    graphId: firstBounded(input.graphId, progress.graphId, latestRunFrontier?.graphId),
    branchId: branch?.branchId ?? null,
    nodeId: firstBounded(branch?.nodeId, progress.nodeId, latestRunCurrent?.nodeId),
    nodeKind: firstBounded(branch?.nodeKind, progress.nodeKind, progress.activeNodeKind),
    workIntentRef: firstBounded(
      branch?.workIntentRef,
      progress.workIntentRef,
      progress.workIntentId,
    ),
    executionIntent: firstBounded(branch?.executionIntent, progress.executionIntent),
    evidenceMode: [
      ...new Set([
        ...(branch?.evidenceMode ?? []),
        ...boundedStrings(progress.evidenceMode, 12),
        ...boundedStrings(latestRunCurrent?.evidenceMode, 12),
      ]),
    ].slice(0, 12),
    capabilityId: firstBounded(
      branch?.capabilityId,
      progress.capabilityId,
      progress.selectedCapabilityId,
    ),
    executorKey: firstBounded(
      branch?.executorKey,
      progress.executorKey,
      progress.selectedExecutorKey,
    ),
    workerRef: firstBounded(branch?.workerRef, progress.workerRef, latestRunCurrent?.workerRef),
    modelRef: firstBounded(branch?.modelRef, progress.modelRef, latestRunCurrent?.modelRef),
    providerPath: firstBounded(progress.providerPath, latestRunCurrent?.providerPath),
    contractRef: firstBounded(
      branch?.contractRef,
      boundedStrings(rootCause?.contractRefs, 1)[0],
      progress.nodeExecutionContractRef,
    ),
    nodeExecutionSnapshotRef: firstBounded(
      branch?.nodeExecutionSnapshotRef,
      progress.nodeExecutionSnapshotRef,
    ),
    nodeWorkerPromptRef: firstBounded(
      branch?.nodeWorkerPromptRef,
      progress.nodeWorkerPromptRef,
      latestRunCurrent?.nodeWorkerPromptRef,
    ),
    nodeWorkerPromptArtifactRef: firstBounded(
      branch?.nodeWorkerPromptArtifactRef,
      progress.nodeWorkerPromptArtifactRef,
      latestRunCurrent?.nodeWorkerPromptArtifactRef,
    ),
    nodeWorkerPromptHash: firstBounded(
      branch?.nodeWorkerPromptHash,
      progress.nodeWorkerPromptHash,
      latestRunCurrent?.nodeWorkerPromptHash,
    ),
    nodeWorkerPromptByteCount:
      numberOrNull(branch?.nodeWorkerPromptByteCount) ??
      numberOrNull(progress.nodeWorkerPromptByteCount) ??
      numberOrNull(latestRunCurrent?.nodeWorkerPromptByteCount),
    nodeWorkerPromptStatus: firstBounded(
      branch?.nodeWorkerPromptStatus,
      progress.nodeWorkerPromptStatus,
      latestRunCurrent?.nodeWorkerPromptStatus,
    ),
    nodeWorkerPromptAuthorModelRunRef: firstBounded(
      branch?.nodeWorkerPromptAuthorModelRunRef,
      progress.nodeWorkerPromptAuthorModelRunRef,
      latestRunCurrent?.nodeWorkerPromptAuthorModelRunRef,
    ),
    nodeAgentSessionKey: firstBounded(
      branch?.nodeAgentSessionKey,
      progress.nodeAgentSessionKey,
      latestRunCurrent?.nodeAgentSessionKey,
    ),
    nodeAgentSessionMessageId: firstBounded(
      branch?.nodeAgentSessionMessageId,
      progress.nodeAgentSessionMessageId,
      latestRunCurrent?.nodeAgentSessionMessageId,
    ),
    nodeAgentSessionTranscriptRef: firstBounded(
      branch?.nodeAgentSessionTranscriptRef,
      progress.nodeAgentSessionTranscriptRef,
      latestRunCurrent?.nodeAgentSessionTranscriptRef,
    ),
    nodeAgentInitialMessageHash: firstBounded(
      branch?.nodeAgentInitialMessageHash,
      progress.nodeAgentInitialMessageHash,
      latestRunCurrent?.nodeAgentInitialMessageHash,
    ),
    nodeAgentPromptSessionHashMatch:
      booleanOrNull(branch?.nodeAgentPromptSessionHashMatch) ??
      booleanOrNull(progress.nodeAgentPromptSessionHashMatch) ??
      booleanOrNull(latestRunCurrent?.nodeAgentPromptSessionHashMatch),
    nodeAgentStartReceiptRef: firstBounded(
      branch?.nodeAgentStartReceiptRef,
      progress.nodeAgentStartReceiptRef,
      latestRunCurrent?.nodeAgentStartReceiptRef,
    ),
    nodeAgentStartStatus: firstBounded(
      branch?.nodeAgentStartStatus,
      progress.nodeAgentStartStatus,
      latestRunCurrent?.nodeAgentStartStatus,
    ),
    nodeAgentStartBlockerKind: firstBounded(
      branch?.nodeAgentStartBlockerKind,
      progress.nodeAgentStartBlockerKind,
      latestRunCurrent?.nodeAgentStartBlockerKind,
    ),
    nodeLifecycleProjectionRef: firstBounded(
      branch?.nodeLifecycleProjectionRef,
      progress.nodeLifecycleProjectionRef,
      latestRunCurrent?.nodeLifecycleProjectionRef,
    ),
    nodeLifecycleProjectionGate: firstBounded(
      branch?.nodeLifecycleProjectionGate,
      progress.nodeLifecycleProjectionGate,
      latestRunCurrent?.nodeLifecycleProjectionGate,
    ),
    domainSourceMaterialRef: firstBounded(
      branch?.domainSourceMaterialRef,
      progress.domainSourceMaterialRef,
    ),
    sourceMaterialRef: firstBounded(branch?.sourceMaterialRef, progress.sourceMaterialRef),
    sourceMaterialRequirementRefs: [
      ...new Set([
        ...(branch?.sourceMaterialRequirementRefs ?? []),
        ...boundedStrings(progress.sourceMaterialRequirementRefs, 20),
      ]),
    ].slice(0, 20),
    nodeAgentStartReceiptRefs: [
      ...new Set(
        [
          ...(branch?.nodeAgentStartReceiptRefs ?? []),
          ...boundedStrings(progress.nodeAgentStartReceiptRefs, 20),
          bounded(progress.nodeAgentStartReceiptRef, 600),
          ...boundedStrings(latestRunCurrent?.nodeAgentStartReceiptRefs, 20),
          bounded(latestRunCurrent?.nodeAgentStartReceiptRef, 600),
        ].filter((ref): ref is string => Boolean(ref)),
      ),
    ].slice(0, 20),
    nodeAgentSessionTraceRefs: [
      ...new Set([
        ...(branch?.nodeAgentSessionTraceRefs ?? []),
        ...boundedStrings(progress.nodeAgentSessionTraceRefs, 20),
        ...boundedStrings(latestRunCurrent?.nodeAgentSessionTraceRefs, 20),
      ]),
    ].slice(0, 20),
    nodeAgentFinishArtifactRefs: [
      ...new Set([
        ...(branch?.nodeAgentFinishArtifactRefs ?? []),
        ...boundedStrings(progress.nodeFinishArtifactRefs, 20),
        ...boundedStrings(latestRunCurrent?.nodeFinishArtifactRefs, 20),
      ]),
    ].slice(0, 20),
    domainResourceSelectionRefs: [
      ...new Set([
        ...(branch?.domainResourceSelectionRefs ?? []),
        ...boundedStrings(progress.domainResourceSelectionRefs, 20),
        ...boundedStrings(latestRunCurrent?.domainResourceSelectionRefs, 20),
      ]),
    ].slice(0, 20),
    actionGateStatus: firstBounded(
      branch?.actionGateStatus,
      progress.actionGateStatus,
      latestRunCurrent?.actionGateStatus,
    ),
    providerDiagnosticRefs: [
      ...new Set([
        ...(branch?.providerDiagnosticRefs ?? []),
        ...boundedStrings(progress.providerDiagnosticRefs, 20),
        ...boundedStrings(latestRunCurrent?.providerDiagnosticRefs, 20),
      ]),
    ].slice(0, 20),
    providerDiagnosticStatus: firstBounded(
      branch?.providerDiagnosticStatus,
      progress.providerDiagnosticStatus,
      latestRunCurrent?.providerDiagnosticStatus,
    ),
    blockerCode: firstBounded(
      branch?.blockerCode,
      rootCause?.terminalBlockerCode,
      noProgress?.terminalBlockerCode,
      progress.blockerCode,
    ),
    blockerSummary: firstBounded(branch?.blockerSummary, progress.blockerSummary),
    missingFields: [
      ...new Set([
        ...(branch?.missingFields ?? []),
        ...rootCauseMissingFields,
        ...schedulerMissingFields,
      ]),
    ].slice(0, 40),
    schemaPath: firstBounded(
      branch?.schemaPath,
      boundedStrings(rootCause?.schemaErrorPaths, 1)[0],
      schedulerModelCallEnvelope?.schemaErrorPath,
      progress.schemaPath,
      progress.errorPath,
    ),
    policyPath: firstBounded(
      branch?.policyPath,
      boundedStrings(rootCause?.policyErrorPaths, 1)[0],
      schedulerModelCallEnvelope?.policyErrorPath,
      progress.policyPath,
    ),
    reasonCodes: [
      ...new Set([
        ...(branch?.reasonCodes ?? []),
        ...rootCauseReasonCodes,
        ...boundedStrings(noProgress?.reasonCodes, 40),
        ...boundedStrings(noProgress?.blockerReasonCodes, 40),
        ...schedulerReasonCodes,
        ...boundedStrings(progress.reasonCodes, 40),
      ]),
    ].slice(0, 60),
    nextLegalTransition: firstBounded(
      branch?.nextLegalTransitions[0],
      boundedStrings(rootCause?.nextLegalTransitions, 1)[0],
      input.schedulerFrontier?.nextLegalTransition,
      latestRunFrontier?.schedulerNextLegalTransition,
      latestRunFrontier?.nextTransition,
      progress.nextDecisionNeeded,
    ),
    dependentConsumers: branch?.dependentConsumers ?? [],
    consumerRefs: branch?.consumerRefs ?? [],
    successfulSiblingEvidenceRefs: [
      ...new Set([
        ...(branch?.successfulSiblingEvidenceRefs ?? []),
        ...boundedStrings(rootCause?.successfulSiblingEvidenceRefs, 20),
      ]),
    ].slice(0, 20),
    failedEvidenceRefs: branch?.failedEvidenceRefs ?? [],
    validationPhase: firstBounded(branch?.validationPhase, progress.validationPhase),
    validationPhaseCompatibility: firstBounded(
      branch?.validationPhaseCompatibility,
      progress.validationPhaseCompatibility,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}
