import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export const runtimeConfigSessionsTestInclude = [
  "src/config/sessions/**/*.test.ts",
  "src/config/sessions*.test.ts",
];

export function createRuntimeConfigSessionsVitestConfig(env?: Record<string, string | undefined>) {
  const config = createScopedVitestConfig(runtimeConfigSessionsTestInclude, {
    dir: "src",
    env,
    includeOpenClawRuntimeSetup: false,
    isolate: true,
    name: "runtime-config-sessions",
    passWithNoTests: true,
    pool: "forks",
  });
  return {
    ...config,
    test: {
      ...config.test,
      sequence: {
        ...config.test?.sequence,
        groupOrder: 3,
      },
    },
  };
}

export default createRuntimeConfigSessionsVitestConfig();
