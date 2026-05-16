import { describe, expect, it } from "vitest";
import { evaluateCloseoutCapsuleRobustness } from "./closeout-capsule-robustness.ts";
import type { CloseoutCapsule } from "./closeout-capsule.ts";

function capsule(overrides: Partial<CloseoutCapsule> = {}): CloseoutCapsule {
  return {
    artifactKind: "execution_platform_closeout_capsule",
    schemaVersion: "execution-platform.closeout-capsule.v1",
    capsuleId: "capsule-1",
    createdAt: "2026-05-14T00:00:00.000Z",
    modelRef: "openai-codex/gpt-5.4",
    humanReport: {
      source: "model",
      reportMarkdown: "Completed the requested work with bounded evidence.",
      eli5Progress: "We fixed the work and checked it.",
      limitations: [],
    },
    structuredSummary: {
      taskSuccess: "satisfied",
      qualityAssessment: "The work product is bounded and validated.",
      workflowFitAssessment: "The workflow matched the task.",
      agentModelFitAssessment: "The model fit the closeout role.",
      missingWork: [],
      validationSummary: "Focused validation passed.",
      riskSummary: "No raw storage or lifecycle mutation.",
      opportunitySeedIds: ["seed-1"],
    },
    roleCloseouts: [
      {
        roleId: "reviewer",
        agentId: "agent:reviewer",
        modelRef: "openai-codex/gpt-5.4",
        modelRunRef: "model-run://reviewer/1",
        source: "model",
        askedToDo: "Review bounded runtime evidence.",
        actuallyDid: "Reviewed validation refs and limitations.",
        worked: ["Evidence was present."],
        failedOrWeak: [],
        wouldImproveNext: ["Keep closeout concise."],
        opportunitySeeds: [],
        confidence: "high",
        limitations: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    ],
    opportunitySeeds: [
      {
        seedId: "seed-1",
        kind: "process_improvement",
        title: "Keep evidence refs in closeout.",
        rationale: "The owner needs useful readback.",
        recommendedNextStep: "Use the same closeout shape on the next workflow.",
        evidenceRefs: ["runtime-job://job-1/validation/focused"],
        confidence: "medium",
      },
    ],
    factualRefs: {
      runtimeJobId: "job-1",
      teamRunId: "team-1",
      workflowId: "agent_team.coding",
      status: "succeeded",
      roles: [
        {
          roleId: "reviewer",
          agentId: "agent:reviewer",
          modelRef: "openai-codex/gpt-5.4",
          status: "completed",
        },
      ],
      fileRefs: ["extensions/execution-platform/src/work-queue/example.ts"],
      artifactRefs: ["runtime-job://job-1/closeout-capsule/capsule-1"],
      validationRefs: ["runtime-job://job-1/validation/focused"],
      runtimeEventRefs: ["runtime-job://job-1/event/closeout"],
    },
    safetyFlags: {
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      workQueueLifecycleMutatedDirectly: false,
      authorityGrantedByCloseout: false,
      runtimeJobCreatedByCloseout: false,
    },
    ...overrides,
  };
}

describe("closeout capsule robustness review", () => {
  it("accepts succeeded closeout only when runtime evidence supports success", () => {
    const review = evaluateCloseoutCapsuleRobustness({
      capsule: capsule(),
      runtimeJobId: "job-1",
      runtimeOutcome: "succeeded",
      runtimeJobState: "succeeded",
      implementationRequired: true,
      changedFileRefs: ["extensions/execution-platform/src/work-queue/example.ts"],
      validationRefs: ["runtime-job://job-1/validation/focused"],
      validationState: "passed",
      closeoutModelRef: "openai-codex/gpt-5.4",
      closeoutReasoningEffort: "low",
      closeoutMaxOutputTokens: 8000,
      closeoutModelStartedAt: "2026-05-14T00:00:00.000Z",
      closeoutModelCompletedAt: "2026-05-14T00:00:55.000Z",
      closeoutModelLatencyMs: 55_000,
    });

    expect(review.state).toBe("accepted");
    expect(review.runtimeEvidenceState).toBe("accepted");
    expect(review.closeoutTiming.latencyMs).toBe(55_000);
  });

  it.each([
    ["failed_before_implementation", "failed"],
    ["failed_after_implementation", "failed"],
    ["needs_review_missing_validation", "succeeded"],
    ["needs_review_missing_changed_files", "succeeded"],
    ["validation_failed_then_repaired", "succeeded"],
    ["partial_completion", "succeeded"],
    ["human_decision_pending", "running"],
    ["human_decision_resumed", "succeeded"],
    ["provider_unavailable", "failed"],
    ["closeout_model_timeout", "timed_out"],
  ] as const)("records bounded review for %s", (runtimeOutcome, runtimeJobState) => {
    const review = evaluateCloseoutCapsuleRobustness({
      capsule: capsule(),
      runtimeJobId: "job-1",
      runtimeOutcome,
      runtimeJobState,
      implementationRequired: runtimeOutcome === "needs_review_missing_changed_files",
      changedFileRefs:
        runtimeOutcome === "needs_review_missing_changed_files" ? [] : ["src/example.ts"],
      validationRefs:
        runtimeOutcome === "needs_review_missing_validation" ||
        runtimeOutcome === "partial_completion"
          ? []
          : ["runtime-job://job-1/validation/focused"],
      validationState: runtimeOutcome === "validation_failed_then_repaired" ? "repaired" : "passed",
    });

    expect(review.rawPromptStored).toBe(false);
    expect(review.workQueueLifecycleMutationAllowed).toBe(false);
    expect(review.humanReportState).toBe("accepted");
  });

  it("preserves a bounded model-authored report when secondary opportunity seeds need repair", () => {
    const malformedSeeds = {
      ...capsule(),
      opportunitySeeds: [{ title: "Malformed seed without required fields" }],
    };
    const review = evaluateCloseoutCapsuleRobustness({
      capsule: malformedSeeds,
      runtimeJobId: "job-1",
      runtimeOutcome: "succeeded",
      runtimeJobState: "succeeded",
      changedFileRefs: ["src/example.ts"],
      validationRefs: ["runtime-job://job-1/validation/focused"],
      validationState: "passed",
    });

    expect(review.state).toBe("needs_review");
    expect(review.humanReportState).toBe("accepted");
    expect(review.strictCapsuleState).toBe("needs_repair");
    expect(review.opportunitySeedState).toBe("needs_repair");
  });
});
