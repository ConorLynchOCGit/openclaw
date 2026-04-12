import {
  createMemoryMiddlewarePluginService,
  createMemoryMiddlewareRuntime,
  definePluginEntry,
  memoryMiddlewareConfigSchema,
  type LearnedGuidanceAdvisoryPlanningResult,
  registerMemoryMiddlewareTools,
  type OpenClawPluginApi,
} from "./runtime-api.js";

function isLearnedGuidanceAdvisoryPlanningResult(
  value: unknown,
): value is LearnedGuidanceAdvisoryPlanningResult {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { accepted?: unknown }).accepted === "boolean" &&
    typeof (value as { status?: unknown }).status === "string"
  );
}

export default definePluginEntry({
  id: "memory-middleware",
  name: "Memory Middleware",
  description: "Native scaffold for future candidate-only memory middleware work.",
  configSchema: memoryMiddlewareConfigSchema,
  register(api: OpenClawPluginApi) {
    const runtime = createMemoryMiddlewareRuntime(api);

    registerMemoryMiddlewareTools(api, runtime);
    api.on("before_prompt_build", async (event, ctx) => {
      const compiled = await runtime.contextControl.compilePromptContext({
        prompt: event.prompt,
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
      });
      if (!compiled?.text) {
        return undefined;
      }
      await runtime.outcomeProof.recordPromptAttachment({
        runId: ctx.runId,
        sessionId: ctx.sessionId,
        sessionKey: ctx.sessionKey,
        agentId: ctx.agentId,
        compiled,
      });
      return {
        // Approved-memory packs are turn-managed context, not stable bootstrap text.
        // Keep them out of the cacheable system-prompt lane.
        prependContext: compiled.text,
      };
    });
    api.on("llm_output", async (event, ctx) => {
      await runtime.outcomeProof.recordLlmOutput({
        runId: event.runId ?? ctx.runId,
        sessionId: event.sessionId ?? ctx.sessionId,
        sessionKey: ctx.sessionKey,
      });
    });
    api.on("after_tool_call", async (event, ctx) => {
      if (
        event.toolName !== "memory_learned_guidance_plan" ||
        !isLearnedGuidanceAdvisoryPlanningResult(event.result)
      ) {
        return;
      }
      await runtime.outcomeProof.recordGuidancePlan({
        runId: event.runId ?? ctx.runId,
        sessionId: ctx.sessionId,
        sessionKey: ctx.sessionKey,
        result: event.result,
      });
    });
    api.registerService(
      createMemoryMiddlewarePluginService(
        runtime,
        api.runtime?.events?.onSessionTranscriptUpdate?.bind(api.runtime.events),
      ),
    );
  },
});
