import { createHash } from "node:crypto";
import path from "node:path";
import type {
  NativeExecutionSessionRuntimeOptions,
  StartExecutionSessionVisibleInput,
} from "../../extensions/execution-platform/runtime-api.js";
import {
  buildNativeExecutionTaskMessage,
  normalizeStartExecutionSessionVisibleInput,
} from "../../extensions/execution-platform/runtime-api.js";
import {
  getRuntimeConfigSnapshot,
  getRuntimeConfigSourceSnapshot,
  resolveConfigPath,
  resolveConfigSnapshotHash,
} from "../config/config.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  AdmittedModelCatalogService,
  createAdmittedModelCatalogRuntime,
  createAdmittedModelRegistryFromModels,
  type AdmittedModelCatalogRuntime,
} from "./admitted-model-catalog-runtime.js";
import {
  findAgentPackRegistryEntry,
  isExecutionPlatformAgentPackEntry,
  loadAgentPackRegistryEntries,
  type AgentPackRegistryEntry,
} from "./agent-pack-registry.js";
import type { AgentRunRequest } from "./agent-run-request.js";
import { DefaultAgentRuntimeCore } from "./agent-runtime-core.js";
import {
  listAgentEntries,
  resolveAgentConfig,
  resolveAgentDir,
  resolveAgentEffectiveModelPrimary,
} from "./agent-scope.js";
import type { AgentTurnEnvelopePolicy, AgentTurnExecutionClass } from "./agent-turn.js";
import { DEFAULT_PROVIDER } from "./defaults.js";
import { parseModelRef } from "./model-selection.js";
import type {
  OpenClawAcceptedAgentRun,
  OpenClawRuntimeEnvelope,
  RuntimeGeneration,
  RuntimeGenerationAgentProfile,
  RuntimeGenerationStatus,
} from "./openclaw-agent-runtime-contracts.js";
import type { EmbeddedPiRunResult } from "./pi-embedded-runner/types.js";
import { discoverAuthStorage } from "./pi-model-discovery.js";
import { createAgentRuntimeProviderCapability } from "./runtime-provider-capability.js";
import { resolveRuntimeAgentWorkspaceRoots } from "./runtime-workspace-locator.js";

export type {
  OpenClawAcceptedAgentRun,
  OpenClawRuntimeEnvelope,
  RuntimeGeneration,
  RuntimeGenerationAgentProfile,
  RuntimeGenerationRoots,
  RuntimeGenerationStatus,
} from "./openclaw-agent-runtime-contracts.js";

type BuildRuntimeGenerationInput = {
  config: OpenClawConfig;
  now?: () => Date;
};

type AcceptNativeExecutionInput = {
  request: StartExecutionSessionVisibleInput;
  runtime?: NativeExecutionSessionRuntimeOptions;
  envelope?: OpenClawRuntimeEnvelope;
  policyRef?: string | null;
};

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      ),
    ),
  );
}

function boundedToolPolicy(values: readonly string[] | undefined): string[] {
  return Array.from(new Set([...(values ?? []), "node_finish"].filter(Boolean))).slice(0, 80);
}

function nodeAgentAllowedChildAgentIdsFromRegistryEntry(
  entry: AgentPackRegistryEntry | null | undefined,
): string[] {
  return entry?.allowedChildAgents?.length ? [...entry.allowedChildAgents] : [];
}

type GatewayThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "adaptive";

function isGatewayThinkingLevel(value: unknown): value is GatewayThinkingLevel {
  return (
    value === "off" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh" ||
    value === "adaptive"
  );
}

function isReasoningLevel(value: unknown): value is "on" | "off" | "stream" {
  return value === "on" || value === "off" || value === "stream";
}

function mergeParams(
  ...values: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  return Object.assign({}, ...values.filter(Boolean));
}

function modelParamEntry(input: {
  config: OpenClawConfig;
  requestedRef: string;
  canonicalRef?: string | null;
}): Record<string, unknown> | undefined {
  const models = input.config.agents?.defaults?.models ?? {};
  return (
    models[input.requestedRef]?.params ??
    (input.canonicalRef ? models[input.canonicalRef]?.params : undefined)
  );
}

function resolveRuntimeConfigSnapshotId(config: OpenClawConfig): string {
  const runtimeSnapshot = getRuntimeConfigSnapshot();
  const sourceSnapshot = getRuntimeConfigSourceSnapshot();
  const active = runtimeSnapshot ?? config;
  const activeHash = resolveConfigSnapshotHash({ raw: JSON.stringify(active) });
  const sourceHash = sourceSnapshot
    ? resolveConfigSnapshotHash({ raw: JSON.stringify(sourceSnapshot) })
    : null;
  return `config:${resolveConfigPath()}:${(activeHash ?? "unknown").slice(0, 16)}:source:${(sourceHash ?? "unknown").slice(0, 16)}`;
}

function relationOrNull(
  value: NativeExecutionSessionRuntimeOptions["childRelation"] | undefined,
): "blocking" | "background" | null {
  return value === "blocking" || value === "background" ? value : null;
}

function sessionSlugFromHash(hash: string): string {
  return `native_exec_${hash.slice(0, 32)}`;
}

function buildAgentRunRequest(input: {
  profile: RuntimeGenerationAgentProfile;
  sessionId: string;
  taskPrompt: string;
  runtimeGenerationId: string;
  configSnapshotId: string;
  catalogSnapshotId: string;
  envelope: OpenClawRuntimeEnvelope;
  policyRef: string | null;
  metadata?: Record<string, unknown>;
}): AgentRunRequest {
  return {
    agentId: input.profile.agentId,
    input: {
      prompt: input.taskPrompt,
      trigger: "manual",
    },
    promptProfile: input.profile.promptProfile,
    toolPolicy: {
      visibleToolNames: input.profile.toolPolicy,
      requiredToolNames: input.profile.parentToolNames,
    },
    modelProfile: {
      provider: input.profile.model.provider,
      model: input.profile.model.modelId,
      thinkingLevel: input.profile.thinkingLevel,
      reasoningLevel: input.profile.reasoningLevel,
    },
    workspace: {
      canonicalSourceRoot: input.profile.roots.canonicalSourceRoot,
      runtimeWorkspaceDir: input.profile.roots.runtimeWorkspaceDir,
      transcriptRoot: input.profile.roots.transcriptRoot,
      artifactRoot: input.profile.roots.artifactRoot,
    },
    transcript: {
      sessionId: input.sessionId,
      sessionKey: input.sessionId,
      sessionFile: path.join(input.profile.roots.transcriptRoot, `${input.sessionId}.jsonl`),
    },
    metadata: {
      artifactKind: "openclaw.accepted_agent_run",
      runtimeGenerationId: input.runtimeGenerationId,
      envelope: input.envelope,
      policyRef: input.policyRef,
      configSnapshotId: input.configSnapshotId,
      catalogSnapshotId: input.catalogSnapshotId,
      promptProfileHash: input.profile.promptProfileHash,
      toolPolicyHash: input.profile.toolPolicyHash,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      ...input.metadata,
    },
  };
}

export class OpenClawAgentRuntime {
  private constructor(
    private readonly options: {
      config: OpenClawConfig;
      generation: RuntimeGeneration;
    },
  ) {}

  static async build(input: BuildRuntimeGenerationInput): Promise<OpenClawAgentRuntime> {
    const config = input.config;
    const configSnapshotId = resolveRuntimeConfigSnapshotId(config);
    const registryEntries = await loadAgentPackRegistryEntries();
    const agentIds = uniqueNonEmpty([
      "execution-orchestrator",
      ...registryEntries.filter(isExecutionPlatformAgentPackEntry).map((entry) => entry.id),
    ]);
    const primaryAgentId = agentIds[0] ?? "execution-orchestrator";
    const primaryRoots = resolveRuntimeAgentWorkspaceRoots({ config, agentId: primaryAgentId });
    const primaryAgentDir = resolveAgentDir(config, primaryAgentId);
    const primaryAuthStorage = discoverAuthStorage(primaryAgentDir, {
      syncExternalCli: false,
    });
    const catalogRuntime = await createAdmittedModelCatalogRuntime({
      config,
      agentDir: primaryAgentDir,
      authStorage: primaryAuthStorage,
    });
    const modelCatalog = new AdmittedModelCatalogService();
    const profiles = new Map<string, RuntimeGenerationAgentProfile>();
    for (const agentId of agentIds) {
      const profile = await this.buildAgentProfile({
        config,
        agentId,
        registryEntries,
        catalogRuntime,
        modelCatalog,
      });
      profiles.set(agentId, profile);
    }
    const catalogSnapshotId = `runtime-catalog:${sha256Json({
      configSnapshotId,
      catalogMaterialHash: catalogRuntime.catalogMaterialHash,
      agents: [...profiles.values()].map((profile) => ({
        agentId: profile.agentId,
        model: profile.model.canonicalRef,
        providerCapability: profile.providerCapability.capabilityId,
        toolPolicyHash: profile.toolPolicyHash,
        promptProfileHash: profile.promptProfileHash,
      })),
    }).slice(0, 32)}`;
    const generationMaterial = {
      configSnapshotId,
      catalogSnapshotId,
      primaryRoots,
      agents: [...profiles.values()].map((profile) => ({
        agentId: profile.agentId,
        agentDir: profile.agentDir,
        roots: profile.roots,
        promptProfileHash: profile.promptProfileHash,
        toolPolicyHash: profile.toolPolicyHash,
        model: profile.model.canonicalRef,
        providerCapability: profile.providerCapability.capabilityId,
      })),
    };
    const generation: RuntimeGeneration = {
      artifactKind: "openclaw.runtime_generation",
      schemaVersion: "openclaw.runtime-generation.v1",
      id: `runtime-generation:${sha256Json(generationMaterial).slice(0, 32)}`,
      status: "ready",
      createdAt: (input.now ?? (() => new Date()))().toISOString(),
      config,
      configPath: resolveConfigPath(),
      configSnapshotId,
      catalogSnapshotId,
      profiles,
      primaryRoots: {
        canonicalSourceRoot: primaryRoots.canonicalSourceRoot,
        runtimeWorkspaceDir: primaryRoots.runtimeWorkspaceDir,
        transcriptRoot: primaryRoots.transcriptRoot,
        artifactRoot: primaryRoots.artifactRoot,
      },
      diagnostics: {
        runtimeUid: typeof process.getuid === "function" ? process.getuid() : null,
        runtimeGid: typeof process.getgid === "function" ? process.getgid() : null,
        agentCount: profiles.size,
        providerRuntimeCount: profiles.size,
        reasonCodes: [
          "runtime_generation_built",
          "runtime_generation_owns_config_roots_models_providers_prompts_tools",
          "runtime_generation_ready",
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        secretsStored: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      secretsStored: false,
    };
    return new OpenClawAgentRuntime({ config, generation });
  }

  private static async buildAgentProfile(input: {
    config: OpenClawConfig;
    agentId: string;
    registryEntries: AgentPackRegistryEntry[];
    catalogRuntime: AdmittedModelCatalogRuntime;
    modelCatalog: AdmittedModelCatalogService;
  }): Promise<RuntimeGenerationAgentProfile> {
    const { config, agentId } = input;
    const agentConfig = resolveAgentConfig(config, agentId);
    const rawAgentConfig = listAgentEntries(config).find((entry) => entry.id === agentId);
    const modelRef = resolveAgentEffectiveModelPrimary(config, agentId);
    const parsedModel = modelRef ? parseModelRef(modelRef, DEFAULT_PROVIDER) : null;
    if (!parsedModel) {
      throw new Error(`runtime generation failed: agent ${agentId} has no resolvable model`);
    }
    const agentDir = resolveAgentDir(config, agentId);
    const authStorage = discoverAuthStorage(agentDir, {
      syncExternalCli: false,
    });
    const roots = resolveRuntimeAgentWorkspaceRoots({ config, agentId });
    const registryEntry = findAgentPackRegistryEntry({
      entries: input.registryEntries,
      agentId,
    });
    const toolPolicy = boundedToolPolicy(registryEntry?.requiredTools);
    const parentToolNames = uniqueNonEmpty([
      ...(registryEntry?.requiredTools ?? []),
      "node_finish",
    ]);
    const promptProfile = agentId;
    const thinking = isGatewayThinkingLevel(agentConfig?.thinkingDefault)
      ? agentConfig.thinkingDefault
      : isGatewayThinkingLevel(config.agents?.defaults?.thinkingDefault)
        ? config.agents?.defaults?.thinkingDefault
        : null;
    const reasoning = isReasoningLevel(agentConfig?.reasoningDefault)
      ? agentConfig.reasoningDefault
      : null;
    const requestedRef = `${parsedModel.provider}/${parsedModel.model}`;
    const params = mergeParams(
      config.agents?.defaults?.params,
      modelParamEntry({ config, requestedRef }),
      rawAgentConfig?.params,
    );
    const catalogSnapshotId = `runtime-catalog-agent:${sha256Json({
      provider: parsedModel.provider,
      model: parsedModel.model,
      agentId,
      params,
      catalogMaterialHash: input.catalogRuntime.catalogMaterialHash,
    }).slice(0, 32)}`;
    const admittedModel = await input.modelCatalog.resolve({
      config: input.catalogRuntime.config,
      agentDir,
      workspaceDir: roots.runtimeWorkspaceDir,
      provider: parsedModel.provider,
      modelId: parsedModel.model,
      authStorage,
      modelRegistry: input.catalogRuntime.modelRegistry,
      modelRegistryAuthority: "admitted_catalog",
      requestParams: params,
      thinkingLevel: thinking,
      catalogSnapshotId,
      allowDynamicLookup: false,
    });
    const fullParams = mergeParams(
      params,
      modelParamEntry({
        config,
        requestedRef,
        canonicalRef: admittedModel.canonicalRef,
      }),
    );
    const model =
      Object.keys(fullParams).length === Object.keys(params).length
        ? admittedModel
        : await input.modelCatalog.resolve({
            config: input.catalogRuntime.config,
            agentDir,
            workspaceDir: roots.runtimeWorkspaceDir,
            provider: parsedModel.provider,
            modelId: parsedModel.model,
            authStorage,
            modelRegistry: input.catalogRuntime.modelRegistry,
            modelRegistryAuthority: "admitted_catalog",
            requestParams: fullParams,
            thinkingLevel: thinking,
            catalogSnapshotId,
            allowDynamicLookup: false,
          });
    const credentialSourceClass =
      model.provider === "codex" ? "codex_app_server" : "runtime_auth_storage";
    const providerCapability = await createAgentRuntimeProviderCapability({
      provider: model.provider,
      model: model.modelId,
      runtimeModel: model.runtimeModel,
      catalogSnapshotId,
      authContext: {
        credentialSourceClass,
        syntheticAuthAvailable: model.provider === "codex",
      },
      runtimeRoots: {
        canonicalSourceRoot: roots.canonicalSourceRoot,
        runtimeWorkspaceDir: roots.runtimeWorkspaceDir,
        transcriptRoot: roots.transcriptRoot,
        artifactRoot: roots.artifactRoot,
      },
      toolPolicy,
      promptProfile,
      config,
    });
    return {
      agentId,
      agentDir,
      promptProfile,
      promptProfileHash: sha256Json({ promptProfile, agentId }),
      toolPolicy,
      toolPolicyHash: sha256Json(toolPolicy),
      roots: {
        canonicalSourceRoot: roots.canonicalSourceRoot,
        runtimeWorkspaceDir: roots.runtimeWorkspaceDir,
        transcriptRoot: roots.transcriptRoot,
        artifactRoot: roots.artifactRoot,
      },
      authStorage,
      modelRegistry: createAdmittedModelRegistryFromModels({
        authStorage,
        models: [model.runtimeModel],
      }),
      model,
      admittedRuntimeModel: model.runtimeModel,
      providerCapability,
      allowedChildAgentIds: nodeAgentAllowedChildAgentIdsFromRegistryEntry(registryEntry),
      parentToolNames,
      thinkingLevel: thinking,
      reasoningLevel: reasoning,
    };
  }

  status(): RuntimeGenerationStatus {
    const profiles = [...this.options.generation.profiles.values()];
    return {
      artifactKind: "openclaw.runtime_generation.status",
      schemaVersion: "openclaw.runtime-generation.status.v1",
      accepted: true,
      status: "ready",
      runtimeGenerationId: this.options.generation.id,
      configPath: this.options.generation.configPath,
      configSnapshotId: this.options.generation.configSnapshotId,
      catalogSnapshotId: this.options.generation.catalogSnapshotId,
      runtimeRoots: this.options.generation.primaryRoots,
      agentChecks: profiles.map((profile) => ({
        agentId: profile.agentId,
        ok: true,
        requestedRef: profile.model.requestedRef,
        canonicalRef: profile.model.canonicalRef,
        provider: profile.model.provider,
        modelId: profile.model.modelId,
        providerCapabilityId: profile.providerCapability.capabilityId,
        providerCapabilityTransportKind: profile.providerCapability.transportKind,
        promptProfileHash: profile.promptProfileHash,
        toolPolicyHash: profile.toolPolicyHash,
        rawPromptStored: false,
        rawResponseStored: false,
      })),
      reasonCodes: [...this.options.generation.diagnostics.reasonCodes],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      secretsStored: false,
    };
  }

  generationId(): string {
    return this.options.generation.id;
  }

  config(): OpenClawConfig {
    return this.options.config;
  }

  generation(): RuntimeGeneration {
    return this.options.generation;
  }

  profile(agentId: string): RuntimeGenerationAgentProfile {
    const profile = this.options.generation.profiles.get(agentId);
    if (!profile) {
      throw new Error(
        `runtime generation ${this.options.generation.id} has no agent profile ${agentId}`,
      );
    }
    return profile;
  }

  acceptNativeExecutionSession(input: AcceptNativeExecutionInput): OpenClawAcceptedAgentRun {
    const request = normalizeStartExecutionSessionVisibleInput(input.request);
    const agentId = input.runtime?.agentProfile?.trim() || "execution-orchestrator";
    const profile = this.profile(agentId);
    const parentSessionId = input.runtime?.parentSessionId?.trim() || null;
    const childRelation = relationOrNull(input.runtime?.childRelation);
    const requestHash = sha256Json({
      runtimeGenerationId: this.options.generation.id,
      objective: request.objective,
      refs: request.refs,
      constraints: request.constraints,
      validationSignal: request.validationSignal,
      parentRuntimeJobId: input.runtime?.parentRuntimeJobId ?? null,
      parentSessionId,
      childRelation,
      agentId,
    });
    const sessionId = input.runtime?.sessionId?.trim() || sessionSlugFromHash(requestHash);
    const taskMessage = buildNativeExecutionTaskMessage({
      sessionId,
      agentProfile: agentId,
      request,
    });
    const envelope = input.envelope ?? (parentSessionId ? "child_agent" : "runtime_job");
    const policyRef = input.policyRef ?? null;
    const runRequest = buildAgentRunRequest({
      profile,
      sessionId,
      taskPrompt: taskMessage.text,
      runtimeGenerationId: this.options.generation.id,
      configSnapshotId: this.options.generation.configSnapshotId,
      catalogSnapshotId: this.options.generation.catalogSnapshotId,
      envelope,
      policyRef,
      metadata: {
        parentSessionId,
        childRelation,
      },
    });
    const envelopeIdempotencyScope =
      input.runtime?.idempotencyScope ?? "openclaw.accepted_agent_run";
    const envelopeIdempotencyKey =
      input.runtime?.idempotencyKey ?? `native-execution:${requestHash}`;
    return {
      artifactKind: "openclaw.accepted_agent_run",
      schemaVersion: "openclaw.accepted-agent-run.v1",
      runtimeGenerationId: this.options.generation.id,
      agentId,
      envelope,
      policyRef,
      sessionId,
      parentSessionId,
      childRelation,
      request,
      taskMessage,
      runRequest,
      idempotencyScope: envelopeIdempotencyScope,
      idempotencyKey: `${envelopeIdempotencyKey}:runtime-generation:${this.options.generation.id}`,
      metadata: {
        configSnapshotId: this.options.generation.configSnapshotId,
        catalogSnapshotId: this.options.generation.catalogSnapshotId,
        promptProfileHash: profile.promptProfileHash,
        toolPolicyHash: profile.toolPolicyHash,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      secretsStored: false,
    };
  }

  private buildAcceptedTurn(input: {
    accepted: OpenClawAcceptedAgentRun;
    runtimeJobId: string;
    executionClass?: AgentTurnExecutionClass;
    abortSignal?: AbortSignal;
    nativeRuntimeTools: AgentTurnEnvelopePolicy["nativeRuntimeTools"];
    nativeExecutionSession: AgentTurnEnvelopePolicy["nativeExecutionSession"];
    onAgentEvent: AgentTurnEnvelopePolicy["onAgentEvent"];
    onRuntimeEvent?: AgentTurnEnvelopePolicy["onRuntimeEvent"];
    nodeAgentNativeTaskMode?: AgentTurnEnvelopePolicy["nodeAgentNativeTaskMode"];
  }) {
    if (input.accepted.runtimeGenerationId !== this.options.generation.id) {
      throw new Error(
        `runtime generation mismatch: job references ${input.accepted.runtimeGenerationId}, resident runtime is ${this.options.generation.id}`,
      );
    }
    return {
      generation: this.options.generation,
      acceptedRun: {
        ...input.accepted,
        runRequest: {
          ...input.accepted.runRequest,
          abortSignal: input.abortSignal,
        },
      },
      envelope: {
        kind: input.accepted.envelope,
        runtimeJobId: input.runtimeJobId,
        executionClass: input.executionClass ?? "native_runtime_job",
        nativeRuntimeTools: input.nativeRuntimeTools,
        nativeExecutionSession: input.nativeExecutionSession,
        onAgentEvent: input.onAgentEvent,
        onRuntimeEvent: input.onRuntimeEvent,
        ...(input.nodeAgentNativeTaskMode
          ? { nodeAgentNativeTaskMode: input.nodeAgentNativeTaskMode }
          : {}),
      },
      abortSignal: input.abortSignal,
    };
  }

  async runAcceptedNativeExecution(input: {
    accepted: OpenClawAcceptedAgentRun;
    runtimeJobId: string;
    executionClass?: AgentTurnExecutionClass;
    abortSignal?: AbortSignal;
    nativeRuntimeTools: AgentTurnEnvelopePolicy["nativeRuntimeTools"];
    nativeExecutionSession: AgentTurnEnvelopePolicy["nativeExecutionSession"];
    onAgentEvent: AgentTurnEnvelopePolicy["onAgentEvent"];
    onExecutorEvent?: AgentTurnEnvelopePolicy["onRuntimeEvent"];
    nodeAgentNativeTaskMode?: AgentTurnEnvelopePolicy["nodeAgentNativeTaskMode"];
  }): Promise<EmbeddedPiRunResult> {
    const turn = this.buildAcceptedTurn({
      ...input,
      onRuntimeEvent: input.onExecutorEvent,
    });
    return await new DefaultAgentRuntimeCore().run({ turn });
  }
}
