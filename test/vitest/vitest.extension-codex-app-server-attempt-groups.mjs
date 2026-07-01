// Shared test groups for Codex app-server attempt shards.
//
// Keep this as the single file-list source for both Vitest shard configs and
// the focused test dispatcher. Otherwise explicit file targets can drift back
// to the broad extension-codex shard and pay the full app-server setup cost.
export const codexAppServerAttemptSupportTestTargets = Object.freeze([
  "extensions/codex/src/app-server/attempt-context.test.ts",
  "extensions/codex/src/app-server/attempt-results.test.ts",
  "extensions/codex/src/app-server/attempt-startup.test.ts",
  "extensions/codex/src/app-server/attempt-timeouts.test.ts",
  "extensions/codex/src/app-server/attempt-turn-watches.test.ts",
]);

export const codexAppServerAttemptExtraTestTargets = Object.freeze([
  "extensions/codex/src/app-server/run-attempt-thread-cleanup.test.ts",
  "extensions/codex/src/app-server/run-attempt.context-engine.test.ts",
  "extensions/codex/src/app-server/run-attempt.dynamic-tools.test.ts",
  "extensions/codex/src/app-server/run-attempt.hooks.test.ts",
  "extensions/codex/src/app-server/run-attempt.native-hook-relay.test.ts",
  "extensions/codex/src/app-server/run-attempt.steering.test.ts",
  "extensions/codex/src/app-server/run-attempt.turn-watches.test.ts",
  "extensions/codex/src/app-server/run-attempt.usage-limits.test.ts",
  "extensions/codex/src/app-server/run-attempt.vision-tools.test.ts",
]);

const codexAppServerAttemptSupportTestTargetSet = new Set(codexAppServerAttemptSupportTestTargets);
const codexAppServerAttemptExtraTestTargetSet = new Set(codexAppServerAttemptExtraTestTargets);

export function resolveCodexAppServerAttemptTestGroup(relative) {
  if (codexAppServerAttemptSupportTestTargetSet.has(relative)) {
    return "support";
  }
  if (codexAppServerAttemptExtraTestTargetSet.has(relative)) {
    return "extra";
  }
  return null;
}
