export const BOUNDARY_REPLAY_REGISTRY_VERSION = "execution-platform.boundary-replay-registry.v1";

export const BOUNDARY_REPLAY_CHECKPOINT_KINDS = [
  "router_payload",
  "requirement_map",
  "work_intent_graph",
  "before_expansion_admission",
  "after_expansion_admission",
  "before_graph_patch_write",
  "after_graph_patch_write",
  "graph_compile",
  "node_selection",
  "before_worker_invocation",
  "worker_execution",
  "after_worker_edit",
  "before_validation",
  "validation_repair",
  "after_validation",
  "review_qa",
  "before_closeout",
  "closeout_finalization",
  "work_queue_readback",
] as const;

export type BoundaryReplayCheckpointKind = (typeof BOUNDARY_REPLAY_CHECKPOINT_KINDS)[number];

export const BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS = [
  "after_requirement_map",
  "after_work_intent_acceptance",
  "before_worker_execution",
  "after_worker_edit_before_persistence",
] as const;

export type BoundaryReplayProductionProofBoundaryId =
  (typeof BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS)[number];

const PRODUCTION_PROOF_BOUNDARY_TO_CHECKPOINT_KIND: Record<
  BoundaryReplayProductionProofBoundaryId,
  BoundaryReplayCheckpointKind
> = {
  after_requirement_map: "requirement_map",
  after_work_intent_acceptance: "work_intent_graph",
  before_worker_execution: "before_worker_invocation",
  after_worker_edit_before_persistence: "after_worker_edit",
};

export const BOUNDARY_REPLAY_CLI_BOUNDARY_ALIASES = [
  "after-graph-selection",
  "after-requirement-map",
  "after-work-intent-acceptance",
  "before-worker-execution",
  "after-worker-edit-before-persistence",
] as const;

export type BoundaryReplayCliBoundaryAlias = (typeof BOUNDARY_REPLAY_CLI_BOUNDARY_ALIASES)[number];

const BOUNDARY_REPLAY_CLI_ALIAS_TO_CHECKPOINT_KIND: Record<
  BoundaryReplayCliBoundaryAlias,
  BoundaryReplayCheckpointKind
> = {
  "after-graph-selection": "node_selection",
  "after-requirement-map": "requirement_map",
  "after-work-intent-acceptance": "work_intent_graph",
  "before-worker-execution": "before_worker_invocation",
  "after-worker-edit-before-persistence": "after_worker_edit",
};

export function boundaryReplayCheckpointKindForCliAlias(
  alias: string | null | undefined,
): BoundaryReplayCheckpointKind | null {
  const normalized = (alias ?? "").trim();
  return BOUNDARY_REPLAY_CLI_BOUNDARY_ALIASES.includes(normalized as BoundaryReplayCliBoundaryAlias)
    ? BOUNDARY_REPLAY_CLI_ALIAS_TO_CHECKPOINT_KIND[normalized as BoundaryReplayCliBoundaryAlias]
    : null;
}

export function boundaryReplayCheckpointKindForProofBoundaryId(
  boundaryId: string | null | undefined,
): BoundaryReplayCheckpointKind | null {
  const normalized = (boundaryId ?? "").trim();
  return BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS.includes(
    normalized as BoundaryReplayProductionProofBoundaryId,
  )
    ? PRODUCTION_PROOF_BOUNDARY_TO_CHECKPOINT_KIND[
        normalized as BoundaryReplayProductionProofBoundaryId
      ]
    : null;
}

export function boundaryReplayProofBoundaryIdForCheckpointKind(
  checkpointKind: BoundaryReplayCheckpointKind,
): BoundaryReplayProductionProofBoundaryId | null {
  for (const [boundaryId, kind] of Object.entries(PRODUCTION_PROOF_BOUNDARY_TO_CHECKPOINT_KIND)) {
    if (kind === checkpointKind) {
      return boundaryId as BoundaryReplayProductionProofBoundaryId;
    }
  }
  return null;
}

export type BoundaryReplayBoundaryDefinition = {
  artifactKind: "boundary_replay_boundary_definition";
  registryVersion: typeof BOUNDARY_REPLAY_REGISTRY_VERSION;
  checkpointKind: BoundaryReplayCheckpointKind;
  productionProofBoundaryId: BoundaryReplayProductionProofBoundaryId | null;
  productionProofSequenceIndex: number | null;
  workflowApplicability: "workflow_agnostic";
  productionPathEquivalence: "production_equivalent" | "diagnostic_only";
  sourceCheckpointVersion: "execution-platform.boundary-replay-checkpoint.v1";
  allowedSyntheticArtifacts: string[];
  forbiddenSyntheticArtifacts: string[];
  requiredUpstreamCheckpointKinds: BoundaryReplayCheckpointKind[];
  versionedNormalizers: Array<{
    normalizerId: string;
    inputSchemaVersion: string;
    outputSchemaVersion: string;
    failClosedReasonCodes: string[];
  }>;
  resumeCommand: {
    runtimeEntryPoint: "GenericOrchestrationRuntime.runSchedulerGraph";
    schedulerEntryPoint: "RuntimeWorkGraphScheduler.run";
    defaultContinuationMode:
      | "continue_scheduler"
      | "run_node"
      | "repair_boundary"
      | "finalize_closeout"
      | "diagnostic_only";
  };
  allowedNextTransitions: Array<
    "continue_scheduler" | "run_node" | "repair_boundary" | "finalize_closeout" | "diagnostic_only"
  >;
  terminalBlockerClasses: string[];
  readbackProjectionFields: string[];
  diagnosticOnly: boolean;
  diagnosticFlagRefs: string[];
  terminalLifecyclePolicy: {
    closeDbPools: true;
    closeProviderClients: true;
    stopTimersAndHeartbeats: true;
    waitForRuntimeEventFlush: true;
    emitTerminalJsonOnce: true;
    exposeHangingHandles: true;
  };
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogsStored: false;
  rawDbRowsStored: false;
  authorityGranted: false;
  workQueueLifecycleMutated: false;
};

const CORE_PREFIX: BoundaryReplayCheckpointKind[] = ["router_payload", "requirement_map"];

const WORK_INTENT_PREFIX: BoundaryReplayCheckpointKind[] = [...CORE_PREFIX, "work_intent_graph"];

const EXECUTABLE_GRAPH_PREFIX: BoundaryReplayCheckpointKind[] = [
  ...WORK_INTENT_PREFIX,
  "graph_compile",
  "node_selection",
];

const DEPENDENCIES: Record<BoundaryReplayCheckpointKind, BoundaryReplayCheckpointKind[]> = {
  router_payload: ["router_payload"],
  requirement_map: [...CORE_PREFIX],
  work_intent_graph: [...WORK_INTENT_PREFIX],
  before_expansion_admission: [
    ...WORK_INTENT_PREFIX,
    "graph_compile",
    "before_expansion_admission",
  ],
  after_expansion_admission: [
    ...WORK_INTENT_PREFIX,
    "graph_compile",
    "before_expansion_admission",
    "after_expansion_admission",
  ],
  before_graph_patch_write: [...WORK_INTENT_PREFIX, "graph_compile", "before_graph_patch_write"],
  after_graph_patch_write: [
    ...WORK_INTENT_PREFIX,
    "graph_compile",
    "before_graph_patch_write",
    "after_graph_patch_write",
  ],
  graph_compile: [...WORK_INTENT_PREFIX, "graph_compile"],
  node_selection: [...EXECUTABLE_GRAPH_PREFIX],
  before_worker_invocation: [...EXECUTABLE_GRAPH_PREFIX, "before_worker_invocation"],
  worker_execution: [...EXECUTABLE_GRAPH_PREFIX, "before_worker_invocation", "worker_execution"],
  after_worker_edit: [
    ...EXECUTABLE_GRAPH_PREFIX,
    "before_worker_invocation",
    "worker_execution",
    "after_worker_edit",
  ],
  before_validation: [
    ...EXECUTABLE_GRAPH_PREFIX,
    "before_worker_invocation",
    "worker_execution",
    "before_validation",
  ],
  validation_repair: [
    ...EXECUTABLE_GRAPH_PREFIX,
    "before_worker_invocation",
    "worker_execution",
    "validation_repair",
  ],
  after_validation: [
    ...EXECUTABLE_GRAPH_PREFIX,
    "before_worker_invocation",
    "worker_execution",
    "validation_repair",
    "after_validation",
  ],
  review_qa: [
    ...EXECUTABLE_GRAPH_PREFIX,
    "before_worker_invocation",
    "worker_execution",
    "validation_repair",
    "review_qa",
  ],
  before_closeout: [
    ...EXECUTABLE_GRAPH_PREFIX,
    "before_worker_invocation",
    "worker_execution",
    "validation_repair",
    "review_qa",
    "before_closeout",
  ],
  closeout_finalization: [
    ...EXECUTABLE_GRAPH_PREFIX,
    "before_worker_invocation",
    "worker_execution",
    "validation_repair",
    "review_qa",
    "closeout_finalization",
  ],
  work_queue_readback: [...EXECUTABLE_GRAPH_PREFIX, "work_queue_readback"],
};

function defaultContinuationModeFor(
  checkpointKind: BoundaryReplayCheckpointKind,
): BoundaryReplayBoundaryDefinition["resumeCommand"]["defaultContinuationMode"] {
  if (checkpointKind === "before_worker_invocation") {
    return "run_node";
  }
  if (checkpointKind === "validation_repair" || checkpointKind.includes("resource_")) {
    return "repair_boundary";
  }
  if (checkpointKind === "closeout_finalization") {
    return "finalize_closeout";
  }
  return "continue_scheduler";
}

function allowedNextTransitionsFor(
  checkpointKind: BoundaryReplayCheckpointKind,
): BoundaryReplayBoundaryDefinition["allowedNextTransitions"] {
  const defaultMode = defaultContinuationModeFor(checkpointKind);
  if (checkpointKind === "closeout_finalization") {
    return ["finalize_closeout", "repair_boundary"];
  }
  const transitions: BoundaryReplayBoundaryDefinition["allowedNextTransitions"] = [
    defaultMode,
    "continue_scheduler",
    "repair_boundary",
  ];
  return [...new Set(transitions)];
}

function blockerClassesFor(checkpointKind: BoundaryReplayCheckpointKind): string[] {
  const common = [
    "identity_mismatch",
    "stale_checkpoint",
    "missing_checkpoint",
    "rejected_checkpoint",
    "raw_storage_or_authority_violation",
  ];
  if (checkpointKind.includes("resource") || checkpointKind.includes("worker")) {
    return [...common, "node_readiness_missing", "resource_packet_missing"];
  }
  if (checkpointKind.includes("validation")) {
    return [...common, "validation_evidence_missing", "repair_boundary_required"];
  }
  if (checkpointKind.includes("closeout")) {
    return [...common, "closeout_evidence_missing", "finalization_not_accepted"];
  }
  return common;
}

const READBACK_FIELDS = [
  "boundaryKind",
  "productionPathEquivalence",
  "diagnosticOnly",
  "boundaryEpoch",
  "currentChildEpoch",
  "supersededChildCount",
  "proofClosureAllowed",
  "checkpointRefs",
  "graphCheckpointRefs",
  "latestAcceptedCheckpointRef",
  "latestAcceptedCheckpointKind",
  "staleCheckpointRefs",
  "rejectedCheckpointRefs",
  "missingCheckpointKinds",
  "continuationMode",
  "continuationAction",
  "currentNodeIds",
  "currentCommitmentIds",
  "terminalBlockerClass",
  "nextLegalTransition",
  "operatorReadbackSummary",
];

function definitionFor(
  checkpointKind: BoundaryReplayCheckpointKind,
): BoundaryReplayBoundaryDefinition {
  const diagnosticOnly = false;
  const productionProofBoundaryId = boundaryReplayProofBoundaryIdForCheckpointKind(checkpointKind);
  return {
    artifactKind: "boundary_replay_boundary_definition",
    registryVersion: BOUNDARY_REPLAY_REGISTRY_VERSION,
    checkpointKind,
    productionProofBoundaryId,
    productionProofSequenceIndex: productionProofBoundaryId
      ? BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS.indexOf(productionProofBoundaryId)
      : null,
    workflowApplicability: "workflow_agnostic",
    productionPathEquivalence: diagnosticOnly ? "diagnostic_only" : "production_equivalent",
    sourceCheckpointVersion: "execution-platform.boundary-replay-checkpoint.v1",
    allowedSyntheticArtifacts: diagnosticOnly ? ["diagnostic_fixture_ref"] : [],
    forbiddenSyntheticArtifacts: diagnosticOnly
      ? ["production_proof_closure"]
      : [
          "default_context_synthesis",
          "synthetic_executable_node",
          "synthetic_resource_packet",
          "proof_only_topology",
        ],
    requiredUpstreamCheckpointKinds: [...new Set(DEPENDENCIES[checkpointKind])],
    versionedNormalizers: [
      {
        normalizerId: "metadata_checkpoint_v1",
        inputSchemaVersion: "execution-platform.boundary-replay-checkpoint.v1",
        outputSchemaVersion: "execution-platform.boundary-replay-checkpoint.v1",
        failClosedReasonCodes: [
          "boundary_replay_checkpoint_kind_invalid",
          "boundary_replay_checkpoint_identity_missing",
          "boundary_replay_checkpoint_boundary_hashes_missing",
          "boundary_replay_checkpoint_accepted_artifacts_missing",
        ],
      },
    ],
    resumeCommand: {
      runtimeEntryPoint: "GenericOrchestrationRuntime.runSchedulerGraph",
      schedulerEntryPoint: "RuntimeWorkGraphScheduler.run",
      defaultContinuationMode: defaultContinuationModeFor(checkpointKind),
    },
    allowedNextTransitions: allowedNextTransitionsFor(checkpointKind),
    terminalBlockerClasses: blockerClassesFor(checkpointKind),
    readbackProjectionFields: READBACK_FIELDS,
    diagnosticOnly,
    diagnosticFlagRefs: [],
    terminalLifecyclePolicy: {
      closeDbPools: true,
      closeProviderClients: true,
      stopTimersAndHeartbeats: true,
      waitForRuntimeEventFlush: true,
      emitTerminalJsonOnce: true,
      exposeHangingHandles: true,
    },
    reasonCodes: [
      "boundary_replay_registry_definition_loaded",
      diagnosticOnly
        ? "boundary_replay_boundary_diagnostic_only"
        : "boundary_replay_boundary_production_replayable",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogsStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    workQueueLifecycleMutated: false,
  };
}

const REGISTRY = new Map<BoundaryReplayCheckpointKind, BoundaryReplayBoundaryDefinition>(
  BOUNDARY_REPLAY_CHECKPOINT_KINDS.map((kind) => [kind, definitionFor(kind)]),
);

export function boundaryReplayDefinitionFor(
  checkpointKind: BoundaryReplayCheckpointKind,
): BoundaryReplayBoundaryDefinition {
  const definition = REGISTRY.get(checkpointKind);
  if (!definition) {
    throw new Error(`boundary_replay_definition_missing:${checkpointKind}`);
  }
  return {
    ...definition,
    requiredUpstreamCheckpointKinds: [...definition.requiredUpstreamCheckpointKinds],
    versionedNormalizers: definition.versionedNormalizers.map((normalizer) => ({
      ...normalizer,
      failClosedReasonCodes: [...normalizer.failClosedReasonCodes],
    })),
    allowedNextTransitions: [...definition.allowedNextTransitions],
    terminalBlockerClasses: [...definition.terminalBlockerClasses],
    readbackProjectionFields: [...definition.readbackProjectionFields],
    diagnosticFlagRefs: [...definition.diagnosticFlagRefs],
    reasonCodes: [...definition.reasonCodes],
  };
}

export function boundaryReplayDefinitions(): BoundaryReplayBoundaryDefinition[] {
  return BOUNDARY_REPLAY_CHECKPOINT_KINDS.map(boundaryReplayDefinitionFor);
}

export function requiredBoundaryReplayCheckpointKindsFor(
  requestedStartBoundary: BoundaryReplayCheckpointKind,
): BoundaryReplayCheckpointKind[] {
  return boundaryReplayDefinitionFor(requestedStartBoundary).requiredUpstreamCheckpointKinds;
}

export function boundaryReplayBoundaryIsDiagnosticOnly(
  checkpointKind: BoundaryReplayCheckpointKind,
): boolean {
  return boundaryReplayDefinitionFor(checkpointKind).diagnosticOnly;
}

export function boundaryReplayRegistrySummary(): Record<string, unknown> {
  return {
    artifactKind: "boundary_replay_registry_summary",
    registryVersion: BOUNDARY_REPLAY_REGISTRY_VERSION,
    boundaryCount: BOUNDARY_REPLAY_CHECKPOINT_KINDS.length,
    productionProofBoundaryIds: [...BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS],
    productionProofBoundaryKinds: BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS.map(
      (boundaryId) => PRODUCTION_PROOF_BOUNDARY_TO_CHECKPOINT_KIND[boundaryId],
    ),
    diagnosticOnlyBoundaryKinds: boundaryReplayDefinitions()
      .filter((definition) => definition.diagnosticOnly)
      .map((definition) => definition.checkpointKind),
    productionReplayableBoundaryKinds: boundaryReplayDefinitions()
      .filter((definition) => !definition.diagnosticOnly)
      .map((definition) => definition.checkpointKind),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogsStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    workQueueLifecycleMutated: false,
  };
}
