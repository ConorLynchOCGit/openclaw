import { describe, expect, it } from "vitest";
import {
  buildContextScoutPromptFromExecutionPacket,
  compileContextScoutExecutionPacket,
} from "./context-scout-execution-packet.ts";
import { CommitmentWorkPacketSchema, type CommitmentWorkPacket } from "./mission-work-packets.ts";

function packet(overrides: Partial<CommitmentWorkPacket> = {}): CommitmentWorkPacket {
  return CommitmentWorkPacketSchema.parse({
    packetKind: "commitment_work_packet",
    schemaVersion: "execution-platform.commitment-work-packet.v1",
    authoringSource: "model_authored",
    qualityStatus: "accepted",
    packetId: "packet-1",
    packetRef: "runtime-work-graph://packet/packet-1",
    missionId: "mission-1",
    commitmentId: "commitment-1",
    commitmentText: "Implement the context scout execution packet.",
    commitmentMeaning: "Context scouts need bounded worker-ready input.",
    ownerIntentSummary: "Prevent oversized context scout prompts from blocking execution.",
    whyItMatters: "Downstream implementation must receive grounded context.",
    workerObjective: "Wire bounded context scout packet compilation into the executor.",
    contextScoutObjective:
      "Find the context scout executor, tool loop, and scheduler compiler files.",
    implementationObjective: "Patch runtime code to use the bounded packet.",
    validationObjective: "Run focused context scout and scheduler decision tests.",
    reviewObjective: "Confirm no raw prompts or fallback prompt path remains.",
    expectedEvidenceDescriptions: ["Execution packet artifact and focused tests."],
    expectedEvidenceKinds: ["artifact"],
    acceptanceCriteria: ["Provider prompt bytes are within local_semantic_extraction policy."],
    remainingWork: ["Compile bounded packet before model call."],
    relevantConstraints: ["Do not store raw prompts."],
    explicitNonGoals: ["Do not run implementation from context scout."],
    likelyRepoAreas: [
      "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts",
      "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts",
    ],
    requiredContextQuestions: [
      "Where does context scout call the model?",
      "Where does request_context compile graph nodes?",
    ],
    allowedContextRequestHints: ["Use source prompt section refs if needed."],
    expectedContextScoutOutput: ["Verified files and handoff summary."],
    expectedImplementationOutput: ["Bounded packet compiler wired into execution."],
    expectedValidationOutput: ["Focused tests pass."],
    expectedReviewReadbackOutput: ["Readback surfaces packet bytes and timeout."],
    requiredEvidenceClaimDescriptions: ["Packet ref tied to context scout node."],
    stopIfMissing: ["Stop if repo refs cannot be verified."],
    packetQualityReviewRefs: [],
    uncertaintiesAndRisks: ["Large source prompt indexes can bloat model inputs."],
    downstreamConsumer: "implementation_and_validation",
    rawFileContentStored: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    ...overrides,
  });
}

describe("context scout execution packet", () => {
  it("compiles a bounded model-task packet with policy-derived timeout", () => {
    const result = compileContextScoutExecutionPacket({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "context-1",
      targetCommitmentIds: ["commitment-1"],
      objectiveSummary: "Implement bounded context scout execution packets.",
      nodeObjective: "Ground the context scout handoff in repo files.",
      commitmentWorkPackets: [packet()],
      sourcePromptContextIndex: {
        artifactKind: "source_prompt_context_index",
        schemaVersion: "execution-platform.source-prompt-context-index.v1",
        promptHash: "hash-1",
        promptLength: 20_000,
        resolutionStatus: "resolved",
        reasonCodes: ["resolved"],
        sections: [
          {
            sectionId: "section-001",
            sectionRef: "source-prompt://hash-1/section-001/0-1000",
            startOffset: 0,
            endOffset: 1000,
            charLength: 1000,
            heading: "Context scout packet",
            boundedSummary: "The owner wants context scout packets and request-context repair.",
            rawPromptStored: false,
          },
        ],
        contextSnapshotRefs: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      boundedRepoContextIndex: [
        {
          fileRef: "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts",
          evidenceHash: "hash",
          boundedSummary: "Exports the context scout executor and model call boundary.",
          rawFileContentStored: false,
        },
      ],
      candidateFileRefs: [
        "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts",
      ],
      validationCommandRefs: ["pnpm test:file context-scout-execution-packet.test.ts"],
      nodeBudgetMs: 900_000,
      requestedTimeoutMs: 900_000,
    });

    expect(result.status).toBe("ready");
    expect(result.packet.contextBrokerRequest).toBeNull();
    expect(result.packet.providerTimeoutMs).toBeLessThanOrEqual(90_000);
    expect(result.packet.estimatedPromptBytes).toBeLessThanOrEqual(result.packet.maxInputBytes);
    expect(result.packet.rawPromptStored).toBe(false);
    expect(buildContextScoutPromptFromExecutionPacket(result.packet)).toContain(
      "contextScoutExecutionPacket",
    );
  });

  it("blocks instead of calling a provider when packet compaction cannot satisfy policy", () => {
    const result = compileContextScoutExecutionPacket({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "context-oversized",
      targetCommitmentIds: ["commitment-1"],
      objectiveSummary: "x".repeat(10_000),
      nodeObjective: "x".repeat(10_000),
      commitmentWorkPackets: Array.from({ length: 12 }, (_, index) =>
        packet({
          packetId: `packet-${index}`,
          packetRef: `runtime-work-graph://packet/${index}`,
          commitmentId: `commitment-${index}`,
          workerObjective: "x".repeat(1_500),
          contextScoutObjective: "x".repeat(1_500),
          likelyRepoAreas: Array.from(
            { length: 12 },
            (__, areaIndex) =>
              `extensions/execution-platform/src/workflows/area-${index}-${areaIndex}.ts`,
          ),
        }),
      ),
      sourcePromptContextIndex: null,
      boundedRepoContextIndex: Array.from({ length: 80 }, (_, index) => ({
        fileRef: `extensions/execution-platform/src/workflows/huge-${index}.ts`,
        evidenceHash: `hash-${index}`,
        boundedSummary: "x".repeat(1_200),
        rawFileContentStored: false as const,
      })),
      candidateFileRefs: [],
      validationCommandRefs: [],
      nodeBudgetMs: 900_000,
      requestedTimeoutMs: 900_000,
    });

    if (result.status === "blocked") {
      expect(result.reasonCodes).toContain("context_scout_execution_packet_blocked");
      expect(result.reasonCodes).toContain(
        "context_scout_execution_packet_exceeds_model_task_policy_after_compaction",
      );
    } else {
      expect(result.packet.estimatedPromptBytes).toBeLessThanOrEqual(result.packet.maxInputBytes);
      expect(result.reasonCodes).toContain(
        "context_scout_execution_packet_within_model_task_policy",
      );
    }
  });

  it("carries a branch-local context broker request into the model-facing packet", () => {
    const result = compileContextScoutExecutionPacket({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "context-for-impl-1",
      targetNodeIds: ["impl-1"],
      targetCommitmentIds: ["commitment-1"],
      objectiveSummary: "Supply node-scoped context for one implementation node.",
      nodeObjective: "Find exact target files and validation refs for impl-1.",
      downstreamConsumer: "impl-1",
      contextBrokerRequest: {
        requestRef: "runtime-job://job-1/context-broker/graph-1/impl-1/context-broker-abc",
        status: "context_scout_required",
        consumerNodeId: "impl-1",
        semanticQuestion: "Which workflow files and tests must impl-1 inspect before editing?",
        candidateResourceRefs: ["extensions/execution-platform/src/workflows/context-broker.ts"],
        reasonCodes: ["node_context_supply_missing"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      commitmentWorkPackets: [packet()],
      sourcePromptContextIndex: null,
      boundedRepoContextIndex: [
        {
          fileRef: "extensions/execution-platform/src/workflows/context-broker.ts",
          evidenceHash: "hash",
          boundedSummary: "Context broker compiles branch-local context requests.",
          rawFileContentStored: false,
        },
      ],
      candidateFileRefs: ["extensions/execution-platform/src/workflows/context-broker.ts"],
      validationCommandRefs: ["pnpm test:file context-scout-execution-packet.test.ts"],
      nodeBudgetMs: 90_000,
    });

    expect(result.status).toBe("ready");
    expect(result.packet.contextBrokerRequest).toMatchObject({
      requestRef: "runtime-job://job-1/context-broker/graph-1/impl-1/context-broker-abc",
      consumerNodeId: "impl-1",
    });
    expect(result.reasonCodes).toContain(
      "context_scout_execution_packet_context_broker_request_ref_used",
    );
    expect(buildContextScoutPromptFromExecutionPacket(result.packet)).toContain(
      "contextBrokerRequest.semanticQuestion",
    );
  });
});
