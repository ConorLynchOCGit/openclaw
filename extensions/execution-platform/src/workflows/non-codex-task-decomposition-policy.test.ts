import { describe, expect, it } from "vitest";
import { normalizeMissionContractLedger } from "./mission-contract-ledger.ts";
import {
  validateNonCodexTaskDecompositionDecision,
  type NonCodexTaskFamily,
} from "./non-codex-task-decomposition-policy.ts";
import type { OrchestratorGraphDecision } from "./orchestrator-graph-decision.ts";
import { buildRuntimeNodeCapabilityManifest } from "./runtime-node-capability-registry.ts";
import type { RuntimeWorkGraphSchedulerSnapshotSummary } from "./runtime-work-graph-scheduler-contracts.ts";

function snapshot(): RuntimeWorkGraphSchedulerSnapshotSummary {
  return {
    workflowId: "agent_team.coding",
    graphStatus: "running",
    nodeSummaries: [],
    edgeCount: 0,
    humanTaskCount: 0,
    latestCheckpointKinds: [],
  };
}

function complexLedger() {
  return normalizeMissionContractLedger({
    missionId: "non-codex-decomposition-policy-test",
    ownerObjectiveSummary: "Find context, edit code, validate the change, and review it.",
    value: {
      blockingCommitments: [
        {
          commitmentId: "context",
          commitmentText: "Find relevant context.",
          whyItMatters: "The implementation needs bounded file refs.",
          expectedEvidenceDescription: "Context handoff refs.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "implementation",
          commitmentText: "Edit source.",
          whyItMatters: "The owner requested source changes.",
          expectedEvidenceDescription: "Changed-file refs.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "validation",
          commitmentText: "Run focused validation.",
          whyItMatters: "The owner requested proof.",
          expectedEvidenceDescription: "Validation refs.",
          status: "pending",
          blocking: true,
        },
      ],
    },
  });
}

function decision(input: Partial<OrchestratorGraphDecision>): OrchestratorGraphDecision {
  return {
    decisionId: "decision",
    decisionKind: "add_nodes",
    rationaleForDecision: "Decompose the mission into bounded child tasks.",
    newNodes: [],
    newEdges: [],
    reasonCodes: [],
    metadata: null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
    ...input,
  };
}

function nonCodexMetadata(input: {
  taskFamily: NonCodexTaskFamily;
  selectedModelQualificationProfileId: string;
}) {
  return {
    taskFamily: input.taskFamily,
    selectedModelQualificationProfileId: input.selectedModelQualificationProfileId,
    qualificationEvidenceRefs: [
      ".artifacts/execution-platform/model-agnostic-worker-qualification-matrix.json",
    ],
    consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
    utilityRationale: "This is the smallest sufficiently capable worker for the commitment.",
    costRationale: "The selected non-Codex lane is cheaper than Codex for this bounded task.",
    whyThisIsNotDuplicateWork: "No prior node has attempted this exact task.",
    expectedEvidence: ["source_change"],
    stopOrEscalationCondition: "Escalate to Codex if validation fails after bounded repair.",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

describe("non-Codex task decomposition policy", () => {
  it("rejects a first broad Codex implementation for complex coding missions", () => {
    const validation = validateNonCodexTaskDecompositionDecision({
      decision: decision({
        newNodes: [
          {
            nodeId: "codex-do-everything",
            nodeKind: "implementation",
            capabilityId: "implementation_complex",
            assignedRole: "implementation_engineer",
            commitmentIdsAdvanced: ["context", "implementation", "validation"],
            whyThisRoleIsNeededNow: "Implementation is needed.",
            exactObjective: "Do all work in one broad node.",
            evidenceExpectation: "All evidence.",
            expectedOutput: "Finished implementation.",
            acceptanceCriteria: ["Edits and validates."],
            downstreamConsumer: "closeout",
          },
        ],
      }),
      snapshotSummary: snapshot(),
      missionLedger: complexLedger(),
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "non_codex_decomposition_codex_broad_first_for_complex_mission",
        "non_codex_decomposition_edges_or_parallel_justification_missing",
        "non_codex_decomposition_codex_escalation_missing_cheaper_option_rationale:codex-do-everything",
      ]),
    );
  });

  it("allows discovery-first decomposition when commitments are covered by planned later work", () => {
    const validation = validateNonCodexTaskDecompositionDecision({
      decision: decision({
        newNodes: [
          {
            nodeId: "context-runtime",
            nodeKind: "context_scout",
            capabilityId: "context_scout",
            assignedRole: "context_scout",
            commitmentIdsAdvanced: ["context"],
            whyThisRoleIsNeededNow: "Context lowers implementation uncertainty.",
            exactObjective: "Find runtime graph files and scheduler touch points.",
            evidenceExpectation: "Context handoff refs.",
            expectedOutput: "Bounded context refs.",
            acceptanceCriteria: ["Names target files."],
            downstreamConsumer: "orchestrator",
          },
          {
            nodeId: "context-readback",
            nodeKind: "context_scout",
            capabilityId: "context_scout",
            assignedRole: "context_scout",
            commitmentIdsAdvanced: ["implementation"],
            whyThisRoleIsNeededNow: "Readback context is needed before choosing edit nodes.",
            exactObjective: "Find Work Queue readback files and integration risks.",
            evidenceExpectation: "Readback context handoff refs.",
            expectedOutput: "Bounded readback refs.",
            acceptanceCriteria: ["Names target files."],
            downstreamConsumer: "orchestrator",
          },
        ],
        metadata: {
          parallelIndependentNodesJustification:
            "The two context scouts inspect disjoint surfaces before implementation.",
          plannedLaterCommitmentIds: ["validation"],
        },
      }),
      snapshotSummary: snapshot(),
      missionLedger: complexLedger(),
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });

    expect(validation.valid).toBe(true);
    expect(validation.reasonCodes).toEqual([]);
  });

  it("rejects non-Codex child tasks without task family and qualification evidence", () => {
    const validation = validateNonCodexTaskDecompositionDecision({
      decision: decision({
        newNodes: [
          {
            nodeId: "kimi-without-contract",
            nodeKind: "implementation",
            capabilityId: "implementation_microtask",
            assignedRole: "implementation_engineer",
            commitmentIdsAdvanced: ["implementation"],
            whyThisRoleIsNeededNow: "A bounded edit is required.",
            exactObjective: "Make a scoped source edit.",
            evidenceExpectation: "Changed-file refs.",
            expectedOutput: "Changed-file refs.",
            acceptanceCriteria: ["Records source-change evidence."],
            downstreamConsumer: "test_engineer",
          },
        ],
        metadata: { parallelIndependentNodesJustification: "Single-node repair lane." },
      }),
      snapshotSummary: {
        ...snapshot(),
        nodeSummaries: [
          {
            nodeId: "context",
            nodeKind: "context_scout",
            assignedRole: "context_scout",
            nodeStatus: "succeeded",
            outputArtifactRefs: [],
          },
        ],
      },
      missionLedger: complexLedger(),
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "non_codex_decomposition_task_family_missing:kimi-without-contract",
        "non_codex_decomposition_qualification_profile_missing:kimi-without-contract",
        "non_codex_decomposition_qualification_evidence_missing:kimi-without-contract",
        "non_codex_decomposition_stop_or_escalation_missing:kimi-without-contract",
      ]),
    );
  });

  it("accepts a qualified non-Codex decomposition with explicit edges and commitment mappings", () => {
    const validation = validateNonCodexTaskDecompositionDecision({
      decision: decision({
        newNodes: [
          {
            nodeId: "context-1",
            nodeKind: "context_scout",
            capabilityId: "non_codex_context_scout",
            assignedRole: "context_scout",
            commitmentIdsAdvanced: ["context"],
            whyThisRoleIsNeededNow: "Context lowers uncertainty before editing.",
            exactObjective: "Find target files and summarize edit points.",
            evidenceExpectation: "Context handoff refs.",
            expectedOutput: "Bounded context refs.",
            acceptanceCriteria: ["Names target files and risks."],
            downstreamConsumer: "implementation-1",
            metadata: nonCodexMetadata({
              taskFamily: "repo_context_scout",
              selectedModelQualificationProfileId: "openrouter.deepseek.deepseek-v4-flash",
            }),
          },
          {
            nodeId: "implementation-1",
            nodeKind: "implementation",
            capabilityId: "implementation_microtask",
            assignedRole: "implementation_engineer",
            commitmentIdsAdvanced: ["implementation"],
            whyThisRoleIsNeededNow: "Kimi is qualified for the scoped source edit.",
            exactObjective: "Make the smallest source edit from the context handoff.",
            evidenceExpectation: "Changed-file refs.",
            expectedOutput: "Patch evidence and validation refs.",
            acceptanceCriteria: ["Edits approved file refs only."],
            downstreamConsumer: "validation-1",
            metadata: nonCodexMetadata({
              taskFamily: "small_source_edit",
              selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
            }),
          },
          {
            nodeId: "validation-1",
            nodeKind: "test_review",
            capabilityId: "non_codex_validation_failure_explainer",
            assignedRole: "test_engineer",
            commitmentIdsAdvanced: ["validation"],
            whyThisRoleIsNeededNow: "A cheap validation explainer can interpret bounded failures.",
            exactObjective: "Review validation refs and explain repair needs.",
            evidenceExpectation: "Validation explanation refs.",
            expectedOutput: "Validation failure or success explanation.",
            acceptanceCriteria: ["Cites validation refs."],
            downstreamConsumer: "orchestrator",
            metadata: nonCodexMetadata({
              taskFamily: "validation_failure_explanation",
              selectedModelQualificationProfileId: "openrouter.deepseek.deepseek-v4-flash",
            }),
          },
        ],
        newEdges: [
          { fromNodeId: "context-1", toNodeId: "implementation-1", edgeKind: "handoff" },
          { fromNodeId: "implementation-1", toNodeId: "validation-1", edgeKind: "handoff" },
        ],
      }),
      snapshotSummary: snapshot(),
      missionLedger: complexLedger(),
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });

    expect(validation.valid).toBe(true);
    expect(validation.reasonCodes).toEqual([]);
  });

  it("accepts nested utility target commitments and stop conditions from model-style node metadata", () => {
    const validation = validateNonCodexTaskDecompositionDecision({
      decision: decision({
        newNodes: [
          {
            nodeId: "kimi-nested-utility",
            nodeKind: "implementation",
            capabilityId: "implementation_microtask",
            assignedRole: "implementation_engineer",
            whyThisRoleIsNeededNow: "A cheaper implementation lane can handle this scoped edit.",
            exactObjective: "Apply the bounded edit described by the context handoff.",
            evidenceExpectation: "Changed-file refs and validation refs.",
            expectedOutput: "Patch evidence and validation result refs.",
            acceptanceCriteria: ["Only approved files are edited."],
            downstreamConsumer: "validation-1",
            metadata: {
              taskFamily: "small_source_edit",
              selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
              qualificationEvidenceRefs: [
                ".artifacts/execution-platform/model-agnostic-worker-qualification-matrix.json",
              ],
              costAwareUtilityDecision: {
                selectedCapabilityId: "implementation_microtask",
                targetCommitmentIds: ["implementation"],
                utilityRationale: "The node advances a bounded implementation commitment.",
                costRationale: "Kimi is cheaper than Codex for this scoped edit.",
                stopOrEscalationCondition:
                  "Escalate to Codex if validation fails after one bounded repair.",
              },
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          },
        ],
        metadata: {
          parallelIndependentNodesJustification:
            "This is a post-context implementation node with no parallel dependency.",
        },
      }),
      snapshotSummary: {
        ...snapshot(),
        nodeSummaries: [
          {
            nodeId: "context",
            nodeKind: "context_scout",
            assignedRole: "context_scout",
            nodeStatus: "succeeded",
            outputArtifactRefs: ["context-handoff://runtime"],
          },
        ],
      },
      missionLedger: complexLedger(),
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    });

    expect(validation.valid).toBe(true);
    expect(validation.reasonCodes).toEqual([]);
  });
});
