export const BOUNDARY_REPLAY_REGISTRY_VERSION = "execution-platform.boundary-replay-registry.v1";

export const BOUNDARY_REPLAY_CHECKPOINT_KINDS = [
  "router_payload",
  "mission_ledger",
  "commitment_packet_authoring",
  "commitment_packet_review",
  "work_intent_graph",
  "before_context_request",
  "after_context_request",
  "context_scout",
  "before_context_handoff",
  "after_context_handoff",
  "before_context_synthesis",
  "context_synthesis",
  "after_context_synthesis",
  "before_expansion_admission",
  "after_expansion_admission",
  "before_graph_patch_write",
  "after_graph_patch_write",
  "graph_compile",
  "node_selection",
  "before_resource_materialization",
  "after_resource_materialization",
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

export const BOUNDARY_REPLAY_CLI_BOUNDARY_ALIASES = [
  "after-context",
  "after-parallel-context",
  "after-context-synthesis",
  "after-graph-selection",
  "before-resource-materialization",
  "after-resource-materialization",
  "before-split-required-materialization",
  "after-split-required-materialization",
] as const;

export type BoundaryReplayCliBoundaryAlias = (typeof BOUNDARY_REPLAY_CLI_BOUNDARY_ALIASES)[number];

const BOUNDARY_REPLAY_CLI_ALIAS_TO_CHECKPOINT_KIND: Record<
  BoundaryReplayCliBoundaryAlias,
  BoundaryReplayCheckpointKind
> = {
  "after-context": "after_context_handoff",
  "after-parallel-context": "after_context_handoff",
  "after-context-synthesis": "after_context_synthesis",
  "after-graph-selection": "node_selection",
  "before-resource-materialization": "before_resource_materialization",
  "after-resource-materialization": "after_resource_materialization",
  "before-split-required-materialization": "before_resource_materialization",
  "after-split-required-materialization": "after_resource_materialization",
};

export function boundaryReplayCheckpointKindForCliAlias(
  alias: string | null | undefined,
): BoundaryReplayCheckpointKind | null {
  const normalized = (alias ?? "").trim();
  return BOUNDARY_REPLAY_CLI_BOUNDARY_ALIASES.includes(normalized as BoundaryReplayCliBoundaryAlias)
    ? BOUNDARY_REPLAY_CLI_ALIAS_TO_CHECKPOINT_KIND[normalized as BoundaryReplayCliBoundaryAlias]
    : null;
}

export type BoundaryReplayBoundaryDefinition = {
  artifactKind: "boundary_replay_boundary_definition";
  registryVersion: typeof BOUNDARY_REPLAY_REGISTRY_VERSION;
  checkpointKind: BoundaryReplayCheckpointKind;
  workflowApplicability: "workflow_agnostic";
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

const CORE_PREFIX: BoundaryReplayCheckpointKind[] = [
  "router_payload",
  "mission_ledger",
  "commitment_packet_authoring",
];

const DEPENDENCIES: Record<BoundaryReplayCheckpointKind, BoundaryReplayCheckpointKind[]> = {
  router_payload: ["router_payload"],
  mission_ledger: ["router_payload", "mission_ledger"],
  commitment_packet_authoring: [...CORE_PREFIX],
  commitment_packet_review: [...CORE_PREFIX, "commitment_packet_review"],
  work_intent_graph: [...CORE_PREFIX, "work_intent_graph"],
  before_context_request: [...CORE_PREFIX, "before_context_request"],
  after_context_request: [...CORE_PREFIX, "before_context_request", "after_context_request"],
  context_scout: [...CORE_PREFIX, "context_scout"],
  before_context_handoff: [...CORE_PREFIX, "context_scout", "before_context_handoff"],
  after_context_handoff: [
    ...CORE_PREFIX,
    "context_scout",
    "before_context_handoff",
    "after_context_handoff",
  ],
  before_context_synthesis: [...CORE_PREFIX, "context_scout", "before_context_synthesis"],
  context_synthesis: [...CORE_PREFIX, "context_scout", "context_synthesis"],
  after_context_synthesis: [
    ...CORE_PREFIX,
    "context_scout",
    "context_synthesis",
    "after_context_synthesis",
  ],
  before_expansion_admission: [...CORE_PREFIX, "graph_compile", "before_expansion_admission"],
  after_expansion_admission: [
    ...CORE_PREFIX,
    "graph_compile",
    "before_expansion_admission",
    "after_expansion_admission",
  ],
  before_graph_patch_write: [...CORE_PREFIX, "graph_compile", "before_graph_patch_write"],
  after_graph_patch_write: [
    ...CORE_PREFIX,
    "graph_compile",
    "before_graph_patch_write",
    "after_graph_patch_write",
  ],
  graph_compile: [...CORE_PREFIX, "graph_compile"],
  node_selection: [...CORE_PREFIX, "graph_compile", "node_selection"],
  before_resource_materialization: [
    ...CORE_PREFIX,
    "graph_compile",
    "node_selection",
    "before_resource_materialization",
  ],
  after_resource_materialization: [
    ...CORE_PREFIX,
    "graph_compile",
    "node_selection",
    "before_resource_materialization",
    "after_resource_materialization",
  ],
  before_worker_invocation: [
    ...CORE_PREFIX,
    "graph_compile",
    "node_selection",
    "after_resource_materialization",
    "before_worker_invocation",
  ],
  worker_execution: [...CORE_PREFIX, "graph_compile", "node_selection", "worker_execution"],
  after_worker_edit: [
    ...CORE_PREFIX,
    "graph_compile",
    "node_selection",
    "worker_execution",
    "after_worker_edit",
  ],
  before_validation: [
    ...CORE_PREFIX,
    "graph_compile",
    "node_selection",
    "worker_execution",
    "before_validation",
  ],
  validation_repair: [
    ...CORE_PREFIX,
    "graph_compile",
    "node_selection",
    "worker_execution",
    "validation_repair",
  ],
  after_validation: [
    ...CORE_PREFIX,
    "graph_compile",
    "node_selection",
    "worker_execution",
    "validation_repair",
    "after_validation",
  ],
  review_qa: [
    ...CORE_PREFIX,
    "graph_compile",
    "node_selection",
    "worker_execution",
    "validation_repair",
    "review_qa",
  ],
  before_closeout: [
    ...CORE_PREFIX,
    "graph_compile",
    "node_selection",
    "worker_execution",
    "validation_repair",
    "review_qa",
    "before_closeout",
  ],
  closeout_finalization: [
    ...CORE_PREFIX,
    "graph_compile",
    "node_selection",
    "worker_execution",
    "validation_repair",
    "review_qa",
    "closeout_finalization",
  ],
  work_queue_readback: [...CORE_PREFIX, "graph_compile", "node_selection", "work_queue_readback"],
};

function defaultContinuationModeFor(
  checkpointKind: BoundaryReplayCheckpointKind,
): BoundaryReplayBoundaryDefinition["resumeCommand"]["defaultContinuationMode"] {
  if (checkpointKind === "after_context_synthesis") {
    return "diagnostic_only";
  }
  if (
    checkpointKind === "after_resource_materialization" ||
    checkpointKind === "before_worker_invocation"
  ) {
    return "run_node";
  }
  if (
    checkpointKind === "validation_repair" ||
    checkpointKind === "after_context_handoff" ||
    checkpointKind === "after_context_request"
  ) {
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
  if (checkpointKind === "after_context_synthesis") {
    return ["diagnostic_only"];
  }
  if (checkpointKind === "after_resource_materialization") {
    return ["run_node", "repair_boundary"];
  }
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
  if (checkpointKind.includes("context")) {
    return [...common, "context_snapshot_missing", "context_snapshot_stale"];
  }
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
  "rawStorageFlags",
  "operatorReadbackSummary",
];

function definitionFor(
  checkpointKind: BoundaryReplayCheckpointKind,
): BoundaryReplayBoundaryDefinition {
  const diagnosticOnly = checkpointKind === "after_context_synthesis";
  return {
    artifactKind: "boundary_replay_boundary_definition",
    registryVersion: BOUNDARY_REPLAY_REGISTRY_VERSION,
    checkpointKind,
    workflowApplicability: "workflow_agnostic",
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
    diagnosticFlagRefs: diagnosticOnly
      ? [
          "--allow-legacy-diagnostic-boundary",
          "--allow-legacy-context-synthesis-boundary",
          "OPENCLAW_ALLOW_LEGACY_CONTEXT_SYNTHESIS_REPLAY",
        ]
      : [],
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
