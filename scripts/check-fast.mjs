#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolvePnpmRunner } from "./pnpm-runner.mjs";

function runPnpm(pnpmArgs, env = process.env) {
  const runner = resolvePnpmRunner({
    pnpmArgs,
    nodeExecPath: process.execPath,
    npmExecPath: env.npm_execpath,
    comSpec: env.ComSpec,
    platform: process.platform,
  });
  const result = spawnSync(runner.command, runner.args, {
    stdio: "inherit",
    env,
    shell: runner.shell,
    windowsVerbatimArguments: runner.windowsVerbatimArguments,
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

runPnpm(["run", "check:preflight"]);
runPnpm(["run", "lint"]);
runPnpm(["run", "tsgo:fast"]);
