import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export const agentsSubagentsTestInclude = [
  "src/agents/subagent*.test.ts",
  "src/agents/spawned-context.test.ts",
];

export function createAgentsSubagentsVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(agentsSubagentsTestInclude, {
    dir: "src/agents",
    env,
    fileParallelism: false,
    name: "agents-subagents",
    passWithNoTests: true,
  });
}

export default createAgentsSubagentsVitestConfig();
