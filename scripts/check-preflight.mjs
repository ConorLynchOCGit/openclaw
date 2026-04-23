#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolvePnpmRunner } from "./pnpm-runner.mjs";

const PRECHECK_STEPS = [
  {
    name: "tool-display freshness",
    pnpmArgs: ["tool-display:check"],
    fixHint: "pnpm tool-display:write",
  },
  {
    name: "conflict markers",
    pnpmArgs: ["check:no-conflict-markers"],
  },
  {
    name: "topology smoke",
    pnpmArgs: ["check:topology"],
  },
  {
    name: "base config schema freshness",
    pnpmArgs: ["check:base-config-schema"],
    fixHint: "pnpm config:schema:gen",
  },
  {
    name: "bundled channel metadata freshness",
    pnpmArgs: ["check:bundled-channel-config-metadata"],
    fixHint: "pnpm config:channels:gen",
  },
];

function runPnpm(pnpmArgs, env = process.env) {
  const runner = resolvePnpmRunner({
    pnpmArgs,
    nodeExecPath: process.execPath,
    npmExecPath: env.npm_execpath,
    comSpec: env.ComSpec,
    platform: process.platform,
  });
  return spawnSync(runner.command, runner.args, {
    stdio: "inherit",
    env,
    shell: runner.shell,
    windowsVerbatimArguments: runner.windowsVerbatimArguments,
  });
}

function main() {
  for (const step of PRECHECK_STEPS) {
    console.error(`[check:preflight] ${step.name}`);
    const result = runPnpm(["run", ...step.pnpmArgs]);
    if ((result.status ?? 1) !== 0) {
      if (step.fixHint) {
        console.error(`[check:preflight] fix hint: ${step.fixHint}`);
      }
      console.error(
        `[check:preflight] failed during ${step.name}; heavy checks were intentionally skipped.`,
      );
      process.exit(result.status ?? 1);
    }
  }
}

main();
