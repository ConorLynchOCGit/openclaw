import type { ChannelOutboundAdapter } from "../../src/channels/plugins/types.js";
import { loadBundledPluginPublicSurfaceSync } from "../../src/test-utils/bundled-plugin-public-surface.js";

export const { telegramOutbound } = loadBundledPluginPublicSurfaceSync<{
  telegramOutbound: ChannelOutboundAdapter;
}>({
  pluginId: "telegram",
  artifactBasename: "src/outbound-adapter.js",
});
