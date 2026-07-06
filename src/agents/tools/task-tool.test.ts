// Foreground task tool tests cover manager-style subagent delegation without
// exposing raw sessions_spawn/sessions_yield lifecycle mechanics to the parent.
import { createHash } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const spawnSubagentDirectMock = vi.fn();
  const waitForAgentRunMock = vi.fn();
  const readLatestAssistantReplyMock = vi.fn();
  return {
    spawnSubagentDirectMock,
    waitForAgentRunMock,
    readLatestAssistantReplyMock,
  };
});

vi.mock("../subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => hoisted.spawnSubagentDirectMock(...args),
}));

vi.mock("../run-wait.js", () => ({
  waitForAgentRun: (...args: unknown[]) => hoisted.waitForAgentRunMock(...args),
  readLatestAssistantReply: (...args: unknown[]) => hoisted.readLatestAssistantReplyMock(...args),
}));

let createTaskTool: typeof import("./task-tool.js").createTaskTool;

function digestText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("task tool", () => {
  beforeAll(async () => {
    ({ createTaskTool } = await import("./task-tool.js"));
  });

  beforeEach(() => {
    hoisted.spawnSubagentDirectMock.mockReset().mockResolvedValue({
      status: "accepted",
      childSessionKey: "agent:codebase-researcher:subagent:child",
      childSessionId: "session-child",
      runId: "run-child",
      resolvedProvider: "openrouter",
      resolvedModel: "anthropic/claude-haiku-4.5",
    });
    hoisted.waitForAgentRunMock.mockReset().mockResolvedValue({
      status: "ok",
    });
    hoisted.readLatestAssistantReplyMock.mockReset().mockResolvedValue("Context Pack\n\nP1...");
  });

  it("runs a native foreground child and returns the final assistant text", async () => {
    const tool = createTaskTool({
      agentSessionKey: "agent:planning:main",
      parentRunId: "run-parent",
      requesterAgentIdOverride: "planning",
      workspaceDir: "/workspace",
      inheritedToolDenylist: ["gateway"],
    });
    expect(tool.executionMode).toBe("parallel");

    const result = await tool.execute("call-1", {
      agentId: "codebase-researcher",
      task: "Inspect source and return a Context Pack.",
      taskName: "codebase_scan",
      context: "isolated",
    });

    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "codebase-researcher",
        task: "Inspect source and return a Context Pack.",
        taskName: "codebase_scan",
        mode: "run",
        cleanup: "keep",
        sandbox: "inherit",
        context: "isolated",
        lightContext: true,
        expectsCompletionMessage: false,
      }),
      expect.objectContaining({
        agentSessionKey: "agent:planning:main",
        parentRunId: "run-parent",
        completionOwnerKey: "agent:planning:main",
        requesterAgentIdOverride: "planning",
        workspaceDir: "/workspace",
      }),
    );
    const spawnContext = hoisted.spawnSubagentDirectMock.mock.calls[0]?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(spawnContext).not.toHaveProperty("inheritedToolDenylist");
    expect(hoisted.waitForAgentRunMock).toHaveBeenCalledWith({
      runId: "run-child",
      timeoutMs: 60_000,
    });
    expect(hoisted.readLatestAssistantReplyMock).toHaveBeenCalledWith({
      sessionKey: "agent:codebase-researcher:subagent:child",
    });
    expect(result.details).toMatchObject({
      status: "ok",
      childSessionKey: "agent:codebase-researcher:subagent:child",
      childSessionId: "session-child",
      runId: "run-child",
      agentId: "codebase-researcher",
      taskName: "codebase_scan",
      childResult: true,
      producerAgentId: "codebase-researcher",
      ownerAgentId: "planning",
      sourceSessionKey: "agent:codebase-researcher:subagent:child",
      sourceRunId: "run-child",
      contentDigest: digestText("Context Pack\n\nP1..."),
      contentChars: "Context Pack\n\nP1...".length,
      contentTruncated: false,
      resultChars: "Context Pack\n\nP1...".length,
      resultTruncated: false,
      resultInline: true,
      resultMode: "inline",
      resultRef: "openclaw-session:agent:codebase-researcher:subagent:child",
      transcriptFinalRef:
        "openclaw-session:agent:codebase-researcher:subagent:child:latest-assistant",
      resolvedProvider: "openrouter",
      resolvedModel: "anthropic/claude-haiku-4.5",
    });
    expect(result.details).not.toHaveProperty("resultPreview");
    expect(JSON.stringify(result.details)).not.toContain('"result":"Context Pack');
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).toContain("<task_result>");
    expect(content.text).toContain('childSessionId="session-child"');
    expect(content.text).toContain(`contentDigest="${digestText("Context Pack\n\nP1...")}"`);
    expect(content.text).toContain('contentTruncated="false"');
    expect(content.text).toContain("Context Pack\n\nP1...");
  });

  it("returns native child transcript pointers instead of large child finals as parent context", async () => {
    const largePlanningResult = `# Approval Packet\n\n${"substantive planning evidence\n".repeat(650)}`;
    const finalPlanningResult = largePlanningResult.trim();
    hoisted.readLatestAssistantReplyMock.mockResolvedValue(largePlanningResult);

    const result = await createTaskTool().execute("call-1", {
      agentId: "planning",
      task: "Produce the approval packet.",
    });

    expect(result.details).toMatchObject({
      status: "ok",
      childSessionKey: "agent:codebase-researcher:subagent:child",
      childSessionId: "session-child",
      runId: "run-child",
      agentId: "planning",
      contentDigest: digestText(finalPlanningResult),
      contentChars: finalPlanningResult.length,
      resultChars: finalPlanningResult.length,
      resultInline: false,
      resultMode: "pointer",
      resultRef: "openclaw-session:agent:codebase-researcher:subagent:child",
      transcriptFinalRef:
        "openclaw-session:agent:codebase-researcher:subagent:child:latest-assistant",
    });
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).toContain('resultInline="false"');
    expect(content.text).toContain('childSessionId="session-child"');
    expect(content.text).toContain("<task_result_ref");
    expect(content.text).toContain("full result remains in the child session transcript");
    expect(content.text).not.toContain("<task_result>");
    expect(content.text).not.toContain("substantive planning evidence");
  });

  it("keeps waiting through agent.wait timeout without turning it into task failure", async () => {
    hoisted.waitForAgentRunMock
      .mockResolvedValueOnce({ status: "timeout" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "ok" });

    const result = await createTaskTool().execute("call-1", {
      agentId: "reviewer",
      task: "Review the draft.",
    });

    expect(hoisted.waitForAgentRunMock).toHaveBeenCalledTimes(3);
    expect(result.details).toMatchObject({
      status: "ok",
      agentId: "reviewer",
    });
    expect(result.details).not.toHaveProperty("resultPreview");
  });

  it("emits progress while waiting through foreground child polls", async () => {
    const onProgress = vi.fn();
    hoisted.waitForAgentRunMock
      .mockResolvedValueOnce({ status: "timeout" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "ok" });

    const result = await createTaskTool({ onProgress }).execute("call-1", {
      agentId: "coding",
      task: "Implement the approved brief.",
    });

    expect(result.details).toMatchObject({
      status: "ok",
      agentId: "coding",
    });
    expect(onProgress).toHaveBeenCalledTimes(7);
  });

  it("passes lightweight context through to native foreground children", async () => {
    const result = await createTaskTool().execute("call-1", {
      agentId: "codebase-researcher",
      task: "Inspect the narrow source question and return a Context Pack.",
      lightContext: true,
    });

    expect(result.details).toMatchObject({
      status: "ok",
      agentId: "codebase-researcher",
    });
    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "codebase-researcher",
        lightContext: true,
      }),
      expect.any(Object),
    );
  });

  it("defaults source-shaped foreground children to lightweight context", async () => {
    const result = await createTaskTool().execute("call-1", {
      agentId: "web-researcher",
      task: "Inspect current public examples and return a bounded Context Pack.",
    });

    expect(result.details).toMatchObject({
      status: "ok",
      agentId: "web-researcher",
    });
    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "web-researcher",
        lightContext: true,
      }),
      expect.any(Object),
    );
  });

  it("lets callers disable lightweight context when a child needs full context", async () => {
    await createTaskTool().execute("call-1", {
      agentId: "codebase-researcher",
      task: "Inspect source and return a Context Pack.",
      lightContext: false,
    });

    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "codebase-researcher",
        lightContext: false,
      }),
      expect.any(Object),
    );
  });

  it("treats a later child assistant final as success when task wait reports an earlier error", async () => {
    hoisted.waitForAgentRunMock.mockResolvedValue({
      status: "error",
      error: "Context overflow: prompt too large for the model.",
    });
    hoisted.readLatestAssistantReplyMock.mockResolvedValue(
      "Context Pack\n\nP1. Useful evidence before overflow.",
    );

    const result = await createTaskTool().execute("call-1", {
      agentId: "codebase-researcher",
      task: "Inspect source and return a Context Pack.",
    });

    expect(hoisted.readLatestAssistantReplyMock).toHaveBeenCalledWith({
      sessionKey: "agent:codebase-researcher:subagent:child",
    });
    expect(result.details).toMatchObject({
      status: "ok",
      childResult: true,
      producerAgentId: "codebase-researcher",
      contentDigest: digestText("Context Pack\n\nP1. Useful evidence before overflow."),
      contentChars: "Context Pack\n\nP1. Useful evidence before overflow.".length,
      contentTruncated: false,
      resultChars: "Context Pack\n\nP1. Useful evidence before overflow.".length,
      resultTruncated: false,
      recoveryHistory: [
        {
          source: "task_wait",
          status: "error",
          error: "Context overflow: prompt too large for the model.",
        },
      ],
    });
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).toContain("<task_result>");
    expect(content.text).toContain('contentTruncated="false"');
    expect(content.text).toContain("<task_recovery_history>");
    expect(content.text).toContain("Context overflow");
    expect(content.text).toContain("Useful evidence before overflow");
  });

  it("does not duplicate long child output in both model text and details", async () => {
    const longPacket = `# Context Pack\n\n${"plan-shaping evidence ".repeat(2200)}`;
    hoisted.readLatestAssistantReplyMock.mockResolvedValue(longPacket);

    const result = await createTaskTool().execute("call-1", {
      agentId: "codebase-researcher",
      task: "Return a long Context Pack.",
    });

    const serializedDetails = JSON.stringify(result.details);
    expect(hoisted.readLatestAssistantReplyMock).toHaveBeenCalledWith({
      sessionKey: "agent:codebase-researcher:subagent:child",
    });
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).toContain("<task_result_ref");
    expect(content.text).toContain("full result remains in the child session transcript");
    expect(content.text).not.toContain(longPacket.trim());
    expect(serializedDetails.length).toBeLessThan(longPacket.length);
    expect(serializedDetails).not.toContain("plan-shaping evidence ".repeat(100));
    expect(serializedDetails).not.toContain("preview truncated");
    expect(result.details).not.toHaveProperty("resultPreview");
    expect(result.details).toMatchObject({
      resultChars: longPacket.trim().length,
      resultTruncated: false,
      resultInline: false,
      resultMode: "pointer",
    });
  });
});
