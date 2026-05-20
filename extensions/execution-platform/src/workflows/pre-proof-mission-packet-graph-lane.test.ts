import { describe, expect, it } from "vitest";
import {
  buildContextScoutToolLoopRun,
  buildContextScoutVerifiedFileRefs,
} from "./context-scout-tool-loop.ts";
import type { MissionContractLedger } from "./mission-contract-ledger.ts";
import {
  applyCommitmentPacketQualityReview,
  buildContextHandoffPacket,
  normalizeCommitmentPacketQualityReview,
  normalizeModelAuthoredCommitmentWorkPackets,
} from "./mission-work-packets.ts";
import {
  PreProofContextScoutReadinessReviewSchema,
  PreProofMissionLedgerQualityReviewSchema,
  PreProofMissionPacketGraphLaneQualityReviewSchema,
  PreProofStagedGraphQualityReviewSchema,
  validatePreProofMissionPacketGraphLane,
} from "./pre-proof-mission-packet-graph-lane.ts";
import type { TeamGraphEdge, TeamGraphNode } from "./runtime-work-graph.ts";
import { buildSourcePromptContextIndex } from "./source-prompt-context.ts";

function ledger(): MissionContractLedger {
  return {
    artifactKind: "mission_contract_ledger",
    schemaVersion: "execution-platform.mission-contract-ledger.v1",
    missionId: "mission-product-spec-pre-proof",
    sourceRuntimeJobId: "runtime-1",
    sourceWorkItemId: "work-1",
    ownerObjectiveSummary:
      "Implement Product/Spec Planning as a scheduler-backed production workflow.",
    blockingCommitments: [
      {
        commitmentId: "workflow-registration",
        commitmentText: "Register Product/Spec Planning as a scheduler-backed production workflow.",
        whyItMatters: "The owner needs a real workflow instead of a generic runner fallback.",
        expectedEvidenceDescription:
          "Workflow registration refs, scheduler graph refs, focused tests, and readback refs.",
        acceptedEvidenceRefs: [],
        rejectedEvidenceRefs: [],
        status: "pending",
        rationale: null,
        remainingWork: ["Find workflow registry and scheduler plugin surfaces."],
        blocking: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      {
        commitmentId: "planning-lifecycle",
        commitmentText:
          "Add Planning Capsule lifecycle, research influence, and compile-readiness support.",
        whyItMatters: "Planning output must be useful enough to drive future execution.",
        expectedEvidenceDescription:
          "Planning capsule refs, research refs, compile-readiness refs, tests, and readback refs.",
        acceptedEvidenceRefs: [],
        rejectedEvidenceRefs: [],
        status: "pending",
        rationale: null,
        remainingWork: ["Map planning capsule and compiler surfaces before implementation."],
        blocking: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    ],
    nonBlockingCommitments: [],
    explicitNonGoals: ["Do not deploy.", "Do not send outbound messages."],
    safetyConstraints: [],
    prohibitedDirectiveCandidates: [],
    authorityBoundary: {
      requestedAuthority: "code_edit",
      maximumAuthority: "repo_edit",
      requiresApproval: false,
      approvalRefs: [],
      authorityRefs: [],
      rawPromptStored: false,
      rawResponseStored: false,
    },
    storagePolicy: {
      rawPromptStorageAllowed: false,
      rawResponseStorageAllowed: false,
      rawTranscriptStorageAllowed: false,
      rawProviderLogStorageAllowed: false,
      rawToolLogStorageAllowed: false,
      rawDbRowStorageAllowed: false,
      secretsStorageAllowed: false,
      boundedRefsOnly: true,
    },
    lifecycleBoundary: {
      workQueueLifecycleMutationAllowed: false,
      authorityGrantAllowed: false,
      deployAllowed: false,
      outboundSendAllowed: false,
      modelPromotionAllowed: false,
      runtimeJobLifecycleOwner: "runtime_jobs",
    },
    missionGate: "clear_to_execute",
    missionGateRationale: null,
    revisionProposals: [],
    ledgerStatus: "pending",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

function acceptedPackets(inputLedger = ledger()) {
  const authored = normalizeModelAuthoredCommitmentWorkPackets({
    ledger: inputLedger,
    value: {
      commitmentWorkPackets: inputLedger.blockingCommitments.map((commitment) => ({
        commitmentId: commitment.commitmentId,
        commitmentMeaning: `${commitment.commitmentText} Workers need concrete repo targets, validation, and readback expectations.`,
        ownerIntentSummary: inputLedger.ownerObjectiveSummary,
        whyItMatters: commitment.whyItMatters,
        workerObjective: `Prepare and execute bounded work for ${commitment.commitmentId} only after context is verified.`,
        contextScoutObjective: `Find concrete source, test, docs, and Work Queue readback files for ${commitment.commitmentId}.`,
        implementationObjective: `Apply scoped production changes for ${commitment.commitmentId} using verified handoff refs.`,
        validationObjective: `Run focused tests and readback checks for ${commitment.commitmentId}.`,
        reviewObjective: `Judge whether evidence closes ${commitment.commitmentId} without false success.`,
        expectedEvidenceDescriptions: [commitment.expectedEvidenceDescription],
        expectedEvidenceKinds: ["source_change", "test_validation", "readback"],
        acceptanceCriteria: [
          "Context scout names concrete target files.",
          "Implementation evidence maps to the commitment id.",
          "Validation refs are recorded before closeout.",
        ],
        remainingWork: commitment.remainingWork,
        relevantConstraints: ["Runtime owns graph schema and evidence refs."],
        explicitNonGoals: ["No generic runner fallback."],
        likelyRepoAreas: [
          "extensions/execution-platform/src/workflows/",
          "extensions/execution-platform/src/work-queue/",
        ],
        requiredContextQuestions: [
          "Which workflow registry files are affected?",
          "Which tests prove this commitment?",
        ],
        allowedContextRequestHints: [
          "Request bounded original-prompt excerpts if the target mode or success gate is ambiguous.",
        ],
        expectedContextScoutOutput: ["Verified file refs, tests, risks, and blockers."],
        expectedImplementationOutput: ["Changed-file refs or precise needs_review reason."],
        expectedValidationOutput: ["Validation command refs and bounded result summary."],
        expectedReviewReadbackOutput: ["Review and Work Queue readback refs."],
        requiredEvidenceClaimDescriptions: [commitment.expectedEvidenceDescription],
        stopIfMissing: ["Stop before implementation if verified repo refs are missing."],
        uncertaintiesAndRisks: ["Avoid broad Codex-only implementation when cheaper roles fit."],
        downstreamConsumer: "runtime_work_graph_scheduler",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      })),
    },
  });
  const review = normalizeCommitmentPacketQualityReview({
    missionId: inputLedger.missionId,
    packets: authored,
    value: {
      status: "accepted",
      packetReviews: authored.map((packet) => ({
        packetRef: packet.packetRef,
        commitmentId: packet.commitmentId,
        status: "accepted",
        specificEnoughForContextScout: true,
        specificEnoughForImplementation: true,
        specificEnoughForValidation: true,
        specificEnoughForReview: true,
        preservesOwnerIntent: true,
        missingInformation: [],
        repairInstructions: [],
      })),
      reviewerSummary: "Packets are worker-ready and preserve the owner objective.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  });
  return { packets: applyCommitmentPacketQualityReview({ packets: authored, review }), review };
}

function acceptedGraph(inputLedger = ledger()): {
  nodes: TeamGraphNode[];
  edges: TeamGraphEdge[];
} {
  const nodes: TeamGraphNode[] = [
    {
      graphId: "graph-1",
      nodeId: "context-workflow-registration",
      nodeKind: "context_scout",
      assignedRole: "context_scout",
      modelOrWorkerRef: "worker.context-scout",
      runtimeJobId: null,
      humanTaskId: null,
      inputHandoffRefs: [],
      outputArtifactRefs: [],
      nodeStatus: "planned",
      budgetUsage: null,
      metadata: {
        commitmentIds: inputLedger.blockingCommitments.map((commitment) => commitment.commitmentId),
        capabilityId: "context_scout",
        expectedEvidenceSource: "runtime_derived_from_capability_manifest_and_mission_ledger",
        expectedEvidence: ["context_handoff"],
      },
      rawPromptStored: false as const,
      rawResponseStored: false as const,
      rawLogsStored: false as const,
      startedAt: null,
      completedAt: null,
      createdAt: new Date("2026-05-17T00:00:00.000Z"),
      updatedAt: new Date("2026-05-17T00:00:00.000Z"),
    },
    {
      graphId: "graph-1",
      nodeId: "implementation-product-spec",
      nodeKind: "implementation",
      assignedRole: "implementation_engineer",
      modelOrWorkerRef: "worker.kimi.file-implementation",
      runtimeJobId: null,
      humanTaskId: null,
      inputHandoffRefs: ["runtime-work-graph://graph-1/node/context-workflow-registration"],
      outputArtifactRefs: [],
      nodeStatus: "planned",
      budgetUsage: null,
      metadata: {
        commitmentIds: inputLedger.blockingCommitments.map((commitment) => commitment.commitmentId),
        capabilityId: "implementation_microtask",
        expectedEvidenceSource: "runtime_derived_from_capability_manifest_and_mission_ledger",
        expectedEvidence: ["source_change", "test_validation"],
      },
      rawPromptStored: false as const,
      rawResponseStored: false as const,
      rawLogsStored: false as const,
      startedAt: null,
      completedAt: null,
      createdAt: new Date("2026-05-17T00:00:00.000Z"),
      updatedAt: new Date("2026-05-17T00:00:00.000Z"),
    },
  ];
  const edges: TeamGraphEdge[] = [
    {
      graphId: "graph-1",
      edgeId: "edge-context-to-implementation",
      fromNodeId: "context-workflow-registration",
      toNodeId: "implementation-product-spec",
      edgeKind: "handoff",
      reasonCodes: ["test_handoff_edge"],
      artifactRefs: [],
      createdAt: new Date("2026-05-17T00:00:00.000Z"),
      metadata: { reason: "implementation requires verified context handoff" },
    },
  ];
  return { nodes, edges };
}

describe("pre-proof mission packet graph lane", () => {
  it("accepts only the full pre-proof chain before implementation runs", () => {
    const inputLedger = ledger();
    const sourcePromptIndex = buildSourcePromptContextIndex({
      promptText: "Implement Product/Spec Planning production workflow.\n".repeat(120),
      resolution: {
        status: "resolved",
        reasonCodes: ["source_prompt_resolved"],
        promptHash: null,
        promptLength: null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const { packets, review: packetQualityReview } = acceptedPackets(inputLedger);
    const handoff = buildContextHandoffPacket({
      sourceNodeId: "context-workflow-registration",
      targetCommitmentIds: inputLedger.blockingCommitments.map(
        (commitment) => commitment.commitmentId,
      ),
      relevantFileRefs: ["extensions/execution-platform/src/workflows/workflow-definition.ts"],
      recommendedEditPoints: [
        "extensions/execution-platform/src/workflows/workflow-definition.ts:define workflow registration and projection policy fields",
        "extensions/execution-platform/src/work-queue/execution-read-model.ts:surface planning workflow readback refs",
      ],
      existingPatterns: [
        "Workflow definitions carry required phases, evidence profile refs, Work Queue projection policy refs, and closeout/finalization policy refs.",
      ],
      risks: [
        "Do not let Product/Spec Planning route through a retired generic queued runner or count degraded closeout as success.",
      ],
      validationSuggestions: [
        "Run workflow definition, scheduler graph, and Work Queue planning readback tests after implementation.",
        "Verify child Work Queue projection and closeout evidence refs are visible in owner-facing readback.",
      ],
      handoffSummaryForImplementation:
        "Workflow definitions and Work Queue readback are the first implementation targets for this Product/Spec Planning proof lane. The context scout should steer the implementer toward the canonical WorkflowDefinition registry, scheduler graph contracts, and DB Work Queue projection/readback surfaces rather than allowing a generic queued runner to claim success. Implementation should preserve the runtime-owned schema boundary, derive evidence from workflow profiles, and prove child projection plus model-authored closeout through focused tests.",
    });
    const contextScoutReadiness = buildContextScoutToolLoopRun({
      runtimeJobId: "job-1",
      graphId: "graph-1",
      nodeId: "context-workflow-registration",
      roleId: "context_scout",
      modelRef: "policy://context-scout",
      targetCommitmentIds: inputLedger.blockingCommitments.map(
        (commitment) => commitment.commitmentId,
      ),
      commitmentWorkPacketRefs: packets.map((packet) => packet.packetRef),
      requestedContextQuestions: packets.flatMap((packet) => packet.requiredContextQuestions),
      sourcePromptHash: sourcePromptIndex.promptHash,
      verifiedFileRefs: buildContextScoutVerifiedFileRefs({
        runtimeJobId: "job-1",
        nodeId: "context-workflow-registration",
        fileRefs: ["extensions/execution-platform/src/workflows/workflow-definition.ts"],
      }),
      contextHandoffPacketRef: "runtime-job://job-1/context-handoff/context-workflow-registration",
      contextHandoffPacket: handoff,
      modelAuthoredSummary:
        "The first scout can start from workflow definition, scheduler graph contracts, and Work Queue readback refs, then hand off concrete implementation targets without guessing. The packet identifies workflow registration and readback projection as the immediate areas, warns against retired generic queued-runner success, and gives downstream validation commands plus closeout/readback expectations so the implementation worker has actionable bounded context.",
    });
    const { nodes, edges } = acceptedGraph(inputLedger);
    const result = validatePreProofMissionPacketGraphLane({
      sourcePromptIndex,
      ledger: inputLedger,
      ledgerQualityReview: PreProofMissionLedgerQualityReviewSchema.parse({
        artifactKind: "pre_proof_mission_ledger_quality_review",
        schemaVersion: "execution-platform.pre-proof-mission-ledger-quality-review.v1",
        reviewSource: "model_authored",
        reviewRef: "runtime-job://job-1/review/ledger",
        missionId: inputLedger.missionId,
        status: "accepted",
        objectivePreserved: true,
        commitmentsActionable: true,
        constraintsBounded: true,
        evidenceExpectationsClear: true,
        reviewerSummary: "Ledger is actionable for packet authoring.",
        missingInformation: [],
        repairInstructions: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
      packets,
      packetQualityReview,
      contextScoutReadiness,
      contextScoutReadinessReview: PreProofContextScoutReadinessReviewSchema.parse({
        artifactKind: "pre_proof_context_scout_readiness_review",
        schemaVersion: "execution-platform.pre-proof-context-scout-readiness-review.v1",
        reviewSource: "model_authored",
        reviewRef: "runtime-job://job-1/review/context",
        missionId: inputLedger.missionId,
        status: "accepted",
        contextScoutCanStart: true,
        verifiedRefsEnoughForFirstScout: true,
        promptExcerptPolicyClear: true,
        handoffUsefulForScheduler: true,
        reviewerSummary: "Context scout can start with bounded prompt refs and packet questions.",
        missingInformation: [],
        repairInstructions: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      }),
      graphQualityReview: PreProofStagedGraphQualityReviewSchema.parse({
        artifactKind: "pre_proof_staged_scheduler_graph_quality_review",
        schemaVersion: "execution-platform.pre-proof-staged-graph-quality-review.v1",
        reviewSource: "model_authored",
        reviewRef: "runtime-job://job-1/review/graph",
        missionId: inputLedger.missionId,
        graphId: "graph-1",
        status: "accepted",
        graphCoversCommitments: true,
        graphHasEdgesOrParallelJustification: true,
        costAwareCapabilityChoicesUseful: true,
        firstNodeSafeBeforeImplementation: true,
        workerHandoffsClear: true,
        reviewerSummary: "Graph starts with context and hands off to scoped implementation.",
        missingInformation: [],
        repairInstructions: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
      laneQualityReview: PreProofMissionPacketGraphLaneQualityReviewSchema.parse({
        artifactKind: "pre_proof_mission_packet_graph_lane_quality_review",
        schemaVersion: "execution-platform.pre-proof-mission-packet-graph-lane-review.v1",
        reviewSource: "model_authored",
        reviewRef: "runtime-job://job-1/review/lane",
        missionId: inputLedger.missionId,
        graphId: "graph-1",
        status: "accepted",
        missionLedgerPassed: true,
        packetsPassed: true,
        contextScoutReadinessPassed: true,
        graphCompilePassed: true,
        workQueueChildMaterializationPassed: true,
        stoppedBeforeImplementation: true,
        readyForFullProductSpecProof: true,
        reviewerSummary: "The lane is ready for a full Product/Spec proof.",
        missingInformation: [],
        repairInstructions: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
      }),
      graphNodes: nodes,
      graphEdges: edges,
      workQueueChildItemIds: [
        "runtime-graph:graph-1:context-workflow-registration",
        "runtime-graph:graph-1:implementation-product-spec",
      ],
      executedNodeIds: [],
    });

    expect(result.reasonCodes).toEqual([]);
    expect(result.accepted).toBe(true);
    expect(result.nodeCount).toBe(2);
    expect(result.edgeCount).toBe(1);
  });

  it("rejects deterministic packets, missing edges, and accidental implementation execution", () => {
    const inputLedger = ledger();
    const sourcePromptIndex = buildSourcePromptContextIndex({
      promptText: "Implement Product/Spec Planning production workflow.",
      resolution: {
        status: "resolved",
        reasonCodes: ["source_prompt_resolved"],
        promptHash: null,
        promptLength: null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const { packets, review: packetQualityReview } = acceptedPackets(inputLedger);
    const { nodes } = acceptedGraph(inputLedger);
    const result = validatePreProofMissionPacketGraphLane({
      sourcePromptIndex,
      ledger: inputLedger,
      ledgerQualityReview: PreProofMissionLedgerQualityReviewSchema.parse({
        artifactKind: "pre_proof_mission_ledger_quality_review",
        schemaVersion: "execution-platform.pre-proof-mission-ledger-quality-review.v1",
        reviewSource: "model_authored",
        reviewRef: "runtime-job://job-1/review/ledger",
        missionId: inputLedger.missionId,
        status: "accepted",
        objectivePreserved: true,
        commitmentsActionable: true,
        constraintsBounded: true,
        evidenceExpectationsClear: true,
        reviewerSummary: "accepted",
        missingInformation: [],
        repairInstructions: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
      packets: [{ ...packets[0]!, authoringSource: "deterministic_fallback" }],
      packetQualityReview,
      contextScoutReadiness: buildContextScoutToolLoopRun({
        runtimeJobId: "job-1",
        graphId: "graph-1",
        nodeId: "context",
        roleId: "context_scout",
        modelRef: "policy://context-scout",
        targetCommitmentIds: ["workflow-registration"],
        commitmentWorkPacketRefs: [packets[0]!.packetRef],
        requestedContextQuestions: ["Which files matter?"],
        modelAuthoredSummary: "No verified context yet.",
      }),
      contextScoutReadinessReview: PreProofContextScoutReadinessReviewSchema.parse({
        artifactKind: "pre_proof_context_scout_readiness_review",
        schemaVersion: "execution-platform.pre-proof-context-scout-readiness-review.v1",
        reviewSource: "model_authored",
        reviewRef: "runtime-job://job-1/review/context",
        missionId: inputLedger.missionId,
        status: "needs_repair",
        contextScoutCanStart: false,
        verifiedRefsEnoughForFirstScout: false,
        promptExcerptPolicyClear: true,
        handoffUsefulForScheduler: false,
        reviewerSummary: "Context not ready.",
        missingInformation: ["Verified refs missing."],
        repairInstructions: ["Run context scout first."],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      }),
      graphQualityReview: PreProofStagedGraphQualityReviewSchema.parse({
        artifactKind: "pre_proof_staged_scheduler_graph_quality_review",
        schemaVersion: "execution-platform.pre-proof-staged-graph-quality-review.v1",
        reviewSource: "model_authored",
        reviewRef: "runtime-job://job-1/review/graph",
        missionId: inputLedger.missionId,
        graphId: "graph-1",
        status: "needs_repair",
        graphCoversCommitments: true,
        graphHasEdgesOrParallelJustification: false,
        costAwareCapabilityChoicesUseful: true,
        firstNodeSafeBeforeImplementation: true,
        workerHandoffsClear: false,
        reviewerSummary: "Graph has no handoff edges.",
        missingInformation: ["Edges missing."],
        repairInstructions: ["Add handoff edges."],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
      laneQualityReview: PreProofMissionPacketGraphLaneQualityReviewSchema.parse({
        artifactKind: "pre_proof_mission_packet_graph_lane_quality_review",
        schemaVersion: "execution-platform.pre-proof-mission-packet-graph-lane-review.v1",
        reviewSource: "model_authored",
        reviewRef: "runtime-job://job-1/review/lane",
        missionId: inputLedger.missionId,
        graphId: "graph-1",
        status: "needs_repair",
        missionLedgerPassed: true,
        packetsPassed: false,
        contextScoutReadinessPassed: false,
        graphCompilePassed: false,
        workQueueChildMaterializationPassed: false,
        stoppedBeforeImplementation: false,
        readyForFullProductSpecProof: false,
        reviewerSummary: "Lane must not proceed.",
        missingInformation: ["Packet and graph readiness failed."],
        repairInstructions: ["Repair packets and graph."],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
      }),
      graphNodes: nodes,
      graphEdges: [],
      workQueueChildItemIds: [],
      executedNodeIds: ["implementation-product-spec"],
    });

    expect(result.accepted).toBe(false);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "commitment_work_packet_not_model_authored:workflow-registration",
        "context_scout_verified_file_refs_missing",
        "graph_edges_missing",
        "pre_proof_lane_executed_nodes_unexpected",
      ]),
    );
  });
});
