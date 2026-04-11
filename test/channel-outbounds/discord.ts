import type { ChannelOutboundAdapter } from "../../src/channels/plugins/types.js";
import { loadBundledPluginTestApiSync } from "../../src/test-utils/bundled-plugin-public-surface.js";

export const { discordOutbound } = loadBundledPluginTestApiSync<{
  discordOutbound: ChannelOutboundAdapter;
}>("discord");
