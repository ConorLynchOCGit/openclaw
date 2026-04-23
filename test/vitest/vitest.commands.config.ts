import { commandsDoctorTestInclude } from "./vitest.commands-doctor.config.ts";
import { commandsLightTestFiles } from "./vitest.commands-light-paths.mjs";
import { commandsOnboardTestInclude } from "./vitest.commands-onboard.config.ts";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function createCommandsVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(["src/commands/**/*.test.ts"], {
    dir: "src/commands",
    env,
    exclude: [
      ...commandsLightTestFiles,
      ...commandsDoctorTestInclude,
      ...commandsOnboardTestInclude,
    ],
    name: "commands",
  });
}

export default createCommandsVitestConfig();
