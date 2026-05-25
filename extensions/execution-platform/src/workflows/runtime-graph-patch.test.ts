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
      stage: "resource_materialization",
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
      },
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
      patchKind: "resource_materialization",
      stage: "resource_materialization",
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
    expect(JSON.stringify(compact).length).toBeLessThan(64 * 1024);
  });
});
