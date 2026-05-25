import { describe, expect, it } from "vitest";
import { buildSourcePromptContextIndex } from "./source-prompt-context.ts";
import {
  ObligationCandidateSetSchema,
  ObligationReviewPlanSchema,
  StagedObjectiveConstraintsSchema,
  buildFailedPacketReplayResult,
  buildFastModelNoContentDiagnostic,
  buildStagedMissionLedgerAcceptance,
  compileCanonicalMissionCommitments,
  compileObligationCandidateSet,
  missionContractLedgerFromCanonicalCommitments,
  normalizePacketSemanticBrief,
  sourcePromptStructuralAnchorsFromIndex,
} from "./staged-mission-ledger-obligation-compiler.ts";

function sourceAnchors() {
  const index = buildSourcePromptContextIndex({
    promptText: [
      "Goal:\nImplement Product/Spec Planning as a scheduler-backed workflow.",
      "Requirements:\nAdd planning nodes, research brief contracts, compile validation, and owner readback.",
    ].join("\n\n"),
    resolution: {
      status: "resolved",
      reasonCodes: ["fixture_prompt_resolved"],
      promptHash: "fixture-prompt-hash",
      promptLength: 0,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  });
  return sourcePromptStructuralAnchorsFromIndex({ index });
}

function candidateSet() {
  const anchors = sourceAnchors();
  return {
    artifactKind: "staged_mission_ledger_obligation_candidate_set",
    schemaVersion: "execution-platform.staged-mission-ledger.v1",
    missionId: "mission-1",
    sourcePromptHash: "fixture-prompt-hash",
    sourcePromptVersionRef: "source-prompt://fixture/index",
    candidates: [
      {
        localCandidateRef: "candidate-a",
        obligationText: "Implement Product/Spec Planning as a scheduler-backed workflow.",
        whyItMatters:
          "The workflow must run through the general scheduler instead of a bespoke path.",
        expectedEvidenceDescription:
          "Evidence must show workflow registration, executable nodes, validation, and readback.",
        sourceAnchors: [anchors[0]!],
        blockingProposal: "blocking",
        constraintRefs: [],
        nonGoalRefs: [],
        ambiguityNotes: [],
        modelMergeSplitNotes: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      {
        localCandidateRef: "candidate-b",
        obligationText: "Add bounded ResearchBrief and planning capsule artifacts.",
        whyItMatters:
          "Planning workflows need bounded contracts before downstream compile and execution.",
        expectedEvidenceDescription:
          "Evidence must show bounded artifact contracts and schema validation.",
        sourceAnchors: [anchors[1] ?? anchors[0]!],
        blockingProposal: "blocking",
        constraintRefs: [],
        nonGoalRefs: [],
        ambiguityNotes: [],
        modelMergeSplitNotes: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    ],
    omittedObligationNotes: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

describe("staged mission ledger obligation compiler", () => {
  it("keeps staged Mission Ledger schemas narrow at each model boundary", () => {
    const anchors = sourceAnchors();
    expect(() =>
      StagedObjectiveConstraintsSchema.parse({
        artifactKind: "staged_mission_ledger_objective_constraints",
        schemaVersion: "execution-platform.staged-mission-ledger.v1",
        missionId: "mission-1",
        ownerObjectiveSummary: "Implement the workflow.",
        objectiveRationale: "The owner asked for production implementation.",
        explicitConstraints: [],
        explicitNonGoals: [],
        ambiguityNotes: [],
        safetyBoundaryNotes: [],
        sourcePromptHash: "fixture-prompt-hash",
        sourcePromptLength: 100,
        obligationCandidateSet: {},
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
    ).toThrow();

    expect(() =>
      ObligationCandidateSetSchema.parse({
        ...candidateSet(),
        candidates: [
          {
            ...candidateSet().candidates[0]!,
            candidateRef: "runtime-owned-ref",
            sourceAnchors: [anchors[0]!],
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      ObligationReviewPlanSchema.parse({
        artifactKind: "staged_mission_ledger_obligation_review_plan",
        schemaVersion: "execution-platform.staged-mission-ledger.v1",
        missionId: "mission-1",
        candidateSetRef: "runtime-job://job/candidate-set",
        operations: [
          {
            operationId: "accept-a",
            operationKind: "accept_candidate",
            candidateRefs: ["obligation-candidate-runtime"],
            candidateLocalRefs: ["candidate-a"],
            resultingCommitmentText: null,
            expectedEvidenceDescription: null,
            blocking: null,
            rationale: "Accept the candidate.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
        reviewerSummary: "Accept one candidate.",
        unresolvedOwnerQuestions: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
    ).toThrow();
  });

  it("compiles model-authored obligation candidates into runtime-stable candidate refs", () => {
    const anchors = sourceAnchors();
    const compiled = compileObligationCandidateSet({
      candidateSet: candidateSet(),
      knownAnchors: anchors,
    });

    expect(compiled.candidateCount).toBe(2);
    expect(compiled.candidates[0]?.candidateRef).toMatch(/^obligation-candidate-/u);
    expect(compiled.candidates[0]?.candidateHash).toMatch(/^sha256:/u);
    expect(compiled.rawPromptStored).toBe(false);
  });

  it("rejects unknown source anchors instead of inferring semantic anchors", () => {
    const broken = candidateSet();
    broken.candidates[0]!.sourceAnchors[0] = {
      ...broken.candidates[0]!.sourceAnchors[0]!,
      excerptRef: "source-prompt://unknown/section-999/0-10",
    };

    expect(() =>
      compileObligationCandidateSet({
        candidateSet: broken,
        knownAnchors: sourceAnchors(),
      }),
    ).toThrow(/unknown_source_anchor/u);
  });

  it("compiles canonical commitments from model review operations without model ids", () => {
    const compiled = compileObligationCandidateSet({
      candidateSet: candidateSet(),
      knownAnchors: sourceAnchors(),
    });
    const canonical = compileCanonicalMissionCommitments({
      compiledCandidateSet: compiled,
      reviewPlan: {
        artifactKind: "staged_mission_ledger_obligation_review_plan",
        schemaVersion: "execution-platform.staged-mission-ledger.v1",
        missionId: "mission-1",
        candidateSetRef: "runtime-job://job/candidate-set",
        operations: [
          {
            operationId: "accept-a",
            operationKind: "accept_candidate",
            candidateRefs: [compiled.candidates[0]!.candidateRef],
            resultingCommitmentText: null,
            expectedEvidenceDescription: null,
            blocking: null,
            rationale: "Candidate A is a standalone blocking commitment.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          {
            operationId: "accept-b",
            operationKind: "accept_candidate",
            candidateRefs: [compiled.candidates[1]!.candidateRef],
            resultingCommitmentText: null,
            expectedEvidenceDescription: null,
            blocking: null,
            rationale: "Candidate B is a standalone blocking commitment.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
        reviewerSummary: "Both candidates are distinct blocking obligations.",
        unresolvedOwnerQuestions: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });

    expect(canonical.commitments).toHaveLength(2);
    expect(canonical.commitments[0]?.commitmentId).toMatch(/^commitment-/u);
    expect(canonical.commitments[0]?.sourceCandidateRefs).toEqual([
      compiled.candidates[0]!.candidateRef,
    ]);
    const ledger = missionContractLedgerFromCanonicalCommitments({
      canonicalCommitments: canonical,
      ownerObjectiveSummary: "Implement Product/Spec Planning.",
      sourceRuntimeJobId: "runtime-job-1",
      sourceWorkItemId: "work-item-1",
    });
    expect(ledger.blockingCommitments.map((commitment) => commitment.commitmentId)).toEqual(
      canonical.commitments.map((commitment) => commitment.commitmentId),
    );
    expect(ledger.blockingCommitments[0]?.rawPromptStored).toBe(false);
  });

  it("rejects local candidate refs during canonical commitment compilation", () => {
    const compiled = compileObligationCandidateSet({
      candidateSet: candidateSet(),
      knownAnchors: sourceAnchors(),
    });

    expect(() =>
      compileCanonicalMissionCommitments({
        compiledCandidateSet: compiled,
        reviewPlan: {
          artifactKind: "staged_mission_ledger_obligation_review_plan",
          schemaVersion: "execution-platform.staged-mission-ledger.v1",
          missionId: "mission-1",
          candidateSetRef: "runtime-job://job/candidate-set",
          operations: [
            {
              operationId: "accept-local-a",
              operationKind: "accept_candidate",
              candidateRefs: ["candidate-a"],
              resultingCommitmentText: null,
              expectedEvidenceDescription: null,
              blocking: null,
              rationale: "This incorrectly uses a model-local candidate ref.",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          ],
          reviewerSummary: "Invalid local ref review.",
          unresolvedOwnerQuestions: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      }),
    ).toThrow(/unknown_candidate_ref:accept-local-a:candidate-a/u);
  });

  it("requires accepted Mission Ledger commitments to include blocking runtime commitments", () => {
    const compiled = compileObligationCandidateSet({
      candidateSet: candidateSet(),
      knownAnchors: sourceAnchors(),
    });
    const canonical = compileCanonicalMissionCommitments({
      compiledCandidateSet: compiled,
      reviewPlan: {
        artifactKind: "staged_mission_ledger_obligation_review_plan",
        schemaVersion: "execution-platform.staged-mission-ledger.v1",
        missionId: "mission-1",
        candidateSetRef: "runtime-job://job/candidate-set",
        operations: [
          {
            operationId: "accept-nonblocking-a",
            operationKind: "accept_candidate",
            candidateRefs: [compiled.candidates[0]!.candidateRef],
            resultingCommitmentText: null,
            expectedEvidenceDescription: null,
            blocking: false,
            rationale: "This candidate is nonblocking.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
        reviewerSummary: "Only nonblocking work remains.",
        unresolvedOwnerQuestions: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });

    const acceptance = buildStagedMissionLedgerAcceptance({
      missionId: "mission-1",
      canonicalCommitments: canonical,
      missionLedgerRef: "runtime-job://job/mission-ledger",
      canonicalCommitmentsRef: "runtime-job://job/canonical-commitments",
    });

    expect(acceptance.status).toBe("needs_review");
    expect(acceptance.reasonCodes).toContain(
      "mission_ledger_acceptance_missing_blocking_commitments",
    );
  });

  it("classifies no-content provider failures with exact structural reason classes", () => {
    expect(
      buildFastModelNoContentDiagnostic({
        taskClass: "local_semantic_extraction",
        callSite: "commitment_packet.semantic_content",
        modelRef: "qwen/qwen3-coder-next",
        providerPath: "openrouter",
        inputByteLength: 12_000,
        parsedContentLength: 0,
        timedOut: true,
        errorReasonCode: "openrouter_network_timeout",
      }).classifiedReason,
    ).toBe("client_abort_before_provider_finish");

    expect(
      buildFastModelNoContentDiagnostic({
        taskClass: "schema_normalization",
        callSite: "commitment_packet.targeted_normalization",
        modelRef: "qwen/qwen3-coder-next",
        providerPath: "openrouter",
        inputByteLength: 4_000,
        parsedContentLength: 0,
        choiceCount: 1,
        contentLengthByChoice: [700],
      }).classifiedReason,
    ).toBe("adapter_content_extraction_failed");

    expect(
      buildFastModelNoContentDiagnostic({
        taskClass: "local_semantic_extraction",
        callSite: "commitment_packet.semantic_content",
        modelRef: "qwen/qwen3-coder-next",
        providerPath: "openrouter",
        inputByteLength: 22_000,
        elapsedMs: 60_005,
        timeoutMs: 60_000,
        parsedContentLength: 0,
        choiceCount: 1,
        contentLengthByChoice: [0],
        finishReason: null,
        nativeFinishReason: null,
        errorReasonCode: "openrouter_no_content",
      }).classifiedReason,
    ).toBe("timeout_adjacent_empty_content");

    expect(
      buildFastModelNoContentDiagnostic({
        taskClass: "local_semantic_extraction",
        callSite: "commitment_packet.semantic_content",
        modelRef: "moonshotai/kimi-k2.6",
        expectedModelRef: "qwen/qwen3-coder-next",
        providerPath: "openrouter",
        inputByteLength: 4_000,
        parsedContentLength: 0,
      }).classifiedReason,
    ).toBe("wrong_model_or_profile");
  });

  it("records repeated failed-packet replay as a diagnostic failure, not a silent rescue", () => {
    const attempt = buildFastModelNoContentDiagnostic({
      taskClass: "local_semantic_extraction",
      callSite: "commitment_packet.semantic_content",
      modelRef: "qwen/qwen3-coder-next",
      providerPath: "openrouter",
      inputByteLength: 10_000,
      inputBundleRef: "runtime-job://job/packet-input/commitment-a",
      inputBundleHash: "sha256:packet-input",
      parsedContentLength: 0,
      choiceCount: 0,
    });
    const replay = buildFailedPacketReplayResult({
      replayId: "replay-1",
      commitmentId: "commitment-a",
      inputBundleRef: "runtime-job://job/packet-input/commitment-a",
      inputBundleHash: "sha256:packet-input",
      attempts: [attempt, { ...attempt, retryNumber: 1 }],
    });

    expect(replay.status).toBe("reproduced_failure");
    expect(replay.reasonCodes).toContain("same_bounded_input_reproduced_no_content");
  });

  it("normalizes packet semantic briefs as semantic content only", () => {
    const brief = normalizePacketSemanticBrief({
      packetSemanticContent: {
        commitmentId: "commitment-a",
        commitmentMeaning:
          "Product/Spec Planning needs production workflow nodes and bounded artifacts.",
        ownerIntentSummary:
          "The owner wants the planning workflow implemented through the general scheduler.",
        workerObjective:
          "Wire the Product/Spec Planning workflow into production runtime definitions.",
        contextScoutObjective:
          "Find workflow registry, planning plugin, artifact contracts, and readback code.",
        implementationObjective:
          "Add first-class planning workflow registration and artifact contracts.",
        validationObjective: "Run focused workflow registry and artifact contract tests.",
        reviewObjective: "Confirm evidence refs map back to planning commitments.",
        acceptanceCriteria: ["Workflow definition resolves.", "Artifact contracts validate."],
        requiredContextQuestions: ["Where are workflow definitions registered?"],
        downstreamConsumer: "runtime_work_graph_scheduler",
      },
    });

    expect(brief.commitmentId).toBe("commitment-a");
    expect(brief.rawPromptStored).toBe(false);
  });
});
