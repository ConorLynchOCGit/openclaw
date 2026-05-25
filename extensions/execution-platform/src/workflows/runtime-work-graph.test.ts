import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { createContextSnapshotRef } from "./context-snapshot.ts";
import { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";

async function withGraphRepository<T>(
  work: (input: {
    graphs: RuntimeWorkGraphRepository;
    runtimeJobs: RuntimeJobRepository;
    workQueue: WorkQueueRepository;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const now = () => new Date("2026-05-10T00:00:00.000Z");
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic", now });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now });
    const graphs = new RuntimeWorkGraphRepository(database.sql, { now });
    return await work({ graphs, runtimeJobs, workQueue });
  } finally {
    await database.close();
  }
}

describe("runtime work graph repository", () => {
  it("creates graph tables and persists checkpoints", async () => {
    await withGraphRepository(async ({ graphs }) => {
      const graph = await graphs.createGraph({
        graphId: "graph-1",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      const ledger = await graphs.recordBudgetLedger({
        graphId: graph.graphId,
        ledgerId: "ledger-1",
        scopeKind: "graph",
        scopeRef: graph.graphId,
        wallTimeMs: 1_000,
        maxOutputTokens: 8_000,
      });
      const checkpoint = await graphs.recordCheckpoint({
        graphId: graph.graphId,
        checkpointId: "checkpoint-1",
        checkpointKind: "orchestrator_plan",
        stateSummary: "Plan accepted with bounded graph evidence.",
        budgetLedgerRef: ledger.ledgerId,
      });
      const snapshot = await graphs.readGraphSnapshot(graph.graphId);

      expect(checkpoint.rawPromptStored).toBe(false);
      expect(snapshot?.graph.checkpointRefs).toContain(
        "runtime-work-graph://checkpoint/checkpoint-1",
      );
      expect(snapshot?.budgetLedgers).toHaveLength(1);
    });
  });

  it("records checkpoints idempotently without duplicate graph refs", async () => {
    await withGraphRepository(async ({ graphs }) => {
      const graph = await graphs.createGraph({
        graphId: "graph-idempotent-checkpoint",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      await graphs.recordCheckpoint({
        graphId: graph.graphId,
        checkpointId: "boundary-replay-context-scout",
        checkpointKind: "boundary_replay_context_scout",
        stateSummary: "Initial context scout checkpoint.",
        artifactRefs: ["runtime-job://job/context-scout/a"],
      });
      const second = await graphs.recordCheckpoint({
        graphId: graph.graphId,
        checkpointId: "boundary-replay-context-scout",
        checkpointKind: "boundary_replay_context_scout",
        stateSummary: "Updated context scout checkpoint.",
        artifactRefs: ["runtime-job://job/context-scout/b"],
      });
      const snapshot = await graphs.readGraphSnapshot(graph.graphId);

      expect(second.stateSummary).toBe("Updated context scout checkpoint.");
      expect(snapshot?.checkpoints).toHaveLength(1);
      expect(
        snapshot?.graph.checkpointRefs.filter(
          (ref) => ref === "runtime-work-graph://checkpoint/boundary-replay-context-scout",
        ),
      ).toHaveLength(1);
      expect(snapshot?.checkpoints[0]?.artifactRefs).toEqual(["runtime-job://job/context-scout/b"]);
    });
  });

  it("records repeated role invocations and handoff edges", async () => {
    await withGraphRepository(async ({ graphs }) => {
      await graphs.createGraph({
        graphId: "graph-repeat",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      const first = await graphs.addNode({
        graphId: "graph-repeat",
        nodeId: "context-1",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "succeeded",
      });
      const second = await graphs.addNode({
        graphId: "graph-repeat",
        nodeId: "context-2",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "succeeded",
        inputHandoffRefs: ["runtime-work-graph://node/context-1"],
      });
      await graphs.recordRoleInvocation({
        graphId: "graph-repeat",
        nodeId: first.nodeId,
        invocationId: "invoke-context-1",
        roleId: "context_scout",
        modelRef: "deepseek/deepseek-v4-flash",
        providerPath: "openrouter",
        transportKind: "live_model",
        outputHash: "hash-1",
        latencyMs: 10,
      });
      await graphs.recordRoleInvocation({
        graphId: "graph-repeat",
        nodeId: second.nodeId,
        invocationId: "invoke-context-2",
        roleId: "context_scout",
        modelRef: "deepseek/deepseek-v4-flash",
        providerPath: "openrouter",
        transportKind: "live_model",
        outputHash: "hash-2",
        latencyMs: 12,
      });
      await graphs.addEdge({
        graphId: "graph-repeat",
        edgeId: "edge-repair-context",
        fromNodeId: first.nodeId,
        toNodeId: second.nodeId,
        edgeKind: "continuation",
        reasonCodes: ["more_context_needed"],
      });
      const snapshot = await graphs.readGraphSnapshot("graph-repeat");

      expect(snapshot?.roleInvocations.map((invocation) => invocation.invocationId)).toEqual([
        "invoke-context-1",
        "invoke-context-2",
      ]);
      expect(snapshot?.edges[0]).toMatchObject({ edgeKind: "continuation" });
    });
  });

  it("rejects raw storage metadata and preserves Work Queue lifecycle boundary", async () => {
    await withGraphRepository(async ({ graphs }) => {
      await expect(
        graphs.createGraph({
          graphId: "graph-raw",
          workflowId: "agent_team.coding",
          orchestratorModelRef: "openai-codex/gpt-5.5",
          metadata: { rawPromptStored: true },
        }),
      ).rejects.toThrow(/raw storage field/u);
    });
  });

  it("rejects graph node metadata that embeds resource bodies instead of bounded manifests", async () => {
    await withGraphRepository(async ({ graphs }) => {
      await graphs.createGraph({
        graphId: "graph-manifest-only-node-metadata",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });

      await expect(
        graphs.addNode({
          graphId: "graph-manifest-only-node-metadata",
          nodeId: "implementation-with-body",
          nodeKind: "implementation",
          assignedRole: "implementation_engineer",
          metadata: {
            nodeReadinessState: {
              artifactKind: "node_readiness_state",
              readinessStatus: "ready",
            },
            rawPromptStored: false,
            rawResponseStored: false,
          },
        }),
      ).rejects.toThrow(/metadata manifest violation/u);

      const node = await graphs.addNode({
        graphId: "graph-manifest-only-node-metadata",
        nodeId: "implementation-with-manifest",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        metadata: {
          nodeReadinessStateRef:
            "runtime-work-graph://node-readiness-state/implementation-with-manifest/abc",
          nodeExecutionPacketRef:
            "runtime-work-graph://node-execution-packet/implementation-with-manifest/abc",
          resourcePacketRef:
            "runtime-work-graph://coding-resource-packet/implementation-with-manifest/abc",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      expect(node.metadata).toMatchObject({
        nodeReadinessStateRef:
          "runtime-work-graph://node-readiness-state/implementation-with-manifest/abc",
      });

      const summarized = await graphs.addNode({
        graphId: "graph-manifest-only-node-metadata",
        nodeId: "implementation-with-resource-summary",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        metadata: {
          implementationResourceMaterializationInputCounts: {
            targetFileSnapshotCount: 2,
            resolvedTargetFileRefCount: 2,
            validationCommandRefCount: 1,
          },
          implementationResourceMaterializationOutputCounts: {
            targetFileSnapshotCount: 2,
            implementationTaskPacketCount: 1,
          },
          implementationResourceMaterializationMaxBounds: {
            targetFileSnapshotMax: 120,
            validationCommandRefMax: 40,
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      expect(summarized.metadata).toMatchObject({
        implementationResourceMaterializationInputCounts: {
          targetFileSnapshotCount: 2,
        },
      });
    });
  });

  it("accepts large arrays of bounded context snapshot refs in graph metadata", async () => {
    await withGraphRepository(async ({ graphs }) => {
      await graphs.createGraph({
        graphId: "graph-context-snapshot-ref-array",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });

      const node = await graphs.addNode({
        graphId: "graph-context-snapshot-ref-array",
        nodeId: "implementation-with-many-snapshot-refs",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        metadata: {
          providedContextSnapshotRefs: Array.from({ length: 24 }, (_, index) =>
            createContextSnapshotRef({
              sourceRef: `context-handoff://large-graph/${index}`,
              sourceKind: "context_scout_handoff",
              capturedAt: "2026-05-22T00:00:00.000Z",
              graphId: "graph-context-snapshot-ref-array",
              nodeId: "implementation-with-many-snapshot-refs",
              targetRefs: [`extensions/execution-platform/src/fixture-${index}.ts`],
              scopeSummary: "Bounded context snapshot ref, not embedded context body.",
              freshnessStatus: "fresh",
              refreshRequired: false,
              refreshAction: "none",
            }),
          ),
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      expect(
        Array.isArray((node.metadata as Record<string, unknown>).providedContextSnapshotRefs),
      ).toBe(true);
    });
  });

  it("stores artifact manifests as refs and hashes", async () => {
    await withGraphRepository(async ({ graphs }) => {
      await graphs.createGraph({
        graphId: "graph-manifest",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      const manifest = await graphs.recordArtifactManifest({
        graphId: "graph-manifest",
        manifestId: "manifest-1",
        artifactType: "validation_summary",
        storageRef: "artifact://validation-summary",
        contentHash: "sha256:abc",
        byteCount: 128,
        boundedSummary: "Validation summary ref, not raw logs.",
      });

      expect(manifest.rawContentStored).toBe(false);
      expect(manifest.storageRef).toBe("artifact://validation-summary");
    });
  });
});
