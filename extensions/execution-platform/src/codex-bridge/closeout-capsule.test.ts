import { describe, expect, it } from "vitest";
import {
  closeoutCapsuleToLegacyHumanSummary,
  parseCloseoutCapsule,
  validateCloseoutCapsule,
  type CloseoutCapsule,
} from "./closeout-capsule.ts";

function validCapsule(overrides: Partial<CloseoutCapsule> = {}): CloseoutCapsule {
  return {
    artifactKind: "execution_platform_closeout_capsule",
    schemaVersion: "execution-platform.closeout-capsule.v1",
    capsuleId: "closeout-capsule-test",
    createdAt: "2026-05-08T00:00:00.000Z",
    modelRef: "openai-codex/gpt-5.4",
    humanReport: {
      source: "model",
      reportMarkdown: "Implemented the task, validated it, and found one follow-up.",
      eli5Progress: "The team now leaves a useful receipt instead of a machine status dump.",
      limitations: ["full live soak still required"],
    },
    structuredSummary: {
      taskSuccess: "satisfied",
      qualityAssessment: "The work product matches the bounded objective.",
      workflowFitAssessment: "The coding workflow was a reasonable fit.",
      agentModelFitAssessment: "The model mix was adequate for this task.",
      missingWork: [],
      validationSummary: "Focused tests passed.",
      riskSummary: "Residual risk is limited to live soak coverage.",
      opportunitySeedIds: ["seed-1"],
    },
    roleCloseouts: [
      {
        roleId: "implementation_engineer",
        agentId: "implementation_engineer",
        modelRef: "openai-codex/gpt-5.4",
        source: "model",
        askedToDo: "Implement Closeout Capsule readback.",
        actuallyDid: "Added schema, reporter, and readback surfaces.",
        worked: ["schema stayed bounded"],
        failedOrWeak: [],
        wouldImproveNext: ["run live soak"],
        opportunitySeeds: [],
        confidence: "high",
        limitations: ["not live-soaked yet"],
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
        kind: "proactive_plan",
        title: "Closeout Capsule Soak",
        rationale: "The capsule path needs live owner proof.",
        recommendedNextStep: "Run the three-prompt closeout soak.",
        evidenceRefs: ["runtime-job://job-1/closeout"],
        confidence: "high",
      },
    ],
    factualRefs: {
      runtimeJobId: "job-1",
      teamRunId: "team-1",
      workflowId: "agent_team.coding",
      status: "completed",
      roles: [
        {
          roleId: "implementation_engineer",
          agentId: "implementation_engineer",
          modelRef: "openai-codex/gpt-5.4",
          status: "completed",
        },
      ],
      fileRefs: ["extensions/execution-platform/src/codex-bridge/closeout-capsule.ts"],
      artifactRefs: ["runtime-job://job-1/closeout"],
      validationRefs: ["focused tests"],
      runtimeEventRefs: ["runtime-job://job-1/events"],
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

describe("Closeout Capsule", () => {
  it("parses a model-authored capsule", () => {
    expect(parseCloseoutCapsule(validCapsule()).humanReport.source).toBe("model");
  });

  it("rejects raw storage flags", () => {
    expect(() =>
      parseCloseoutCapsule({
        ...validCapsule(),
        safetyFlags: { ...validCapsule().safetyFlags, rawPromptStored: true },
      }),
    ).toThrow();
  });

  it("does not allow deterministic fallback to satisfy successful closeout", () => {
    const result = validateCloseoutCapsule({
      ...validCapsule(),
      humanReport: { ...validCapsule().humanReport, source: "degraded_system_fallback" },
    });
    expect(result.valid).toBe(false);
    expect(result.blockingReasons).toContain("closeout_capsule_human_report_not_model_authored");
  });

  it("creates legacy summary as compatibility projection from capsule", () => {
    const summary = closeoutCapsuleToLegacyHumanSummary(validCapsule());
    expect(summary.eli5Progress).toContain("useful receipt");
    expect(summary.rawPromptStored).toBe(false);
  });
});
