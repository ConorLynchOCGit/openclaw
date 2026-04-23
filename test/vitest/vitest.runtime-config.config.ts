import { runtimeConfigSessionsTestInclude } from "./vitest.runtime-config-sessions.config.ts";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function createRuntimeConfigVitestConfig(env?: Record<string, string | undefined>) {
  const config = createScopedVitestConfig(["src/config/**/*.test.ts"], {
    dir: "src",
    env,
    exclude: runtimeConfigSessionsTestInclude,
    includeOpenClawRuntimeSetup: false,
    isolate: true,
    name: "runtime-config",
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

export default createRuntimeConfigVitestConfig();
