import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export const commandsDoctorTestInclude = [
  "src/commands/doctor/**/*.test.ts",
  "src/commands/doctor*.test.ts",
  "src/commands/oauth-tls-preflight.doctor.test.ts",
];

export function createCommandsDoctorVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(commandsDoctorTestInclude, {
    dir: "src/commands",
    env,
    name: "commands-doctor",
    passWithNoTests: true,
  });
}

export default createCommandsDoctorVitestConfig();
