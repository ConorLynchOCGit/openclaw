import { describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../../test/helpers/plugins/plugin-api.js";
import type { OpenClawPluginToolFactory } from "./api.js";
import memoryMiddlewarePlugin from "./index.js";
import type { OpenClawPluginApi } from "./runtime-api.js";

function createApi() {
  const registerService = vi.fn();
  const registerTool = vi.fn();
  const on = vi.fn();
  const api = createTestPluginApi({
    id: "memory-middleware",
    name: "Memory Middleware",
    source: "test",
    config: {},
    runtime: {} as OpenClawPluginApi["runtime"],
    registerService,
    registerTool,
    on,
  }) as OpenClawPluginApi;

  return { api, registerService, registerTool, on };
}

describe("memory-middleware plugin", () => {
  it("keeps the plugin non-exclusive while registering the bounded middleware tool surfaces", () => {
    const { api, registerService, registerTool, on } = createApi();

    memoryMiddlewarePlugin.register(api);

    expect(memoryMiddlewarePlugin).not.toHaveProperty("kind");
    expect(registerTool).toHaveBeenCalledTimes(24);
    const toolNames = registerTool.mock.calls.map((call) => {
      const toolFactory = call[0] as OpenClawPluginToolFactory;
      const tool = toolFactory({ sessionId: "session-1", agentId: "agent-1" });
      expect(tool).toBeTruthy();
      expect(Array.isArray(tool)).toBe(false);
      return tool && !Array.isArray(tool) ? tool.name : undefined;
    });
    expect(toolNames).toEqual([
      "memory_candidate_submit",
      "memory_object_list",
      "memory_object_get",
      "memory_object_search_basic",
      "memory_object_search_hybrid",
      "memory_object_search_semantic",
      "memory_tool_result_persist",
      "memory_tool_result_get",
      "memory_tool_result_microcompact_plan",
      "memory_tool_result_microcompact_execute",
      "memory_compaction_plan",
      "memory_session_get",
      "memory_session_update",
      "memory_session_compact_execute",
      "memory_full_compaction_fallback_execute",
      "memory_drift_check_execute",
      "memory_consolidation_execute",
      "memory_consolidation_plan",
      "memory_proactive_plan",
      "memory_proactive_execute",
      "memory_background_job_enqueue",
      "memory_background_job_list",
      "memory_background_job_get",
      "memory_background_job_run_next",
    ]);
    expect(registerService).toHaveBeenCalledTimes(1);
    expect(registerService).toHaveBeenCalledWith(
      expect.objectContaining({ id: "memory-middleware-base" }),
    );
    expect(on).toHaveBeenCalledWith("before_prompt_build", expect.any(Function));
    expect(on).toHaveBeenCalledWith("llm_output", expect.any(Function));
    expect(on).toHaveBeenCalledWith("after_tool_call", expect.any(Function));
  });
});
