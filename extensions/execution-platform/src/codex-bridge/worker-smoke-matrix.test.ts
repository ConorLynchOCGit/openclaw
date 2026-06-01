import { describe, expect, it } from "vitest";
import {
  defaultProductSpecWorkerSmokeMatrixLanes,
  runWorkerSmokeMatrixProof,
} from "./worker-smoke-matrix.ts";

describe("worker smoke matrix", () => {
  it("runs multiple hydrated Product/Spec-derived child classes plus a neutral fixture", async () => {
    const proof = await runWorkerSmokeMatrixProof({
      runtimeJobId: "worker-smoke-matrix-test-job",
      graphId: "worker-smoke-matrix-test-graph",
    });

    expect(proof.pass).toBe(true);
    expect(proof.scopedEditPassCount).toBeGreaterThanOrEqual(3);
    expect(proof.preciseBlockerPassCount).toBeGreaterThanOrEqual(1);
    expect(proof.neutralFixturePassCount).toBe(1);
    expect(proof.childClassesExercised).toEqual(
      expect.arrayContaining([
        "model_task_runtime_contract_child",
        "workflow_plugin_definition_child",
        "work_queue_readback_proof_review_child",
        "valid_no_edit_blocker_child",
        "neutral_domain_resource_fixture",
      ]),
    );
    expect(proof.reviewArtifactRefs.length).toBeGreaterThanOrEqual(4);
    expect(proof.validationRefs.length).toBeGreaterThanOrEqual(4);
    expect(proof.evidenceRefs.length).toBeGreaterThanOrEqual(4);
    expect(proof.matrixToolInvocationRefs.length).toBeGreaterThanOrEqual(12);
    expect(proof.reasonCodes).toContain("worker_smoke_matrix_passed");
    expect(proof.rawPromptStored).toBe(false);
    expect(proof.rawResponseStored).toBe(false);
    expect(proof.rawToolLogStored).toBe(false);

    const editLane = proof.laneResults.find(
      (lane) => lane.childClass === "model_task_runtime_contract_child",
    );
    expect(editLane).toMatchObject({
      status: "passed",
      outcome: "scoped_edit",
      rollbackMode: "rolled_back",
      workspaceRestored: true,
      workerStatus: "completed",
    });
    expect(editLane?.nodeExecutionContractRef).toMatch(/^runtime-work-graph:\/\//u);
    expect(editLane?.nodeExecutionPacketRef).toMatch(/^runtime-work-graph:\/\//u);
    expect(editLane?.domainResourcePacketKind).toBe("coding_resource_packet");
    expect(editLane?.workerToolIds).toEqual(
      expect.arrayContaining([
        "worker.context.request_more",
        "worker.edit.plan",
        "worker.patch.force_author_from_plan",
        "worker.patch.author_edit",
        "worker.validation.run",
        "worker.evidence.claim_from_validation",
      ]),
    );

    const blockerLane = proof.laneResults.find(
      (lane) => lane.childClass === "valid_no_edit_blocker_child",
    );
    expect(blockerLane).toMatchObject({
      status: "passed",
      outcome: "precise_upstream_blocker",
      workerStatus: "needs_review",
      blockerKind: "upstream_context_or_authority_blocker",
      changedFileRefs: [],
      rollbackMode: "none",
    });
    expect(blockerLane?.nextLegalTransition).toBe(
      "repair_domain_resource_selection_scope_before_worker_dispatch",
    );
    expect(blockerLane?.workerToolIds).toEqual(
      expect.arrayContaining([
        "worker.patch.force_author_from_plan",
        "worker.repair.mark_upstream_blocker",
      ]),
    );

    const neutralLane = proof.laneResults.find(
      (lane) => lane.childClass === "neutral_domain_resource_fixture",
    );
    expect(neutralLane).toMatchObject({
      status: "passed",
      outcome: "neutral_action_review",
      workerStatus: "not_invoked",
      domainResourcePacketKind: "read_only_resource_packet",
      rollbackMode: "not_applicable",
    });
  });

  it("keeps the matrix lane catalog explicit and non-heuristic", () => {
    const lanes = defaultProductSpecWorkerSmokeMatrixLanes();

    expect(lanes).toHaveLength(4);
    expect(new Set(lanes.map((lane) => lane.laneId)).size).toBe(lanes.length);
    expect(lanes.map((lane) => lane.childClass)).toEqual(
      expect.arrayContaining([
        "model_task_runtime_contract_child",
        "workflow_plugin_definition_child",
        "work_queue_readback_proof_review_child",
        "valid_no_edit_blocker_child",
      ]),
    );
    expect(lanes.every((lane) => ! lane.targetFileRef.includes("://"))).toBe(true);
    expect(lanes.filter((lane) => lane.expectedOutcome === "precise_upstream_blocker")).toHaveLength(
      1,
    );
  });
});
