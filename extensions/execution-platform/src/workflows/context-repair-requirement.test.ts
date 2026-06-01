import { describe, expect, it } from "vitest";
import {
  compileContextRepairRequirement,
  contextRepairRequirementMetadata,
  evaluateContextRepairConsumerWiring,
  evaluateContextRepairNodeExecutionGate,
} from "./context-repair-requirement.ts";
import {
  buildResourceObjectiveFocusLegalRefUniverse,
  compileResourceObjectiveFocus,
} from "./resource-objective-focus.ts";

function acceptedRepairFocus(input: {
  runtimeJobId?: string;
  workflowId?: string;
  graphId?: string;
  consumerNodeId?: string;
  workIntentRef?: string;
  refs?: string[];
  question?: string;
}) {
  const runtimeJobId = input.runtimeJobId ?? "job-context-repair";
  const workflowId = input.workflowId ?? "workflow-neutral";
  const graphId = input.graphId ?? "graph-neutral";
  const consumerNodeId = input.consumerNodeId ?? "consumer-implementation-node";
  const workIntentRef =
    input.workIntentRef ?? "runtime-work-graph://graph-neutral/work-intent/source-edit-1";
  const refs = input.refs ?? ["src/runtime/example.ts", "tests/runtime/example.test.ts"];
  const legalRefUniverse = buildResourceObjectiveFocusLegalRefUniverse({
    runtimeJobId,
    workflowId,
    graphId,
    consumerNodeId,
    workIntentRef,
    nodeExecutionContractRef: "runtime-work-graph://graph-neutral/node-contract/consumer-implementation-node",
    refs: refs.map((ref, index) => ({
      ref,
      kind: index === refs.length - 1 && ref.includes("test") ? "validation_ref" : "target_ref",
      boundedLabel: ref,
    })),
    maxSelectableHandles: 4,
    maxSemanticQuestions: 2,
  });
  const resourceObjectiveFocus = compileResourceObjectiveFocus({
    runtimeJobId,
    workflowId,
    graphId,
    consumerNodeId,
    workIntentRef,
    nodeExecutionContractRef: "runtime-work-graph://graph-neutral/node-contract/consumer-implementation-node",
    currentObjectiveSlot: "context-repair",
    resourceUseKind: "domain_resource_selection",
    nextUnknown:
      input.question ??
      "Which concrete source files and validation commands are required before this source edit can safely run?",
    expectedUse: "Compile a focused context repair requirement for the declared consumer.",
    legalRefUniverse,
    selectedRefHandles: legalRefUniverse.handles.map((handle) => handle.handle),
    selectedSemanticQuestions: [
      input.question ??
        "Which concrete source files and validation commands are required before this source edit can safely run?",
    ],
  });
  return { resourceObjectiveFocus, legalRefUniverse };
}

function readyRepairRequirement() {
  const focus = acceptedRepairFocus({});
  return compileContextRepairRequirement({
    runtimeJobId: "job-context-repair",
    workflowId: "workflow-neutral",
    graphId: "graph-neutral",
    repairNodeId: "repair-context-node",
    failedConsumerNodeId: "consumer-implementation-node",
    consumerBranchId: "branch-consumer",
    workIntentRef: "runtime-work-graph://graph-neutral/work-intent/source-edit-1",
    targetCommitmentIds: ["commitment-1"],
    downstreamCapabilityId: "capability.source-edit.local",
    downstreamExecutionIntent: "source_edit",
    downstreamEvidenceMode: ["changed_file_evidence", "validation_evidence"],
    contextPurpose: "consumer scoped file and validation context repair",
    semanticQuestions: [
      "Which concrete source files and validation commands are required before this source edit can safely run?",
    ],
    missingFields: ["targetFileSnapshots", "validationRefs"],
    reasonCodes: ["node_readiness_target_snapshots_missing"],
    schemaPaths: ["nodeReadinessState.targetFileSnapshots"],
    policyPaths: ["readiness.context.targetSnapshots"],
    candidateResourceRefs: ["src/runtime/example.ts", "tests/runtime/example.test.ts"],
    ...focus,
    requiredResourceKinds: ["context_repair", "repo_context", "validation_refs"],
    downstreamTransition: "retry_declared_consumer",
  });
}

describe("ContextRepairRequirement", () => {
  it("compiles a consumer-aware repair requirement, broker request, and requirement packet", () => {
    const result = readyRepairRequirement();

    expect(result.status).toBe("ready");
    expect(result.canUnlockConsumer).toBe(true);
    expect(result.packet.failedConsumerNodeId).toBe("consumer-implementation-node");
    expect(result.packet.resourceRequirementStatus).toBe("ready");
    expect(result.contextBrokerRequest.requiredResourceKind).toBe("resource_repair");
    expect(result.resourceRequirement.packet.consumerNodeId).toBe("consumer-implementation-node");
    expect(result.nodeMetadata).toMatchObject({
      runtimeOwnedContextRepairNode: true,
      contextRepairConsumerNodeId: "consumer-implementation-node",
      contextRepairCanUnlockConsumer: true,
      contextRepairLifecycle: "consumer_blocking",
    });
    expect(contextRepairRequirementMetadata(result.packet)).toMatchObject({
      repairRequirementRef: result.packet.repairRequirementRef,
      resourceRequirementRef: result.packet.resourceRequirementRef,
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });

  it("requires model-authored semantic questions before a repair can be ready", () => {
    const result = compileContextRepairRequirement({
      runtimeJobId: "job-context-repair",
      workflowId: "workflow-neutral",
      graphId: "graph-neutral",
      repairNodeId: "repair-context-node",
      failedConsumerNodeId: "consumer-implementation-node",
      workIntentRef: "runtime-work-graph://graph-neutral/work-intent/source-edit-1",
      targetCommitmentIds: ["commitment-1"],
      downstreamCapabilityId: "capability.source-edit.local",
      downstreamExecutionIntent: "source_edit",
      downstreamEvidenceMode: ["changed_file_evidence"],
      contextPurpose: "consumer scoped context repair",
      semanticQuestions: [],
    });

    expect(result.status).toBe("blocked");
    expect(result.canDispatchContextScout).toBe(false);
    expect(result.reasonCodes).toContain("resource_repair_semantic_questions_missing");
  });

  it("rejects zero-edge production repair wiring", () => {
    const wiring = evaluateContextRepairConsumerWiring({
      repairNodeId: "repair-context-node",
      consumerNodeId: "consumer-implementation-node",
      edges: [],
    });

    expect(wiring.status).toBe("blocked");
    expect(wiring.canUnlockConsumer).toBe(false);
    expect(wiring.reasonCodes).toContain("resource_repair_consumer_edge_missing");
  });

  it("allows diagnostic-only repair visibility without letting it unlock a consumer", () => {
    const focus = acceptedRepairFocus({
      workIntentRef: "runtime-work-graph://graph-neutral/work-intent/source-grounding-1",
      refs: ["src/runtime/example.ts"],
      question: "Which repo evidence explains the blocked consumer?",
    });
    const result = compileContextRepairRequirement({
      runtimeJobId: "job-context-repair",
      workflowId: "workflow-neutral",
      graphId: "graph-neutral",
      repairNodeId: "repair-context-node",
      failedConsumerNodeId: "consumer-implementation-node",
      workIntentRef: "runtime-work-graph://graph-neutral/work-intent/source-grounding-1",
      targetCommitmentIds: ["commitment-1"],
      downstreamCapabilityId: "capability.context.inspect",
      downstreamExecutionIntent: "source_grounding",
      downstreamEvidenceMode: ["read_only_evidence"],
      contextPurpose: "diagnostic context inspection",
      semanticQuestions: ["Which repo evidence explains the blocked consumer?"],
      diagnosticOnly: true,
      ...focus,
    });

    expect(result.status).toBe("diagnostic_only");
    expect(result.canUnlockConsumer).toBe(false);
    expect(result.packet.canUnlockConsumer).toBe(false);

    const wiring = evaluateContextRepairConsumerWiring({
      repairNodeId: "repair-context-node",
      consumerNodeId: "consumer-implementation-node",
      diagnosticOnly: true,
      edges: [],
    });
    expect(wiring.status).toBe("diagnostic_only");
    expect(wiring.canUnlockConsumer).toBe(false);
  });

  it("blocks context repair execution when the requirement packet or consumer edge is missing", () => {
    const blocked = evaluateContextRepairNodeExecutionGate({
      node: {
        nodeId: "repair-context-node",
        nodeKind: "repair",
        inputHandoffRefs: [],
        metadata: {
          runtimeOwnedContextRepairNode: true,
          contextBrokerRequestRef: "runtime-job://job/context-broker/request",
          contextRepairConsumerNodeId: "consumer-implementation-node",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      },
      edges: [],
    });

    expect(blocked.status).toBe("blocked");
    expect(blocked.reasonCodes).toEqual(
      expect.arrayContaining([
        "resource_repair_requirement_packet_ref_missing",
        "resource_repair_consumer_edge_missing",
      ]),
    );
  });

  it("allows a production repair node only with requirement ref, broker ref, and declared consumer edge", () => {
    const result = readyRepairRequirement();
    const gate = evaluateContextRepairNodeExecutionGate({
      node: {
        nodeId: "repair-context-node",
        nodeKind: "repair",
        inputHandoffRefs: [result.packet.resourceRequirementRef],
        metadata: result.nodeMetadata,
      },
      edges: [
        {
          fromNodeId: "repair-context-node",
          toNodeId: "consumer-implementation-node",
          edgeKind: "handoff",
        },
      ],
    });

    expect(gate.status).toBe("allowed");
    expect(gate.canUnlockConsumer).toBe(true);
    expect(gate.resourceRequirementRefs).toContain(result.packet.resourceRequirementRef);
  });
});
