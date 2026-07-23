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

const RETIRED_ADMISSION_KEYS = [
  "episodeBudgets",
  "researcherAgentId",
  "researchPriceAuthority",
] as const;

function hasRetiredAdmissionConfig(value: unknown): boolean {
  const record = asRecord(value) ?? {};
  return RETIRED_ADMISSION_KEYS.some((key) => Object.hasOwn(record, key));
}

export const legacyConfigRules: LegacyConfigRule[] = [
  {
    path: ["plugins", "entries", "x-intelligence", "config"],
    message:
      'X research admission config is retired; native agent tool policy and task lifecycle own execution. Run "openclaw doctor --fix".',
    match: hasRetiredAdmissionConfig,
  },
];

export function normalizeCompatibilityConfig({ cfg }: { cfg: OpenClawConfig }): {
  config: OpenClawConfig;
  changes: string[];
} {
  const entry = asRecord(cfg.plugins?.entries?.["x-intelligence"]);
  const pluginConfig = asRecord(entry?.config);
  if (!pluginConfig || !hasRetiredAdmissionConfig(pluginConfig)) {
    return { config: cfg, changes: [] };
  }

  const nextConfig = structuredClone(cfg);
  const nextEntry = asRecord(nextConfig.plugins?.entries?.["x-intelligence"]);
  const nextPluginConfig = asRecord(nextEntry?.config);
  if (!nextPluginConfig) {
    return { config: cfg, changes: [] };
  }
  for (const key of RETIRED_ADMISSION_KEYS) {
    delete nextPluginConfig[key];
  }
  return {
    config: nextConfig,
    changes: ["Removed retired X research admission and budget configuration."],
  };
}
