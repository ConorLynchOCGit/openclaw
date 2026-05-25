import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  acquireLocalHeavyCheckLockSync,
  applyLocalTsgoPolicy,
  peekLocalHeavyCheckLockSync,
  readLocalCheckMode,
  resolveHostResources,
  shouldAcquireLocalHeavyCheckLockForTsgo,
  shouldThrottleLocalHeavyChecks,
} from "./lib/local-heavy-check-runtime.mjs";

export function readFlagValue(args, name) {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === name) {
      return args[index + 1];
    }
    if (arg.startsWith(`${name}=`)) {
      return arg.slice(name.length + 1);
    }
  }
  return undefined;
}

function classifyCacheWarmth(tsBuildInfoFile) {
  if (!tsBuildInfoFile) {
    return "none";
  }
  return fs.existsSync(path.resolve(tsBuildInfoFile)) ? "warm" : "cold";
}

function resolveTsgoMode(args, env) {
  const explicitMode = env.OPENCLAW_TSGO_MODE?.trim();
  if (explicitMode) {
    return explicitMode;
  }
  return args.length === 0 ? "full" : "targeted";
}

function withTsgoNodeHeapBudget(env, hostResources) {
  const nextEnv = { ...env };
  const existingOptions = nextEnv.NODE_OPTIONS ?? "";
  if (existingOptions.includes("--max-old-space-size")) {
    return nextEnv;
  }
  const configured = Number.parseInt(nextEnv.OPENCLAW_TSGO_NODE_MAX_OLD_SPACE_MB ?? "", 10);
  const memoryBasedDefault = Math.max(
    4096,
    Math.min(12288, Math.floor(hostResources.totalMemoryBytes / 1024 ** 2 / 2)),
  );
  const heapMb = Number.isFinite(configured) && configured > 0 ? configured : memoryBasedDefault;
  nextEnv.NODE_OPTIONS = `${existingOptions} --max-old-space-size=${heapMb}`.trim();
  nextEnv.OPENCLAW_TSGO_NODE_HEAP_MB = String(heapMb);
  return nextEnv;
}

function main() {
  const rawArgs = process.argv.slice(2);
  const hostResources = resolveHostResources();
  const policy = applyLocalTsgoPolicy(rawArgs, process.env, hostResources);
  const finalArgs = policy.args;
  const env = withTsgoNodeHeapBudget(policy.env, hostResources);

  const tsgoPath = path.resolve("node_modules", ".bin", "tsgo");
  const tsBuildInfoFile = readFlagValue(finalArgs, "--tsBuildInfoFile");
  if (tsBuildInfoFile) {
    fs.mkdirSync(path.dirname(path.resolve(tsBuildInfoFile)), { recursive: true });
  }

  const throttled = shouldThrottleLocalHeavyChecks(env, hostResources);
  const mode = resolveTsgoMode(rawArgs, env);
  const cacheWarmth = classifyCacheWarmth(tsBuildInfoFile);
  const shouldLock = shouldAcquireLocalHeavyCheckLockForTsgo(finalArgs, env);
  const lockState = shouldLock
    ? peekLocalHeavyCheckLockSync({
        cwd: process.cwd(),
        env,
        toolName: "tsgo",
      })
    : null;

  console.error(
    `[tsgo] mode=${mode} scope=${rawArgs.length === 0 ? "repo" : `${rawArgs.length} arg(s)`} cache=${cacheWarmth}`,
  );
  if (tsBuildInfoFile) {
    console.error(`[tsgo] build info: ${path.resolve(tsBuildInfoFile)}`);
  }
  console.error(
    `[tsgo] local-check mode=${readLocalCheckMode(env)} throttling=${throttled ? "on" : "off"} host=${hostResources.logicalCpuCount} cpu / ${(hostResources.totalMemoryBytes / 1024 ** 3).toFixed(1)} GiB`,
  );
  if (shouldLock && lockState && !lockState.heldBySelf) {
    const owner = lockState.owner;
    console.error(
      `[tsgo] waiting on heavy-check lock held by ${owner?.tool ?? "unknown"} pid ${owner?.pid ?? "unknown"} at ${lockState.lockDir}`,
    );
  } else if (shouldLock) {
    console.error("[tsgo] heavy-check lock: available");
  } else {
    console.error("[tsgo] heavy-check lock: skipped");
  }
  console.error(
    `[tsgo] execution policy: ${finalArgs.includes("--singleThreaded") ? "single-threaded" : "multi-checker"} / checkers=${readFlagValue(finalArgs, "--checkers") ?? "default"}`,
  );
  console.error(`[tsgo] node heap budget: ${env.OPENCLAW_TSGO_NODE_HEAP_MB ?? "existing"} MiB`);

  const releaseLock = shouldLock
    ? acquireLocalHeavyCheckLockSync({
        cwd: process.cwd(),
        env,
        toolName: "tsgo",
      })
    : () => {};

  try {
    const result = spawnSync(tsgoPath, finalArgs, {
      stdio: "inherit",
      env,
      shell: process.platform === "win32",
    });

    if (result.error) {
      throw result.error;
    }

    process.exitCode = result.status ?? 1;
  } finally {
    releaseLock();
  }
}

main();
