import { describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../../test/helpers/plugins/plugin-api.js";
import type { OpenClawPluginToolFactory } from "./api.js";
import memoryMiddlewarePlugin from "./index.js";
import type { OpenClawPluginApi } from "./runtime-api.js";

function createApi() {
  const registerService = vi.fn();
  const registerTool = vi.fn();
  const api = createTestPluginApi({
    id: "memory-middleware",
    name: "Memory Middleware",
    source: "test",
    config: {},
    runtime: {} as OpenClawPluginApi["runtime"],
    registerService,
    registerTool,
  }) as OpenClawPluginApi;

  return { api, registerService, registerTool };
}

describe("memory-middleware plugin", () => {
  it("keeps the plugin non-exclusive while registering the bounded middleware tool surfaces", () => {
    const { api, registerService, registerTool } = createApi();

    memoryMiddlewarePlugin.register(api);

    expect(memoryMiddlewarePlugin).not.toHaveProperty("kind");
    expect(registerTool).toHaveBeenCalledTimes(43);
    const toolNames = registerTool.mock.calls.map((call) => {
      const toolFactory = call[0] as OpenClawPluginToolFactory;
      const tool = toolFactory({ sessionId: "session-1", agentId: "agent-1" });
      expect(tool).toBeTruthy();
      expect(Array.isArray(tool)).toBe(false);
      return tool && !Array.isArray(tool) ? tool.name : undefined;
    });
    expect(toolNames).toEqual([
      "memory_candidate_submit",
      "memory_self_improving_capture_candidate",
      "memory_candidate_list",
      "memory_candidate_get",
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
      "memory_candidate_review",
      "memory_candidate_promote_plan",
      "memory_candidate_promote_memory",
      "memory_candidate_promote_procedure",
      "memory_procedure_validate_plan",
      "memory_procedure_validate",
      "memory_skill_candidate_approval_plan",
      "memory_skill_candidate_approve",
      "memory_skill_candidate_install_handoff",
      "memory_skill_candidate_install_record_create",
      "memory_skill_candidate_plan",
      "memory_skill_candidate_create",
      "memory_skill_candidate_procurement_plan",
      "memory_skill_candidate_procurement_record_create",
      "memory_skill_candidate_skill_vetter_handoff",
      "memory_skill_candidate_vetting_result_record",
    ]);
    expect(registerService).toHaveBeenCalledTimes(1);
    expect(registerService).toHaveBeenCalledWith(
      expect.objectContaining({ id: "memory-middleware-base" }),
    );
  });
});
