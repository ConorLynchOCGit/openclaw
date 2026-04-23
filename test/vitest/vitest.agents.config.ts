import { agentsPiTestInclude } from "./vitest.agents-pi.config.ts";
import { agentsSubagentsTestInclude } from "./vitest.agents-subagents.config.ts";
import { agentsToolsTestInclude } from "./vitest.agents-tools.config.ts";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function createAgentsVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(["src/agents/**/*.test.ts"], {
    dir: "src/agents",
    env,
    exclude: [...agentsPiTestInclude, ...agentsSubagentsTestInclude, ...agentsToolsTestInclude],
    fileParallelism: false,
    name: "agents",
  });
}

export default createAgentsVitestConfig();
