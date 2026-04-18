import {
  resolveModelMemoryLiveRuntimeStatus,
  warmModelMemoryLiveRuntime,
} from "../agents/model-memory.live-runtime.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";

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
}
