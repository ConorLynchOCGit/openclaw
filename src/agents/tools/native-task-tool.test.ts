import { describe, expect, it, vi } from "vitest";
import type { SessionSystemPromptReport } from "../../config/sessions/types.js";
import type { SpawnSubagentResult } from "../subagent-spawn.js";
import {
  buildChildBootstrapAdmission,
  buildParentVisibleChildResult,
  classifyChildBootstrapAdmissionFailure,
  createNativeTaskTool,
  resolveParentVisibleChildResultMaxChars,
  type NativeTaskForegroundResult,
} from "./native-task-tool.js";

function readDetails(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== "object") {
    throw new Error("expected tool result object");
  }
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object") {
    throw new Error("expected tool result details");
  }
  return details as Record<string, unknown>;
}

function readContentText(result: unknown): string {
  if (!result || typeof result !== "object") {
    throw new Error("expected tool result object");
  }
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((entry) =>
      entry && typeof entry === "object" && typeof (entry as { text?: unknown }).text === "string"
        ? (entry as { text: string }).text
        : "",
    )
    .filter(Boolean)
    .join("\n");
}

function makeChildProviderReport(
  overrides: Partial<SessionSystemPromptReport> = {},
): SessionSystemPromptReport {
  const base: SessionSystemPromptReport = {
    source: "run",
    generatedAt: 1,
    systemPrompt: {
      chars: 100,
      projectContextChars: 80,
      nonProjectContextChars: 20,
    },
    injectedWorkspaceFiles: [
      {
        name: "IDENTITY.md",
        path: "/root/.openclaw/agents/execution-context-scout/agent/IDENTITY.md",
        missing: false,
        rawChars: 10,
        injectedChars: 10,
        truncated: false,
      },
      {
        name: "AGENTS.md",
        path: "/root/.openclaw/agents/execution-context-scout/agent/AGENTS.md",
        missing: false,
        rawChars: 10,
        injectedChars: 10,
        truncated: false,
      },
      {
        name: "BOOTSTRAP.md",
        path: "/root/.openclaw/agents/execution-context-scout/agent/BOOTSTRAP.md",
        missing: false,
        rawChars: 10,
        injectedChars: 10,
        truncated: false,
      },
      {
        name: "TOOLS.md",
        path: "/root/.openclaw/agents/execution-context-scout/agent/TOOLS.md",
        missing: false,
        rawChars: 10,
        injectedChars: 10,
        truncated: false,
      },
    ],
    skills: {
      promptChars: 50,
      entries: [
        {
          name: "execution-context-scout",
          blockChars: 50,
          location: "/root/.openclaw/workspace/skills/execution-context-scout/SKILL.md",
          sourceRef: "openclaw-skill-file://execution-context-scout",
          sourceHash: "context-scout-skill-hash",
        },
      ],
    },
    tools: {
      listChars: 0,
      schemaChars: 0,
      entries: [],
    },
  };
  return {
    ...base,
    ...overrides,
  };
}

describe("native task tool", () => {
  it("keeps the parent-visible child result cap below the live tool-result guard", () => {
    expect(resolveParentVisibleChildResultMaxChars(undefined)).toBe(12_000);
    expect(resolveParentVisibleChildResultMaxChars(16_000)).toBe(12_000);
    expect(resolveParentVisibleChildResultMaxChars(10_000)).toBe(9_488);
    expect(resolveParentVisibleChildResultMaxChars(300)).toBe(1);
  });

  it("tells the parent to request inline source windows and file graph from context scout", () => {
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-context-scout", "execution-validation-scout"],
    });

    expect(tool.description).toContain("bounded inline source windows");
    expect(tool.description).toContain("file_graph");
  });

  it("requires an explicit allowed child agent id before spawning", async () => {
    const spawnSubagent = vi.fn();
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-context-scout", "execution-validation-scout"],
      spawnSubagent,
    });

    await expect(
      tool.execute("task-invalid-agent", {
        agentId: "execution-coding",
        task: "Find relevant files.",
      }),
    ).rejects.toThrow(/task agentId must be one of/i);
    await expect(
      tool.execute("task-missing-agent", {
        task: "Find relevant files.",
      }),
    ).rejects.toThrow(/agentId required/i);
    expect(spawnSubagent).not.toHaveBeenCalled();
  });

  it("runs foreground and returns child result text to parent-visible tool output", async () => {
    const spawnResult: SpawnSubagentResult = {
      status: "accepted",
      childSessionKey: "agent:execution-context-scout:subagent:child-1",
      runId: "run-child-1",
      mode: "run",
    };
    const foregroundResult: NativeTaskForegroundResult = {
      status: "completed",
      foreground: true,
      childSessionKey: spawnResult.childSessionKey!,
      runId: spawnResult.runId!,
      waitStatus: "ok",
      startedAt: 1000,
      endedAt: 2000,
      resultText:
        "Direct answer: edit src/agents/tools/native-task-tool.ts.\n\nBounded excerpt:\n```ts\nexport function createNativeTaskTool() {}\n```",
      resultDeliveredToParentContext: true,
    };
    const spawnSubagent = vi.fn(async () => spawnResult);
    const waitForForegroundResult = vi.fn(async () => foregroundResult);
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-context-scout", "execution-validation-scout"],
      agentSessionKey: "agent:execution-coding:node:nrun_test",
      requesterAgentIdOverride: "execution-coding",
      workspaceDir: "/root/services/openclaw-roles/live",
      spawnSubagent,
      waitForForegroundResult,
    });

    const result = await tool.execute("task-valid-context-scout", {
      agentId: "execution-context-scout",
      task: "Map the relevant source and return bounded source windows.",
      label: "context map",
      runTimeoutSeconds: 7,
    });

    expect(spawnSubagent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "execution-context-scout",
        task: "Map the relevant source and return bounded source windows.",
        label: "context map",
        mode: "run",
        thread: false,
        cleanup: "keep",
        expectsCompletionMessage: true,
      }),
      expect.objectContaining({
        agentSessionKey: "agent:execution-coding:node:nrun_test",
        requesterAgentIdOverride: "execution-coding",
        workspaceDir: "/root/services/openclaw-roles/live",
      }),
    );
    expect(waitForForegroundResult).toHaveBeenCalledWith({
      childSessionKey: "agent:execution-context-scout:subagent:child-1",
      runId: "run-child-1",
      requestedAgentId: "execution-context-scout",
      runTimeoutSeconds: 7,
      parentVisibleResultMaxChars: 12_000,
      readChildSystemPromptReport: undefined,
    });
    const details = readDetails(result);
    expect(details).toMatchObject({
      status: "completed",
      foreground: true,
      sourceTool: "task",
      requestedAgentId: "execution-context-scout",
      childSessionKey: "agent:execution-context-scout:subagent:child-1",
      runId: "run-child-1",
      resultDeliveredToParentContext: true,
      childIdentityVerified: true,
    });
    expect(readContentText(result)).toContain("Bounded excerpt");
    expect(readContentText(result)).toContain("native-task-tool.ts");
    expect(readContentText(result)).not.toContain('"resultText"');
    expect(details).not.toHaveProperty("resultText");
  });

  it("does not deliver mechanically truncated child output as parent edit context", async () => {
    const oversized = [
      "Direct answer: too broad.",
      "```ts",
      "export const value = 1;",
      "```",
      "x".repeat(12_001),
    ].join("\n");

    const bounded = buildParentVisibleChildResult(oversized);
    expect(bounded).toMatchObject({
      resultOversized: true,
      resultTruncated: false,
      resultMaxParentVisibleChars: 12_000,
    });
    expect(bounded.resultText).toBeUndefined();
    expect(bounded.resultTextHash).toBeTruthy();
    expect(bounded.resultTextByteCount).toBeGreaterThan(12_000);

    const spawnResult: SpawnSubagentResult = {
      status: "accepted",
      childSessionKey: "agent:execution-context-scout:subagent:child-oversized",
      runId: "run-child-oversized",
      mode: "run",
    };
    const foregroundResult: NativeTaskForegroundResult = {
      status: "completed",
      foreground: true,
      childSessionKey: spawnResult.childSessionKey!,
      runId: spawnResult.runId!,
      waitStatus: "ok",
      resultText: oversized,
      resultDeliveredToParentContext: true,
    };
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-context-scout"],
      spawnSubagent: vi.fn(async () => spawnResult),
      waitForForegroundResult: vi.fn(async () => foregroundResult),
    });

    const result = await tool.execute("task-oversized-child-result", {
      agentId: "execution-context-scout",
      task: "Map relevant source windows.",
    });

    const text = readContentText(result);
    expect(text).toContain("too large for parent-visible edit context");
    expect(text).toContain("No truncated source excerpt was delivered");
    expect(text).not.toContain("export const value = 1");
    expect(readDetails(result)).toMatchObject({
      status: "error",
      resultDeliveredToParentContext: false,
      resultOversized: true,
      resultTruncated: false,
      childStartFailureKind: "child_result_oversized",
    });
    expect(readDetails(result)).not.toHaveProperty("resultText");
  });

  it("uses the configured live guard cap when deciding whether child output is parent-visible", async () => {
    const nearlyDefaultSized = [
      "Direct answer: edit-ready context.",
      "```ts",
      "export const target = true;",
      "```",
      "x".repeat(7_500),
    ].join("\n");
    const spawnResult: SpawnSubagentResult = {
      status: "accepted",
      childSessionKey: "agent:execution-context-scout:subagent:child-low-cap",
      runId: "run-child-low-cap",
      mode: "run",
    };
    const foregroundResult: NativeTaskForegroundResult = {
      status: "completed",
      foreground: true,
      childSessionKey: spawnResult.childSessionKey!,
      runId: spawnResult.runId!,
      waitStatus: "ok",
      resultText: nearlyDefaultSized,
      resultDeliveredToParentContext: true,
    };
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-context-scout"],
      parentVisibleResultMaxChars: 8_000,
      spawnSubagent: vi.fn(async () => spawnResult),
      waitForForegroundResult: vi.fn(async () => foregroundResult),
    });

    const result = await tool.execute("task-low-live-guard-cap", {
      agentId: "execution-context-scout",
      task: "Return bounded context.",
    });

    const text = readContentText(result);
    expect(text).toContain("too large for parent-visible edit context");
    expect(text).not.toContain("export const target = true");
    expect(readDetails(result)).toMatchObject({
      status: "error",
      resultDeliveredToParentContext: false,
      resultMaxParentVisibleChars: 7_488,
      resultOversized: true,
      childStartFailureKind: "child_result_oversized",
    });
  });

  it("rejects accepted child sessions whose identity does not match the requested scout", async () => {
    const spawnResult: SpawnSubagentResult = {
      status: "accepted",
      childSessionKey: "agent:execution-coding:subagent:wrong-child",
      runId: "run-child-wrong",
      mode: "run",
    };
    const spawnSubagent = vi.fn(async () => spawnResult);
    const waitForForegroundResult = vi.fn();
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-context-scout", "execution-validation-scout"],
      spawnSubagent,
      waitForForegroundResult,
    });

    const result = await tool.execute("task-wrong-child", {
      agentId: "execution-context-scout",
      task: "Map relevant source windows.",
    });

    expect(waitForForegroundResult).not.toHaveBeenCalled();
    expect(readDetails(result)).toMatchObject({
      status: "error",
      foreground: true,
      requestedAgentId: "execution-context-scout",
      childSessionKey: "agent:execution-coding:subagent:wrong-child",
      resultDeliveredToParentContext: false,
      childStartFailureKind: "wrong_child_identity_selected",
      childIdentityVerified: false,
    });
    expect(readContentText(result)).toContain("child session identity mismatch");
  });

  it("does not report a successful foreground task when spawn returns only an accepted receipt", async () => {
    const spawnSubagent = vi.fn(async () => ({ status: "accepted" as const }));
    const waitForForegroundResult = vi.fn();
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-context-scout"],
      spawnSubagent,
      waitForForegroundResult,
    });

    const result = await tool.execute("task-missing-run-id", {
      agentId: "execution-context-scout",
      task: "Find relevant files.",
    });

    expect(waitForForegroundResult).not.toHaveBeenCalled();
    expect(readDetails(result)).toMatchObject({
      status: "error",
      foreground: true,
      requestedAgentId: "execution-context-scout",
      resultDeliveredToParentContext: false,
      childStartFailureKind: "child_session_receipt_incomplete",
    });
    expect(readContentText(result)).toContain("cannot wait for child result");
  });

  it("keeps spawn failures visible without waiting for a child result", async () => {
    const spawnSubagent = vi.fn(async () => ({
      status: "forbidden" as const,
      error: "agentId is not allowed for sessions_spawn",
    }));
    const waitForForegroundResult = vi.fn();
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-context-scout"],
      spawnSubagent,
      waitForForegroundResult,
    });

    const result = await tool.execute("task-spawn-forbidden", {
      agentId: "execution-context-scout",
      task: "Find relevant files.",
    });

    expect(waitForForegroundResult).not.toHaveBeenCalled();
    expect(readDetails(result)).toMatchObject({
      status: "forbidden",
      foreground: true,
      requestedAgentId: "execution-context-scout",
      error: "agentId is not allowed for sessions_spawn",
      resultDeliveredToParentContext: false,
      childStartFailureKind: "disallowed_child_agent",
    });
  });

  it("builds compact child bootstrap admission from the child provider prompt report", () => {
    const admitted = buildChildBootstrapAdmission({
      childSessionKey: "agent:execution-context-scout:subagent:child-1",
      childAgentId: "execution-context-scout",
      report: makeChildProviderReport(),
    });

    expect(admitted).toMatchObject({
      providerReportObserved: true,
      childAgentId: "execution-context-scout",
      canonicalDocsAdmitted: true,
      requiredSkillAdmitted: true,
      requiredSkillSourceRef: "openclaw-skill-file://execution-context-scout",
      requiredSkillSourceHash: "context-scout-skill-hash",
      requiredSkillLocation: "/root/.openclaw/workspace/skills/execution-context-scout/SKILL.md",
      missingRequiredSources: [],
      truncatedRequiredSources: [],
    });
    expect(admitted.reportRef).toMatch(/^openclaw-system-prompt-report:\/\//);
    expect(admitted.reasonCodes).toEqual(
      expect.arrayContaining([
        "native_task_child_provider_prompt_report_observed",
        "native_task_child_canonical_docs_admitted_to_provider_context",
        "native_task_child_required_skill_admitted_to_provider_context",
      ]),
    );

    const blocked = buildChildBootstrapAdmission({
      childSessionKey: "agent:execution-context-scout:subagent:child-1",
      childAgentId: "execution-context-scout",
      report: makeChildProviderReport({
        injectedWorkspaceFiles: [
          {
            name: "IDENTITY.md",
            path: "/root/.openclaw/agents/execution-context-scout/agent/IDENTITY.md",
            missing: false,
            rawChars: 10,
            injectedChars: 5,
            truncated: true,
          },
        ],
        skills: {
          promptChars: 0,
          entries: [],
        },
      }),
    });

    expect(blocked).toMatchObject({
      providerReportObserved: true,
      childAgentId: "execution-context-scout",
      canonicalDocsAdmitted: false,
      requiredSkillAdmitted: false,
    });
    expect(blocked.missingRequiredSources).toEqual(
      expect.arrayContaining([
        "agent-doc:execution-context-scout:AGENTS.md",
        "agent-doc:execution-context-scout:BOOTSTRAP.md",
        "agent-doc:execution-context-scout:TOOLS.md",
        "skill:execution-context-scout:execution-context-scout",
      ]),
    );
    expect(blocked.truncatedRequiredSources).toEqual([
      "agent-doc:execution-context-scout:IDENTITY.md",
    ]);
    expect(blocked.reasonCodes).toEqual(
      expect.arrayContaining([
        "native_task_child_canonical_docs_missing_from_provider_context",
        "native_task_child_required_skill_missing_from_provider_context",
        "native_task_child_bootstrap_required_sources_truncated",
      ]),
    );
    expect(classifyChildBootstrapAdmissionFailure(admitted)).toBeUndefined();
    expect(classifyChildBootstrapAdmissionFailure(blocked)).toBe(
      "child_provider_bootstrap_truncated",
    );
    expect(
      classifyChildBootstrapAdmissionFailure(
        buildChildBootstrapAdmission({
          childSessionKey: "agent:execution-context-scout:subagent:child-1",
          childAgentId: "execution-context-scout",
          report: null,
        }),
      ),
    ).toBe("child_provider_bootstrap_report_missing");
  });
});
