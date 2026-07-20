// Codex plugin module implements conversation binding behavior.
import {
  formatErrorMessage,
  resolveSandboxContext,
} from "openclaw/plugin-sdk/agent-harness-runtime";
import { resolveSessionAgentIds } from "openclaw/plugin-sdk/agent-runtime";
import { loadExecApprovals } from "openclaw/plugin-sdk/exec-approvals-runtime";
import type {
  PluginConversationBindingResolvedEvent,
  PluginHookInboundClaimContext,
  PluginHookInboundClaimEvent,
} from "openclaw/plugin-sdk/plugin-entry";
import type { ReplyPayload } from "openclaw/plugin-sdk/reply-payload";
import {
  loadSessionStore,
  resolveSessionStoreEntry,
  resolveStorePath,
  type SessionEntry,
} from "openclaw/plugin-sdk/session-store-runtime";
import { resolveCodexAppServerForModelProvider } from "./app-server/app-server-policy.js";
import { resolveCodexAppServerAuthProfileIdForAgent } from "./app-server/auth-bridge.js";
import { CODEX_CONTROL_METHODS } from "./app-server/capabilities.js";
import {
  canUseCodexModelBackedApprovalsReviewerForModel,
  codexSandboxPolicyForTurn,
  resolveOpenClawExecPolicyForCodexAppServer,
  resolveCodexAppServerRuntimeOptions,
  type CodexAppServerApprovalPolicy,
  type CodexAppServerSandboxMode,
  type OpenClawExecPolicyForCodexAppServer,
} from "./app-server/config.js";
import type {
  CodexServiceTier,
  CodexThreadResumeResponse,
  CodexThreadStartResponse,
  CodexTurnStartResponse,
  JsonValue,
} from "./app-server/protocol.js";
import {
  resolveCodexNativeExecutionBlock,
  resolveCodexNativeSandboxBlock,
} from "./app-server/sandbox-guard.js";
import {
  clearCodexAppServerBinding,
  isCodexAppServerNativeAuthProfile,
  normalizeCodexAppServerBindingModelProvider,
  readCodexAppServerBinding,
  writeCodexAppServerBinding,
  type CodexAppServerAuthProfileLookup,
} from "./app-server/session-binding.js";
import {
  getLeasedSharedCodexAppServerClient,
  releaseLeasedSharedCodexAppServerClient,
} from "./app-server/shared-client.js";
import {
  assertCodexSystemThreadResponse,
  assertCodexSystemV2Model,
  resolveCodexSystemThreadContext,
  type CodexSystemThreadContext,
} from "./app-server/system-authority.js";
import {
  CODEX_NATIVE_PERSONALITY_NONE,
  resolveCodexAppServerRequestModelSelection,
} from "./app-server/thread-lifecycle.js";
import { formatCodexDisplayText } from "./command-formatters.js";
import {
  createCodexConversationBindingData,
  readCodexConversationBindingData,
  readCodexConversationBindingDataRecord,
  resolveCodexDefaultWorkspaceDir,
  type CodexAppServerConversationBindingData,
} from "./conversation-binding-data.js";
import { trackCodexConversationActiveTurn } from "./conversation-control.js";
import { createCodexConversationTurnCollector } from "./conversation-turn-collector.js";
import { buildCodexConversationTurnInput } from "./conversation-turn-input.js";
import { resumeCodexCliSessionOnNode } from "./node-cli-sessions.js";

const DEFAULT_BOUND_TURN_TIMEOUT_MS = 20 * 60_000;
const NATIVE_CONVERSATION_INTERACTIVE_APPROVALS_UNAVAILABLE =
  "OpenClaw native Codex conversation binding cannot route interactive approvals yet; use the Codex harness or explicit /acp spawn codex for that workflow.";

export {
  createCodexCliNodeConversationBindingData,
  readCodexConversationBindingData,
  resolveCodexDefaultWorkspaceDir,
} from "./conversation-binding-data.js";

type CodexConversationRunOptions = {
  pluginConfig?: unknown;
  config?: CodexConversationConfig;
  timeoutMs?: number;
  resumeCodexCliSessionOnNode?: ResumeCodexCliSessionOnNodeFn;
};

type ResumeCodexCliSessionOnNodeFn = (
  params: Omit<Parameters<typeof resumeCodexCliSessionOnNode>[0], "runtime">,
) => ReturnType<typeof resumeCodexCliSessionOnNode>;

type CodexConversationStartParams = {
  pluginConfig?: unknown;
  config?: CodexConversationConfig;
  sessionFile: string;
  workspaceDir?: string;
  agentDir?: string;
  sessionKey?: string;
  threadId?: string;
  model?: string;
  modelProvider?: string;
  authProfileId?: string;
  approvalPolicy?: CodexAppServerApprovalPolicy;
  sandbox?: CodexAppServerSandboxMode;
  serviceTier?: CodexServiceTier;
};

type BoundTurnResult = {
  reply: ReplyPayload;
};

type CodexConversationConfig = Parameters<
  typeof resolveCodexAppServerAuthProfileIdForAgent
>[0]["config"];

type CodexConversationGlobalState = {
  queues: Map<string, Promise<void>>;
};

async function resolveConversationAppServerRuntime(params: {
  pluginConfig?: unknown;
  config?: CodexConversationConfig;
  agentId?: string;
  agentDir?: string;
  sessionKey?: string;
  workspaceDir: string;
  modelProvider?: string;
  model?: string;
}): Promise<{
  execPolicy?: OpenClawExecPolicyForCodexAppServer;
  runtime: ReturnType<typeof resolveCodexAppServerRuntimeOptions>;
}> {
  const execPolicy = resolveConversationExecPolicy({
    config: params.config,
    agentId: params.agentId,
    sessionKey: params.sessionKey,
  });
  const sandboxForPolicy =
    execPolicy.touched && execPolicy.security === "full" && execPolicy.ask !== "off"
      ? await resolveSandboxContext({
          config: params.config,
          sessionKey: params.sessionKey,
          workspaceDir: params.workspaceDir,
        })
      : undefined;
  const runtime = resolveCodexAppServerRuntimeOptions({
    pluginConfig: params.pluginConfig,
    execPolicy,
    modelProvider: params.modelProvider,
    model: params.model,
    config: params.config,
    agentDir: params.agentDir,
    openClawSandboxActive: Boolean(sandboxForPolicy?.enabled),
  });
  return { execPolicy, runtime };
}

const CODEX_CONVERSATION_GLOBAL_STATE = Symbol.for("openclaw.codex.conversationBinding");

function getGlobalState(): CodexConversationGlobalState {
  const globalState = globalThis as typeof globalThis & {
    [CODEX_CONVERSATION_GLOBAL_STATE]?: CodexConversationGlobalState;
  };
  globalState[CODEX_CONVERSATION_GLOBAL_STATE] ??= { queues: new Map() };
  return globalState[CODEX_CONVERSATION_GLOBAL_STATE];
}

export async function startCodexConversationThread(
  params: CodexConversationStartParams,
): Promise<CodexAppServerConversationBindingData> {
  const workspaceDir =
    params.workspaceDir?.trim() || resolveCodexDefaultWorkspaceDir(params.pluginConfig);
  const agentDir = params.agentDir?.trim();
  const agentLookup = buildAgentLookup({ agentDir, config: params.config });
  const existingBinding = await readCodexAppServerBinding(params.sessionFile, {
    ...agentLookup,
  });
  const authProfileId = resolveCodexAppServerAuthProfileIdForAgent({
    authProfileId: params.authProfileId ?? existingBinding?.authProfileId,
    ...agentLookup,
  });
  let boundWorkspaceDir: string;
  if (params.threadId?.trim()) {
    boundWorkspaceDir = await attachExistingThread({
      pluginConfig: params.pluginConfig,
      sessionFile: params.sessionFile,
      threadId: params.threadId.trim(),
      workspaceDir,
      ...(agentDir ? { agentDir } : {}),
      model: params.model,
      modelProvider: params.modelProvider,
      authProfileId,
      approvalPolicy: params.approvalPolicy,
      sandbox: params.sandbox,
      serviceTier: params.serviceTier,
      config: params.config,
      sessionKey: params.sessionKey,
    });
  } else {
    boundWorkspaceDir = await createThread({
      pluginConfig: params.pluginConfig,
      sessionFile: params.sessionFile,
      workspaceDir,
      ...(agentDir ? { agentDir } : {}),
      model: params.model,
      modelProvider: params.modelProvider,
      authProfileId,
      approvalPolicy: params.approvalPolicy,
      sandbox: params.sandbox,
      serviceTier: params.serviceTier,
      config: params.config,
      sessionKey: params.sessionKey,
    });
  }
  return createCodexConversationBindingData({
    sessionFile: params.sessionFile,
    workspaceDir: boundWorkspaceDir,
    ...(agentDir ? { agentDir } : {}),
  });
}

export async function handleCodexConversationInboundClaim(
  event: PluginHookInboundClaimEvent,
  ctx: PluginHookInboundClaimContext,
  options: CodexConversationRunOptions = {},
): Promise<{ handled: boolean; reply?: ReplyPayload } | undefined> {
  const data = readCodexConversationBindingData(ctx.pluginBinding);
  if (!data) {
    return undefined;
  }
  if (event.commandAuthorized !== true) {
    return { handled: true };
  }
  const prompt = event.bodyForAgent?.trim() || event.content?.trim() || "";
  if (!prompt) {
    return { handled: true };
  }
  const nativeExecutionBlock =
    data.kind === "codex-cli-node-session"
      ? resolveCodexNativeSandboxBlock({
          config: options.config,
          sessionKey: event.sessionKey ?? ctx.sessionKey,
          surface: "Codex CLI node conversation binding",
        })
      : resolveCodexNativeExecutionBlock({
          config: options.config,
          sessionKey: event.sessionKey ?? ctx.sessionKey,
          surface: "Codex app-server conversation binding",
        });
  if (nativeExecutionBlock) {
    return { handled: true, reply: { text: nativeExecutionBlock } };
  }
  if (data.kind === "codex-cli-node-session") {
    const resume = options.resumeCodexCliSessionOnNode;
    if (!resume) {
      return {
        handled: true,
        reply: {
          text: "Codex CLI node binding is unavailable because Gateway node runtime is not attached.",
        },
      };
    }
    try {
      const result = await enqueueBoundTurn(`${data.nodeId}:${data.sessionId}`, async () => {
        const resumed = await resume({
          nodeId: data.nodeId,
          sessionId: data.sessionId,
          prompt,
          cwd: data.cwd,
          timeoutMs: options.timeoutMs,
        });
        return { reply: { text: resumed.text.trim() || "Codex completed without a text reply." } };
      });
      return { handled: true, reply: result.reply };
    } catch (error) {
      return {
        handled: true,
        reply: {
          text: `Codex CLI node turn failed: ${formatCodexDisplayText(formatErrorMessage(error))}`,
        },
      };
    }
  }
  try {
    const result = await enqueueBoundTurn(data.sessionFile, () =>
      runBoundTurnWithMissingThreadRecovery({
        data,
        prompt,
        event,
        config: options.config,
        sessionKey: event.sessionKey ?? ctx.sessionKey,
        pluginConfig: options.pluginConfig,
        timeoutMs: options.timeoutMs,
      }),
    );
    return { handled: true, reply: result.reply };
  } catch (error) {
    return {
      handled: true,
      reply: {
        text: `Codex app-server turn failed: ${formatCodexDisplayText(formatErrorMessage(error))}`,
      },
    };
  }
}

export async function handleCodexConversationBindingResolved(
  event: PluginConversationBindingResolvedEvent,
): Promise<void> {
  if (event.status !== "denied") {
    return;
  }
  const data = readCodexConversationBindingDataRecord(event.request.data ?? {});
  if (!data || data.kind !== "codex-app-server-session") {
    return;
  }
  await clearCodexAppServerBinding(data.sessionFile);
}

type CodexThreadBindingParams = {
  pluginConfig?: unknown;
  sessionFile: string;
  workspaceDir: string;
  agentDir?: string;
  model?: string;
  modelProvider?: string;
  authProfileId?: string;
  approvalPolicy?: CodexAppServerApprovalPolicy;
  sandbox?: CodexAppServerSandboxMode;
  serviceTier?: CodexServiceTier;
  config?: CodexAppServerAuthProfileLookup["config"];
  agentId?: string;
  sessionKey?: string;
};

type ConversationAppServerRuntime = Awaited<ReturnType<typeof resolveConversationAppServerRuntime>>;

type CodexThreadBindingRuntime = ConversationAppServerRuntime & {
  agentLookup: ReturnType<typeof buildAgentLookup>;
  client: Awaited<ReturnType<typeof getLeasedSharedCodexAppServerClient>>;
  model?: string;
  modelProvider?: string;
  workspaceDir: string;
  systemContext?: CodexSystemThreadContext;
};

function resolveConversationWorkspaceAuthority(params: {
  config?: CodexConversationConfig;
  sessionKey?: string;
  agentId?: string;
  workspaceDir: string;
}): {
  agentId?: string;
  sessionEntry?: SessionEntry;
  workspaceDir: string;
  systemContext?: CodexSystemThreadContext;
} {
  const sessionKey = params.sessionKey?.trim();
  if (!sessionKey) {
    return { agentId: params.agentId, workspaceDir: params.workspaceDir };
  }
  const agentId =
    params.agentId ??
    resolveSessionAgentIds({
      sessionKey,
      config: params.config ?? {},
    }).sessionAgentId;
  const storePath = resolveStorePath(params.config?.session?.store, { agentId });
  const sessionEntry = resolveSessionStoreEntry({
    store: loadSessionStore(storePath, { skipCache: true }),
    sessionKey,
  }).existing;
  const hasSystemAuthority =
    sessionEntry?.worktree?.kind === "system-change" || Boolean(sessionEntry?.codexSystemAuthority);
  const workspaceDir = hasSystemAuthority
    ? sessionEntry?.spawnedCwd?.trim() || params.workspaceDir
    : params.workspaceDir;
  const systemContext = resolveCodexSystemThreadContext({
    sessionEntry,
    agentId,
    cwd: workspaceDir,
  });
  return {
    agentId,
    sessionEntry,
    workspaceDir,
    systemContext,
  };
}

async function resolveThreadBindingRuntime(
  params: CodexThreadBindingParams,
): Promise<CodexThreadBindingRuntime> {
  const workspaceAuthority = resolveConversationWorkspaceAuthority({
    config: params.config,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    workspaceDir: params.workspaceDir,
  });
  const agentLookup = buildAgentLookup({ agentDir: params.agentDir, config: params.config });
  const modelProvider = resolveThreadRequestModelProvider({
    authProfileId: params.authProfileId,
    modelProvider: params.modelProvider,
    ...agentLookup,
  });
  const modelSelection = resolveOptionalThreadRequestModelSelection({
    model: params.model,
    modelProvider,
    authProfileId: params.authProfileId,
    ...agentLookup,
  });
  const reviewerModelProvider = resolveModelBackedReviewerPolicyProvider({
    authProfileId: params.authProfileId,
    modelProvider: params.modelProvider,
    ...agentLookup,
  });
  const { execPolicy, runtime } = await resolveConversationAppServerRuntime({
    pluginConfig: params.pluginConfig,
    config: params.config,
    agentId: workspaceAuthority.agentId,
    sessionKey: params.sessionKey,
    workspaceDir: workspaceAuthority.workspaceDir,
    modelProvider: reviewerModelProvider,
    model: params.model,
    agentDir: params.agentDir,
  });
  const modelScopedRuntime = resolveCodexAppServerForModelProvider({
    appServer: runtime,
    provider: reviewerModelProvider,
    model: params.model,
    config: params.config,
    env: process.env,
    agentDir: params.agentDir,
  });
  assertNativeConversationApprovalPolicySupported({
    execPolicy,
    approvalPolicy: execPolicy?.touched
      ? modelScopedRuntime.approvalPolicy
      : (params.approvalPolicy ?? modelScopedRuntime.approvalPolicy),
    approvalsReviewer: modelScopedRuntime.approvalsReviewer,
    modelBackedApprovalsReviewerUnavailable: !canUseCodexModelBackedApprovalsReviewerForModel({
      modelProvider: reviewerModelProvider,
      model: params.model,
      config: params.config,
      env: process.env,
      agentDir: params.agentDir,
    }),
  });
  const client = await getLeasedSharedCodexAppServerClient({
    startOptions: runtime.start,
    timeoutMs: runtime.requestTimeoutMs,
    authProfileId: params.authProfileId,
    processProfile: workspaceAuthority.systemContext?.processProfile,
    ...agentLookup,
  });
  return {
    execPolicy,
    runtime: modelScopedRuntime,
    agentLookup,
    model: modelSelection?.model,
    modelProvider: modelSelection?.modelProvider ?? modelProvider,
    client,
    workspaceDir: workspaceAuthority.workspaceDir,
    systemContext: workspaceAuthority.systemContext,
  };
}

function buildThreadRequestRuntimeOptions(
  params: CodexThreadBindingParams,
  resolved: CodexThreadBindingRuntime,
): {
  approvalPolicy: ConversationAppServerRuntime["runtime"]["approvalPolicy"];
  approvalsReviewer: ConversationAppServerRuntime["runtime"]["approvalsReviewer"];
  sandbox: ConversationAppServerRuntime["runtime"]["sandbox"];
  serviceTier?: CodexServiceTier;
} {
  const serviceTier = params.serviceTier ?? resolved.runtime.serviceTier;
  return {
    approvalPolicy: resolved.execPolicy?.touched
      ? resolved.runtime.approvalPolicy
      : (params.approvalPolicy ?? resolved.runtime.approvalPolicy),
    approvalsReviewer: resolved.runtime.approvalsReviewer,
    sandbox: resolved.execPolicy?.touched
      ? resolved.runtime.sandbox
      : (params.sandbox ?? resolved.runtime.sandbox),
    ...(serviceTier ? { serviceTier } : {}),
  };
}

async function writeThreadBindingFromResponse(
  params: CodexThreadBindingParams,
  resolved: CodexThreadBindingRuntime,
  response: CodexThreadResumeResponse | CodexThreadStartResponse,
): Promise<void> {
  const runtimeApprovalPolicy =
    typeof resolved.runtime.approvalPolicy === "string"
      ? resolved.runtime.approvalPolicy
      : undefined;
  await writeCodexAppServerBinding(
    params.sessionFile,
    {
      threadId: response.thread.id,
      cwd: response.cwd ?? response.thread.cwd ?? resolved.workspaceDir,
      authProfileId: params.authProfileId,
      model: response.model ?? resolved.model ?? params.model,
      modelProvider: normalizeCodexAppServerBindingModelProvider({
        authProfileId: params.authProfileId,
        modelProvider: response.modelProvider ?? resolved.modelProvider ?? params.modelProvider,
        ...resolved.agentLookup,
      }),
      approvalPolicy: resolved.execPolicy?.touched
        ? runtimeApprovalPolicy
        : (params.approvalPolicy ?? runtimeApprovalPolicy),
      sandbox: resolved.execPolicy?.touched
        ? resolved.systemContext
          ? undefined
          : resolved.runtime.sandbox
        : resolved.systemContext
          ? undefined
          : (params.sandbox ?? resolved.runtime.sandbox),
      serviceTier: params.serviceTier ?? resolved.runtime.serviceTier,
      systemAuthorityFingerprint: resolved.systemContext?.fingerprint,
    },
    {
      ...resolved.agentLookup,
    },
  );
}

async function attachExistingThread(
  params: CodexThreadBindingParams & {
    threadId: string;
  },
): Promise<string> {
  const resolved = await resolveThreadBindingRuntime(params);
  try {
    if (resolved.systemContext) {
      assertCodexSystemV2Model(resolved.systemContext, resolved.model);
    }
    const response: CodexThreadResumeResponse = await resolved.client.request(
      CODEX_CONTROL_METHODS.resumeThread,
      resolved.systemContext
        ? {
            threadId: params.threadId,
            ...(resolved.model ? { model: resolved.model } : {}),
            ...(resolved.modelProvider ? { modelProvider: resolved.modelProvider } : {}),
            personality: CODEX_NATIVE_PERSONALITY_NONE,
            ...((params.serviceTier ?? resolved.runtime.serviceTier)
              ? { serviceTier: params.serviceTier ?? resolved.runtime.serviceTier }
              : {}),
          }
        : {
            threadId: params.threadId,
            ...(resolved.model ? { model: resolved.model } : {}),
            ...(resolved.modelProvider ? { modelProvider: resolved.modelProvider } : {}),
            personality: CODEX_NATIVE_PERSONALITY_NONE,
            ...buildThreadRequestRuntimeOptions(params, resolved),
            persistExtendedHistory: true,
          },
      { timeoutMs: resolved.runtime.requestTimeoutMs },
    );
    if (resolved.systemContext) {
      assertCodexSystemThreadResponse({
        response,
        context: resolved.systemContext,
        cwd: resolved.workspaceDir,
        action: "resume",
      });
    }
    await writeThreadBindingFromResponse(params, resolved, response);
    return resolved.workspaceDir;
  } finally {
    releaseLeasedSharedCodexAppServerClient(resolved.client);
  }
}

async function createThread(params: CodexThreadBindingParams): Promise<string> {
  const resolved = await resolveThreadBindingRuntime(params);
  try {
    const requestRuntime = buildThreadRequestRuntimeOptions(params, resolved);
    if (resolved.systemContext) {
      assertCodexSystemV2Model(resolved.systemContext, resolved.model);
    }
    const response: CodexThreadStartResponse = await resolved.client.request(
      "thread/start",
      resolved.systemContext
        ? {
            cwd: resolved.workspaceDir,
            runtimeWorkspaceRoots: [resolved.workspaceDir],
            ...(resolved.model ? { model: resolved.model } : {}),
            ...(resolved.modelProvider ? { modelProvider: resolved.modelProvider } : {}),
            personality: CODEX_NATIVE_PERSONALITY_NONE,
            approvalPolicy: requestRuntime.approvalPolicy,
            approvalsReviewer: requestRuntime.approvalsReviewer,
            permissions: resolved.systemContext.authority.permissionProfile,
            ...(requestRuntime.serviceTier ? { serviceTier: requestRuntime.serviceTier } : {}),
            config: resolved.systemContext.authority.config,
            environments: resolved.systemContext.environments,
            selectedCapabilityRoots: resolved.systemContext.authority.selectedCapabilityRoots,
            experimentalRawEvents: true,
          }
        : {
            cwd: resolved.workspaceDir,
            ...(resolved.model ? { model: resolved.model } : {}),
            ...(resolved.modelProvider ? { modelProvider: resolved.modelProvider } : {}),
            personality: CODEX_NATIVE_PERSONALITY_NONE,
            ...requestRuntime,
            developerInstructions:
              "This Codex thread is bound to an OpenClaw conversation. Answer normally; OpenClaw will deliver your final response back to the conversation.",
            experimentalRawEvents: true,
            persistExtendedHistory: true,
          },
      { timeoutMs: resolved.runtime.requestTimeoutMs },
    );
    if (resolved.systemContext) {
      assertCodexSystemThreadResponse({
        response,
        context: resolved.systemContext,
        cwd: resolved.workspaceDir,
        action: "start",
      });
    }
    await writeThreadBindingFromResponse(params, resolved, response);
    return resolved.workspaceDir;
  } finally {
    releaseLeasedSharedCodexAppServerClient(resolved.client);
  }
}

async function runBoundTurn(params: {
  data: CodexAppServerConversationBindingData;
  prompt: string;
  event: PluginHookInboundClaimEvent;
  pluginConfig?: unknown;
  config?: CodexConversationConfig;
  sessionKey?: string;
  timeoutMs?: number;
}): Promise<BoundTurnResult> {
  const agentLookup = buildAgentLookup({ agentDir: params.data.agentDir, config: params.config });
  const binding = await readCodexAppServerBinding(params.data.sessionFile, agentLookup);
  const threadId = binding?.threadId;
  if (!threadId) {
    throw new Error("bound Codex conversation has no thread binding");
  }
  const workspaceAuthority = resolveConversationWorkspaceAuthority({
    config: params.config,
    sessionKey: params.sessionKey,
    workspaceDir: binding.cwd || params.data.workspaceDir,
  });
  const workspaceDir = workspaceAuthority.workspaceDir;
  if (
    binding.systemAuthorityFingerprint !== workspaceAuthority.systemContext?.fingerprint &&
    (binding.systemAuthorityFingerprint || workspaceAuthority.systemContext)
  ) {
    throw new Error("bound Codex conversation system authority changed");
  }
  const reviewerModelProvider = resolveModelBackedReviewerPolicyProvider({
    authProfileId: binding.authProfileId,
    modelProvider: binding.modelProvider,
    ...agentLookup,
  });
  const { execPolicy, runtime } = await resolveConversationAppServerRuntime({
    pluginConfig: params.pluginConfig,
    config: params.config,
    agentId: workspaceAuthority.agentId,
    sessionKey: params.sessionKey,
    workspaceDir,
    modelProvider: reviewerModelProvider,
    model: binding.model,
    agentDir: params.data.agentDir,
  });
  const modelScopedRuntime = resolveCodexAppServerForModelProvider({
    appServer: runtime,
    provider: reviewerModelProvider,
    model: binding.model,
    config: params.config,
    env: process.env,
    agentDir: params.data.agentDir,
  });
  const modelBackedApprovalsReviewerUnavailable = !canUseCodexModelBackedApprovalsReviewerForModel({
    modelProvider: reviewerModelProvider,
    model: binding.model,
    config: params.config,
    env: process.env,
    agentDir: params.data.agentDir,
  });
  const useModelScopedPolicy =
    execPolicy?.touched === true || modelBackedApprovalsReviewerUnavailable;
  const approvalPolicy = useModelScopedPolicy
    ? modelScopedRuntime.approvalPolicy
    : (binding.approvalPolicy ?? modelScopedRuntime.approvalPolicy);
  const sandbox = useModelScopedPolicy
    ? modelScopedRuntime.sandbox
    : (binding.sandbox ?? modelScopedRuntime.sandbox);
  assertNativeConversationApprovalPolicySupported({
    execPolicy,
    approvalPolicy,
    approvalsReviewer: modelScopedRuntime.approvalsReviewer,
    modelBackedApprovalsReviewerUnavailable,
  });
  const modelSelection = binding.model
    ? resolveCodexAppServerRequestModelSelection({
        model: binding.model,
        modelProvider: binding.modelProvider,
        authProfileId: binding.authProfileId,
        ...agentLookup,
      })
    : undefined;

  const client = await getLeasedSharedCodexAppServerClient({
    startOptions: runtime.start,
    timeoutMs: runtime.requestTimeoutMs,
    authProfileId: binding.authProfileId,
    processProfile: workspaceAuthority.systemContext?.processProfile,
    ...agentLookup,
  });
  const collector = createCodexConversationTurnCollector(threadId);
  const notificationCleanup = client.addNotificationHandler((notification) =>
    collector.handleNotification(notification),
  );
  const requestCleanup = client.addRequestHandler(
    async (request): Promise<JsonValue | undefined> => {
      if (request.method === "item/tool/call") {
        return {
          contentItems: [
            {
              type: "inputText",
              text: "OpenClaw native Codex conversation binding does not expose dynamic OpenClaw tools yet.",
            },
          ],
          success: false,
        };
      }
      if (
        request.method === "item/commandExecution/requestApproval" ||
        request.method === "item/fileChange/requestApproval"
      ) {
        return {
          decision: "decline",
          reason:
            "OpenClaw native Codex conversation binding cannot route interactive approvals yet; use the Codex harness or explicit /acp spawn codex for that workflow.",
        };
      }
      if (request.method === "item/permissions/requestApproval") {
        return { permissions: {}, scope: "turn" };
      }
      if (request.method.includes("requestApproval")) {
        return {
          decision: "decline",
          reason:
            "OpenClaw native Codex conversation binding cannot route interactive approvals yet; use the Codex harness or explicit /acp spawn codex for that workflow.",
        };
      }
      return undefined;
    },
  );
  try {
    if (workspaceAuthority.systemContext) {
      assertCodexSystemV2Model(workspaceAuthority.systemContext, modelSelection?.model);
    }
    const response: CodexTurnStartResponse = await client.request(
      "turn/start",
      {
        threadId,
        input: buildCodexConversationTurnInput({
          prompt: params.prompt,
          event: params.event,
        }),
        cwd: workspaceDir,
        ...(workspaceAuthority.systemContext ? { runtimeWorkspaceRoots: [workspaceDir] } : {}),
        approvalPolicy,
        approvalsReviewer: modelScopedRuntime.approvalsReviewer,
        ...(workspaceAuthority.systemContext
          ? {
              permissions: workspaceAuthority.systemContext.authority.permissionProfile,
              environments: workspaceAuthority.systemContext.environments,
            }
          : { sandboxPolicy: codexSandboxPolicyForTurn(sandbox, workspaceDir) }),
        ...(modelSelection?.model ? { model: modelSelection.model } : {}),
        personality: CODEX_NATIVE_PERSONALITY_NONE,
        ...((binding.serviceTier ?? runtime.serviceTier)
          ? { serviceTier: binding.serviceTier ?? runtime.serviceTier }
          : {}),
      },
      { timeoutMs: runtime.requestTimeoutMs },
    );
    const turnId = response.turn.id;
    const activeCleanup = trackCodexConversationActiveTurn({
      sessionFile: params.data.sessionFile,
      threadId,
      turnId,
    });
    collector.setTurnId(turnId);
    const completion = await collector
      .wait({
        timeoutMs: params.timeoutMs ?? DEFAULT_BOUND_TURN_TIMEOUT_MS,
      })
      .finally(activeCleanup);
    const replyText = completion.replyText.trim();
    return {
      reply: {
        text: replyText || "Codex completed without a text reply.",
      },
    };
  } finally {
    notificationCleanup();
    requestCleanup();
    releaseLeasedSharedCodexAppServerClient(client);
  }
}

function assertNativeConversationApprovalPolicySupported(params: {
  execPolicy?: OpenClawExecPolicyForCodexAppServer;
  approvalPolicy: ReturnType<typeof resolveCodexAppServerRuntimeOptions>["approvalPolicy"];
  approvalsReviewer: ReturnType<typeof resolveCodexAppServerRuntimeOptions>["approvalsReviewer"];
  modelBackedApprovalsReviewerUnavailable: boolean;
}): void {
  if (
    params.approvalPolicy !== "never" &&
    (params.execPolicy?.touched === true ||
      (params.modelBackedApprovalsReviewerUnavailable && params.approvalsReviewer === "user"))
  ) {
    throw new Error(NATIVE_CONVERSATION_INTERACTIVE_APPROVALS_UNAVAILABLE);
  }
}

async function runBoundTurnWithMissingThreadRecovery(params: {
  data: CodexAppServerConversationBindingData;
  prompt: string;
  event: PluginHookInboundClaimEvent;
  pluginConfig?: unknown;
  config?: CodexConversationConfig;
  sessionKey?: string;
  timeoutMs?: number;
}): Promise<BoundTurnResult> {
  try {
    return await runBoundTurn(params);
  } catch (error) {
    if (!isCodexThreadNotFoundError(error)) {
      throw error;
    }
    const agentLookup = buildAgentLookup({ agentDir: params.data.agentDir, config: params.config });
    const binding = await readCodexAppServerBinding(params.data.sessionFile, agentLookup);
    const execPolicy = resolveConversationExecPolicy({
      config: params.config,
      sessionKey: params.sessionKey,
    });
    const useCurrentRuntimePolicy = execPolicy.touched;
    await startCodexConversationThread({
      pluginConfig: params.pluginConfig,
      sessionFile: params.data.sessionFile,
      workspaceDir: binding?.cwd || params.data.workspaceDir,
      ...agentLookup,
      model: binding?.model,
      modelProvider: binding?.modelProvider,
      authProfileId: binding?.authProfileId,
      approvalPolicy: useCurrentRuntimePolicy ? undefined : binding?.approvalPolicy,
      sandbox: useCurrentRuntimePolicy ? undefined : binding?.sandbox,
      serviceTier: binding?.serviceTier,
      config: params.config,
      sessionKey: params.sessionKey,
    });
    return await runBoundTurn(params);
  }
}

function resolveConversationExecPolicy(params: {
  config?: CodexConversationConfig;
  agentId?: string;
  sessionKey?: string;
}) {
  const agentId =
    params.agentId ??
    (params.config
      ? resolveSessionAgentIds({
          sessionKey: params.sessionKey,
          config: params.config,
        }).sessionAgentId
      : undefined);
  return resolveOpenClawExecPolicyForCodexAppServer({
    config: params.config,
    agentId,
    execOverrides: readSessionExecOverrides({
      config: params.config,
      agentId,
      sessionKey: params.sessionKey,
    }),
    approvals: loadExecApprovals(),
  });
}

function readSessionExecOverrides(params: {
  config?: CodexConversationConfig;
  agentId?: string;
  sessionKey?: string;
}): { security?: string; ask?: string } | undefined {
  const sessionKey = params.sessionKey?.trim();
  if (!params.config || !sessionKey) {
    return undefined;
  }
  const storePath = resolveStorePath(params.config.session?.store, { agentId: params.agentId });
  const entry = resolveSessionStoreEntry({
    store: loadSessionStore(storePath, { skipCache: true }),
    sessionKey,
  }).existing;
  if (!entry?.execSecurity && !entry?.execAsk) {
    return undefined;
  }
  return {
    security: entry.execSecurity,
    ask: entry.execAsk,
  };
}

function isCodexThreadNotFoundError(error: unknown): boolean {
  const message = formatErrorMessage(error);
  return (
    /\bthread not found:/iu.test(message) ||
    /\bbound Codex conversation has no thread binding\b/u.test(message) ||
    /\bbound Codex conversation system authority changed\b/u.test(message)
  );
}

function enqueueBoundTurn<T>(key: string, run: () => Promise<T>): Promise<T> {
  const state = getGlobalState();
  const previous = state.queues.get(key) ?? Promise.resolve();
  const next = previous.then(run, run);
  const queued = next.then(
    () => undefined,
    () => undefined,
  );
  state.queues.set(key, queued);
  void next
    .finally(() => {
      if (state.queues.get(key) === queued) {
        state.queues.delete(key);
      }
    })
    .catch(() => undefined);
  return next;
}

function resolveThreadRequestModelProvider(params: {
  authProfileId?: string;
  modelProvider?: string;
  agentDir?: string;
  config?: CodexAppServerAuthProfileLookup["config"];
}): string | undefined {
  const modelProvider = params.modelProvider?.trim();
  if (!modelProvider || modelProvider.toLowerCase() === "codex") {
    return undefined;
  }
  if (isCodexAppServerNativeAuthProfile(params) && modelProvider.toLowerCase() === "openai") {
    return undefined;
  }
  return modelProvider.toLowerCase() === "openai" ? "openai" : modelProvider;
}

function resolveOptionalThreadRequestModelSelection(params: {
  model?: string;
  modelProvider?: string;
  authProfileId?: string;
  agentDir?: string;
  config?: CodexAppServerAuthProfileLookup["config"];
}): { model: string; modelProvider?: string } | undefined {
  if (!params.model?.trim()) {
    return undefined;
  }
  return resolveCodexAppServerRequestModelSelection({
    model: params.model,
    modelProvider: params.modelProvider,
    authProfileId: params.authProfileId,
    agentDir: params.agentDir,
    config: params.config,
  });
}

function resolveModelBackedReviewerPolicyProvider(params: {
  authProfileId?: string;
  modelProvider?: string;
  agentDir?: string;
  config?: CodexAppServerAuthProfileLookup["config"];
}): string | undefined {
  const modelProvider = params.modelProvider?.trim();
  if (modelProvider && modelProvider.toLowerCase() !== "codex") {
    return modelProvider.toLowerCase() === "openai" ? "openai" : modelProvider;
  }
  return isCodexAppServerNativeAuthProfile(params) ? "openai" : undefined;
}

function buildAgentLookup(params: {
  agentDir?: string;
  config?: CodexAppServerAuthProfileLookup["config"];
}): Pick<CodexAppServerAuthProfileLookup, "agentDir" | "config"> {
  const agentDir = params.agentDir?.trim();
  return {
    ...(agentDir ? { agentDir } : {}),
    ...(params.config ? { config: params.config } : {}),
  };
}
