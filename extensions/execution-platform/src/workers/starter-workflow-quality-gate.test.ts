import { describe, expect, it } from "vitest";
import type { CloseoutCapsule } from "../codex-bridge/closeout-capsule.ts";
import {
  evaluateStarterWorkflowQualityGate,
  type StarterWorkflowQualityGateInput,
} from "./starter-workflow-quality-gate.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "./test-closeout-capsule-fixture.ts";

function input(
  overrides: Partial<StarterWorkflowQualityGateInput> = {},
): StarterWorkflowQualityGateInput {
  const capsule = createModelAuthoredCloseoutCapsuleFixture({
    runtimeJobId: "job-live-quality",
    workflowId: "single_agent.web_research",
    modelRef: "openai-codex/gpt-5.4",
    modelRunRef: "model-run://job-live-quality/web-researcher",
    artifactRefs: ["runtime-job://job-live-quality/web-research/evidence"],
    validationRefs: ["runtime-job://job-live-quality/validation"],
    reportMarkdown:
      "The web research worker produced bounded current-source evidence, validation refs, limitations, and a task-specific owner closeout.",
    eli5Progress: "OpenClaw looked up the facts, kept safe refs only, and explained the result.",
  });
  return {
    workflowId: "single_agent.web_research",
    workerAdapterId: "worker.web-research.runtime",
    expectedWorkerAdapterId: "worker.web-research.runtime",
    runtimeJobId: "job-live-quality",
    runtimeState: "succeeded",
    roleRefs: ["role://web_researcher"],
    modelRefs: ["openai-codex/gpt-5.4"],
    modelRunRefs: ["model-run://job-live-quality/web-researcher"],
    artifactRefs: ["runtime-job://job-live-quality/web-research/evidence"],
    sourceRefs: ["source://official-docs/structured-output"],
    citationRefs: ["citation://official-docs/structured-output"],
    validationRefs: ["runtime-job://job-live-quality/validation"],
    reviewRefs: ["runtime-job://job-live-quality/review"],
    closeoutCapsule: capsule,
    workQueueReadbackPresent: true,
    limitations: [],
    reasonCodes: ["live_model_work_product_recorded"],
    fixtureEvidenceUsed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawResearchPageStored: false,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    dependencyInstallPerformed: false,
    modelPromotionPerformed: false,
    workQueueLifecycleMutated: false,
    ...overrides,
  };
}

describe("starter workflow quality gate", () => {
  it("accepts bounded model-backed web research evidence", () => {
    expect(evaluateStarterWorkflowQualityGate(input())).toMatchObject({
      acceptedForLiveQuality: true,
      status: "passed",
      reasonCodes: ["starter_workflow_live_quality_gate_passed"],
    });
  });

  it("rejects fixture-only evidence for live quality", () => {
    const result = evaluateStarterWorkflowQualityGate(
      input({
        modelRefs: ["model://fixture-web-researcher"],
        modelRunRefs: ["model-run://fixture"],
        fixtureEvidenceUsed: true,
      }),
    );
    expect(result.acceptedForLiveQuality).toBe(false);
    expect(result.reasonCodes).toContain(
      "fixture_or_injected_evidence_not_accepted_for_live_quality",
    );
  });

  it("blocks missing closeout and Work Queue readback", () => {
    const result = evaluateStarterWorkflowQualityGate(
      input({
        closeoutCapsule: null,
        workQueueReadbackPresent: false,
      }),
    );
    expect(result.acceptedForLiveQuality).toBe(false);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "model_authored_closeout_not_accepted_for_live_quality",
        "work_queue_readback_missing",
      ]),
    );
  });

  it("hard-fails raw storage and lifecycle mutation flags", () => {
    const result = evaluateStarterWorkflowQualityGate(
      input({
        rawPromptStored: true,
        workQueueLifecycleMutated: true,
      }),
    );
    expect(result.status).toBe("failed");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "raw_storage_flag_detected",
        "side_effect_or_lifecycle_mutation_detected",
      ]),
    );
  });

  it("rejects stale coding-team permission fallback for architecture quality", () => {
    const capsule = createModelAuthoredCloseoutCapsuleFixture({
      runtimeJobId: "job-architecture",
      workflowId: "agent_team.architecture",
      modelRef: "openai-codex/gpt-5.4",
      modelRunRef: "model-run://job-architecture/architect",
      artifactRefs: ["runtime-job://job-architecture/architecture/spec"],
      validationRefs: ["runtime-job://job-architecture/validation"],
      reportMarkdown:
        "The architecture worker produced a workflow-specific spec with limitations, validation refs, and owner-facing closeout.",
      eli5Progress: "OpenClaw wrote a plan and showed why it was safe.",
    });
    const result = evaluateStarterWorkflowQualityGate(
      input({
        workflowId: "agent_team.architecture",
        workerAdapterId: "worker.architecture-spec.runtime",
        expectedWorkerAdapterId: "worker.architecture-spec.runtime",
        runtimeJobId: "job-architecture",
        sourceRefs: [],
        citationRefs: [],
        artifactRefs: ["runtime-job://job-architecture/architecture/spec"],
        closeoutCapsule: capsule as CloseoutCapsule,
        reasonCodes: ["coding_team_permission_wrong_workflow"],
      }),
    );
    expect(result.acceptedForLiveQuality).toBe(false);
    expect(result.reasonCodes).toContain("architecture_permission_model_is_coding_fallback");
  });
});
