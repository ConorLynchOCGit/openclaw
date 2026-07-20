// Codex plugin module implements thread lifecycle behavior.
import {
  buildSkillWorkshopPromptSection,
  embeddedAgentLog,
  formatErrorMessage,
  isActiveHarnessContextEngine,
  SKILL_WORKSHOP_TOOL_NAME,
  type EmbeddedRunAttemptParams,
} from "openclaw/plugin-sdk/agent-harness-runtime";
import { buildCodexUserMcpServersThreadConfigPatch } from "openclaw/plugin-sdk/codex-mcp-projection";
import { listRegisteredPluginAgentPromptGuidance } from "openclaw/plugin-sdk/plugin-runtime";
import { CODEX_GPT5_HEARTBEAT_PROMPT_OVERLAY } from "../../prompt-overlay.js";
import { isModernCodexModel, supportsMaxCodexModel } from "../../provider.js";
import {
  CodexAppServerRpcError,
  isCodexAppServerConnectionClosedError,
  type CodexAppServerClient,
} from "./client.js";
import { codexSandboxPolicyForTurn, type CodexAppServerRuntimeOptions } from "./config.js";
import {
  resolveCodexContextEngineProjectionMaxChars,
  resolveCodexContextEngineProjectionReserveTokens,
} from "./context-engine-projection.js";
import { shouldDisableCodexToolSearchForModel } from "./dynamic-tool-profile.js";
import { invalidInlineImageText, sanitizeInlineImageDataUrl } from "./image-payload-sanitizer.js";
import {
  isCodexPluginThreadBindingStale,
  mergeCodexThreadConfigs,
  type CodexPluginThreadConfig,
} from "./plugin-thread-config.js";
import { isCodexAppServerProfilerEnabled } from "./profiler-flag.js";
import {
  assertCodexThreadResumeResponse,
  assertCodexThreadStartResponse,
} from "./protocol-validators.js";
import {
  isJsonObject,
  type CodexDynamicToolSpec,
  type CodexSandboxPolicy,
  type CodexThreadResumeParams,
  type CodexThreadStartParams,
  type CodexTurnEnvironmentParams,
  type CodexTurnStartParams,
  type JsonObject,
  type CodexUserInput,
  type JsonValue,
} from "./protocol.js";
import {
  clearCodexAppServerBinding,
  isCodexAppServerNativeAuthProfile,
  readCodexAppServerBinding,
  writeCodexAppServerBinding,
  type CodexAppServerAuthProfileLookup,
  type CodexAppServerContextEngineBinding,
  type CodexAppServerContextEngineProjectionBinding,
  type CodexAppServerThreadBinding,
} from "./session-binding.js";
import {
  assertCodexSystemThreadResponse,
  assertCodexSystemV2Model,
  type CodexSystemThreadContext,
} from "./system-authority.js";

export type CodexAppServerThreadLifecycle = {
  action: "started" | "resumed";
  rotatedContextEngineBinding?: boolean;
  activeTurnIds?: string[];
};

export type CodexAppServerThreadLifecycleBinding = CodexAppServerThreadBinding & {
  lifecycle: CodexAppServerThreadLifecycle;
};

class CodexThreadStartRequestError extends Error {
  constructor(cause: unknown) {
    super(formatErrorMessage(cause), { cause });
    this.name = "CodexThreadStartRequestError";
  }
}

export function isCodexThreadStartRequestError(error: unknown): boolean {
  return error instanceof CodexThreadStartRequestError;
}

export type CodexThreadFinalConfigPatchDecision =
  | { action: "resume"; binding: CodexAppServerThreadBinding }
  | { action: "start" };

export type CodexThreadFinalConfigPatchResult = {
  configPatch?: JsonObject;
  nativeHookRelayGeneration?: string;
};

export type CodexContextEngineThreadBootstrapProjection = {
  mode: "thread_bootstrap";
  epoch: string;
  fingerprint?: string;
};

export type CodexPluginThreadConfigProvider = {
  enabled: boolean;
  inputFingerprint?: string;
  enabledPluginConfigKeys?: readonly string[];
  build: () => Promise<CodexPluginThreadConfig>;
};

export const CODEX_NATIVE_PERSONALITY_NONE = "none";

// Stream structured patch snapshots so large generated edits keep the turn active.
export const CODEX_CODE_MODE_THREAD_CONFIG: JsonObject = {
  "features.code_mode": true,
  "features.code_mode_only": false,
  "features.apply_patch_streaming_events": true,
};

export const CODEX_CODE_MODE_DISABLED_THREAD_CONFIG: JsonObject = {
  "features.code_mode": false,
  "features.code_mode_only": false,
};

const CODEX_LIGHTWEIGHT_CONTEXT_THREAD_CONFIG: JsonObject = {
  project_doc_max_bytes: 0,
};

const CODEX_TOOL_SEARCH_UNSUPPORTED_THREAD_CONFIG: JsonObject = {
  "features.multi_agent": false,
};

const CODEX_NATIVE_CODING_TEAM_AGENT_IDS = new Set(["coding", "execution-coding"]);

function isCodexNativeCodingTeamRun(
  params: Pick<EmbeddedRunAttemptParams, "agentId" | "sessionKey">,
): boolean {
  const agentId = params.agentId?.trim().toLowerCase();
  if (agentId) {
    return CODEX_NATIVE_CODING_TEAM_AGENT_IDS.has(agentId);
  }
  const sessionAgentId = /^agent:([^:]+)/u
    .exec(params.sessionKey ?? "")?.[1]
    ?.trim()
    .toLowerCase();
  return sessionAgentId ? CODEX_NATIVE_CODING_TEAM_AGENT_IDS.has(sessionAgentId) : false;
}

export type CodexThreadLifecycleTimingSpan = {
  name: string;
  durationMs: number;
  elapsedMs: number;
};

export type CodexThreadLifecycleTimingSummary = {
  totalMs: number;
  spans: CodexThreadLifecycleTimingSpan[];
};

export type CodexThreadLifecycleTimingLogger = {
  isEnabled?: (level: "trace") => boolean;
  trace: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

export type CodexThreadLifecycleTimingAction = "started" | "resumed" | "rotated";

export type CodexThreadLifecycleTimingOptions = {
  enabled?: boolean;
  now?: () => number;
  log?: CodexThreadLifecycleTimingLogger;
  totalThresholdMs?: number;
  stageThresholdMs?: number;
};

const CODEX_THREAD_LIFECYCLE_TIMING_WARN_TOTAL_MS = 1_000;
const CODEX_THREAD_LIFECYCLE_TIMING_WARN_STAGE_MS = 500;

export function shouldWarnCodexThreadLifecycleTimingSummary(
  summary: CodexThreadLifecycleTimingSummary,
  options: CodexThreadLifecycleTimingOptions = {},
): boolean {
  const totalThresholdMs = options.totalThresholdMs ?? CODEX_THREAD_LIFECYCLE_TIMING_WARN_TOTAL_MS;
  const stageThresholdMs = options.stageThresholdMs ?? CODEX_THREAD_LIFECYCLE_TIMING_WARN_STAGE_MS;
  return (
    summary.totalMs >= totalThresholdMs ||
    summary.spans.some((span) => span.durationMs >= stageThresholdMs)
  );
}

export function formatCodexThreadLifecycleTimingSummary(params: {
  runId: string;
  sessionId: string;
  sessionKey?: string;
  action: CodexThreadLifecycleTimingAction;
  summary: CodexThreadLifecycleTimingSummary;
}): string {
  const spans =
    params.summary.spans.length > 0
      ? params.summary.spans
          .map((span) => `${span.name}:${span.durationMs}ms@${span.elapsedMs}ms`)
          .join(",")
      : "none";
  return (
    `[trace:codex-app-server] thread lifecycle: runId=${params.runId} ` +
    `sessionId=${params.sessionId} sessionKey=${params.sessionKey ?? "unknown"} ` +
    `action=${params.action} totalMs=${params.summary.totalMs} stages=${spans}`
  );
}

function createCodexThreadLifecycleTimingTracker(options: CodexThreadLifecycleTimingOptions = {}): {
  measure: <T>(name: string, run: () => Promise<T> | T) => Promise<T>;
  measureSync: <T>(name: string, run: () => T) => T;
  mark: (name: string) => void;
  logSummary: (params: {
    runId: string;
    sessionId: string;
    sessionKey?: string;
    action: CodexThreadLifecycleTimingAction;
    threadId?: string;
  }) => void;
} {
  const log = options.log ?? embeddedAgentLog;
  if (!options.enabled && log.isEnabled?.("trace") !== true) {
    return {
      async measure(_name, run) {
        return await run();
      },
      measureSync(_name, run) {
        return run();
      },
      mark() {},
      logSummary() {},
    };
  }

  const now = options.now ?? Date.now;
  const startedAt = now();
  let didLog = false;
  const spans: CodexThreadLifecycleTimingSpan[] = [];
  const toMs = (value: number) => Math.max(0, Math.round(value));
  const record = (name: string, spanStartedAt: number) => {
    const currentAt = now();
    spans.push({
      name,
      durationMs: toMs(currentAt - spanStartedAt),
      elapsedMs: toMs(currentAt - startedAt),
    });
  };
  const snapshot = (): CodexThreadLifecycleTimingSummary => ({
    totalMs: toMs(now() - startedAt),
    spans: spans.slice(),
  });
  return {
    async measure(name, run) {
      const spanStartedAt = now();
      try {
        return await run();
      } finally {
        record(name, spanStartedAt);
      }
    },
    measureSync(name, run) {
      const spanStartedAt = now();
      try {
        return run();
      } finally {
        record(name, spanStartedAt);
      }
    },
    mark(name) {
      record(name, now());
    },
    logSummary(params) {
      if (didLog) {
        return;
      }
      const summary = snapshot();
      const shouldWarn = shouldWarnCodexThreadLifecycleTimingSummary(summary, options);
      if (!shouldWarn && !log.isEnabled?.("trace")) {
        return;
      }
      didLog = true;
      const message = formatCodexThreadLifecycleTimingSummary({
        runId: params.runId,
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        action: params.action,
        summary,
      });
      const meta = {
        runId: params.runId,
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        action: params.action,
        threadId: params.threadId,
        totalMs: summary.totalMs,
        spans: summary.spans,
      };
      if (shouldWarn) {
        log.warn(message, meta);
      } else {
        log.trace(message, meta);
      }
    },
  };
}

export async function startOrResumeThread(params: {
  client: CodexAppServerClient;
  params: EmbeddedRunAttemptParams;
  agentId?: string;
  cwd: string;
  dynamicTools: CodexDynamicToolSpec[];
  appServer: CodexAppServerRuntimeOptions;
  developerInstructions?: string;
  config?: JsonObject;
  finalConfigPatch?: JsonObject;
  buildFinalConfigPatch?: (
    decision: CodexThreadFinalConfigPatchDecision,
  ) => CodexThreadFinalConfigPatchResult;
  nativeHookRelayGeneration?: string;
  nativeCodeModeEnabled?: boolean;
  nativeCodeModeOnlyEnabled?: boolean;
  userMcpServersEnabled?: boolean;
  mcpServersFingerprint?: string;
  mcpServersFingerprintEvaluated?: boolean;
  environmentSelection?: CodexTurnEnvironmentParams[];
  systemContext?: CodexSystemThreadContext;
  pluginThreadConfig?: CodexPluginThreadConfigProvider;
  contextEngineProjection?: CodexContextEngineThreadBootstrapProjection;
  signal?: AbortSignal;
  timing?: CodexThreadLifecycleTimingOptions;
}): Promise<CodexAppServerThreadLifecycleBinding> {
  // Thread lifecycle spans are useful when profiling startup churn, but normal
  // turns should not pay Date.now/span-array overhead while resuming threads.
  const lifecycleTiming = createCodexThreadLifecycleTimingTracker({
    ...params.timing,
    enabled: params.timing?.enabled ?? isCodexAppServerProfilerEnabled(params.params.config),
  });
  const dynamicToolsFingerprint = lifecycleTiming.measureSync("dynamic-tools-fingerprint", () =>
    fingerprintDynamicTools(params.dynamicTools),
  );
  const dynamicToolsContainDeferred = params.dynamicTools.some(
    (tool) => tool.deferLoading === true,
  );
  const contextEngineBinding = lifecycleTiming.measureSync("context-engine-binding", () =>
    buildContextEngineBinding(params.params, params.contextEngineProjection),
  );
  const userMcpServersConfigPatch =
    params.systemContext || params.userMcpServersEnabled === false
      ? undefined
      : buildCodexUserMcpServersThreadConfigPatch(params.params.config, {
          agentId: params.agentId ?? params.params.agentId,
        });
  const userMcpServersFingerprint = fingerprintUserMcpServersConfigPatch(userMcpServersConfigPatch);
  const environmentSelection = params.systemContext?.environments ?? params.environmentSelection;
  const environmentSelectionFingerprint = fingerprintEnvironmentSelection(environmentSelection);
  let binding = await lifecycleTiming.measure("read-binding", () =>
    readCodexAppServerBinding(params.params.sessionFile, {
      authProfileStore: params.params.authProfileStore,
      agentDir: params.params.agentDir,
      config: params.params.config,
    }),
  );
  let startModelProvider: string | undefined;
  if (binding?.threadId) {
    const authProfileId = params.params.authProfileId ?? binding.authProfileId;
    startModelProvider =
      resolveCodexAppServerModelProvider({
        provider: params.params.provider,
        authProfileId,
        authProfileStore: params.params.authProfileStore,
        agentDir: params.params.agentDir,
        config: params.params.config,
      }) ??
      resolveCodexBindingModelProviderFallback({
        provider: params.params.provider,
        currentModel: params.params.modelId,
        bindingModel: binding.model,
        bindingModelProvider: binding.modelProvider,
      });
  }
  let preserveExistingBinding = false;
  let rotatedContextEngineBinding = false;
  let prebuiltPluginThreadConfig: CodexPluginThreadConfig | undefined;
  const throwIfAborted = () => {
    if (!params.signal?.aborted) {
      return;
    }
    const reason = params.signal.reason;
    if (reason instanceof Error) {
      throw reason;
    }
    const error = new Error(
      typeof reason === "string" && reason.length > 0
        ? reason
        : "codex app-server thread lifecycle aborted",
    );
    error.name = "AbortError";
    throw error;
  };
  if (
    binding?.threadId &&
    binding.systemAuthorityFingerprint !== params.systemContext?.fingerprint
  ) {
    embeddedAgentLog.debug(
      "codex app-server system authority changed; starting a generation-scoped thread",
      { threadId: binding.threadId },
    );
    await clearCodexAppServerBinding(params.params.sessionFile);
    binding = undefined;
  }
  if (binding?.threadId && params.nativeCodeModeEnabled === false) {
    embeddedAgentLog.debug(
      "codex app-server native tool surface disabled for turn; starting transient thread",
      {
        threadId: binding.threadId,
      },
    );
    preserveExistingBinding = true;
    binding = undefined;
  }
  if (binding?.threadId && (binding.contextEngine || contextEngineBinding)) {
    if (
      !contextEngineBinding ||
      !isContextEngineBindingCompatible(binding.contextEngine, contextEngineBinding)
    ) {
      embeddedAgentLog.debug(
        "codex app-server context-engine binding changed; starting a new thread",
        {
          threadId: binding.threadId,
          engineId: contextEngineBinding?.engineId,
          previousEngineId: binding.contextEngine?.engineId,
          epoch: contextEngineBinding?.projection?.epoch,
          previousEpoch: binding.contextEngine?.projection?.epoch,
          fingerprint: contextEngineBinding?.projection?.fingerprint,
          previousFingerprint: binding.contextEngine?.projection?.fingerprint,
          policyFingerprint: contextEngineBinding?.policyFingerprint,
          previousPolicyFingerprint: binding.contextEngine?.policyFingerprint,
        },
      );
      await clearCodexAppServerBinding(params.params.sessionFile);
      binding = undefined;
      rotatedContextEngineBinding = true;
    }
  }
  if (binding?.threadId && binding.userMcpServersFingerprint !== userMcpServersFingerprint) {
    embeddedAgentLog.debug("codex app-server user MCP config changed; starting a new thread", {
      threadId: binding.threadId,
    });
    await clearCodexAppServerBinding(params.params.sessionFile);
    binding = undefined;
  }
  if (
    binding?.threadId &&
    binding.environmentSelectionFingerprint !== environmentSelectionFingerprint
  ) {
    embeddedAgentLog.debug(
      "codex app-server environment selection changed; starting a new thread",
      {
        threadId: binding.threadId,
      },
    );
    await clearCodexAppServerBinding(params.params.sessionFile);
    binding = undefined;
  }
  if (
    binding?.threadId &&
    params.mcpServersFingerprintEvaluated === true &&
    binding.mcpServersFingerprint !== params.mcpServersFingerprint
  ) {
    embeddedAgentLog.debug("codex app-server MCP config changed; starting a new thread", {
      threadId: binding.threadId,
    });
    await clearCodexAppServerBinding(params.params.sessionFile);
    binding = undefined;
  }
  if (binding?.threadId) {
    let pluginBindingStale = isCodexPluginThreadBindingStale({
      codexPluginsEnabled: params.pluginThreadConfig?.enabled ?? false,
      bindingFingerprint: binding.pluginAppsFingerprint,
      bindingInputFingerprint: binding.pluginAppsInputFingerprint,
      currentInputFingerprint: params.pluginThreadConfig?.inputFingerprint,
      hasBindingPolicyContext: Boolean(binding.pluginAppPolicyContext),
    });
    if (
      !pluginBindingStale &&
      shouldRecheckRecoverablePluginBinding({
        binding,
        pluginThreadConfig: params.pluginThreadConfig,
      })
    ) {
      try {
        prebuiltPluginThreadConfig = await lifecycleTiming.measure("plugin-config-recovery", () =>
          params.pluginThreadConfig?.build(),
        );
        pluginBindingStale =
          prebuiltPluginThreadConfig?.fingerprint !== binding.pluginAppsFingerprint;
      } catch (error) {
        embeddedAgentLog.warn("codex app-server plugin app config recovery check failed", {
          error,
          threadId: binding.threadId,
        });
      }
    }
    if (pluginBindingStale) {
      embeddedAgentLog.debug("codex app-server plugin app config changed; starting a new thread", {
        threadId: binding.threadId,
      });
      await clearCodexAppServerBinding(params.params.sessionFile);
      binding = undefined;
    }
  }
  if (
    binding?.threadId &&
    params.mcpServersFingerprintEvaluated === true &&
    binding.mcpServersFingerprint !== params.mcpServersFingerprint
  ) {
    embeddedAgentLog.debug("codex app-server MCP config changed; starting a new thread", {
      threadId: binding.threadId,
    });
    await clearCodexAppServerBinding(params.params.sessionFile);
    binding = undefined;
  }
  if (binding?.threadId) {
    if (
      binding.dynamicToolsFingerprint &&
      params.dynamicTools.length > 0 &&
      binding.dynamicToolsContainDeferred !== dynamicToolsContainDeferred &&
      (binding.dynamicToolsContainDeferred !== undefined || !dynamicToolsContainDeferred)
    ) {
      embeddedAgentLog.debug(
        "codex app-server dynamic tool loading changed; starting a new thread",
        {
          threadId: binding.threadId,
        },
      );
      await clearCodexAppServerBinding(params.params.sessionFile);
      binding = undefined;
    }
  }
  if (binding?.threadId) {
    // `/codex resume <thread>` writes a binding before the next turn can know
    // the dynamic tool catalog, so only invalidate fingerprints we actually have.
    if (
      binding.dynamicToolsFingerprint &&
      !areDynamicToolFingerprintsCompatible(
        binding.dynamicToolsFingerprint,
        dynamicToolsFingerprint,
      )
    ) {
      preserveExistingBinding = shouldStartTransientNoToolThread({
        previous: binding.dynamicToolsFingerprint,
        next: dynamicToolsFingerprint,
      });
      if (preserveExistingBinding) {
        embeddedAgentLog.debug(
          "codex app-server dynamic tools unavailable for turn; starting transient thread",
          {
            threadId: binding.threadId,
          },
        );
      } else {
        embeddedAgentLog.debug(
          "codex app-server dynamic tool catalog changed; starting a new thread",
          {
            threadId: binding.threadId,
          },
        );
        await clearCodexAppServerBinding(params.params.sessionFile);
      }
    } else {
      try {
        const authProfileId = params.params.authProfileId ?? binding.authProfileId;
        const finalConfigPatch: CodexThreadFinalConfigPatchResult = params.systemContext
          ? {}
          : (params.buildFinalConfigPatch?.({
              action: "resume",
              binding,
            }) ?? {
              configPatch: params.finalConfigPatch,
              nativeHookRelayGeneration: params.nativeHookRelayGeneration,
            });
        const resumeConfig = params.systemContext
          ? params.systemContext.authority.config
          : mergeCodexThreadConfigs(
              params.config,
              userMcpServersConfigPatch,
              finalConfigPatch.configPatch,
            );
        const resumeMcpServerNames = readThreadConfigMcpServerNames(resumeConfig);
        const resumeParams = lifecycleTiming.measureSync("thread-resume-params", () =>
          buildThreadResumeParams(params.params, {
            threadId: binding.threadId,
            authProfileId,
            modelProvider: startModelProvider,
            appServer: params.appServer,
            dynamicTools: params.dynamicTools,
            developerInstructions: params.developerInstructions,
            config: resumeConfig,
            nativeCodeModeEnabled: params.nativeCodeModeEnabled,
            nativeCodeModeOnlyEnabled: params.nativeCodeModeOnlyEnabled,
            systemContext: params.systemContext,
          }),
        );
        const requestModelProvider =
          typeof resumeParams.modelProvider === "string" && resumeParams.modelProvider.trim()
            ? resumeParams.modelProvider
            : undefined;
        const response = assertCodexThreadResumeResponse(
          await lifecycleTiming.measure("thread-resume-request", () =>
            params.client.request("thread/resume", resumeParams, { signal: params.signal }),
          ),
        );
        if (params.systemContext) {
          assertCodexSystemThreadResponse({
            response,
            context: params.systemContext,
            cwd: params.cwd,
            action: "resume",
          });
        }
        throwIfAborted();
        const boundAuthProfileId = authProfileId;
        const nextMcpServersFingerprint =
          params.mcpServersFingerprintEvaluated === true
            ? params.mcpServersFingerprint
            : binding.mcpServersFingerprint;
        await lifecycleTiming.measure("thread-resume-write-binding", () =>
          writeCodexAppServerBinding(
            params.params.sessionFile,
            {
              threadId: response.thread.id,
              cwd: params.cwd,
              authProfileId: boundAuthProfileId,
              model: response.model ?? resumeParams.model ?? params.params.modelId,
              modelProvider: response.modelProvider ?? requestModelProvider ?? startModelProvider,
              dynamicToolsFingerprint,
              dynamicToolsContainDeferred,
              userMcpServersFingerprint,
              mcpServerNames: resumeMcpServerNames,
              mcpServersFingerprint: nextMcpServersFingerprint,
              nativeHookRelayGeneration:
                finalConfigPatch.nativeHookRelayGeneration ?? binding.nativeHookRelayGeneration,
              pluginAppsFingerprint: binding.pluginAppsFingerprint,
              pluginAppsInputFingerprint: binding.pluginAppsInputFingerprint,
              pluginAppPolicyContext: binding.pluginAppPolicyContext,
              contextEngine: contextEngineBinding,
              environmentSelectionFingerprint,
              systemAuthorityFingerprint: params.systemContext?.fingerprint,
              createdAt: binding.createdAt,
            },
            {
              authProfileStore: params.params.authProfileStore,
              agentDir: params.params.agentDir,
              config: params.params.config,
            },
          ),
        );
        if (contextEngineBinding) {
          embeddedAgentLog.info("codex app-server wrote context-engine thread binding", {
            sessionId: params.params.sessionId,
            sessionKey: params.params.sessionKey,
            threadId: response.thread.id,
            engineId: contextEngineBinding.engineId,
            epoch: contextEngineBinding.projection?.epoch,
            fingerprint: contextEngineBinding.projection?.fingerprint,
            action: "resumed",
          });
        }
        lifecycleTiming.mark("thread-ready");
        lifecycleTiming.logSummary({
          runId: params.params.runId,
          sessionId: params.params.sessionId,
          sessionKey: params.params.sessionKey,
          threadId: response.thread.id,
          action: "resumed",
        });
        const activeTurnIds = readActiveCodexTurnIds(response.thread);
        return {
          ...binding,
          threadId: response.thread.id,
          cwd: params.cwd,
          authProfileId: boundAuthProfileId,
          model: response.model ?? resumeParams.model ?? params.params.modelId,
          modelProvider: response.modelProvider ?? requestModelProvider ?? startModelProvider,
          dynamicToolsFingerprint,
          dynamicToolsContainDeferred,
          userMcpServersFingerprint,
          mcpServerNames: resumeMcpServerNames,
          mcpServersFingerprint: nextMcpServersFingerprint,
          nativeHookRelayGeneration:
            finalConfigPatch.nativeHookRelayGeneration ?? binding.nativeHookRelayGeneration,
          pluginAppsFingerprint: binding.pluginAppsFingerprint,
          pluginAppsInputFingerprint: binding.pluginAppsInputFingerprint,
          pluginAppPolicyContext: binding.pluginAppPolicyContext,
          contextEngine: contextEngineBinding,
          environmentSelectionFingerprint,
          systemAuthorityFingerprint: params.systemContext?.fingerprint,
          lifecycle: {
            action: "resumed",
            ...(activeTurnIds.length ? { activeTurnIds } : {}),
          },
        };
      } catch (error) {
        if (isCodexAppServerConnectionClosedError(error)) {
          throw error;
        }
        embeddedAgentLog.warn("codex app-server thread resume failed; starting a new thread", {
          error,
        });
        await clearCodexAppServerBinding(params.params.sessionFile);
      }
    }
  }

  const pluginThreadConfig =
    !params.systemContext && params.pluginThreadConfig?.enabled
      ? (prebuiltPluginThreadConfig ??
        (await lifecycleTiming.measure("plugin-config-build", () =>
          params.pluginThreadConfig?.build(),
        )))
      : undefined;
  const finalConfigPatch: CodexThreadFinalConfigPatchResult = params.systemContext
    ? {}
    : (params.buildFinalConfigPatch?.({ action: "start" }) ?? {
        configPatch: params.finalConfigPatch,
        nativeHookRelayGeneration: params.nativeHookRelayGeneration,
      });
  const config = params.systemContext
    ? params.systemContext.authority.config
    : lifecycleTiming.measureSync("merge-thread-config", () =>
        mergeCodexThreadConfigs(
          params.config,
          userMcpServersConfigPatch,
          pluginThreadConfig?.configPatch,
          finalConfigPatch.configPatch,
        ),
      );
  const mcpServerNames = readThreadConfigMcpServerNames(config);
  const startParams = lifecycleTiming.measureSync("thread-start-params", () =>
    buildThreadStartParams(params.params, {
      cwd: params.cwd,
      dynamicTools: params.dynamicTools,
      appServer: params.appServer,
      developerInstructions: params.developerInstructions,
      config,
      nativeCodeModeEnabled: params.nativeCodeModeEnabled,
      nativeCodeModeOnlyEnabled: params.nativeCodeModeOnlyEnabled,
      environmentSelection,
      modelProvider: startModelProvider,
      systemContext: params.systemContext,
    }),
  );
  const requestModelProvider =
    typeof startParams.modelProvider === "string" && startParams.modelProvider.trim()
      ? startParams.modelProvider
      : undefined;
  const threadStartResponse = await lifecycleTiming.measure("thread-start-request", async () => {
    try {
      return await params.client.request("thread/start", startParams, { signal: params.signal });
    } catch (error) {
      if (error instanceof CodexAppServerRpcError) {
        throw new CodexThreadStartRequestError(error);
      }
      throw error;
    }
  });
  const response = assertCodexThreadStartResponse(threadStartResponse);
  if (params.systemContext) {
    assertCodexSystemThreadResponse({
      response,
      context: params.systemContext,
      cwd: params.cwd,
      action: "start",
    });
  }
  throwIfAborted();
  const modelProvider = resolveCodexAppServerModelProvider({
    provider: params.params.provider,
    authProfileId: params.params.authProfileId,
    authProfileStore: params.params.authProfileStore,
    agentDir: params.params.agentDir,
    config: params.params.config,
  });
  const createdAt = new Date().toISOString();
  const nextMcpServersFingerprint =
    params.mcpServersFingerprintEvaluated === true ? params.mcpServersFingerprint : undefined;
  if (!preserveExistingBinding) {
    await lifecycleTiming.measure("thread-start-write-binding", () =>
      writeCodexAppServerBinding(
        params.params.sessionFile,
        {
          threadId: response.thread.id,
          cwd: params.cwd,
          authProfileId: params.params.authProfileId,
          model: response.model ?? startParams.model ?? params.params.modelId,
          modelProvider:
            response.modelProvider ?? requestModelProvider ?? startModelProvider ?? modelProvider,
          dynamicToolsFingerprint,
          dynamicToolsContainDeferred,
          userMcpServersFingerprint,
          mcpServerNames,
          mcpServersFingerprint: nextMcpServersFingerprint,
          nativeHookRelayGeneration: finalConfigPatch.nativeHookRelayGeneration,
          pluginAppsFingerprint: pluginThreadConfig?.fingerprint,
          pluginAppsInputFingerprint: pluginThreadConfig?.inputFingerprint,
          pluginAppPolicyContext: pluginThreadConfig?.policyContext,
          contextEngine: contextEngineBinding,
          environmentSelectionFingerprint,
          systemAuthorityFingerprint: params.systemContext?.fingerprint,
          createdAt,
        },
        {
          authProfileStore: params.params.authProfileStore,
          agentDir: params.params.agentDir,
          config: params.params.config,
        },
      ),
    );
    if (contextEngineBinding) {
      embeddedAgentLog.info("codex app-server wrote context-engine thread binding", {
        sessionId: params.params.sessionId,
        sessionKey: params.params.sessionKey,
        threadId: response.thread.id,
        engineId: contextEngineBinding.engineId,
        epoch: contextEngineBinding.projection?.epoch,
        fingerprint: contextEngineBinding.projection?.fingerprint,
        action: rotatedContextEngineBinding ? "rotated" : "started",
      });
    }
  }
  lifecycleTiming.mark("thread-ready");
  lifecycleTiming.logSummary({
    runId: params.params.runId,
    sessionId: params.params.sessionId,
    sessionKey: params.params.sessionKey,
    threadId: response.thread.id,
    action: rotatedContextEngineBinding ? "rotated" : "started",
  });
  return {
    schemaVersion: 1,
    threadId: response.thread.id,
    sessionFile: params.params.sessionFile,
    cwd: params.cwd,
    authProfileId: params.params.authProfileId,
    model: response.model ?? startParams.model ?? params.params.modelId,
    modelProvider:
      response.modelProvider ?? requestModelProvider ?? startModelProvider ?? modelProvider,
    dynamicToolsFingerprint,
    dynamicToolsContainDeferred,
    userMcpServersFingerprint,
    mcpServerNames,
    mcpServersFingerprint: nextMcpServersFingerprint,
    nativeHookRelayGeneration: finalConfigPatch.nativeHookRelayGeneration,
    pluginAppsFingerprint: pluginThreadConfig?.fingerprint,
    pluginAppsInputFingerprint: pluginThreadConfig?.inputFingerprint,
    pluginAppPolicyContext: pluginThreadConfig?.policyContext,
    contextEngine: contextEngineBinding,
    environmentSelectionFingerprint,
    systemAuthorityFingerprint: params.systemContext?.fingerprint,
    createdAt,
    updatedAt: createdAt,
    lifecycle: {
      action: "started",
      ...(rotatedContextEngineBinding ? { rotatedContextEngineBinding } : {}),
    },
  };
}

function readThreadConfigMcpServerNames(config: JsonObject | undefined): string[] | undefined {
  const rawServers = isJsonObject(config?.mcp_servers)
    ? config.mcp_servers
    : isJsonObject(config?.mcpServers)
      ? config.mcpServers
      : undefined;
  if (!rawServers) {
    return undefined;
  }
  const names = Object.keys(rawServers)
    .filter((name) => name.trim().length > 0)
    .toSorted((a, b) => a.localeCompare(b));
  return names.length > 0 ? names : undefined;
}

export function buildContextEngineBinding(
  params: EmbeddedRunAttemptParams,
  projection?: CodexContextEngineThreadBootstrapProjection,
): CodexAppServerContextEngineBinding | undefined {
  const contextEngine = isActiveHarnessContextEngine(params.contextEngine)
    ? params.contextEngine
    : undefined;
  const engineId = contextEngine?.info?.id?.trim();
  if (!contextEngine || !engineId) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    engineId,
    policyFingerprint: JSON.stringify({
      schemaVersion: 1,
      engineId,
      engineVersion: contextEngine.info.version,
      ownsCompaction: contextEngine.info.ownsCompaction === true,
      turnMaintenanceMode: contextEngine.info.turnMaintenanceMode,
      citationsMode: resolveContextEngineCitationsMode(params.config),
      contextTokenBudget: params.contextTokenBudget,
      projectionMaxChars: resolveCodexContextEngineProjectionMaxChars({
        contextTokenBudget: params.contextTokenBudget,
        reserveTokens: resolveCodexContextEngineProjectionReserveTokens({
          config: params.config,
        }),
      }),
    }),
    projection: projection ? buildContextEngineProjectionBinding(projection) : undefined,
  };
}

function buildContextEngineProjectionBinding(
  projection: CodexContextEngineThreadBootstrapProjection,
): CodexAppServerContextEngineProjectionBinding {
  return {
    schemaVersion: 1,
    mode: "thread_bootstrap",
    epoch: projection.epoch,
    fingerprint: projection.fingerprint,
  };
}

export function isContextEngineBindingCompatible(
  previous: CodexAppServerContextEngineBinding | undefined,
  next: CodexAppServerContextEngineBinding,
): boolean {
  return (
    previous?.schemaVersion === next.schemaVersion &&
    previous.engineId === next.engineId &&
    previous.policyFingerprint === next.policyFingerprint &&
    areContextEngineProjectionBindingsCompatible(previous.projection, next.projection)
  );
}

function areContextEngineProjectionBindingsCompatible(
  previous: CodexAppServerContextEngineProjectionBinding | undefined,
  next: CodexAppServerContextEngineProjectionBinding | undefined,
): boolean {
  if (!next) {
    return previous === undefined;
  }
  return (
    previous?.schemaVersion === next.schemaVersion &&
    previous.mode === next.mode &&
    previous.epoch === next.epoch &&
    previous.fingerprint === next.fingerprint
  );
}

function resolveContextEngineCitationsMode(config: unknown): JsonValue | undefined {
  const rootConfig = isUnknownRecord(config) ? config : undefined;
  const memoryConfig = isUnknownRecord(rootConfig?.memory) ? rootConfig.memory : undefined;
  const citations = memoryConfig?.citations;
  return isJsonConfigValue(citations) ? citations : undefined;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isJsonConfigValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonConfigValue);
  }
  return isUnknownRecord(value) && Object.values(value).every(isJsonConfigValue);
}

function shouldRecheckRecoverablePluginBinding(params: {
  binding: CodexAppServerThreadBinding;
  pluginThreadConfig?: CodexPluginThreadConfigProvider;
}): boolean {
  if (!params.pluginThreadConfig?.enabled) {
    return false;
  }
  if (
    !params.binding.pluginAppsFingerprint ||
    !params.binding.pluginAppsInputFingerprint ||
    params.binding.pluginAppsInputFingerprint !== params.pluginThreadConfig.inputFingerprint
  ) {
    return false;
  }
  const policyContext = params.binding.pluginAppPolicyContext;
  if (!policyContext) {
    return false;
  }
  const expectedPluginConfigKeys = params.pluginThreadConfig.enabledPluginConfigKeys ?? [];
  return Object.keys(policyContext.apps).length === 0 || expectedPluginConfigKeys.length > 0;
}

export function buildThreadStartParams(
  params: EmbeddedRunAttemptParams,
  options: {
    cwd: string;
    dynamicTools: CodexDynamicToolSpec[];
    appServer: CodexAppServerRuntimeOptions;
    developerInstructions?: string;
    config?: JsonObject;
    nativeCodeModeEnabled?: boolean;
    nativeCodeModeOnlyEnabled?: boolean;
    environmentSelection?: CodexTurnEnvironmentParams[];
    modelProvider?: string | null;
    systemContext?: CodexSystemThreadContext;
  },
): CodexThreadStartParams {
  const resolvedModelProvider = resolveCodexAppServerModelProvider({
    provider: params.provider,
    authProfileId: params.authProfileId,
    authProfileStore: params.authProfileStore,
    agentDir: params.agentDir,
    config: params.config,
  });
  const modelSelection = resolveCodexAppServerRequestModelSelection({
    model: params.modelId,
    modelProvider: options.modelProvider ?? resolvedModelProvider,
    authProfileId: params.authProfileId,
    authProfileStore: params.authProfileStore,
    agentDir: params.agentDir,
    config: params.config,
  });
  if (options.systemContext) {
    assertCodexSystemV2Model(options.systemContext, modelSelection.model);
    return {
      model: modelSelection.model,
      ...(modelSelection.modelProvider ? { modelProvider: modelSelection.modelProvider } : {}),
      cwd: options.cwd,
      runtimeWorkspaceRoots: [options.cwd],
      approvalPolicy: options.appServer.approvalPolicy,
      approvalsReviewer: options.appServer.approvalsReviewer,
      permissions: options.systemContext.authority.permissionProfile,
      ...(options.appServer.serviceTier ? { serviceTier: options.appServer.serviceTier } : {}),
      personality: CODEX_NATIVE_PERSONALITY_NONE,
      serviceName: "OpenClaw",
      config: options.systemContext.authority.config,
      environments: options.systemContext.environments,
      selectedCapabilityRoots: options.systemContext.authority.selectedCapabilityRoots,
      dynamicTools: options.dynamicTools,
      experimentalRawEvents: true,
    };
  }
  const runtimeConfig = buildCodexRuntimeThreadConfigForRun(params, options.config, {
    nativeCodeModeEnabled: options.nativeCodeModeEnabled,
    nativeCodeModeOnlyEnabled: options.nativeCodeModeOnlyEnabled,
  });
  const useProjectDeveloperInstructions = isCodexNativeCodingTeamRun(params);
  return {
    model: modelSelection.model,
    ...(modelSelection.modelProvider ? { modelProvider: modelSelection.modelProvider } : {}),
    cwd: options.cwd,
    approvalPolicy: options.appServer.approvalPolicy,
    approvalsReviewer: options.appServer.approvalsReviewer,
    sandbox: options.appServer.sandbox,
    ...(options.appServer.serviceTier ? { serviceTier: options.appServer.serviceTier } : {}),
    personality: CODEX_NATIVE_PERSONALITY_NONE,
    serviceName: "OpenClaw",
    config: runtimeConfig,
    ...resolveCodexThreadEnvironmentSelection(options),
    ...(!useProjectDeveloperInstructions
      ? {
          developerInstructions:
            options.developerInstructions ??
            buildDeveloperInstructions(params, {
              dynamicTools: options.dynamicTools,
              launchEvidence: {
                cwd: options.cwd,
                runtimeConfig,
                nativeCodeModeEnabled: options.nativeCodeModeEnabled,
                nativeCodeModeOnlyEnabled: options.nativeCodeModeOnlyEnabled,
              },
            }),
        }
      : {}),
    dynamicTools: options.dynamicTools,
    experimentalRawEvents: true,
    persistExtendedHistory: true,
  };
}

export function buildThreadResumeParams(
  params: EmbeddedRunAttemptParams,
  options: {
    threadId: string;
    authProfileId?: string;
    modelProvider?: string | null;
    appServer: CodexAppServerRuntimeOptions;
    dynamicTools?: CodexDynamicToolSpec[];
    developerInstructions?: string;
    config?: JsonObject;
    nativeCodeModeEnabled?: boolean;
    nativeCodeModeOnlyEnabled?: boolean;
    systemContext?: CodexSystemThreadContext;
  },
): CodexThreadResumeParams {
  const resolvedModelProvider = resolveCodexAppServerModelProvider({
    provider: params.provider,
    authProfileId: options.authProfileId ?? params.authProfileId,
    authProfileStore: params.authProfileStore,
    agentDir: params.agentDir,
    config: params.config,
  });
  const modelSelection = resolveCodexAppServerRequestModelSelection({
    model: params.modelId,
    modelProvider: options.modelProvider ?? resolvedModelProvider,
    authProfileId: options.authProfileId ?? params.authProfileId,
    authProfileStore: params.authProfileStore,
    agentDir: params.agentDir,
    config: params.config,
  });
  if (options.systemContext) {
    assertCodexSystemV2Model(options.systemContext, modelSelection.model);
    return {
      threadId: options.threadId,
      model: modelSelection.model,
      ...(modelSelection.modelProvider ? { modelProvider: modelSelection.modelProvider } : {}),
      personality: CODEX_NATIVE_PERSONALITY_NONE,
      ...(options.appServer.serviceTier ? { serviceTier: options.appServer.serviceTier } : {}),
    };
  }
  const runtimeConfig = buildCodexRuntimeThreadConfigForRun(params, options.config, {
    nativeCodeModeEnabled: options.nativeCodeModeEnabled,
    nativeCodeModeOnlyEnabled: options.nativeCodeModeOnlyEnabled,
  });
  const useProjectDeveloperInstructions = isCodexNativeCodingTeamRun(params);
  return {
    threadId: options.threadId,
    model: modelSelection.model,
    ...(modelSelection.modelProvider ? { modelProvider: modelSelection.modelProvider } : {}),
    approvalPolicy: options.appServer.approvalPolicy,
    approvalsReviewer: options.appServer.approvalsReviewer,
    sandbox: options.appServer.sandbox,
    ...(options.appServer.serviceTier ? { serviceTier: options.appServer.serviceTier } : {}),
    personality: CODEX_NATIVE_PERSONALITY_NONE,
    config: runtimeConfig,
    ...(!useProjectDeveloperInstructions
      ? {
          developerInstructions:
            options.developerInstructions ??
            buildDeveloperInstructions(params, {
              dynamicTools: options.dynamicTools,
              launchEvidence: {
                runtimeConfig,
                nativeCodeModeEnabled: options.nativeCodeModeEnabled,
                nativeCodeModeOnlyEnabled: options.nativeCodeModeOnlyEnabled,
              },
            }),
        }
      : {}),
    persistExtendedHistory: true,
  };
}

export function resolveCodexBindingModelProviderFallback(params: {
  provider?: string;
  currentModel: string | undefined;
  bindingModel: string | undefined;
  bindingModelProvider: string | undefined;
}): string | undefined {
  const provider = params.provider?.trim().toLowerCase();
  if (provider && provider !== "codex") {
    return undefined;
  }
  const currentModel = params.currentModel?.trim();
  const bindingModel = params.bindingModel?.trim();
  if (
    currentModel &&
    bindingModel &&
    currentModel === bindingModel &&
    params.bindingModelProvider
  ) {
    return params.bindingModelProvider;
  }
  return hasProviderQualifiedModelRef(currentModel) ? undefined : params.bindingModelProvider;
}

export function resolveCodexAppServerRequestModelSelection(params: {
  model: string;
  modelProvider?: string | null;
  authProfileId?: string;
  authProfileStore?: CodexAppServerAuthProfileLookup["authProfileStore"];
  agentDir?: string;
  config?: CodexAppServerAuthProfileLookup["config"];
}): { model: string; modelProvider?: string } {
  const model = params.model.trim();
  const modelProvider = params.modelProvider?.trim();
  if (modelProvider) {
    return { model, modelProvider };
  }
  // Codex app-server expects provider-qualified refs as separate fields. Keep
  // explicit providers intact so provider-owned slashy model ids are not split.
  const slashIndex = model.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= model.length - 1) {
    return { model };
  }
  const inferredProvider = model.slice(0, slashIndex);
  const inferredModelProvider = resolveCodexAppServerModelProvider({
    provider: inferredProvider,
    authProfileId: params.authProfileId,
    authProfileStore: params.authProfileStore,
    agentDir: params.agentDir,
    config: params.config,
  });
  return {
    model: model.slice(slashIndex + 1).trim(),
    ...(inferredModelProvider ? { modelProvider: inferredModelProvider } : {}),
  };
}

function hasProviderQualifiedModelRef(model: string | undefined): boolean {
  const trimmed = model?.trim();
  const slashIndex = trimmed?.indexOf("/") ?? -1;
  return slashIndex > 0 && slashIndex < (trimmed?.length ?? 0) - 1;
}

export function buildCodexRuntimeThreadConfig(
  config: JsonObject | undefined,
  options: {
    nativeCodeModeEnabled?: boolean;
    nativeCodeModeOnlyEnabled?: boolean;
  } = {},
): JsonObject {
  const codeModeConfig: JsonObject = {
    ...CODEX_CODE_MODE_THREAD_CONFIG,
    "features.code_mode_only": options.nativeCodeModeOnlyEnabled === true,
  };
  if (options.nativeCodeModeEnabled === false) {
    const disabledConfig = mergeCodexThreadConfigs(
      config,
      CODEX_CODE_MODE_DISABLED_THREAD_CONFIG,
    ) ?? {
      ...CODEX_CODE_MODE_DISABLED_THREAD_CONFIG,
    };
    // Native patch streaming is part of native code mode, so do not send it
    // when runtime policy disables that tool surface.
    delete disabledConfig["features.apply_patch_streaming_events"];
    return disabledConfig;
  }
  if (options.nativeCodeModeOnlyEnabled === true) {
    return (
      mergeCodexThreadConfigs(codeModeConfig, config, {
        "features.code_mode_only": true,
      }) ?? {
        ...codeModeConfig,
        "features.code_mode_only": true,
      }
    );
  }
  return (
    mergeCodexThreadConfigs(codeModeConfig, config) ?? {
      ...codeModeConfig,
    }
  );
}

function buildCodexRuntimeThreadConfigForRun(
  params: EmbeddedRunAttemptParams,
  config: JsonObject | undefined,
  options: {
    nativeCodeModeEnabled?: boolean;
    nativeCodeModeOnlyEnabled?: boolean;
  } = {},
): JsonObject {
  const baseConfig = buildCodexRuntimeThreadConfig(config, options);
  const runtimeConfig =
    mergeCodexThreadConfigs(
      baseConfig,
      shouldDisableCodexToolSearchForModel(params.modelId)
        ? CODEX_TOOL_SEARCH_UNSUPPORTED_THREAD_CONFIG
        : undefined,
    ) ?? baseConfig;
  if (params.bootstrapContextMode !== "lightweight") {
    return runtimeConfig;
  }
  return (
    mergeCodexThreadConfigs(runtimeConfig, CODEX_LIGHTWEIGHT_CONTEXT_THREAD_CONFIG) ?? {
      ...runtimeConfig,
      ...CODEX_LIGHTWEIGHT_CONTEXT_THREAD_CONFIG,
    }
  );
}

export function buildTurnStartParams(
  params: EmbeddedRunAttemptParams,
  options: {
    threadId: string;
    cwd: string;
    appServer: CodexAppServerRuntimeOptions;
    promptText?: string;
    sandboxPolicy?: CodexSandboxPolicy;
    environmentSelection?: CodexTurnEnvironmentParams[];
    model?: string | null;
    modelProvider?: string | null;
    turnScopedDeveloperInstructions?: string;
    skillsCollaborationInstructions?: string;
    memoryCollaborationInstructions?: string;
    heartbeatCollaborationInstructions?: string;
    systemContext?: CodexSystemThreadContext;
  },
): CodexTurnStartParams {
  const modelSelection = resolveCodexAppServerRequestModelSelection({
    model: options.model ?? params.modelId,
    modelProvider: options.modelProvider,
    authProfileId: params.authProfileId,
    authProfileStore: params.authProfileStore,
    agentDir: params.agentDir,
    config: params.config,
  });
  if (options.systemContext) {
    assertCodexSystemV2Model(options.systemContext, modelSelection.model);
  }
  return {
    threadId: options.threadId,
    input: buildUserInput(params, options.promptText),
    cwd: options.cwd,
    ...(options.systemContext ? { runtimeWorkspaceRoots: [options.cwd] } : {}),
    approvalPolicy: options.appServer.approvalPolicy,
    approvalsReviewer: options.appServer.approvalsReviewer,
    ...(options.systemContext
      ? { permissions: options.systemContext.authority.permissionProfile }
      : {
          sandboxPolicy:
            options.sandboxPolicy ??
            codexSandboxPolicyForTurn(options.appServer.sandbox, options.cwd),
        }),
    model: modelSelection.model,
    personality: CODEX_NATIVE_PERSONALITY_NONE,
    ...(options.appServer.serviceTier ? { serviceTier: options.appServer.serviceTier } : {}),
    effort: resolveReasoningEffort(params.thinkLevel, modelSelection.model),
    ...(options.systemContext
      ? { environments: options.systemContext.environments }
      : options.environmentSelection
        ? { environments: options.environmentSelection }
        : {}),
    collaborationMode: options.systemContext
      ? {
          mode: "default",
          settings: {
            model: modelSelection.model,
            reasoning_effort: resolveReasoningEffort(params.thinkLevel, modelSelection.model),
            developer_instructions: null,
          },
        }
      : buildTurnCollaborationMode(params, {
          model: modelSelection.model,
          turnScopedDeveloperInstructions: options.turnScopedDeveloperInstructions,
          skillsCollaborationInstructions: options.skillsCollaborationInstructions,
          memoryCollaborationInstructions: options.memoryCollaborationInstructions,
          heartbeatCollaborationInstructions: options.heartbeatCollaborationInstructions,
        }),
  };
}

function resolveCodexThreadEnvironmentSelection(options: {
  nativeCodeModeEnabled?: boolean;
  environmentSelection?: CodexTurnEnvironmentParams[];
}): Pick<CodexThreadStartParams, "environments"> {
  if (options.nativeCodeModeEnabled === false) {
    return { environments: [] };
  }
  if (options.environmentSelection) {
    return { environments: options.environmentSelection };
  }
  return {};
}

type CodexTurnCollaborationMode = NonNullable<CodexTurnStartParams["collaborationMode"]>;

export function buildTurnCollaborationMode(
  params: EmbeddedRunAttemptParams,
  options: {
    model?: string;
    turnScopedDeveloperInstructions?: string;
    skillsCollaborationInstructions?: string;
    memoryCollaborationInstructions?: string;
    heartbeatCollaborationInstructions?: string;
  } = {},
): CodexTurnCollaborationMode {
  const model = options.model ?? params.modelId;
  return {
    mode: "default",
    settings: {
      model,
      reasoning_effort: resolveReasoningEffort(params.thinkLevel, model),
      developer_instructions: buildTurnScopedCollaborationInstructions(params, options),
    },
  };
}

function buildTurnScopedCollaborationInstructions(
  params: EmbeddedRunAttemptParams,
  options: {
    turnScopedDeveloperInstructions?: string;
    skillsCollaborationInstructions?: string;
    memoryCollaborationInstructions?: string;
    heartbeatCollaborationInstructions?: string;
  } = {},
): string | null {
  const contextInstructions = joinPresentSections(
    options.turnScopedDeveloperInstructions,
    options.memoryCollaborationInstructions,
    options.skillsCollaborationInstructions,
  );
  if (params.trigger === "cron") {
    return joinPresentSections(buildCronCollaborationInstructions(), contextInstructions);
  }
  if (params.trigger === "heartbeat") {
    return joinPresentSections(
      buildHeartbeatCollaborationInstructions(),
      contextInstructions,
      options.heartbeatCollaborationInstructions,
    );
  }
  if (contextInstructions?.trim()) {
    return joinPresentSections(buildDefaultCollaborationInstructions(), contextInstructions);
  }
  return null;
}

function buildDefaultCollaborationInstructions(): string {
  // Codex only applies the built-in Default-mode preset when `developer_instructions`
  // is null. OpenClaw adds per-turn workspace instructions here, so preserve that
  // pinned Codex default behavior before appending the workspace overlay.
  return [
    "# Collaboration Mode: Default",
    "",
    "You are now in Default mode. Any previous instructions for other modes (e.g. Plan mode) are no longer active.",
    "",
    "Your active mode changes only when new developer instructions with a different `<collaboration_mode>...</collaboration_mode>` change it; user requests or tool descriptions do not change mode by themselves. Known mode names are Default and Plan.",
    "",
    "## request_user_input availability",
    "",
    "Use the `request_user_input` tool only when it is listed in the available tools for this turn.",
    "",
    "In Default mode, strongly prefer making reasonable assumptions and executing the user's request rather than stopping to ask questions. If you absolutely must ask a question because the answer cannot be discovered from local context and a reasonable assumption would be risky, ask the user directly with a concise plain-text question. Never write a multiple choice question as a textual assistant message.",
  ].join("\n");
}

function buildCronCollaborationInstructions(): string {
  return [
    "This is an OpenClaw cron automation turn. Apply these instructions only to this scheduled job; ordinary chat turns should stay in Codex Default mode.",
    "Execute the cron payload directly. If it asks you to run an exact command, run that command before doing any investigation, planning, memory review, or workspace bootstrap.",
    "Use context already provided by the runtime, but do not spend time loading or re-reading workspace bootstrap, memory, or project-doc files before executing the cron payload. Inspect those files only if the payload asks for them or the command fails and they are needed to diagnose it.",
    "Keep output concise and automation-oriented. Prefer the final command result or a short failure summary over status narration.",
  ].join("\n\n");
}

function buildHeartbeatCollaborationInstructions(): string {
  return [
    "This is an OpenClaw heartbeat turn. Apply these instructions only to this heartbeat wake; ordinary chat turns should stay in Codex Default mode.",
    "When you are ready to end the heartbeat, prefer the structured `heartbeat_respond` tool so OpenClaw can record the wake outcome and notification decision. If `heartbeat_respond` is not already available and `tool_search` is available, search for `heartbeat_respond`, load it, then call it. Use `notify=false` when nothing should visibly interrupt the user.",
    CODEX_GPT5_HEARTBEAT_PROMPT_OVERLAY,
  ].join("\n\n");
}

function joinPresentSections(...sections: Array<string | undefined>): string {
  return sections.filter((section): section is string => Boolean(section?.trim())).join("\n\n");
}

export function codexDynamicToolsFingerprint(dynamicTools: CodexDynamicToolSpec[]): string {
  return fingerprintDynamicTools(dynamicTools);
}

export function areCodexDynamicToolFingerprintsCompatible(params: {
  previous?: string;
  next: string;
}): boolean {
  return areDynamicToolFingerprintsCompatible(params.previous, params.next);
}

function fingerprintDynamicTools(dynamicTools: CodexDynamicToolSpec[]): string {
  return JSON.stringify(
    dynamicTools.map(fingerprintDynamicToolSpec).toSorted(compareJsonFingerprint),
  );
}

function fingerprintUserMcpServersConfigPatch(
  configPatch: JsonObject | undefined,
): string | undefined {
  return configPatch ? JSON.stringify(stabilizeJsonValue(configPatch)) : undefined;
}

function fingerprintEnvironmentSelection(
  environments: CodexTurnEnvironmentParams[] | undefined,
): string | undefined {
  return environments ? JSON.stringify(environments.map(stabilizeJsonValue)) : undefined;
}

function fingerprintDynamicToolSpec(tool: JsonValue): JsonValue {
  if (!isJsonObject(tool)) {
    return stabilizeJsonValue(tool);
  }
  const stable: JsonObject = {};
  for (const [key, child] of Object.entries(tool).toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (key === "description") {
      continue;
    }
    stable[key] = stabilizeJsonValue(child);
  }
  return stable;
}

function stabilizeJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(stabilizeJsonValue);
  }
  if (!isJsonObject(value)) {
    return value;
  }
  const stable: JsonObject = {};
  for (const [key, child] of Object.entries(value).toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    stable[key] = stabilizeJsonValue(child);
  }
  return stable;
}

function readActiveCodexTurnIds(thread: unknown): string[] {
  const turns = (thread as { turns?: Array<{ id?: unknown; status?: unknown }> }).turns;
  return (turns ?? [])
    .filter((turn) => turn.status === "inProgress")
    .map((turn) => (typeof turn.id === "string" ? turn.id : ""))
    .filter((turnId) => turnId.trim().length > 0);
}

const EMPTY_DYNAMIC_TOOLS_FINGERPRINT = JSON.stringify([]);

function areDynamicToolFingerprintsCompatible(previous: string | undefined, next: string): boolean {
  return !previous || previous === next;
}

function shouldStartTransientNoToolThread(params: {
  previous: string | undefined;
  next: string;
}): boolean {
  return Boolean(
    params.previous &&
    params.previous !== EMPTY_DYNAMIC_TOOLS_FINGERPRINT &&
    params.next === EMPTY_DYNAMIC_TOOLS_FINGERPRINT,
  );
}

function compareJsonFingerprint(left: JsonValue, right: JsonValue): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

export type CodexDeveloperInstructionLaunchEvidence = {
  cwd?: string;
  runtimeConfig?: JsonObject;
  nativeCodeModeEnabled?: boolean;
  nativeCodeModeOnlyEnabled?: boolean;
};

export function buildDeveloperInstructions(
  params: EmbeddedRunAttemptParams,
  options: {
    dynamicTools?: readonly CodexDynamicToolSpec[];
    launchEvidence?: CodexDeveloperInstructionLaunchEvidence;
  } = {},
): string {
  const nativeCommandGuidance = listRegisteredPluginAgentPromptGuidance({
    surface: "codex_app_server",
    includeLegacyGlobalGuidance: false,
  }).join("\n");
  const sections = [
    buildOpenClawCodexRuntimeBoundaryInstruction(options.dynamicTools),
    buildCodexLaunchEvidenceCapsule(options.dynamicTools, options.launchEvidence),
    buildDeferredDynamicToolManifest(options.dynamicTools),
    buildSkillWorkshopInstruction(options.dynamicTools),
    buildVisibleReplyInstruction(params, options.dynamicTools),
    nativeCommandGuidance,
    params.extraSystemPrompt,
    buildCodexNativeCodingTeamInstruction(options.dynamicTools),
  ];
  return sections.filter((section) => typeof section === "string" && section.trim()).join("\n\n");
}

export function buildCodexLaunchEvidenceCapsule(
  dynamicTools: readonly CodexDynamicToolSpec[] | undefined,
  launchEvidence: CodexDeveloperInstructionLaunchEvidence | undefined,
): string | undefined {
  if (!launchEvidence) {
    return undefined;
  }
  const dynamicToolNames = [
    ...new Set((dynamicTools ?? []).map((tool) => tool.name.trim()).filter(Boolean)),
  ].toSorted((left, right) => left.localeCompare(right));
  const mcpServerNames = readThreadConfigMcpServerNames(launchEvidence.runtimeConfig) ?? [];
  const codeModeConfigured = launchEvidence.nativeCodeModeEnabled !== false;
  const codeModeOnlyConfigured =
    launchEvidence.nativeCodeModeOnlyEnabled === true ||
    launchEvidence.runtimeConfig?.["features.code_mode_only"] === true;
  const lines = [
    "## Codex Launch Evidence Capsule",
    "",
    "This is bounded model-visible launch-contract evidence for the current Codex thread. It mirrors the operator readback class of facts but does not grant tools, prove success, retry, validate quality, or replace runtime events.",
    `- owner: codex_app_server`,
    `- executionCwd: ${launchEvidence.cwd ?? "not provided on this resumed turn"}`,
    `- openclawDynamicTools.count: ${dynamicToolNames.length}`,
    `- openclawDynamicTools.names: ${dynamicToolNames.length ? dynamicToolNames.join(", ") : "none"}`,
    `- codeModeConfigured: ${codeModeConfigured ? "true" : "false"}`,
    `- codeModeOnlyConfigured: ${codeModeOnlyConfigured ? "true" : "false"}`,
    `- expectedSubagentTool: spawn_agent`,
    `- mcpServers: ${mcpServerNames.length ? mcpServerNames.join(", ") : "none declared in thread config"}`,
    "",
    "When reviewing Coding workbench behavior, use this capsule for launch-contract facts such as absent OpenClaw dynamic tools. Use event/readback evidence for what actually happened during the turn.",
  ];
  return lines.join("\n");
}

function buildOpenClawCodexRuntimeBoundaryInstruction(
  dynamicTools: readonly CodexDynamicToolSpec[] | undefined,
): string {
  const dynamicToolNames = [
    ...new Set((dynamicTools ?? []).map((tool) => tool.name.trim()).filter(Boolean)),
  ].toSorted((left, right) => left.localeCompare(right));
  if (dynamicToolNames.length === 0) {
    return [
      "You are running inside OpenClaw through the Codex app-server harness.",
      "OpenClaw owns routing, session lineage, observation, mirroring, and receipt delivery.",
      "Codex owns implementation work inside this thread.",
      "OpenClaw dynamic tools are not model-visible in this Codex workbench turn; do not use OpenClaw task, sessions_spawn, sessions_history, or other OpenClaw tool names as the inner Coding team surface.",
    ].join("\n");
  }
  return [
    "You are running inside OpenClaw through the Codex app-server harness.",
    "OpenClaw owns routing, session lineage, observation, mirroring, and receipt delivery.",
    "Codex owns implementation work inside this thread.",
    `Only these OpenClaw dynamic tools are model-visible here: ${dynamicToolNames.join(", ")}.`,
    "Use OpenClaw dynamic tools only for their listed OpenClaw purpose; do not use them as a surrogate for Codex-native coding tools.",
  ].join("\n");
}

function buildCodexNativeCodingTeamInstruction(
  dynamicTools: readonly CodexDynamicToolSpec[] | undefined,
): string {
  const hasOpenClawSessionsSpawn = (dynamicTools ?? []).some(
    (tool) => tool.name.trim() === "sessions_spawn",
  );
  const lines = [
    "## Coding Scope And Closeout Boundary",
    "",
    "If the task includes a workspace-visible prompt, spec, or artifact file path, read that file in full before implementation and report observed chars plus sha256 digest in closeout. Treat the file body as authoritative scope; do not work from a parent summary when a required file ref cannot be read.",
    "For completion language, distinguish full spec complete, slice complete, partial implementation, validation not run, reviewer blocked, proof pending, and deferred work. Do not collapse a bounded slice into full-spec completion.",
    "Use the loaded Codex workspace instructions, `.codex/config.toml`, and `.codex/agents/*.toml` for repository inspection, implementation, helper-team, and review behavior.",
  ];
  if (hasOpenClawSessionsSpawn) {
    lines.push(
      "If `sessions_spawn` is also visible, it remains an OpenClaw outer-delegation tool for OpenClaw/ACP work, not the default inner Codex implementation route.",
    );
  }
  return lines.join("\n");
}

function buildDeferredDynamicToolManifest(
  dynamicTools: readonly CodexDynamicToolSpec[] | undefined,
): string | undefined {
  const deferredToolNames = [
    ...new Set(
      (dynamicTools ?? [])
        .filter((tool) => tool.deferLoading === true)
        .map((tool) => tool.name.trim())
        .filter(Boolean),
    ),
  ].toSorted((left, right) => left.localeCompare(right));
  if (deferredToolNames.length === 0) {
    return undefined;
  }
  return `Deferred searchable OpenClaw dynamic tools available: ${deferredToolNames.join(", ")}. Use \`tool_search\` to load exact callable specs before use.`;
}

function buildSkillWorkshopInstruction(
  dynamicTools: readonly CodexDynamicToolSpec[] | undefined,
): string | undefined {
  const hasSkillWorkshop = (dynamicTools ?? []).some(
    (tool) => tool.name.trim() === SKILL_WORKSHOP_TOOL_NAME,
  );
  if (!hasSkillWorkshop) {
    return undefined;
  }
  return buildSkillWorkshopPromptSection().join("\n");
}

function buildVisibleReplyInstruction(
  params: EmbeddedRunAttemptParams,
  dynamicTools: readonly CodexDynamicToolSpec[] | undefined,
): string {
  const messageToolAvailable = dynamicTools
    ? dynamicTools.some((tool) => tool.name.trim() === "message")
    : params.disableMessageTool !== true;
  if (params.sourceReplyDeliveryMode === "message_tool_only" && messageToolAvailable) {
    return "Visible source replies are not automatically delivered for this run. Use `message(action=send)` for user-visible source-channel output. Do not repeat that visible content in your final answer.";
  }
  if (messageToolAvailable) {
    return "For the current source conversation, reply normally in your final assistant message; OpenClaw will deliver it through the active source conversation. Use `message` only for explicit out-of-band sends, media/file sends, or sends to a different target.";
  }
  return "For the current source conversation, reply normally in your final assistant message; OpenClaw will deliver it through the active source conversation.";
}

function buildUserInput(
  params: EmbeddedRunAttemptParams,
  promptText: string = params.prompt,
): CodexUserInput[] {
  const imageInputs = (params.images ?? []).map((image): CodexUserInput => {
    const imageUrl = sanitizeInlineImageDataUrl(`data:${image.mimeType};base64,${image.data}`);
    return imageUrl
      ? { type: "image", url: imageUrl }
      : {
          type: "text",
          text: invalidInlineImageText("codex user input"),
          text_elements: [],
        };
  });
  return [{ type: "text", text: promptText, text_elements: [] }, ...imageInputs];
}

export function resolveCodexAppServerModelProvider(params: {
  provider: string;
  authProfileId?: string;
  authProfileStore?: CodexAppServerAuthProfileLookup["authProfileStore"];
  agentDir?: string;
  config?: CodexAppServerAuthProfileLookup["config"];
}): string | undefined {
  const normalized = params.provider.trim();
  const normalizedLower = normalized.toLowerCase();
  if (!normalized || normalizedLower === "codex") {
    // `codex` is OpenClaw's virtual provider; let Codex app-server keep its
    // native provider/auth selection instead of forcing the legacy OpenAI path.
    return undefined;
  }
  if (isCodexAppServerNativeAuthProfile(params) && normalizedLower === "openai") {
    // When OpenClaw is forwarding ChatGPT/Codex OAuth, `openai` is Codex's
    // native provider id, not a public OpenAI API-key choice. Omit the override
    // so app-server keeps its configured provider/auth pair for this session.
    return undefined;
  }
  return normalizedLower === "openai" ? "openai" : normalized;
}

// Modern Codex models use the low/medium/high/xhigh effort enum and reject
// "minimal". GPT-5.6 additionally accepts "max". Translate the inherited
// minimal default before the request, but reject unsupported explicit/profile
// values here instead of silently omitting them at the provider boundary.
export function resolveReasoningEffort(
  thinkLevel: EmbeddedRunAttemptParams["thinkLevel"],
  modelId: string,
): "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null {
  if (thinkLevel === "off" || thinkLevel === "adaptive") {
    return null;
  }

  const effort = thinkLevel === "minimal" && isModernCodexModel(modelId) ? "low" : thinkLevel;
  if (effort === "max" && !supportsMaxCodexModel(modelId)) {
    throw new Error(
      `Codex model ${JSON.stringify(modelId)} does not support reasoning effort "max". ` +
        "Use gpt-5.6-sol, gpt-5.6-terra, or gpt-5.6-luna, or select a supported effort.",
    );
  }

  return effort;
}
