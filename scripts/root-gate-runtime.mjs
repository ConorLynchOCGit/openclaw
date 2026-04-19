import { spawnSync } from "node:child_process";
import { resolvePnpmRunner } from "./pnpm-runner.mjs";

function resolveExitCode(result) {
  if (typeof result.status === "number") {
    return result.status;
  }
  return 1;
}

export function runNodeStep(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: options.env ?? process.env,
  });
  const exitCode = resolveExitCode(result);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

export function runPnpmStep(pnpmArgs, options = {}) {
  const runner = resolvePnpmRunner({
    pnpmArgs,
    nodeExecPath: process.execPath,
    npmExecPath: options.env?.npm_execpath ?? process.env.npm_execpath,
    comSpec: options.env?.ComSpec ?? process.env.ComSpec,
    platform: process.platform,
  });
  const result = spawnSync(runner.command, runner.args, {
    stdio: "inherit",
    env: options.env ?? process.env,
    shell: runner.shell,
    windowsVerbatimArguments: runner.windowsVerbatimArguments,
  });
  const exitCode = resolveExitCode(result);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
