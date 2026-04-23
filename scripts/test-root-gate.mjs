#!/usr/bin/env node

import { isCiLikeEnv } from "./lib/vitest-local-scheduling.mjs";
import { runNodeStep, runPnpmStep } from "./root-gate-runtime.mjs";
import { parseTestProjectsArgs, resolveChangedTargetArgs } from "./test-projects.test-support.mjs";

const ROOT_VITEST_SKIP_CONFIGS = ["test/vitest/vitest.extension-diffs.config.ts"];

function buildRootTestEnv(baseEnv) {
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
    OPENCLAW_TEST_PROJECTS_SKIP_CONFIGS: [...current].join(","),
  };
}

const args = process.argv.slice(2);
const { targetArgs } = parseTestProjectsArgs(args, process.cwd());
const changedTargetArgs =
  targetArgs.length === 0 ? resolveChangedTargetArgs(args, process.cwd()) : null;
const isFullSuiteRootGate = targetArgs.length === 0 && changedTargetArgs === null;

if (isFullSuiteRootGate) {
  if (isCiLikeEnv(process.env)) {
    runPnpmStep(["turbo:test:root"]);
  } else {
    runNodeStep(["scripts/test-projects.mjs"], {
      env: buildRootTestEnv(process.env),
    });
  }
  process.exit(0);
}

runNodeStep(["scripts/test-projects.mjs", ...args], {
  env: process.env,
});
