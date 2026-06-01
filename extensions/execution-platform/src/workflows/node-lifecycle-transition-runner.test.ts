import { describe, expect, it } from "vitest";
import type { JsonValue } from "../runtime-job-repository.ts";
import { buildRuntimeNodeCapabilityManifest } from "./runtime-node-capability-registry.ts";
import {
  buildNodeLifecycleProjectionManifest,
  lifecycleDescriptorForGate,
  NODE_LIFECYCLE_GATE_TRANSITIONS,
  NODE_LIFECYCLE_TRANSITION_DESCRIPTORS,
  NodeLifecycleTransitionRunner,
  validateLifecycleDescriptorToolRegistration,
} from "./node-lifecycle-transition-runner.ts";
import { SCHEDULER_RUNTIME_TOOL_IDS } from "./scheduler-runtime-tools.ts";
import type { TeamGraphNode, TeamRunGraph } from "./runtime-work-graph.ts";
import type { RuntimeWorkGraphSnapshot } from "./runtime-work-graph-repository.ts";

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

function node(metadata: Record<string, JsonValue>, status: TeamGraphNode["nodeStatus"] = "planned"): TeamGraphNode {
  return {
    nodeId: "work-intent-1",
    graphId: "graph-lifecycle",
    nodeKind: "work_intent",
    assignedRole: "implementation_engineer",
    modelOrWorkerRef: "worker.kimi.file-implementation",
    runtimeJobId: null,
    humanTaskId: null,
    inputHandoffRefs: [],
    outputArtifactRefs: [],
    nodeStatus: status,
    budgetUsage: {},
    metadata,
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
  it("keeps local gate transitions registered as scheduler/runtime tools and capability-authorized", () => {
    const manifest = buildRuntimeNodeCapabilityManifest();
    const schedulerToolIds = new Set<string>(SCHEDULER_RUNTIME_TOOL_IDS);
    const descriptorValidation = validateLifecycleDescriptorToolRegistration({
      registeredToolIds: schedulerToolIds,
    });
    expect(descriptorValidation).toMatchObject({
      valid: true,
      missingToolIds: [],
      reasonCodes: ["node_lifecycle_descriptor_tool_registry_valid"],
    });
    expect(NODE_LIFECYCLE_TRANSITION_DESCRIPTORS.length).toBeGreaterThan(10);
    expect(lifecycleDescriptorForGate("resource_demand_open")).toMatchObject({
      handlerRef: "node-lifecycle-handler://node-resource-demand/fulfill-or-narrow/v1",
      stateMutationTarget: "node_resource_demand_session",
    });
    const allGateTransitions = new Set(
      Object.values(NODE_LIFECYCLE_GATE_TRANSITIONS).flatMap((transitions) => [...transitions]),
    );
    const missingRuntimeTools = [...allGateTransitions].filter(
      (transition) => !schedulerToolIds.has(transition),
    );
    expect(missingRuntimeTools).toEqual([]);

    for (const capability of manifest.capabilities) {
      if (!capability.requiresResources || capability.canEditSource || capability.canWriteTests) {
        continue;
      }
      expect(capability.allowedLifecycleTransitions).toEqual(
        expect.arrayContaining([
          "resource.scout.submit_exact_handles",
          "scheduler.accept_resources_for_work_intent",
          "scheduler.promote_resource_satisfied_work_intent_to_executable",
        ]),
      );
    }
    for (const capability of manifest.capabilities) {
      if (!capability.canEditSource && !capability.canWriteTests) {
        continue;
      }
      expect(capability.allowedLifecycleTransitions).not.toContain("resource.demand.open");
      expect(capability.allowedLifecycleTransitions).toEqual(
        expect.arrayContaining([
          "node.execution_packet.promote_worker_action_ready",
          "worker.edit.plan",
        ]),
      );
    }
  });

  it("projects executable source-edit WorkIntents as worker-action-ready instead of pre-worker resource demand", () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });
    const workIntent = node(
      {
        workIntentCompiled: true,
        workIntentId: "wi-1",
        workIntentRef: "work-intent://wi-1",
        capabilityId: "implementation_microtask",
        executionIntent: "source_edit",
        evidenceMode: ["changed_file_evidence"],
        contextRequired: true,
        resourceObjectiveFocusStatus: "accepted",
        resourceObjectiveFocusRef: "context-focus://accepted/1",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      "needs_review",
    );

    const projection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([workIntent]),
      node: workIntent,
    });

    expect(projection.currentGate).toBe("worker_action_ready");
    expect(projection.canCallGlobalScheduler).toBe(false);
    expect(projection.nextLegalTransitions).toContain("worker.edit.plan");
    expect(projection.nextLegalTransitions).not.toContain("resource.demand.open");
  });

  it("does not let stale blocked focus stop executable source-edit worker start", () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });
    const workIntent = node({
      workIntentCompiled: true,
      workIntentId: "wi-1",
      workIntentRef: "work-intent://wi-1",
      capabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence"],
      contextRequired: true,
      resourceObjectiveFocusStatus: "blocked",
      resourceObjectiveFocusRef: "context-focus://blocked/1",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });

    const projection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([workIntent]),
      node: workIntent,
    });

    expect(projection.currentGate).toBe("worker_action_ready");
    expect(projection.nextLegalTransitions).toContain("worker.edit.plan");
    expect(projection.nextLegalTransitions).not.toContain("resource.scout.submit_exact_handles");
    expect(projection.canCallGlobalScheduler).toBe(false);
  });

  it("blocks global scheduler calls and executes the local transition first", async () => {
    const workIntent = node({
      workIntentCompiled: true,
      workIntentId: "wi-1",
      workIntentRef: "work-intent://wi-1",
      capabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence"],
      contextRequired: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
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
          refs: ["transition://context-focus"],
          reasonCodes: ["transition_executed"],
        };
      },
    });

    const result = await runner.drain({
      graphId: "graph-lifecycle",
      iteration: 1,
      snapshot: snapshot([workIntent]),
    });

    expect(result.actionTaken).toBe(true);
    expect(result.hasPendingLegalTransitions).toBe(true);
    expect(result.continueLoop).toBe(true);
    expect(result.reasonCodes).toContain("transition_executed");
    expect(seen).toEqual(["project:worker_action_ready", "execute:worker_action_ready"]);
  });

  it("projects validation repair and high-capability escalation as runner-owned gates", () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });
    const validationNode = node(
      {
        capabilityId: "implementation_microtask",
        nodeLifecycleProjectionGate: "validation_repair_plan_required",
        validationLifecycleStatus: "repair_required",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      "needs_review",
    );
    const escalationNode = node(
      {
        capabilityId: "implementation_microtask",
        nodeLifecycleProjectionGate: "high_capability_escalation_required",
        highCapabilityEscalationStatus: "requested",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      "needs_review",
    );

    const validationProjection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([validationNode]),
      node: validationNode,
    });
    const escalationProjection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([escalationNode]),
      node: escalationNode,
    });

    expect(validationProjection.currentGate).toBe("validation_repair_plan_required");
    expect(validationProjection.nextLegalTransitions).toEqual(
      expect.arrayContaining([
        "worker.context.search",
        "worker.context.find_tests",
        "worker.validation.request_repair",
        "worker.escalation.request_high_capability",
      ]),
    );
    expect(validationProjection.canCallGlobalScheduler).toBe(false);
    expect(escalationProjection.currentGate).toBe("high_capability_escalation_required");
    expect(escalationProjection.nextLegalTransitions).toEqual(
      expect.arrayContaining([
        "worker.escalation.execute_high_capability",
        "worker.escalation.mark_unavailable",
      ]),
    );
    expect(escalationProjection.canCallGlobalScheduler).toBe(false);
  });

  it("does not treat skipped executable WorkIntent nodes with pending worker-action transitions as terminal", async () => {
    const workIntent = node(
      {
        workIntentCompiled: true,
        workIntentId: "wi-skipped-demand",
        workIntentRef: "work-intent://wi-skipped-demand",
        capabilityId: "implementation_microtask",
        executionIntent: "source_edit",
        evidenceMode: ["changed_file_evidence"],
        contextRequired: true,
        resourceObjectiveFocusStatus: "accepted",
        resourceObjectiveFocusRef: "context-focus://accepted/skipped-demand",
        nodeResourceDemandStatus: "open",
        nodeResourceDemandSessionRefs: ["node-resource-demand://wi-skipped-demand/open"],
        nextLegalTransitions: [
          "resource.demand.fulfill_exact_handles",
          "resource.scout.dispatch_specialist_subturn",
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      "skipped",
    );
    const seen: string[] = [];
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
      recordProjection: async ({ projection }) => {
        seen.push(`project:${projection.nodeStatus}:${projection.currentGate}`);
        return { refs: [projection.projectionRef], reasonCodes: ["projection_recorded"] };
      },
      executeTransition: async ({ projection }) => {
        seen.push(`execute:${projection.nodeStatus}:${projection.currentGate}`);
        return {
          status: "continue",
          continueLoop: true,
          refs: ["transition://node-resource-demand"],
          reasonCodes: ["node_resource_demand_transition_executed"],
        };
      },
    });

    const projection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([workIntent]),
      node: workIntent,
    });
    const pending = runner.pendingProjections({
      graphId: "graph-lifecycle",
      snapshot: snapshot([workIntent]),
    });
    const result = await runner.drain({
      graphId: "graph-lifecycle",
      iteration: 1,
      snapshot: snapshot([workIntent]),
    });

    expect(projection.nodeStatus).toBe("skipped");
    expect(projection.currentGate).toBe("worker_action_ready");
    expect(projection.canCallGlobalScheduler).toBe(false);
    expect(pending.map((item) => item.nodeId)).toEqual(["work-intent-1"]);
    expect(result.actionTaken).toBe(true);
    expect(result.continueLoop).toBe(true);
    expect(result.reasonCodes).toContain("node_resource_demand_transition_executed");
    expect(seen).toEqual([
      "project:skipped:worker_action_ready",
      "execute:skipped:worker_action_ready",
    ]);
  });

  it("keeps projection metadata compact and manifest-shaped", () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });
    const workIntent = node({
      workIntentCompiled: true,
      workIntentId: "wi-1",
      workIntentRef: "work-intent://wi-1",
      capabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence"],
      contextRequired: true,
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRefs: Array.from(
        { length: 50 },
        (_, index) => `context-focus://accepted/${index}`,
      ),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    } as unknown as Record<string, JsonValue>);

    const projection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([workIntent]),
      node: workIntent,
    });
    const manifest = buildNodeLifecycleProjectionManifest(projection);

    expect(manifest.acceptedArtifactRefs.length).toBeLessThanOrEqual(12);
    expect(manifest.byteCount).toBeGreaterThan(0);
    expect(JSON.stringify(manifest)).not.toContain("raw response");
    expect(manifest.rawPromptStored).toBe(false);
    expect(manifest.rawProviderLogStored).toBe(false);
  });

  it("rejects local lifecycle transitions not registered by the capability profile", () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });
    const workIntent = node({
      workIntentCompiled: false,
      capabilityId: "orchestrator_decision",
      nodeLifecycleProjectionGate: "worker_action_ready",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });

    const projection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([workIntent]),
      node: workIntent,
    });
    const manifest = buildNodeLifecycleProjectionManifest(projection);

    expect(projection.currentGate).toBe("worker_action_ready");
    expect(projection.nextLegalTransitions).toEqual([]);
    expect(projection.rejectedLifecycleTransitions).toEqual(
      expect.arrayContaining([
        "worker.edit.plan",
        "worker.context.request_more",
        "worker.context.search",
        "worker.context.find_tests",
      ]),
    );
    expect(projection.canCallGlobalScheduler).toBe(false);
    expect(projection.rootCauseSignature?.reasonCodes).toContain(
      "node_lifecycle_transition_profile_rejected_unregistered_tool",
    );
    expect(manifest.rejectedLifecycleTransitionCount).toBe(14);
  });

  it("projects domain worker-action tools for Product/Spec Planning instead of coding edit tools", () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });
    const planningIntent = node({
      workIntentCompiled: false,
      capabilityId: "planning_capsule_draft",
      nodeLifecycleProjectionGate: "worker_action_ready",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });

    const projection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([planningIntent]),
      node: planningIntent,
    });

    expect(projection.currentGate).toBe("worker_action_ready");
    expect(projection.nextLegalTransitions).toEqual(
      expect.arrayContaining(["planning.framework_contract.record", "planning.capsule.draft"]),
    );
    expect(projection.nextLegalTransitions).not.toContain("worker.edit.plan");
    expect(projection.nextLegalTransitions).not.toContain("worker.patch.force_author_from_plan");
    expect(projection.rejectedLifecycleTransitions).toEqual([]);
  });

  it("uses the same lifecycle runner for non-coding planning capabilities", () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });
    const planningIntent = node({
      workIntentCompiled: false,
      capabilityId: "planning_capsule_draft",
      executionIntent: "planning_capsule",
      nodeLifecycleProjectionGate: "resource_demand_open",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });

    const projection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([planningIntent]),
      node: planningIntent,
    });

    expect(projection.currentGate).toBe("resource_demand_open");
    expect(projection.nextLegalTransitions).toEqual(
      expect.arrayContaining(["resource.scout.dispatch_specialist_subturn"]),
    );
    expect(projection.rejectedLifecycleTransitions).toEqual([]);
    expect(projection.lifecycleTransitionProfileRef).toBe(
      "lifecycle-profile://agent_team.product_spec_planning/planning_capsule_draft.v1",
    );
    expect(projection.canCallGlobalScheduler).toBe(false);
  });

  it("ignores stale nodeReadinessPhase metadata as lifecycle authority", () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });
    const workIntent = node({
      workIntentCompiled: false,
      capabilityId: "implementation_microtask",
      nodeReadinessPhase: "worker_action_ready",
      nodeReadinessNextAllowedTransitions: ["worker.edit.plan"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });

    const projection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([workIntent]),
      node: workIntent,
    });

    expect(projection.currentGate).toBe("no_local_lifecycle_transition");
    expect(projection.nextLegalTransitions).toEqual([]);
    expect(projection.canCallGlobalScheduler).toBe(true);
    expect(projection.rootCauseSignature?.reasonCodes).toContain(
      "node_lifecycle_stale_metadata_gate_ignored",
    );
  });

  it("keeps context-satisfied source-edit WorkIntents on worker-owned execution", () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });
    const workIntent = node({
      workIntentCompiled: true,
      workIntentId: "wi-context-ready",
      workIntentRef: "work-intent://wi-context-ready",
      capabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence"],
      contextRequired: true,
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRef: "context-focus://accepted/ready",
      nodeResourceDemandStatus: "fulfilled",
      nodeResourceDemandSessionRefs: ["node-resource-demand://wi-context-ready/open"],
      nodeResourceDemandFulfillmentRefs: ["node-resource-demand://wi-context-ready/fulfilled"],
      nodeResourceLedgerRefs: ["node-resource-ledger://wi-context-ready"],
      nodeResourceLedgerEntryRefs: ["node-resource-ledger://wi-context-ready/entry/1"],
      acceptedResourceHandoffRefs: ["node-resource-ledger://wi-context-ready/entry/1"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });

    const projection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([workIntent]),
      node: workIntent,
    });

    expect(projection.currentGate).toBe("worker_action_ready");
    expect(projection.rejectedLifecycleTransitions).toEqual([]);
    expect(projection.nextLegalTransitions).toEqual(
      expect.arrayContaining(["worker.edit.plan"]),
    );
    expect(projection.nextLegalTransitions).not.toContain("resource.selection.propose");
    expect(projection.canCallGlobalScheduler).toBe(false);
  });

  it("keeps fully hydrated source-edit WorkIntents under worker-owned executable promotion", () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });
    const workIntent = node({
      workIntentCompiled: true,
      workIntentId: "wi-context-and-target-ready",
      workIntentRef: "work-intent://wi-context-and-target-ready",
      capabilityId: "implementation_microtask",
      workIntentSelectedCapabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence"],
      contextRequired: true,
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRef: "context-focus://accepted/ready",
      nodeResourceDemandStatus: "fulfilled",
      nodeResourceDemandSessionRefs: ["node-resource-demand://wi-context-and-target-ready/open"],
      nodeResourceDemandFulfillmentRefs: [
        "node-resource-demand://wi-context-and-target-ready/fulfilled",
      ],
      nodeResourceLedgerRefs: ["node-resource-ledger://wi-context-and-target-ready"],
      nodeResourceLedgerEntryRefs: ["node-resource-ledger://wi-context-and-target-ready/entry/1"],
      acceptedResourceHandoffRefs: ["node-resource-ledger://wi-context-and-target-ready/entry/1"],
      domainResourceSelectionStatus: "accepted",
      domainResourceSelectionDecisionStatus: "accepted",
      domainResourceSelectionRefs: ["resource-selection://wi-context-and-target-ready/accepted"],
      domainResourceSelectionPacketRefs: [
        "resource-selection-packet://wi-context-and-target-ready/accepted",
      ],
      domainResourceSelectionDecisionRefs: [
        "resource-selection-decision://wi-context-and-target-ready/accepted",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });

    const projection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([workIntent]),
      node: workIntent,
    });

    expect(projection.currentLifecycleState).toBe("worker_action_ready");
    expect(projection.currentGate).toBe("worker_action_ready");
    expect(projection.nextLegalTransitions).toEqual(
      expect.arrayContaining(["worker.edit.plan"]),
    );
    expect(projection.canCallGlobalScheduler).toBe(false);
  });

  it("does not run pre-worker specialist narrowing for executable source-edit WorkIntents", () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });
    const workIntent = node({
      workIntentCompiled: true,
      workIntentId: "wi-context-narrowing",
      workIntentRef: "work-intent://wi-context-narrowing",
      capabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence"],
      contextRequired: true,
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRef: "context-focus://accepted/narrowing",
      nodeResourceDemandStatus: "open",
      nodeResourceDemandSessionRefs: ["node-resource-demand://wi-context-narrowing/open"],
      contextScoutSpecialistStatus: "dispatch_ready",
      contextScoutSpecialistRequestRef: "context-scout-specialist://wi-context-narrowing/request",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });

    const projection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([workIntent]),
      node: workIntent,
    });

    expect(projection.currentGate).toBe("worker_action_ready");
    expect(projection.nextLegalTransitions).toEqual(
      expect.arrayContaining(["worker.edit.plan"]),
    );
    expect(projection.nextLegalTransitions).not.toContain("resource.scout.submit_exact_handles");
    expect(projection.canCallGlobalScheduler).toBe(false);
    expect(projection.rootCauseSignature?.stage).toBe("worker_action");
  });

  it("allows context-satisfied read-only WorkIntents through context acceptance", () => {
    const runner = new NodeLifecycleTransitionRunner({
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });
    const workIntent = node({
      workIntentCompiled: true,
      workIntentId: "wi-context-ready-readonly",
      workIntentRef: "work-intent://wi-context-ready-readonly",
      capabilityId: "reviewer",
      executionIntent: "source_grounding",
      evidenceMode: ["read_only_evidence"],
      contextRequired: true,
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRef: "context-focus://accepted/ready-readonly",
      nodeResourceDemandStatus: "fulfilled",
      nodeResourceDemandSessionRefs: ["node-resource-demand://wi-context-ready-readonly/open"],
      nodeResourceDemandFulfillmentRefs: ["node-resource-demand://wi-context-ready-readonly/fulfilled"],
      nodeResourceLedgerRefs: ["node-resource-ledger://wi-context-ready-readonly"],
      nodeResourceLedgerEntryRefs: ["node-resource-ledger://wi-context-ready-readonly/entry/1"],
      acceptedResourceHandoffRefs: ["node-resource-ledger://wi-context-ready-readonly/entry/1"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });

    const projection = runner.project({
      graphId: "graph-lifecycle",
      snapshot: snapshot([workIntent]),
      node: workIntent,
    });

    expect(projection.currentGate).toBe("resource_ledger_ready");
    expect(projection.rejectedLifecycleTransitions).toEqual([]);
    expect(projection.nextLegalTransitions).toEqual(
      expect.arrayContaining(["scheduler.mark_read_only_work_intent_satisfied_from_resources"]),
    );
    expect(projection.canCallGlobalScheduler).toBe(false);
  });
});
