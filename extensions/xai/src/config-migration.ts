// XAI config migrations keep shipped plugin config compatible across updates.
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { asOptionalRecord as readRecord } from "openclaw/plugin-sdk/string-coerce-runtime";

/**
 * Remove the retired per-tool timeout. X search follows native task
 * cancellation and the shared provider transport policy.
 */
export function migrateRetiredXSearchTimeout(config: OpenClawConfig): {
  config: OpenClawConfig;
  changes: string[];
} | null {
  const plugins = readRecord(config.plugins);
  const entries = readRecord(plugins?.entries);
  const xaiEntry = readRecord(entries?.xai);
  const xaiConfig = readRecord(xaiEntry?.config);
  const xSearch = readRecord(xaiConfig?.xSearch);
  if (!xSearch || !Object.hasOwn(xSearch, "timeoutSeconds")) {
    return null;
  }

  const nextPlugins = structuredClone(plugins ?? {});
  const nextEntries = readRecord(nextPlugins.entries) ?? {};
  const nextEntry = readRecord(nextEntries.xai) ?? {};
  const nextConfig = readRecord(nextEntry.config) ?? {};
  const nextXSearch = readRecord(nextConfig.xSearch) ?? {};
  delete nextXSearch.timeoutSeconds;

  nextConfig.xSearch = nextXSearch;
  nextEntry.config = nextConfig;
  nextEntries.xai = nextEntry;
  nextPlugins.entries = nextEntries;

  return {
    config: {
      ...config,
      plugins: nextPlugins,
    },
    changes: [
      "removed retired plugins.entries.xai.config.xSearch.timeoutSeconds; x_search uses native cancellation and provider transport policy",
    ],
  };
}
