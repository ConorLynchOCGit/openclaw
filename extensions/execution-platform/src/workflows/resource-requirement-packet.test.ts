import { describe, expect, it } from "vitest";
import { buildContextBrokerRequest } from "./context-broker.ts";
import {
  buildResourceObjectiveFocusLegalRefUniverse,
  compileResourceObjectiveFocus,
} from "./resource-objective-focus.ts";
import {
  RESOURCE_REQUIREMENT_PACKET_SCHEMA_VERSION,
  buildResourceRequirementPacketManifest,
  compileResourceRequirementPacketFromBrokerRequest,
} from "./resource-requirement-packet.ts";

function brokerRequest() {
  return buildContextBrokerRequest({
    runtimeJobId: "job-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    requestingNodeId: "work-intent-1",
    consumerNodeId: "impl-1",
    targetCommitmentIds: ["commitment-1"],
    requiredResourceKind: "resource_handoff",
    neededByPhase: "resource_demand",
    semanticQuestion: "Which files and tests must the implementation inspect before editing?",
    candidateResourceRefs: ["extensions/execution-platform/src/workflows/context-broker.ts"],
    inheritedContextRefs: [],
    knownContextRefs: [],
    missingContextReasonCodes: ["node_resource_fulfillment_missing"],
    blockingLimitations: ["Node-scoped context handoff is missing."],
    blockingIfMissing: true,
    inheritedContextUsable: false,
    budgetClass: "cheap",
  });
}

function acceptedFocus() {
  const legalRefUniverse = buildResourceObjectiveFocusLegalRefUniverse({
    runtimeJobId: "job-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    consumerNodeId: "impl-1",
    workIntentRef: "runtime-work-graph://graph-1/node/work-intent-1",
    nodeExecutionContractRef: "runtime-work-graph://graph-1/node-contract/impl-1",
    sourceContextBrokerRequestRef: brokerRequest().requestRef,
    refs: [
      {
        ref: "extensions/execution-platform/src/workflows/context-broker.ts",
        kind: "candidate_resource_ref",
        boundedLabel: "Context broker implementation",
      },
      {
        ref: "pnpm test:file resource-requirement-packet.test.ts",
        kind: "validation_ref",
        boundedLabel: "Focused resource requirement test",
      },
    ],
    maxSelectableHandles: 2,
    maxSemanticQuestions: 2,
  });
  const resourceObjectiveFocus = compileResourceObjectiveFocus({
    runtimeJobId: "job-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    consumerNodeId: "impl-1",
    workIntentRef: "runtime-work-graph://graph-1/node/work-intent-1",
    nodeExecutionContractRef: "runtime-work-graph://graph-1/node-contract/impl-1",
    currentObjectiveSlot: "domain-resource-selection-context",
    resourceUseKind: "domain_resource_selection",
    nextUnknown: "Which exact implementation target files should be inspected?",
    expectedUse: "Compile a narrow resource requirement for the consumer node.",
    legalRefUniverse,
    selectedRefHandles: legalRefUniverse.handles.map((handle) => handle.handle),
    selectedSemanticQuestions: ["Find the exact implementation target files."],
  });
  return { resourceObjectiveFocus, legalRefUniverse };
}

describe("ResourceRequirementPacket", () => {
  it("compiles a payload-backed consumer-scoped resource requirement from broker request evidence", () => {
    const focus = acceptedFocus();
    const result = compileResourceRequirementPacketFromBrokerRequest({
      request: brokerRequest(),
      workIntentRef: "runtime-work-graph://graph-1/node/work-intent-1",
      consumerBranchId: "branch-1",
      downstreamCapabilityId: "implementation.qwen.scoped_patch",
      downstreamExecutionIntent: "source_edit",
      downstreamEvidenceMode: ["changed_file_evidence", "validation_evidence"],
      contextPurpose: "consumer_scoped_resource_handoff",
      semanticQuestions: ["Find the exact implementation target files."],
      requiredResourceKinds: ["resource_handoff", "repo_context", "validation_refs"],
      knownTargetRefs: ["extensions/execution-platform/src/workflows/context-broker.ts"],
      knownValidationNeedRefs: ["pnpm test:file resource-requirement-packet.test.ts"],
      ...focus,
    });

    expect(result.status).toBe("ready");
    expect(result.packet.schemaVersion).toBe(RESOURCE_REQUIREMENT_PACKET_SCHEMA_VERSION);
    expect(result.packet.consumerNodeId).toBe("impl-1");
    expect(result.packet.workIntentRef).toBe("runtime-work-graph://graph-1/node/work-intent-1");
    expect(result.packet.downstreamExecutionIntent).toBe("source_edit");
    expect(result.packet.downstreamEvidenceMode).toEqual(
      expect.arrayContaining(["changed_file_evidence", "validation_evidence"]),
    );
    expect(result.packet.contextAcceptanceContract.requiredHandoffFields).toContain(
      "handoffSummaryForImplementation",
    );
    expect(result.packet.resourceObjectiveFocusRef).toBe(focus.resourceObjectiveFocus.focusRef);
    expect(result.packet.legalRefUniverseRef).toBe(focus.legalRefUniverse.legalRefUniverseRef);
    expect(result.packet.knownTargetRefs).toEqual([
      "extensions/execution-platform/src/workflows/context-broker.ts",
    ]);
    expect(result.packet.knownValidationNeedRefs).toEqual([
      "pnpm test:file resource-requirement-packet.test.ts",
    ]);
    expect(result.packet.limitationPolicy.acceptedWithLimitationsRequiresConsumerWaiver).toBe(
      true,
    );
    expect(result.packet.rawPromptStored).toBe(false);
    expect(result.packet.rawProviderLogStored).toBe(false);
  });

  it("blocks when the downstream executable semantics are not explicitly supplied", () => {
    const result = compileResourceRequirementPacketFromBrokerRequest({
      request: brokerRequest(),
      workIntentRef: null,
      downstreamCapabilityId: null,
      downstreamExecutionIntent: null,
      downstreamEvidenceMode: [],
    });

    expect(result.status).toBe("blocked");
    expect(result.reasonCodes).toContain("resource_requirement_accepted_focus_missing");
    expect(result.reasonCodes).toContain("resource_requirement_work_intent_ref_missing");
    expect(result.reasonCodes).toContain(
      "resource_requirement_downstream_capability_id_missing",
    );
    expect(result.reasonCodes).toContain(
      "resource_requirement_downstream_execution_intent_missing",
    );
    expect(result.reasonCodes).toContain("resource_requirement_downstream_evidence_mode_missing");
  });

  it("blocks broad broker payload construction until an accepted ResourceObjectiveFocus exists", () => {
    const result = compileResourceRequirementPacketFromBrokerRequest({
      request: brokerRequest(),
      workIntentRef: "runtime-work-graph://graph-1/node/work-intent-1",
      downstreamCapabilityId: "implementation.qwen.scoped_patch",
      downstreamExecutionIntent: "source_edit",
      downstreamEvidenceMode: ["changed_file_evidence"],
      knownTargetRefs: ["extensions/execution-platform/src/workflows/context-broker.ts"],
      semanticQuestions: [
        "This broad question must not be copied into a ready requirement without focus.",
      ],
    });

    expect(result.status).toBe("blocked");
    expect(result.packet.semanticQuestions).toEqual([]);
    expect(result.packet.candidateRepoAreaRefs).toEqual([]);
    expect(result.packet.knownTargetRefs).toEqual([]);
    expect(result.reasonCodes).toContain("resource_requirement_accepted_focus_missing");
    expect(result.reasonCodes).toContain(
      "resource_requirement_packet_blocked_without_resource_objective_focus",
    );
  });

  it("returns a bounded manifest without the packet body", () => {
    const focus = acceptedFocus();
    const result = compileResourceRequirementPacketFromBrokerRequest({
      request: brokerRequest(),
      workIntentRef: "runtime-work-graph://graph-1/node/work-intent-1",
      downstreamCapabilityId: "implementation.qwen.scoped_patch",
      downstreamExecutionIntent: "source_edit",
      downstreamEvidenceMode: ["changed_file_evidence"],
      knownTargetRefs: ["extensions/execution-platform/src/workflows/context-broker.ts"],
      ...focus,
    });
    const manifest = buildResourceRequirementPacketManifest(result.packet);

    expect(manifest.resourceRequirementRef).toBe(result.packet.resourceRequirementRef);
    expect(manifest.semanticQuestionCount).toBeGreaterThan(0);
    expect(manifest.knownTargetRefCount).toBeGreaterThan(0);
    expect(manifest).not.toHaveProperty("semanticQuestions");
    expect(manifest).not.toHaveProperty("knownTargetRefs");
    expect(manifest.resourceObjectiveFocusRef).toBe(focus.resourceObjectiveFocus.focusRef);
    expect(manifest.rawPromptStored).toBe(false);
  });
});
