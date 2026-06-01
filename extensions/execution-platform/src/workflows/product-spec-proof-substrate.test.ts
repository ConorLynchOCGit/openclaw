import { describe, expect, it } from "vitest";
import {
  assertProductSpecProofRunManifestBounds,
  buildProductSpecProofRunManifest,
  classifyProductSpecProofSource,
  evaluateProductSpecCodingSystemImplementationProof,
  evaluateProductSpecProofCleanliness,
  evaluateProductSpecProofFamily,
  PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
} from "./product-spec-proof-substrate.ts";

const codingExecutorTargetSubjectFamily = {
  proofFamily: "coding_executor_target_subject" as const,
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
};

describe("Product/Spec proof substrate", () => {
  it("passes the coding executor / Product-Spec target-subject proof family", () => {
    const gate = evaluateProductSpecProofFamily(codingExecutorTargetSubjectFamily);

    expect(gate.status).toBe("passed");
    expect(gate.proofFamily).toBe("coding_executor_target_subject");
    expect(gate.reasonCodes).toEqual([]);
  });

  it("passes the Product-Spec Planning executor family for planning artifacts only", () => {
    const gate = evaluateProductSpecProofFamily({
      proofFamily: "product_spec_planning_executor",
      executorWorkflowId: "agent_team.product_spec_planning",
      requestedCapabilities: ["planning", "action_graph", "closeout"],
    });

    expect(gate.status).toBe("passed");
    expect(gate.proofFamily).toBe("product_spec_planning_executor");
    expect(gate.reasonCodes).toEqual([]);
  });

  it("blocks Product-Spec Planning executor proof that exposes coding capabilities", () => {
    const gate = evaluateProductSpecProofFamily({
      proofFamily: "product_spec_planning_executor",
      executorWorkflowId: "agent_team.product_spec_planning",
      requestedCapabilities: ["planning", "code_edit"],
    });

    expect(gate.status).toBe("failed");
    expect(gate.reasonCodes).toEqual(
      expect.arrayContaining(["product_spec_planning_executor_exposes_coding_capability"]),
    );
  });

  it("classifies only run-scoped Product/Spec runtime boundary replay as fresh closure evidence", () => {
    expect(
      classifyProductSpecProofSource({
        ...codingExecutorTargetSubjectFamily,
        proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
        proofRunId: "proof-run-current",
        proofRunManifestRef: ".artifacts/execution-platform/proof-runs/proof-run-current/manifest.json",
        runtimeJobId: "native-exec-current",
        graphId: "runtime-graph-current",
        sourceTopologyStatus: "production_node_local_topology",
        closurePredicateStatus: "admitted",
        proofClosureAllowed: true,
      }),
    ).toBe("fresh_product_spec_runtime_boundary_replay");
  });

  it("classifies the known stale replay graph as a negative retired-topology fixture", () => {
    expect(
      classifyProductSpecProofSource({
        proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
        proofRunId: "proof-run-current",
        proofRunManifestRef: ".artifacts/execution-platform/proof-runs/proof-run-current/manifest.json",
        runtimeJobId: "product-spec-replay-mpl69vto",
        graphId: "team-run-native-exec-12fa6ecec70ecb9a-checkpoint-replay-mpl69vtn-runtime-work-graph",
      }),
    ).toBe("stale_retired_topology_negative_fixture");
  });

  it("classifies graph-visible context acquisition topology as stale even with fresh ids", () => {
    expect(
      classifyProductSpecProofSource({
        proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
        proofRunId: "proof-run-current",
        proofRunManifestRef: ".artifacts/execution-platform/proof-runs/proof-run-current/manifest.json",
        runtimeJobId: "native-exec-current",
        graphId: "runtime-graph-current",
        afterGraph: {
          nodes: [
            { nodeId: "context-1", nodeKind: "resource_scout" },
            { nodeId: "impl-1", nodeKind: "implementation_microtask" },
          ],
          edges: [{ fromNodeId: "context-1", toNodeId: "impl-1", edgeKind: "context_supplies" }],
        },
      }),
    ).toBe("stale_retired_topology_negative_fixture");
  });

  it("fails cleanliness when artifacts are shared mutable outputs or component-only proof", () => {
    const gate = evaluateProductSpecProofCleanliness({
      proofSourceKind: "worker_readiness_edit_evidence_component_proof",
      proofRunId: "proof-run-current",
      proofRunManifestRef: ".artifacts/execution-platform/product-spec-boundary-replay-result.json",
      runtimeJobId: "native-exec-current",
      graphId: "runtime-graph-current",
      proofArtifactRefs: [
        ".artifacts/execution-platform/product-spec-boundary-replay-result.json",
      ],
    });

    expect(gate.status).toBe("failed");
    expect(gate.reasonCodes).toEqual(
      expect.arrayContaining([
        "proof_run_manifest_not_run_scoped",
        "proof_artifacts_not_run_scoped",
        "component_proof_not_product_spec_closure_evidence",
      ]),
    );
  });

  it("passes cleanliness for fresh run-scoped proof substrate", () => {
    const gate = evaluateProductSpecProofCleanliness({
      ...codingExecutorTargetSubjectFamily,
      proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
      proofRunId: "proof-run-current",
      proofRunManifestRef: ".artifacts/execution-platform/proof-runs/proof-run-current/manifest.json",
      runtimeJobId: "native-exec-current",
      graphId: "runtime-graph-current",
      sourceTopologyStatus: "production_node_local_topology",
      closurePredicateStatus: "admitted",
      proofClosureAllowed: true,
      proofArtifactRefs: [
        ".artifacts/execution-platform/proof-runs/proof-run-current/boundary-replay-result.json",
        ".artifacts/execution-platform/proof-runs/proof-run-current/admission-gate.json",
      ],
    });

    expect(gate.status).toBe("passed");
    expect(gate.reasonCodes).toEqual([]);
  });

  it("requires the coding system implementation proof to exercise the OpenClaw lifecycle", () => {
    const gate = evaluateProductSpecCodingSystemImplementationProof({
      ...codingExecutorTargetSubjectFamily,
      proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
      proofRunId: "proof-run-current",
      proofRunManifestRef: ".artifacts/execution-platform/proof-runs/proof-run-current/manifest.json",
      runtimeJobId: "native-exec-current",
      graphId: "runtime-graph-current",
      sourceTopologyStatus: "production_node_local_topology",
      closurePredicateStatus: "admitted",
      proofClosureAllowed: true,
      proofArtifactRefs: [
        ".artifacts/execution-platform/proof-runs/proof-run-current/proof.json",
        ".artifacts/execution-platform/proof-runs/proof-run-current/implementation-gate.json",
      ],
      observedLifecycleGates: [
        "proof_family_gate",
        "worker_context_request",
        "resource_demand",
        "resource_ledger",
        "domain_resource_selection",
        "domain_action_gate",
        "worker_action",
        "post_action_validation",
        "evidence_claim",
        "review",
        "closeout",
      ],
      changedFileRefs: ["repo://extensions/execution-platform/src/workflows/workflow-evidence-profile.ts"],
      validationRefs: ["validation://product-spec-framework-coding-proof"],
      workerResultRefs: ["worker-result://product-spec-framework-contract"],
      evidenceClaimRefs: ["evidence://product-spec-framework-contract"],
      frameworkArtifactRefs: [
        "planning-framework-contract://product-spec-framework-coding-proof",
        "domain-action-gate://product-spec-framework-coding-proof",
      ],
      reviewRefs: ["review://product-spec-framework-coding-proof"],
      closeoutRefs: ["closeout://product-spec-framework-coding-proof"],
    });

    expect(gate.status).toBe("passed");
    expect(gate.reasonCodes).toEqual([]);
  });

  it("rejects coding system implementation proof that is only Codex/component evidence", () => {
    const gate = evaluateProductSpecCodingSystemImplementationProof({
      ...codingExecutorTargetSubjectFamily,
      proofSourceKind: "component-proof",
      proofRunId: "proof-run-current",
      proofRunManifestRef: ".artifacts/execution-platform/component-proof.json",
      runtimeJobId: "native-exec-current",
      graphId: "runtime-graph-current",
      observedLifecycleGates: ["worker_action"],
      changedFileRefs: ["repo://extensions/execution-platform/src/workflows/example.ts"],
      validationRefs: ["validation://unit"],
      proofArtifactRefs: [".artifacts/execution-platform/component-proof.json"],
    });

    expect(gate.status).toBe("failed");
    expect(gate.reasonCodes).toEqual(
      expect.arrayContaining([
        "coding_system_product_spec_cleanliness_failed",
        "coding_system_product_spec_worker_result_refs_missing",
        "coding_system_product_spec_framework_contract_ref_missing",
        "coding_system_product_spec_domain_action_gate_ref_missing",
      ]),
    );
  });

  it("fails cleanliness when closure is not admitted even with run-scoped artifacts", () => {
    const gate = evaluateProductSpecProofCleanliness({
      ...codingExecutorTargetSubjectFamily,
      proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
      proofRunId: "proof-run-current",
      proofRunManifestRef:
        ".artifacts/execution-platform/proof-runs/proof-run-current/manifest.json",
      runtimeJobId: "native-exec-current",
      graphId: "runtime-graph-current",
      sourceTopologyStatus: "production_node_local_topology",
      closurePredicateStatus: "blocked",
      proofClosureAllowed: false,
      proofArtifactRefs: [
        ".artifacts/execution-platform/proof-runs/proof-run-current/boundary-replay-result.json",
      ],
    });

    expect(gate.status).toBe("failed");
    expect(gate.reasonCodes).toEqual(
      expect.arrayContaining([
        "proof_closure_predicate_not_admitted",
        "proof_closure_not_allowed",
      ]),
    );
  });

  it("fails cleanliness when run-scoped artifacts belong to another proof run", () => {
    const gate = evaluateProductSpecProofCleanliness({
      ...codingExecutorTargetSubjectFamily,
      proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
      proofRunId: "proof-run-current",
      proofRunManifestRef: ".artifacts/execution-platform/proof-runs/other-run/manifest.json",
      runtimeJobId: "native-exec-current",
      graphId: "runtime-graph-current",
      sourceTopologyStatus: "production_node_local_topology",
      closurePredicateStatus: "admitted",
      proofClosureAllowed: true,
      proofArtifactRefs: [
        ".artifacts/execution-platform/proof-runs/other-run/boundary-replay-result.json",
      ],
    });

    expect(gate.status).toBe("failed");
    expect(gate.reasonCodes).toEqual(
      expect.arrayContaining([
        "proof_run_manifest_ref_mismatch",
        "proof_artifacts_not_in_proof_run_scope",
      ]),
    );
  });

  it("builds a compact manifest with bounded refs and no raw storage flags", () => {
    const manifest = buildProductSpecProofRunManifest({
      ...codingExecutorTargetSubjectFamily,
      proofRunId: "proof-run-current",
      sourcePromptHash: "abc",
      workItemId: "product-spec-checkpointed-abc",
      runtimeJobId: "native-exec-current",
      graphId: "runtime-graph-current",
      proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
      sourceTopologyStatus: "production_node_local_topology",
      closurePredicateStatus: "admitted",
      proofClosureAllowed: true,
      boundaryCheckpointRefs: Array.from({ length: 60 }, (_, index) => `checkpoint://${index}`),
      replayResultRef:
        ".artifacts/execution-platform/proof-runs/proof-run-current/boundary-replay-result.json",
      admissionGateRef:
        ".artifacts/execution-platform/proof-runs/proof-run-current/admission-gate.json",
      proofArtifactRef: ".artifacts/execution-platform/proof-runs/proof-run-current/proof.json",
      proofArtifactRefs: [
        ".artifacts/execution-platform/proof-runs/proof-run-current/latest-run-state.json",
      ],
      validationRefs: ["validation://passed"],
      evidenceClaimRefs: ["evidence://claim"],
    });

    expect(manifest.proofSourceClassification).toBe(
      "fresh_product_spec_runtime_boundary_replay",
    );
    expect(manifest.boundaryCheckpointRefs).toHaveLength(40);
    expect(manifest.proofRunManifestRef).toBe(
      ".artifacts/execution-platform/proof-runs/proof-run-current/manifest.json",
    );
    expect(manifest.proofArtifactRefs).toEqual(
      expect.arrayContaining([
        ".artifacts/execution-platform/proof-runs/proof-run-current/boundary-replay-result.json",
        ".artifacts/execution-platform/proof-runs/proof-run-current/admission-gate.json",
        ".artifacts/execution-platform/proof-runs/proof-run-current/proof.json",
      ]),
    );
    expect(() => assertProductSpecProofRunManifestBounds(manifest)).not.toThrow();
    expect(manifest.manifestJsonByteCount).toBeLessThan(16 * 1024);
    expect(manifest.rawPromptStored).toBe(false);
    expect(manifest.rawResponseStored).toBe(false);
  });
});
