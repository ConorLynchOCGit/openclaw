import { describe, expect, it } from "vitest";
import type { RuntimeJobArtifact } from "../runtime-job-repository.ts";
import {
  buildRuntimeGraphPatchBody,
  compactSchedulerProgressForManifest,
  summarizeRuntimeGraphPatchArtifact,
} from "./runtime-graph-patch.ts";

describe("runtime graph patch progress compaction", () => {
  it("moves large graph body detail into a patch body and leaves progress manifest compact", () => {
    const progressMetadata = {
      artifactKind: "agent_team_scheduler_progress",
      runtimeJobId: "job-1",
      graphId: "graph-1",
      stage: "node_agent_session",
      status: "needs_review",
      nodeId: "impl-parent",
      roleId: "implementation_engineer",
      schedulerFrontierState: {
        currentSuperstep: 4,
        nextLegalTransition: "run_frontier",
        selectedExecutableNodeIds: ["impl-1", "impl-2"],
        blockedFrontierNodeIds: ["impl-3"],
        graphNodes: Array.from({ length: 120 }, (_, index) => ({
          nodeId: `node-${index}`,
          nodeKind: "implementation",
          objective: "Large node objective ".repeat(80),
        })),
        graphEdges: Array.from({ length: 160 }, (_, index) => ({
          edgeId: `edge-${index}`,
          fromNodeId: `node-${index % 40}`,
          toNodeId: `node-${(index + 1) % 40}`,
        })),
        reasonCodes: ["large_graph_fixture"],
      },
      parallelFrontier: {
        currentSuperstep: 4,
        branchResults: Array.from({ length: 55 }, (_, index) => ({
          branchId: `branch-${index}`,
          nodeId: `node-${index}`,
          status: index % 2 === 0 ? "blocked_resource" : "ready",
          blockerSummary: "Missing resource packet ".repeat(50),
        })),
        branchScopedFrontierStates: Array.from({ length: 55 }, (_, index) => ({
          branchId: `nested-branch-${index}`,
          nodeId: `nested-node-${index}`,
          nodeKind: "implementation",
          status: index % 2 === 0 ? "blocked_context" : "ready",
          blockerSummary: "Nested branch-scoped frontier details ".repeat(90),
          sourceMaterialRequirementRefs: Array.from(
            { length: 20 },
            (_, refIndex) => `source-material-requirement://nested-node-${index}/${refIndex}`,
          ),
          successfulEvidenceRefs: Array.from(
            { length: 30 },
            (_, refIndex) => `artifact://nested-implementation/success/${index}/${refIndex}`,
          ),
          reasonCodes: Array.from(
            { length: 40 },
            (_, reasonIndex) => `nested_resource_requirement_reason_${reasonIndex}`,
          ),
        })),
      },
      branchScopedFrontierStates: Array.from({ length: 60 }, (_, index) => ({
        branchId: `branch-${index}`,
        nodeId: `node-${index}`,
        nodeKind: "implementation",
        capabilityId: "implementation",
        status: index % 2 === 0 ? "blocked_context" : "ready",
        blockerSummary: "Consumer-bound resource requirement details ".repeat(80),
        nextLegalTransition: "dispatch_context_specialist_subturn",
        sourceMaterialRequirementRefs: Array.from(
          { length: 20 },
          (_, refIndex) => `source-material-requirement://node-${index}/${refIndex}`,
        ),
        consumerNodeIds: Array.from({ length: 20 }, (_, refIndex) => `consumer-${refIndex}`),
        successfulEvidenceRefs: Array.from(
          { length: 30 },
          (_, refIndex) => `artifact://context/success/${index}/${refIndex}`,
        ),
        failedEvidenceRefs: Array.from(
          { length: 30 },
          (_, refIndex) => `artifact://context/failed/${index}/${refIndex}`,
        ),
        missingFields: ["acceptedContextSnapshotRefs", "sourceMaterialRequirementRefs"],
        reasonCodes: Array.from(
          { length: 40 },
          (_, reasonIndex) => `resource_requirement_reason_${reasonIndex}`,
        ),
      })),
      reasonCodes: ["resource_packet_bounds"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
    };

    const body = buildRuntimeGraphPatchBody({
      patchId: "patch-1",
      runtimeJobId: "job-1",
      graphId: "graph-1",
      schedulerIteration: 12,
      patchKind: "node_agent_session",
      stage: "node_agent_session",
      status: "needs_review",
      nodeId: "impl-parent",
      roleId: "implementation_engineer",
      progressMetadata,
    });

    expect(body.nodeAdds).toHaveLength(120);
    expect(body.edgeAdds).toHaveLength(160);
    expect(body.affectedNodeIds).toContain("impl-parent");

    const artifact = {
      uri: "runtime-job://job-1/runtime-work-graph/graph-patch/001",
      sha256: "abc123",
      sizeBytes: 250_000,
      metadata: {
        payloadRef:
          "runtime-artifact-payload://job-1/execution_platform.runtime_graph_patch/abc123",
        byteCount: 250_000,
        sha256: "abc123",
      },
    } as unknown as RuntimeJobArtifact;
    const compact = compactSchedulerProgressForManifest(
      progressMetadata,
      summarizeRuntimeGraphPatchArtifact({ artifact, body }),
    );

    expect(compact.graphPatchStoredInPayload).toBe(true);
    expect(compact.graphPatchRef).toBe(artifact.uri);
    expect(JSON.stringify(compact)).not.toContain("graphNodes");
    expect(JSON.stringify(compact)).not.toContain("graphEdges");
    expect(compact.branchScopedFrontierStates).toMatchObject({
      count: 60,
      truncated: true,
      compactedForManifest: true,
    });
    expect(JSON.stringify(compact).length).toBeLessThan(64 * 1024);
  });

  it("keeps scheduler progress metadata bounded when branch frontier details balloon", () => {
    const heavyBranchStates = Array.from({ length: 80 }, (_, index) => ({
      branchId: `branch-${index}`,
      nodeId: `implementation-node-with-long-id-${index}`,
      nodeKind: "implementation",
      capabilityId: "implementation",
      status: "completed",
      blockerSummary: "No blocker; long diagnostic context ".repeat(200),
      nextLegalTransition: "orchestrator_decision",
      readinessRef: `runtime-job://job-2/readiness/${index}`,
      sourceMaterialRef: `runtime-job://job-2/source-material/${index}`,
      sourceMaterialRequirementRefs: Array.from(
        { length: 30 },
        (_, refIndex) => `runtime-job://job-2/source-material-requirement/${index}/${refIndex}`,
      ),
      successfulEvidenceRefs: Array.from(
        { length: 40 },
        (_, refIndex) => `runtime-job://job-2/implementation-evidence/${index}/${refIndex}`,
      ),
      reasonCodes: Array.from(
        { length: 60 },
        (_, reasonIndex) => `branch_scoped_frontier_state_reason_${index}_${reasonIndex}`,
      ),
    }));
    const progressMetadata = {
      artifactKind: "agent_team_scheduler_progress",
      runtimeJobId: "job-2",
      graphId: "graph-2",
      stage: "scheduler_parallel_frontier",
      status: "completed",
      nodeId: "implementation-node-with-long-id-79",
      roleId: "implementation_engineer",
      currentObjective: "Supply implementation-ready repo context. ".repeat(500),
      parallelFrontier: {
        currentSuperstep: 9,
        selectedNodeIds: heavyBranchStates.map((state) => state.nodeId),
        branchScopedFrontierStates: heavyBranchStates,
        branchResults: heavyBranchStates,
      },
      schedulerFrontierState: {
        currentSuperstep: 9,
        nextLegalTransition: "orchestrator_decision",
        selectedExecutableNodeIds: heavyBranchStates.map((state) => state.nodeId),
        blockedFrontierNodeIds: [],
        graphNodes: Array.from({ length: 110 }, (_, index) => ({
          nodeId: `node-${index}`,
          objective: "Large objective ".repeat(120),
        })),
        graphEdges: Array.from({ length: 119 }, (_, index) => ({
          edgeId: `edge-${index}`,
          fromNodeId: `node-${index}`,
          toNodeId: `node-${index + 1}`,
        })),
        reasonCodes: Array.from({ length: 80 }, (_, index) => `frontier_reason_${index}`),
      },
      branchScopedFrontierStates: heavyBranchStates,
      reasonCodes: [
        "scheduler_tool_invoked:scheduler.record_branch_scoped_frontier_state",
        "scheduler_record_branch_scoped_frontier_state_recorded",
        "branch_scoped_frontier_state_recorded_after_superstep",
        "branch_scoped_frontier_state_count:80",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
    };
    const body = buildRuntimeGraphPatchBody({
      patchId: "patch-2",
      runtimeJobId: "job-2",
      graphId: "graph-2",
      schedulerIteration: 80,
      patchKind: "scheduler.join_superstep_frontier",
      stage: "scheduler_parallel_frontier",
      status: "completed",
      nodeId: "implementation-node-with-long-id-79",
      roleId: "implementation_engineer",
      progressMetadata,
    });
    const artifact = {
      uri: "runtime-job://job-2/runtime-work-graph/graph-patch/080",
      sha256: "def456",
      sizeBytes: 500_000,
      metadata: {
        payloadRef:
          "runtime-artifact-payload://job-2/execution_platform.runtime_graph_patch/def456",
        byteCount: 500_000,
        sha256: "def456",
      },
    } as unknown as RuntimeJobArtifact;

    const compact = compactSchedulerProgressForManifest(
      progressMetadata,
      summarizeRuntimeGraphPatchArtifact({ artifact, body }),
    );

    expect(JSON.stringify(compact).length).toBeLessThan(64 * 1024);
    expect(compact.graphPatchPayloadRef).toBe(
      "runtime-artifact-payload://job-2/execution_platform.runtime_graph_patch/def456",
    );
    expect(compact.branchScopedFrontierStates).toMatchObject({
      count: 80,
      truncated: true,
      compactedForManifest: true,
    });
  });
});
