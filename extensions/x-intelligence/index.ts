import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createXComplianceRefreshService } from "./src/compliance-refresh.js";
import {
  createConfiguredXReadTransport,
  createXIntelligenceTools,
  getXIntelligenceRuntime,
  type XIntelligencePluginConfig,
} from "./src/tools.js";

const TOOL_NAMES = ["x_posts", "x_counts", "x_users", "x_timelines", "x_trends", "x_metrics"];

export default definePluginEntry({
  id: "x-intelligence",
  name: "X Intelligence",
  description: "Read-only official X source operations with compliance-aware evidence.",
  register(api) {
    const config = (api.pluginConfig ?? {}) as XIntelligencePluginConfig;
    if (config.enabled === false) {
      return;
    }
    if (config.complianceRefresh?.enabled === true) {
      api.registerService(
        createXComplianceRefreshService({
          getCache: async (stateDir) => {
            const runtime = getXIntelligenceRuntime(api, config, stateDir);
            await runtime.hydrate;
            return runtime.cache;
          },
          createTransport: () => createConfiguredXReadTransport(config),
          intervalMs: (config.complianceRefresh.intervalMinutes ?? 360) * 60_000,
          maxIdsPerPass: config.complianceRefresh.maxIdsPerPass ?? 100,
        }),
      );
    }
    api.registerTool((ctx) => createXIntelligenceTools({ api, config, ctx }), {
      names: TOOL_NAMES,
      optional: true,
    });
  },
});
