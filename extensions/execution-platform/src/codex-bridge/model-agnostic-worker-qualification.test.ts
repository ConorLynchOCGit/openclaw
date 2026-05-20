import { describe, expect, it } from "vitest";
import {
  buildModelAgnosticWorkerQualificationMatrix,
  buildQualificationTaskFamilyResult,
  createModelAgnosticWorkerQualificationRecord,
  evaluateModelPolicyStagePromotionGate,
  MODEL_AGNOSTIC_WORKER_CANDIDATE_PROFILES,
  selectModelAgnosticWorkerCandidate,
} from "./model-agnostic-worker-qualification.ts";

describe("model-agnostic worker qualification matrix", () => {
  it("declares bounded candidate profiles without treating every model as production selectable", () => {
    expect(MODEL_AGNOSTIC_WORKER_CANDIDATE_PROFILES.map((profile) => profile.candidateId)).toEqual(
      expect.arrayContaining([
        "openrouter.moonshotai.kimi-k2.6",
        "openrouter.qwen.qwen3-coder-next",
        "openrouter.deepseek.deepseek-v4-flash",
        "openrouter.deepseek.deepseek-v4-pro",
        "codex.policy.strongest-coding",
      ]),
    );
    for (const profile of MODEL_AGNOSTIC_WORKER_CANDIDATE_PROFILES) {
      expect(profile.rawPromptStored).toBe(false);
      expect(profile.rawResponseStored).toBe(false);
      expect(profile.rawProviderLogStored).toBe(false);
      expect(profile.toolProfileRefs.length).toBeGreaterThan(0);
    }
  });

  it("selects the cheapest qualified model for a task family", () => {
    const kimi = createModelAgnosticWorkerQualificationRecord({
      candidateId: "openrouter.moonshotai.kimi-k2.6",
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      taskFamilies: [
        buildQualificationTaskFamilyResult({
          taskFamily: "small_source_edit",
          status: "production_qualified",
          evidenceRefs: [
            ".artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json",
          ],
          modelRunRefs: ["openrouter://non-codex-tool-using-worker/kimi"],
          changedFileRefs: [
            "extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.ts",
          ],
          validationRefs: ["validation://passed"],
          liveModelCallMade: true,
          liveSourceEditMade: true,
        }),
      ],
    });
    const codex = createModelAgnosticWorkerQualificationRecord({
      candidateId: "codex.policy.strongest-coding",
      modelRef: "policy.codex.strongest-coding",
      providerPath: "codex_app_server",
      taskFamilies: [
        buildQualificationTaskFamilyResult({
          taskFamily: "small_source_edit",
          status: "production_qualified",
          evidenceRefs: ["artifact://codex/parity"],
          modelRunRefs: ["codex-app-server://run"],
          changedFileRefs: ["src/a.ts"],
          validationRefs: ["validation://passed"],
          liveModelCallMade: true,
          liveSourceEditMade: true,
        }),
      ],
    });
    const matrix = buildModelAgnosticWorkerQualificationMatrix({ records: [codex, kimi] });
    const selected = selectModelAgnosticWorkerCandidate({
      taskFamily: "small_source_edit",
      specializationId: "kimi_implementation",
      matrix,
    });

    expect(selected.profile?.candidateId).toBe("openrouter.moonshotai.kimi-k2.6");
    expect(selected.reasonCodes).toContain("model_agnostic_worker_candidate_selected");
    expect(selected.recommendation.requiredEvidenceRefs).toContain(
      ".artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json",
    );
  });

  it("does not select an unqualified candidate for production source edits", () => {
    const deepseek = createModelAgnosticWorkerQualificationRecord({
      candidateId: "openrouter.deepseek.deepseek-v4-flash",
      modelRef: "deepseek/deepseek-v4-flash",
      providerPath: "openrouter",
      taskFamilies: [
        buildQualificationTaskFamilyResult({
          taskFamily: "small_source_edit",
          status: "candidate",
          evidenceRefs: ["artifact://deepseek/context-only"],
          modelRunRefs: ["openrouter://deepseek/run"],
          liveModelCallMade: true,
          liveSourceEditMade: false,
          reasonCodes: ["live_model_call_passed_but_no_source_edit_evidence"],
        }),
      ],
    });
    const matrix = buildModelAgnosticWorkerQualificationMatrix({ records: [deepseek] });
    const selected = selectModelAgnosticWorkerCandidate({
      taskFamily: "small_source_edit",
      matrix,
    });

    expect(selected.profile).toBeNull();
    expect(selected.reasonCodes).toContain("model_agnostic_worker_candidate_not_selectable");
  });

  it("allows read-only support models to qualify for context and validation families only with matching evidence", () => {
    const flash = createModelAgnosticWorkerQualificationRecord({
      candidateId: "openrouter.deepseek.deepseek-v4-flash",
      modelRef: "deepseek/deepseek-v4-flash",
      providerPath: "openrouter",
      taskFamilies: [
        buildQualificationTaskFamilyResult({
          taskFamily: "repo_context_scout",
          status: "production_qualified",
          evidenceRefs: ["artifact://deepseek/context-scout-quality"],
          modelRunRefs: ["openrouter://deepseek/context-run"],
          liveModelCallMade: true,
          liveSourceEditMade: false,
        }),
        buildQualificationTaskFamilyResult({
          taskFamily: "validation_failure_explanation",
          status: "production_qualified",
          evidenceRefs: ["artifact://deepseek/validation-explainer-quality"],
          modelRunRefs: ["openrouter://deepseek/validation-run"],
          liveModelCallMade: true,
          liveSourceEditMade: false,
        }),
      ],
    });
    const matrix = buildModelAgnosticWorkerQualificationMatrix({ records: [flash] });

    expect(
      selectModelAgnosticWorkerCandidate({
        taskFamily: "repo_context_scout",
        specializationId: "non_codex_context_scout",
        matrix,
      }).profile?.candidateId,
    ).toBe("openrouter.deepseek.deepseek-v4-flash");
    expect(
      selectModelAgnosticWorkerCandidate({
        taskFamily: "validation_failure_explanation",
        specializationId: "non_codex_validation_failure_explainer",
        matrix,
      }).profile?.candidateId,
    ).toBe("openrouter.deepseek.deepseek-v4-flash");
  });

  it("blocks router and context-scout Qwen default promotion until stage gates pass", () => {
    const blocked = evaluateModelPolicyStagePromotionGate({
      stage: "router_front_door",
      candidateId: "openrouter.qwen.qwen3-coder-next",
      observations: [
        {
          stage: "router_front_door",
          candidateId: "openrouter.qwen.qwen3-coder-next",
          validOutput: true,
          latencyMs: 2_000,
          evidenceRef: "artifact://qwen/router/1",
        },
      ],
    });

    expect(blocked.status).toBe("blocked");
    expect(blocked.reasonCodes).toContain("model_policy_stage_gate_insufficient_runs");
    expect(blocked.reasonCodes).toContain(
      "qwen_router_context_default_promotion_requires_stage_gate",
    );

    const passed = evaluateModelPolicyStagePromotionGate({
      stage: "context_scout",
      candidateId: "openrouter.qwen.qwen3-coder-next",
      observations: Array.from({ length: 8 }, (_, index) => ({
        stage: "context_scout" as const,
        candidateId: "openrouter.qwen.qwen3-coder-next",
        validOutput: true,
        latencyMs: 3_000 + index,
        evidenceRef: `artifact://qwen/context/${index + 1}`,
      })),
    });

    expect(passed.status).toBe("passed");
    expect(passed.reasonCodes).toEqual([]);
    expect(passed.evidenceRefs).toHaveLength(8);
  });
});
