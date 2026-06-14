import { resolveContextRuntime } from "../context-engine/runtime.js";
import type { AgentRuntimeInvocation } from "./agent-runtime-invocation.js";
import type { AgentRuntimePreparedContext } from "./agent-runtime-prepared-context.js";
import { agentTurnProfile, type AgentTurn } from "./agent-turn.js";
import { prepareModelAuthRuntime } from "./model-auth-runtime.js";
import { resolveLiveToolResultMaxChars } from "./pi-embedded-runner/tool-result-truncation.js";
import type { EmbeddedPiRunResult } from "./pi-embedded-runner/types.js";
import { prepareRunEnvironment } from "./run-environment.js";
import { createNativeRunChildTask } from "./session-runtime/run-child-task-adapter.js";
import { resolveEffectiveSessionKey } from "./session-runtime/session-key.js";

export type { AgentRuntimePreparedContext } from "./agent-runtime-prepared-context.js";

export type AgentRuntimeCoreRunInput =
  | {
      turn: AgentTurn;
    }
  | {
      invocation: AgentRuntimeInvocation;
    };

export type AgentRuntimeCoreServiceId =
  | "prompt_service"
  | "tool_runtime"
  | "transcript_store"
  | "run_environment"
  | "context_pressure"
  | "model_auth"
  | "provider_capability"
  | "runtime_event_sink"
  | "embedded_agent_core";

export type AgentRuntimeCoreServiceOwnership = {
  serviceId: AgentRuntimeCoreServiceId;
  status: "owned";
  owner: "agent_runtime_core";
};

export type AgentRuntimeCoreServiceReceipt = {
  serviceId: AgentRuntimeCoreServiceId;
  action:
    | "prompt_profile_applied"
    | "tool_policy_observed"
    | "transcript_applied"
    | "run_environment_applied"
    | "workspace_applied"
    | "model_profile_applied"
    | "provider_profile_applied"
    | "runtime_event_sink_bound";
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type AgentRuntimeCorePreparedRun = {
  invocation: AgentRuntimeInvocation;
  runtimeContext: AgentRuntimePreparedContext;
  receipts: readonly AgentRuntimeCoreServiceReceipt[];
};

export type AgentRuntimeCoreExecutionInput = {
  turn?: AgentTurn;
  invocation: AgentRuntimeInvocation;
  runtimeContext: AgentRuntimePreparedContext;
};

export interface AgentRuntimeCoreServices {
  prepare(input: AgentRuntimeCoreRunInput): Promise<AgentRuntimeCorePreparedRun>;
}

type PreparedPromptService = AgentRuntimePreparedContext["prompt"];
type PreparedToolRuntime = AgentRuntimePreparedContext["toolRuntime"];
type PreparedWorkspace = AgentRuntimePreparedContext["workspace"];
type PreparedRunEnvironment = AgentRuntimePreparedContext["runEnvironment"];
type PreparedTranscript = AgentRuntimePreparedContext["transcript"];
type PreparedModelAuthRuntime = AgentRuntimePreparedContext["modelAuthRuntime"];
type PreparedContextPressure = AgentRuntimePreparedContext["contextPressure"];
type PreparedModelAuth = AgentRuntimePreparedContext["modelAuth"];
type PreparedProviderCapability = AgentRuntimePreparedContext["providerCapability"];
type PreparedRuntimeEventSink = AgentRuntimePreparedContext["runtimeEventSink"];

export interface AgentPromptService {
  prepare(input: AgentRuntimeCoreRunInput): PreparedPromptService;
}

export interface AgentToolRuntimeService {
  prepare(input: AgentRuntimeCoreRunInput): PreparedToolRuntime;
}

export interface AgentTranscriptStoreService {
  prepare(input: AgentRuntimeCoreRunInput): PreparedTranscript;
}

export interface AgentWorkspaceService {
  prepare(input: AgentRuntimeCoreRunInput): PreparedWorkspace;
}

export interface AgentRunEnvironmentService {
  prepare(
    input: AgentRuntimeCoreRunInput,
    prepared: {
      workspace: PreparedWorkspace;
      transcript: PreparedTranscript;
      modelAuth: PreparedModelAuth;
    },
  ): Promise<PreparedRunEnvironment>;
}

export interface AgentContextPressureService {
  prepare(input: AgentRuntimeCoreRunInput): Promise<PreparedContextPressure>;
}

export interface AgentModelAuthService {
  prepare(input: AgentRuntimeCoreRunInput): PreparedModelAuth;
}

export interface AgentProviderCapabilityService {
  prepare(input: AgentRuntimeCoreRunInput): PreparedProviderCapability;
}

export interface AgentRuntimeEventSinkService {
  prepare(input: AgentRuntimeCoreRunInput): PreparedRuntimeEventSink;
}

export type AgentRuntimeCoreServiceSet = {
  promptService: AgentPromptService;
  toolRuntime: AgentToolRuntimeService;
  transcriptStore: AgentTranscriptStoreService;
  workspace: AgentWorkspaceService;
  runEnvironment: AgentRunEnvironmentService;
  contextPressure: AgentContextPressureService;
  modelAuth: AgentModelAuthService;
  providerCapability: AgentProviderCapabilityService;
  runtimeEventSink: AgentRuntimeEventSinkService;
};

export type AgentRuntimeCoreDescriptor = {
  coreId: "agent_runtime_core";
  adapter: "interaction_runtime";
  serviceOwnership: readonly AgentRuntimeCoreServiceOwnership[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export const EMBEDDED_AGENT_RUNTIME_CORE_DESCRIPTOR: AgentRuntimeCoreDescriptor = {
  coreId: "agent_runtime_core",
  adapter: "interaction_runtime",
  serviceOwnership: [
    {
      serviceId: "embedded_agent_core",
      status: "owned",
      owner: "agent_runtime_core",
    },
    {
      serviceId: "prompt_service",
      status: "owned",
      owner: "agent_runtime_core",
    },
    {
      serviceId: "tool_runtime",
      status: "owned",
      owner: "agent_runtime_core",
    },
    {
      serviceId: "transcript_store",
      status: "owned",
      owner: "agent_runtime_core",
    },
    {
      serviceId: "run_environment",
      status: "owned",
      owner: "agent_runtime_core",
    },
    {
      serviceId: "context_pressure",
      status: "owned",
      owner: "agent_runtime_core",
    },
    {
      serviceId: "model_auth",
      status: "owned",
      owner: "agent_runtime_core",
    },
    {
      serviceId: "provider_capability",
      status: "owned",
      owner: "agent_runtime_core",
    },
    {
      serviceId: "runtime_event_sink",
      status: "owned",
      owner: "agent_runtime_core",
    },
  ],
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
};

export interface AgentRuntimeCore {
  describe(): AgentRuntimeCoreDescriptor;
  run(input: AgentRuntimeCoreRunInput): Promise<EmbeddedPiRunResult>;
}

export type AgentRuntimeCorePhase =
  | "prepare_run"
  | "run_environment_preparing"
  | "run_environment_prepared"
  | "model_auth_preparing"
  | "model_auth_prepared"
  | "before_submit"
  | "run_interaction_turn"
  | "after_provider_turn"
  | "finishing";

function emitCorePhaseToSink(
  onAgentEvent: AgentRuntimeInvocation["runtime"]["onAgentEvent"],
  phase: AgentRuntimeCorePhase,
  component: "agent_runtime_core" | "interaction_runtime",
  details: Record<string, unknown> = {},
): void {
  onAgentEvent?.({
    stream: "agent-runtime-core",
    data: {
      phase,
      component,
      status: "ok",
      ...details,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
  });
}

function emitCorePhase(
  input: AgentRuntimeCoreRunInput,
  phase: AgentRuntimeCorePhase,
  component: "agent_runtime_core" | "interaction_runtime",
  details: Record<string, unknown> = {},
): void {
  emitCorePhaseToSink(coreInputView(input).runtime.onAgentEvent, phase, component, details);
}

function receipt(
  serviceId: AgentRuntimeCoreServiceId,
  action: AgentRuntimeCoreServiceReceipt["action"],
): AgentRuntimeCoreServiceReceipt {
  return {
    serviceId,
    action,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function coreInputView(input: AgentRuntimeCoreRunInput): AgentRuntimeInvocation {
  if ("invocation" in input) {
    return input.invocation;
  }
  const turn = input.turn;
  const profile = agentTurnProfile(turn);
  return {
    request: {
      ...turn.acceptedRun.runRequest,
      abortSignal: turn.abortSignal ?? turn.acceptedRun.runRequest.abortSignal,
    },
    runtime: {
      source: "runtime_generation",
      sessionId: turn.acceptedRun.sessionId,
      sessionKey: turn.acceptedRun.sessionId,
      sessionFile: turn.acceptedRun.runRequest.transcript.sessionFile,
      workspaceDir: profile.roots.runtimeWorkspaceDir,
      agentDir: profile.agentDir,
      config: turn.generation.config,
      authStorage: profile.authStorage,
      modelRegistry: profile.modelRegistry,
      admittedRuntimeModel: profile.admittedRuntimeModel,
      providerCapability: profile.providerCapability,
      agentId: profile.agentId,
      provider: profile.model.provider,
      model: profile.model.modelId,
      ...(profile.thinkingLevel ? { thinkLevel: profile.thinkingLevel } : {}),
      ...(profile.reasoningLevel ? { reasoningLevel: profile.reasoningLevel } : {}),
      prompt: turn.acceptedRun.taskMessage.text,
      trigger: "manual",
      timeoutMs: 1_800_000,
      runId: turn.envelope.runtimeJobId,
      abortSignal: turn.abortSignal,
      lane: "native-execution",
      disableMessageTool: true,
      requireExplicitMessageTarget: true,
      allowGatewaySubagentBinding: false,
      runtimePluginIds: [],
      modelsJsonPolicy: "reuse-existing",
      bootstrapContextMode: "lightweight",
      bootstrapContextRunKind: "default",
      toolResultFormat: "markdown",
      nativeRuntimeTools: turn.envelope.nativeRuntimeTools,
      nativeExecutionSession: turn.envelope.nativeExecutionSession,
      onAgentEvent: turn.envelope.onAgentEvent,
      ...(turn.envelope.nodeAgentNativeTaskMode
        ? { nodeAgentNativeTaskMode: turn.envelope.nodeAgentNativeTaskMode }
        : {}),
    },
  };
}

function boundedErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
}

function emitRuntimeTurnEvent(
  input: AgentRuntimeCoreRunInput,
  phase: "executor_entered" | "agent_core_starting" | "agent_core_completed" | "agent_core_failed",
  startedAt: number,
  extra: { errorName?: string; errorMessage?: string } = {},
): void {
  if (!("turn" in input)) {
    return;
  }
  const request = input.turn.acceptedRun.runRequest;
  const onRuntimeEvent = input.turn.envelope.onRuntimeEvent;
  if (!onRuntimeEvent) {
    return;
  }
  void Promise.resolve(
    onRuntimeEvent({
      phase,
      executionClass: input.turn.envelope.executionClass,
      schedulerClass: "agent_runtime",
      requestShape: "openclaw.agent-run-request.v1",
      elapsedMs: Date.now() - startedAt,
      sessionId: request.transcript.sessionId,
      sessionKey: request.transcript.sessionKey ?? null,
      agentId: request.agentId,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      workQueueLifecycleMutationAllowed: false,
      ...extra,
    }),
  ).catch(() => {
    // RuntimeJob envelope telemetry is diagnostic evidence. It must not keep a
    // completed OpenClaw turn from returning to the lifecycle reducer.
  });
}

function abortErrorFromSignal(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) {
    return reason;
  }
  const error =
    reason !== undefined
      ? new Error("Operation aborted", { cause: reason })
      : new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortErrorFromSignal(signal);
  }
}

export class DefaultAgentPromptService implements AgentPromptService {
  prepare(input: AgentRuntimeCoreRunInput): PreparedPromptService {
    const view = coreInputView(input);
    return {
      profile: view.request.promptProfile ?? null,
      promptLength: view.request.input.prompt.length,
      rawPromptStored: false,
    };
  }
}

export class DefaultAgentToolRuntimeService implements AgentToolRuntimeService {
  prepare(input: AgentRuntimeCoreRunInput): PreparedToolRuntime {
    const view = coreInputView(input);
    return {
      ...(view.request.toolPolicy?.visibleToolNames !== undefined
        ? { visibleToolNames: view.request.toolPolicy.visibleToolNames }
        : {}),
      ...(view.request.toolPolicy?.requiredToolNames !== undefined
        ? { requiredToolNames: view.request.toolPolicy.requiredToolNames }
        : {}),
      rawToolLogStored: false,
    };
  }
}

export class DefaultAgentTranscriptStoreService implements AgentTranscriptStoreService {
  prepare(input: AgentRuntimeCoreRunInput): PreparedTranscript {
    const view = coreInputView(input);
    const sessionKey = resolveEffectiveSessionKey({
      config: view.runtime.config,
      sessionId: view.request.transcript.sessionId,
      sessionKey: view.request.transcript.sessionKey ?? view.runtime.sessionKey ?? null,
      agentId: view.request.agentId ?? view.runtime.agentId ?? null,
    });
    return {
      sessionId: view.request.transcript.sessionId,
      sessionKey: sessionKey ?? null,
      sessionFile: view.request.transcript.sessionFile,
      rawPromptStored: false,
      rawResponseStored: false,
    };
  }
}

export class DefaultAgentWorkspaceService implements AgentWorkspaceService {
  prepare(input: AgentRuntimeCoreRunInput): PreparedWorkspace {
    const view = coreInputView(input);
    return {
      canonicalSourceRoot: view.request.workspace.canonicalSourceRoot,
      runtimeWorkspaceDir: view.request.workspace.runtimeWorkspaceDir,
      transcriptRoot: view.request.workspace.transcriptRoot,
      artifactRoot: view.request.workspace.artifactRoot,
    };
  }
}

export class DefaultAgentRunEnvironmentService implements AgentRunEnvironmentService {
  async prepare(
    input: AgentRuntimeCoreRunInput,
    prepared: {
      workspace: PreparedWorkspace;
      transcript: PreparedTranscript;
      modelAuth: PreparedModelAuth;
    },
  ): Promise<PreparedRunEnvironment> {
    const view = coreInputView(input);
    return await prepareRunEnvironment({
      config: view.runtime.config,
      runId: view.runtime.runId,
      workspaceDir: prepared.workspace.runtimeWorkspaceDir,
      sessionId: prepared.transcript.sessionId,
      sessionKey: prepared.transcript.sessionKey,
      agentId: view.request.agentId ?? view.runtime.agentId ?? null,
      provider: prepared.modelAuth.provider,
      model: prepared.modelAuth.model,
      agentDir: view.runtime.agentDir ?? null,
      runtimePluginIds: view.runtime.runtimePluginIds,
      allowGatewaySubagentBinding: view.runtime.allowGatewaySubagentBinding,
      modelsJsonPolicy: view.runtime.modelsJsonPolicy,
      authRuntimeAdmitted: Boolean(view.runtime.authStorage && view.runtime.modelRegistry),
    });
  }
}

export class DefaultAgentContextPressureService implements AgentContextPressureService {
  async prepare(input: AgentRuntimeCoreRunInput): Promise<PreparedContextPressure> {
    const view = coreInputView(input);
    return {
      runtime: await resolveContextRuntime(view.runtime.config),
      owner: "agent_runtime_core",
    };
  }
}

export class DefaultAgentModelAuthService implements AgentModelAuthService {
  prepare(input: AgentRuntimeCoreRunInput): PreparedModelAuth {
    const view = coreInputView(input);
    return {
      provider: view.request.modelProfile?.provider ?? view.runtime.provider ?? null,
      model: view.request.modelProfile?.model ?? view.runtime.model ?? null,
      authStorageAdmitted: Boolean(view.runtime.authStorage),
      modelRegistryAdmitted: Boolean(view.runtime.modelRegistry),
      owner: "agent_runtime_core",
    };
  }
}

export class DefaultAgentProviderCapabilityService implements AgentProviderCapabilityService {
  prepare(input: AgentRuntimeCoreRunInput): PreparedProviderCapability {
    const view = coreInputView(input);
    const providerCapability = view.runtime.providerCapability;
    return {
      owner: "agent_runtime_core",
      adapter: "interaction_attempt_runtime",
      ...(providerCapability
        ? {
            capability: {
              capabilityId: providerCapability.capabilityId,
              provider: providerCapability.provider,
              model: providerCapability.model,
              transportKind: providerCapability.transportKind,
              fallbackAllowed: providerCapability.fallbackAllowed,
            },
          }
        : {}),
      runTurn: async (input: {
        attempt: unknown;
        emit: (event: never) => void;
        signal?: AbortSignal;
      }) => {
        if (providerCapability) {
          return await providerCapability.runTurn(input as never);
        }
        throw new Error(
          "invalid_runtime_generation: missing provider capability for AgentRuntimeCore run",
        );
      },
    };
  }
}

export class DefaultAgentRuntimeEventSinkService implements AgentRuntimeEventSinkService {
  prepare(input: AgentRuntimeCoreRunInput): PreparedRuntimeEventSink {
    const view = coreInputView(input);
    return {
      owner: "agent_runtime_core",
      evented: typeof view.runtime.onAgentEvent === "function",
      rawProviderLogStored: false,
    };
  }
}

function defaultServiceSet(): AgentRuntimeCoreServiceSet {
  return {
    promptService: new DefaultAgentPromptService(),
    toolRuntime: new DefaultAgentToolRuntimeService(),
    transcriptStore: new DefaultAgentTranscriptStoreService(),
    workspace: new DefaultAgentWorkspaceService(),
    runEnvironment: new DefaultAgentRunEnvironmentService(),
    contextPressure: new DefaultAgentContextPressureService(),
    modelAuth: new DefaultAgentModelAuthService(),
    providerCapability: new DefaultAgentProviderCapabilityService(),
    runtimeEventSink: new DefaultAgentRuntimeEventSinkService(),
  };
}

export class DefaultAgentRuntimeCoreServices implements AgentRuntimeCoreServices {
  constructor(private readonly services: AgentRuntimeCoreServiceSet = defaultServiceSet()) {}

  async prepare(input: AgentRuntimeCoreRunInput): Promise<AgentRuntimeCorePreparedRun> {
    const view = coreInputView(input);
    const request = view.request;
    const prompt = this.services.promptService.prepare(input);
    const toolRuntime = this.services.toolRuntime.prepare(input);
    const workspace = this.services.workspace.prepare(input);
    const transcript = this.services.transcriptStore.prepare(input);
    const modelAuth = this.services.modelAuth.prepare(input);
    emitCorePhase(input, "run_environment_preparing", "agent_runtime_core", {
      requestShape: "openclaw.agent-run-request.v1",
      promptProfile: request.promptProfile ?? null,
    });
    const runEnvironment = await this.services.runEnvironment.prepare(input, {
      workspace,
      transcript,
      modelAuth,
    });
    emitCorePhase(input, "run_environment_prepared", "agent_runtime_core", {
      runEnvironmentOwner: runEnvironment.owner,
      resolvedWorkspace: runEnvironment.resolvedWorkspace,
      workspaceFallbackUsed: runEnvironment.workspaceResolution.usedFallback,
      modelsJsonStatus: runEnvironment.modelsJsonStatus,
      runtimePluginsLoaded: runEnvironment.runtimePluginsLoaded,
      runtimePluginsStatus: runEnvironment.runtimePluginsStatus,
    });
    emitCorePhase(input, "model_auth_preparing", "agent_runtime_core", {
      provider: runEnvironment.provider,
      model: runEnvironment.modelId,
      runEnvironmentOwner: runEnvironment.owner,
    });
    const modelAuthRuntime: PreparedModelAuthRuntime = await prepareModelAuthRuntime({
      config: view.runtime.config,
      prompt: request.input.prompt,
      provider: runEnvironment.provider,
      modelId: runEnvironment.modelId,
      agentDir: runEnvironment.agentDir,
      resolvedWorkspace: runEnvironment.resolvedWorkspace,
      sessionId: transcript.sessionId,
      sessionKey: transcript.sessionKey,
      agentId: request.agentId ?? view.runtime.agentId ?? null,
      messageProvider: view.runtime.messageProvider ?? null,
      messageChannel: view.runtime.messageChannel ?? null,
      trigger: request.input.trigger ?? view.runtime.trigger,
      authStorage: view.runtime.authStorage,
      modelRegistry: view.runtime.modelRegistry,
      admittedRuntimeModel: view.runtime.admittedRuntimeModel,
      authProfileId: view.runtime.authProfileId ?? null,
      authProfileIdSource: view.runtime.authProfileIdSource ?? null,
      nodeNativeWorkerRun: view.runtime.nodeAgentNativeTaskMode?.enabled === true,
    });
    const nodeAgentNativeTaskMode =
      view.runtime.nodeAgentNativeTaskMode?.enabled === true
        ? {
            ...view.runtime.nodeAgentNativeTaskMode,
            parentVisibleResultMaxChars:
              view.runtime.nodeAgentNativeTaskMode.parentVisibleResultMaxChars ??
              resolveLiveToolResultMaxChars({
                contextWindowTokens: modelAuthRuntime.ctxInfo.tokens,
                cfg: view.runtime.config,
                agentId: request.agentId ?? view.runtime.agentId ?? null,
              }),
            runChildTask:
              view.runtime.nodeAgentNativeTaskMode.runChildTask ??
              createNativeRunChildTask({
                parentContext: {
                  sessionKey: view.runtime.sessionKey,
                  runId: view.runtime.runId,
                  nodeRunId: view.runtime.nodeRunId,
                  messageChannel: view.runtime.messageChannel,
                  messageProvider: view.runtime.messageProvider,
                  agentAccountId: view.runtime.agentAccountId,
                  messageTo: view.runtime.messageTo,
                  messageThreadId: view.runtime.messageThreadId,
                  groupId: view.runtime.groupId,
                  groupChannel: view.runtime.groupChannel,
                  groupSpace: view.runtime.groupSpace,
                  senderIsOwner: view.runtime.senderIsOwner,
                  agentDir: view.runtime.agentDir,
                  config: view.runtime.config,
                  authStorage: view.runtime.authStorage,
                  modelRegistry: view.runtime.modelRegistry,
                  toolResultFormat: view.runtime.toolResultFormat,
                  enqueue: view.runtime.enqueue,
                  abortSignal: view.runtime.abortSignal,
                  onAgentEvent: view.runtime.onAgentEvent,
                  suppressToolErrorWarnings: view.runtime.suppressToolErrorWarnings,
                },
                resolvedWorkspace: runEnvironment.resolvedWorkspace,
                runAgent: async (childParams) => {
                  return await new DefaultAgentRuntimeCore().run({
                    invocation: {
                      request: {
                        agentId: childParams.agentId ?? null,
                        input: {
                          prompt: childParams.prompt,
                          trigger: childParams.trigger ?? null,
                        },
                        modelProfile: {
                          provider: childParams.provider ?? null,
                          model: childParams.model ?? null,
                          thinkingLevel: childParams.thinkLevel ?? null,
                          reasoningLevel: null,
                        },
                        workspace: {
                          canonicalSourceRoot: childParams.workspaceDir,
                          runtimeWorkspaceDir: childParams.workspaceDir,
                          transcriptRoot: null,
                          artifactRoot: null,
                        },
                        transcript: {
                          sessionId: childParams.sessionId,
                          sessionKey: childParams.sessionKey ?? null,
                          sessionFile: childParams.sessionFile,
                        },
                        abortSignal: childParams.abortSignal,
                      },
                      runtime: {
                        source: "runtime_generation",
                        ...childParams,
                      },
                    },
                  });
                },
              }),
          }
        : view.runtime.nodeAgentNativeTaskMode;
    emitCorePhase(input, "model_auth_prepared", "agent_runtime_core", {
      modelAuthOwner: modelAuthRuntime.owner,
      provider: modelAuthRuntime.provider,
      model: modelAuthRuntime.modelId,
      modelRegistryStatus: modelAuthRuntime.modelRegistryStatus,
      authProfileCount: modelAuthRuntime.authProfileCount,
      profileCandidateCount: modelAuthRuntime.profileCandidates.length,
      contextWindowTokens: modelAuthRuntime.ctxInfo.tokens,
    });
    const contextPressure = await this.services.contextPressure.prepare(input);
    const providerCapability = this.services.providerCapability.prepare(input);
    const runtimeEventSink = this.services.runtimeEventSink.prepare(input);
    const receipts = [
      receipt("prompt_service", "prompt_profile_applied"),
      receipt("tool_runtime", "tool_policy_observed"),
      receipt("transcript_store", "transcript_applied"),
      receipt("run_environment", "run_environment_applied"),
      receipt("context_pressure", "workspace_applied"),
      receipt("model_auth", "model_profile_applied"),
      receipt("provider_capability", "provider_profile_applied"),
      receipt("runtime_event_sink", "runtime_event_sink_bound"),
    ] as const;
    const runtimeContext: AgentRuntimePreparedContext = {
      owner: "agent_runtime_core",
      requestShape: "openclaw.agent-run-request.v1",
      prompt,
      toolRuntime,
      workspace,
      runEnvironment,
      transcript,
      contextPressure,
      modelAuth,
      modelAuthRuntime,
      providerCapability,
      runtimeEventSink,
      receipts,
    };
    const invocation: AgentRuntimeInvocation = {
      request,
      runtime: {
        ...view.runtime,
        agentId: request.agentId ?? view.runtime.agentId,
        prompt: request.input.prompt,
        trigger: request.input.trigger ?? view.runtime.trigger,
        workspaceDir: workspace.runtimeWorkspaceDir,
        sessionId: transcript.sessionId,
        sessionKey: transcript.sessionKey ?? view.runtime.sessionKey,
        sessionFile: transcript.sessionFile,
        provider: modelAuthRuntime.provider,
        model: modelAuthRuntime.modelId,
        thinkLevel: request.modelProfile?.thinkingLevel ?? view.runtime.thinkLevel,
        reasoningLevel: request.modelProfile?.reasoningLevel ?? view.runtime.reasoningLevel,
        toolsAllow:
          toolRuntime.visibleToolNames !== undefined
            ? [...toolRuntime.visibleToolNames]
            : view.runtime.toolsAllow,
        agentDir: view.runtime.agentDir,
        authStorage: view.runtime.authStorage,
        modelRegistry: view.runtime.modelRegistry,
        admittedRuntimeModel: view.runtime.admittedRuntimeModel,
        providerCapability: view.runtime.providerCapability,
        ...(nodeAgentNativeTaskMode ? { nodeAgentNativeTaskMode } : {}),
        modelsJsonPolicy:
          view.runtime.modelsJsonPolicy ??
          (view.runtime.authStorage && view.runtime.modelRegistry
            ? "reuse-existing"
            : view.runtime.modelsJsonPolicy),
        abortSignal: request.abortSignal ?? view.runtime.abortSignal,
      },
    };
    return {
      invocation,
      runtimeContext,
      receipts,
    };
  }
}

export class DefaultAgentRuntimeCore implements AgentRuntimeCore {
  private readonly services: AgentRuntimeCoreServices;

  constructor(
    private readonly options: {
      runInteractionRuntime?: (
        input: AgentRuntimeCoreExecutionInput,
      ) => Promise<EmbeddedPiRunResult>;
      runEmbeddedCore?: (input: AgentRuntimeCoreExecutionInput) => Promise<EmbeddedPiRunResult>;
      services?: AgentRuntimeCoreServices;
    } = {},
  ) {
    this.services = options.services ?? new DefaultAgentRuntimeCoreServices();
  }

  describe(): AgentRuntimeCoreDescriptor {
    return EMBEDDED_AGENT_RUNTIME_CORE_DESCRIPTOR;
  }

  async run(input: AgentRuntimeCoreRunInput): Promise<EmbeddedPiRunResult> {
    const startedAt = Date.now();
    const view = coreInputView(input);
    const runCore =
      this.options.runInteractionRuntime ??
      this.options.runEmbeddedCore ??
      runDefaultInteractionRuntime;
    emitRuntimeTurnEvent(input, "executor_entered", startedAt);
    throwIfAborted(view.request.abortSignal ?? view.runtime.abortSignal);
    emitRuntimeTurnEvent(input, "agent_core_starting", startedAt);
    emitCorePhase(input, "prepare_run", "agent_runtime_core", {
      requestShape: "openclaw.agent-run-request.v1",
      agentId: view.request.agentId,
      promptProfile: view.request.promptProfile ?? null,
    });
    let prepared: AgentRuntimeCorePreparedRun;
    try {
      prepared = await this.services.prepare(input);
    } catch (error) {
      emitRuntimeTurnEvent(input, "agent_core_failed", startedAt, {
        errorName: error instanceof Error ? error.name : "Error",
        errorMessage: boundedErrorMessage(error),
      });
      throw error;
    }
    prepared.invocation.runtime.onAgentEvent?.({
      stream: "agent-runtime-core",
      data: {
        phase: "services_prepared",
        component: "agent_runtime_core",
        status: "ok",
        requestShape: prepared.runtimeContext.requestShape,
        serviceReceiptCount: prepared.receipts.length,
        promptProfile: prepared.runtimeContext.prompt.profile ?? null,
        visibleToolCount: prepared.runtimeContext.toolRuntime.visibleToolNames?.length ?? null,
        requiredToolCount: prepared.runtimeContext.toolRuntime.requiredToolNames?.length ?? null,
        runEnvironmentOwner: prepared.runtimeContext.runEnvironment.owner,
        resolvedWorkspace: prepared.runtimeContext.runEnvironment.resolvedWorkspace,
        workspaceFallbackUsed:
          prepared.runtimeContext.runEnvironment.workspaceResolution.usedFallback,
        modelsJsonStatus: prepared.runtimeContext.runEnvironment.modelsJsonStatus,
        runtimePluginsLoaded: prepared.runtimeContext.runEnvironment.runtimePluginsLoaded,
        runtimePluginsStatus: prepared.runtimeContext.runEnvironment.runtimePluginsStatus,
        contextPressureOwner:
          prepared.runtimeContext.contextPressure?.owner ?? "agent_runtime_core",
        modelAuthOwner: prepared.runtimeContext.modelAuth.owner,
        modelRegistryStatus: prepared.runtimeContext.modelAuthRuntime.modelRegistryStatus,
        authProfileCount: prepared.runtimeContext.modelAuthRuntime.authProfileCount,
        profileCandidateCount: prepared.runtimeContext.modelAuthRuntime.profileCandidates.length,
        contextWindowTokens: prepared.runtimeContext.modelAuthRuntime.ctxInfo.tokens,
        providerCapabilityOwner: prepared.runtimeContext.providerCapability.owner,
        providerCapabilityId:
          prepared.runtimeContext.providerCapability.capability?.capabilityId ?? null,
        providerTransportKind:
          prepared.runtimeContext.providerCapability.capability?.transportKind ?? null,
        providerFallbackAllowed:
          prepared.runtimeContext.providerCapability.capability?.fallbackAllowed ?? null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    });
    emitCorePhaseToSink(
      prepared.invocation.runtime.onAgentEvent,
      "before_submit",
      "agent_runtime_core",
      {
        requestShape: prepared.runtimeContext.requestShape,
        receiptCount: prepared.receipts.length,
      },
    );
    emitCorePhaseToSink(
      prepared.invocation.runtime.onAgentEvent,
      "run_interaction_turn",
      "interaction_runtime",
      {
        adapter: "interaction_runtime",
      },
    );
    let result: EmbeddedPiRunResult;
    try {
      result = await runCore({
        ...("turn" in input ? { turn: input.turn } : {}),
        invocation: prepared.invocation,
        runtimeContext: prepared.runtimeContext,
      });
    } catch (error) {
      emitRuntimeTurnEvent(input, "agent_core_failed", startedAt, {
        errorName: error instanceof Error ? error.name : "Error",
        errorMessage: boundedErrorMessage(error),
      });
      throw error;
    }
    emitCorePhaseToSink(
      prepared.invocation.runtime.onAgentEvent,
      "after_provider_turn",
      "interaction_runtime",
      {
        stopReason: result.meta.stopReason ?? null,
        errorKind: result.meta.error?.kind ?? null,
      },
    );
    emitCorePhaseToSink(
      prepared.invocation.runtime.onAgentEvent,
      "finishing",
      "agent_runtime_core",
      {
        payloadCount: result.payloads?.length ?? 0,
        stopReason: result.meta.stopReason ?? null,
      },
    );
    emitRuntimeTurnEvent(input, "agent_core_completed", startedAt);
    return result;
  }
}

export { DefaultAgentRuntimeCore as EmbeddedAgentRuntimeCore };

async function runDefaultInteractionRuntime(
  input: AgentRuntimeCoreExecutionInput,
): Promise<EmbeddedPiRunResult> {
  const { runInteractionRuntime } = await import("./interaction-runtime.js");
  return await runInteractionRuntime(input);
}
