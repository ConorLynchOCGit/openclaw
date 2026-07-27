// Xai API module exposes the plugin public contract.
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { migrateRetiredXSearchTimeout } from "./src/config-migration.js";
import { isRecord } from "./src/tool-config-shared.js";

export default definePluginEntry({
  id: "xai",
  name: "xAI Setup",
  description: "Lightweight xAI setup hooks",
  register(api) {
    api.registerConfigMigration((config) => migrateRetiredXSearchTimeout(config));
    api.registerAutoEnableProbe(({ config }) => {
      const pluginConfig = config.plugins?.entries?.xai?.config;
      if (
        isRecord(pluginConfig) &&
        (isRecord(pluginConfig.xSearch) || isRecord(pluginConfig.codeExecution))
      ) {
        return "xai tool configured";
      }
      return null;
    });
  },
});
