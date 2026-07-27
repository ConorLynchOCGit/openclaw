import type { EmbeddedRunAttemptParams } from "openclaw/plugin-sdk/agent-harness-runtime";
import type { CodexAppServerClient } from "./client.js";
import type { CodexAppServerRuntimeOptions } from "./config.js";
import type { CodexPluginThreadConfig } from "./plugin-thread-config.js";
import type {
  CodexDynamicToolSpec,
  CodexSelectedCapabilityRoot,
  CodexTurnEnvironmentParams,
  JsonObject,
} from "./protocol.js";
import type { CodexAppServerBindingStore, CodexAppServerThreadBinding } from "./session-binding.js";
import type { CodexContextEngineThreadBootstrapProjection } from "./thread-context-engine.js";
import type { CodexThreadLifecycleTimingOptions } from "./thread-lifecycle-timing.js";
import type { CodexNativeWebSearchSupport } from "./web-search.js";

type CodexAppServerThreadLifecycle = {
  action: "started" | "resumed" | "forked";
  rotatedContextEngineBinding?: boolean;
  activeTurnIds?: string[];
  authorityReadback?: CodexThreadAuthorityReadback;
};

export type CodexThreadAuthorityReadback = {
  cwd: string;
  runtimeWorkspaceRoots: string[];
  instructionSources: string[];
  permissionProfile?: string;
};

export type CodexAppServerThreadLifecycleBinding = CodexAppServerThreadBinding & {
  lifecycle: CodexAppServerThreadLifecycle;
};

type CodexThreadFinalConfigPatchDecision =
  | { action: "resume"; binding: CodexAppServerThreadBinding }
  | { action: "start" };

type CodexThreadFinalConfigPatchResult = {
  configPatch?: JsonObject;
  nativeHookRelayGeneration?: string;
};

export type CodexPluginThreadConfigProvider = {
  enabled: boolean;
  inputFingerprint?: string;
  enabledPluginConfigKeys?: readonly string[];
  recoverablePluginConfigKeys?: readonly string[];
  accountAppRecoveryEnabled?: boolean;
  build: () => Promise<CodexPluginThreadConfig>;
};

export type CodexStartOrResumeThreadParams = {
  client: CodexAppServerClient;
  abandonClient?: () => Promise<void>;
  reserveResumeThread?: (threadId: string) => { release: () => void };
  bindingStore: CodexAppServerBindingStore;
  params: EmbeddedRunAttemptParams;
  agentId?: string;
  cwd: string;
  dynamicTools: CodexDynamicToolSpec[];
  persistentWebSearchAllowed?: boolean;
  webSearchAllowed?: boolean;
  appServer: CodexAppServerRuntimeOptions;
  developerInstructions?: string;
  permissionProfile?: string;
  config?: JsonObject;
  finalConfigPatch?: JsonObject;
  buildFinalConfigPatch?: (
    decision: CodexThreadFinalConfigPatchDecision,
  ) => CodexThreadFinalConfigPatchResult;
  nativeHookRelayGeneration?: string;
  nativeCodeModeEnabled?: boolean;
  nativeProviderWebSearchSupport?: CodexNativeWebSearchSupport;
  nativeCodeModeOnlyEnabled?: boolean;
  userMcpServersEnabled?: boolean;
  mcpServersFingerprint?: string;
  mcpServersFingerprintEvaluated?: boolean;
  environmentSelection?: CodexTurnEnvironmentParams[];
  selectedCapabilityRoots?: CodexSelectedCapabilityRoot[];
  requireSystemProfileReadback?: boolean;
  appServerRuntimeFingerprint?: string;
  pluginThreadConfig?: CodexPluginThreadConfigProvider;
  contextEngineProjection?: CodexContextEngineThreadBootstrapProjection;
  signal?: AbortSignal;
  timing?: CodexThreadLifecycleTimingOptions;
  hostSystemAgentActive?: boolean;
};
