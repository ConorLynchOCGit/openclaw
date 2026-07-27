// Lobster plugin entrypoint registers its OpenClaw integration.
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { AnyAgentTool, OpenClawPluginApi, OpenClawPluginToolFactory } from "./runtime-api.js";
import { createLobsterTool } from "./src/lobster-tool.js";
import { buildManagedTaskFlowTurnContext } from "./src/lobster-turn-context.js";

export function registerLobsterPlugin(api: OpenClawPluginApi) {
  api.on("agent_turn_prepare", (_event, ctx) => {
    const sessionKey = ctx.sessionKey?.trim();
    const managedFlows = api.runtime?.tasks.managedFlows;
    if (!sessionKey || !managedFlows) {
      return undefined;
    }
    const taskFlow = managedFlows.bindSession({ sessionKey });
    const activeFlow = taskFlow.findLatestActiveManaged();
    const terminalFlow = activeFlow ? undefined : taskFlow.findLatestTerminalManaged();
    const prependContext = buildManagedTaskFlowTurnContext(
      activeFlow ?? terminalFlow,
      terminalFlow ? taskFlow.buildCloseoutHandoff(terminalFlow.flowId) : undefined,
    );
    return prependContext ? { prependContext } : undefined;
  });

  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      const taskFlow =
        api.runtime?.tasks.managedFlows && ctx.sessionKey
          ? api.runtime.tasks.managedFlows.fromToolContext(ctx)
          : undefined;
      return createLobsterTool(api, { taskFlow }) as AnyAgentTool;
    }) as OpenClawPluginToolFactory,
    { optional: true },
  );
}

export default definePluginEntry({
  id: "lobster",
  name: "Lobster",
  description: "Optional local shell helper tools",
  register: registerLobsterPlugin,
});
