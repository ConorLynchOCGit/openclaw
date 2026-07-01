// Vitest extension codex app server attempt support config wires the extension codex app server attempt support test shard.
import { codexAppServerAttemptSupportTestTargets } from "./vitest.extension-codex-app-server-attempt-groups.mjs";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function createExtensionCodexAppServerAttemptSupportVitestConfig(
  env: Record<string, string | undefined> = process.env,
) {
  return createScopedVitestConfig([...codexAppServerAttemptSupportTestTargets], {
    dir: "extensions",
    env,
    fileParallelism: false,
    name: "extension-codex-app-server-attempt-support",
    passWithNoTests: true,
    setupFiles: ["test/setup.extensions.ts"],
  });
}

export default createExtensionCodexAppServerAttemptSupportVitestConfig();
