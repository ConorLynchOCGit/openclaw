import type {
  AttachRuntimeJobArtifactInput,
  AttachRuntimeJobJsonPayloadArtifactInput,
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobArtifactPayload,
} from "./runtime-job-types.ts";

export const RUNTIME_ARTIFACT_CONTRACT_SCHEMA_VERSION =
  "execution-platform.runtime-artifact-contract.v1" as const;

export type RuntimeArtifactStoragePolicy =
  | "metadata_manifest_only"
  | "payload_required"
  | "payload_parts_required"
  | "debug_metadata_only";

export type RuntimeArtifactDomain =
  | "mission"
  | "packet"
  | "context"
  | "scheduler"
  | "resource"
  | "worker"
  | "validation"
  | "closeout"
  | "work_queue"
  | "diagnostic";

export type RuntimeArtifactRawStoragePolicy = {
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type RuntimeArtifactContract = {
  artifactType: string;
  contractId: string;
  domain: RuntimeArtifactDomain;
  storagePolicy: RuntimeArtifactStoragePolicy;
  manifestSchemaRef: string;
  bodySchemaRef: string | null;
  maxManifestBytes: number;
  maxBodyBytes: number;
  hydrateToolId: "artifact.payload.get_json" | "artifact.payload.get_json_parts" | "metadata";
  rawStoragePolicy: RuntimeArtifactRawStoragePolicy;
  legacyHydration:
    | {
        allowed: true;
        bodyKeys: string[];
      }
    | { allowed: false; bodyKeys: [] };
  cleanSuccessEligible: boolean;
};

export type RuntimeArtifactContractAttachInput = Omit<
  AttachRuntimeJobJsonPayloadArtifactInput,
  "metadata"
> & {
  metadata?: Record<string, JsonValue>;
};

export type RuntimeArtifactContractHydrationResult = {
  artifact: RuntimeJobArtifact;
  contract: RuntimeArtifactContract | null;
  status:
    | "payload_hydrated"
    | "legacy_metadata_hydrated"
    | "metadata_manifest_only"
    | "missing_payload"
    | "invalid_contract_storage";
  body: JsonValue | null;
  payload: RuntimeJobArtifactPayload | null;
  reasonCodes: string[];
  legacyHydrated: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

const FALSE_RAW_STORAGE_POLICY: RuntimeArtifactRawStoragePolicy = {
  rawPromptStored: false,
  rawResponseStored: false,
  rawTranscriptStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  secretsStored: false,
};

const BODY_KEY_HINTS = new Set([
  "body",
  "payloadBody",
  "packetBody",
  "contextScoutExecutionPacket",
  "resourceFrontierRequest",
  "contextShardManifest",
  "contextShardHandoff",
  "contextShardHandoffReview",
  "contextMergePacket",
  "contextSingleUnitBlocker",
  "contextScopeRevisionRequest",
  "contextScopeRevisionProposal",
  "contextScopeRevisionDecision",
  "contextScoutFieldRepairRequest",
  "contextScopeRevisionRealModelProof",
  "contextRepairRequirement",
  "resourceRequirementPacket",
  "resourceHandoffPacket",
  "workIntentContextSatisfactionState",
  "resourceFrontierShardRealModelProof",
  "contextBrokerRequest",
  "resourceObjectiveFocus",
  "resourceObjectiveFocusLegalRefUniverse",
  "legalRefUniverse",
  "legalRefs",
  "selectedSemanticQuestions",
  "nodeResourceDemandSession",
  "nodeResourceDemandRequest",
  "nodeResourceDemandFulfillment",
  "nodeResourceDemandBlocker",
  "contextScoutSpecialistRequest",
  "contextScoutSpecialistSubturnRequest",
  "contextScoutSpecialistHandoff",
  "contextScoutSpecialistResult",
  "nodeResourceLedger",
  "nodeResourceLedgerEntry",
  "ledgerEntries",
  "ledgerEntryBodies",
  "fileWindowBodies",
  "contextBodies",
  "providerResponseBodies",
  "providerDiagnosticBodies",
  "providerResponseShapeDiagnostic",
  "heapPhaseSnapshot",
  "implementationContextPacket",
  "implementationTaskPacket",
  "resourceSelectionPacket",
  "resourceSelectionHandleManifest",
  "resourceSelectionFieldRepairRequest",
  "domainResourceSelectionPacket",
  "codingResourcePacket",
  "nodeExecutionPacket",
  "nodeReadinessState",
  "actionReviewArtifact",
  "workerEditReviewArtifact",
  "reviewDecisionArtifact",
  "boundedDiffPayload",
  "runtimeGraphPatch",
  "schedulerSnapshot",
  "runtimeResult",
  "graphNodes",
  "graphEdges",
  "targetFileSnapshots",
  "fileSnapshots",
  "snapshots",
  "boundedSnapshots",
  "snapshotBodies",
  "boundedContent",
  "lineNumberedContent",
  "splitTasks",
  "taskPackets",
  "missionLedgerStabilityDiagnosticRun",
  "missionLedgerStabilityDiagnosticPair",
  "missionLedgerStabilityVerdict",
  "fastModelNoContentDiagnostic",
  "architectureResidueInventoryReport",
  "architectureResidueSourceInventory",
  "architectureResidueModelAudit",
  "architectureResidueModelAuditBody",
  "survivorRefs",
  "blockedSurvivorRefs",
]);

const BODY_ARTIFACT_CONTRACTS: RuntimeArtifactContract[] = [
  payloadContract({
    artifactType: "execution_platform.resource_scout_execution_packet",
    contractId: "runtime-artifact.context-scout-execution-packet.v1",
    domain: "context",
    bodySchemaRef: "ContextScoutExecutionPacket",
    legacyBodyKeys: ["contextScoutExecutionPacket", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_frontier.request",
    contractId: "runtime-artifact.context-frontier-request.v1",
    domain: "context",
    bodySchemaRef: "ResourceFrontierRequest",
    legacyBodyKeys: ["resourceFrontierRequest", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_frontier.shard_manifest",
    contractId: "runtime-artifact.context-frontier-shard-manifest.v1",
    domain: "context",
    bodySchemaRef: "ContextShardManifest",
    legacyBodyKeys: ["contextShardManifest", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_frontier.shard_handoff",
    contractId: "runtime-artifact.context-frontier-shard-handoff.v1",
    domain: "context",
    bodySchemaRef: "ContextShardHandoff",
    legacyBodyKeys: ["contextShardHandoff", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_frontier.shard_handoff_review",
    contractId: "runtime-artifact.context-frontier-shard-handoff-review.v1",
    domain: "context",
    bodySchemaRef: "ContextShardHandoffReview",
    legacyBodyKeys: ["contextShardHandoffReview", "reviewBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_frontier.merge_packet",
    contractId: "runtime-artifact.context-frontier-merge-packet.v1",
    domain: "context",
    bodySchemaRef: "ContextMergePacket",
    legacyBodyKeys: ["contextMergePacket", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_frontier.single_unit_blocker",
    contractId: "runtime-artifact.context-frontier-single-unit-blocker.v1",
    domain: "context",
    bodySchemaRef: "ContextScoutSingleUnitOverProfileBlocker",
    legacyBodyKeys: ["contextSingleUnitBlocker", "blocker", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_scope_revision.request",
    contractId: "runtime-artifact.context-scope-revision-request.v1",
    domain: "context",
    bodySchemaRef: "ContextScopeRevisionRequest",
    legacyBodyKeys: ["contextScopeRevisionRequest", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_scope_revision.proposal",
    contractId: "runtime-artifact.context-scope-revision-proposal.v1",
    domain: "context",
    bodySchemaRef: "ContextScopeRevisionProposal",
    legacyBodyKeys: ["contextScopeRevisionProposal", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_scope_revision.decision",
    contractId: "runtime-artifact.context-scope-revision-decision.v1",
    domain: "context",
    bodySchemaRef: "ContextScopeRevisionDecision",
    legacyBodyKeys: ["contextScopeRevisionDecision", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource.scout.field_repair_request",
    contractId: "runtime-artifact.context-scout-field-repair-request.v1",
    domain: "context",
    bodySchemaRef: "ContextScoutFieldRepairRequest",
    legacyBodyKeys: ["contextScoutFieldRepairRequest", "repairRequest", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_scope_revision_real_model_proof",
    contractId: "runtime-artifact.context-scope-revision-real-model-proof.v1",
    domain: "context",
    bodySchemaRef: "ContextScopeRevisionRealModelProof",
    legacyBodyKeys: ["contextScopeRevisionRealModelProof", "proofBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_requirement_packet",
    contractId: "runtime-artifact.resource-requirement-packet.v1",
    domain: "context",
    bodySchemaRef: "ResourceRequirementPacket",
    legacyBodyKeys: ["resourceRequirementPacket", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_repair_requirement",
    contractId: "runtime-artifact.context-repair-requirement.v1",
    domain: "context",
    bodySchemaRef: "ContextRepairRequirementPacket",
    legacyBodyKeys: ["contextRepairRequirement", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_handoff_packet",
    contractId: "runtime-artifact.resource-handoff-packet.v1",
    domain: "context",
    bodySchemaRef: "ResourceHandoffPacketSchema",
    legacyBodyKeys: ["resourceHandoffPacket", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_broker.request",
    contractId: "runtime-artifact.context-broker-request.v1",
    domain: "context",
    bodySchemaRef: "ContextBrokerRequestSchema",
    legacyBodyKeys: ["contextBrokerRequest", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_objective_focus",
    contractId: "runtime-artifact.resource-objective-focus.v1",
    domain: "context",
    bodySchemaRef: "ResourceObjectiveFocus",
    legacyBodyKeys: ["resourceObjectiveFocus", "focusBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_objective_focus.legal_ref_universe",
    contractId: "runtime-artifact.resource-objective-focus-legal-ref-universe.v1",
    domain: "context",
    bodySchemaRef: "ResourceObjectiveFocusLegalRefUniverse",
    legacyBodyKeys: [
      "resourceObjectiveFocusLegalRefUniverse",
      "legalRefUniverse",
      "legalRefs",
      "body",
    ],
  }),
  payloadContract({
    artifactType: "execution_platform.node_resource_demand.session",
    contractId: "runtime-artifact.node-resource-demand-session.v1",
    domain: "context",
    bodySchemaRef: "NodeResourceDemandSession",
    legacyBodyKeys: ["nodeResourceDemandSession", "sessionBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_resource_demand.request",
    contractId: "runtime-artifact.node-resource-demand-request.v1",
    domain: "context",
    bodySchemaRef: "NodeResourceDemandRequest",
    legacyBodyKeys: ["nodeResourceDemandRequest", "requestBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_resource_demand.fulfillment",
    contractId: "runtime-artifact.node-resource-demand-fulfillment.v1",
    domain: "context",
    bodySchemaRef: "NodeResourceDemandFulfillment",
    legacyBodyKeys: ["nodeResourceDemandFulfillment", "fulfillmentBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_resource_demand.blocker",
    contractId: "runtime-artifact.node-resource-demand-blocker.v1",
    domain: "context",
    bodySchemaRef: "NodeResourceDemandBlocker",
    legacyBodyKeys: ["nodeResourceDemandBlocker", "blockerBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource.scout.specialist_subturn_request",
    contractId: "runtime-artifact.context-scout-specialist-subturn-request.v1",
    domain: "context",
    bodySchemaRef: "ContextScoutSpecialistSubturnRequest",
    legacyBodyKeys: [
      "contextScoutSpecialistRequest",
      "contextScoutSpecialistSubturnRequest",
      "requestBody",
      "body",
    ],
  }),
  payloadContract({
    artifactType: "execution_platform.resource.scout.specialist_handoff",
    contractId: "runtime-artifact.context-scout-specialist-handoff.v1",
    domain: "context",
    bodySchemaRef: "ContextScoutSpecialistHandoff",
    legacyBodyKeys: ["contextScoutSpecialistHandoff", "handoffBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource.scout.specialist_result",
    contractId: "runtime-artifact.context-scout-specialist-result.v1",
    domain: "context",
    bodySchemaRef: "ContextScoutSpecialistResult",
    legacyBodyKeys: ["contextScoutSpecialistResult", "resultBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_resource_ledger",
    contractId: "runtime-artifact.node-resource-ledger.v1",
    domain: "context",
    bodySchemaRef: "NodeResourceLedger",
    legacyBodyKeys: ["nodeResourceLedger", "ledgerBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_resource_ledger.entry",
    contractId: "runtime-artifact.node-resource-ledger-entry.v1",
    domain: "context",
    bodySchemaRef: "NodeResourceLedgerEntry",
    legacyBodyKeys: ["nodeResourceLedgerEntry", "ledgerEntryBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.work_intent.context_satisfaction_state",
    contractId: "runtime-artifact.work-intent-context-satisfaction-state.v1",
    domain: "context",
    bodySchemaRef: "WorkIntentContextSatisfactionState",
    legacyBodyKeys: ["workIntentContextSatisfactionState", "contextSatisfactionState", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_frontier_shard_real_model_proof",
    contractId: "runtime-artifact.context-frontier-shard-real-model-proof.v1",
    domain: "diagnostic",
    bodySchemaRef: "ResourceFrontierShardRealModelProof",
    legacyBodyKeys: ["resourceFrontierShardRealModelProof", "proof", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.implementation_context_packet",
    contractId: "runtime-artifact.implementation-context-packet.v1",
    domain: "resource",
    bodySchemaRef: "ImplementationContextPacket",
    legacyBodyKeys: ["implementationContextPacket", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_selection_packet",
    contractId: "runtime-artifact.resource-selection-packet.v1",
    domain: "resource",
    bodySchemaRef: "ResourceSelectionPacket",
    legacyBodyKeys: ["resourceSelectionPacket", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_selection_handle_manifest",
    contractId: "runtime-artifact.resource-selection-handle-manifest.v1",
    domain: "resource",
    bodySchemaRef: "ResourceSelectionHandleManifest",
    legacyBodyKeys: ["resourceSelectionHandleManifest", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.resource_selection_field_repair_request",
    contractId: "runtime-artifact.resource-selection-field-repair-request.v1",
    domain: "resource",
    bodySchemaRef: "ResourceSelectionFieldRepairRequest",
    legacyBodyKeys: ["resourceSelectionFieldRepairRequest", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.domain_resource_selection_packet",
    contractId: "runtime-artifact.domain-resource-selection-packet.v1",
    domain: "resource",
    bodySchemaRef: "DomainResourceSelectionPacket",
    legacyBodyKeys: ["domainResourceSelectionPacket", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.domain_resource_selection_request",
    contractId: "runtime-artifact.domain-resource-selection-request.v1",
    domain: "resource",
    bodySchemaRef: "DomainResourceSelectionRequest",
    legacyBodyKeys: ["domainResourceSelectionRequest", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.domain_resource_selection_proposal",
    contractId: "runtime-artifact.domain-resource-selection-proposal.v1",
    domain: "resource",
    bodySchemaRef: "DomainResourceSelectionProposal",
    legacyBodyKeys: ["domainResourceSelectionProposal", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.domain_resource_selection_decision",
    contractId: "runtime-artifact.domain-resource-selection-decision.v1",
    domain: "resource",
    bodySchemaRef: "DomainResourceSelectionDecision",
    legacyBodyKeys: ["domainResourceSelectionDecision", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.domain_resource_selection_real_model_proof",
    contractId: "runtime-artifact.domain-resource-selection-real-model-proof.v1",
    domain: "diagnostic",
    bodySchemaRef: "DomainResourceSelectionRealModelProof",
    legacyBodyKeys: ["domainResourceSelectionRealModelProof", "proof", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.implementation_resource_materialization_result",
    contractId: "runtime-artifact.implementation-resource-materialization-result.v1",
    domain: "resource",
    bodySchemaRef: "ImplementationResourceMaterializationResult",
    legacyBodyKeys: [
      "implementationResourceMaterializationResult",
      "resourceMaterialization",
      "body",
    ],
  }),
  payloadContract({
    artifactType: "execution_platform.implementation_task_packet",
    contractId: "runtime-artifact.implementation-task-packet.v1",
    domain: "resource",
    bodySchemaRef: "ImplementationTaskPacketSchema",
    legacyBodyKeys: ["implementationTaskPacket", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.coding_resource_packet",
    contractId: "runtime-artifact.coding-resource-packet.v1",
    domain: "resource",
    bodySchemaRef: "CodingResourcePacket",
    legacyBodyKeys: ["codingResourcePacket", "resourcePacket", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_execution_contract",
    contractId: "runtime-artifact.node-execution-contract.v1",
    domain: "worker",
    bodySchemaRef: "NodeExecutionContract",
    legacyBodyKeys: ["nodeExecutionContract", "executionContract", "contractBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_execution_packet",
    contractId: "runtime-artifact.node-execution-packet.v1",
    domain: "worker",
    bodySchemaRef: "NodeExecutionPacket",
    legacyBodyKeys: ["nodeExecutionPacket", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_readiness_state",
    contractId: "runtime-artifact.node-readiness-state.v1",
    domain: "worker",
    bodySchemaRef: "NodeReadinessState",
    legacyBodyKeys: ["nodeReadinessState", "readinessState", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.action_review_artifact",
    contractId: "runtime-artifact.action-review-artifact.v1",
    domain: "worker",
    bodySchemaRef: "ActionReviewArtifact",
    legacyBodyKeys: ["actionReviewArtifact", "reviewArtifact", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.worker_edit_review_artifact",
    contractId: "runtime-artifact.worker-edit-review-artifact.v1",
    domain: "worker",
    bodySchemaRef: "WorkerEditReviewArtifact",
    legacyBodyKeys: ["workerEditReviewArtifact", "actionReviewArtifact", "reviewArtifact", "body"],
  }),
  payloadContract({
    artifactType: "execution.generic_orchestration_runtime_result",
    contractId: "runtime-artifact.generic-orchestration-runtime-result.v1",
    domain: "scheduler",
    bodySchemaRef: "GenericOrchestrationRuntimeResult",
    legacyBodyKeys: ["runtimeResult", "schedulerSnapshot", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.mission_ledger_stability_diagnostic_run",
    contractId: "runtime-artifact.mission-ledger-stability-diagnostic-run.v1",
    domain: "diagnostic",
    bodySchemaRef: "MissionLedgerStabilityDiagnosticRun",
    legacyBodyKeys: ["missionLedgerStabilityDiagnosticRun", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.mission_ledger_stability_diagnostic_pair",
    contractId: "runtime-artifact.mission-ledger-stability-diagnostic-pair.v1",
    domain: "diagnostic",
    bodySchemaRef: "MissionLedgerStabilityDiagnosticPair",
    legacyBodyKeys: ["missionLedgerStabilityDiagnosticPair", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.mission_ledger_stability_verdict",
    contractId: "runtime-artifact.mission-ledger-stability-verdict.v1",
    domain: "diagnostic",
    bodySchemaRef: "MissionLedgerStabilityVerdict",
    legacyBodyKeys: ["missionLedgerStabilityVerdict", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.fast_model.no_content_diagnostic",
    contractId: "runtime-artifact.fast-model-no-content-diagnostic.v1",
    domain: "diagnostic",
    bodySchemaRef: "FastModelNoContentDiagnosticSchema",
    legacyBodyKeys: ["fastModelNoContentDiagnostic", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.architecture_residue_source_inventory",
    contractId: "runtime-artifact.architecture-residue-source-inventory.v1",
    domain: "diagnostic",
    bodySchemaRef: "ArchitectureResidueSourceInventoryReport",
    legacyBodyKeys: [
      "architectureResidueInventoryReport",
      "architectureResidueSourceInventory",
      "body",
    ],
  }),
  payloadContract({
    artifactType: "execution_platform.architecture_residue_model_audit",
    contractId: "runtime-artifact.architecture-residue-model-audit.v1",
    domain: "diagnostic",
    bodySchemaRef: "ArchitectureResidueModelAudit",
    legacyBodyKeys: [
      "architectureResidueModelAudit",
      "architectureResidueModelAuditBody",
      "body",
    ],
  }),
  payloadContract({
    artifactType: "execution_platform.runtime_graph_patch",
    contractId: "runtime-artifact.runtime-graph-patch.v1",
    domain: "scheduler",
    bodySchemaRef: "RuntimeGraphPatch",
    legacyBodyKeys: ["runtimeGraphPatch", "graphPatch", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.provider_diagnostics.response_shape",
    contractId: "runtime-artifact.provider-diagnostics-response-shape.v1",
    domain: "diagnostic",
    bodySchemaRef: "ProviderResponseShapeDiagnostic",
    legacyBodyKeys: ["providerResponseShapeDiagnostic", "providerDiagnosticBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.proof_environment.heap_phase_snapshot",
    contractId: "runtime-artifact.proof-environment-heap-phase-snapshot.v1",
    domain: "diagnostic",
    bodySchemaRef: "HeapPhaseSnapshot",
    legacyBodyKeys: ["heapPhaseSnapshot", "proofEnvironmentHeapSnapshot", "body"],
  }),
];

const MANIFEST_ONLY_CONTRACTS: RuntimeArtifactContract[] = [
  manifestContract({
    artifactType: "agent_team.scheduler_progress",
    contractId: "runtime-artifact.agent-team-scheduler-progress-manifest.v1",
    domain: "scheduler",
    maxManifestBytes: 64 * 1024,
  }),
  manifestContract({
    artifactType: "execution_platform.scheduler_progress",
    contractId: "runtime-artifact.scheduler-progress-manifest.v1",
    domain: "scheduler",
    maxManifestBytes: 64 * 1024,
  }),
  manifestContract({
    artifactType: "execution_platform.latest_run_state",
    contractId: "runtime-artifact.latest-run-state-manifest.v1",
    domain: "scheduler",
  }),
];

const CONTRACTS = [...BODY_ARTIFACT_CONTRACTS, ...MANIFEST_ONLY_CONTRACTS];
const CONTRACT_BY_TYPE = new Map(CONTRACTS.map((contract) => [contract.artifactType, contract]));

function payloadContract(input: {
  artifactType: string;
  contractId: string;
  domain: RuntimeArtifactDomain;
  bodySchemaRef: string;
  legacyBodyKeys: string[];
}): RuntimeArtifactContract {
  return {
    artifactType: input.artifactType,
    contractId: input.contractId,
    domain: input.domain,
    storagePolicy: "payload_required",
    manifestSchemaRef: "RuntimeJobArtifactPayloadManifest",
    bodySchemaRef: input.bodySchemaRef,
    maxManifestBytes: 32 * 1024,
    maxBodyBytes: 10 * 1024 * 1024,
    hydrateToolId: "artifact.payload.get_json",
    rawStoragePolicy: FALSE_RAW_STORAGE_POLICY,
    legacyHydration: { allowed: true, bodyKeys: input.legacyBodyKeys },
    cleanSuccessEligible: true,
  };
}

function manifestContract(input: {
  artifactType: string;
  contractId: string;
  domain: RuntimeArtifactDomain;
  maxManifestBytes?: number;
}): RuntimeArtifactContract {
  return {
    artifactType: input.artifactType,
    contractId: input.contractId,
    domain: input.domain,
    storagePolicy: "metadata_manifest_only",
    manifestSchemaRef: "RuntimeArtifactBoundedManifest",
    bodySchemaRef: null,
    maxManifestBytes: input.maxManifestBytes ?? 32 * 1024,
    maxBodyBytes: 0,
    hydrateToolId: "metadata",
    rawStoragePolicy: FALSE_RAW_STORAGE_POLICY,
    legacyHydration: { allowed: false, bodyKeys: [] },
    cleanSuccessEligible: true,
  };
}

function jsonByteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function record(value: JsonValue | undefined): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, JsonValue>;
}

function stringField(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayField(value: JsonValue | undefined, max = 40): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string").slice(0, max);
}

function bounded(value: string | null | undefined, max = 900): string | null {
  const normalized = (value ?? "").trim().replace(/\s+/gu, " ");
  if (!normalized) {
    return null;
  }
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}...`;
}

function inferSummaryFromBody(body: JsonValue, contract: RuntimeArtifactContract): string {
  const bodyRecord = record(body);
  const summary =
    stringField(bodyRecord.boundedSummary) ??
    stringField(bodyRecord.handoffSummaryForImplementation) ??
    stringField(bodyRecord.workerObjective) ??
    stringField(bodyRecord.objectiveSummary) ??
    stringField(bodyRecord.currentObjective) ??
    stringField(bodyRecord.taskSummary) ??
    stringField(bodyRecord.reasonSummary);
  if (summary) {
    return bounded(summary, 1_200) ?? contract.artifactType;
  }
  const id =
    stringField(bodyRecord.packetId) ??
    stringField(bodyRecord.nodeId) ??
    stringField(bodyRecord.commitmentId) ??
    stringField(bodyRecord.graphId);
  return bounded(`${contract.artifactType}${id ? ` ${id}` : ""}`, 1_200) ?? contract.artifactType;
}

function inferTargetCommitmentIds(body: JsonValue, metadata: Record<string, JsonValue>): string[] {
  const bodyRecord = record(body);
  return [
    ...stringArrayField(bodyRecord.targetCommitmentIds),
    ...stringArrayField(bodyRecord.commitmentIds),
    ...stringArrayField(metadata.targetCommitmentIds),
    ...(typeof bodyRecord.commitmentId === "string" ? [bodyRecord.commitmentId] : []),
    ...(typeof metadata.commitmentId === "string" ? [metadata.commitmentId] : []),
  ]
    .filter((value, index, array) => value.trim() && array.indexOf(value) === index)
    .slice(0, 40);
}

function inferTargetNodeIds(body: JsonValue, metadata: Record<string, JsonValue>): string[] {
  const bodyRecord = record(body);
  return [
    ...stringArrayField(bodyRecord.targetNodeIds),
    ...stringArrayField(metadata.targetNodeIds),
    ...(typeof bodyRecord.nodeId === "string" ? [bodyRecord.nodeId] : []),
    ...(typeof bodyRecord.sourceNodeId === "string" ? [bodyRecord.sourceNodeId] : []),
    ...(typeof metadata.nodeId === "string" ? [metadata.nodeId] : []),
  ]
    .filter((value, index, array) => value.trim() && array.indexOf(value) === index)
    .slice(0, 40);
}

function bodyContainsRegisteredBodyKey(metadata: JsonValue, path = "metadata"): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  if (Array.isArray(metadata)) {
    for (let index = 0; index < metadata.length; index += 1) {
      const child = bodyContainsRegisteredBodyKey(metadata[index], `${path}[${index}]`);
      if (child) {
        return child;
      }
    }
    return null;
  }
  for (const [key, value] of Object.entries(metadata)) {
    if (BODY_KEY_HINTS.has(key) && value !== null && value !== undefined) {
      if (
        typeof value === "number" &&
        (path.endsWith(".inputCounts") ||
          path.endsWith(".outputCounts") ||
          path.endsWith(".maxBounds"))
      ) {
        continue;
      }
      return `${path}.${key}`;
    }
    const child = bodyContainsRegisteredBodyKey(value, `${path}.${key}`);
    if (child) {
      return child;
    }
  }
  return null;
}

export function listRuntimeArtifactContracts(): RuntimeArtifactContract[] {
  return [...CONTRACTS];
}

export function getRuntimeArtifactContract(artifactType: string): RuntimeArtifactContract | null {
  return CONTRACT_BY_TYPE.get(artifactType) ?? null;
}

export function isRuntimeArtifactPayloadRequired(artifactType: string): boolean {
  const contract = getRuntimeArtifactContract(artifactType);
  return (
    contract?.storagePolicy === "payload_required" ||
    contract?.storagePolicy === "payload_parts_required"
  );
}

export function buildRuntimeArtifactContractPayloadInput(
  input: RuntimeArtifactContractAttachInput,
): AttachRuntimeJobJsonPayloadArtifactInput {
  const contract = getRuntimeArtifactContract(input.artifactType);
  if (!contract) {
    throw new Error(`runtime artifact contract missing for artifactType=${input.artifactType}`);
  }
  if (contract.storagePolicy !== "payload_required") {
    throw new Error(
      `runtime artifact contract storage policy is not payload_required for artifactType=${input.artifactType}`,
    );
  }
  const metadata = input.metadata ?? {};
  const bodyBytes = jsonByteLength(input.body);
  if (bodyBytes > contract.maxBodyBytes) {
    throw new Error(
      `runtime artifact body exceeds contract maxBodyBytes:${bodyBytes}:${contract.maxBodyBytes}; artifactType=${input.artifactType}`,
    );
  }
  return {
    ...input,
    boundedSummary: input.boundedSummary ?? inferSummaryFromBody(input.body, contract),
    targetCommitmentIds:
      input.targetCommitmentIds ?? inferTargetCommitmentIds(input.body, metadata),
    targetNodeIds: input.targetNodeIds ?? inferTargetNodeIds(input.body, metadata),
    resourcePacketKind:
      input.resourcePacketKind ??
      stringField(record(input.body).packetKind) ??
      stringField(record(input.body).artifactKind) ??
      contract.domain,
    readinessStatus:
      input.readinessStatus ??
      stringField(record(input.body).readinessStatus) ??
      stringField(record(input.body).status),
    reasonCodes: input.reasonCodes ?? [
      `runtime_artifact_contract:${contract.contractId}`,
      "runtime_artifact_contract_payload_required",
    ],
    createdBy: input.createdBy ?? "runtime_artifact_contract_registry",
    metadata: {
      ...metadata,
      runtimeArtifactContract: {
        schemaVersion: RUNTIME_ARTIFACT_CONTRACT_SCHEMA_VERSION,
        contractId: contract.contractId,
        artifactType: contract.artifactType,
        domain: contract.domain,
        storagePolicy: contract.storagePolicy,
        bodySchemaRef: contract.bodySchemaRef,
        manifestSchemaRef: contract.manifestSchemaRef,
        hydrateToolId: contract.hydrateToolId,
        cleanSuccessEligible: contract.cleanSuccessEligible,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    },
  };
}

export function assertRuntimeArtifactContractStorage(input: AttachRuntimeJobArtifactInput): void {
  const contract = getRuntimeArtifactContract(input.artifactType);
  if (!contract) {
    return;
  }
  const metadata = input.metadata ?? {};
  const metadataBytes = jsonByteLength(metadata);
  if (metadataBytes > contract.maxManifestBytes) {
    throw new Error(
      `runtime artifact metadata exceeds contract maxManifestBytes:${metadataBytes}:${contract.maxManifestBytes}; artifactType=${input.artifactType}`,
    );
  }
  if (contract.storagePolicy === "payload_required" && input.storageKind !== "runtime-artifact-payload") {
    throw new Error(
      `runtime artifact contract requires payload storage; artifactType=${input.artifactType}; contractId=${contract.contractId}`,
    );
  }
  const bodyPath = bodyContainsRegisteredBodyKey(metadata);
  if (bodyPath) {
    throw new Error(
      `runtime artifact metadata manifest violation at ${bodyPath}; artifactType=${input.artifactType}; contractId=${contract.contractId}`,
    );
  }
  if (contract.storagePolicy === "payload_required") {
    const metadataRecord = record(metadata);
    if (metadataRecord.artifactKind !== "runtime_job_artifact_payload_manifest") {
      throw new Error(
        `runtime artifact contract requires payload manifest metadata; artifactType=${input.artifactType}; contractId=${contract.contractId}`,
      );
    }
  }
}

export function findRuntimeArtifactLegacyBody(
  artifact: RuntimeJobArtifact,
): { body: JsonValue; bodyKey: string } | null {
  const contract = getRuntimeArtifactContract(artifact.artifactType);
  if (!contract?.legacyHydration.allowed) {
    return null;
  }
  const metadata = record(artifact.metadata);
  for (const key of contract.legacyHydration.bodyKeys) {
    if (metadata[key] !== undefined && metadata[key] !== null) {
      return { body: metadata[key], bodyKey: key };
    }
  }
  if (
    metadata.artifactKind === artifact.artifactType ||
    metadata.packetKind ||
    metadata.schemaVersion
  ) {
    return { body: artifact.metadata, bodyKey: "metadata" };
  }
  return null;
}
