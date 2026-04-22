import type { OpenClawConfig } from "../config/config.js";

type HookProbeInput = {
  hookName: string;
  triggerSurface: string;
  payload?: unknown;
  context?: unknown;
  config?: OpenClawConfig;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function readHookProbeConfig(config?: OpenClawConfig): Record<string, unknown> {
  const entryConfig = config?.plugins?.entries?.["model-memory"]?.config;
  if (!isRecord(entryConfig)) {
    return {};
  }
  const hookProbe = entryConfig.hookProbe;
  return isRecord(hookProbe) ? hookProbe : {};
}

export function shouldAttemptModelMemoryHookProbe(config?: OpenClawConfig): boolean {
  const envEnabled = readBoolean(process.env.MODEL_MEMORY_HOOK_PROBE_ENABLED);
  if (envEnabled !== undefined) {
    return envEnabled;
  }
  return readBoolean(readHookProbeConfig(config).enabled) ?? false;
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
