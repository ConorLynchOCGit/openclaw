// Foreground task tool tests cover manager-style subagent delegation without
// exposing raw sessions_spawn/sessions_yield lifecycle mechanics to the parent.
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

describe("task tool", () => {
  beforeAll(async () => {
    ({ createTaskTool } = await import("./task-tool.js"));
  });

  beforeEach(() => {
    hoisted.spawnSubagentDirectMock.mockReset().mockResolvedValue({
      status: "accepted",
      childSessionKey: "agent:codebase-researcher:subagent:child",
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
        expectsCompletionMessage: false,
      }),
      expect.objectContaining({
        agentSessionKey: "agent:planning:main",
        completionOwnerKey: "agent:planning:main",
        requesterAgentIdOverride: "planning",
        workspaceDir: "/workspace",
        inheritedToolDenylist: ["gateway"],
      }),
    );
    expect(hoisted.waitForAgentRunMock).toHaveBeenCalledWith({
      runId: "run-child",
      timeoutMs: 60_000,
    });
    expect(hoisted.readLatestAssistantReplyMock).toHaveBeenCalledWith({
      sessionKey: "agent:codebase-researcher:subagent:child",
      maxChars: 28_000,
    });
    expect(result.details).toMatchObject({
      status: "ok",
      childSessionKey: "agent:codebase-researcher:subagent:child",
      runId: "run-child",
      agentId: "codebase-researcher",
      taskName: "codebase_scan",
      resultPreview: "Context Pack\n\nP1...",
      resultChars: "Context Pack\n\nP1...".length,
      resultTruncated: false,
      resolvedProvider: "openrouter",
      resolvedModel: "anthropic/claude-haiku-4.5",
    });
    expect(JSON.stringify(result.details)).not.toContain('"result":"Context Pack');
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toContain("<task_result>");
    expect(result.content[0]?.text).toContain("Context Pack\n\nP1...");
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
      resultPreview: "Context Pack\n\nP1...",
    });
  });

  it("does not duplicate long child output in both model text and details", async () => {
    const longPacket = `# Context Pack\n\n${"plan-shaping evidence ".repeat(1200)}`;
    hoisted.readLatestAssistantReplyMock.mockResolvedValue(longPacket);

    const result = await createTaskTool().execute("call-1", {
      agentId: "codebase-researcher",
      task: "Return a long Context Pack.",
    });

    const serializedDetails = JSON.stringify(result.details);
    expect(hoisted.readLatestAssistantReplyMock).toHaveBeenCalledWith({
      sessionKey: "agent:codebase-researcher:subagent:child",
      maxChars: 28_000,
    });
    expect(result.content[0]?.text).toContain(longPacket.trim());
    expect(serializedDetails.length).toBeLessThan(longPacket.length);
    expect(serializedDetails).not.toContain("plan-shaping evidence ".repeat(100));
    expect(result.details).toMatchObject({
      resultChars: longPacket.trim().length,
      resultTruncated: false,
    });
  });
});
