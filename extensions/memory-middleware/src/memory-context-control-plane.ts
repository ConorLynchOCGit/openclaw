import type { PluginLogger } from "../api.js";
import type { ActiveMemorySlot } from "./active-memory-slots.js";
import { loadActiveMemorySlots } from "./active-memory-slots.js";
import type { MemoryMiddlewareDb } from "./db/runtime.js";
import {
  renderCompiledMemoryPack,
  renderCompiledMemoryPromptContext,
} from "./memory-context-pack-rendering.js";
import { selectCompiledMemoryPackPlans } from "./memory-context-pack-selection.js";
import type { MemorySoakTelemetryPort } from "./memory-soak-telemetry.js";
export type {
  CompiledMemoryPack,
  CompiledMemoryPackKind,
  CompiledMemoryPromptContext,
} from "./memory-context-pack-model.js";
import type { CompiledMemoryPromptContext } from "./memory-context-pack-model.js";

export type MemoryContextControlPlanePort = {
  listActiveSlots(params?: {
    includeProcedures?: boolean;
    forceRefresh?: boolean;
  }): Promise<ActiveMemorySlot[]>;
  compilePromptContext(params: {
    prompt: string;
    agentId?: string;
    sessionKey?: string;
    includeProcedures?: boolean;
  }): Promise<CompiledMemoryPromptContext | null>;
};

type ActiveSlotsCache = {
  loadedAt: number;
  slots: ActiveMemorySlot[];
  includeProcedures: boolean;
};

const ACTIVE_SLOT_CACHE_TTL_MS = 30_000;

export function createMemoryContextControlPlanePort(params: {
  db: MemoryMiddlewareDb;
  logger?: PluginLogger;
  telemetry?: MemorySoakTelemetryPort;
}): MemoryContextControlPlanePort {
  let cache: ActiveSlotsCache | undefined;

  async function listActiveSlots(options?: {
    includeProcedures?: boolean;
    forceRefresh?: boolean;
  }): Promise<ActiveMemorySlot[]> {
    const includeProcedures = options?.includeProcedures === true;
    const cacheValid =
      !options?.forceRefresh &&
      cache &&
      cache.includeProcedures === includeProcedures &&
      Date.now() - cache.loadedAt <= ACTIVE_SLOT_CACHE_TTL_MS;
    if (cacheValid && cache) {
      return cache.slots;
    }

    const slots = await loadActiveMemorySlots({
      db: params.db,
      includeProcedures,
    });
    cache = {
      loadedAt: Date.now(),
      slots,
      includeProcedures,
    };
    return slots;
  }

  async function compilePromptContext(options: {
    prompt: string;
    agentId?: string;
    sessionKey?: string;
    includeProcedures?: boolean;
  }): Promise<CompiledMemoryPromptContext | null> {
    try {
      const slots = await listActiveSlots({
        includeProcedures: options.includeProcedures === true,
      });
      if (slots.length === 0) {
        return null;
      }

      const packs = selectCompiledMemoryPackPlans({
        slots,
        prompt: options.prompt,
        agentId: options.agentId,
        includeProcedures: options.includeProcedures === true,
      })
        .map((plan) => renderCompiledMemoryPack(plan))
        .filter((pack) => pack !== null);
      const result = renderCompiledMemoryPromptContext(packs);
      if (!result) {
        return null;
      }

      await params.telemetry?.record({
        schemaVersion: 1,
        recordedAt: new Date().toISOString(),
        category: "orchestration",
        action: "memory_context_pack",
        source: "memory_context_control_plane",
        sessionId: options.sessionKey,
        agentId: options.agentId,
        packCount: packs.length,
        packKinds: packs.map((pack) => pack.kind),
        attachedSlotCount: result.attachedSlotCount,
        omittedSlotCount: result.omittedSlotCount,
      });

      return result;
    } catch (error) {
      params.logger?.warn?.(
        `memory context control plane compile failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  return {
    listActiveSlots,
    compilePromptContext,
  };
}
