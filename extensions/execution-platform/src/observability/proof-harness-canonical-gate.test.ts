import { describe, expect, it } from "vitest";
import {
  assertProofHarnessManifestBounds,
  evaluateProofHarnessManifestBounds,
  projectProofHarnessCanonicalGate,
} from "./proof-harness-canonical-gate.ts";

describe("proof harness canonical gate projection", () => {
  it("rejects retired topology as graph compile invalid before context supply", () => {
    const projection = projectProofHarnessCanonicalGate({
      graphId: "product-spec-graph",
      latestProgress: {
        nodeId: "context-scout-legacy",
        currentPhase: "resource_fulfillment",
        reasonCodes: ["legacy_resource_fulfillment_gate_retired"],
      },
      checkpointKind: "resource_fulfillment",
      topologyGate: {
        failed: true,
        reasonCodes: [
          "architecture_transition_topology_invalid",
          "default_context_scout_fanout_retired",
        ],
      },
    });

    expect(projection).toMatchObject({
      firstOpenGate: "graph_compile_invalid",
      topologyGateRejected: true,
      staleCheckpointGateRejected: true,
      gate: {
        gateKind: "graph_compile_invalid",
        gateStatus: "blocked",
        confidence: "canonical",
        blockerCode: "architecture_transition_topology_invalid",
        nextLegalTransition: "compile_scheduler_graph_patch",
        rawPromptStored: false,
        rawProviderLogStored: false,
      },
    });
    expect(projection.reasonCodes).toEqual(
      expect.arrayContaining([
        "proof_harness_topology_gate_rejected",
        "default_context_scout_fanout_retired",
        "stale_resource_fulfillment_proof_gate_rejected",
      ]),
    );
  });

  it("keeps canonical node-local state ahead of stale RequirementMap checkpoints", () => {
    const projection = projectProofHarnessCanonicalGate({
      graphId: "product-spec-graph",
      checkpointKind: "requirement_map",
      latestProgress: {
        nodeId: "implementation-1",
        activeNodeKind: "implementation_scoped",
        executionIntent: "source_edit",
        evidenceMode: ["changed_files"],
        nodeLifecycleProjectionRef: "node-lifecycle-projection://implementation-1",
        nodeLifecycleProjectionGate: "node_agent_session_ready",
        nodeLifecycleProjectionStatus: "blocked",
        reasonCodes: ["node_lifecycle_runner_authorized_openclaw_agent_session"],
      },
    });

    expect(projection).toMatchObject({
      firstOpenGate: "node_agent_session_ready",
      staleCheckpointGateRejected: false,
      gate: {
        gateKind: "node_agent_session_ready",
        confidence: "canonical",
        nodeId: "implementation-1",
      },
    });
    expect(JSON.stringify(projection.gate)).not.toContain("requirement_map");
  });

  it("blocks retired checkpoint labels when canonical node-local state is absent", () => {
    const projection = projectProofHarnessCanonicalGate({
      graphId: "product-spec-graph",
      checkpointKind: "after-context-synthesis",
      latestProgress: {},
    });

    expect(projection).toMatchObject({
      firstOpenGate: "missing_runtime_state",
      staleCheckpointGateRejected: true,
      gate: {
        gateKind: "missing_runtime_state",
        gateStatus: "blocked",
        blockerCode: "stale_checkpoint_gate_rejected",
      },
    });
  });

  it("guards proof harness manifests from carrying payload bodies", () => {
    expect(
      evaluateProofHarnessManifestBounds({
        name: "latest-run-state",
        value: { refs: ["payload://resource-ledger"], rawPromptStored: false },
        maxBytes: 1_000,
      }),
    ).toMatchObject({
      status: "passed",
      reasonCodes: ["proof_harness_manifest_bounds_ok"],
    });

    const oversized = evaluateProofHarnessManifestBounds({
      name: "latest-run-state",
      value: { body: "x".repeat(2_000), rawPromptStored: false },
      maxBytes: 400,
    });
    expect(oversized).toMatchObject({
      status: "failed",
      reasonCodes: [
        "proof_harness_manifest_overflow",
        "manifest_payload_body_must_be_payload_backed",
      ],
    });
    expect(() =>
      assertProofHarnessManifestBounds({
        name: "latest-run-state",
        value: { body: "x".repeat(2_000), rawPromptStored: false },
        maxBytes: 400,
      }),
    ).toThrow(/proof_harness_manifest_overflow/);
  });
});
