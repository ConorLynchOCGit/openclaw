import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export const agentsPiTestInclude = [
  "src/agents/pi-embedded-runner/**/*.test.ts",
  "src/agents/pi-embedded-runner*.test.ts",
  "src/agents/pi-embedded-helpers*.test.ts",
  "src/agents/pi-hooks/**/*.test.ts",
];

export function createAgentsPiVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(agentsPiTestInclude, {
    dir: "src/agents",
    env,
    fileParallelism: false,
    name: "agents-pi",
    passWithNoTests: true,
  });
}

export default createAgentsPiVitestConfig();
