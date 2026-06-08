import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionSystemPromptReport } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { CommandQueueEnqueueFn } from "../../process/command-queue.types.js";
import { createNativeRunChildTask } from "../session-runtime/run-child-task-adapter.js";
import type { RunEmbeddedPiAgentParams } from "./run/params.js";

const tempRoots: string[] = [];

async function makeTempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-run-child-"));
  tempRoots.push(root);
  return root;
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

describe("native child session runtime", () => {
  afterEach(async () => {
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
    const config = {
      session: { store: storePath },
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
      config,
      prompt: "Parent prompt",
      timeoutMs: 60_000,
      runId: "parent-run",
      toolResultFormat: "markdown",
      enqueue,
      authStorage,
      modelRegistry,
    } satisfies RunEmbeddedPiAgentParams;
    const runAgent = vi.fn(async (params: RunEmbeddedPiAgentParams) => ({
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
    }));
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
        config,
        toolResultFormat: "markdown",
        disableMessageTool: true,
        requireExplicitMessageTarget: true,
        allowGatewaySubagentBinding: false,
        runtimePluginIds: [],
        modelsJsonPolicy: "reuse-existing",
        timeoutMs: 9_000,
        lane: "subagent",
        enqueue: expect.any(Function),
        authStorage,
        modelRegistry,
        requiredProviderContextAdmission: expect.objectContaining({
          skillNames: [childAgentId],
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
        requiredSkillSourceRef: expect.any(String),
        requiredSkillSourceHash: expect.any(String),
      }),
    });
    expect(result.childSessionKey).toBe(childRunParams?.sessionKey);
    expect(result.runId).toBe(childRunParams?.runId);
  });
});
