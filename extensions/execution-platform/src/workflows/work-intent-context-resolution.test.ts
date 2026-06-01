import { describe, expect, it } from "vitest";
import type { JsonValue } from "../runtime-job-repository.ts";
import { buildRuntimeNodeCapabilityManifest } from "./runtime-node-capability-registry.ts";
import type { TeamGraphEdge, TeamGraphNode, TeamRunGraph } from "./runtime-work-graph.ts";
import type { RuntimeWorkGraphSnapshot } from "./runtime-work-graph-repository.ts";
import {
  assertWorkIntentContextResolutionManifestMetadata,
  compileWorkIntentContextResolution,
  workIntentContextResolutionMetadata,
} from "./work-intent-context-resolution.ts";

const now = new Date("2026-05-27T00:00:00.000Z");

function graph(): TeamRunGraph {
  return {
    graphId: "graph-workintent-context-resolution-test",
    parentWorkItemId: null,
    rootRuntimeJobId: "runtime-job-test",
    workflowId: "agent_team.coding",
    orchestratorModelRef: "codex.policy.strongest-coding",
    graphStatus: "planned",
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

function workIntentNode(metadata: Record<string, JsonValue>): TeamGraphNode {
  return {
    nodeId: "work-intent-1",
    graphId: "graph-workintent-context-resolution-test",
    nodeKind: "work_intent",
    assignedRole: "implementation_engineer",
    modelOrWorkerRef: "worker.kimi.file-implementation",
    runtimeJobId: null,
    humanTaskId: null,
    inputHandoffRefs: [],
    outputArtifactRefs: [],
    nodeStatus: "planned",
    budgetUsage: {},
    metadata,
    rawLogsStored: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function contextNode(metadata: Record<string, JsonValue>): TeamGraphNode {
  return {
    ...workIntentNode(metadata),
    nodeId: "context-node-1",
    nodeKind: "compiler",
    assignedRole: "context_specialist",
    modelOrWorkerRef: "worker.context-specialist",
    nodeStatus: "succeeded",
  };
}

function snapshot(nodes: TeamGraphNode[], edges: TeamGraphEdge[] = []): RuntimeWorkGraphSnapshot {
  return {
    graph: graph(),
    nodes,
    edges,
    roleInvocations: [],
    handoffPackets: [],
    artifactManifests: [],
    budgetLedgers: [],
    checkpoints: [],
    humanTasks: [],
  };
}

const capabilityManifest = buildRuntimeNodeCapabilityManifest();

describe("compileWorkIntentContextResolution", () => {
  it("satisfies a read-only WorkIntent from node-local ledger refs without graph context nodes", () => {
    const node = workIntentNode({
      workIntentCompiled: true,
      workIntentRef: "work-intent://source-grounding/1",
      workIntentId: "source-grounding-1",
      capabilityId: "repo_context_analysis",
      executionIntent: "source_grounding",
      evidenceMode: ["read_only_evidence", "resource_handoff_evidence"],
      resourceRequirementKinds: ["resource_handoff"],
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRefs: ["artifact://focus/1"],
      nodeResourceDemandStatus: "fulfilled",
      nodeResourceDemandSessionRefs: ["artifact://demand-session/1"],
      nodeResourceDemandFulfillmentRefs: ["artifact://demand-fulfillment/1"],
      nodeResourceLedgerRefs: ["artifact://node-resource-ledger/1"],
      nodeResourceLedgerEntryRefs: ["artifact://node-resource-ledger-entry/1"],
      nodeResourceLedgerEntryPayloadRefs: ["artifact://node-resource-ledger-entry-payload/1"],
      acceptedResourceHandoffRefs: ["artifact://resource-handoff/1"],
    });

    const resolution = compileWorkIntentContextResolution({
      snapshot: snapshot([node]),
      workIntentNode: node,
      capabilityManifest,
    });

    expect(resolution.status).toBe("read_only_satisfied");
    expect(resolution.resourceObjectiveFocusRefs).toEqual(["artifact://focus/1"]);
    expect(resolution.nodeResourceLedgerEntryRefs).toEqual([
      "artifact://node-resource-ledger-entry/1",
    ]);
    expect(resolution.nextLegalTransitions).toEqual([]);
    expect(resolution.reasonCodes).toContain(
      "work_intent_context_resolution_transition_authority_runner_owned",
    );
  });

  it("starts source-edit WorkIntent through worker-owned context instead of pre-worker target selection", () => {
    const node = workIntentNode({
      workIntentCompiled: true,
      workIntentRef: "work-intent://source-edit/1",
      workIntentId: "source-edit-1",
      capabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence"],
      resourceRequirementKinds: ["resource_handoff"],
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRefs: ["artifact://focus/2"],
      nodeResourceDemandStatus: "fulfilled",
      nodeResourceDemandSessionRefs: ["artifact://demand-session/2"],
      nodeResourceDemandFulfillmentRefs: ["artifact://demand-fulfillment/2"],
      nodeResourceLedgerRefs: ["artifact://node-resource-ledger/2"],
      nodeResourceLedgerEntryRefs: ["artifact://node-resource-ledger-entry/2"],
      acceptedResourceHandoffRefs: ["artifact://resource-handoff/2"],
    });

    const resolution = compileWorkIntentContextResolution({
      snapshot: snapshot([node]),
      workIntentNode: node,
      capabilityManifest,
    });

    expect(resolution.status).toBe("worker_action_ready");
    expect(resolution.nextLegalTransitions).toEqual([]);
    expect(resolution.reasonCodes).toContain(
      "pre_worker_resource_demand_retired_for_executable_work_intent",
    );
  });

  it("treats stale direct-demand blockers as diagnostic after specialist fulfillment succeeds", () => {
    const node = workIntentNode({
      workIntentCompiled: true,
      workIntentRef: "work-intent://source-edit/specialist-fulfilled",
      workIntentId: "source-edit-specialist-fulfilled",
      capabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence"],
      resourceRequirementKinds: ["resource_handoff"],
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRefs: ["artifact://focus/specialist"],
      nodeResourceDemandStatus: "fulfilled",
      nodeResourceDemandSessionRefs: ["artifact://demand-session/specialist"],
      nodeResourceDemandBlockerRef: "artifact://demand-blocker/direct-broad-handle",
      nodeResourceDemandBlockerRefs: ["artifact://demand-blocker/direct-broad-handle"],
      nodeResourceDemandFulfillmentRefs: ["artifact://demand-fulfillment/specialist"],
      nodeResourceLedgerRefs: ["artifact://node-resource-ledger/specialist"],
      nodeResourceLedgerEntryRefs: ["artifact://node-resource-ledger-entry/specialist"],
      acceptedResourceHandoffRefs: ["artifact://resource-handoff/specialist"],
    });

    const resolution = compileWorkIntentContextResolution({
      snapshot: snapshot([node]),
      workIntentNode: node,
      capabilityManifest,
    });

    expect(resolution.status).toBe("worker_action_ready");
    expect(resolution.nodeResourceDemandBlockerRefs).toEqual([]);
    expect(resolution.reasonCodes).not.toContain("work_intent_node_resource_demand_blocker_refs_present");
  });

  it("keeps accepted source-edit target selection refs as worker context without making them a pre-worker gate", () => {
    const node = workIntentNode({
      workIntentCompiled: true,
      workIntentRef: "work-intent://source-edit/2",
      workIntentId: "source-edit-2",
      capabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence"],
      resourceRequirementKinds: ["resource_handoff"],
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRefs: ["artifact://focus/3"],
      nodeResourceDemandStatus: "fulfilled",
      nodeResourceDemandSessionRefs: ["artifact://demand-session/3"],
      nodeResourceDemandFulfillmentRefs: ["artifact://demand-fulfillment/3"],
      nodeResourceLedgerRefs: ["artifact://node-resource-ledger/3"],
      nodeResourceLedgerEntryRefs: ["artifact://node-resource-ledger-entry/3"],
      acceptedResourceHandoffRefs: ["artifact://resource-handoff/3"],
      domainResourceSelectionRefs: ["artifact://domain-resource-selection/3"],
      domainResourceSelectionPacketRefs: ["artifact://domain-resource-selection-packet/3"],
      domainResourceSelectionDecisionRefs: ["artifact://domain-resource-selection-decision/3"],
      domainResourceSelectionStatus: "accepted",
      domainResourceSelectionDecisionStatus: "accepted",
    });

    const resolution = compileWorkIntentContextResolution({
      snapshot: snapshot([node]),
      workIntentNode: node,
      capabilityManifest,
    });

    expect(resolution.status).toBe("worker_action_ready");
    expect(resolution.domainResourceSelectionRefs).toEqual(["artifact://domain-resource-selection/3"]);
    expect(resolution.nextLegalTransitions).toEqual([]);
  });

  it("does not let stale or blocked resource selection packet refs unlock source-edit work", () => {
    const node = workIntentNode({
      workIntentCompiled: true,
      workIntentRef: "work-intent://source-edit/stale-packet",
      workIntentId: "source-edit-stale-packet",
      capabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence"],
      resourceRequirementKinds: ["resource_handoff"],
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRefs: ["artifact://focus/stale-packet"],
      nodeResourceDemandStatus: "fulfilled",
      nodeResourceDemandSessionRefs: ["artifact://demand-session/stale-packet"],
      nodeResourceDemandFulfillmentRefs: ["artifact://demand-fulfillment/stale-packet"],
      nodeResourceLedgerRefs: ["artifact://node-resource-ledger/stale-packet"],
      nodeResourceLedgerEntryRefs: ["artifact://node-resource-ledger-entry/stale-packet"],
      acceptedResourceHandoffRefs: ["artifact://resource-handoff/stale-packet"],
      domainResourceSelectionStatus: "blocked",
      domainResourceSelectionDecisionStatus: "blocked",
      domainResourceSelectionPacketStatus: "blocked",
      domainResourceSelectionPacketRefs: ["artifact://domain-resource-selection-packet/stale"],
    });

    const resolution = compileWorkIntentContextResolution({
      snapshot: snapshot([node]),
      workIntentNode: node,
      capabilityManifest,
    });

    expect(resolution.status).toBe("worker_action_ready");
    expect(resolution.domainResourceSelectionPacketRefs).toEqual([]);
    expect(resolution.reasonCodes).toContain(
      "pre_worker_resource_demand_retired_for_executable_work_intent",
    );
  });

  it("ignores stale source-edit target-selection blockers before worker-owned execution starts", () => {
    const node = workIntentNode({
      workIntentCompiled: true,
      workIntentRef: "work-intent://source-edit/accepted-after-blocker",
      workIntentId: "source-edit-accepted-after-blocker",
      capabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence"],
      resourceRequirementKinds: ["resource_handoff"],
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRefs: ["artifact://focus/accepted-after-blocker"],
      nodeResourceDemandStatus: "fulfilled",
      nodeResourceDemandSessionRefs: ["artifact://demand-session/accepted-after-blocker"],
      nodeResourceDemandFulfillmentRefs: ["artifact://demand-fulfillment/accepted-after-blocker"],
      nodeResourceLedgerRefs: ["artifact://node-resource-ledger/accepted-after-blocker"],
      nodeResourceLedgerEntryRefs: ["artifact://node-resource-ledger-entry/accepted-after-blocker"],
      acceptedResourceHandoffRefs: ["artifact://resource-handoff/accepted-after-blocker"],
      domainResourceSelectionStatus: "blocked",
      domainResourceSelectionDecisionStatus: "accepted",
      acceptedDomainResourceSelectionDecisionRefs: [
        "artifact://domain-resource-selection-decision/accepted-after-blocker",
      ],
    });

    const resolution = compileWorkIntentContextResolution({
      snapshot: snapshot([node]),
      workIntentNode: node,
      capabilityManifest,
    });

    expect(resolution.status).toBe("worker_action_ready");
    expect(resolution.reasonCodes).not.toContain("work_intent_domain_resource_selection_blocked");
    expect(resolution.domainResourceSelectionDecisionRefs).toEqual([
      "artifact://domain-resource-selection-decision/accepted-after-blocker",
    ]);
  });

  it("blocks accepted-with-limitations context until a consumer waiver is present", () => {
    const blocked = workIntentNode({
      workIntentCompiled: true,
      workIntentRef: "work-intent://source-grounding/limitations",
      capabilityId: "repo_context_analysis",
      executionIntent: "source_grounding",
      evidenceMode: ["read_only_evidence"],
      resourceRequirementKinds: ["resource_handoff"],
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRefs: ["artifact://focus/4"],
      nodeResourceDemandStatus: "fulfilled",
      nodeResourceDemandSessionRefs: ["artifact://demand-session/4"],
      nodeResourceDemandFulfillmentRefs: ["artifact://demand-fulfillment/4"],
      nodeResourceLedgerRefs: ["artifact://node-resource-ledger/4"],
      nodeResourceLedgerEntryRefs: ["artifact://node-resource-ledger-entry/4"],
      acceptedWithLimitationsResourceHandoffRefs: ["artifact://limited-handoff/4"],
    });

    const blockedResolution = compileWorkIntentContextResolution({
      snapshot: snapshot([blocked]),
      workIntentNode: blocked,
      capabilityManifest,
    });

    expect(blockedResolution.status).toBe("blocked");
    expect(blockedResolution.reasonCodes).toContain(
      "work_intent_context_accepted_with_limitations_waiver_missing",
    );

    const waived = workIntentNode({
      ...(blocked.metadata as Record<string, JsonValue>),
      contextLimitationWaiverRefs: ["artifact://limitation-waiver/4"],
    });
    const waivedResolution = compileWorkIntentContextResolution({
      snapshot: snapshot([waived]),
      workIntentNode: waived,
      capabilityManifest,
    });

    expect(waivedResolution.status).toBe("read_only_satisfied");
  });

  it("does not let legacy graph resource-fulfillment edges satisfy context unless explicitly workflow-defined", () => {
    const node = workIntentNode({
      workIntentCompiled: true,
      workIntentRef: "work-intent://legacy-context/1",
      capabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence"],
      resourceRequirementKinds: ["resource_handoff"],
    });
    const legacyContext = contextNode({
      acceptedResourceHandoffRefs: ["artifact://legacy-resource-handoff/1"],
    });
    const edge = {
      edgeId: "edge-context-supplies-1",
      graphId: "graph-workintent-context-resolution-test",
      fromNodeId: legacyContext.nodeId,
      toNodeId: node.nodeId,
      edgeKind: "context_supplies",
      reasonCodes: ["legacy_fixture"],
      artifactRefs: ["artifact://legacy-resource-handoff/1"],
      metadata: {},
      createdAt: now,
    } as unknown as TeamGraphEdge;

    const resolution = compileWorkIntentContextResolution({
      snapshot: snapshot([node, legacyContext], [edge]),
      workIntentNode: node,
      capabilityManifest,
    });

    expect(resolution.status).toBe("worker_action_ready");
    expect(resolution.acceptedResourceHandoffRefs).toEqual([]);
    expect(resolution.legacyResourceSupplyObservationCount).toBe(1);
    expect(resolution.reasonCodes).toContain(
      "legacy_resource_fulfillment_observations_ignored_without_explicit_workflow_coordination",
    );
  });

  it("keeps an open demand blocker on the specialist lifecycle instead of collapsing to global repair", () => {
    const node = workIntentNode({
      workIntentCompiled: true,
      workIntentRef: "work-intent://source-grounding/demand-blocked",
      capabilityId: "repo_context_analysis",
      executionIntent: "source_grounding",
      evidenceMode: ["read_only_evidence"],
      resourceRequirementKinds: ["resource_handoff"],
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRefs: ["runtime-job://job/resource-objective-focus/accepted"],
      nodeResourceDemandStatus: "blocked",
      nodeResourceDemandSessionRefs: ["runtime-job://job/node-resource-demand/session"],
      nodeResourceDemandBlockerRefs: ["runtime-job://job/node-resource-demand/blocker"],
    });

    const resolution = compileWorkIntentContextResolution({
      snapshot: snapshot([node]),
      workIntentNode: node,
      capabilityManifest,
    });

    expect(resolution.status).toBe("resource_demand_blocked");
    expect(resolution.nextLegalTransitions).toEqual([]);
    expect(resolution.reasonCodes).toContain("work_intent_node_resource_demand_blocker_refs_present");
  });

  it("does not run pre-worker specialist narrowing for source-edit WorkIntents", () => {
    const node = workIntentNode({
      workIntentCompiled: true,
      workIntentRef: "work-intent://source-edit/narrowing",
      capabilityId: "implementation_microtask",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence"],
      resourceRequirementKinds: ["resource_handoff"],
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRefs: ["runtime-job://job/resource-objective-focus/accepted"],
      nodeResourceDemandStatus: "open",
      nodeResourceDemandSessionRefs: ["runtime-job://job/node-resource-demand/session"],
      contextScoutSpecialistStatus: "dispatch_ready",
      contextScoutSpecialistRequestRef:
        "runtime-job://job/context-scout-specialist/request/narrowing",
    });

    const resolution = compileWorkIntentContextResolution({
      snapshot: snapshot([node]),
      workIntentNode: node,
      capabilityManifest,
    });

    expect(resolution.status).toBe("worker_action_ready");
    expect(resolution.reasonCodes).toContain(
      "pre_worker_resource_demand_retired_for_executable_work_intent",
    );
    expect(resolution.reasonCodes).not.toContain("work_intent_node_resource_demand_blocker_refs_present");
  });

  it("keeps WorkIntent context metadata manifest-only", () => {
    const node = workIntentNode({
      workIntentCompiled: true,
      workIntentRef: "work-intent://source-grounding/manifest",
      capabilityId: "repo_context_analysis",
      executionIntent: "source_grounding",
      evidenceMode: ["read_only_evidence"],
      resourceRequirementKinds: ["resource_handoff"],
      resourceObjectiveFocusStatus: "accepted",
      resourceObjectiveFocusRefs: ["artifact://focus/manifest"],
      nodeResourceDemandStatus: "fulfilled",
      nodeResourceDemandSessionRefs: ["artifact://demand-session/manifest"],
      nodeResourceDemandFulfillmentRefs: ["artifact://demand-fulfillment/manifest"],
      nodeResourceLedgerRefs: ["artifact://node-resource-ledger/manifest"],
      nodeResourceLedgerEntryRefs: Array.from(
        { length: 120 },
        (_, index) => `artifact://node-resource-ledger-entry/${index}`,
      ),
      nodeResourceLedgerEntryPayloadRefs: Array.from(
        { length: 120 },
        (_, index) => `artifact://node-resource-ledger-entry-payload/${index}`,
      ),
      acceptedResourceHandoffRefs: ["artifact://resource-handoff/manifest"],
    });

    const resolution = compileWorkIntentContextResolution({
      snapshot: snapshot([node]),
      workIntentNode: node,
      capabilityManifest,
    });
    const metadata = workIntentContextResolutionMetadata(resolution);

    expect(Buffer.byteLength(JSON.stringify(metadata), "utf8")).toBeLessThan(12_000);
    expect(JSON.stringify(metadata)).not.toContain("lineNumberedContent");
    expect(() => assertWorkIntentContextResolutionManifestMetadata(metadata)).not.toThrow();
    expect(() =>
      assertWorkIntentContextResolutionManifestMetadata({
        body: "this would be an artifact payload, not graph metadata",
      }),
    ).toThrow(/manifest_body_field/);
  });
});
