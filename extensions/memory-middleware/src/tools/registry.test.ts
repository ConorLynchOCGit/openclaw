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
}) {
  return {
    config: {
      learnedGuidanceAdvisoryPlanning: params?.mode
        ? {
            mode: params.mode,
            ...(params.rolloutTarget ? { rolloutTarget: params.rolloutTarget } : {}),
            allowedLessonFamilies: ["generalized_workflow_lesson", "supported_lesson"],
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
});
