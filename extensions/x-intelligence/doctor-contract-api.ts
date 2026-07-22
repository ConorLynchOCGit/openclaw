import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";

type LegacyConfigRule = {
  path: string[];
  message: string;
  match: (value: unknown) => boolean;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasEpisodeBudgets(value: unknown): boolean {
  return Object.hasOwn(asRecord(value) ?? {}, "episodeBudgets");
}

export const legacyConfigRules: LegacyConfigRule[] = [
  {
    path: ["plugins", "entries", "x-intelligence", "config"],
    message:
      'plugins.entries.x-intelligence.config.episodeBudgets is retired; X research uses task-wide admission. Run "openclaw doctor --fix".',
    match: hasEpisodeBudgets,
  },
];

export function normalizeCompatibilityConfig({ cfg }: { cfg: OpenClawConfig }): {
  config: OpenClawConfig;
  changes: string[];
} {
  const entry = asRecord(cfg.plugins?.entries?.["x-intelligence"]);
  const pluginConfig = asRecord(entry?.config);
  if (!pluginConfig || !hasEpisodeBudgets(pluginConfig)) {
    return { config: cfg, changes: [] };
  }

  const nextConfig = structuredClone(cfg);
  const nextEntry = asRecord(nextConfig.plugins?.entries?.["x-intelligence"]);
  const nextPluginConfig = asRecord(nextEntry?.config);
  if (!nextPluginConfig) {
    return { config: cfg, changes: [] };
  }
  delete nextPluginConfig.episodeBudgets;
  return {
    config: nextConfig,
    changes: [
      "Removed retired plugins.entries.x-intelligence.config.episodeBudgets; task-wide X research admission owns cumulative limits.",
    ],
  };
}
