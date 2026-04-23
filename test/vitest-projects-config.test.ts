import { describe, expect, it } from "vitest";
import { normalizeConfigPath, normalizeConfigPaths } from "./helpers/vitest-config-paths.js";
import { createAgentsPiVitestConfig } from "./vitest/vitest.agents-pi.config.ts";
import { createAgentsSubagentsVitestConfig } from "./vitest/vitest.agents-subagents.config.ts";
import { createAgentsToolsVitestConfig } from "./vitest/vitest.agents-tools.config.ts";
import { createAgentsVitestConfig } from "./vitest/vitest.agents.config.ts";
import bundledConfig from "./vitest/vitest.bundled.config.ts";
import { createCommandsDoctorVitestConfig } from "./vitest/vitest.commands-doctor.config.ts";
import { createCommandsLightVitestConfig } from "./vitest/vitest.commands-light.config.ts";
import { createCommandsOnboardVitestConfig } from "./vitest/vitest.commands-onboard.config.ts";
import { createCommandsVitestConfig } from "./vitest/vitest.commands.config.ts";
import baseConfig, {
  assertRootVitestConfigUsage,
  rootVitestProjects,
} from "./vitest/vitest.config.ts";
import { createContractsVitestConfig } from "./vitest/vitest.contracts.config.ts";
import { createGatewayServerHttpVitestConfig } from "./vitest/vitest.gateway-server-http.config.ts";
import { createGatewayVitestConfig } from "./vitest/vitest.gateway.config.ts";
import { createPluginSdkLightVitestConfig } from "./vitest/vitest.plugin-sdk-light.config.ts";
import { createRuntimeConfigSessionsVitestConfig } from "./vitest/vitest.runtime-config-sessions.config.ts";
import { sharedVitestConfig } from "./vitest/vitest.shared.config.ts";
import { createUiVitestConfig } from "./vitest/vitest.ui.config.ts";
import { createUnitFastVitestConfig } from "./vitest/vitest.unit-fast.config.ts";
import { createUnitVitestConfig } from "./vitest/vitest.unit.config.ts";

describe("projects vitest config", () => {
  it("defines the native root project list for all non-live Vitest lanes", () => {
    expect(baseConfig.test?.projects).toEqual([...rootVitestProjects]);
  });

  it("rejects local root multi-project usage without an explicit config", () => {
    expect(() =>
      assertRootVitestConfigUsage(["run", "test/scripts/run-vitest.test.ts"], {}),
    ).toThrow(/without --config is unsupported/u);
    expect(() =>
      assertRootVitestConfigUsage(
        [
          "run",
          "--config",
          "test/vitest/vitest.tooling.config.ts",
          "test/scripts/run-vitest.test.ts",
        ],
        {},
      ),
    ).not.toThrow();
  });

  it("disables vite env-file loading for vitest lanes", () => {
    expect(baseConfig.envFile).toBe(false);
    expect(sharedVitestConfig.envFile).toBe(false);
  });

  it("keeps root projects on their expected pool defaults", () => {
    expect(createGatewayVitestConfig().test.pool).toBe("threads");
    expect(createGatewayServerHttpVitestConfig().test.pool).toBe("threads");
    expect(createAgentsVitestConfig().test.pool).toBe("threads");
    expect(createAgentsPiVitestConfig().test.pool).toBe("threads");
    expect(createAgentsSubagentsVitestConfig().test.pool).toBe("threads");
    expect(createAgentsToolsVitestConfig().test.pool).toBe("threads");
    expect(createCommandsDoctorVitestConfig().test.pool).toBe("threads");
    expect(createCommandsLightVitestConfig().test.pool).toBe("threads");
    expect(createCommandsOnboardVitestConfig().test.pool).toBe("threads");
    expect(createCommandsVitestConfig().test.pool).toBe("threads");
    expect(createPluginSdkLightVitestConfig().test.pool).toBe("threads");
    expect(createRuntimeConfigSessionsVitestConfig().test.pool).toBe("forks");
    expect(createUnitFastVitestConfig().test.pool).toBe("threads");
    expect(createContractsVitestConfig().test.pool).toBe("forks");
  });

  it("keeps the contracts lane on the non-isolated fork runner by default", () => {
    const config = createContractsVitestConfig();
    expect(config.test.pool).toBe("forks");
    expect(config.test.isolate).toBe(false);
    expect(normalizeConfigPath(config.test.runner)).toBe("test/non-isolated-runner.ts");
  });

  it("keeps the root ui lane aligned with the isolated jsdom setup", () => {
    const config = createUiVitestConfig();
    expect(config.test.environment).toBe("jsdom");
    expect(config.test.isolate).toBe(true);
    expect(config.test.runner).toBeUndefined();
    const setupFiles = normalizeConfigPaths(config.test.setupFiles);
    expect(setupFiles).not.toContain("test/setup-openclaw-runtime.ts");
    expect(setupFiles).toContain("ui/src/test-helpers/lit-warnings.setup.ts");
    expect(config.test.deps?.optimizer?.web?.enabled).toBe(true);
  });

  it("keeps the unit lane on the non-isolated runner by default", () => {
    const config = createUnitVitestConfig();
    expect(config.test.isolate).toBe(false);
    expect(normalizeConfigPath(config.test.runner)).toBe("test/non-isolated-runner.ts");
  });

  it("keeps the unit-fast lane on shared workers without the reset-heavy runner", () => {
    const config = createUnitFastVitestConfig();
    expect(config.test.isolate).toBe(false);
    expect(config.test.runner).toBeUndefined();
  });

  it("keeps the bundled lane on thread workers with the non-isolated runner", () => {
    expect(bundledConfig.test?.pool).toBe("threads");
    expect(bundledConfig.test?.isolate).toBe(false);
    expect(normalizeConfigPath(bundledConfig.test?.runner)).toBe("test/non-isolated-runner.ts");
  });
});
