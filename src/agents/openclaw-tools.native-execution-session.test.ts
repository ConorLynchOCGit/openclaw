import { describe, expect, it, vi } from "vitest";
import "./test-helpers/fast-openclaw-tools-sessions.js";
import { createOpenClawTools } from "./openclaw-tools.js";

describe("openclaw-tools native execution session routing", () => {
  it("omits start_execution_session unless a runtime launcher is injected", () => {
    const tools = createOpenClawTools({
      workspaceDir: "/root/services/openclaw-roles/live",
      disablePluginTools: true,
    });

    expect(tools.map((tool) => tool.name)).not.toContain("start_execution_session");
  });

  it("includes start_execution_session when the runtime owns the launcher", async () => {
    const startExecutionSession = vi.fn(async () => ({
      status: "started",
      runtimeJobId: "runtime-job-native",
      sessionId: "session-native",
      agentProfile: "execution-orchestrator",
      eventType: "execution.session.started",
    }));
    const readWorkQueueEligibility = vi.fn(async () => ({
      artifactKind: "work_queue_execution_eligibility_read_model" as const,
      eligible: [],
      excluded: [],
      source: "execution_platform_work_queue_db",
      ranking: "db_queue_rank_only" as const,
      semanticExecutorSelection: false as const,
      workQueueLifecycleMutationAllowed: false as const,
    }));
    const tools = createOpenClawTools({
      workspaceDir: "/root/services/openclaw-roles/live",
      disablePluginTools: true,
      nativeExecutionSession: {
        enabled: true,
        startExecutionSession,
        readWorkQueueEligibility,
      },
    });
    expect(tools.map((candidate) => candidate.name)).toContain("work_queue_execution_eligibility");
    const tool = tools.find((candidate) => candidate.name === "start_execution_session");
    expect(tool).toBeDefined();

    const result = await tool!.execute("call-native-execution", {
      objective: "Execute a native RuntimeJob-backed session.",
      refs: ["work-queue://item/native-execution"],
    });

    expect(startExecutionSession).toHaveBeenCalledWith({
      objective: "Execute a native RuntimeJob-backed session.",
      refs: ["work-queue://item/native-execution"],
    });
    expect(result.content?.[0]).toEqual({
      type: "text",
      text: [
        "Native execution session started.",
        "runtimeJobId: runtime-job-native",
        "sessionId: session-native",
        "agentProfile: execution-orchestrator",
        "event: execution.session.started",
      ].join("\n"),
    });
  });
});
