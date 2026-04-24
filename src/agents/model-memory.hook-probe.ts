import type { OpenClawConfig } from "../config/config.js";
import { isJsonRecord, readBooleanLike } from "./model-memory/value-readers.js";

type HookProbeInput = {
  hookName: string;
  triggerSurface: string;
  payload?: unknown;
  context?: unknown;
  config?: OpenClawConfig;
};

function readHookProbeConfig(config?: OpenClawConfig): Record<string, unknown> {
  const entryConfig = config?.plugins?.entries?.["model-memory"]?.config;
  if (!isJsonRecord(entryConfig)) {
    return {};
  }
  const hookProbe = entryConfig.hookProbe;
  return isJsonRecord(hookProbe) ? hookProbe : {};
}

export function shouldAttemptModelMemoryHookProbe(config?: OpenClawConfig): boolean {
  const envEnabled = readBooleanLike(process.env.MODEL_MEMORY_HOOK_PROBE_ENABLED);
  if (envEnabled !== undefined) {
    return envEnabled;
  }
  return readBooleanLike(readHookProbeConfig(config).enabled) ?? false;
}

export async function recordModelMemoryProductionHookProbe(input: HookProbeInput): Promise<void> {
  if (!shouldAttemptModelMemoryHookProbe(input.config)) {
    return;
  }
  try {
    const { recordProductionHookProbe } = await import("../plugin-sdk/model-memory.js");
    await recordProductionHookProbe(input);
  } catch {
    // Observer-only: probe failures must not affect production turns.
  }
}
