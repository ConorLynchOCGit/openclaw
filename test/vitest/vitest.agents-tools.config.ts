import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export const agentsToolsTestInclude = [
  "src/agents/tools/**/*.test.ts",
  "src/agents/tool*.test.ts",
  "src/agents/tools-effective-inventory.test.ts",
];

export function createAgentsToolsVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(agentsToolsTestInclude, {
    dir: "src/agents",
    env,
    name: "agents-tools",
    passWithNoTests: true,
  });
}

export default createAgentsToolsVitestConfig();
