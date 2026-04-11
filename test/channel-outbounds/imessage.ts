import type { ChannelOutboundAdapter } from "../../src/channels/plugins/types.js";
import { loadBundledPluginPublicSurfaceSync } from "../../src/test-utils/bundled-plugin-public-surface.js";

export const { imessageOutbound } = loadBundledPluginPublicSurfaceSync<{
  imessageOutbound: ChannelOutboundAdapter;
}>({
  pluginId: "imessage",
  artifactBasename: "src/outbound-adapter.js",
});
