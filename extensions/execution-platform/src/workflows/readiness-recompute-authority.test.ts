import { describe, expect, it } from "vitest";
import {
  buildImplementationTaskPacket,
  type ImplementationTaskFileSnapshot,
} from "./worker-execution-packets.ts";
import { compileNodeExecutionPacketForImplementationTask } from "./node-resource-materialization.ts";
import {
  compareReadinessProjectionToCurrent,
  evaluateChildEpochFrontierEligibility,
} from "./readiness-recompute-authority.ts";

const neutralSnapshot: ImplementationTaskFileSnapshot = {
  fileRef: "workspace://permits/dataset/export-policy.md",
  snapshotRef: "snapshot://permits/dataset/export-policy",
  contentHash: "sha256:permit-export-policy",
  byteCount: 420,
  sourceKind: "repo_file",
  freshnessStatus: "fresh",
  rawContentStored: false,
};

function materializedPermitReviewNode() {
  const packet = buildImplementationTaskPacket({
    runtimeJobId: "runtime-neutral",
    workflowId: "permit_review.workflow",
    graphId: "graph-neutral",
    sourceGraphNodeId: "permit-node",
    microtaskId: "permit-node:task-1",
    exactEditObjective: "Update the permit export policy summary.",
    taskSummary: "Bounded neutral-domain edit for resource readiness testing.",
    targetCommitmentIds: ["permit-C-1"],
    domainResourceSelectionRefs: ["domain-resource-selection://permit-node"],
    targetFileRefs: [neutralSnapshot.fileRef],
    targetFileSnapshots: [neutralSnapshot],
    allowedFileRefs: [neutralSnapshot.fileRef],
    allowedEditScope: [neutralSnapshot.fileRef],
    mustReadRefs: [neutralSnapshot.fileRef],
    likelyModifyRefs: [neutralSnapshot.fileRef],
    contextPacketRefs: ["resource-handoff://permit-node"],
    sourceResourceHandoffRefs: ["resource-handoff://permit-node"],
    validationCommandRefs: ["check://permit-policy-links"],
    acceptanceCriteria: ["Permit export policy summary is updated."],
    evidenceClaimExpectations: ["Changed-file evidence links to permit-C-1."],
  });
  return compileNodeExecutionPacketForImplementationTask({
    runtimeJobId: "runtime-neutral",
    workflowId: "permit_review.workflow",
    graphId: "graph-neutral",
    nodeId: "permit-node",
    nodeKind: "implementation",
    capabilityId: "policy_document_edit",
    executorKey: "kind:implementation",
    workerRef: "worker://policy-editor",
    implementationTaskPacket: packet,
  });
}

describe("readiness recompute authority", () => {
  it("marks cached ready projection stale when recomputed readiness is blocked", () => {
    const materialized = materializedPermitReviewNode();
    const blocked = compareReadinessProjectionToCurrent({
      nodeId: "permit-node",
      persistedMetadata: {
        nodeReadinessStateRef: materialized.readiness.state.stateRef,
        nodeReadinessStatus: "ready",
        nodeExecutionContractRef: materialized.nodeExecutionContract.contractRef,
        nodeExecutionContractHash: materialized.nodeExecutionContract.contractHash,
        nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
        nodeExecutionPacketHash: "sha256:old-packet",
        resourcePacketRef: materialized.codingResourcePacket.packetRef,
        resourcePacketHash: "sha256:old-resource",
        boundaryEpoch: "boundary-epoch:old",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      currentState: {
        ...materialized.readiness.state,
        readinessStatus: "blocked",
        nextLegalTransitions: ["compile_node_execution_packet"],
      },
      nodeExecutionContract: materialized.nodeExecutionContract,
      nodeExecutionPacket: materialized.nodeExecutionPacket,
      resourcePacket: materialized.codingResourcePacket,
      currentBoundaryEpoch: "boundary-epoch:new",
    });

    expect(blocked.status).toBe("stale");
    expect(blocked.canUnlockExecution).toBe(false);
    expect(blocked.driftReasonCodes).toEqual(
      expect.arrayContaining([
        "readiness_projection_nodeExecutionPacketHash_mismatch",
        "readiness_projection_resourcePacketHash_mismatch",
        "readiness_projection_boundary_epoch_mismatch",
        "readiness_projection_status_mismatch",
      ]),
    );
    expect(blocked.rawPromptStored).toBe(false);
  });

  it("accepts current persisted projection only when refs hashes and epoch match", () => {
    const materialized = materializedPermitReviewNode();
    const current = compareReadinessProjectionToCurrent({
      nodeId: "permit-node",
      persistedMetadata: {
        nodeReadinessStateRef: materialized.readiness.state.stateRef,
        nodeReadinessStatus: materialized.readiness.state.readinessStatus,
        nodeExecutionContractRef: materialized.nodeExecutionContract.contractRef,
        nodeExecutionContractHash: materialized.nodeExecutionContract.contractHash,
        nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
        nodeExecutionPacketHash: materialized.readiness.state.nodeExecutionPacketHash,
        resourcePacketRef: materialized.codingResourcePacket.packetRef,
        resourcePacketHash: materialized.readiness.state.domainResourcePacketHash,
        boundaryEpoch: "boundary-epoch:current",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      currentState: {
        ...materialized.readiness.state,
        boundaryEpoch: "boundary-epoch:current",
      },
      nodeExecutionContract: materialized.nodeExecutionContract,
      nodeExecutionPacket: materialized.nodeExecutionPacket,
      resourcePacket: materialized.codingResourcePacket,
      currentBoundaryEpoch: "boundary-epoch:current",
    });

    expect(current.status).toBe("current");
    expect(current.canUnlockExecution).toBe(true);
    expect(current.driftReasonCodes).toEqual([]);
  });

  it("blocks stale child frontier eligibility from structural epoch and parent hashes", () => {
    const eligibility = evaluateChildEpochFrontierEligibility({
      nodeId: "permit-node:task-1",
      nodeMetadata: {
        parentNodeId: "permit-node",
        childBoundaryEpoch: "boundary-epoch:1",
        parentContractHash: "sha256:contract-a",
        parentResourcePacketHash: "sha256:resource-a",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      graphMetadata: {
        currentBoundaryEpoch: "boundary-epoch:2",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      currentParentContractHash: "sha256:contract-b",
      currentParentResourcePacketHash: "sha256:resource-a",
    });

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasonCodes).toEqual(
      expect.arrayContaining([
        "child_epoch_boundary_epoch_mismatch",
        "child_epoch_parent_contract_hash_mismatch",
      ]),
    );
    expect(eligibility.rawDbRowsStored).toBe(false);
  });
});
