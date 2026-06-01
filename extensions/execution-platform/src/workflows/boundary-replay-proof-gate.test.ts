import { describe, expect, it } from "vitest";
import {
  BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS,
  boundaryReplayCheckpointKindForProofBoundaryId,
} from "./boundary-replay-registry.ts";
import { evaluateProductSpecReplayProofAdmission } from "./boundary-replay-proof-gate.ts";

function acceptedCoverage() {
  return BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS.map((boundaryId) => ({
    boundaryId,
    checkpointKind: boundaryReplayCheckpointKindForProofBoundaryId(boundaryId) ?? "unknown",
    checkpointRef: `runtime-job://job/boundary-replay/${boundaryId}`,
    status: "accepted",
  }));
}

function acceptedReplayPlan() {
  return {
    status: "accepted",
    proofClosureAllowed: true,
  };
}

function acceptedProof(): Record<string, any> {
  return {
    status: "succeeded",
    proofSourceKind: "product_spec_runtime_boundary_replay",
    proofFamily: "coding_executor_target_subject",
    executorWorkflowId: "agent_team.coding",
    subjectWorkflowIds: ["agent_team.product_spec_planning"],
    targetSubjectRefs: [
      {
        targetKind: "workflow",
        targetRef: "workflow://agent_team.product_spec_planning",
        confidence: 0.96,
      },
    ],
    requestedCapabilities: ["code_edit", "test", "docs_update", "review"],
    proofRunId: "product-spec-proof-run-current",
    proofRunManifestRef:
      ".artifacts/execution-platform/proof-runs/product-spec-proof-run-current/manifest.json",
    proofArtifactRefs: [
      ".artifacts/execution-platform/proof-runs/product-spec-proof-run-current/boundary-replay-result.json",
      ".artifacts/execution-platform/proof-runs/product-spec-proof-run-current/admission-gate.json",
      ".artifacts/execution-platform/proof-runs/product-spec-proof-run-current/resource-materialization-proof.json",
    ],
    boundary: "after-resource-materialization",
    executeWorkers: true,
    replayGraphCreated: false,
    routerRerun: false,
    missionLedgerRerun: false,
    commitmentPacketAuthorRerun: false,
    contextScoutRerun: false,
    resourceMaterializationRerun: false,
    replayBoundaryCoverage: acceptedCoverage(),
    selectedBoundaryNode: {
      nodeId: "implementation-node-1",
      nodeKind: "implementation_microtask",
      executable: true,
      nodeExecutionPacketRef: "node-execution-packet://node-1",
      resourcePacketRef: "coding-resource-packet://node-1",
      nodeReadinessStateRef: "node-readiness-state://node-1",
      executionReadinessAuthority: "recomputed_current_readiness",
      readinessProjectionCanUnlockExecution: false,
      recomputedReadinessCanExecute: true,
      implementationPacketReady: true,
    },
    workerSmokeResult: {
      status: "succeeded",
      changedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      validationRefs: ["validation://boundary-replay/passed/example"],
      evidenceClaims: [{ evidenceRef: "evidence://commitment/example" }],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    beforeGraph: {
      nodes: [{ nodeKind: "implementation_microtask" }],
    },
    afterGraph: {
      nodes: [{ nodeKind: "implementation_microtask" }],
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

describe("Product/Spec replay proof admission gate", () => {
  it("admits a production-faithful replay with boundary coverage, worker evidence, and no reruns", () => {
    const admission = evaluateProductSpecReplayProofAdmission({
      proof: acceptedProof(),
      replayPlan: acceptedReplayPlan(),
    });

    expect(admission).toMatchObject({
      artifactKind: "execution_platform.product_spec_replay_proof_admission",
      status: "admitted",
      proofClosureAllowed: true,
      proofSourceKind: "product_spec_runtime_boundary_replay",
      proofSourceAccepted: true,
      proofSourceClassification: "fresh_product_spec_runtime_boundary_replay",
      proofFamily: "coding_executor_target_subject",
      executorWorkflowId: "agent_team.coding",
      runScopedProofManifestAccepted: true,
      sourceTopologyStatus: "production_node_local_topology",
      proofStatus: "succeeded",
      boundary: "after-resource-materialization",
      executeWorkers: true,
      replayPlanStatus: "accepted",
      replayPlanProofClosureAllowed: true,
      selectedNodeExecutable: true,
      selectedExecutionReadinessAuthority: "recomputed_current_readiness",
      selectedRecomputedReadinessCanExecute: true,
      selectedImplementationPacketReady: true,
      blockerReasonCodes: [],
      rawPromptStored: false,
    });
    expect(admission.missingBoundaryIds).toEqual([]);
    expect(admission.productionReplayBoundaryCoverage).toHaveLength(
      BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS.length,
    );
  });

  it("blocks coding executor proof when Product-Spec is not declared as the target subject", () => {
    const proof = acceptedProof();
    proof.subjectWorkflowIds = ["agent_team.coding"];
    proof.targetSubjectRefs = [];

    const admission = evaluateProductSpecReplayProofAdmission({
      proof,
      replayPlan: acceptedReplayPlan(),
    });

    expect(admission.status).toBe("blocked");
    expect(admission.blockerReasonCodes).toEqual(
      expect.arrayContaining([
        "proof_family_gate_not_passed",
        "coding_executor_target_subject_product_spec_subject_missing",
      ]),
    );
  });

  it("admits a Product-Spec Planning executor proof without requiring changed source files", () => {
    const proof = acceptedProof();
    proof.proofFamily = "product_spec_planning_executor";
    proof.executorWorkflowId = "agent_team.product_spec_planning";
    proof.subjectWorkflowIds = [];
    proof.targetSubjectRefs = [];
    proof.requestedCapabilities = ["planning", "action_graph", "closeout"];
    proof.selectedBoundaryNode.nodeKind = "planning_artifact_compilation";
    proof.workerSmokeResult.changedFileRefs = [];
    proof.workerSmokeResult.validationRefs = ["validation://planning-proof/passed"];
    proof.workerSmokeResult.evidenceClaims = [{ evidenceRef: "evidence://planning-proof/capsule" }];

    const admission = evaluateProductSpecReplayProofAdmission({
      proof,
      replayPlan: acceptedReplayPlan(),
    });

    expect(admission.status).toBe("admitted");
    expect(admission.proofFamily).toBe("product_spec_planning_executor");
    expect(admission.changedFileRefs).toEqual([]);
    expect(admission.blockerReasonCodes).toEqual([]);
  });

  it("blocks Product-Spec Planning executor proof that attempts coding work", () => {
    const proof = acceptedProof();
    proof.proofFamily = "product_spec_planning_executor";
    proof.executorWorkflowId = "agent_team.product_spec_planning";
    proof.subjectWorkflowIds = [];
    proof.targetSubjectRefs = [];
    proof.requestedCapabilities = ["planning", "code_edit"];

    const admission = evaluateProductSpecReplayProofAdmission({
      proof,
      replayPlan: acceptedReplayPlan(),
    });

    expect(admission.status).toBe("blocked");
    expect(admission.blockerReasonCodes).toEqual(
      expect.arrayContaining(["product_spec_planning_executor_exposes_coding_capability"]),
    );
  });

  it("admits a node-local middle-lane replay only when worker-owned context, edit, validation, and evidence are proven", () => {
    const proof = acceptedProof();
    proof.boundary = "node-local-middle-lane";
    proof.selectedBoundaryNode.resourcePacketRef = null;
    proof.middleLaneProof = {
      status: "passed",
      lifecyclePath: [
        "work_intent_accepted",
        "worker_started_with_partial_authority",
        "worker_context_request_more",
        "worker_context_specialist_narrowing_completed",
        "worker_edit_completed",
        "post_action_validation_passed",
        "evidence_emitted",
      ],
      implementationNodeStarted: true,
      workerOwnedContextDiscovery: { status: "fulfilled", modelAuthored: true },
      nodeResourceDemandStatus: "worker_owned_fulfilled",
      nodeResourceLedgerReady: true,
      actionGateStatus: "worker_owned_ready",
      workerEditStatus: "completed",
      validationStatus: "passed",
      evidenceStatus: "emitted",
      realModelProof: true,
      providerCallCount: 5,
      metadataManifestSafe: true,
    };

    const admission = evaluateProductSpecReplayProofAdmission({
      proof,
      replayPlan: acceptedReplayPlan(),
    });

    expect(admission.status).toBe("admitted");
    expect(admission.proofClosureAllowed).toBe(true);
    expect(admission.boundary).toBe("node-local-middle-lane");
    expect(admission.blockerReasonCodes).toEqual([]);
  });

  it("blocks node-local middle-lane replay when worker-owned context or evidence closure is missing", () => {
    const proof = acceptedProof();
    proof.boundary = "node-local-middle-lane";
    proof.middleLaneProof = {
      status: "passed",
      lifecyclePath: ["work_intent_accepted", "worker_context_request_more"],
      implementationNodeStarted: true,
      workerOwnedContextDiscovery: { status: "blocked", modelAuthored: false },
      nodeResourceDemandStatus: "blocked",
      nodeResourceLedgerReady: true,
      actionGateStatus: "blocked",
      workerEditStatus: "completed",
      validationStatus: "passed",
      evidenceStatus: "missing",
      realModelProof: true,
      providerCallCount: 5,
      metadataManifestSafe: true,
    };

    const admission = evaluateProductSpecReplayProofAdmission({
      proof,
      replayPlan: acceptedReplayPlan(),
    });

    expect(admission.status).toBe("blocked");
    expect(admission.blockerReasonCodes).toEqual(
      expect.arrayContaining([
        "middle_lane_proof_not_passed",
        "middle_lane_lifecycle_path_incomplete",
        "middle_lane_worker_context_request_not_accepted",
        "middle_lane_worker_context_request_not_model_authored",
        "middle_lane_node_resource_demand_not_open_or_fulfilled",
        "middle_lane_action_gate_not_ready",
        "middle_lane_evidence_not_emitted",
      ]),
    );
  });

  it("blocks when replay boundary coverage or replay plan acceptance is missing", () => {
    const proof = acceptedProof();
    proof.replayBoundaryCoverage = proof.replayBoundaryCoverage.slice(0, 2);

    const admission = evaluateProductSpecReplayProofAdmission({
      proof,
      replayPlan: { status: "needs_review", proofClosureAllowed: false },
    });

    expect(admission.status).toBe("blocked");
    expect(admission.proofClosureAllowed).toBe(false);
    expect(admission.blockerReasonCodes).toContain(
      "production_replay_boundary_coverage_incomplete",
    );
    expect(admission.blockerReasonCodes).toContain("replay_plan_not_accepted");
    expect(admission.blockerReasonCodes).toContain("replay_plan_proof_closure_not_allowed");
    expect(admission.missingBoundaryIds.length).toBeGreaterThan(0);
  });

  it("blocks diagnostic/default context synthesis and rerun proof paths", () => {
    const proof = acceptedProof();
    proof.contextScoutRerun = true;
    proof.afterGraph = {
      nodes: [{ nodeKind: "context_synthesis" }],
    };

    const admission = evaluateProductSpecReplayProofAdmission({
      proof,
      replayPlan: acceptedReplayPlan(),
    });

    expect(admission.status).toBe("blocked");
    expect(admission.blockerReasonCodes).toContain("proof_reran_resource_scout");
    expect(admission.blockerReasonCodes).toContain("proof_graph_contains_context_synthesis_node");
  });

  it("blocks Product/Spec-class replay proof that still uses graph-level resource scout fanout", () => {
    const proof = acceptedProof();
    proof.afterGraph = {
      nodes: [
        { nodeId: "context-for-product-spec-routing", nodeKind: "resource_scout" },
        { nodeId: "implementation-product-spec-routing", nodeKind: "implementation" },
      ],
      edges: [
        {
          fromNodeId: "context-for-product-spec-routing",
          toNodeId: "implementation-product-spec-routing",
          edgeKind: "context_supplies",
        },
      ],
    };

    const admission = evaluateProductSpecReplayProofAdmission({
      proof,
      replayPlan: acceptedReplayPlan(),
    });

    expect(admission.status).toBe("blocked");
    expect(admission.blockerReasonCodes).toContain(
      "proof_graph_contains_default_context_acquisition_node",
    );
    expect(admission.blockerReasonCodes).toContain(
      "proof_graph_contains_legacy_resource_fulfillment_fanout",
    );
    expect(admission.blockerReasonCodes).toContain(
      "proof_source_stale_retired_topology_not_closure_evidence",
    );
    expect(admission.sourceTopologyStatus).toBe("stale_retired_topology");
  });

  it("blocks graph-visible context acquisition nodes even without context supply edges", () => {
    const proof = acceptedProof();
    proof.afterGraph = {
      nodes: [
        { nodeId: "context-for-product-spec-routing", nodeKind: "resource_scout" },
        { nodeId: "implementation-product-spec-routing", nodeKind: "implementation" },
      ],
      edges: [],
    };

    const admission = evaluateProductSpecReplayProofAdmission({
      proof,
      replayPlan: acceptedReplayPlan(),
    });

    expect(admission.status).toBe("blocked");
    expect(admission.blockerReasonCodes).toContain(
      "proof_graph_contains_default_context_acquisition_node",
    );
    expect(admission.blockerReasonCodes).toContain(
      "proof_source_stale_retired_topology_not_closure_evidence",
    );
    expect(admission.blockerReasonCodes).not.toContain(
      "proof_graph_contains_legacy_resource_fulfillment_fanout",
    );
  });

  it("blocks standalone component proofs as Product/Spec replay closure evidence", () => {
    const proof = acceptedProof();
    proof.proofSourceKind = "worker_readiness_edit_evidence_component_proof";

    const admission = evaluateProductSpecReplayProofAdmission({
      proof,
      replayPlan: acceptedReplayPlan(),
    });

    expect(admission.status).toBe("blocked");
    expect(admission.proofClosureAllowed).toBe(false);
    expect(admission.proofSourceAccepted).toBe(false);
    expect(admission.blockerReasonCodes).toContain(
      "proof_source_not_product_spec_runtime_boundary_replay",
    );
  });

  it("blocks worker-free or structurally unhydrated execution proof", () => {
    const proof = acceptedProof();
    proof.selectedBoundaryNode = {
      ...proof.selectedBoundaryNode,
      executable: false,
      nodeExecutionPacketRef: "",
      executionReadinessAuthority: "persisted_stale_projection",
      recomputedReadinessCanExecute: false,
    };
    proof.workerSmokeResult = {
      status: "needs_review",
      changedFileRefs: [],
      validationRefs: [],
      evidenceClaims: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };

    const admission = evaluateProductSpecReplayProofAdmission({
      proof,
      replayPlan: acceptedReplayPlan(),
    });

    expect(admission.status).toBe("blocked");
    expect(admission.blockerReasonCodes).toEqual(
      expect.arrayContaining([
        "worker_smoke_not_succeeded",
        "selected_node_packet_ref_missing",
        "selected_node_not_executable",
        "selected_execution_readiness_authority_invalid",
        "selected_recomputed_readiness_cannot_execute",
        "worker_changed_file_refs_missing",
        "worker_validation_refs_missing",
        "worker_evidence_claim_refs_missing",
      ]),
    );
  });

  it("blocks persisted readiness projections from unlocking replay proof closure", () => {
    const proof = acceptedProof();
    proof.selectedBoundaryNode = {
      ...proof.selectedBoundaryNode,
      executionReadinessAuthority: "verified_persisted_projection",
    };

    const admission = evaluateProductSpecReplayProofAdmission({
      proof,
      replayPlan: acceptedReplayPlan(),
    });

    expect(admission.status).toBe("blocked");
    expect(admission.blockerReasonCodes).toContain(
      "selected_execution_readiness_authority_invalid",
    );
  });
});
