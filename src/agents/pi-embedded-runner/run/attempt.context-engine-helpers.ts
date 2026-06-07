import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import {
  buildSessionWorkingContextPromptAddition,
  readSessionWorkingContext,
} from "../../../config/sessions/working-context.js";
import type { MemoryCitationsMode } from "../../../config/types.memory.js";
import type { ContextEngine, ContextEngineRuntimeContext } from "../../../context-engine/types.js";
import { recordModelMemoryCaptureSeamEvidence } from "../../model-memory.capture-seams.js";
import { recordModelMemoryProductionHookProbe } from "../../model-memory.hook-probe.js";
import type { NormalizedUsage } from "../../usage.js";
import type { PromptCacheChange } from "../prompt-cache-observability.js";
import type { EmbeddedRunAttemptResult } from "./types.js";

const CONTEXT_INGEST_PRODUCTION_PROBE_ENV = "MODEL_MEMORY_CONTEXT_INGEST_PRODUCTION_PROBE_ENABLED";

export type AttemptContextEngine = ContextEngine;

export type AttemptBootstrapContext = {
  bootstrapFiles: unknown[];
  contextFiles: unknown[];
};

export async function resolveAttemptBootstrapContext<
  TContext extends AttemptBootstrapContext,
>(params: {
  contextInjectionMode: "always" | "continuation-skip";
  bootstrapContextMode?: string;
  bootstrapContextRunKind?: string;
  sessionFile: string;
  hasCompletedBootstrapTurn: (sessionFile: string) => Promise<boolean>;
  resolveBootstrapContextForRun: () => Promise<TContext>;
}): Promise<
  TContext & {
    isContinuationTurn: boolean;
    shouldRecordCompletedBootstrapTurn: boolean;
  }
> {
  const isContinuationTurn =
    params.contextInjectionMode === "continuation-skip" &&
    params.bootstrapContextRunKind !== "heartbeat" &&
    (await params.hasCompletedBootstrapTurn(params.sessionFile));
  const shouldRecordCompletedBootstrapTurn =
    !isContinuationTurn &&
    params.bootstrapContextMode !== "lightweight" &&
    params.bootstrapContextRunKind !== "heartbeat";

  const context = isContinuationTurn
    ? ({ bootstrapFiles: [], contextFiles: [] } as unknown as TContext)
    : await params.resolveBootstrapContextForRun();

  return {
    ...context,
    isContinuationTurn,
    shouldRecordCompletedBootstrapTurn,
  };
}

export function buildContextEnginePromptCacheInfo(params: {
  retention?: "none" | "short" | "long";
  lastCallUsage?: NormalizedUsage;
  observation?:
    | {
        broke: boolean;
        previousCacheRead?: number;
        cacheRead?: number;
        changes?: PromptCacheChange[] | null;
      }
    | undefined;
  lastCacheTouchAt?: number | null;
}): EmbeddedRunAttemptResult["promptCache"] {
  const promptCache: NonNullable<EmbeddedRunAttemptResult["promptCache"]> = {};
  if (params.retention) {
    promptCache.retention = params.retention;
  }
  if (params.lastCallUsage) {
    promptCache.lastCallUsage = { ...params.lastCallUsage };
  }
  if (params.observation) {
    promptCache.observation = {
      broke: params.observation.broke,
      ...(typeof params.observation.previousCacheRead === "number"
        ? { previousCacheRead: params.observation.previousCacheRead }
        : {}),
      ...(typeof params.observation.cacheRead === "number"
        ? { cacheRead: params.observation.cacheRead }
        : {}),
      ...(params.observation.changes && params.observation.changes.length > 0
        ? {
            changes: params.observation.changes.map((change) => ({
              code: change.code,
              detail: change.detail,
            })),
          }
        : {}),
    };
  }
  if (typeof params.lastCacheTouchAt === "number" && Number.isFinite(params.lastCacheTouchAt)) {
    promptCache.lastCacheTouchAt = params.lastCacheTouchAt;
  }
  return Object.keys(promptCache).length > 0 ? promptCache : undefined;
}

export function findCurrentAttemptAssistantMessage(params: {
  messagesSnapshot: AgentMessage[];
  prePromptMessageCount: number;
}): AssistantMessage | undefined {
  return params.messagesSnapshot
    .slice(Math.max(0, params.prePromptMessageCount))
    .toReversed()
    .find((message): message is AssistantMessage => message.role === "assistant");
}

function envFlagEnabled(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function shouldRunContextIngestProductionProbe(contextEngine: AttemptContextEngine): boolean {
  return envFlagEnabled(CONTEXT_INGEST_PRODUCTION_PROBE_ENV) && contextEngine.info.id === "legacy";
}

async function runContextIngestProductionProbe(params: {
  contextEngine: AttemptContextEngine;
  sessionId: string;
  sessionKey?: string;
  messages: AgentMessage[];
  warn: (message: string) => void;
}): Promise<void> {
  if (
    !shouldRunContextIngestProductionProbe(params.contextEngine) ||
    params.messages.length === 0
  ) {
    return;
  }

  if (typeof params.contextEngine.ingestBatch === "function") {
    try {
      await params.contextEngine.ingestBatch({
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        messages: params.messages,
      });
      await Promise.allSettled([
        recordModelMemoryProductionHookProbe({
          hookName: "ContextEngine.ingestBatch",
          triggerSurface: "pi_embedded_runner.context_engine.ingest_batch.production_probe",
          payload: {
            messageCount: params.messages.length,
            engineId: params.contextEngine.info.id,
          },
          context: {
            sessionId: params.sessionId,
            sessionKey: params.sessionKey,
          },
        }),
        recordModelMemoryCaptureSeamEvidence({
          seamName: "ContextEngine.ingestBatch",
          triggerSurface: "pi_embedded_runner.context_engine.ingest_batch.production_probe",
          payload: {
            messageCount: params.messages.length,
            engineId: params.contextEngine.info.id,
          },
          context: {
            sessionId: params.sessionId,
            sessionKey: params.sessionKey,
          },
        }),
      ]);
    } catch (error) {
      params.warn(`context engine ingestBatch production probe failed: ${String(error)}`);
    }
  }

  for (const message of params.messages) {
    try {
      await params.contextEngine.ingest({
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        message,
      });
      await Promise.allSettled([
        recordModelMemoryProductionHookProbe({
          hookName: "ContextEngine.ingest",
          triggerSurface: "pi_embedded_runner.context_engine.ingest.production_probe",
          payload: {
            messageRole: message.role,
            engineId: params.contextEngine.info.id,
          },
          context: {
            sessionId: params.sessionId,
            sessionKey: params.sessionKey,
          },
        }),
        recordModelMemoryCaptureSeamEvidence({
          seamName: "ContextEngine.ingest",
          triggerSurface: "pi_embedded_runner.context_engine.ingest.production_probe",
          payload: {
            messageRole: message.role,
            engineId: params.contextEngine.info.id,
          },
          context: {
            sessionId: params.sessionId,
            sessionKey: params.sessionKey,
          },
        }),
      ]);
    } catch (error) {
      params.warn(`context engine ingest production probe failed: ${String(error)}`);
    }
  }
}

export async function runAttemptContextEngineBootstrap(params: {
  hadSessionFile: boolean;
  contextEngine?: AttemptContextEngine;
  sessionId: string;
  sessionKey?: string;
  sessionFile: string;
  sessionManager: unknown;
  runtimeContext?: ContextEngineRuntimeContext;
  runMaintenance: (params: {
    contextEngine?: unknown;
    sessionId: string;
    sessionKey?: string;
    sessionFile: string;
    reason: "bootstrap";
    sessionManager: unknown;
    runtimeContext?: ContextEngineRuntimeContext;
  }) => Promise<unknown>;
  warn: (message: string) => void;
}) {
  if (
    !params.hadSessionFile ||
    !(params.contextEngine?.bootstrap || params.contextEngine?.maintain)
  ) {
    return;
  }
  try {
    if (typeof params.contextEngine?.bootstrap === "function") {
      await params.contextEngine.bootstrap({
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        sessionFile: params.sessionFile,
      });
    }
    await params.runMaintenance({
      contextEngine: params.contextEngine,
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      sessionFile: params.sessionFile,
      reason: "bootstrap",
      sessionManager: params.sessionManager,
      runtimeContext: params.runtimeContext,
    });
  } catch (bootstrapErr) {
    params.warn(`context engine bootstrap failed: ${String(bootstrapErr)}`);
  }
}

export async function assembleAttemptContextEngine(params: {
  contextEngine?: AttemptContextEngine;
  sessionId: string;
  sessionKey?: string;
  sessionStorePath?: string;
  messages: AgentMessage[];
  tokenBudget?: number;
  availableTools?: Set<string>;
  citationsMode?: MemoryCitationsMode;
  modelId: string;
  prompt?: string;
}) {
  if (!params.contextEngine) {
    return undefined;
  }
  const assembleParams = {
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    messages: params.messages,
    tokenBudget: params.tokenBudget,
    ...(params.availableTools ? { availableTools: params.availableTools } : {}),
    ...(params.citationsMode ? { citationsMode: params.citationsMode } : {}),
    model: params.modelId,
    ...(params.prompt !== undefined ? { prompt: params.prompt } : {}),
  };
  const result = await params.contextEngine.assemble(assembleParams);
  const workingContextPromptAddition = buildAttemptWorkingContextPromptAddition({
    sessionKey: params.sessionKey,
    sessionStorePath: params.sessionStorePath,
  });
  const systemPromptAddition = [result.systemPromptAddition, workingContextPromptAddition]
    .map((entry) => entry?.trim())
    .filter((entry): entry is string => Boolean(entry))
    .join("\n\n");
  void recordModelMemoryProductionHookProbe({
    hookName: "ContextEngine.assemble",
    triggerSurface: "pi_embedded_runner.context_engine.assemble",
    payload: assembleParams,
    context: {
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      modelId: params.modelId,
    },
  }).catch(() => undefined);
  void recordModelMemoryCaptureSeamEvidence({
    seamName: "ContextEngine.assemble",
    triggerSurface: "pi_embedded_runner.context_engine.assemble",
    payload: {
      sessionId: params.sessionId,
      messageCount: params.messages.length,
      tokenBudget: params.tokenBudget,
      availableToolCount: params.availableTools?.size,
      citationsMode: params.citationsMode,
      model: params.modelId,
    },
    context: {
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      modelId: params.modelId,
    },
  }).catch(() => undefined);
  return systemPromptAddition
    ? {
        ...result,
        systemPromptAddition,
      }
    : result;
}

export function buildAttemptWorkingContextPromptAddition(params: {
  sessionKey?: string;
  sessionStorePath?: string;
  maxChars?: number;
}): string | undefined {
  const sessionKey = params.sessionKey?.trim();
  const sessionStorePath = params.sessionStorePath?.trim();
  if (!sessionKey || !sessionStorePath) {
    return undefined;
  }
  const workingContext = readSessionWorkingContext({
    storePath: sessionStorePath,
    sessionKey,
  });
  return buildSessionWorkingContextPromptAddition(workingContext, { maxChars: params.maxChars });
}

export async function finalizeAttemptContextEngineTurn(params: {
  contextEngine?: AttemptContextEngine;
  promptError: boolean;
  aborted: boolean;
  yieldAborted: boolean;
  sessionIdUsed: string;
  sessionKey?: string;
  sessionFile: string;
  messagesSnapshot: AgentMessage[];
  prePromptMessageCount: number;
  tokenBudget?: number;
  runtimeContext?: ContextEngineRuntimeContext;
  runMaintenance: (params: {
    contextEngine?: unknown;
    sessionId: string;
    sessionKey?: string;
    sessionFile: string;
    reason: "turn";
    sessionManager: unknown;
    runtimeContext?: ContextEngineRuntimeContext;
  }) => Promise<unknown>;
  sessionManager: unknown;
  warn: (message: string) => void;
}) {
  if (!params.contextEngine) {
    return { postTurnFinalizationSucceeded: true };
  }

  let postTurnFinalizationSucceeded = true;

  if (typeof params.contextEngine.afterTurn === "function") {
    try {
      await params.contextEngine.afterTurn({
        sessionId: params.sessionIdUsed,
        sessionKey: params.sessionKey,
        sessionFile: params.sessionFile,
        messages: params.messagesSnapshot,
        prePromptMessageCount: params.prePromptMessageCount,
        tokenBudget: params.tokenBudget,
        runtimeContext: params.runtimeContext,
      });
      void recordModelMemoryProductionHookProbe({
        hookName: "ContextEngine.afterTurn",
        triggerSurface: "pi_embedded_runner.context_engine.after_turn",
        payload: {
          sessionFile: params.sessionFile,
          messageCount: params.messagesSnapshot.length,
          prePromptMessageCount: params.prePromptMessageCount,
          tokenBudget: params.tokenBudget,
          runtimeContext: params.runtimeContext,
        },
        context: {
          sessionId: params.sessionIdUsed,
          sessionKey: params.sessionKey,
        },
      }).catch(() => undefined);
      void recordModelMemoryCaptureSeamEvidence({
        seamName: "ContextEngine.afterTurn",
        triggerSurface: "pi_embedded_runner.context_engine.after_turn",
        payload: {
          sessionFile: params.sessionFile,
          messageCount: params.messagesSnapshot.length,
          prePromptMessageCount: params.prePromptMessageCount,
          tokenBudget: params.tokenBudget,
          runtimeContext: params.runtimeContext,
        },
        context: {
          sessionId: params.sessionIdUsed,
          sessionKey: params.sessionKey,
        },
      }).catch(() => undefined);
      await runContextIngestProductionProbe({
        contextEngine: params.contextEngine,
        sessionId: params.sessionIdUsed,
        sessionKey: params.sessionKey,
        messages: params.messagesSnapshot.slice(params.prePromptMessageCount),
        warn: params.warn,
      });
    } catch (afterTurnErr) {
      postTurnFinalizationSucceeded = false;
      params.warn(`context engine afterTurn failed: ${String(afterTurnErr)}`);
    }
  } else {
    const newMessages = params.messagesSnapshot.slice(params.prePromptMessageCount);
    if (newMessages.length > 0) {
      if (typeof params.contextEngine.ingestBatch === "function") {
        try {
          await params.contextEngine.ingestBatch({
            sessionId: params.sessionIdUsed,
            sessionKey: params.sessionKey,
            messages: newMessages,
          });
          void recordModelMemoryProductionHookProbe({
            hookName: "ContextEngine.ingestBatch",
            triggerSurface: "pi_embedded_runner.context_engine.ingest_batch",
            payload: {
              messageCount: newMessages.length,
              messages: newMessages,
            },
            context: {
              sessionId: params.sessionIdUsed,
              sessionKey: params.sessionKey,
            },
          }).catch(() => undefined);
        } catch (ingestErr) {
          postTurnFinalizationSucceeded = false;
          params.warn(`context engine ingest failed: ${String(ingestErr)}`);
        }
      } else {
        for (const msg of newMessages) {
          try {
            await params.contextEngine.ingest?.({
              sessionId: params.sessionIdUsed,
              sessionKey: params.sessionKey,
              message: msg,
            });
            void recordModelMemoryProductionHookProbe({
              hookName: "ContextEngine.ingest",
              triggerSurface: "pi_embedded_runner.context_engine.ingest",
              payload: { message: msg },
              context: {
                sessionId: params.sessionIdUsed,
                sessionKey: params.sessionKey,
              },
            }).catch(() => undefined);
          } catch (ingestErr) {
            postTurnFinalizationSucceeded = false;
            params.warn(`context engine ingest failed: ${String(ingestErr)}`);
          }
        }
      }
    }
  }

  if (
    !params.promptError &&
    !params.aborted &&
    !params.yieldAborted &&
    postTurnFinalizationSucceeded
  ) {
    await params.runMaintenance({
      contextEngine: params.contextEngine,
      sessionId: params.sessionIdUsed,
      sessionKey: params.sessionKey,
      sessionFile: params.sessionFile,
      reason: "turn",
      sessionManager: params.sessionManager,
      runtimeContext: params.runtimeContext,
    });
  }

  return { postTurnFinalizationSucceeded };
}
