import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentInternalEvent } from "../internal-events.js";
import { jsonResult } from "../tools/common.js";
import { makeAttemptResult } from "./run.overflow-compaction.fixture.js";
import {
  loadRunOverflowCompactionHarness,
  mockedRunEmbeddedAttempt,
  overflowBaseRunParams,
  resetRunOverflowCompactionHarnessMocks,
} from "./run.overflow-compaction.harness.js";
import type { RunEmbeddedPiAgentParams } from "./run/params.js";

type ForwardingCase = {
  name: string;
  runId: string;
  params: Partial<RunEmbeddedPiAgentParams>;
  expected: Record<string, unknown>;
};

let runEmbeddedPiAgent: typeof import("./run.js").runEmbeddedPiAgent;
const internalEvents: AgentInternalEvent[] = [];
const onSessionLockAcquired = async () => {};
const admittedAuthStorage = {
  admitted: "auth-storage",
  setRuntimeApiKey: () => undefined,
} as never;
const admittedModelRegistry = { admitted: "model-registry" } as never;
const forwardingCases = [
  {
    name: "forwards toolsAllow so the per-job tool allowlist can be honored",
    runId: "forward-toolsAllow",
    params: { toolsAllow: ["exec", "read"] },
    expected: { toolsAllow: ["exec", "read"] },
  },
  {
    name: "forwards nativeRuntimeTools so node sessions add lifecycle tools through the canonical OpenClaw surface",
    runId: "forward-nativeRuntimeTools",
    params: {
      nativeRuntimeTools: [
        {
          name: "node_finish",
          label: "Finish node",
          description: "Finish node",
          parameters: { type: "object", properties: {} },
          execute: async () => jsonResult({ accepted: true }),
        },
      ],
    },
    expected: {
      nativeRuntimeTools: [
        expect.objectContaining({
          name: "node_finish",
        }),
      ],
    },
  },
  {
    name: "forwards bootstrapContextMode so lightContext cron jobs strip workspace bootstrap files",
    runId: "forward-bootstrapContextMode",
    params: { bootstrapContextMode: "lightweight" },
    expected: { bootstrapContextMode: "lightweight" },
  },
  {
    name: "forwards bootstrapContextRunKind so the bootstrap filter knows the caller context",
    runId: "forward-bootstrapContextRunKind",
    params: { bootstrapContextRunKind: "cron" },
    expected: { bootstrapContextRunKind: "cron" },
  },
  {
    name: "forwards skillsSnapshot so node sessions can receive active required skills",
    runId: "forward-skillsSnapshot",
    params: {
      skillsSnapshot: {
        prompt:
          '<active_skills><active_skill name="execution-node-workflow">active</active_skill></active_skills>',
        skills: [{ name: "execution-node-workflow" }],
        skillFilter: ["execution-node-workflow"],
        version: 1,
      },
    },
    expected: {
      skillsSnapshot: expect.objectContaining({
        prompt: expect.stringContaining("<active_skills>"),
        skillFilter: ["execution-node-workflow"],
      }),
    },
  },
  {
    name: "forwards highest Kimi reasoning controls into the provider attempt",
    runId: "forward-kimi-highest-reasoning",
    params: { thinkLevel: "xhigh", reasoningLevel: "stream" },
    expected: { thinkLevel: "xhigh", reasoningLevel: "stream" },
  },
  {
    name: "forwards requiredProviderContextAdmission so native node starts can block missing provider-visible docs and skills",
    runId: "forward-requiredProviderContextAdmission",
    params: {
      requiredProviderContextAdmission: {
        workspaceFileNames: ["IDENTITY.md", "AGENTS.md"],
        skillNames: ["execution-node-workflow"],
        rejectTruncatedWorkspaceFiles: true,
      },
    },
    expected: {
      requiredProviderContextAdmission: {
        workspaceFileNames: ["IDENTITY.md", "AGENTS.md"],
        skillNames: ["execution-node-workflow"],
        rejectTruncatedWorkspaceFiles: true,
      },
    },
  },
  {
    name: "forwards allowGatewaySubagentBinding so node sessions expose native scouts",
    runId: "forward-allowGatewaySubagentBinding",
    params: { allowGatewaySubagentBinding: true },
    expected: { allowGatewaySubagentBinding: true },
  },
  {
    name: "forwards runtimePluginIds so node sessions can use a bounded native plugin scope",
    runId: "forward-runtimePluginIds",
    params: { runtimePluginIds: [] },
    expected: { runtimePluginIds: [] },
  },
  {
    name: "forwards modelsJsonPolicy so node sessions can reuse the admitted runtime model catalog",
    runId: "forward-modelsJsonPolicy",
    params: { modelsJsonPolicy: "reuse-existing" },
    expected: { modelsJsonPolicy: "reuse-existing" },
  },
  {
    name: "forwards admitted auth storage and model registry so worker runs avoid rediscovery",
    runId: "forward-admitted-model-registry",
    params: { authStorage: admittedAuthStorage, modelRegistry: admittedModelRegistry },
    expected: { authStorage: admittedAuthStorage, modelRegistry: admittedModelRegistry },
  },
  {
    name: "forwards disableMessageTool so cron-owned delivery suppresses the messaging tool",
    runId: "forward-disableMessageTool",
    params: { disableMessageTool: true },
    expected: { disableMessageTool: true },
  },
  {
    name: "forwards requireExplicitMessageTarget so non-subagent callers can opt in explicitly",
    runId: "forward-requireExplicitMessageTarget",
    params: { requireExplicitMessageTarget: true },
    expected: { requireExplicitMessageTarget: true },
  },
  {
    name: "forwards internalEvents so the agent command attempt path can deliver internal events",
    runId: "forward-internalEvents",
    params: { internalEvents },
    expected: { internalEvents },
  },
  {
    name: "forwards onSessionLockAcquired so node starts can record native lock traces",
    runId: "forward-onSessionLockAcquired",
    params: { onSessionLockAcquired },
    expected: { onSessionLockAcquired },
  },
] satisfies ForwardingCase[];

describe("runEmbeddedPiAgent forwards optional params to runEmbeddedAttempt", () => {
  beforeAll(async () => {
    ({ runEmbeddedPiAgent } = await loadRunOverflowCompactionHarness());
  });

  beforeEach(() => {
    resetRunOverflowCompactionHarnessMocks();
  });

  it.each(forwardingCases)("$name", async ({ runId, params, expected }) => {
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    await runEmbeddedPiAgent({
      ...overflowBaseRunParams,
      ...params,
      runId,
    });

    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it("fails node-native worker startup before attempt when admitted model runtime is missing", async () => {
    await expect(
      runEmbeddedPiAgent({
        ...overflowBaseRunParams,
        runId: "node-native-missing-admitted-model-runtime",
        modelsJsonPolicy: "reuse-existing",
        nodeAgentNativeTaskMode: {
          enabled: true,
          allowedAgentIds: ["execution-context-scout"],
        },
      }),
    ).rejects.toThrow("requires admitted authStorage and modelRegistry");

    expect(mockedRunEmbeddedAttempt).not.toHaveBeenCalled();
  });

  it("uses caller-admitted model runtime for node-native workers before attempt", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    await runEmbeddedPiAgent({
      ...overflowBaseRunParams,
      runId: "node-native-admitted-model-runtime",
      modelsJsonPolicy: "reuse-existing",
      authStorage: admittedAuthStorage,
      modelRegistry: admittedModelRegistry,
      nodeAgentNativeTaskMode: {
        enabled: true,
        allowedAgentIds: ["execution-context-scout"],
      },
    });

    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        authStorage: admittedAuthStorage,
        modelRegistry: admittedModelRegistry,
        nodeAgentNativeTaskMode: expect.objectContaining({
          enabled: true,
          allowedAgentIds: ["execution-context-scout"],
          runChildTask: expect.any(Function),
        }),
      }),
    );
  });
});
