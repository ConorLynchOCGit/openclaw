import {
  BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS,
  boundaryReplayCheckpointKindForProofBoundaryId,
  type BoundaryReplayProductionProofBoundaryId,
} from "./boundary-replay-registry.ts";
import {
  evaluateProductSpecProofCleanliness,
  evaluateProductSpecProofFamily,
  PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
  type ProductSpecProofFamily,
  type ProductSpecProofSourceClassification,
  type ProductSpecTargetSubjectRef,
} from "./product-spec-proof-substrate.ts";

export const PRODUCT_SPEC_REPLAY_PROOF_ADMISSION_SCHEMA_VERSION =
  "execution-platform.product-spec-replay-proof-admission.v1";

export type ProductSpecReplayProofAdmission = {
  artifactKind: "execution_platform.product_spec_replay_proof_admission";
  schemaVersion: typeof PRODUCT_SPEC_REPLAY_PROOF_ADMISSION_SCHEMA_VERSION;
  status: "admitted" | "blocked";
  proofStatus: string | null;
  boundary: string | null;
  executeWorkers: boolean;
  productionReplayBoundaryCoverage: Array<{
    boundaryId: BoundaryReplayProductionProofBoundaryId;
    checkpointKind: string;
    checkpointRef: string | null;
    status: string;
  }>;
  missingBoundaryIds: BoundaryReplayProductionProofBoundaryId[];
  replayPlanStatus: string | null;
  replayPlanProofClosureAllowed: boolean | null;
  proofClosureAllowed: boolean;
  workerStatus: string | null;
  selectedNodeId: string | null;
  selectedNodeKind: string | null;
  selectedNodeExecutable: boolean;
  selectedExecutionReadinessAuthority: string | null;
  selectedRecomputedReadinessCanExecute: boolean;
  selectedImplementationPacketReady: boolean;
  selectedReadinessProjectionCanUnlockExecution: boolean | null;
  changedFileRefs: string[];
  validationRefs: string[];
  evidenceClaimRefs: string[];
  blockerReasonCodes: string[];
  admissionReasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogsStored: false;
  rawDbRowsStored: false;
  authorityGranted: false;
  workQueueLifecycleMutated: false;
  proofSourceKind: string | null;
  proofSourceAccepted: boolean;
  proofRunId: string | null;
  proofRunManifestRef: string | null;
  proofFamily: ProductSpecProofFamily;
  executorWorkflowId: string | null;
  subjectWorkflowIds: string[];
  targetSubjectRefs: ProductSpecTargetSubjectRef[];
  requestedCapabilities: string[];
  proofSourceClassification: ProductSpecProofSourceClassification;
  runScopedProofManifestAccepted: boolean;
  sourceTopologyStatus: "production_node_local_topology" | "stale_retired_topology" | "unknown";
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown, max = 40): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .map((item) => (typeof item === "string" && item.trim() ? item.trim() : null))
            .filter((item): item is string => Boolean(item)),
        ),
      ].slice(0, max)
    : [];
}

function boolValue(value: unknown): boolean {
  return value === true;
}

function nodeKindsFromGraphSummary(value: unknown): string[] {
  const summary = asRecord(value);
  return Array.isArray(summary.nodes)
    ? [
        ...new Set(
          summary.nodes
            .map((node) => stringValue(asRecord(node).nodeKind))
            .filter((nodeKind): nodeKind is string => Boolean(nodeKind)),
        ),
      ]
    : [];
}

function graphHasResourceFulfillmentFanout(value: unknown): boolean {
  const summary = asRecord(value);
  const nodes = Array.isArray(summary.nodes) ? summary.nodes : [];
  const edges = Array.isArray(summary.edges) ? summary.edges : [];
  const contextNodeIds = new Set(
    nodes
      .map((node) => {
        const record = asRecord(node);
        const nodeKind = stringValue(record.nodeKind);
        const nodeId = stringValue(record.nodeId);
        return nodeId && (nodeKind === "resource_scout" || nodeKind === "web_research")
          ? nodeId
          : null;
      })
      .filter((nodeId): nodeId is string => Boolean(nodeId)),
  );
  return edges.some((edge) => {
    const record = asRecord(edge);
    return (
      stringValue(record.edgeKind) === "context_supplies" &&
      contextNodeIds.has(stringValue(record.fromNodeId) ?? "")
    );
  });
}

function graphHasDefaultContextAcquisitionNode(value: unknown): boolean {
  const summary = asRecord(value);
  const nodes = Array.isArray(summary.nodes) ? summary.nodes : [];
  return nodes.some((node) => {
    const nodeKind = stringValue(asRecord(node).nodeKind);
    return nodeKind === "resource_scout" || nodeKind === "web_research";
  });
}

function evidenceClaimRefsFromWorker(worker: Record<string, unknown>): string[] {
  return Array.isArray(worker.evidenceClaims)
    ? worker.evidenceClaims
        .map((claim) => stringValue(asRecord(claim).evidenceRef))
        .filter((ref): ref is string => Boolean(ref))
        .slice(0, 40)
    : [];
}

function coverageByBoundary(input: {
  replayBoundaryCoverage?: unknown;
  boundaryReplayProofGate?: unknown;
}): ProductSpecReplayProofAdmission["productionReplayBoundaryCoverage"] {
  const direct = Array.isArray(input.replayBoundaryCoverage) ? input.replayBoundaryCoverage : null;
  const nestedCoverage = asRecord(input.boundaryReplayProofGate).productionReplayBoundaryCoverage;
  const nested = Array.isArray(nestedCoverage) ? nestedCoverage : null;
  const coverage = direct ?? nested ?? [];
  return coverage
    .map((entry) => {
      const record = asRecord(entry);
      const boundaryId = stringValue(record.boundaryId);
      if (
        !boundaryId ||
        !BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS.includes(
          boundaryId as BoundaryReplayProductionProofBoundaryId,
        )
      ) {
        return null;
      }
      return {
        boundaryId: boundaryId as BoundaryReplayProductionProofBoundaryId,
        checkpointKind:
          stringValue(record.checkpointKind) ??
          boundaryReplayCheckpointKindForProofBoundaryId(boundaryId) ??
          "unknown",
        checkpointRef: stringValue(record.checkpointRef),
        status: stringValue(record.status) ?? "unknown",
      };
    })
    .filter(
      (
        entry,
      ): entry is ProductSpecReplayProofAdmission["productionReplayBoundaryCoverage"][number] =>
        Boolean(entry),
    );
}

export function evaluateProductSpecReplayProofAdmission(input: {
  proof: Record<string, unknown>;
  replayPlan?: Record<string, unknown> | null;
}): ProductSpecReplayProofAdmission {
  const proof = input.proof;
  const selected = asRecord(proof.selectedBoundaryNode);
  const worker = asRecord(proof.workerSmokeResult);
  const middleLaneProof = asRecord(proof.middleLaneProof);
  const replayPlan = asRecord(input.replayPlan);
  const coverage = coverageByBoundary({
    replayBoundaryCoverage: proof.replayBoundaryCoverage,
    boundaryReplayProofGate: proof.boundaryReplayProofGate,
  });
  const coveredIds = new Set(
    coverage
      .filter((entry) => entry.status === "accepted")
      .map((entry) => entry.boundaryId),
  );
  const missingBoundaryIds = BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS.filter(
    (boundaryId) => !coveredIds.has(boundaryId),
  );
  const changedFileRefs = stringArray(worker.changedFileRefs, 40);
  const validationRefs = stringArray(worker.validationRefs, 40);
  const evidenceClaimRefs = evidenceClaimRefsFromWorker(worker);
  const replayPlanPresent = Object.keys(replayPlan).length > 0;
  const readinessProjectionCanUnlockExecution =
    typeof selected.readinessProjectionCanUnlockExecution === "boolean"
      ? selected.readinessProjectionCanUnlockExecution
      : null;
  const recomputedReadinessCanExecute = boolValue(selected.recomputedReadinessCanExecute);
  const implementationPacketReady = boolValue(selected.implementationPacketReady);
  const executionReadinessAuthority = stringValue(selected.executionReadinessAuthority);
  const nodeKinds = [
    ...nodeKindsFromGraphSummary(proof.beforeGraph),
    ...nodeKindsFromGraphSummary(proof.afterGraph),
  ];
  const graphHasLegacyContextFanout =
    graphHasResourceFulfillmentFanout(proof.beforeGraph) ||
    graphHasResourceFulfillmentFanout(proof.afterGraph);
  const graphHasDefaultContextAcquisition =
    graphHasDefaultContextAcquisitionNode(proof.beforeGraph) ||
    graphHasDefaultContextAcquisitionNode(proof.afterGraph);
  const proofSourceKind = stringValue(proof.proofSourceKind);
  const routeRefs = asRecord(proof.routeRefs);
  const familyGate = evaluateProductSpecProofFamily({
    proofFamily: proof.proofFamily,
    executorWorkflowId: proof.executorWorkflowId ?? routeRefs.executorWorkflowId,
    workflowId: proof.workflowId,
    subjectWorkflowIds: proof.subjectWorkflowIds ?? routeRefs.subjectWorkflowIds,
    targetSubjectRefs: proof.targetSubjectRefs ?? routeRefs.targetSubjectRefs,
    requestedCapabilities: proof.requestedCapabilities ?? routeRefs.requestedCapabilities,
  });
  const proofFamily = familyGate.proofFamily;
  const codingExecutorProof = proofFamily === "coding_executor_target_subject";
  const proofBoundary = stringValue(proof.boundary);
  const nodeLocalMiddleLaneBoundary = proofBoundary === "node-local-middle-lane";
  const middleLaneLifecyclePath = stringArray(middleLaneProof.lifecyclePath, 24);
  const workerOwnedContextDiscovery = asRecord(middleLaneProof.workerOwnedContextDiscovery);
  const middleLaneRequiredLifecycleGates = [
    "work_intent_accepted",
    "worker_started_with_partial_authority",
    "worker_context_request_more",
    "worker_context_specialist_narrowing_completed",
    "worker_edit_completed",
    "post_action_validation_passed",
    "evidence_emitted",
  ];
  const middleLaneLifecycleComplete = middleLaneRequiredLifecycleGates.every((gate) =>
    middleLaneLifecyclePath.includes(gate),
  );
  const middleLanePassed =
    !nodeLocalMiddleLaneBoundary ||
    (stringValue(middleLaneProof.status) === "passed" &&
      boolValue(middleLaneProof.implementationNodeStarted) &&
      stringValue(workerOwnedContextDiscovery.status) === "fulfilled" &&
      boolValue(workerOwnedContextDiscovery.modelAuthored) &&
      ["open", "fulfilled", "succeeded", "worker_owned_fulfilled"].includes(
        stringValue(middleLaneProof.nodeResourceDemandStatus) ?? "",
      ) &&
      boolValue(middleLaneProof.nodeResourceLedgerReady) &&
      stringValue(middleLaneProof.actionGateStatus) === "worker_owned_ready" &&
      stringValue(middleLaneProof.workerEditStatus) === "completed" &&
      stringValue(middleLaneProof.validationStatus) === "passed" &&
      stringValue(middleLaneProof.evidenceStatus) === "emitted" &&
      boolValue(middleLaneProof.realModelProof) &&
      typeof middleLaneProof.providerCallCount === "number" &&
      middleLaneProof.providerCallCount > 0 &&
      boolValue(middleLaneProof.metadataManifestSafe) &&
      middleLaneLifecycleComplete);
  const graphHasRetiredTopology =
    nodeKinds.includes("context_synthesis") ||
    graphHasDefaultContextAcquisition ||
    graphHasLegacyContextFanout;
  const sourceTopologyStatus = graphHasRetiredTopology
    ? "stale_retired_topology"
    : proof.beforeGraph || proof.afterGraph
      ? "production_node_local_topology"
      : "unknown";
  const proofRunId = stringValue(proof.proofRunId);
  const proofRunManifestRef = stringValue(proof.proofRunManifestRef);
  const proofArtifactRefs = stringArray(proof.proofArtifactRefs, 80);
  const cleanlinessGate = evaluateProductSpecProofCleanliness({
    proofSourceKind,
    proofRunId,
    proofRunManifestRef,
    runtimeJobId: proof.runtimeJobId,
    graphId: proof.graphId,
    proofFamily: familyGate.proofFamily,
    executorWorkflowId: familyGate.executorWorkflowId,
    subjectWorkflowIds: familyGate.subjectWorkflowIds,
    targetSubjectRefs: familyGate.targetSubjectRefs,
    requestedCapabilities: familyGate.requestedCapabilities,
    sourceTopologyStatus,
    // Admission computes the closure predicate, so this source-cleanliness pass uses a
    // provisional admitted predicate and lets the replay admission blockers decide closure.
    closurePredicateStatus: "admitted",
    proofClosureAllowed: true,
    beforeGraph: proof.beforeGraph,
    afterGraph: proof.afterGraph,
    proofArtifactRefs,
  });
  const proofSourceAccepted =
    proofSourceKind === PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE &&
    cleanlinessGate.status === "passed";
  const blockerReasonCodes = [
    ...(proofSourceAccepted ? [] : ["proof_source_not_product_spec_runtime_boundary_replay"]),
    ...cleanlinessGate.reasonCodes,
    ...(familyGate.status === "passed" ? [] : ["proof_family_gate_not_passed"]),
    ...familyGate.reasonCodes,
    ...(stringValue(proof.status) === "succeeded" ? [] : ["proof_status_not_succeeded"]),
    ...(proofBoundary === "after-resource-materialization" || nodeLocalMiddleLaneBoundary
      ? []
      : ["proof_boundary_not_after_resource_materialization_or_node_local_middle_lane"]),
    ...(boolValue(proof.executeWorkers) ? [] : ["proof_worker_execution_not_enabled"]),
    ...(boolValue(proof.replayGraphCreated) ? ["proof_created_replay_graph"] : []),
    ...(boolValue(proof.routerRerun) ? ["proof_reran_router"] : []),
    ...(boolValue(proof.missionLedgerRerun) ? ["proof_reran_mission_ledger"] : []),
    ...(boolValue(proof.contextScoutRerun) ? ["proof_reran_resource_scout"] : []),
    ...(boolValue(proof.resourceMaterializationRerun)
      ? ["proof_reran_resource_materialization"]
      : []),
    ...(nodeKinds.includes("context_synthesis")
      ? ["proof_graph_contains_context_synthesis_node"]
      : []),
    ...(graphHasDefaultContextAcquisition
      ? ["proof_graph_contains_default_context_acquisition_node"]
      : []),
    ...(graphHasLegacyContextFanout ? ["proof_graph_contains_legacy_resource_fulfillment_fanout"] : []),
    ...(graphHasRetiredTopology
      ? ["proof_source_stale_retired_topology_not_closure_evidence"]
      : []),
    ...(stringValue(worker.status) === "succeeded" ? [] : ["worker_smoke_not_succeeded"]),
    ...(stringValue(selected.nodeExecutionPacketRef) ? [] : ["selected_node_packet_ref_missing"]),
    ...(stringValue(selected.resourcePacketRef) || nodeLocalMiddleLaneBoundary
      ? []
      : ["selected_resource_packet_ref_missing"]),
    ...(stringValue(selected.nodeReadinessStateRef)
      ? []
      : ["selected_readiness_state_ref_missing"]),
    ...(boolValue(selected.executable) ? [] : ["selected_node_not_executable"]),
    ...(executionReadinessAuthority === "recomputed_current_readiness"
      ? []
      : ["selected_execution_readiness_authority_invalid"]),
    ...(readinessProjectionCanUnlockExecution === false && !recomputedReadinessCanExecute
      ? ["selected_recomputed_readiness_cannot_execute"]
      : []),
    ...(readinessProjectionCanUnlockExecution === false && !implementationPacketReady
      ? ["selected_implementation_packet_not_ready"]
      : []),
    ...(codingExecutorProof && changedFileRefs.length === 0
      ? ["worker_changed_file_refs_missing"]
      : []),
    ...(validationRefs.length > 0 ? [] : ["worker_validation_refs_missing"]),
    ...(evidenceClaimRefs.length > 0 ? [] : ["worker_evidence_claim_refs_missing"]),
    ...(middleLanePassed
      ? []
      : [
          "middle_lane_proof_not_passed",
          ...(middleLaneLifecycleComplete ? [] : ["middle_lane_lifecycle_path_incomplete"]),
          ...(boolValue(middleLaneProof.implementationNodeStarted)
            ? []
            : ["middle_lane_implementation_node_not_started"]),
          ...(stringValue(workerOwnedContextDiscovery.status) === "fulfilled"
            ? []
            : ["middle_lane_worker_context_request_not_accepted"]),
          ...(boolValue(workerOwnedContextDiscovery.modelAuthored)
            ? []
            : ["middle_lane_worker_context_request_not_model_authored"]),
          ...(["open", "fulfilled", "succeeded", "worker_owned_fulfilled"].includes(
            stringValue(middleLaneProof.nodeResourceDemandStatus) ?? "",
          )
            ? []
            : ["middle_lane_node_resource_demand_not_open_or_fulfilled"]),
          ...(boolValue(middleLaneProof.nodeResourceLedgerReady)
            ? []
            : ["middle_lane_resource_ledger_not_ready"]),
          ...(stringValue(middleLaneProof.actionGateStatus) === "worker_owned_ready"
            ? []
            : ["middle_lane_action_gate_not_ready"]),
          ...(stringValue(middleLaneProof.workerEditStatus) === "completed"
            ? []
            : ["middle_lane_worker_edit_not_completed"]),
          ...(stringValue(middleLaneProof.validationStatus) === "passed"
            ? []
            : ["middle_lane_validation_not_passed"]),
          ...(stringValue(middleLaneProof.evidenceStatus) === "emitted"
            ? []
            : ["middle_lane_evidence_not_emitted"]),
          ...(boolValue(middleLaneProof.realModelProof) &&
          typeof middleLaneProof.providerCallCount === "number" &&
          middleLaneProof.providerCallCount > 0
            ? []
            : ["middle_lane_real_model_provider_calls_missing"]),
          ...(boolValue(middleLaneProof.metadataManifestSafe)
            ? []
            : ["middle_lane_metadata_manifest_not_safe"]),
        ]),
    ...(missingBoundaryIds.length > 0 ? ["production_replay_boundary_coverage_incomplete"] : []),
    ...(replayPlanPresent ? [] : ["replay_plan_missing"]),
    ...(replayPlanPresent && replayPlan.status !== "accepted" ? ["replay_plan_not_accepted"] : []),
    ...(replayPlanPresent && replayPlan.proofClosureAllowed !== true
      ? ["replay_plan_proof_closure_not_allowed"]
      : []),
    ...(boolValue(proof.rawPromptStored) ||
    boolValue(proof.rawResponseStored) ||
    boolValue(proof.rawProviderLogStored) ||
    boolValue(proof.rawToolLogStored)
      ? ["proof_raw_storage_flag_invalid"]
      : []),
    ...(boolValue(worker.rawPromptStored) ||
    boolValue(worker.rawResponseStored) ||
    boolValue(worker.rawProviderLogStored) ||
    boolValue(worker.rawToolLogStored)
      ? ["worker_raw_storage_flag_invalid"]
      : []),
  ];
  const uniqueBlockerReasonCodes = [...new Set(blockerReasonCodes)].slice(0, 120);
  const status = uniqueBlockerReasonCodes.length === 0 ? "admitted" : "blocked";
  return {
    artifactKind: "execution_platform.product_spec_replay_proof_admission",
    schemaVersion: PRODUCT_SPEC_REPLAY_PROOF_ADMISSION_SCHEMA_VERSION,
    status,
    proofStatus: stringValue(proof.status),
    boundary: stringValue(proof.boundary),
    executeWorkers: boolValue(proof.executeWorkers),
    productionReplayBoundaryCoverage: coverage,
    missingBoundaryIds,
    replayPlanStatus: stringValue(replayPlan.status),
    replayPlanProofClosureAllowed:
      typeof replayPlan.proofClosureAllowed === "boolean"
        ? replayPlan.proofClosureAllowed
        : null,
    proofClosureAllowed: status === "admitted",
    workerStatus: stringValue(worker.status),
    selectedNodeId: stringValue(selected.nodeId),
    selectedNodeKind: stringValue(selected.nodeKind),
    selectedNodeExecutable: boolValue(selected.executable),
    selectedExecutionReadinessAuthority: executionReadinessAuthority,
    selectedRecomputedReadinessCanExecute: recomputedReadinessCanExecute,
    selectedImplementationPacketReady: implementationPacketReady,
    selectedReadinessProjectionCanUnlockExecution: readinessProjectionCanUnlockExecution,
    changedFileRefs,
    validationRefs,
    evidenceClaimRefs,
    blockerReasonCodes: uniqueBlockerReasonCodes,
    admissionReasonCodes: [
      status === "admitted"
        ? "product_spec_replay_proof_admitted"
        : "product_spec_replay_proof_blocked",
      ...(status === "admitted"
        ? ["production_replay_boundary_sequence_covered", "worker_boundary_evidence_present"]
        : uniqueBlockerReasonCodes),
    ].slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogsStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    workQueueLifecycleMutated: false,
    proofSourceKind,
    proofSourceAccepted,
    proofRunId,
    proofRunManifestRef,
    proofFamily: familyGate.proofFamily,
    executorWorkflowId: familyGate.executorWorkflowId,
    subjectWorkflowIds: familyGate.subjectWorkflowIds,
    targetSubjectRefs: familyGate.targetSubjectRefs,
    requestedCapabilities: familyGate.requestedCapabilities,
    proofSourceClassification: cleanlinessGate.proofSourceClassification,
    runScopedProofManifestAccepted: cleanlinessGate.runScopedManifest,
    sourceTopologyStatus,
  };
}
