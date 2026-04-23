import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export const commandsOnboardTestInclude = [
  "src/commands/onboard*.test.ts",
  "src/commands/onboard-*.test.ts",
  "src/commands/onboard/**/*.test.ts",
  "src/commands/auth-choice*.test.ts",
  "src/commands/configure.gateway-auth*.test.ts",
  "src/commands/chutes-oauth.test.ts",
  "src/commands/oauth-tls-preflight.test.ts",
];

export function createCommandsOnboardVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(commandsOnboardTestInclude, {
    dir: "src/commands",
    env,
    name: "commands-onboard",
    passWithNoTests: true,
  });
}

export default createCommandsOnboardVitestConfig();
