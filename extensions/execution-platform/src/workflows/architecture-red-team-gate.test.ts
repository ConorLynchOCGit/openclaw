import { describe, expect, it } from "vitest";
import {
  type ArchitectureRedTeamGateRun,
  summarizeArchitectureRedTeamGateRun,
  validateArchitectureRedTeamGateRun,
} from "./architecture-red-team-gate.ts";

const storageFlags = {
  rawPromptStored: false,
  rawResponseStored: false,
  rawTranscriptStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  secretsStored: false,
} as const;

function validGateRun(): ArchitectureRedTeamGateRun {
  return {
    artifactKind: "execution_platform.architecture_red_team_gate.v1",
    gateRunId: "red-team-gate-test",
    gateLevel: 2,
    workflowId: "agent_team.architecture_red_team",
    targetSystemRef: "workflow://agent_team.product_spec_planning",
    targetProofRef: "proof://product-spec-planning/live-ux",
    runtimeJobId: "runtime-test",
    workItemId: "work-item-test",
    boundaryMap: {
      ...storageFlags,
      boundaryMapId: "boundary-map-test",
      targetSystemRef: "workflow://agent_team.product_spec_planning",
      targetProofRef: "proof://product-spec-planning/live-ux",
      pathSegments: ["router", "mission_ledger", "scheduler", "worker", "closeout"],
      modelRuntimeToolBoundaries: [
        {
          boundaryId: "boundary.scheduler",
          fromSurface: "mission_ledger",
          toSurface: "scheduler",
          modelOwnedResponsibility: "Explain work-unit intent and risk.",
          runtimeOwnedResponsibility: "Compile refs, bounds, graph envelopes, and evidence shape.",
          evidenceRef: "artifact://boundary/scheduler",
        },
      ],
      artifactRefs: ["artifact://boundary-map"],
      reasonCodes: ["boundary_map_authored"],
    },
    assumptions: [
      {
        ...storageFlags,
        assumptionId: "assumption.scheduler.packet-quality",
        boundaryId: "boundary.scheduler",
        riskLevel: "P1",
        assumptionSummary: "Scheduler receives worker-ready commitment packets.",
        failureModeSummary: "Workers receive broad goals and produce unusable handoffs.",
        blastRadiusSummary: "Can starve child nodes or force broad implementation.",
        falsifiableQuestionRefs: ["question.packet-quality"],
        evidenceRefs: ["artifact://packet-review"],
      },
    ],
    falsifiableQuestions: [
      {
        ...storageFlags,
        questionId: "question.packet-quality",
        assumptionId: "assumption.scheduler.packet-quality",
        boundaryId: "boundary.scheduler",
        questionSummary: "Can a worker act from the packet without guessing?",
        expectedEvidenceRefs: ["artifact://packet-quality-rubric"],
        narrowResearchQueryRefs: ["research-query://coding-subagent-context-handoff"],
        codeReviewTargetRefs: ["repo://extensions/execution-platform/src/workflows"],
      },
    ],
    researchBriefs: [
      {
        ...storageFlags,
        briefId: "research.packet-context",
        questionId: "question.packet-quality",
        researchQuerySummary: "coding subagent context handoff original prompt excerpt tools",
        sourceRefs: ["source://bounded/web/context-handoff"],
        findingSummary:
          "Subagents need task objective, relevant file context, and an escape valve.",
        applicabilitySummary: "Packet authoring should include full-prompt-aware work packets.",
        limitations: ["bounded research refs only"],
      },
    ],
    codeGapMap: [
      {
        ...storageFlags,
        gapId: "gap.packet-authoring",
        questionId: "question.packet-quality",
        codeTargetRef: "repo://extensions/execution-platform/src/workflows/mission-work-packets.ts",
        observedBehaviorSummary: "Packet author exists and is model-authored.",
        expectedBehaviorSummary:
          "Packet must include concrete worker objectives and context questions.",
        gapRiskLevel: "P2",
        evidenceRefs: ["artifact://code-review/packet-author"],
        recommendedActionSummary: "Keep packet quality gate before implementation nodes.",
      },
    ],
    riskRegister: [
      {
        ...storageFlags,
        riskId: "risk.packet-quality",
        assumptionId: "assumption.scheduler.packet-quality",
        questionId: "question.packet-quality",
        riskLevel: "P1",
        riskSummary: "Weak packets can cause downstream worker failure.",
        evidenceRefs: ["artifact://packet-quality-rubric"],
        mitigationSummary: "Block implementation until context scout has concrete refs.",
        ownerAcceptanceRefs: [],
        status: "mitigated",
      },
    ],
    preProofBlockers: [],
    postProofHardeningItems: [
      {
        ...storageFlags,
        hardeningId: "hardening.context-tools",
        riskId: "risk.packet-quality",
        hardeningSummary: "Add more worker context request tools after proof.",
        recommendedQueuePosition: "after_next_proof",
        evidenceRefs: ["artifact://context-tool-roadmap"],
      },
    ],
    proofReadinessDecision: {
      ...storageFlags,
      decisionId: "decision.product-spec-ready",
      targetProofRef: "proof://product-spec-planning/live-ux",
      decision: "ready",
      p0BlockerRefs: [],
      ownerAcceptanceRefs: [],
      requiredPreProofActionRefs: [],
      postProofHardeningRefs: ["hardening.context-tools"],
      decisionSummary: "No P0 blocker remains for this target proof.",
    },
    finalReview: {
      ...storageFlags,
      reviewId: "review.product-spec-preproof",
      reviewerModelRef: "model-policy://architecture-red-team/reviewer",
      reviewSummary: "The gate is ready for proof with known post-proof hardening.",
      confidence: "high",
      semanticSufficiencyJudgment: "sufficient",
      unresolvedQuestionRefs: [],
      evidenceRefs: ["artifact://quality-review"],
    },
    artifactRefs: ["artifact://architecture-red-team-gate"],
    reasonCodes: ["architecture_red_team_level_2_completed"],
    createdAt: "2026-05-17T00:00:00.000Z",
    ...storageFlags,
  };
}

describe("architecture red-team gate", () => {
  it("accepts a complete Level 2 gate without judging semantic usefulness", () => {
    const run = validGateRun();
    run.assumptions[0] = {
      ...run.assumptions[0]!,
      assumptionSummary: "Opaque but bounded wording is still shape-valid.",
    };

    const validation = validateArchitectureRedTeamGateRun(run);

    expect(validation.valid).toBe(true);
    expect(validation.proofReady).toBe(true);
  });

  it("rejects raw-storage flags anywhere in the gate packet", () => {
    const run = validGateRun() as ArchitectureRedTeamGateRun & {
      nestedUnsafe?: { rawPromptStored: boolean };
    };
    run.nestedUnsafe = { rawPromptStored: true };

    const validation = validateArchitectureRedTeamGateRun(run);

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain("architecture_red_team_raw_storage_rejected");
  });

  it("blocks a ready decision when P0 risk exists without owner acceptance", () => {
    const run = validGateRun();
    run.riskRegister.push({
      ...storageFlags,
      riskId: "risk.false-success",
      assumptionId: "assumption.scheduler.packet-quality",
      questionId: "question.packet-quality",
      riskLevel: "P0",
      riskSummary: "Success can be claimed without runtime evidence.",
      evidenceRefs: ["artifact://false-success"],
      mitigationSummary: "Require accepted evidence before closeout.",
      ownerAcceptanceRefs: [],
      status: "open",
    });

    const validation = validateArchitectureRedTeamGateRun(run);

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain("architecture_red_team_p0_blocks_ready_decision");
  });

  it("requires Level 2 research and code-gap evidence", () => {
    const run = validGateRun();
    run.researchBriefs = [];
    run.codeGapMap = [];

    const validation = validateArchitectureRedTeamGateRun(run);

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain(
      "architecture_red_team_research_briefs_required_for_level_2",
    );
    expect(validation.reasonCodes).toContain(
      "architecture_red_team_code_gap_map_required_for_level_2",
    );
  });

  it("summarizes owner-facing proof readiness without raw content", () => {
    const summary = summarizeArchitectureRedTeamGateRun(validGateRun());

    expect(summary.proofReadinessDecision).toBe("ready");
    expect(summary.rawPromptStored).toBe(false);
    expect(summary.eli5).toContain("Before a major proof");
  });
});
