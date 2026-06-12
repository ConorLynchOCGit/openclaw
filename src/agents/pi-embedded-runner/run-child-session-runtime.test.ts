import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionSystemPromptReport } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { CommandQueueEnqueueFn } from "../../process/command-queue.types.js";
import { createNativeRunChildTask } from "../session-runtime/run-child-task-adapter.js";
import { MAX_SAFE_AGENT_TIMEOUT_MS } from "../timeout.js";
import type { RunEmbeddedPiAgentParams } from "./run/params.js";

const tempRoots: string[] = [];

async function makeTempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-run-child-"));
  tempRoots.push(root);
  return root;
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return await listFilesRecursive(fullPath);
      }
      return [fullPath];
    }),
  );
  return files.flat();
}

function makeSystemPromptReport(params: {
  requiredDocPaths: string[];
  skillName: string;
  skillPath: string;
  skillRef: string;
  skillHash: string;
  toolNames: string[];
}): SessionSystemPromptReport {
  return {
    source: "run",
    generatedAt: 1,
    systemPrompt: {
      chars: 100,
      projectContextChars: 80,
      nonProjectContextChars: 20,
    },
    injectedWorkspaceFiles: params.requiredDocPaths.map((filePath) => ({
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
          name: params.skillName,
          blockChars: 50,
          location: params.skillPath,
          sourceRef: params.skillRef,
          sourceHash: params.skillHash,
        },
      ],
    },
    tools: {
      listChars: 0,
      schemaChars: 0,
      entries: params.toolNames.map((name) => ({
        name,
        summaryChars: 10,
        schemaChars: 10,
      })),
    },
  };
}

async function appendMockThinkingLevelChange(params: RunEmbeddedPiAgentParams) {
  if (!params.thinkLevel) {
    return;
  }
  await fs.mkdir(path.dirname(params.sessionFile), { recursive: true });
  await fs.appendFile(
    params.sessionFile,
    `${JSON.stringify({
      type: "thinking_level_change",
      thinkingLevel: params.thinkLevel,
    })}\n`,
    "utf8",
  );
}

describe("native child session runtime", () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(
      tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
    );
  });

  it("runs child tasks as native child sessions through the embedded session runner contract", async () => {
    const root = await makeTempRoot();
    const storePath = path.join(root, "sessions.json");
    const childAgentId = "execution-context-scout";
    const parentSessionKey = "agent:execution-coding:node:nrun_parent";
    const requiredToolNames = ["read", "list", "glob", "grep"];
    const parentAgentDir = path.join(root, "agents", "execution-coding", "agent");
    const childAgentDir = path.join(root, "agents", childAgentId, "agent");
    const config = {
      session: { store: storePath },
      agents: {
        list: [
          {
            id: "execution-coding",
            agentDir: parentAgentDir,
          },
          {
            id: childAgentId,
            agentDir: childAgentDir,
            thinkingDefault: "low",
            model: {
              primary: "openrouter/qwen/qwen3-coder-plus",
            },
          },
        ],
      },
    } as OpenClawConfig;
    const enqueue: CommandQueueEnqueueFn = async (task) => {
      return await task();
    };
    const authStorage = { admitted: "auth-storage" } as never;
    const modelRegistry = { admitted: "model-registry" } as never;
    const parentParams = {
      sessionId: "parent-session",
      sessionKey: parentSessionKey,
      agentId: "execution-coding",
      nodeRunId: "node-run-parent",
      sessionFile: path.join(root, "parent.jsonl"),
      workspaceDir: root,
      agentDir: parentAgentDir,
      config,
      prompt: "Parent prompt",
      timeoutMs: 60_000,
      runId: "parent-run",
      toolResultFormat: "markdown",
      enqueue,
      authStorage,
      modelRegistry,
    } satisfies RunEmbeddedPiAgentParams;
    const runAgent = vi.fn(async (params: RunEmbeddedPiAgentParams) => {
      await appendMockThinkingLevelChange(params);
      return {
        payloads: [
          {
            text: [
              "Direct answer: edit from the returned child source window.",
              "",
              "Bounded source windows:",
              "```ts",
              "export const childSessionRuntime = true;",
              "```",
            ].join("\n"),
          },
        ],
        meta: {
          durationMs: 1,
          systemPromptReport: makeSystemPromptReport({
            requiredDocPaths: [
              ...(params.requiredProviderContextAdmission?.workspaceFileNames ?? []),
            ],
            skillName: childAgentId,
            skillPath:
              params.requiredProviderContextAdmission?.skillSources?.[0]?.path ??
              path.join(root, "skills", childAgentId, "SKILL.md"),
            skillRef:
              params.requiredProviderContextAdmission?.skillSources?.[0]?.sourceRef ??
              `openclaw-skill-file://${encodeURIComponent(
                path.join(root, "skills", childAgentId, "SKILL.md"),
              )}`,
            skillHash:
              params.requiredProviderContextAdmission?.skillSources?.[0]?.sourceHash ??
              "execution-context-scout-skill-hash",
            toolNames: requiredToolNames,
          }),
        },
      };
    });
    const runChildTask = createNativeRunChildTask({
      parentContext: parentParams,
      resolvedWorkspace: root,
      runAgent,
    });

    const result = await runChildTask({
      parentSessionKey,
      parentToolCallId: "tool-call-task-1",
      childAgentId,
      task: "Map the source context.",
      label: "context scout",
      runTimeoutSeconds: 9,
      parentVisibleResultMaxChars: 12_000,
    });

    expect(runAgent).toHaveBeenCalledTimes(1);
    const childRunParams = runAgent.mock.calls[0]?.[0];
    expect(childRunParams).toEqual(
      expect.objectContaining({
        agentId: childAgentId,
        spawnedBy: parentSessionKey,
        parentToolCallId: "tool-call-task-1",
        nodeRunId: "node-run-parent",
        workspaceDir: root,
        agentDir: childAgentDir,
        config,
        provider: "openrouter",
        model: "qwen/qwen3-coder-plus",
        thinkLevel: "low",
        toolResultFormat: "markdown",
        disableMessageTool: true,
        requireExplicitMessageTarget: true,
        allowGatewaySubagentBinding: false,
        runtimePluginIds: [],
        modelsJsonPolicy: "reuse-existing",
        timeoutMs: MAX_SAFE_AGENT_TIMEOUT_MS,
        lane: "subagent",
        enqueue: expect.any(Function),
        authStorage,
        modelRegistry,
        skillsSnapshot: undefined,
        requiredProviderContextAdmission: expect.objectContaining({
          skillNames: [],
          rejectTruncatedWorkspaceFiles: true,
        }),
      }),
    );
    expect(childRunParams?.sessionKey).toMatch(
      /^agent:execution-context-scout:subagent:[0-9a-f-]+$/,
    );
    expect(childRunParams?.sessionId).toMatch(/^native_task_[0-9a-f-]+$/);
    expect(childRunParams?.runId).toMatch(/^[0-9a-f-]+$/);
    expect(childRunParams?.prompt).toContain("You are running as execution-context-scout");
    expect(childRunParams?.prompt).toContain("[Subagent Label]: context scout");
    expect(childRunParams?.prompt).toContain("[Subagent Task]: Map the source context.");

    expect(result).toMatchObject({
      status: "completed",
      foreground: true,
      waitStatus: "ok",
      resultDeliveredToParentContext: true,
      resultText: expect.stringContaining("childSessionRuntime"),
      childBootstrapAdmission: expect.objectContaining({
        providerReportObserved: true,
        childAgentId,
        canonicalDocsAdmitted: true,
        requiredSkillAdmitted: true,
        childToolCatalogAdmitted: true,
        missingRequiredSources: [],
        truncatedRequiredSources: [],
        requiredSkillSourceRef: null,
        requiredSkillSourceHash: null,
      }),
    });
    expect(result.childSessionKey).toBe(childRunParams?.sessionKey);
    expect(result.runId).toBe(childRunParams?.runId);
    const storeAfterFirstRun = JSON.parse(await fs.readFile(storePath, "utf8")) as Record<
      string,
      { sessionId?: string; spawnedBy?: string; model?: string; thinkingLevel?: string }
    >;
    expect(storeAfterFirstRun[result.childSessionKey]).toMatchObject({
      sessionId: childRunParams?.sessionId,
      spawnedBy: parentSessionKey,
      model: "openrouter/qwen/qwen3-coder-plus",
      thinkingLevel: "low",
    });
    const transcriptText = await fs.readFile(childRunParams?.sessionFile ?? "", "utf8");
    expect(transcriptText).toContain('"type":"thinking_level_change"');
    expect(transcriptText).toContain('"thinkingLevel":"low"');

    const secondResult = await runChildTask({
      parentSessionKey,
      parentToolCallId: "tool-call-task-2",
      childAgentId,
      task: "Map the source context without an explicit runtime cap.",
      label: "context scout no cap",
      parentVisibleResultMaxChars: 12_000,
    });

    expect(runAgent).toHaveBeenCalledTimes(2);
    expect(secondResult.childSessionKey).toMatch(
      /^agent:execution-context-scout:subagent:[0-9a-f-]+$/,
    );
    expect(secondResult.childSessionKey).not.toBe(result.childSessionKey);
    expect(runAgent.mock.calls[1]?.[0].sessionId).not.toBe(childRunParams?.sessionId);
    expect(runAgent.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        timeoutMs: MAX_SAFE_AGENT_TIMEOUT_MS,
      }),
    );
  });

  it("fails execution context scout launch before runtime when required thinking is not resolved", async () => {
    const root = await makeTempRoot();
    const storePath = path.join(root, "sessions.json");
    const childAgentId = "execution-context-scout";
    const parentSessionKey = "agent:execution-coding:node:nrun_parent";
    const config = {
      session: { store: storePath },
      agents: {
        list: [
          { id: "execution-coding", agentDir: path.join(root, "agents", "execution-coding") },
          {
            id: childAgentId,
            agentDir: path.join(root, "agents", childAgentId),
            model: { primary: "openrouter/qwen/qwen3-coder-plus" },
          },
        ],
      },
    } as OpenClawConfig;
    const runAgent = vi.fn();
    const runChildTask = createNativeRunChildTask({
      parentContext: {
        sessionKey: parentSessionKey,
        nodeRunId: "node-run-parent",
        config,
        runId: "parent-run",
      },
      resolvedWorkspace: root,
      runAgent,
    });

    const result = await runChildTask({
      parentSessionKey,
      parentToolCallId: "tool-call-missing-thinking",
      childAgentId,
      task: "Map the source context.",
      parentVisibleResultMaxChars: 12_000,
    });

    expect(runAgent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "error",
      waitStatus: "error",
      childStartFailureKind: "child_provider_model_failure",
      resultDeliveredToParentContext: false,
      error:
        "execution-context-scout requires native child thinkingDefault in agent config; resolved <missing or off>.",
    });
  });

  it("classifies child provider response timeouts before bootstrap-report failures", async () => {
    const root = await makeTempRoot();
    const storePath = path.join(root, "sessions.json");
    const childAgentId = "execution-context-scout";
    const parentSessionKey = "agent:execution-coding:node:nrun_parent";
    const config = {
      session: { store: storePath },
      agents: {
        list: [
          { id: "execution-coding", agentDir: path.join(root, "agents", "execution-coding") },
          {
            id: childAgentId,
            agentDir: path.join(root, "agents", childAgentId),
            thinkingDefault: "low",
            model: { primary: "openrouter/qwen/qwen3-coder-plus" },
          },
        ],
      },
    } as OpenClawConfig;
    const runAgent = vi.fn(async (params: RunEmbeddedPiAgentParams) => {
      await appendMockThinkingLevelChange(params);
      return {
        payloads: [],
        meta: {
          durationMs: 120_000,
          error: { message: "Provider timeout waiting for model output" },
        },
      };
    });
    const runChildTask = createNativeRunChildTask({
      parentContext: {
        sessionKey: parentSessionKey,
        nodeRunId: "node-run-parent",
        config,
        runId: "parent-run",
      },
      resolvedWorkspace: root,
      runAgent,
    });

    const result = await runChildTask({
      parentSessionKey,
      parentToolCallId: "tool-call-timeout",
      childAgentId,
      task: "Map the source context.",
      parentVisibleResultMaxChars: 12_000,
    });

    expect(result).toMatchObject({
      status: "error",
      waitStatus: "error",
      childStartFailureKind: "child_provider_response_timeout",
      resultDeliveredToParentContext: false,
      error: "Provider timeout waiting for model output",
    });
  });

  it("delivers bounded partial child output when a validation scout times out after visible progress", async () => {
    const root = await makeTempRoot();
    const storePath = path.join(root, "sessions.json");
    const childAgentId = "execution-validation-scout";
    const parentSessionKey = "agent:execution-coding:node:nrun_parent";
    const requiredToolNames = ["read", "list", "glob", "grep", "exec"];
    const config = {
      session: { store: storePath },
      agents: {
        list: [
          { id: "execution-coding", agentDir: path.join(root, "agents", "execution-coding") },
          {
            id: childAgentId,
            agentDir: path.join(root, "agents", childAgentId),
            thinkingDefault: "medium",
            model: { primary: "openrouter/qwen/qwen3-coder-plus" },
          },
        ],
      },
    } as OpenClawConfig;
    const runAgent = vi.fn(async (params: RunEmbeddedPiAgentParams) => {
      await appendMockThinkingLevelChange(params);
      return {
        payloads: [
          {
            text: [
              "Validation question/scope: focused policy proof.",
              "Commands run: pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts -- -t native",
              "Exit status: still running when provider response timed out.",
              "Bounded output excerpts: test reached assertion setup.",
              "Residual risk: ask narrower validation if this is insufficient.",
            ].join("\n"),
          },
        ],
        meta: {
          durationMs: 120_000,
          error: { message: "Provider timeout waiting for model output" },
          systemPromptReport: makeSystemPromptReport({
            requiredDocPaths: [
              ...(params.requiredProviderContextAdmission?.workspaceFileNames ?? []),
            ],
            skillName: childAgentId,
            skillPath:
              params.requiredProviderContextAdmission?.skillSources?.[0]?.path ??
              path.join(root, "skills", childAgentId, "SKILL.md"),
            skillRef:
              params.requiredProviderContextAdmission?.skillSources?.[0]?.sourceRef ??
              `openclaw-skill-file://${encodeURIComponent(
                path.join(root, "skills", childAgentId, "SKILL.md"),
              )}`,
            skillHash:
              params.requiredProviderContextAdmission?.skillSources?.[0]?.sourceHash ??
              "execution-validation-scout-skill-hash",
            toolNames: requiredToolNames,
          }),
        },
      };
    });
    const runChildTask = createNativeRunChildTask({
      parentContext: {
        sessionKey: parentSessionKey,
        nodeRunId: "node-run-parent",
        config,
        runId: "parent-run",
      },
      resolvedWorkspace: root,
      runAgent,
    });

    const result = await runChildTask({
      parentSessionKey,
      parentToolCallId: "tool-call-validation-partial",
      childAgentId,
      task: "Run focused validation.",
      parentVisibleResultMaxChars: 12_000,
    });

    expect(result).toMatchObject({
      status: "completed",
      waitStatus: "ok",
      resultDeliveredToParentContext: true,
      resultDeliveryStatus: "full",
      childProgressOutcome: "child_partial_context_returned",
    });
    expect(result).not.toHaveProperty("childStartFailureKind");
    expect(result).not.toHaveProperty("error");
    expect(runAgent.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        provider: "openrouter",
        model: "qwen/qwen3-coder-plus",
        thinkLevel: "medium",
      }),
    );
    const storeAfterRun = JSON.parse(await fs.readFile(storePath, "utf8")) as Record<
      string,
      { model?: string; thinkingLevel?: string }
    >;
    expect(storeAfterRun[result.childSessionKey]).toMatchObject({
      model: "openrouter/qwen/qwen3-coder-plus",
      thinkingLevel: "medium",
    });
    expect(result.resultText).toContain(
      "Partial child result delivered after child progress timeout",
    );
    expect(result.resultText).toContain("Validation question/scope");
    expect(result.childBootstrapAdmission).toMatchObject({
      childAgentId,
      canonicalDocsAdmitted: true,
      requiredSkillAdmitted: true,
      childToolCatalogAdmitted: true,
    });
  });

  it("classifies child no-progress timeouts before parent-visible output", async () => {
    const root = await makeTempRoot();
    const storePath = path.join(root, "sessions.json");
    const childAgentId = "execution-context-scout";
    const parentSessionKey = "agent:execution-coding:node:nrun_parent";
    const config = {
      session: { store: storePath },
      agents: {
        list: [
          { id: "execution-coding", agentDir: path.join(root, "agents", "execution-coding") },
          {
            id: childAgentId,
            agentDir: path.join(root, "agents", childAgentId),
            thinkingDefault: "low",
            model: { primary: "openrouter/qwen/qwen3-coder-plus" },
          },
        ],
      },
    } as OpenClawConfig;
    const runAgent = vi.fn(async (params: RunEmbeddedPiAgentParams) => {
      await appendMockThinkingLevelChange(params);
      return {
        payloads: [],
        meta: {
          durationMs: 120_000,
          progressTimeoutKind: "no_progress_timeout" as const,
        },
      };
    });
    const runChildTask = createNativeRunChildTask({
      parentContext: {
        sessionKey: parentSessionKey,
        nodeRunId: "node-run-parent",
        config,
        runId: "parent-run",
      },
      resolvedWorkspace: root,
      runAgent,
    });

    const result = await runChildTask({
      parentSessionKey,
      parentToolCallId: "tool-call-no-progress",
      childAgentId,
      task: "Map the source context.",
      parentVisibleResultMaxChars: 12_000,
    });

    expect(result).toMatchObject({
      status: "error",
      waitStatus: "error",
      childStartFailureKind: "child_no_progress_timeout",
      resultDeliveredToParentContext: false,
    });
  });

  it("classifies repeated low-value child progress before parent-visible output", async () => {
    const root = await makeTempRoot();
    const storePath = path.join(root, "sessions.json");
    const childAgentId = "execution-context-scout";
    const parentSessionKey = "agent:execution-coding:node:nrun_parent";
    const config = {
      session: { store: storePath },
      agents: {
        list: [
          { id: "execution-coding", agentDir: path.join(root, "agents", "execution-coding") },
          {
            id: childAgentId,
            agentDir: path.join(root, "agents", childAgentId),
            thinkingDefault: "low",
            model: { primary: "openrouter/qwen/qwen3-coder-plus" },
          },
        ],
      },
    } as OpenClawConfig;
    const runAgent = vi.fn(async (params: RunEmbeddedPiAgentParams) => {
      await appendMockThinkingLevelChange(params);
      return {
        payloads: [],
        meta: {
          durationMs: 120_000,
          progressTimeoutKind: "repeated_low_value_progress" as const,
        },
      };
    });
    const runChildTask = createNativeRunChildTask({
      parentContext: {
        sessionKey: parentSessionKey,
        nodeRunId: "node-run-parent",
        config,
        runId: "parent-run",
      },
      resolvedWorkspace: root,
      runAgent,
    });

    const result = await runChildTask({
      parentSessionKey,
      parentToolCallId: "tool-call-low-value-progress",
      childAgentId,
      task: "Map the source context.",
      parentVisibleResultMaxChars: 12_000,
    });

    expect(result).toMatchObject({
      status: "error",
      waitStatus: "error",
      childStartFailureKind: "child_repeated_low_value_progress",
      resultDeliveredToParentContext: false,
    });
  });

  it("persists full oversized child task output to managed storage while returning a bounded projection", async () => {
    const root = await makeTempRoot();
    const stateRoot = path.join(root, "state");
    vi.stubEnv("OPENCLAW_STATE_DIR", stateRoot);
    const storePath = path.join(root, "sessions.json");
    const childAgentId = "execution-context-scout";
    const parentSessionKey = "agent:execution-coding:node:nrun_parent";
    const config = {
      session: { store: storePath },
      agents: {
        list: [
          { id: "execution-coding", agentDir: path.join(root, "agents", "execution-coding") },
          {
            id: childAgentId,
            agentDir: path.join(root, "agents", childAgentId),
            thinkingDefault: "low",
            model: { primary: "openrouter/qwen/qwen3-coder-plus" },
          },
        ],
      },
    } as OpenClawConfig;
    const fullChildOutput = [
      "Direct answer: oversized child output.",
      "inline_context_windows:",
      "path: src/target.ts",
      "lines: 1-20",
      "```ts",
      "export const target = true;",
      "```",
      "x".repeat(20_000),
    ].join("\n");
    const runAgent = vi.fn(async (params: RunEmbeddedPiAgentParams) => {
      await appendMockThinkingLevelChange(params);
      return {
        payloads: [{ text: fullChildOutput }],
        meta: {
          systemPromptReport: makeSystemPromptReport({
            requiredDocPaths: [
              ...(params.requiredProviderContextAdmission?.workspaceFileNames ?? []),
            ],
            skillName: childAgentId,
            skillPath:
              params.requiredProviderContextAdmission?.skillSources?.[0]?.path ??
              path.join(root, "skills", childAgentId, "SKILL.md"),
            skillRef:
              params.requiredProviderContextAdmission?.skillSources?.[0]?.sourceRef ??
              `openclaw-skill-file://${encodeURIComponent(
                path.join(root, "skills", childAgentId, "SKILL.md"),
              )}`,
            skillHash:
              params.requiredProviderContextAdmission?.skillSources?.[0]?.sourceHash ??
              "execution-context-scout-skill-hash",
            toolNames: ["read", "list", "glob", "grep"],
          }),
        },
      };
    });
    const runChildTask = createNativeRunChildTask({
      parentContext: {
        sessionKey: parentSessionKey,
        nodeRunId: "node-run-parent",
        config,
        runId: "parent-run",
      },
      resolvedWorkspace: root,
      runAgent,
    });

    const result = await runChildTask({
      parentSessionKey,
      parentToolCallId: "tool-call-oversized-child",
      childAgentId,
      task: "Return oversized context.",
      parentVisibleResultMaxChars: 1_500,
    });

    expect(result).toMatchObject({
      status: "completed",
      resultDeliveredToParentContext: true,
      resultDeliveryStatus: "projected",
      managedOutputRef: expect.stringContaining("openclaw-managed-output://"),
      managedOutputBytes: Buffer.byteLength(fullChildOutput, "utf8"),
      managedOutputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(result.resultText?.length).toBeLessThan(fullChildOutput.length);
    const files = await listFilesRecursive(path.join(stateRoot, "managed-tool-output"));
    const outputFile = files.find((file) => file.endsWith(".txt"));
    expect(outputFile).toBeDefined();
    expect(await fs.readFile(outputFile ?? "", "utf8")).toBe(fullChildOutput);
  });
});
