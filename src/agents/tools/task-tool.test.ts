// Foreground task tool tests cover manager-style subagent delegation without
// exposing raw sessions_spawn/sessions_yield lifecycle mechanics to the parent.
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SystemChangeSessionSource } from "../worktrees/types.js";

const hoisted = vi.hoisted(() => {
  const spawnSubagentDirectMock = vi.fn();
  const waitForAgentRunMock = vi.fn();
  const readLatestAssistantReplyMock = vi.fn();
  const getLatestSubagentRunByChildSessionKeyMock = vi.fn();
  const resolveSubagentControllerMock = vi.fn();
  const killControlledSubagentRunMock = vi.fn();
  const requireGitMock = vi.fn();
  return {
    spawnSubagentDirectMock,
    waitForAgentRunMock,
    readLatestAssistantReplyMock,
    getLatestSubagentRunByChildSessionKeyMock,
    resolveSubagentControllerMock,
    killControlledSubagentRunMock,
    requireGitMock,
  };
});

vi.mock("../subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => hoisted.spawnSubagentDirectMock(...args),
}));

vi.mock("../worktrees/git.js", () => ({
  requireGit: (...args: unknown[]) => hoisted.requireGitMock(...args),
}));

vi.mock("../run-wait.js", () => ({
  waitForAgentRun: (...args: unknown[]) => hoisted.waitForAgentRunMock(...args),
  readLatestAssistantReply: (...args: unknown[]) => hoisted.readLatestAssistantReplyMock(...args),
}));

vi.mock("../subagent-registry-read.js", () => ({
  getLatestSubagentRunByChildSessionKey: (...args: unknown[]) =>
    hoisted.getLatestSubagentRunByChildSessionKeyMock(...args),
}));

vi.mock("../subagent-control.js", () => ({
  resolveSubagentController: (...args: unknown[]) => hoisted.resolveSubagentControllerMock(...args),
  killControlledSubagentRun: (...args: unknown[]) => hoisted.killControlledSubagentRunMock(...args),
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
    hoisted.getLatestSubagentRunByChildSessionKeyMock.mockReset().mockReturnValue(undefined);
    hoisted.resolveSubagentControllerMock.mockReset().mockReturnValue({
      controllerSessionKey: "agent:main:operator",
      callerSessionKey: "agent:main:operator",
      callerIsSubagent: false,
      controlScope: "children",
    });
    hoisted.killControlledSubagentRunMock.mockReset().mockResolvedValue({
      status: "ok",
      killed: true,
      labels: ["planning"],
    });
    hoisted.requireGitMock.mockReset().mockResolvedValue("");
  });

  it("carries Main's exact current operator turn into a cross-agent foreground task", async () => {
    const operatorRequest = "Line one.\n\nUnicode stays exact: caf\u00e9.\n- final requirement";
    await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
      currentInboundMessage: operatorRequest,
    }).execute("call-1", {
      agentId: "planning",
      task: "Own the plan and publish it to plans/example.md.",
    });

    const renderedTask = hoisted.spawnSubagentDirectMock.mock.calls[0]?.[0]?.task as string;
    expect(renderedTask).toContain("[Original Operator Request: exact transport]");
    expect(renderedTask).toContain(`chars=${operatorRequest.length}`);
    expect(renderedTask).toContain(`sha256=${digestText(operatorRequest)}`);
    expect(renderedTask).toContain(operatorRequest);
    expect(renderedTask).toContain("[Routing Context]");
    expect(renderedTask).toContain("Own the plan and publish it to plans/example.md.");
  });

  it("does not inject Main's operator turn into another manager's specialist task", async () => {
    await createTaskTool({
      agentSessionKey: "agent:planning:operator",
      requesterAgentIdOverride: "planning",
      currentInboundMessage: "Operator-wide request",
    }).execute("call-1", {
      agentId: "reviewer",
      task: "Review the exact plan digest.",
    });

    const renderedTask = hoisted.spawnSubagentDirectMock.mock.calls[0]?.[0]?.task as string;
    expect(renderedTask).not.toContain("[Original Operator Request: exact transport]");
    expect(renderedTask).not.toContain("Operator-wide request");
    expect(renderedTask).toContain("[Task Scope]");
  });

  it("kills the owned foreground child when the parent task signal aborts", async () => {
    const controller = new AbortController();
    hoisted.getLatestSubagentRunByChildSessionKeyMock.mockReturnValue({
      runId: "run-child",
      childSessionKey: "agent:planning:subagent:child",
      requesterSessionKey: "agent:main:operator",
      controllerSessionKey: "agent:main:operator",
    });
    hoisted.spawnSubagentDirectMock.mockImplementationOnce(async () => {
      controller.abort();
      return {
        status: "accepted",
        childSessionKey: "agent:planning:subagent:child",
        childSessionId: "session-child",
        runId: "run-child",
      };
    });

    const result = await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
      config: {},
    }).execute("call-1", { agentId: "planning", task: "Plan the work." }, controller.signal);

    expect(hoisted.resolveSubagentControllerMock).toHaveBeenCalledWith({
      cfg: {},
      agentSessionKey: "agent:main:operator",
    });
    expect(hoisted.killControlledSubagentRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cfg: {},
        entry: expect.objectContaining({ runId: "run-child" }),
      }),
    );
    expect(result.details).toMatchObject({ status: "error", error: "task wait cancelled" });
  });

  it("makes exact governed artifacts authoritative in the model-visible task schema", () => {
    const tool = createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    });

    const schema = JSON.stringify(tool.parameters);
    expect(schema).toContain("exact agent-workspace artifact governs the work");
    expect(schema).toContain("without reproducing, paraphrasing, or compressing");
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
        task: expect.stringContaining("Inspect source and return a Context Pack."),
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
    const renderedTask = hoisted.spawnSubagentDirectMock.mock.calls[0]?.[0]?.task as
      | string
      | undefined;
    expect(renderedTask).toContain('"Task status: complete"');
    expect(renderedTask).not.toContain('"Verdict: complete"');
    expect(renderedTask).not.toContain("Review decision:");
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

  it("preserves native task cwd and exact artifact refs without path rewriting", async () => {
    await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "coding",
      task: [
        "Use /home/node/.openclaw/workspace/plans/proof.md",
        "Patch src/agents/tools/task-tool.ts in the task checkout",
      ].join("\n"),
      cwd: "/var/lib/openclaw/source-anchor",
    });

    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining(
          [
            "Use /home/node/.openclaw/workspace/plans/proof.md",
            "Patch src/agents/tools/task-tool.ts in the task checkout",
          ].join("\n"),
        ),
        cwd: "/var/lib/openclaw/source-anchor",
      }),
      expect.anything(),
    );
    const spawnArgs = JSON.stringify(hoisted.spawnSubagentDirectMock.mock.calls[0]?.[0]);
    expect(spawnArgs).toContain("Coding Artifact Handoff Contract");
    expect(spawnArgs).toContain("resolve that path against the Agent workspace");
    expect(spawnArgs).toContain("read it in full");
    expect(spawnArgs).toContain("workspace_artifact_path_missing");
    expect(spawnArgs).toContain("transport evidence, not a Codex work artifact");
    expect(spawnArgs).toContain("OpenClaw-managed worktree");
    expect(spawnArgs).toContain("there is no nested src/openclaw checkout");
  });

  it("does not semantically parse or rewrite task prose", async () => {
    await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "codebase-researcher",
      task: "Compare the literal historical ref /root/archive/example without following it.",
      cwd: "/var/lib/openclaw/source-anchor",
    });

    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining(
          "Compare the literal historical ref /root/archive/example without following it.",
        ),
        cwd: "/var/lib/openclaw/source-anchor",
      }),
      expect.anything(),
    );
  });

  it("rejects Main-routed Coding fork context before launch", async () => {
    const result = await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "coding",
      task: "Read docs/projects/execution-platform/prompts/proof.md and implement it.",
      context: "fork",
    });

    expect(hoisted.spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        details: expect.objectContaining({
          status: "error",
          requiredContext: "isolated",
        }),
      }),
    );
  });

  it("rejects all cross-agent foreground fork context before launch", async () => {
    const result = await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "planning",
      task: "Produce the complete plan at plans/proof-plan.md.",
      context: "fork",
    });

    expect(hoisted.spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        details: expect.objectContaining({
          status: "error",
          requiredContext: "isolated",
        }),
      }),
    );
  });

  it("preserves same-agent fork context", async () => {
    await createTaskTool({
      agentSessionKey: "agent:planning:operator",
      requesterAgentIdOverride: "planning",
    }).execute("call-1", {
      agentId: "planning",
      task: "Continue this Planning-owned thread context.",
      context: "fork",
    });

    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "planning",
        context: "fork",
      }),
      expect.anything(),
    );
  });

  it("leaves literal host paths in task prose without semantic screening", async () => {
    await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "coding",
      task: "Read /root/not-visible/proof.md before editing.",
    });

    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("Read /root/not-visible/proof.md before editing."),
      }),
      expect.anything(),
    );
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
        task: expect.stringContaining(
          "Review policy/approval-route and docs/application-boundary.md.",
        ),
      }),
      expect.anything(),
    );
    const renderedTask = hoisted.spawnSubagentDirectMock.mock.calls[0]?.[0]?.task as
      | string
      | undefined;
    expect(renderedTask).toContain('"Task status: complete"');
    expect(renderedTask).toContain('"Review decision: revise"');
    expect(renderedTask).toContain('"Task status: complete" and "Review decision: revise"');
    expect(renderedTask).not.toContain('"Verdict: complete"');
    expect(renderedTask).not.toContain("approve_with_required_revisions");
  });

  it("allows runtime-visible /app mentions in child handoff prose", async () => {
    await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "coding",
      task: "Confirm the Coding cwd is the live workspace, not /app; do not use /app as project root.",
    });

    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("not /app"),
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

  it("returns a bounded child result inline to Main under the generic result-size rule", async () => {
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
      resultInline: true,
      resultMode: "inline",
      resultSource: "transcript",
      previewOnly: false,
      previewChars: 0,
      displayTruncated: false,
      parentInlineLimitChars: 1_800,
    });
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).toContain("<task_result>");
    expect(content.text).toContain(`contentChars="${shortPlanningResult.length}"`);
    expect(content.text).toContain(`contentDigest="${digestText(shortPlanningResult)}"`);
    expect(content.text).toContain('agentId="planning"');
    expect(content.text).not.toContain("<task_result_preview");
    expect(content.text).toContain(shortPlanningResult);
  });

  it("infers Main's bounded inline limit from the parent session key", async () => {
    const shortPlanningResult = "Small child-owned result returned without requester override.";
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
      resultInline: true,
      resultMode: "inline",
      resultSource: "transcript",
      previewOnly: false,
      parentInlineLimitChars: 1_800,
    });
    expect(content.text).toContain("<task_result>");
    expect(content.text).toContain(shortPlanningResult);
  });

  it("carries only an exact model-authored task status in a pointer result", async () => {
    const childResult = `Task status: partial\n\n${"Substantive child-owned artifact prose stays out.\n".repeat(50)}`;
    hoisted.readLatestAssistantReplyMock.mockResolvedValue(childResult);

    const result = await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "business-ops",
      task: "Produce a truthful domain closeout.",
    });

    expect(result.details).toMatchObject({
      resultInline: false,
      resultMode: "pointer",
      receiptLeadLine: "Task status: partial",
      receiptLeadLines: ["Task status: partial"],
      inspectCommand:
        "openclaw sessions show agent:codebase-researcher:subagent:child --agent business-ops",
    });
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).toContain('state="completed"');
    expect(content.text).toContain('<task_result_lead modelAuthored="true">');
    expect(content.text).toContain("Task status: partial");
    expect(content.text).not.toContain("Substantive child-owned artifact prose stays out.");
  });

  it("surfaces completed review work and a revise decision as independent receipt axes", async () => {
    const childResult = [
      "Task status: complete",
      "Review decision: revise",
      "",
      "The review completed, but the artifact still requires changes.",
      "Review evidence stays in the child transcript.\n".repeat(60),
    ].join("\n");
    hoisted.readLatestAssistantReplyMock.mockResolvedValue(childResult);

    const result = await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "reviewer",
      task: "Review the candidate and return an artifact decision.",
    });

    expect(result.details).toMatchObject({
      resultInline: false,
      resultMode: "pointer",
      receiptLeadLine: "Task status: complete",
      receiptLeadLines: ["Task status: complete", "Review decision: revise"],
    });
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).toContain('state="completed"');
    expect(content.text).toContain("Task status: complete\nReview decision: revise");
    expect(content.text).not.toContain("Task status: partial");
    expect(content.text).not.toContain("The review completed");
  });

  it("keeps the legacy Verdict lead readable for already-stored transcripts", async () => {
    const childResult = `Verdict: partial\n\n${"Legacy transcript content stays behind the pointer.\n".repeat(50)}`;
    hoisted.readLatestAssistantReplyMock.mockResolvedValue(childResult);

    const result = await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "business-ops",
      task: "Read back the existing child transcript.",
    });

    expect(result.details).toMatchObject({
      resultInline: false,
      resultMode: "pointer",
      receiptLeadLine: "Verdict: partial",
      receiptLeadLines: ["Verdict: partial"],
    });
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).toContain("Verdict: partial");
    expect(content.text).not.toContain("Legacy transcript content");
  });

  it("does not structure misplaced closeout labels", async () => {
    hoisted.readLatestAssistantReplyMock.mockResolvedValue(
      "Review decision: approve\nTask status: complete\nLabels are in the wrong order.",
    );

    const result = await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "reviewer",
      task: "Review the candidate.",
    });

    expect(result.details).not.toHaveProperty("receiptLeadLine");
    expect(result.details).not.toHaveProperty("receiptLeadLines");
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).not.toContain("<task_result_lead");
  });

  it("returns a bounded Business Ops dialogue turn inline to Main", async () => {
    const childResult = [
      "Task status: partial",
      "",
      "Episode: business-ops/companies/example/collaborative-refinement.md",
      "Question: Which audience must trust this brand first?",
      "Boundary: candidate-only; no canonical mutation.",
    ].join("\n");
    hoisted.readLatestAssistantReplyMock.mockResolvedValue(childResult);

    const result = await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "business-ops",
      task: "Continue the operator's collaborative refinement episode.",
    });

    expect(result.details).toMatchObject({
      resultInline: true,
      resultMode: "inline",
      previewOnly: false,
      parentInlineLimitChars: 1_800,
    });
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).toContain("<task_result>");
    expect(content.text).toContain(childResult);
    expect(content.text).not.toContain("<task_receipt");
  });

  it("keeps an oversized Business Ops result behind native task pointers", async () => {
    const childResult = `Task status: partial\n\n${"oversized dialogue payload\n".repeat(100)}`;
    hoisted.readLatestAssistantReplyMock.mockResolvedValue(childResult);

    const result = await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
    }).execute("call-1", {
      agentId: "business-ops",
      task: "Continue the operator's collaborative refinement episode.",
    });

    expect(result.details).toMatchObject({
      resultInline: false,
      resultMode: "pointer",
      previewOnly: true,
      previewChars: 0,
      parentInlineLimitChars: 1_800,
    });
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).toContain('<task_result_ref kind="transcript_final"');
    expect(content.text).not.toContain("oversized dialogue payload");
  });

  it("passes loaded source authority to Coding and returns the preserved dirty worktree", async () => {
    const sourceObject = "a".repeat(40);
    const source: SystemChangeSessionSource = {
      sourceAnchorPath: "/srv/openclaw-next/source-anchor",
      sourceSnapshotRef: "refs/openclaw/snapshots/loaded-generation",
      sourceTreeObject: sourceObject,
      releaseManifestDigest: "b".repeat(64),
    };
    const worktree = {
      id: "worktree-a",
      path: "/tmp/openclaw-state/worktrees/system-change-a",
      branch: "openclaw/system-change-a",
      baseRef: sourceObject,
    };
    hoisted.spawnSubagentDirectMock.mockResolvedValueOnce({
      status: "accepted",
      childSessionKey: "agent:coding:subagent:child",
      childSessionId: "session-child",
      runId: "run-child",
      resolvedProvider: "openai",
      resolvedModel: "gpt-5.4-codex",
      worktree,
    });
    hoisted.requireGitMock.mockResolvedValueOnce(" M src/changed.ts\0?? src/new.ts\0");

    const result = await createTaskTool({
      agentSessionKey: "agent:main:operator",
      requesterAgentIdOverride: "main",
      resolveSystemChangeSessionSource: () => source,
    }).execute("call-1", {
      agentId: "coding",
      task: "Implement the loaded system change.",
      context: "isolated",
      systemChange: true,
    });

    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "coding", cwd: undefined }),
      expect.objectContaining({ systemChangeSessionSource: source }),
    );
    expect(hoisted.requireGitMock).toHaveBeenCalledWith(worktree.path, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ]);
    expect(result.details).toMatchObject({
      status: "ok",
      worktree: {
        ...worktree,
        dirty: true,
        changedPathCount: 2,
      },
    });
    const content = result.content[0];
    expect(content?.type).toBe("text");
    if (!content || content.type !== "text") {
      throw new Error("Expected text tool result");
    }
    expect(content.text).toContain(
      `<managed_worktree id="worktree-a" path="${worktree.path}" branch="openclaw/system-change-a" baseRef="${sourceObject}" dirty="true" changedPathCount="2" />`,
    );
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
