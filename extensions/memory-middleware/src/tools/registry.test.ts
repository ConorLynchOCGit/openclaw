import { describe, expect, it, vi } from "vitest";
import type { OpenClawPluginApi } from "../../api.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { registerMemoryMiddlewareTools } from "./registry.js";

function createApi() {
  const registerTool = vi.fn();
  return {
    registerTool,
  } as unknown as OpenClawPluginApi & {
    registerTool: ReturnType<typeof vi.fn>;
  };
}

function createRuntime(params?: {
  mode?: "disabled" | "inline-only";
  rolloutTarget?: "off-production" | "production-canary";
  candidateIngressMode?:
    | "disabled"
    | "conversational-review"
    | "promote-procedure-draft"
    | "validate-procedure"
    | "candidate-only"
    | "submit-review-only";
  selfImprovingMode?: "disabled" | "candidate-only";
  selfImprovingRolloutTarget?: "off-production" | "production-canary";
}) {
  return {
    config: {
      candidateIngress: {
        mode: params?.candidateIngressMode ?? "disabled",
      },
      selfImprovingCapture: params?.selfImprovingMode
        ? {
            mode: params.selfImprovingMode,
            ...(params.selfImprovingRolloutTarget
              ? { rolloutTarget: params.selfImprovingRolloutTarget }
              : {}),
            allowedCaptureClasses: ["workflow_generalized_guidance"],
          }
        : undefined,
      learnedGuidanceAdvisoryPlanning: params?.mode
        ? {
            mode: params.mode,
            ...(params.rolloutTarget ? { rolloutTarget: params.rolloutTarget } : {}),
            allowedCaptureClasses: ["workflow_generalized_guidance"],
            defaultMaxSuggestions: 3,
          }
        : undefined,
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory middleware tool registry", () => {
  it("does not register learned-guidance planning when the rollout target is still default-off", () => {
    const api = createApi();
    registerMemoryMiddlewareTools(api, createRuntime({ mode: "inline-only" }));

    const names = api.registerTool.mock.calls.map(([, opts]) => opts?.name);
    expect(names).not.toContain("memory_learned_guidance_plan");
  });

  it("registers learned-guidance planning when production-canary rollout is explicitly enabled", () => {
    const api = createApi();
    registerMemoryMiddlewareTools(
      api,
      createRuntime({
        mode: "inline-only",
        rolloutTarget: "production-canary",
      }),
    );

    const names = api.registerTool.mock.calls.map(([, opts]) => opts?.name);
    expect(names).toContain("memory_learned_guidance_plan");
  });

  it("hides self-improving and review-only tools when the current runtime posture does not enable them", () => {
    const api = createApi();
    registerMemoryMiddlewareTools(api, createRuntime());

    const names = api.registerTool.mock.calls.map(([, opts]) => opts?.name);
    expect(names).not.toContain("memory_self_improving_capture_candidate");
    expect(names).not.toContain("memory_candidate_review");
    expect(names).not.toContain("memory_candidate_review_prompt");
  });

  it("registers conversational review and self-improving tools when the runtime posture enables them", () => {
    const api = createApi();
    registerMemoryMiddlewareTools(
      api,
      createRuntime({
        candidateIngressMode: "conversational-review",
        selfImprovingMode: "candidate-only",
        selfImprovingRolloutTarget: "off-production",
      }),
    );

    const names = api.registerTool.mock.calls.map(([, opts]) => opts?.name);
    expect(names).toContain("memory_self_improving_capture_candidate");
    expect(names).toContain("memory_candidate_review");
    expect(names).toContain("memory_candidate_review_prompt");
  });

  it("registers candidate promotion planning once procedure-draft promotion is enabled", () => {
    const api = createApi();
    registerMemoryMiddlewareTools(
      api,
      createRuntime({
        candidateIngressMode: "promote-procedure-draft",
      }),
    );

    const names = api.registerTool.mock.calls.map(([, opts]) => opts?.name);
    expect(names).toContain("memory_candidate_promote_plan");
    expect(names).toContain("memory_candidate_promote_procedure");
  });

  it("registers procedure-validation planning once the validate-procedure stage is enabled", () => {
    const api = createApi();
    registerMemoryMiddlewareTools(
      api,
      createRuntime({
        candidateIngressMode: "validate-procedure",
      }),
    );

    const names = api.registerTool.mock.calls.map(([, opts]) => opts?.name);
    expect(names).toContain("memory_procedure_validate_plan");
    expect(names).toContain("memory_procedure_validate");
  });
});
