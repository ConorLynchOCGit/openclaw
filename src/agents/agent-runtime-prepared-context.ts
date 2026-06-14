import type { ContextRuntime } from "../context-engine/runtime.js";
import type { PreparedModelAuthRuntime } from "./model-auth-runtime.js";
import type {
  AgentRuntimeProviderCapability,
  AgentRuntimeProviderTurnEvent,
} from "./openclaw-agent-runtime-contracts.js";

export type AgentRuntimePreparedContext = {
  owner: "agent_runtime_core";
  requestShape: "openclaw.agent-run-request.v1";
  prompt: {
    profile: string | null;
    promptLength: number;
    rawPromptStored: false;
  };
  toolRuntime: {
    visibleToolNames?: readonly string[];
    requiredToolNames?: readonly string[];
    rawToolLogStored: false;
  };
  workspace: {
    canonicalSourceRoot: string | null;
    runtimeWorkspaceDir: string;
    transcriptRoot: string | null;
    artifactRoot: string | null;
  };
  runEnvironment: {
    owner: "agent_runtime_core";
    workspaceResolution: {
      workspaceDir: string;
      usedFallback: boolean;
      fallbackReason?: "missing" | "blank" | "invalid_type";
      agentId: string;
      agentIdSource: "explicit" | "session_key" | "default";
    };
    resolvedWorkspace: string;
    provider: string;
    modelId: string;
    agentDir: string;
    normalizedSessionKey: string | null;
    fallbackConfigured: boolean;
    runtimePluginsLoaded: boolean;
    runtimePluginsStatus: "loaded" | "skipped_not_requested";
    modelsJsonStatus: "reused_admitted_runtime" | "ensured";
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
    rawToolLogStored: false;
  };
  transcript: {
    sessionId: string;
    sessionKey: string | null;
    sessionFile: string;
    rawPromptStored: false;
    rawResponseStored: false;
  };
  contextPressure?: {
    runtime: ContextRuntime;
    owner: "agent_runtime_core";
  };
  modelAuth: {
    provider: string | null;
    model: string | null;
    authStorageAdmitted: boolean;
    modelRegistryAdmitted: boolean;
    owner: "agent_runtime_core";
  };
  modelAuthRuntime: PreparedModelAuthRuntime;
  providerCapability: {
    owner: "agent_runtime_core";
    adapter: "interaction_attempt_runtime";
    capability?: Pick<
      AgentRuntimeProviderCapability,
      "capabilityId" | "provider" | "model" | "transportKind" | "fallbackAllowed"
    >;
    runTurn: (input: {
      attempt: unknown;
      emit: (event: AgentRuntimeProviderTurnEvent) => void;
      signal?: AbortSignal;
    }) => Promise<unknown>;
  };
  runtimeEventSink: {
    owner: "agent_runtime_core";
    evented: boolean;
    rawProviderLogStored: false;
  };
  receipts: readonly {
    serviceId: string;
    action: string;
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
    rawToolLogStored: false;
  }[];
};
