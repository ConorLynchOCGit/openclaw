import { spawnSync } from "node:child_process";
import { resolvePnpmRunner } from "./pnpm-runner.mjs";

function resolveExitCode(result) {
  if (typeof result.status === "number") {
    return result.status;
  }
  return 1;
}

function formatDurationMs(durationMs) {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatStepLabel(kind, args) {
  return `${kind} ${args.join(" ")}`;
}

function logStepFinished(label, startedAt) {
  const durationMs = Date.now() - startedAt;
  console.error(`[root-gate] ${label} completed in ${formatDurationMs(durationMs)}`);
}

export function runNodeStep(args, options = {}) {
  const label = formatStepLabel("node", args);
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: options.env ?? process.env,
  });
  const exitCode = resolveExitCode(result);
  if (exitCode !== 0) {
    console.error(`[root-gate] ${label} failed after ${formatDurationMs(Date.now() - startedAt)}`);
    process.exit(exitCode);
  }
  logStepFinished(label, startedAt);
}

export function runPnpmStep(pnpmArgs, options = {}) {
  const label = formatStepLabel("pnpm", pnpmArgs);
  const startedAt = Date.now();
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
    console.error(`[root-gate] ${label} failed after ${formatDurationMs(Date.now() - startedAt)}`);
    process.exit(exitCode);
  }
  logStepFinished(label, startedAt);
}
