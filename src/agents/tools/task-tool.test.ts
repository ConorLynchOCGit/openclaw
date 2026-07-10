// Foreground task tool tests cover manager-style subagent delegation without
// exposing raw sessions_spawn/sessions_yield lifecycle mechanics to the parent.
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
let buildTaskTranscriptFinalRef: typeof import("./task-tool.js").buildTaskTranscriptFinalRef;

function digestText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("task tool", () => {
  beforeAll(async () => {
    ({ createTaskTool, buildTaskTranscriptFinalRef } = await import("./task-tool.js"));
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
      resultRef: "openclaw-transcript://agent%3Acodebase-researcher%3Asubagent%3Achild#session",
      resultSource: "transcript",
      transcriptFinalRef:
        "openclaw-transcript://agent%3Acodebase-researcher%3Asubagent%3Achild#assistant:last",
      previewOnly: false,
      previewChars: 0,
      displayTruncated: false,
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

  it("renders deployed host provenance paths as live-workspace paths before child handoff", async () => {
    await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "coding",
      task: [
        "Use /srv/openclaw-next/home-repo/docs/projects/execution-platform/prompts/proof.md",
        "Patch /srv/openclaw-next/src/openclaw/src/agents/tools/task-tool.ts",
        "Check /srv/openclaw-next/home-repo/docs/agents/coding/AGENTS.md",
      ].join("\n"),
      cwd: "/srv/openclaw-next/src/openclaw",
    });

    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining(
          [
            "Use docs/projects/execution-platform/prompts/proof.md",
            "Patch src/openclaw/src/agents/tools/task-tool.ts",
            "Check docs/agents/coding/AGENTS.md",
          ].join("\n"),
        ),
        cwd: "src/openclaw",
      }),
      expect.anything(),
    );
    const spawnArgs = JSON.stringify(hoisted.spawnSubagentDirectMock.mock.calls[0]?.[0]);
    expect(spawnArgs).toContain("Coding Artifact Handoff Contract");
    expect(spawnArgs).toContain("read that file in full before implementation");
    expect(spawnArgs).not.toContain("/root/");
    expect(spawnArgs).not.toContain("/srv/");
    expect(spawnArgs).not.toContain("/root/services");
    expect(spawnArgs).not.toContain("/srv/openclaw-next");
  });

  it("rejects ambiguous root checkout paths before child handoff", async () => {
    const result = await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "coding",
      task: "Use /root/services/openclaw-roles/live/docs/projects/execution-platform/prompts/proof.md",
    });

    expect(hoisted.spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      status: "error",
      error:
        "task handoff contains host-only absolute paths that are not visible to live child agents",
      rejectedHostPaths: [
        "/root/services/openclaw-roles/live/docs/projects/execution-platform/prompts/proof.md",
      ],
    });
  });

  it("forces Main-routed Coding tasks to isolated context even when fork is requested", async () => {
    await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "coding",
      task: "Read docs/projects/execution-platform/prompts/proof.md and implement it.",
      context: "fork",
    });

    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "coding",
        context: "isolated",
        task: expect.stringContaining("Coding Artifact Handoff Contract"),
      }),
      expect.anything(),
    );
  });

  it("rejects unmapped host-only paths before child handoff", async () => {
    const result = await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "coding",
      task: "Read /root/not-visible/proof.md before editing.",
    });

    expect(hoisted.spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      status: "error",
      error:
        "task handoff contains host-only absolute paths that are not visible to live child agents",
      rejectedHostPaths: ["/root/not-visible/proof.md"],
    });
  });

  it("does not treat slash-separated prose as a host path", async () => {
    await createTaskTool({
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    }).execute("call-1", {
      agentId: "reviewer",
      task: "Review policy/approval-route and docs/application-boundary.md.",
    });

    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "Review policy/approval-route and docs/application-boundary.md.",
      }),
      expect.anything(),
    );
  });

  it("inlines bounded untruncated child finals for Planning", async () => {
    const packet = `# Reviewer Packet\n\n${"material evidence\n".repeat(450)}`.trim();
    hoisted.readLatestAssistantReplyMock.mockResolvedValue(packet);

    const result = await createTaskTool({
      agentSessionKey: "agent:planning:main",
      requesterAgentIdOverride: "planning",
    }).execute("call-1", {
      agentId: "reviewer",
      task: "Review the complete candidate.",
    });

    expect(packet.length).toBeGreaterThan(1_800);
    expect(packet.length).toBeLessThan(12_000);
    expect(result.details).toMatchObject({
      resultInline: true,
      resultMode: "inline",
      parentInlineLimitChars: 12_000,
    });
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).toContain(packet);
  });

  it("returns receipt-only task output to Main even when the delegated child result is small", async () => {
    const shortPlanningResult = "Brief Planning artifact that Main must not rewrite.";
    hoisted.readLatestAssistantReplyMock.mockResolvedValue(shortPlanningResult);

    const result = await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "planning",
      task: "Produce a small Planning artifact.",
    });

    expect(result.details).toMatchObject({
      status: "ok",
      childSessionKey: "agent:codebase-researcher:subagent:child",
      agentId: "planning",
      contentDigest: digestText(shortPlanningResult),
      contentChars: shortPlanningResult.length,
      resultChars: shortPlanningResult.length,
      resultInline: false,
      resultMode: "pointer",
      resultSource: "transcript",
      previewOnly: true,
      previewChars: 0,
      displayTruncated: true,
    });
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).toContain("<task_receipt");
    expect(content.text).toContain(
      'ref="openclaw-transcript://agent%3Acodebase-researcher%3Asubagent%3Achild#assistant:last"',
    );
    expect(content.text).toContain(`chars="${shortPlanningResult.length}"`);
    expect(content.text).toContain(`digest="${digestText(shortPlanningResult)}"`);
    expect(content.text).not.toContain('agentId="planning"');
    expect(content.text).not.toContain('status="completed"');
    expect(content.text).not.toContain('source="transcript"');
    expect(content.text).not.toContain("<inspect_command>");
    expect(content.text).not.toContain("<task_result>");
    expect(content.text).not.toContain("<task_result_preview");
    expect(content.text).not.toContain(shortPlanningResult);
  });

  it("infers Main receipt-only behavior from the parent session key", async () => {
    const shortPlanningResult = "Small artifact that should still stay in Planning.";
    hoisted.readLatestAssistantReplyMock.mockResolvedValue(shortPlanningResult);

    const result = await createTaskTool({
      agentSessionKey: "agent:main:operator",
    }).execute("call-1", {
      agentId: "planning",
      task: "Produce a small Planning artifact.",
    });

    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(result.details).toMatchObject({
      resultInline: false,
      resultMode: "pointer",
      resultSource: "transcript",
      previewOnly: true,
    });
    expect(content.text).toContain("<task_receipt");
    expect(content.text).not.toContain(shortPlanningResult);
  });

  it("returns native child transcript pointers instead of large child finals as parent context", async () => {
    const largePlanningResult = `# Approval Packet\n\n${"substantive planning evidence\n".repeat(360)}`;
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
      resultSource: "transcript",
      resultRef: "openclaw-transcript://agent%3Acodebase-researcher%3Asubagent%3Achild#session",
      transcriptFinalRef:
        "openclaw-transcript://agent%3Acodebase-researcher%3Asubagent%3Achild#assistant:last",
      previewOnly: true,
      previewChars: 0,
      displayTruncated: true,
      parentInlineLimitChars: 1_800,
      parentPreviewLimitChars: 0,
    });
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).toContain('resultInline="false"');
    expect(content.text).toContain('childSessionId="session-child"');
    expect(content.text).toContain("<task_result_ref");
    expect(content.text).toContain(
      'ref="openclaw-transcript://agent%3Acodebase-researcher%3Asubagent%3Achild#session"',
    );
    expect(content.text).toContain(
      'ref="openclaw-transcript://agent%3Acodebase-researcher%3Asubagent%3Achild#assistant:last"',
    );
    expect(content.text).not.toContain("<task_result_inspect>");
    expect(content.text).not.toContain("<task_result_preview");
    expect(content.text).toContain("full result remains in the child session transcript");
    expect(content.text).not.toContain("<task_result>");
    expect(content.text).not.toContain(finalPlanningResult);
    expect(content.text).not.toContain("substantive planning evidence\n".repeat(100));
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
      previewOnly: true,
      previewChars: 0,
      displayTruncated: true,
      parentInlineLimitChars: 1_800,
      parentPreviewLimitChars: 0,
    });
  });

  it("uses stable assistant message ids for transcript-final task refs when available", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-task-ref-"));
    const storePath = path.join(
      tempDir,
      "agents",
      "codebase-researcher",
      "sessions",
      "sessions.json",
    );
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(
      storePath,
      JSON.stringify({
        "agent:codebase-researcher:subagent:child-stable": {
          sessionId: "child-session",
          updatedAt: Date.now(),
        },
      }),
    );
    fs.writeFileSync(
      path.join(path.dirname(storePath), "child-session.jsonl"),
      [
        JSON.stringify({
          id: "user-message-1",
          message: {
            role: "user",
            content: [{ type: "text", text: "request" }],
          },
        }),
        JSON.stringify({
          id: "assistant-message-42",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "published child artifact" }],
          },
        }),
      ].join("\n"),
    );

    await expect(
      buildTaskTranscriptFinalRef({
        childSessionKey: "agent:codebase-researcher:subagent:child-stable",
        cfg: {
          session: {
            store: path.join(tempDir, "agents", "{agentId}", "sessions", "sessions.json"),
          },
        },
      }),
    ).resolves.toBe(
      "openclaw-transcript://agent%3Acodebase-researcher%3Asubagent%3Achild-stable#message:assistant-message-42",
    );
  });
});
