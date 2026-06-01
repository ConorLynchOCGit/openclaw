export type CanonicalReadbackGateKind =
  | "missing_runtime_state"
  | "prompt_submission"
  | "front_door_routing"
  | "mission_ledger"
  | "obligation_graph"
  | "graph_compile_invalid"
  | "work_intent_compile"
  | "resource_requirement_compile"
  | "resource_narrowing_required"
  | "resource_scope_revision_required"
  | "resource_scope_revision_blocked"
  | "resource_ledger_ready"
  | "resource_repair"
  | "domain_resource_selection_required"
  | "domain_resource_selection_blocked"
  | "resource_materialization"
  | "domain_action_gate_blocked"
  | "worker_action_ready"
  | "worker_context_window_required"
  | "worker_edit_plan_required"
  | "worker_patch_author_required"
  | "split_child_contract"
  | "frontier_execution"
  | "worker_execution"
  | "post_action_validation"
  | "evidence_closure"
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
  confidence: "canonical" | "derived" | "stale_checkpoint_fallback";
  sourceKind:
    | "terminal_outcome"
    | "frontier_root_cause"
    | "no_progress_signature"
    | "branch_scoped_frontier"
    | "node_readiness_state"
    | "scheduler_frontier"
    | "latest_run_state"
    | "checkpoint_boundary"
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
  nodeExecutionPacketRef: string | null;
  readinessStateRef: string | null;
  domainResourcePacketRef: string | null;
  resourcePacketRef: string | null;
  resourceRequirementRefs: string[];
  nodeResourceDemandSessionRefs: string[];
  nodeResourceLedgerManifestRefs: string[];
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
  readinessProjectionStatus: string | null;
  readinessProjectionDriftReasonCodes: string[];
  readinessProjectionMissingFields: string[];
  readinessProjectionStale: boolean | null;
  staleCheckpointKind: string | null;
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
  checkpointKind?: unknown;
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
  readinessStateRef: string | null;
  resourceRequirementRefs: string[];
  nodeResourceDemandSessionRefs: string[];
  nodeResourceLedgerManifestRefs: string[];
  domainResourceSelectionRefs: string[];
  actionGateStatus: string | null;
  providerDiagnosticRefs: string[];
  providerDiagnosticStatus: string | null;
  domainResourcePacketRef: string | null;
  resourcePacketRef: string | null;
  nodeExecutionPacketRef: string | null;
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
  readinessProjectionStatus: string | null;
  readinessProjectionDriftReasonCodes: string[];
  readinessProjectionMissingFields: string[];
  readinessProjectionStale: boolean | null;
};

const BLOCKED_STATUSES = new Set([
  "blocked",
  "blocked_resource",
  "blocked_context",
  "needs_review",
  "failed",
  "resources_required",
  "resource_required",
  "materialization_blocked",
]);

const RUNNING_STATUSES = new Set(["running", "in_progress", "executing"]);
const READY_STATUSES = new Set(["ready", "executable", "selected"]);

const CONTEXT_PHASES = new Set([
  "resource_requirement_compile",
  "resource_repair",
  "resource_frontier_single_unit_blocked",
  "resource_frontier_shard_execution_required",
  "resource_frontier_merge_required",
  "resource_frontier_review_required",
  "resource_specialist_execution_packet_blocked",
  "create_prerequisite_resource",
]);

const CONTEXT_SCOPE_REVISION_REQUIRED_PHASES = new Set([
  "resource_scope_revision_required",
  "resource_single_unit_over_profile",
  "resource_frontier_single_unit_blocked",
]);

const CONTEXT_SCOPE_REVISION_BLOCKED_PHASES = new Set([
  "resource_scope_revision_blocked",
  "resource_scope_revision_needs_review",
]);

const CONTEXT_SCOPE_REVISION_REASON_CODES = new Set([
  "resource_scope_revision_required",
  "resource_single_unit_over_profile",
  "resource_unit_over_profile",
  "resource_requirement_over_profile",
  "resource_requirement_payload_over_profile",
]);

const CONTEXT_SCOPE_REVISION_BLOCKED_REASON_CODES = new Set([
  "resource_scope_revision_blocked",
  "resource_scope_revision_failed",
  "resource_scope_revision_selection_invalid",
  "resource_scope_revision_no_legal_subset",
]);

const CONTEXT_SCOPE_REVISION_TRANSITIONS = new Set([
  "select_resource_scope",
  "revise_resource_scope",
  "compile_revised_resource_scope",
  "execute_resource_scope_revision",
]);

const CONTEXT_LEDGER_READY_PHASES = new Set([
  "resource_ledger_ready",
  "node_resource_ledger_ready",
]);

const DOMAIN_RESOURCE_SELECTION_PHASES = new Set([
  "domain_resource_selection_blocked",
  "domain_resource_selection_revision_required",
]);

const DOMAIN_RESOURCE_SELECTION_REQUIRED_PHASES = new Set([
  "domain_resource_selection_required",
  "domain_resource_selection_missing",
]);

const DOMAIN_RESOURCE_SELECTION_REQUIRED_REASON_CODES = new Set([
  "domain_resource_selection_required",
  "domain_resource_selection_missing",
  "model_authored_domain_resource_selection_required",
  "source_edit_domain_resource_selection_required",
  "domain_resource_selection_ref_missing",
]);

const DOMAIN_RESOURCE_SELECTION_TRANSITIONS = new Set([
  "select_domain_resource_refs",
  "revise_domain_resource_selection",
  "compile_domain_resource_selection",
]);

const ACTION_GATE_BLOCKED_PHASES = new Set([
  "domain_action_gate_blocked",
  "hydrated_domain_action_gate_blocked",
  "worker_domain_action_gate_blocked",
]);

const ACTION_GATE_TRANSITIONS = new Set([
  "hydrate_action_gate",
  "open_worker_action_gate",
  "compile_hydrated_node_execution_packet",
]);

const WORKER_EDIT_READY_PHASES = new Set([
  "worker_action_ready",
  "forced_action_author_ready",
  "worker_action_author_ready",
]);

const EVIDENCE_CLOSURE_PHASES = new Set([
  "evidence_closure",
  "evidence_closure_blocked",
  "evidence_claim_required",
]);

const EVIDENCE_CLOSURE_TRANSITIONS = new Set([
  "compile_evidence_claims",
  "close_evidence",
  "review_evidence_closure",
]);

const CONTEXT_TRANSITIONS = new Set([
  "compile_resource_requirement_packet",
  "create_prerequisite_resource",
  "repair_resource",
  "split_for_profile",
  "execute_shards_then_merge_handoffs",
  "record_single_unit_blocker",
  "merge_handoffs",
]);

const WORKER_PHASES = new Set([
  "worker_execution",
  "execute_node",
  "worker.patch",
  "worker_loop",
  "worker_loop_completed",
]);

const VALIDATION_PHASES = new Set([
  "post_action_validation",
  "review_validation",
  "closeout_validation",
  "pre_execution_validation",
]);

const CHECKPOINT_GATE_KIND: Record<string, CanonicalReadbackGateKind> = {
  prompt_submission: "prompt_submission",
  front_door_routing: "front_door_routing",
  mission_ledger: "mission_ledger",
  obligation_graph: "obligation_graph",
  work_intent_compile: "work_intent_compile",
  resource_requirement_compile: "resource_requirement_compile",
  resource_scope_revision_required: "resource_scope_revision_required",
  resource_scope_revision_blocked: "resource_scope_revision_blocked",
  resource_ledger_ready: "resource_ledger_ready",
  resource_repair: "resource_repair",
  domain_resource_selection_required: "domain_resource_selection_required",
  domain_resource_selection_blocked: "domain_resource_selection_blocked",
  resource_materialization: "resource_materialization",
  domain_action_gate_blocked: "domain_action_gate_blocked",
  worker_action_ready: "worker_action_ready",
  split_child_contract: "split_child_contract",
  before_worker_invocation: "worker_execution",
  worker_execution: "worker_execution",
  after_worker_result: "post_action_validation",
  post_action_validation: "post_action_validation",
  evidence_closure: "evidence_closure",
  review_validation: "review_validation",
  before_closeout: "closeout",
  closeout: "closeout",
};

const CANONICAL_READBACK_GATE_KIND_VALUES = new Set<CanonicalReadbackGateKind>([
  "missing_runtime_state",
  "prompt_submission",
  "front_door_routing",
  "mission_ledger",
  "obligation_graph",
  "graph_compile_invalid",
  "work_intent_compile",
  "resource_requirement_compile",
  "resource_narrowing_required",
  "resource_scope_revision_required",
  "resource_scope_revision_blocked",
  "resource_ledger_ready",
  "resource_repair",
  "domain_resource_selection_required",
  "domain_resource_selection_blocked",
  "resource_materialization",
  "domain_action_gate_blocked",
  "worker_action_ready",
  "worker_context_window_required",
  "worker_edit_plan_required",
  "worker_patch_author_required",
  "split_child_contract",
  "frontier_execution",
  "worker_execution",
  "post_action_validation",
  "evidence_closure",
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
  const mapped = CHECKPOINT_GATE_KIND[normalized];
  if (mapped) {
    return mapped;
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
          value
            .map((item) => bounded(item, 500))
            .filter((item): item is string => Boolean(item)),
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
    readinessStateRef: firstBounded(branch.readinessStateRef, branch.readinessRef),
    resourceRequirementRefs: boundedStrings(branch.resourceRequirementRefs, 20),
    nodeResourceDemandSessionRefs: [
      ...new Set([
        ...boundedStrings(branch.nodeResourceDemandSessionRefs, 20),
        bounded(branch.nodeResourceDemandSessionRef, 600),
      ].filter((ref): ref is string => Boolean(ref))),
    ].slice(0, 20),
    nodeResourceLedgerManifestRefs: [
      ...new Set([
        ...boundedStrings(branch.nodeResourceLedgerManifestRefs, 20),
        bounded(branch.nodeResourceLedgerManifestRef, 600),
      ].filter((ref): ref is string => Boolean(ref))),
    ].slice(0, 20),
    domainResourceSelectionRefs: [
      ...new Set([
        ...boundedStrings(branch.domainResourceSelectionRefs, 20),
        bounded(branch.domainResourceSelectionRef, 600),
      ].filter((ref): ref is string => Boolean(ref))),
    ].slice(0, 20),
    actionGateStatus: bounded(branch.actionGateStatus, 160),
    providerDiagnosticRefs: [
      ...new Set([
        ...boundedStrings(branch.providerDiagnosticRefs, 20),
        bounded(branch.providerDiagnosticRef, 600),
      ].filter((ref): ref is string => Boolean(ref))),
    ].slice(0, 20),
    providerDiagnosticStatus: bounded(branch.providerDiagnosticStatus, 160),
    domainResourcePacketRef: bounded(branch.domainResourcePacketRef, 600),
    resourcePacketRef: bounded(branch.resourcePacketRef, 600),
    nodeExecutionPacketRef: bounded(branch.nodeExecutionPacketRef, 600),
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
    readinessProjectionStatus: bounded(branch.readinessProjectionStatus, 160),
    readinessProjectionDriftReasonCodes: boundedStrings(
      branch.readinessProjectionDriftReasonCodes,
      40,
    ),
    readinessProjectionMissingFields: boundedStrings(
      branch.readinessProjectionMissingFields,
      40,
    ),
    readinessProjectionStale:
      typeof branch.readinessProjectionStale === "boolean"
        ? branch.readinessProjectionStale
        : typeof branch.nodeReadinessStale === "boolean"
          ? branch.nodeReadinessStale
          : null,
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
            readinessStateRef: progress.nodeReadinessStateRef,
            resourceRequirementRefs: progress.resourceRequirementRefs,
            nodeResourceDemandSessionRefs: progress.nodeResourceDemandSessionRefs,
            nodeResourceLedgerManifestRefs: progress.nodeResourceLedgerManifestRefs,
            domainResourceSelectionRefs: progress.domainResourceSelectionRefs,
            actionGateStatus: progress.actionGateStatus,
            providerDiagnosticRefs: progress.providerDiagnosticRefs,
            providerDiagnosticStatus: progress.providerDiagnosticStatus,
            resourcePacketRef: progress.resourcePacketRef,
            nodeExecutionPacketRef: progress.nodeExecutionPacketRef,
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
            reasonCodes: [
              ...boundedStrings(progress.resourceReadinessReasonCodes, 40),
              ...boundedStrings(progress.readinessProjectionDriftReasonCodes, 40),
              ...boundedStrings(progress.reasonCodes, 40),
            ],
            missingFields: [
              ...boundedStrings(progress.missingFields, 40),
              ...boundedStrings(progress.readinessProjectionMissingFields, 40),
            ],
            nextLegalTransitions: progress.nodeLifecycleNextLegalTransitions,
            validationPhase: progress.validationPhase,
            validationPhaseCompatibility: progress.validationPhaseCompatibility,
            readinessProjectionStatus: progress.readinessProjectionStatus,
            readinessProjectionDriftReasonCodes: progress.readinessProjectionDriftReasonCodes,
            readinessProjectionMissingFields: progress.readinessProjectionMissingFields,
            readinessProjectionStale: progress.nodeReadinessStale,
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
  const projectionGate = explicitCanonicalGateKind(
    branch?.nodeLifecycleProjectionGate ?? input.progress.nodeLifecycleProjectionGate,
  );
  if (projectionGate) {
    const nextTransition = firstBounded(
      branch?.nextLegalTransitions[0],
      boundedStrings(input.progress.nodeLifecycleNextLegalTransitions, 1)[0],
      input.progress.nextDecisionNeeded,
    );
    if (projectionGate === "worker_action_ready") {
      if (nextTransition === "worker.edit.plan") {
        return "worker_edit_plan_required";
      }
      if (
        nextTransition === "worker.context.request_more" ||
        nextTransition === "worker.context.search" ||
        nextTransition === "worker.context.accept_window"
      ) {
        return "worker_context_window_required";
      }
      if (
        nextTransition === "worker.patch.force_author_from_plan" ||
        nextTransition === "worker.patch.author_edit"
      ) {
        return "worker_patch_author_required";
      }
    }
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
  if (sourceKind === "scheduler_frontier" || sourceKind === "checkpoint_boundary") {
    return "blocked";
  }
  if (!branch) {
    return "missing";
  }
  if (
    Boolean(branch.blockerCode) ||
      branch.missingFields.length > 0 ||
      branch.readinessProjectionStale === true
  ) {
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
    bounded(input.branch?.readinessStateRef, 600),
    ...boundedStrings(input.branch?.nodeResourceDemandSessionRefs, 20),
    ...boundedStrings(input.branch?.nodeResourceLedgerManifestRefs, 20),
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
  const checkpointKind = bounded(input.checkpointKind, 220);
  const rootCauseMissingFields = boundedStrings(rootCause?.missingFields, 40);
  const rootCauseReasonCodes = boundedStrings(rootCause?.reasonCodes, 40);
  const schedulerMissingFields = boundedStrings(schedulerModelCallEnvelope?.missingFields, 20);
  const schedulerReasonCodes = boundedStrings(schedulerModelCallEnvelope?.reasonCodes, 40);
  const terminalReasonCodes = [
    ...(branch?.reasonCodes ?? []),
    ...rootCauseReasonCodes,
    ...boundedStrings(noProgress?.reasonCodes, 40),
    ...boundedStrings(noProgress?.blockerReasonCodes, 40),
    ...schedulerReasonCodes,
    ...boundedStrings(progress.reasonCodes, 40),
  ];
  const sourceKind: CanonicalReadbackGate["sourceKind"] = terminalStatus
    ? "terminal_outcome"
    : rootCause
      ? "frontier_root_cause"
      : noProgress
        ? "no_progress_signature"
        : branch
          ? branch.contractRef ||
            branch.nodeLifecycleProjectionRef ||
            branch.readinessStateRef ||
            branch.nodeResourceDemandSessionRefs.length > 0 ||
            branch.nodeResourceLedgerManifestRefs.length > 0 ||
            branch.domainResourceSelectionRefs.length > 0 ||
            branch.providerDiagnosticRefs.length > 0 ||
            branch.blockerCode
            ? "branch_scoped_frontier"
            : "latest_run_state"
          : input.schedulerFrontier
            ? "scheduler_frontier"
            : checkpointKind
              ? "checkpoint_boundary"
              : "missing";
  const confidence: CanonicalReadbackGate["confidence"] =
    sourceKind === "checkpoint_boundary"
      ? "stale_checkpoint_fallback"
      : sourceKind === "latest_run_state"
        ? "derived"
        : sourceKind === "missing"
          ? "derived"
          : "canonical";
  const gateKind = terminalStatus
    ? terminalGateKind(terminalStatus)
    : sourceKind === "checkpoint_boundary"
      ? (CHECKPOINT_GATE_KIND[checkpointKind!] ?? "missing_runtime_state")
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
    workIntentRef: firstBounded(branch?.workIntentRef, progress.workIntentRef, progress.workIntentId),
    executionIntent: firstBounded(branch?.executionIntent, progress.executionIntent),
    evidenceMode: [
      ...new Set([
        ...(branch?.evidenceMode ?? []),
        ...boundedStrings(progress.evidenceMode, 12),
        ...boundedStrings(latestRunCurrent?.evidenceMode, 12),
      ]),
    ].slice(0, 12),
    capabilityId: firstBounded(branch?.capabilityId, progress.capabilityId, progress.selectedCapabilityId),
    executorKey: firstBounded(branch?.executorKey, progress.executorKey, progress.selectedExecutorKey),
    workerRef: firstBounded(branch?.workerRef, progress.workerRef, latestRunCurrent?.workerRef),
    modelRef: firstBounded(branch?.modelRef, progress.modelRef, latestRunCurrent?.modelRef),
    providerPath: firstBounded(progress.providerPath, latestRunCurrent?.providerPath),
    contractRef: firstBounded(
      branch?.contractRef,
      boundedStrings(rootCause?.contractRefs, 1)[0],
      progress.nodeExecutionContractRef,
    ),
    nodeExecutionPacketRef: firstBounded(branch?.nodeExecutionPacketRef, progress.nodeExecutionPacketRef),
    readinessStateRef: firstBounded(
      branch?.readinessStateRef,
      progress.nodeReadinessStateRef,
      latestRunCurrent?.readinessStateRef,
    ),
    domainResourcePacketRef: firstBounded(branch?.domainResourcePacketRef, progress.domainResourcePacketRef),
    resourcePacketRef: firstBounded(branch?.resourcePacketRef, progress.resourcePacketRef),
    resourceRequirementRefs: [
      ...new Set([
        ...(branch?.resourceRequirementRefs ?? []),
        ...boundedStrings(progress.resourceRequirementRefs, 20),
      ]),
    ].slice(0, 20),
    nodeResourceDemandSessionRefs: [
      ...new Set([
        ...(branch?.nodeResourceDemandSessionRefs ?? []),
        ...boundedStrings(progress.nodeResourceDemandSessionRefs, 20),
        ...boundedStrings(latestRunCurrent?.nodeResourceDemandSessionRefs, 20),
      ]),
    ].slice(0, 20),
    nodeResourceLedgerManifestRefs: [
      ...new Set([
        ...(branch?.nodeResourceLedgerManifestRefs ?? []),
        ...boundedStrings(progress.nodeResourceLedgerManifestRefs, 20),
        ...boundedStrings(latestRunCurrent?.nodeResourceLedgerManifestRefs, 20),
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
        ...(confidence === "stale_checkpoint_fallback" ? ["stale_checkpoint_fallback"] : []),
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
    readinessProjectionStatus: firstBounded(
      branch?.readinessProjectionStatus,
      progress.readinessProjectionStatus,
      latestRunCurrent?.readinessProjectionStatus,
    ),
    readinessProjectionDriftReasonCodes: [
      ...new Set([
        ...(branch?.readinessProjectionDriftReasonCodes ?? []),
        ...boundedStrings(progress.readinessProjectionDriftReasonCodes, 40),
        ...boundedStrings(latestRunCurrent?.readinessProjectionDriftReasonCodes, 40),
      ]),
    ].slice(0, 40),
    readinessProjectionMissingFields: [
      ...new Set([
        ...(branch?.readinessProjectionMissingFields ?? []),
        ...boundedStrings(progress.readinessProjectionMissingFields, 40),
        ...boundedStrings(latestRunCurrent?.readinessProjectionMissingFields, 40),
      ]),
    ].slice(0, 40),
    readinessProjectionStale:
      branch?.readinessProjectionStale ??
      (typeof progress.nodeReadinessStale === "boolean"
        ? progress.nodeReadinessStale
        : typeof latestRunCurrent?.readinessStale === "boolean"
          ? latestRunCurrent.readinessStale
          : null),
    staleCheckpointKind: confidence === "stale_checkpoint_fallback" ? checkpointKind : null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}
