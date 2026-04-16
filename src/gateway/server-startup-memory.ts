import { listAgentIds } from "../agents/agent-scope.js";
import { resolveMemorySearchConfig } from "../agents/memory-search.js";
import {
  resolveModelMemoryLiveRuntimeStatus,
  warmModelMemoryLiveRuntime,
} from "../agents/model-memory.live-runtime.js";
import type { OpenClawConfig } from "../config/config.js";
import { resolveMemoryBackendConfig } from "../memory/backend-config.js";
import { getMemorySearchManager } from "../memory/index.js";

export async function startGatewayMemoryBackend(params: {
  cfg: OpenClawConfig;
  log: { info?: (msg: string) => void; warn: (msg: string) => void };
}): Promise<void> {
  const modelMemoryRuntime = resolveModelMemoryLiveRuntimeStatus(params.cfg);
  if (modelMemoryRuntime.enabled) {
    if (!modelMemoryRuntime.databaseConfigured) {
      params.log.warn(
        `model-memory live runtime is enabled but database setup failed: ${modelMemoryRuntime.databaseError ?? "unknown error"}`,
      );
      return;
    }
    try {
      const warmed = await warmModelMemoryLiveRuntime({ config: params.cfg });
      params.log.info?.(
        `model-memory live runtime armed (${warmed.memoryObjectCount} objects, ${warmed.projectionTargetCount} projection targets, db=${warmed.status.databaseName ?? "unknown"})`,
      );
    } catch (error) {
      params.log.warn(`model-memory live runtime warmup failed: ${String(error)}`);
      return;
    }
    if (
      !modelMemoryRuntime.legacyMemorySlotDisabled ||
      !modelMemoryRuntime.legacyMemorySearchDisabled
    ) {
      params.log.warn(
        'model-memory live runtime is enabled while legacy memory surfaces remain configured; keep plugins.slots.memory="none" and agents.defaults.memorySearch.enabled=false for cutover mode',
      );
    }
    return;
  }

  const agentIds = listAgentIds(params.cfg);
  for (const agentId of agentIds) {
    if (!resolveMemorySearchConfig(params.cfg, agentId)) {
      continue;
    }
    const resolved = resolveMemoryBackendConfig({ cfg: params.cfg, agentId });
    if (resolved.backend !== "qmd" || !resolved.qmd) {
      continue;
    }

    const { manager, error } = await getMemorySearchManager({ cfg: params.cfg, agentId });
    if (!manager) {
      params.log.warn(
        `qmd memory startup initialization failed for agent "${agentId}": ${error ?? "unknown error"}`,
      );
      continue;
    }
    params.log.info?.(`qmd memory startup initialization armed for agent "${agentId}"`);
  }
}
