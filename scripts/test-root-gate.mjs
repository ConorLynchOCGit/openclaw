#!/usr/bin/env node

import { isCiLikeEnv, resolveLocalFullSuiteProfile } from "./lib/vitest-local-scheduling.mjs";
import { runNodeStep, runPnpmStep } from "./root-gate-runtime.mjs";
import { parseTestProjectsArgs, resolveChangedTargetArgs } from "./test-projects.test-support.mjs";

const ROOT_VITEST_SKIP_CONFIGS = ["test/vitest/vitest.extension-diffs.config.ts"];

function buildRootTestEnv(baseEnv) {
  const fullSuiteProfile = resolveLocalFullSuiteProfile(baseEnv);
  const current = new Set(
    String(baseEnv.OPENCLAW_TEST_PROJECTS_SKIP_CONFIGS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  for (const config of ROOT_VITEST_SKIP_CONFIGS) {
    current.add(config);
  }
  return {
    ...baseEnv,
    OPENCLAW_TEST_MAX_OLD_SPACE_SIZE_MB:
      baseEnv.OPENCLAW_TEST_MAX_OLD_SPACE_SIZE_MB ??
      baseEnv.OPENCLAW_VITEST_MAX_OLD_SPACE_SIZE_MB ??
      String(fullSuiteProfile.vitestMaxOldSpaceSizeMb),
    OPENCLAW_TEST_PROJECTS_SKIP_CONFIGS: [...current].join(","),
    OPENCLAW_VITEST_MAX_WORKERS:
      baseEnv.OPENCLAW_VITEST_MAX_WORKERS ??
      baseEnv.OPENCLAW_TEST_WORKERS ??
      String(fullSuiteProfile.vitestMaxWorkers),
  };
}

const rawArgs = process.argv.slice(2);
const includeSlow = rawArgs.includes("--include-slow");
const args = rawArgs.filter((arg) => arg !== "--include-slow");
const rootGateEnv = includeSlow
  ? { ...process.env, OPENCLAW_TEST_INCLUDE_SLOW_CONFIGS: "1" }
  : process.env;
const { targetArgs } = parseTestProjectsArgs(args, process.cwd());
const changedTargetArgs =
  targetArgs.length === 0 ? resolveChangedTargetArgs(args, process.cwd()) : null;
const isFullSuiteRootGate = targetArgs.length === 0 && changedTargetArgs === null;

if (isFullSuiteRootGate) {
  const fullSuiteEnv = isCiLikeEnv(process.env) ? rootGateEnv : buildRootTestEnv(rootGateEnv);
  runPnpmStep(["turbo:test:root"], { env: fullSuiteEnv });
  process.exit(0);
}

runNodeStep(["scripts/test-projects.mjs", ...args], {
  env: rootGateEnv,
});
