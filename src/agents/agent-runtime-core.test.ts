import { describe, expect, it, vi } from "vitest";
import {
  DefaultAgentRuntimeCore,
  type AgentRuntimeCorePreparedRun,
  type AgentRuntimeCoreServices,
} from "./agent-runtime-core.js";
import type { AgentTurn } from "./agent-turn.js";
import type { EmbeddedPiRunResult } from "./pi-embedded-runner/types.js";

const completedRunResult: EmbeddedPiRunResult = {
  payloads: [{ text: "completed" }],
  meta: {
    durationMs: 12,
    stopReason: "end_turn",
  },
};

function preparedRun(): AgentRuntimeCorePreparedRun {
  return {
    invocation: {
      request: {
        agentId: "execution-orchestrator",
        input: {
          prompt: "complete the turn",
          trigger: "manual",
        },
        promptProfile: "execution-orchestrator",
        toolPolicy: {
          visibleToolNames: ["node_finish"],
          requiredToolNames: ["node_finish"],
        },
        modelProfile: {
          provider: "codex",
          model: "gpt-5.5",
          thinkingLevel: "xhigh",
          reasoningLevel: null,
        },
        workspace: {
          canonicalSourceRoot: "/repo",
          runtimeWorkspaceDir: "/runtime/workspace",
          transcriptRoot: "/runtime/transcripts",
          artifactRoot: "/runtime/artifacts",
        },
        transcript: {
          sessionId: "native-turn",
          sessionKey: "native-turn",
          sessionFile: "/runtime/transcripts/native-turn.jsonl",
        },
      },
      runtime: {
        source: "runtime_generation",
        sessionId: "native-turn",
        sessionKey: "native-turn",
        sessionFile: "/runtime/transcripts/native-turn.jsonl",
        workspaceDir: "/runtime/workspace",
        agentDir: "/runtime/agents/execution-orchestrator",
        config: {},
        agentId: "execution-orchestrator",
        provider: "codex",
        model: "gpt-5.5",
        prompt: "complete the turn",
        trigger: "manual",
        timeoutMs: 1_800_000,
        runId: "runtime-job-id",
        lane: "native-execution",
        disableMessageTool: true,
        requireExplicitMessageTarget: true,
        allowGatewaySubagentBinding: false,
        runtimePluginIds: [],
        modelsJsonPolicy: "reuse-existing",
        bootstrapContextMode: "lightweight",
        bootstrapContextRunKind: "default",
        toolResultFormat: "markdown",
      },
    },
    runtimeContext: {
      owner: "agent_runtime_core",
      requestShape: "openclaw.agent-run-request.v1",
      prompt: {
        profile: "execution-orchestrator",
        promptLength: 17,
        rawPromptStored: false,
      },
      toolRuntime: {
        visibleToolNames: ["node_finish"],
        requiredToolNames: ["node_finish"],
        rawToolLogStored: false,
      },
      workspace: {
        canonicalSourceRoot: "/repo",
        runtimeWorkspaceDir: "/runtime/workspace",
        transcriptRoot: "/runtime/transcripts",
        artifactRoot: "/runtime/artifacts",
      },
      runEnvironment: {
        owner: "agent_runtime_core",
        workspaceResolution: {
          workspaceDir: "/runtime/workspace",
          usedFallback: false,
          agentId: "execution-orchestrator",
          agentIdSource: "explicit",
        },
        resolvedWorkspace: "/runtime/workspace",
        provider: "codex",
        modelId: "gpt-5.5",
        agentDir: "/runtime/agents/execution-orchestrator",
        normalizedSessionKey: "native-turn",
        fallbackConfigured: false,
        runtimePluginsLoaded: false,
        runtimePluginsStatus: "skipped_not_requested",
        modelsJsonStatus: "reused_admitted_runtime",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
      transcript: {
        sessionId: "native-turn",
        sessionKey: "native-turn",
        sessionFile: "/runtime/transcripts/native-turn.jsonl",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      modelAuth: {
        provider: "codex",
        model: "gpt-5.5",
        authStorageAdmitted: true,
        modelRegistryAdmitted: true,
        owner: "agent_runtime_core",
      },
      modelAuthRuntime: {
        owner: "agent_runtime_core",
        provider: "codex",
        modelId: "gpt-5.5",
        authStorage: {},
        modelRegistry: {},
        modelRegistryStatus: "reused",
        runtimeModel: {},
        effectiveModel: {},
        ctxInfo: { tokens: 272_000 },
        authStore: {},
        authProfileCount: 1,
        profileCandidates: ["chatgpt"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } as never,
      providerCapability: {
        owner: "agent_runtime_core",
        adapter: "interaction_attempt_runtime",
        capability: {
          capabilityId: "codex_app_server",
          provider: "codex",
          model: "gpt-5.5",
          transportKind: "codex_app_server",
          fallbackAllowed: false,
        },
        runTurn: vi.fn(),
      },
      runtimeEventSink: {
        owner: "agent_runtime_core",
        evented: true,
        rawProviderLogStored: false,
      },
      receipts: [],
    },
    receipts: [],
  };
}

function turn(onRuntimeEvent: AgentTurn["envelope"]["onRuntimeEvent"]): AgentTurn {
  return {
    generation: {
      id: "runtime-generation:test",
      profiles: new Map([
        [
          "execution-orchestrator",
          {
            agentId: "execution-orchestrator",
            agentDir: "/runtime/agents/execution-orchestrator",
            roots: {
              canonicalSourceRoot: "/repo",
              runtimeWorkspaceDir: "/runtime/workspace",
              transcriptRoot: "/runtime/transcripts",
              artifactRoot: "/runtime/artifacts",
            },
            model: {
              provider: "codex",
              modelId: "gpt-5.5",
            },
            thinkingLevel: "xhigh",
            reasoningLevel: null,
          },
        ],
      ]),
      config: {},
    } as never,
    acceptedRun: {
      agentId: "execution-orchestrator",
      sessionId: "native-turn",
      taskMessage: { text: "complete the turn" },
      runRequest: preparedRun().invocation.request,
    } as never,
    envelope: {
      kind: "runtime_job",
      runtimeJobId: "runtime-job-id",
      executionClass: "native_runtime_job",
      onRuntimeEvent,
    },
  };
}

describe("DefaultAgentRuntimeCore", () => {
  it("does not let runtime_job envelope telemetry block a completed turn result", async () => {
    const runtimeEventNeverResolves = vi.fn(
      () =>
        new Promise<void>(() => {
          // Intentionally unresolved: lifecycle reduction must not wait on telemetry.
        }),
    );
    const services: AgentRuntimeCoreServices = {
      prepare: vi.fn(async () => preparedRun()),
    };
    const runInteractionRuntime = vi.fn(async () => completedRunResult);
    const core = new DefaultAgentRuntimeCore({
      services,
      runInteractionRuntime,
    });

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const blocked = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error("agent_runtime_core_blocked_on_runtime_event"));
      }, 100);
    });

    try {
      await expect(
        Promise.race([core.run({ turn: turn(runtimeEventNeverResolves) }), blocked]),
      ).resolves.toBe(completedRunResult);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }

    expect(runInteractionRuntime).toHaveBeenCalledTimes(1);
    expect(runtimeEventNeverResolves).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "executor_entered",
        executionClass: "native_runtime_job",
        requestShape: "openclaw.agent-run-request.v1",
      }),
    );
  });
});
