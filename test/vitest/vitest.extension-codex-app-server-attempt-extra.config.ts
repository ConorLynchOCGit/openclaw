// Vitest extension codex app server attempt extra config wires the extension codex app server attempt extra test shard.
import { codexAppServerAttemptExtraTestTargets } from "./vitest.extension-codex-app-server-attempt-groups.mjs";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function createExtensionCodexAppServerAttemptExtraVitestConfig(
  env: Record<string, string | undefined> = process.env,
) {
  return createScopedVitestConfig([...codexAppServerAttemptExtraTestTargets], {
    dir: "extensions",
    env,
    fileParallelism: false,
    name: "extension-codex-app-server-attempt-extra",
    passWithNoTests: true,
    setupFiles: ["test/setup.extensions.ts"],
  });
}

export default createExtensionCodexAppServerAttemptExtraVitestConfig();
