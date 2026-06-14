import { describe, expect, it, vi } from "vitest";
import {
  createStartExecutionSessionTool,
  formatStartExecutionSessionResult,
} from "./start-execution-session-tool.js";

describe("start_execution_session tool", () => {
  it("keeps the model-visible schema to objective, refs, constraints, and validationSignal", () => {
    const tool = createStartExecutionSessionTool({
      startExecutionSession: vi.fn(),
    });
    const schema = JSON.stringify(tool.parameters);

    expect(schema).toContain("objective");
    expect(schema).toContain("refs");
    expect(schema).toContain("constraints");
    expect(schema).toContain("validationSignal");
    expect(schema).toContain('"additionalProperties":false');
    expect(schema).not.toContain("workflowId");
    expect(schema).not.toContain("RequirementMap");
    expect(schema).not.toContain("SchedulerGraphPatch");
    expect(tool.description).toContain("native OpenClaw execution");
    expect(tool.description).toContain("only objective, refs, constraints, and validationSignal");
    expect(tool.description).not.toContain("RequirementMap");
    expect(tool.description).not.toContain("SchedulerGraphPatch");
    expect(tool.description).not.toContain("route schemas");
    expect(tool.description).not.toContain("work orders");
  });

  it("delegates to the runtime-owned start callback and returns concise readback", async () => {
    const startExecutionSession = vi.fn(async () => ({
      status: "started",
      runtimeJobId: "runtime-job-1",
      sessionId: "session-1",
      agentProfile: "execution-orchestrator",
      eventType: "execution.session.started",
    }));
    const tool = createStartExecutionSessionTool({ startExecutionSession });

    const result = await tool.execute("call-start", {
      objective: "Execute the next Work Queue item.",
      refs: [{ ref: "work-queue://item/next", kind: "work_queue_item" }],
      constraints: "Use native sessions.",
      validationSignal: "targeted proof passes",
    });

    expect(startExecutionSession).toHaveBeenCalledWith({
      objective: "Execute the next Work Queue item.",
      refs: [{ ref: "work-queue://item/next", kind: "work_queue_item" }],
      constraints: "Use native sessions.",
      validationSignal: "targeted proof passes",
    });
    expect(result.content).toEqual([
      {
        type: "text",
        text: [
          "Native execution session started.",
          "runtimeJobId: runtime-job-1",
          "sessionId: session-1",
          "agentProfile: execution-orchestrator",
          "event: execution.session.started",
        ].join("\n"),
      },
    ]);
  });

  it("formats readback without hidden evidence refs or workflow objects", () => {
    const text = formatStartExecutionSessionResult({
      status: "already_started",
      runtimeJobId: "runtime-job-2",
      sessionId: "session-2",
    });

    expect(text).toContain("Native execution session already_started.");
    expect(text).not.toContain("RequirementMap");
    expect(text).not.toContain("SchedulerGraphPatch");
    expect(text).not.toContain("workingContext");
  });

  it("formats scheduled launch readback without implying inline completion", () => {
    const text = formatStartExecutionSessionResult({
      status: "started",
      runtimeJobId: "runtime-job-3",
      sessionId: "session-3",
      runStatus: "scheduled",
      runCompleted: false,
      runReasonCodes: ["native_execution_child_session_scheduled_by_resident_supervisor"],
    });

    expect(text).toContain("runStatus: scheduled");
    expect(text).toContain("runCompleted: false");
    expect(text).toContain("native_execution_child_session_scheduled_by_resident_supervisor");
    expect(text).not.toContain("completed.");
  });
});
