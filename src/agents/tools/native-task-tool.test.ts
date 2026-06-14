import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SessionSystemPromptReport } from "../../config/sessions/types.js";
import type { SpawnSubagentResult } from "../subagent-spawn.js";
import { buildSubagentSystemPrompt } from "../subagent-system-prompt.js";
import {
  buildChildBootstrapAdmission,
  buildParentVisibleChildResult,
  classifyChildBootstrapAdmissionFailure,
  createLegacyGatewayNativeTaskToolForTest,
  createNativeTaskTool,
  resolveRequiredChildBootstrapAdmissionSources,
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

function childCanonicalDocPaths(agentId: string): string[] {
  return ["IDENTITY.md", "AGENTS.md", "BOOTSTRAP.md", "TOOLS.md"].map(
    (docName) => `/root/.openclaw/agents/${agentId}/agent/${docName}`,
  );
}

const REQUIRED_CHILD_DOCS = ["IDENTITY.md", "AGENTS.md", "BOOTSTRAP.md", "TOOLS.md"];

const FORBIDDEN_CHILD_TOOLS = [
  "write",
  "edit",
  "apply_patch",
  "process",
  "update_plan",
  "read_todo",
  "task",
  "sessions_spawn",
  "sessions_yield",
  "subagents",
  "agents_list",
  "openclaw_resource_read",
  "resolve_openclaw_resource",
  "node_finish",
];

function childAdmissionContract(agentId: string) {
  return {
    requiredCanonicalDocNames: REQUIRED_CHILD_DOCS,
    requiredSkillNames: [],
    requiredToolNames: childToolNames(agentId),
    forbiddenToolNames: FORBIDDEN_CHILD_TOOLS,
  };
}

function sourceBackedChildCanonicalDocPaths(agentId: string): string[] {
  return ["IDENTITY.md", "AGENTS.md", "BOOTSTRAP.md", "TOOLS.md"].map((docName) =>
    path.join(process.cwd(), "docs", "agents", agentId, "runtime", docName),
  );
}

function sourceBackedChildSkillSource(agentId: string) {
  const sourcePath = path.join(process.cwd(), "skills", agentId, "SKILL.md");
  return {
    name: agentId,
    path: sourcePath,
    sourceRef: `openclaw-skill-file://${encodeURIComponent(path.resolve(sourcePath))}`,
    sourceHash: `${agentId}-source-skill-hash`,
  };
}

function childToolNames(agentId: string): string[] {
  return agentId === "execution-validation-scout"
    ? ["read", "list", "glob", "grep", "exec"]
    : ["read", "list", "glob", "grep"];
}

function makeChildProviderReport(
  overrides: Partial<SessionSystemPromptReport> = {},
  agentId = "execution-context-scout",
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
        path: `/root/.openclaw/agents/${agentId}/agent/IDENTITY.md`,
        missing: false,
        rawChars: 10,
        injectedChars: 10,
        truncated: false,
      },
      {
        name: "AGENTS.md",
        path: `/root/.openclaw/agents/${agentId}/agent/AGENTS.md`,
        missing: false,
        rawChars: 10,
        injectedChars: 10,
        truncated: false,
      },
      {
        name: "BOOTSTRAP.md",
        path: `/root/.openclaw/agents/${agentId}/agent/BOOTSTRAP.md`,
        missing: false,
        rawChars: 10,
        injectedChars: 10,
        truncated: false,
      },
      {
        name: "TOOLS.md",
        path: `/root/.openclaw/agents/${agentId}/agent/TOOLS.md`,
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
          name: agentId,
          blockChars: 50,
          location: `/root/.openclaw/workspace/skills/${agentId}/SKILL.md`,
          sourceRef: `openclaw-skill-file://${agentId}`,
          sourceHash: `${agentId}-skill-hash`,
        },
      ],
    },
    tools: {
      listChars: 0,
      schemaChars: 0,
      entries: childToolNames(agentId).map((name) => ({
        name,
        summaryChars: 10,
        schemaChars: 10,
      })),
    },
  };
  return {
    ...base,
    ...overrides,
  };
}

function makeSourceBackedChildProviderReport(agentId: string): SessionSystemPromptReport {
  const skillSource = sourceBackedChildSkillSource(agentId);
  return makeChildProviderReport(
    {
      injectedWorkspaceFiles: sourceBackedChildCanonicalDocPaths(agentId).map((filePath) => ({
        name: path.basename(filePath),
        path: filePath,
        missing: false,
        rawChars: 10,
        injectedChars: 10,
        truncated: false,
      })),
      skills: {
        promptChars: 50,
        entries: [
          {
            name: skillSource.name,
            blockChars: 50,
            location: skillSource.path,
            sourceRef: skillSource.sourceRef,
            sourceHash: skillSource.sourceHash,
          },
        ],
      },
    },
    agentId,
  );
}

describe("native task tool", () => {
  it("keeps the parent-visible child result cap below the live tool-result guard", () => {
    expect(resolveParentVisibleChildResultMaxChars(undefined)).toBe(12_000);
    expect(resolveParentVisibleChildResultMaxChars(16_000)).toBe(12_000);
    expect(resolveParentVisibleChildResultMaxChars(10_000)).toBe(9_488);
    expect(resolveParentVisibleChildResultMaxChars(300)).toBe(1);
  });

  it("describes task as child-agent delegation, not exact local lookup", () => {
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-context-scout", "execution-validation-scout"],
      runChildTask: vi.fn(),
    });

    expect(tool.description).toContain("Allowed child agents");
    expect(tool.description).toContain(
      "open-ended source, caller, test, or architecture discovery",
    );
    expect(tool.description).toContain("validation command selection");
    expect(tool.description).toContain("Do not use task for a specific file path");
    expect(tool.description).toContain("use read, grep, or glob for that");
    expect(tool.description).not.toContain("symbol_windows");
    expect(tool.description).not.toContain("missing_windows");
    expect(tool.description).not.toContain("edit_start_recommendation");
    expect(tool.description).not.toContain("minimum exact source windows");
  });

  it("requires an explicit allowed child agent id before running a child task", async () => {
    const runChildTask = vi.fn();
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-context-scout", "execution-validation-scout"],
      runChildTask,
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
    expect(runChildTask).not.toHaveBeenCalled();
  });

  it("requires a native child-session runtime when constructing the production task tool", () => {
    expect(() =>
      createNativeTaskTool({
        allowedAgentIds: ["execution-context-scout"],
      } as never),
    ).toThrow(/requires OpenClaw session-runtime runChildTask/i);
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
    const tool = createLegacyGatewayNativeTaskToolForTest({
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
        leafTask: true,
        expectsCompletionMessage: true,
        requiredProviderContextAdmission: expect.objectContaining({
          workspaceFileNames: sourceBackedChildCanonicalDocPaths("execution-context-scout"),
          skillNames: [],
          skillSources: [],
          rejectTruncatedWorkspaceFiles: true,
        }),
      }),
      expect.objectContaining({
        agentSessionKey: "agent:execution-coding:node:nrun_test",
        requesterAgentIdOverride: "execution-coding",
        workspaceDir: "/root/services/openclaw-roles/live",
      }),
    );
    expect(waitForForegroundResult).toHaveBeenCalledWith(
      expect.objectContaining({
        childSessionKey: "agent:execution-context-scout:subagent:child-1",
        runId: "run-child-1",
        requestedAgentId: "execution-context-scout",
        runTimeoutSeconds: 7,
        parentVisibleResultMaxChars: 12_000,
        requiredBootstrapAdmissionSources: expect.objectContaining({
          requiredCanonicalDocPaths: sourceBackedChildCanonicalDocPaths("execution-context-scout"),
          requiredSkillNames: [],
          requiredSkillSources: [],
        }),
        readChildSystemPromptReport: undefined,
      }),
    );
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
    expect(readContentText(result)).toContain("<system-reminder>");
    expect(readContentText(result)).toContain("If you can name the target files and patch shape");
    expect(readContentText(result)).not.toContain("Use read/grep/glob only for one named missing");
    expect(readContentText(result)).not.toContain("NEXT PARENT TOOL CALL");
    expect(readContentText(result)).not.toContain('"resultText"');
    expect(details).not.toHaveProperty("resultText");
  });

  it("extracts execution critic first-line decisions into task result details", async () => {
    const runChildTask = vi.fn(
      async (): Promise<NativeTaskForegroundResult> => ({
        status: "completed",
        foreground: true,
        childSessionKey: "agent:execution-critic:subagent:child-critic",
        runId: "run-critic-1",
        waitStatus: "ok",
        startedAt: 1000,
        endedAt: 1100,
        resultText:
          "REVISE\nUse the shared finish service instead of asking the model to invent evidence refs.",
        resultDeliveredToParentContext: true,
      }),
    );
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-critic"],
      runChildTask,
    });

    const result = await tool.execute("task-critic", {
      agentId: "execution-critic",
      task: "Review the finish plan.",
    });

    expect(readDetails(result)).toMatchObject({
      requestedAgentId: "execution-critic",
      criticDecision: "REVISE",
      criticDecisionValid: true,
      criticDecisionExpectedFirstLine: "ACCEPT|REVISE|BLOCK",
    });
    expect(readContentText(result)).toContain("REVISE");
    expect(readContentText(result)).not.toContain('"resultText"');
  });

  it("uses the native child-session runner when provided instead of gateway spawn/wait", async () => {
    const runChildTask = vi.fn(
      async (params): Promise<NativeTaskForegroundResult> => ({
        status: "completed",
        foreground: true,
        childSessionKey: `agent:${params.childAgentId}:subagent:child-native`,
        runId: "run-child-native",
        waitStatus: "ok",
        resultText:
          "Direct answer: edit from native child context.\n\nBounded source windows:\n```ts\nexport const nativeTask = true;\n```",
        resultDeliveredToParentContext: true,
      }),
    );
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-context-scout"],
      agentSessionKey: "agent:execution-coding:node:nrun_test",
      requesterAgentIdOverride: "execution-coding",
      workspaceDir: "/root/services/openclaw-roles/live",
      runChildTask,
    });

    const result = await tool.execute("task-native-child-context-scout", {
      agentId: "execution-context-scout",
      task: "Map native child context.",
      label: "native child",
      runTimeoutSeconds: 11,
    });

    expect(runChildTask).toHaveBeenCalledWith(
      expect.objectContaining({
        parentSessionKey: "agent:execution-coding:node:nrun_test",
        parentToolCallId: "task-native-child-context-scout",
        childAgentId: "execution-context-scout",
        task: "Map native child context.",
        label: "native child",
        parentVisibleResultMaxChars: 12_000,
      }),
    );
    expect(runChildTask.mock.calls[0]?.[0]).not.toHaveProperty("runTimeoutSeconds");
    expect(runChildTask.mock.calls[0]?.[0]).not.toHaveProperty("requiredProviderContextAdmission");
    expect(runChildTask.mock.calls[0]?.[0]).not.toHaveProperty("requiredBootstrapAdmissionSources");
    expect(readContentText(result)).toContain("export const nativeTask = true");
    expect(readDetails(result)).toMatchObject({
      status: "completed",
      foreground: true,
      sourceTool: "task",
      requestedAgentId: "execution-context-scout",
      childSessionKey: "agent:execution-context-scout:subagent:child-native",
      runId: "run-child-native",
      nativeChildSessionRuntime: true,
      resultDeliveredToParentContext: true,
      childIdentityVerified: true,
    });
  });

  it("returns blocked-action guidance after native child runtime failures", async () => {
    const runChildTask = vi.fn(
      async (): Promise<NativeTaskForegroundResult> => ({
        status: "error",
        foreground: true,
        childSessionKey: "agent:execution-context-scout:subagent:child-lock",
        runId: "run-child-lock",
        waitStatus: "error",
        error: "session lock acquisition timed out",
        resultDeliveredToParentContext: false,
        childStartFailureKind: "child_session_lock_failed",
      }),
    );
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-context-scout"],
      runChildTask,
    });

    const result = await tool.execute("task-native-child-lock-failure", {
      agentId: "execution-context-scout",
      task: "Map native child context.",
    });

    const text = readContentText(result);
    expect(text).toContain("did not produce parent-visible edit context");
    expect(text).toContain("Do not probe gateway-status");
    expect(text).not.toContain("openclaw_resource_read");
    expect(readDetails(result)).toMatchObject({
      status: "error",
      requestedAgentId: "execution-context-scout",
      childStartFailureKind: "child_session_lock_failed",
      resultDeliveredToParentContext: false,
      nativeChildSessionRuntime: true,
    });
  });

  it("gives parent-visible retry guidance for child provider response timeouts", async () => {
    const runChildTask = vi.fn(
      async (): Promise<NativeTaskForegroundResult> => ({
        status: "error",
        foreground: true,
        childSessionKey: "agent:execution-validation-scout:subagent:child-timeout",
        runId: "run-child-timeout",
        waitStatus: "error",
        error: "Provider timeout waiting for model output",
        resultDeliveredToParentContext: false,
        childStartFailureKind: "child_provider_response_timeout",
      }),
    );
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-validation-scout"],
      runChildTask,
    });

    const result = await tool.execute("task-native-child-provider-timeout", {
      agentId: "execution-validation-scout",
      task: "Run focused validation for changed files.",
    });

    const text = readContentText(result);
    expect(text).toContain("hit a provider response timeout");
    expect(text).toContain("ask for the narrowest command/result");
    expect(text).toContain("Do not probe gateway-status");
    expect(readDetails(result)).toMatchObject({
      status: "error",
      requestedAgentId: "execution-validation-scout",
      childStartFailureKind: "child_provider_response_timeout",
      resultDeliveredToParentContext: false,
      nativeChildSessionRuntime: true,
    });
  });

  it("surfaces partial child context returned after a progress timeout", async () => {
    const runChildTask = vi.fn(
      async (): Promise<NativeTaskForegroundResult> => ({
        status: "completed",
        foreground: true,
        childSessionKey: "agent:execution-context-scout:subagent:child-partial",
        runId: "run-child-partial",
        waitStatus: "ok",
        resultText:
          "Partial child result delivered after child progress timeout.\n\nsymbol_windows:\n- path: src/example.ts lines 10-30",
        resultDeliveryStatus: "full",
        childProgressOutcome: "child_partial_context_returned",
        resultDeliveredToParentContext: true,
      }),
    );
    const tool = createNativeTaskTool({
      allowedAgentIds: ["execution-context-scout"],
      runChildTask,
    });

    const result = await tool.execute("task-native-child-partial", {
      agentId: "execution-context-scout",
      task: "Find a symbol window.",
    });

    const text = readContentText(result);
    expect(text).toContain("Partial child result delivered after child progress timeout");
    expect(text).toContain("<system-reminder>");
    expect(text).toContain("If you can name the target files and patch shape");
    expect(text).not.toContain("Use read/grep/glob only for one named missing");
    expect(text).not.toContain("NEXT PARENT TOOL CALL");
    expect(readDetails(result)).toMatchObject({
      status: "completed",
      requestedAgentId: "execution-context-scout",
      childProgressOutcome: "child_partial_context_returned",
      resultDeliveredToParentContext: true,
      nativeChildSessionRuntime: true,
    });
  });

  it("supports independent parallel scout task calls without sharing child state", async () => {
    const spawnSubagent = vi.fn(async (params: { label?: string }) => {
      const suffix = params.label === "plugin scout" ? "plugin" : "validation";
      return {
        status: "accepted" as const,
        childSessionKey: `agent:execution-context-scout:subagent:child-${suffix}`,
        runId: `run-child-${suffix}`,
        mode: "run" as const,
      };
    });
    const waitForForegroundResult = vi.fn(
      async (params: {
        childSessionKey: string;
        runId: string;
      }): Promise<NativeTaskForegroundResult> => ({
        status: "completed",
        foreground: true,
        childSessionKey: params.childSessionKey,
        runId: params.runId,
        waitStatus: "ok",
        resultText: [
          `Direct answer: ${params.runId} completed.`,
          "",
          "Bounded source windows:",
          "```ts",
          `export const ${params.runId.replace(/-/g, "_")} = true;`,
          "```",
          "",
          "file_graph:",
          `- ${params.runId}.ts -> parent via scout result`,
        ].join("\n"),
        resultDeliveredToParentContext: true,
      }),
    );
    const tool = createLegacyGatewayNativeTaskToolForTest({
      allowedAgentIds: ["execution-context-scout"],
      spawnSubagent,
      waitForForegroundResult,
    });

    const [pluginResult, validationResult] = await Promise.all([
      tool.execute("task-parallel-plugin-scout", {
        agentId: "execution-context-scout",
        task: "Map plugin registration source windows.",
        label: "plugin scout",
      }),
      tool.execute("task-parallel-validation-scout", {
        agentId: "execution-context-scout",
        task: "Map validation gate source windows.",
        label: "validation scout",
      }),
    ]);

    expect(spawnSubagent).toHaveBeenCalledTimes(2);
    expect(waitForForegroundResult).toHaveBeenCalledTimes(2);
    expect(readDetails(pluginResult)).toMatchObject({
      childSessionKey: "agent:execution-context-scout:subagent:child-plugin",
      runId: "run-child-plugin",
      resultDeliveredToParentContext: true,
    });
    expect(readDetails(validationResult)).toMatchObject({
      childSessionKey: "agent:execution-context-scout:subagent:child-validation",
      runId: "run-child-validation",
      resultDeliveredToParentContext: true,
    });
    expect(readContentText(pluginResult)).toContain("run-child-plugin completed");
    expect(readContentText(validationResult)).toContain("run-child-validation completed");
  });

  it("returns a continuation token instead of failing when a foreground child is still pending", async () => {
    const childSessionKey = "agent:execution-context-scout:subagent:child-pending";
    const runId = "run-child-pending";
    const continuationId = `openclaw-native-task-continuation://${encodeURIComponent(
      childSessionKey,
    )}/${encodeURIComponent(runId)}`;
    const spawnResult: SpawnSubagentResult = {
      status: "accepted",
      childSessionKey,
      runId,
      mode: "run",
    };
    const foregroundResult: NativeTaskForegroundResult = {
      status: "pending",
      foreground: true,
      childSessionKey,
      runId,
      waitStatus: "pending",
      resultDeliveredToParentContext: false,
    };
    const tool = createLegacyGatewayNativeTaskToolForTest({
      allowedAgentIds: ["execution-context-scout"],
      spawnSubagent: vi.fn(async () => spawnResult),
      waitForForegroundResult: vi.fn(async () => foregroundResult),
    });

    const result = await tool.execute("task-pending-context-scout", {
      agentId: "execution-context-scout",
      task: "Map relevant source windows.",
    });

    const text = readContentText(result);
    expect(text).toContain("still pending at the foreground wait checkpoint");
    expect(text).toContain(`continuationId: ${continuationId}`);
    expect(text).toContain("Do not spawn duplicate scout work");
    expect(text).toContain("call task again with the same agentId and continuationId");
    expect(readDetails(result)).toMatchObject({
      status: "pending",
      waitStatus: "pending",
      childSessionKey,
      runId,
      continuationId,
      resultDeliveredToParentContext: false,
    });
    expect(readDetails(result)).not.toHaveProperty("childStartFailureKind");
  });

  it("waits on a native task continuation without spawning duplicate scout work", async () => {
    const childSessionKey = "agent:execution-context-scout:subagent:child-continue";
    const runId = "run-child-continue";
    const continuationId = `openclaw-native-task-continuation://${encodeURIComponent(
      childSessionKey,
    )}/${encodeURIComponent(runId)}`;
    const spawnSubagent = vi.fn();
    const waitForForegroundResult = vi.fn(
      async (): Promise<NativeTaskForegroundResult> => ({
        status: "completed",
        foreground: true,
        childSessionKey,
        runId,
        waitStatus: "ok",
        resultText:
          "Direct answer:\n\nBounded source windows:\n```ts\nexport const ready = true;\n```",
        resultDeliveredToParentContext: true,
      }),
    );
    const tool = createLegacyGatewayNativeTaskToolForTest({
      allowedAgentIds: ["execution-context-scout"],
      spawnSubagent,
      waitForForegroundResult,
    });

    const result = await tool.execute("task-continuation-context-scout", {
      agentId: "execution-context-scout",
      continuationId,
    });

    expect(spawnSubagent).not.toHaveBeenCalled();
    expect(waitForForegroundResult).toHaveBeenCalledWith(
      expect.objectContaining({
        childSessionKey,
        runId,
        requestedAgentId: "execution-context-scout",
        runTimeoutSeconds: undefined,
        parentVisibleResultMaxChars: 12_000,
        requiredBootstrapAdmissionSources: expect.objectContaining({
          requiredCanonicalDocPaths: sourceBackedChildCanonicalDocPaths("execution-context-scout"),
          requiredSkillNames: [],
          requiredSkillSources: [],
        }),
        readChildSystemPromptReport: undefined,
      }),
    );
    expect(readContentText(result)).toContain("export const ready = true");
    expect(readDetails(result)).toMatchObject({
      status: "completed",
      childSessionKey,
      runId,
      continuationId,
      continuationUsed: true,
      resultDeliveredToParentContext: true,
    });
  });

  it("rejects native task continuation tokens for the wrong child agent", async () => {
    const continuationId = `openclaw-native-task-continuation://${encodeURIComponent(
      "agent:execution-context-scout:subagent:child-continue",
    )}/${encodeURIComponent("run-child-continue")}`;
    const spawnSubagent = vi.fn();
    const waitForForegroundResult = vi.fn();
    const tool = createLegacyGatewayNativeTaskToolForTest({
      allowedAgentIds: ["execution-context-scout", "execution-validation-scout"],
      spawnSubagent,
      waitForForegroundResult,
    });

    await expect(
      tool.execute("task-wrong-continuation-agent", {
        agentId: "execution-validation-scout",
        continuationId,
      }),
    ).rejects.toThrow(/continuationId child session does not match/i);
    expect(spawnSubagent).not.toHaveBeenCalled();
    expect(waitForForegroundResult).not.toHaveBeenCalled();
  });

  it("keeps execution scout child prompts in leaf mode without raw sessions_spawn guidance", () => {
    const prompt = buildSubagentSystemPrompt({
      childSessionKey: "agent:execution-context-scout:subagent:child-1",
      task: "Map source context for the parent execution-coding node.",
      childDepth: 1,
      maxSpawnDepth: 1,
      leafTask: true,
    });

    expect(prompt).toContain("You are a leaf worker and CANNOT spawn further sub-agents");
    expect(prompt).not.toContain("sessions_spawn");
    expect(prompt).not.toContain("You CAN spawn your own sub-agents");
  });

  it("appends validation next-action guidance to validation scout results", async () => {
    const spawnResult: SpawnSubagentResult = {
      status: "accepted",
      childSessionKey: "agent:execution-validation-scout:subagent:child-validate",
      runId: "run-child-validate",
      mode: "run",
    };
    const foregroundResult: NativeTaskForegroundResult = {
      status: "completed",
      foreground: true,
      childSessionKey: spawnResult.childSessionKey!,
      runId: spawnResult.runId!,
      waitStatus: "ok",
      resultText:
        "Validation result: pnpm test:file src/agents/tools/native-task-tool.test.ts passed.",
      resultDeliveredToParentContext: true,
    };
    const tool = createLegacyGatewayNativeTaskToolForTest({
      allowedAgentIds: ["execution-validation-scout"],
      spawnSubagent: vi.fn(async () => spawnResult),
      waitForForegroundResult: vi.fn(async () => foregroundResult),
    });

    const result = await tool.execute("task-valid-validation-scout", {
      agentId: "execution-validation-scout",
      task: "Validate the native task footer behavior.",
    });

    expect(readContentText(result)).toContain("<system-reminder>");
    expect(readContentText(result)).toContain("file:line errors in known files");
    expect(readContentText(result)).toContain("one local source lookup per error cluster");
    expect(readContentText(result)).toContain("then edit");
    expect(readContentText(result)).not.toContain("Use read/grep/glob only for one named missing");
    expect(readContentText(result)).not.toContain("NEXT PARENT TOOL CALL");
  });

  it("previews oversized child output as bounded source handoff text without file graph metadata", async () => {
    const oversized = [
      "Direct answer: too broad.",
      "",
      "inline_context_windows:",
      "```ts",
      "export const value = 1;",
      "```",
      "",
      "file_graph:",
      "- src/a.ts -> src/b.ts via import",
      "x".repeat(12_001),
    ].join("\n");

    const bounded = buildParentVisibleChildResult(oversized);
    expect(bounded).toMatchObject({
      resultTruncated: true,
      resultMaxParentVisibleChars: 12_000,
      resultDeliveryStatus: "projected",
    });
    expect(bounded.resultText).toContain(
      "Partial task result, truncated to parent-visible budget.",
    );
    expect(bounded.resultText).toContain("No exact source windows were detected");
    expect(bounded.resultText).toContain("export const value = 1");
    expect(bounded.resultText).not.toContain("file_graph");
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
    const tool = createLegacyGatewayNativeTaskToolForTest({
      allowedAgentIds: ["execution-context-scout"],
      spawnSubagent: vi.fn(async () => spawnResult),
      waitForForegroundResult: vi.fn(async () => foregroundResult),
    });

    const result = await tool.execute("task-oversized-child-result", {
      agentId: "execution-context-scout",
      task: "Map relevant source windows.",
    });

    const text = readContentText(result);
    expect(text).toContain(
      '<task id="agent:execution-context-scout:subagent:child-oversized" state="completed">',
    );
    expect(text).toContain("<task_result>");
    expect(text).toContain("</task_result>");
    expect(text).toContain("Task result from execution-context-scout (completed, partial).");
    expect(text).toContain("Partial task result, truncated to parent-visible budget.");
    expect(text).toContain("export const value = 1");
    expect(text).not.toContain("file_graph");
    expect(readDetails(result)).toMatchObject({
      status: "completed",
      resultDeliveredToParentContext: true,
      resultTruncated: true,
      resultDeliveryStatus: "projected",
    });
    expect(readDetails(result)).not.toHaveProperty("resultText");
  });

  it("projects unstructured oversized child output as a bounded preview", async () => {
    const oversized = `raw unstructured result\n${"x".repeat(12_001)}`;
    const bounded = buildParentVisibleChildResult(oversized);

    expect(bounded).toMatchObject({
      resultDeliveryStatus: "projected",
      resultTruncated: true,
    });
    expect(bounded.resultText).toContain("Partial task result, truncated to parent-visible budget");
    expect(bounded.resultText).toContain("No exact source windows were detected");
    expect(bounded.resultText).toContain("raw unstructured result");

    const foregroundResult: NativeTaskForegroundResult = {
      status: "completed",
      foreground: true,
      childSessionKey: "agent:execution-context-scout:subagent:child-unstructured",
      runId: "run-child-unstructured",
      waitStatus: "ok",
      resultText: oversized,
      resultDeliveredToParentContext: true,
    };
    const tool = createLegacyGatewayNativeTaskToolForTest({
      allowedAgentIds: ["execution-context-scout"],
      spawnSubagent: vi.fn(async () => ({
        status: "accepted" as const,
        childSessionKey: foregroundResult.childSessionKey,
        runId: foregroundResult.runId,
        mode: "run" as const,
      })),
      waitForForegroundResult: vi.fn(async () => foregroundResult),
    });

    const result = await tool.execute("task-unstructured-oversized-child-result", {
      agentId: "execution-context-scout",
      task: "Map relevant source windows.",
    });

    const text = readContentText(result);
    expect(text).toContain(
      '<task id="agent:execution-context-scout:subagent:child-unstructured" state="completed">',
    );
    expect(text).toContain("<task_result>");
    expect(text).toContain("</task_result>");
    expect(text).toContain("Partial task result, truncated to parent-visible budget");
    expect(text).toContain("No exact source windows were detected");
    expect(readDetails(result)).toMatchObject({
      status: "completed",
      resultDeliveredToParentContext: true,
      resultDeliveryStatus: "projected",
      resultTruncated: true,
    });
    expect(readDetails(result)).not.toHaveProperty("childStartFailureKind");
  });

  it("marks oversized child previews with line-window headings as usable source context", () => {
    const oversized = [
      "# Direct Answer",
      "",
      "## Lines 260-370",
      "```ts",
      "260:     };",
      "261:     ownerProgressReadback: {",
      '262:       state: "ready";',
      "```",
      "",
      "x".repeat(12_001),
    ].join("\n");

    const bounded = buildParentVisibleChildResult(oversized);

    expect(bounded).toMatchObject({
      resultDeliveryStatus: "projected",
      resultTruncated: true,
    });
    expect(bounded.resultText).toContain("Partial task result, truncated to parent-visible budget");
    expect(bounded.resultText).toContain(
      "Exact source windows included below are usable for editing",
    );
    expect(bounded.resultText).toContain("261:     ownerProgressReadback");
  });

  it("uses the configured live guard cap when projecting oversized structured child output", async () => {
    const nearlyDefaultSized = [
      "Direct answer: edit-ready context.",
      "",
      "inline_context_windows:",
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
    const tool = createLegacyGatewayNativeTaskToolForTest({
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
    expect(text).toContain("Task result from execution-context-scout (completed, partial).");
    expect(text).toContain("Partial task result, truncated to parent-visible budget.");
    expect(text).toContain("export const target = true");
    expect(readDetails(result)).toMatchObject({
      status: "completed",
      resultDeliveredToParentContext: true,
      resultMaxParentVisibleChars: 7_488,
      resultDeliveryStatus: "projected",
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
    const tool = createLegacyGatewayNativeTaskToolForTest({
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
    const tool = createLegacyGatewayNativeTaskToolForTest({
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
    const tool = createLegacyGatewayNativeTaskToolForTest({
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
      ...childAdmissionContract("execution-context-scout"),
    });

    expect(admitted).toMatchObject({
      providerReportObserved: true,
      childAgentId: "execution-context-scout",
      canonicalDocsAdmitted: true,
      requiredSkillAdmitted: true,
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
      ...childAdmissionContract("execution-context-scout"),
    });

    expect(blocked).toMatchObject({
      providerReportObserved: true,
      childAgentId: "execution-context-scout",
      canonicalDocsAdmitted: false,
      requiredSkillAdmitted: true,
    });
    expect(blocked.missingRequiredSources).toEqual(
      expect.arrayContaining([
        "agent-doc:execution-context-scout:AGENTS.md",
        "agent-doc:execution-context-scout:BOOTSTRAP.md",
        "agent-doc:execution-context-scout:TOOLS.md",
      ]),
    );
    expect(blocked.truncatedRequiredSources).toEqual([
      "agent-doc:execution-context-scout:IDENTITY.md",
    ]);
    expect(blocked.reasonCodes).toEqual(
      expect.arrayContaining([
        "native_task_child_canonical_docs_missing_from_provider_context",
        "native_task_child_bootstrap_required_sources_truncated",
      ]),
    );
    expect(classifyChildBootstrapAdmissionFailure(admitted)).toBeUndefined();
    expect(classifyChildBootstrapAdmissionFailure(blocked)).toBe("child_launch_blocked");
    expect(
      classifyChildBootstrapAdmissionFailure(
        buildChildBootstrapAdmission({
          childSessionKey: "agent:execution-context-scout:subagent:child-1",
          childAgentId: "execution-context-scout",
          report: null,
          ...childAdmissionContract("execution-context-scout"),
        }),
      ),
    ).toBe("child_launch_blocked");
  });

  it("requires source-backed child docs and skill when child admission provides them", () => {
    const agentId = "execution-context-scout";
    const requiredCanonicalDocPaths = sourceBackedChildCanonicalDocPaths(agentId);
    const requiredSkillSources = [sourceBackedChildSkillSource(agentId)];

    const rejected = buildChildBootstrapAdmission({
      childSessionKey: "agent:execution-context-scout:subagent:child-1",
      childAgentId: agentId,
      report: makeChildProviderReport(),
      ...childAdmissionContract(agentId),
      requiredSkillNames: [agentId],
      requiredCanonicalDocPaths,
      requiredSkillSources,
    });

    expect(rejected).toMatchObject({
      providerReportObserved: true,
      childAgentId: agentId,
      canonicalDocsAdmitted: false,
      requiredSkillAdmitted: false,
    });
    expect(rejected.missingRequiredSources).toEqual(
      expect.arrayContaining([
        "agent-doc:execution-context-scout:IDENTITY.md",
        "agent-doc:execution-context-scout:AGENTS.md",
        "agent-doc:execution-context-scout:BOOTSTRAP.md",
        "agent-doc:execution-context-scout:TOOLS.md",
        "skill:execution-context-scout:execution-context-scout",
      ]),
    );
    expect(rejected.reasonCodes).toEqual(
      expect.arrayContaining([
        "native_task_child_canonical_docs_missing_from_provider_context",
        "native_task_child_required_skill_missing_from_provider_context",
        "native_task_child_required_skill_sources_mismatched",
      ]),
    );
    expect(classifyChildBootstrapAdmissionFailure(rejected)).toBe("child_launch_blocked");

    const accepted = buildChildBootstrapAdmission({
      childSessionKey: "agent:execution-context-scout:subagent:child-1",
      childAgentId: agentId,
      report: makeSourceBackedChildProviderReport(agentId),
      ...childAdmissionContract(agentId),
      requiredSkillNames: [agentId],
      requiredCanonicalDocPaths,
      requiredSkillSources,
    });

    expect(accepted).toMatchObject({
      providerReportObserved: true,
      childAgentId: agentId,
      canonicalDocsAdmitted: true,
      requiredSkillAdmitted: true,
      missingRequiredSources: [],
      truncatedRequiredSources: [],
    });
    expect(classifyChildBootstrapAdmissionFailure(accepted)).toBeUndefined();
  });

  it("resolves child bootstrap admission sources from the source-backed agent registry", async () => {
    const resolved = await resolveRequiredChildBootstrapAdmissionSources("execution-context-scout");

    expect(resolved.requiredCanonicalDocPaths).toEqual(
      sourceBackedChildCanonicalDocPaths("execution-context-scout"),
    );
    // Execution child agents now use source-backed agent docs and tool
    // descriptions as the active contract; skills stay optional.
    expect(resolved.requiredSkillSources).toEqual([]);
    expect(resolved.requiredSkillsSnapshot).toBeUndefined();
  });

  it("requires validation-scout canonical docs for validation child admission", () => {
    const validationDocPaths = childCanonicalDocPaths("execution-validation-scout");
    const admitted = buildChildBootstrapAdmission({
      childSessionKey: "agent:execution-validation-scout:subagent:child-validate",
      childAgentId: "execution-validation-scout",
      report: makeChildProviderReport({}, "execution-validation-scout"),
      ...childAdmissionContract("execution-validation-scout"),
      requiredCanonicalDocPaths: validationDocPaths,
    });

    expect(admitted).toMatchObject({
      providerReportObserved: true,
      childAgentId: "execution-validation-scout",
      canonicalDocsAdmitted: true,
      requiredSkillAdmitted: true,
      missingRequiredSources: [],
      truncatedRequiredSources: [],
    });
    expect(classifyChildBootstrapAdmissionFailure(admitted)).toBeUndefined();

    const wrongScoutReport = buildChildBootstrapAdmission({
      childSessionKey: "agent:execution-validation-scout:subagent:child-validate",
      childAgentId: "execution-validation-scout",
      report: makeChildProviderReport({}, "execution-context-scout"),
      ...childAdmissionContract("execution-validation-scout"),
      requiredCanonicalDocPaths: validationDocPaths,
    });

    expect(wrongScoutReport).toMatchObject({
      providerReportObserved: true,
      childAgentId: "execution-validation-scout",
      canonicalDocsAdmitted: false,
      requiredSkillAdmitted: true,
      missingRequiredSources: [
        "agent-doc:execution-validation-scout:IDENTITY.md",
        "agent-doc:execution-validation-scout:AGENTS.md",
        "agent-doc:execution-validation-scout:BOOTSTRAP.md",
        "agent-doc:execution-validation-scout:TOOLS.md",
      ],
      truncatedRequiredSources: [],
    });
    expect(classifyChildBootstrapAdmissionFailure(wrongScoutReport)).toBe("child_launch_blocked");
  });

  it("does not admit child canonical docs by basename when exact child paths are required", () => {
    const wrongAgentReport = makeChildProviderReport({
      injectedWorkspaceFiles: [
        {
          name: "IDENTITY.md",
          path: "/root/.openclaw/agents/execution-coding/agent/IDENTITY.md",
          missing: false,
          rawChars: 10,
          injectedChars: 10,
          truncated: false,
        },
        {
          name: "AGENTS.md",
          path: "/root/.openclaw/agents/execution-coding/agent/AGENTS.md",
          missing: false,
          rawChars: 10,
          injectedChars: 10,
          truncated: false,
        },
        {
          name: "BOOTSTRAP.md",
          path: "/root/.openclaw/agents/execution-coding/agent/BOOTSTRAP.md",
          missing: false,
          rawChars: 10,
          injectedChars: 10,
          truncated: false,
        },
        {
          name: "TOOLS.md",
          path: "/root/.openclaw/agents/execution-coding/agent/TOOLS.md",
          missing: false,
          rawChars: 10,
          injectedChars: 10,
          truncated: false,
        },
      ],
    });

    const blocked = buildChildBootstrapAdmission({
      childSessionKey: "agent:execution-context-scout:subagent:child-1",
      childAgentId: "execution-context-scout",
      report: wrongAgentReport,
      ...childAdmissionContract("execution-context-scout"),
      requiredCanonicalDocPaths: [
        "/root/.openclaw/agents/execution-context-scout/agent/IDENTITY.md",
        "/root/.openclaw/agents/execution-context-scout/agent/AGENTS.md",
        "/root/.openclaw/agents/execution-context-scout/agent/BOOTSTRAP.md",
        "/root/.openclaw/agents/execution-context-scout/agent/TOOLS.md",
      ],
    });

    expect(blocked).toMatchObject({
      providerReportObserved: true,
      canonicalDocsAdmitted: false,
      requiredSkillAdmitted: true,
      missingRequiredSources: [
        "agent-doc:execution-context-scout:IDENTITY.md",
        "agent-doc:execution-context-scout:AGENTS.md",
        "agent-doc:execution-context-scout:BOOTSTRAP.md",
        "agent-doc:execution-context-scout:TOOLS.md",
      ],
      truncatedRequiredSources: [],
    });
    expect(classifyChildBootstrapAdmissionFailure(blocked)).toBe("child_launch_blocked");
  });
});
