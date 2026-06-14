import { createHash } from "node:crypto";
import {
  codexAppServerStartOptionsKey,
  resolveCodexAppServerRuntimeOptions,
} from "../../extensions/codex/src/app-server/config.js";
import { listCodexAppServerModels } from "../../extensions/codex/src/app-server/models.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.js";
import type {
  AgentRuntimeProviderCapability,
  AgentRuntimeProviderTurnEvent,
  AgentRuntimeProviderTurnPhase,
} from "./openclaw-agent-runtime-contracts.js";
import type { EmbeddedRunAttemptParams } from "./pi-embedded-runner/run/types.js";

function baseEvent(params: {
  provider: string;
  model: string;
  transportKind: string;
  phase: AgentRuntimeProviderTurnPhase;
  startedAt: number;
  extra?: Partial<AgentRuntimeProviderTurnEvent>;
}): AgentRuntimeProviderTurnEvent {
  return {
    phase: params.phase,
    provider: params.provider,
    model: params.model,
    transportKind: params.transportKind,
    elapsedMs: Date.now() - params.startedAt,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    secretsStored: false,
    ...params.extra,
  };
}

const DEFAULT_CODEX_PROVIDER_CAPABILITY_TIMEOUT_MS = 5_000;

export type AgentRuntimeProviderCapabilityPrepareInput = {
  provider: string;
  model: string;
  runtimeModel: ProviderRuntimeModel;
  catalogSnapshotId: string;
  authContext: {
    credentialSourceClass: string;
    syntheticAuthAvailable: boolean;
  };
  runtimeRoots: {
    canonicalSourceRoot: string;
    runtimeWorkspaceDir: string;
    transcriptRoot: string;
    artifactRoot: string;
  };
  toolPolicy: readonly string[];
  promptProfile: string;
  config: OpenClawConfig;
  abortSignal?: AbortSignal;
};

export class AgentRuntimeProviderCapabilityNotReadyError extends Error {
  readonly code: string;
  readonly failedPhase = "provider_auth_or_transport_init";
  readonly provider: string;
  readonly model: string;
  readonly transportKind: string;
  readonly catalogSnapshotId: string;

  constructor(input: {
    provider: string;
    model: string;
    transportKind: string;
    catalogSnapshotId: string;
    errorCode: string;
    errorMessage: string;
  }) {
    super(input.errorMessage);
    this.name = "AgentRuntimeProviderCapabilityNotReadyError";
    this.code = input.errorCode;
    this.provider = input.provider;
    this.model = input.model;
    this.transportKind = input.transportKind;
    this.catalogSnapshotId = input.catalogSnapshotId;
  }
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readCodexPluginConfigFromOpenClawConfig(config: OpenClawConfig): unknown {
  const plugins = config.plugins;
  const entries = plugins && typeof plugins === "object" ? plugins.entries : undefined;
  const codexEntry =
    entries && typeof entries === "object" && !Array.isArray(entries)
      ? (entries as Record<string, unknown>).codex
      : undefined;
  return codexEntry && typeof codexEntry === "object" && !Array.isArray(codexEntry)
    ? (codexEntry as Record<string, unknown>).config
    : undefined;
}

function boundedErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
}

function classifyCodexReadinessError(error: unknown): {
  errorCode: string;
  errorMessage: string;
} {
  const message = boundedErrorMessage(error);
  if (/extract accountId from token/i.test(message)) {
    return {
      errorCode: "CODEX_ACCOUNT_TOKEN_INVALID",
      errorMessage: "Codex app-server ChatGPT auth is not usable.",
    };
  }
  if (/timed out/i.test(message)) {
    return {
      errorCode: "CODEX_APP_SERVER_READINESS_TIMEOUT",
      errorMessage: message || "Codex app-server readiness timed out.",
    };
  }
  if (/aborted/i.test(message)) {
    return {
      errorCode: "CODEX_APP_SERVER_READINESS_ABORTED",
      errorMessage: message || "Codex app-server readiness was aborted.",
    };
  }
  return {
    errorCode: "CODEX_APP_SERVER_NOT_READY",
    errorMessage: message || "Codex app-server is not ready.",
  };
}

function isCodexAppServerCapability(input: AgentRuntimeProviderCapabilityPrepareInput): boolean {
  const provider = input.provider.trim().toLowerCase();
  return (
    provider === "codex" ||
    provider === "openai-codex" ||
    input.runtimeModel.api === "openai-codex-responses"
  );
}

async function assertCodexCapabilityReady(
  input: AgentRuntimeProviderCapabilityPrepareInput,
): Promise<{ reasonCodes: string[]; transportKeyHash: string; observedModelCount: number }> {
  const pluginConfig = readCodexPluginConfigFromOpenClawConfig(input.config);
  const runtimeOptions = resolveCodexAppServerRuntimeOptions({ pluginConfig });
  const timeoutMs = Math.min(
    runtimeOptions.requestTimeoutMs || DEFAULT_CODEX_PROVIDER_CAPABILITY_TIMEOUT_MS,
    DEFAULT_CODEX_PROVIDER_CAPABILITY_TIMEOUT_MS,
  );
  const transportKeyHash = hash(codexAppServerStartOptionsKey(runtimeOptions.start)).slice(0, 24);
  if (process.env.VITEST && process.env.OPENCLAW_CODEX_PROVIDER_CAPABILITY_LIVE !== "1") {
    return {
      reasonCodes: ["provider_capability_built", "codex_app_server_readiness_skipped_in_test"],
      transportKeyHash,
      observedModelCount: 0,
    };
  }

  try {
    const listed = await listCodexAppServerModels({
      timeoutMs,
      limit: 1,
      startOptions: runtimeOptions.start,
      sharedClient: true,
    });
    return {
      reasonCodes: [
        "provider_capability_built",
        "codex_app_server_initialized",
        "codex_app_server_model_list_succeeded",
      ],
      transportKeyHash,
      observedModelCount: listed.models.length,
    };
  } catch (error) {
    const classified = classifyCodexReadinessError(error);
    throw new AgentRuntimeProviderCapabilityNotReadyError({
      provider: input.provider,
      model: input.model,
      transportKind: "codex_app_server",
      catalogSnapshotId: input.catalogSnapshotId,
      errorCode: classified.errorCode,
      errorMessage: classified.errorMessage,
    });
  }
}

export async function createAgentRuntimeProviderCapability(
  input: AgentRuntimeProviderCapabilityPrepareInput,
): Promise<AgentRuntimeProviderCapability> {
  if (isCodexAppServerCapability(input)) {
    await assertCodexCapabilityReady(input);
    return {
      artifactKind: "openclaw.runtime_generation.provider_capability",
      schemaVersion: "openclaw.runtime-generation.provider-capability.v1",
      capabilityId: "codex_app_server",
      provider: input.provider,
      model: input.model,
      transportKind: "codex_app_server",
      fallbackAllowed: false,
      runTurn: async (turnInput) => {
        const startedAt = Date.now();
        const emit = (
          phase: AgentRuntimeProviderTurnPhase,
          extra?: Partial<AgentRuntimeProviderTurnEvent>,
        ) =>
          turnInput.emit(
            baseEvent({
              provider: input.provider,
              model: input.model,
              transportKind: "codex_app_server",
              phase,
              startedAt,
              extra,
            }),
          );
        emit("provider_capability_entered");
        try {
          const { runCodexAppServerAttempt } =
            await import("../../extensions/codex/src/app-server/run-attempt.js");
          const result = await runCodexAppServerAttempt(
            turnInput.attempt as EmbeddedRunAttemptParams,
            {
              emitProviderTurnEvent: (event) =>
                emit(event.phase as AgentRuntimeProviderTurnPhase, event),
            },
          );
          emit("agent_turn_completed");
          return result;
        } catch (error) {
          emit("agent_turn_failed", {
            failedPhase: "provider_capability_entered",
            errorName: error instanceof Error ? error.name : "Error",
            errorMessage:
              error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
          });
          throw error;
        }
      },
    };
  }

  return {
    artifactKind: "openclaw.runtime_generation.provider_capability",
    schemaVersion: "openclaw.runtime-generation.provider-capability.v1",
    capabilityId: "generic_provider_runtime",
    provider: input.provider,
    model: input.model,
    transportKind: "generic_provider_runtime",
    fallbackAllowed: true,
    runTurn: async (turnInput) => {
      const startedAt = Date.now();
      turnInput.emit(
        baseEvent({
          provider: input.provider,
          model: input.model,
          transportKind: "generic_provider_runtime",
          phase: "provider_capability_entered",
          startedAt,
        }),
      );
      try {
        const { runInteractionAttempt } = await import("./interaction-attempt-runtime/attempt.js");
        const result = await runInteractionAttempt(turnInput.attempt as EmbeddedRunAttemptParams);
        turnInput.emit(
          baseEvent({
            provider: input.provider,
            model: input.model,
            transportKind: "generic_provider_runtime",
            phase: "agent_turn_completed",
            startedAt,
          }),
        );
        return result;
      } catch (error) {
        turnInput.emit(
          baseEvent({
            provider: input.provider,
            model: input.model,
            transportKind: "generic_provider_runtime",
            phase: "agent_turn_failed",
            startedAt,
            extra: {
              failedPhase: "provider_capability_entered",
              errorName: error instanceof Error ? error.name : "Error",
              errorMessage:
                error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
            },
          }),
        );
        throw error;
      }
    },
  };
}
