import { describe, expect, it } from "vitest";
import type { JsonValue } from "../runtime-job-repository.ts";
import { NODE_EXECUTION_STORAGE_POLICY } from "./node-execution-snapshot.ts";
import {
  buildNodeLifecycleProjectionManifest,
  lifecycleDescriptorForGate,
  NODE_LIFECYCLE_GATE_TRANSITIONS,
  NODE_LIFECYCLE_TRANSITION_DESCRIPTORS,
  NodeLifecycleTransitionRunner,
  validateLifecycleDescriptorToolRegistration,
} from "./node-lifecycle-transition-runner.ts";
import { buildRuntimeNodeCapabilityManifest } from "./runtime-node-capability-registry.ts";
import type { RuntimeWorkGraphSnapshot } from "./runtime-work-graph-repository.ts";
import type { TeamGraphNode, TeamGraphNodeKind, TeamRunGraph } from "./runtime-work-graph.ts";

const now = new Date("2026-05-28T00:00:00.000Z");

function graph(): TeamRunGraph {
  return {
    graphId: "graph-lifecycle",
    parentWorkItemId: null,
    rootRuntimeJobId: "job-lifecycle",
    workflowId: "agent_team.coding",
    orchestratorModelRef: "model://orchestrator",
    graphStatus: "running",
    budgetLedgerRef: null,
    checkpointRefs: [],
    finalCloseoutRef: null,
    metadata: {},
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
    createdAt: now,
    updatedAt: now,
  };
}

function node(input: {
  metadata: Record<string, JsonValue>;
  status?: TeamGraphNode["nodeStatus"];
  nodeKind?: TeamGraphNodeKind;
  nodeId?: string;
  assignedRole?: string;
  modelOrWorkerRef?: string;
}): TeamGraphNode {
  return {
    nodeId: input.nodeId ?? "node-1",
    graphId: "graph-lifecycle",
    nodeKind: input.nodeKind ?? "implementation",
    assignedRole: input.assignedRole ?? "implementation_engineer",
    modelOrWorkerRef: input.modelOrWorkerRef ?? "agent:execution-coding",
    runtimeJobId: null,
    humanTaskId: null,
    inputHandoffRefs: [],
    outputArtifactRefs: [],
    nodeStatus: input.status ?? "planned",
    budgetUsage: {},
    metadata: input.metadata,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function snapshot(nodes: TeamGraphNode[]): RuntimeWorkGraphSnapshot {
  return {
    graph: graph(),
    nodes,
    edges: [],
    roleInvocations: [],
    handoffPackets: [],
    artifactManifests: [],
    budgetLedgers: [],
    checkpoints: [],
    humanTasks: [],
  };
}

describe("NodeLifecycleTransitionRunner", () => {
  it("exposes only native OpenClaw agent-session lifecycle gates", () => {
    const lifecycleToolIds = new Set<string>(
      Object.values(NODE_LIFECYCLE_GATE_TRANSITIONS).flatMap((toolIds) => [...toolIds]),
    );
    const descriptorValidation = validateLifecycleDescriptorToolRegistration({
      registeredToolIds: lifecycleToolIds,
    });
    expect(descriptorValidation).toMatchObject({
      valid: true,
      missingToolIds: [],
      reasonCodes: ["node_lifecycle_descriptor_tool_registry_valid"],
    });
    expect(NODE_LIFECYCLE_TRANSITION_DESCRIPTORS.map((descriptor) => descriptor.gate)).toEqual([
      "node_agent_session_ready",
      "node_agent_session_escalation_required",
      "node_lifecycle_root_cause_collapsed",
    ]);
    expect(lifecycleDescriptorForGate("node_agent_session_ready")).toMatchObject({
      handlerRef: "node-lifecycle-handler://node-agent-session/invoke/v1",
      stateMutationTarget: "node_agent_session",
      legalToolIds: ["node.agent_session.invoke"],
    });
    expect(lifecycleDescriptorForGate("resource_demand_open")).toBeNull();
    expect(lifecycleDescriptorForGate("worker_action_ready")).toBeNull();
    expect(Object.values(NODE_LIFECYCLE_GATE_TRANSITIONS).flat()).toEqual([
      "node.agent_session.invoke",
      "node.agent_session.invoke_high_capability",
    ]);
  });

  it("keeps capability lifecycle transitions narrowed to native agent-session invocation", () => {
    const manifest = buildRuntimeNodeCapabilityManifest();
    const retiredPrefixes = [
      "resource.demand.",
      "resource.scout.",
      "resource.selection.",
      "node.execution_packet.",
      "domain.action_gate.",
    ];
    for (const capability of manifest.capabilities) {
      expect(
        capability.allowedLifecycleTransitions.filter((transition) =>
          retiredPrefixes.some((prefix) => transition.startsWith(prefix)),
        ),
      ).toEqual([]);
      if (capability.roleClass !== "human" && capability.canRunAsExecutable) {
        expect(capability.allowedLifecycleTransitions).toContain("node.agent_session.invoke");
      }
    }
  });

  it.each([
    ["implementation", "implementation_microtask", "implementation_engineer"],
    ["validation", "validation_run", "test_engineer"],
    ["reviewer", "reviewer", "reviewer"],
    ["closeout", "coding_closeout", "closeout_synthesizer"],
  ] as const)(
    "projects %s nodes as native agent-session ready",
    (nodeKind, capabilityId, assignedRole) => {
      const runner = new NodeLifecycleTransitionRunner({
        capabilityManifest: buildRuntimeNodeCapabilityManifest(),
      });
      const executable = node({
        nodeKind,
        assignedRole,
        metadata: {
          schedulerGraphPatchCompiled: true,
          capabilityId,
          executionIntent:
            nodeKind === "validation"
              ? "validation"
              : nodeKind === "reviewer"
                ? "review"
                : "source_edit",
          evidenceMode: ["bounded_evidence"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });

      const projection = runner.project({
        graphId: "graph-lifecycle",
        snapshot: snapshot([executable]),
        node: executable,
      });

      expect(projection.currentLifecycleState).toBe("node_agent_session_ready");
      expect(projection.currentGate).toBe("node_agent_session_ready");
      expect(projection.canCallGlobalScheduler).toBe(false);
      expect(projection.nextLegalTransitions).toEqual(["node.agent_session.invoke"]);
      expect(projection.rejectedLifecycleTransitions).toEqual([]);
      expect(projection.rootCauseSignature?.stage).toBe("node_agent_session");
      expect(projection.rootCauseSignature?.reasonCodes).toContain(
        "node_lifecycle_runner_authorized_openclaw_agent_session",
      );
    },
  );

  it("does not let stale worker/resource metadata become lifecycle authority", () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });
    const executable = node({
      metadata: {
        capabilityId: "implementation_microtask",
        nodeLifecycleProjectionGate: "resource_demand_open",
        currentPhase: "worker_action_ready",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });

    const projection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([executable]),
      node: executable,
    });

    expect(projection.currentGate).toBe("node_agent_session_ready");
    expect(projection.nextLegalTransitions).toEqual(["node.agent_session.invoke"]);
    expect(projection.rejectedLifecycleTransitions).toEqual([]);
    expect(projection.canCallGlobalScheduler).toBe(false);
    expect(projection.rootCauseSignature?.reasonCodes).toContain(
      "node_lifecycle_stale_metadata_gate_ignored",
    );
  });

  it("drains pending native agent-session projections before global scheduler repair", async () => {
    const executable = node({
      metadata: {
        schedulerGraphPatchCompiled: true,
        capabilityId: "implementation_microtask",
        executionIntent: "source_edit",
        evidenceMode: ["changed_file_evidence"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const seen: string[] = [];
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
      recordProjection: async ({ projection }) => {
        seen.push(`project:${projection.currentGate}`);
        return { refs: [projection.projectionRef], reasonCodes: ["projection_recorded"] };
      },
      executeTransition: async ({ projection }) => {
        seen.push(`execute:${projection.currentGate}`);
        return {
          status: "continue",
          continueLoop: true,
          refs: ["transition://node-agent-session"],
          reasonCodes: ["node_agent_session_transition_executed"],
        };
      },
    });

    const result = await runner.drain({
      graphId: "graph-lifecycle",
      iteration: 1,
      snapshot: snapshot([executable]),
    });

    expect(result.actionTaken).toBe(true);
    expect(result.hasPendingLegalTransitions).toBe(true);
    expect(result.continueLoop).toBe(true);
    expect(result.reasonCodes).toContain("node_agent_session_transition_executed");
    expect(seen).toEqual(["project:node_agent_session_ready", "execute:node_agent_session_ready"]);
  });

  it("keeps projection metadata compact and manifest-shaped", () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });
    const executable = node({
      metadata: {
        capabilityId: "implementation_microtask",
        executionIntent: "source_edit",
        acceptedArtifactRefs: Array.from(
          { length: 50 },
          (_, index) => `artifact://accepted/${index}`,
        ),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } as unknown as Record<string, JsonValue>,
    });

    const projection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([executable]),
      node: executable,
    });
    const manifest = buildNodeLifecycleProjectionManifest(projection);

    expect(manifest.acceptedArtifactRefs.length).toBeLessThanOrEqual(12);
    expect(manifest.byteCount).toBeGreaterThan(0);
    expect(JSON.stringify(manifest)).not.toContain("raw response");
    expect(manifest.rawPromptStored).toBe(false);
    expect(manifest.rawProviderLogStored).toBe(false);
  });

  it("blocks native agent session start when the runner-owned agent profile resolver rejects it", async () => {
    const persistedSnapshots: unknown[] = [];
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
      resolveNodeAgentProfile: ({ proposedAgentId }) => ({
        status: "blocked",
        agentId: proposedAgentId,
        blockerKind: "node_agent_profile_missing",
        reasonCodes: ["fixture_node_agent_profile_missing"],
      }),
      recordNodeExecutionSnapshot: async (input) => {
        persistedSnapshots.push(input.nodeExecutionSnapshot);
        return { refs: ["artifact://snapshot"], reasonCodes: ["fixture_snapshot_persisted"] };
      },
    });
    const executable = node({
      metadata: {
        capabilityId: "implementation_microtask",
        executionIntent: "source_edit",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });

    const result = await runner.prepareAgentSessionStart({
      graphId: "graph-lifecycle",
      iteration: 7,
      snapshot: snapshot([executable]),
      node: executable,
    });

    expect(result).toMatchObject({
      status: "blocked",
      blockerKind: "node_agent_profile_missing",
    });
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_lifecycle_runner_blocked_openclaw_agent_session_start",
        "node_agent_profile_missing",
        "fixture_node_agent_profile_missing",
      ]),
    );
    expect(result.refs).toEqual([]);
    expect(persistedSnapshots).toEqual([]);
  });

  it("uses the runner-owned accepted agent profile resolution when building native snapshots", async () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
      resolveNodeAgentProfile: () => ({
        status: "accepted",
        agentId: "execution-coding-specialized",
        reasonCodes: ["fixture_node_agent_profile_accepted"],
      }),
      recordNodeExecutionSnapshot: async () => ({
        refs: ["artifact://snapshot"],
        reasonCodes: ["fixture_snapshot_persisted"],
      }),
    });
    const executable = node({
      metadata: {
        capabilityId: "implementation_microtask",
        executionIntent: "source_edit",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });

    const result = await runner.prepareAgentSessionStart({
      graphId: "graph-lifecycle",
      iteration: 7,
      snapshot: snapshot([executable]),
      node: executable,
    });

    expect(result).toMatchObject({
      status: "accepted",
      blockerKind: null,
      nodeExecutionSnapshot: {
        agentId: "execution-coding-specialized",
        sessionKey: expect.stringMatching(/^agent:execution-coding-specialized:node:nrun_/),
      },
    });
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_lifecycle_runner_prepared_openclaw_agent_session_start",
        "fixture_node_agent_profile_accepted",
        "fixture_snapshot_persisted",
      ]),
    );
  });

  it("prepares native agent session snapshots from compact scheduler graph node metadata", async () => {
    const implementationNode = node({
      nodeId: "node-core-implementation",
      metadata: {
        schedulerGraphPatchCompiled: true,
        schedulerGraphPatchWorkUnitId: "wu-core",
        capabilityId: "implementation_microtask",
        executorKey: "kind:implementation",
        workerRef: "agent:execution-coding",
        executionIntent: "source_edit",
        coveredRequirementIds: ["req-core"],
        targetCommitmentIds: ["req-core"],
        authorityScopeRefs: ["repo-scope://workspace"],
        sourceContextRefs: ["source-prompt://requirement-map/body"],
        sourcePromptExcerptRefs: ["source-prompt://requirement-map/req-core"],
        evidenceClaimExpectations: ["Changed-file and validation evidence covers req-core."],
        expectedEvidenceClaimKinds: ["source_change", "test_validation"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });

    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
      resolveNodeAgentProfile: () => ({
        status: "accepted",
        agentId: "execution-coding",
        reasonCodes: ["fixture_native_agent_profile_accepted"],
      }),
      recordNodeExecutionSnapshot: async () => ({
        refs: ["artifact://native-node-execution-snapshot"],
        reasonCodes: ["fixture_native_node_execution_snapshot_persisted"],
      }),
    });

    const result = await runner.prepareAgentSessionStart({
      graphId: "graph-lifecycle",
      iteration: 9,
      snapshot: snapshot([implementationNode]),
      node: implementationNode,
      attemptId: "attempt-1",
    });

    expect(result.status).toBe("accepted");
    expect(result.nodeExecutionSnapshot).toMatchObject({
      graphId: "graph-lifecycle",
      nodeId: "node-core-implementation",
      attemptId: "attempt-1",
      agentId: "execution-coding",
      sessionKey: expect.stringMatching(/^agent:execution-coding:node:nrun_/),
      taskRefs: ["runtime-work-graph://node/node-core-implementation"],
      requirementRefs: ["req-core"],
      sourcePromptRefs: expect.arrayContaining([
        "source-prompt://requirement-map/body",
        "source-prompt://requirement-map/req-core",
      ]),
      storagePolicy: {
        artifactPolicyRef: NODE_EXECUTION_STORAGE_POLICY.artifactPolicyRef,
        rawStoragePolicyRef: NODE_EXECUTION_STORAGE_POLICY.rawStoragePolicyRef,
        boundedRefsOnly: true,
      },
    });
    expect(result.nodeExecutionSnapshot).not.toHaveProperty("rawPromptStored");
    expect(result.nodeExecutionSnapshot).not.toHaveProperty("rawResponseStored");
    expect(result.refs).toEqual(
      expect.arrayContaining([
        result.nodeExecutionSnapshot.snapshotRef,
        "artifact://native-node-execution-snapshot",
      ]),
    );
  });
});
