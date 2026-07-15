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
