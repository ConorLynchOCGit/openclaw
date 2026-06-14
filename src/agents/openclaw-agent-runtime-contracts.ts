import type { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { ReasoningLevel, ThinkLevel } from "../auto-reply/thinking.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.js";
import type { AgentRunRequest } from "./agent-run-request.js";

export type AgentRuntimeJsonValue =
  | null
  | boolean
  | number
  | string
  | AgentRuntimeJsonValue[]
  | { [key: string]: AgentRuntimeJsonValue };

export type OpenClawRuntimeEnvelope = "chat" | "runtime_job" | "proof" | "child_agent";

export type RuntimeGenerationRoots = {
  canonicalSourceRoot: string;
  runtimeWorkspaceDir: string;
  transcriptRoot: string;
  artifactRoot: string;
};

export type RuntimeGenerationModelRequestParameters = {
  reasoning: unknown;
  reasoningEffort: string | null;
  thinking: string | null;
  maxTokens: number | null;
  temperature: number | null;
  parallelToolCalls: boolean | null;
  toolChoice: string | null;
  contextWindowTokens: number | null;
};

export type RuntimeGenerationModelIdentity = {
  requestedRef: string;
  canonicalRef: string;
  provider: string;
  transport: string | null;
  modelId: string;
  catalogSnapshotId: string;
  resolutionSource: "admitted_catalog" | "provider_dynamic" | "provider_family_alias";
  request: RuntimeGenerationModelRequestParameters;
  runtimeModel: ProviderRuntimeModel;
};

export type AgentRuntimeProviderTurnPhase =
  | "provider_capability_entered"
  | "provider_client_starting"
  | "provider_client_ready"
  | "thread_binding_started"
  | "thread_binding_ready"
  | "provider_request_started"
  | "model_stream_started"
  | "tool_call_started"
  | "tool_call_completed"
  | "tool_call_failed"
  | "model_stream_completed"
  | "agent_turn_completed"
  | "agent_turn_failed";

export type AgentRuntimeProviderTurnEvent = {
  phase: AgentRuntimeProviderTurnPhase;
  failedPhase?: AgentRuntimeProviderTurnPhase;
  provider: string;
  model: string;
  transportKind: string;
  elapsedMs?: number;
  toolName?: string;
  errorName?: string;
  errorCode?: string;
  errorMessage?: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  secretsStored: false;
};

export type AgentRuntimeProviderCapability = {
  artifactKind: "openclaw.runtime_generation.provider_capability";
  schemaVersion: "openclaw.runtime-generation.provider-capability.v1";
  capabilityId: "codex_app_server" | "generic_provider_runtime";
  provider: string;
  model: string;
  transportKind: string;
  fallbackAllowed: boolean;
  runTurn(input: {
    attempt: unknown;
    emit: (event: AgentRuntimeProviderTurnEvent) => void;
    signal?: AbortSignal;
  }): Promise<unknown>;
};

export type RuntimeGenerationAgentProfile = {
  agentId: string;
  agentDir: string;
  promptProfile: string;
  promptProfileHash: string;
  toolPolicy: string[];
  toolPolicyHash: string;
  roots: RuntimeGenerationRoots;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  model: RuntimeGenerationModelIdentity;
  admittedRuntimeModel: ProviderRuntimeModel;
  providerCapability: AgentRuntimeProviderCapability;
  allowedChildAgentIds: string[];
  parentToolNames: string[];
  thinkingLevel: ThinkLevel | null;
  reasoningLevel: ReasoningLevel | null;
};

export type RuntimeGeneration = {
  artifactKind: "openclaw.runtime_generation";
  schemaVersion: "openclaw.runtime-generation.v1";
  id: string;
  status: "ready";
  createdAt: string;
  config: OpenClawConfig;
  configPath: string;
  configSnapshotId: string;
  catalogSnapshotId: string;
  profiles: Map<string, RuntimeGenerationAgentProfile>;
  primaryRoots: RuntimeGenerationRoots;
  diagnostics: {
    runtimeUid: number | null;
    runtimeGid: number | null;
    agentCount: number;
    providerRuntimeCount: number;
    reasonCodes: string[];
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
    rawToolLogStored: false;
    secretsStored: false;
  };
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  secretsStored: false;
};

export type RuntimeGenerationStatus = {
  artifactKind: "openclaw.runtime_generation.status";
  schemaVersion: "openclaw.runtime-generation.status.v1";
  accepted: boolean;
  status: "ready";
  runtimeGenerationId: string;
  configPath: string;
  configSnapshotId: string;
  catalogSnapshotId: string;
  runtimeRoots: RuntimeGenerationRoots;
  agentChecks: AgentRuntimeJsonValue[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  secretsStored: false;
};

export type NativeExecutionRef = {
  ref: string;
  type?: string;
  kind?: string;
  source?: string;
};

export type OpenClawAcceptedAgentRunRequest = {
  objective: string;
  refs: NativeExecutionRef[];
  constraints: string[];
  validationSignal: string | null;
};

export type OpenClawAcceptedAgentRunTaskMessage = {
  sessionId: string;
  agentProfile: string;
  text: string;
};

export type OpenClawAcceptedAgentRun = {
  artifactKind: "openclaw.accepted_agent_run";
  schemaVersion: "openclaw.accepted-agent-run.v1";
  runtimeGenerationId: string;
  agentId: string;
  envelope: OpenClawRuntimeEnvelope;
  policyRef: string | null;
  sessionId: string;
  parentSessionId: string | null;
  childRelation: "blocking" | "background" | null;
  request: OpenClawAcceptedAgentRunRequest;
  taskMessage: OpenClawAcceptedAgentRunTaskMessage;
  runRequest: AgentRunRequest;
  idempotencyScope: string;
  idempotencyKey: string;
  metadata: {
    configSnapshotId: string;
    catalogSnapshotId: string;
    promptProfileHash: string;
    toolPolicyHash: string;
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
    rawToolLogStored: false;
  };
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  secretsStored: false;
};
