// Resolves native compaction defaults with an optional per-agent override.
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveAgentConfig } from "./agent-scope.js";

type CompactionConfig = NonNullable<
  NonNullable<OpenClawConfig["agents"]>["defaults"]
>["compaction"];

function mergeCompactionConfig(
  defaults: CompactionConfig,
  override: CompactionConfig,
): CompactionConfig {
  if (!override) {
    return defaults;
  }
  return {
    ...defaults,
    ...override,
    qualityGuard:
      defaults?.qualityGuard || override.qualityGuard
        ? { ...defaults?.qualityGuard, ...override.qualityGuard }
        : undefined,
    midTurnPrecheck:
      defaults?.midTurnPrecheck || override.midTurnPrecheck
        ? { ...defaults?.midTurnPrecheck, ...override.midTurnPrecheck }
        : undefined,
    memoryFlush:
      defaults?.memoryFlush || override.memoryFlush
        ? { ...defaults?.memoryFlush, ...override.memoryFlush }
        : undefined,
  };
}

/** Return a config view whose defaults contain the active agent's compaction policy. */
export function resolveAgentCompactionRuntimeConfig(params: {
  cfg: OpenClawConfig;
  agentId?: string;
}): OpenClawConfig {
  const agentCompaction = params.agentId
    ? resolveAgentConfig(params.cfg, params.agentId)?.compaction
    : undefined;
  if (!agentCompaction) {
    return params.cfg;
  }
  const agents = params.cfg.agents ?? {};
  const defaults = agents.defaults ?? {};
  return {
    ...params.cfg,
    agents: {
      ...agents,
      defaults: {
        ...defaults,
        compaction: mergeCompactionConfig(defaults.compaction, agentCompaction),
      },
    },
  };
}

/** Resolve the active agent's compaction config and effective summary instructions together. */
export function resolveAgentCompactionRuntimePolicy(params: {
  cfg: OpenClawConfig;
  agentId?: string;
  customInstructions?: string;
}): {
  config: OpenClawConfig;
  customInstructions?: string;
} {
  const config = resolveAgentCompactionRuntimeConfig(params);
  const explicitInstructions = params.customInstructions?.trim();
  const configuredInstructions = config.agents?.defaults?.compaction?.customInstructions?.trim();
  return {
    config,
    customInstructions: explicitInstructions || configuredInstructions || undefined,
  };
}
