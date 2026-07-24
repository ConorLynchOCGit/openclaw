// Sole target-to-owner test router for user- and agent-selected files.
// Lower-level runners execute an already-selected config; they must not infer
// project ownership independently of this dispatcher.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { formatMs } from "./lib/check-timing-summary.mjs";
import { acquireLocalHeavyCheckLockSync } from "./lib/local-heavy-check-runtime.mjs";
import {
  isCiLikeEnv,
  resolveLocalFullSuiteProfile,
  resolveLocalVitestEnv,
} from "./lib/vitest-local-scheduling.mjs";
import {
  createShardTimingSample,
  readShardTimings,
  writeShardTimings,
} from "./lib/vitest-shard-timings.mjs";
import {
  resolveVitestCliEntry,
  resolveVitestNodeArgs,
  resolveVitestSpawnParams,
  spawnWatchedVitestProcess,
} from "./run-vitest.mjs";
import {
  applyDefaultMultiSpecVitestCachePaths,
  applyDefaultVitestNoOutputTimeout,
  applyParallelVitestCachePaths,
  buildFullSuiteVitestRunPlans,
  buildValidationPerformanceProfile,
  createValidationResultLedger,
  createVitestRunSpecs,
  findUnmatchedExplicitTestTargets,
  formatFailedShardDigest,
  listFullExtensionVitestProjectConfigs,
  orderFullSuiteSpecsForParallelRun,
  parseTestProjectsArgs,
  resolveParallelFullSuiteConcurrency,
  resolveChangedTestTargetPlanForArgs,
  resolveChangedTargetArgs,
  shouldAcquireLocalHeavyCheckLock,
  shouldRunTargetedMultiConfigSpecsInParallel,
  shouldRetryVitestNoOutputTimeout,
  writeVitestIncludeFile,
} from "./test-projects.test-support.mjs";

// Keep this shim so `pnpm test -- src/foo.test.ts` still forwards filters
// cleanly instead of leaking pnpm's passthrough sentinel to Vitest.
let releaseLock = () => {};
let lockReleased = false;

const releaseLockOnce = () => {
  if (lockReleased) {
    return;
  }
  lockReleased = true;
  releaseLock();
};

function isWrapperMetadataRequest(args) {
  for (const arg of args) {
    if (arg === "--") {
      return false;
    }
    if (arg === "--help" || arg === "-h") {
      return true;
    }
  }
  return false;
}

function extractWrapperPlanMode(args) {
  const forwardedArgs = [];
  let planOnly = false;
  let passthrough = false;
  for (const arg of args) {
    if (arg === "--") {
      passthrough = true;
      forwardedArgs.push(arg);
      continue;
    }
    if (!passthrough && arg === "--plan") {
      planOnly = true;
      continue;
    }
    forwardedArgs.push(arg);
  }
  return { forwardedArgs, planOnly };
}

function findExplicitLiveTestTargets(args, cwd) {
  const { targetArgs } = parseTestProjectsArgs(args, cwd);
  return targetArgs.filter((targetArg) => {
    const relative = path.relative(cwd, path.resolve(cwd, targetArg)).replaceAll(path.sep, "/");
    return relative.includes(".live.test.");
  });
}

function printHelp() {
  console.log(`Usage: node scripts/test-projects.mjs [--changed <base>] [--plan] [--watch] [targets...] [-- vitest-args...]

Runs the Vitest project shards that own the requested targets. With no targets,
this runs the full local suite. Use explicit targets for local edit loops.
--plan prints the owner/config receipt without starting Vitest.`);
}

function cleanupVitestRunSpec(spec) {
  if (!spec.includeFilePath) {
    return;
  }
  try {
    fs.rmSync(spec.includeFilePath, { force: true });
  } catch {
    // Best-effort cleanup for temp include lists.
  }
}

function createPhaseTimer() {
  const startedAt = performance.now();
  let previousAt = startedAt;
  const phases = [];
  return {
    mark(name) {
      const now = performance.now();
      phases.push({
        durationMs: now - previousAt,
        name,
        sinceStartMs: now - startedAt,
      });
      previousAt = now;
    },
    print(label = "phase timings") {
      const totalMs = performance.now() - startedAt;
      const phaseText =
        phases.length === 0
          ? "none"
          : phases.map((phase) => `${phase.name}=${formatMs(phase.durationMs)}`).join("; ");
      console.error(`[test] ${label}: total=${formatMs(totalMs)}; ${phaseText}`);
    },
  };
}

function runGitBuffer(cwd, args) {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = result.stderr?.toString("utf8").trim();
    throw new Error(detail || `git ${args.join(" ")} exited ${result.status ?? "unknown"}`);
  }
  return result.stdout ?? Buffer.alloc(0);
}

function splitNullBuffer(value) {
  const entries = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== 0) {
      continue;
    }
    if (index > start) {
      entries.push(value.subarray(start, index));
    }
    start = index + 1;
  }
  if (start < value.length) {
    entries.push(value.subarray(start));
  }
  return entries;
}

function resolveValidationWorktreeIdentity(cwd) {
  try {
    const head = runGitBuffer(cwd, ["rev-parse", "HEAD"]).toString("utf8").trim();
    const diff = runGitBuffer(cwd, ["diff", "--binary", "--no-ext-diff", "HEAD", "--"]);
    const untracked = splitNullBuffer(
      runGitBuffer(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
    ).toSorted(Buffer.compare);
    const digest = createHash("sha256");
    digest.update("openclaw.validation.worktree.v1\0");
    digest.update(head);
    digest.update("\0tracked-diff\0");
    digest.update(diff);
    for (const pathBytes of untracked) {
      const relativePath = pathBytes.toString("utf8");
      const absolutePath = path.join(cwd, relativePath);
      const stat = fs.lstatSync(absolutePath);
      digest.update("\0untracked-path\0");
      digest.update(pathBytes);
      digest.update(`\0mode:${stat.mode.toString(8)}\0`);
      if (stat.isSymbolicLink()) {
        digest.update(fs.readlinkSync(absolutePath));
      } else if (stat.isFile()) {
        digest.update(fs.readFileSync(absolutePath));
      } else {
        digest.update(`kind:${stat.isDirectory() ? "directory" : "other"}`);
      }
    }
    return {
      schema: "openclaw.validation.worktree_identity.v1",
      status: "available",
      head,
      diffSha256: digest.digest("hex"),
      untrackedPathCount: untracked.length,
    };
  } catch (error) {
    return {
      schema: "openclaw.validation.worktree_identity.v1",
      status: "unavailable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createValidationGateResult(spec, result, order) {
  return {
    order,
    gateId: `${order + 1}:${spec.config}`,
    command: ["pnpm", ...spec.pnpmArgs].join(" "),
    config: spec.config,
    includePatterns: spec.includePatterns,
    profile: spec.config,
    cwd: process.cwd(),
    startedAt: new Date(result.startedAtMs).toISOString(),
    endedAt: new Date(result.endedAtMs).toISOString(),
    durationMs: result.durationMs,
    exitCode: result.code,
    signal: result.signal,
    noOutputTimedOut: result.noOutputTimedOut,
    outputRef: "process_stdio",
  };
}

function printValidationResultLedger(params) {
  const ledger = createValidationResultLedger(params);
  console.error(`[test] validation result ledger: ${JSON.stringify(ledger)}`);
}

function uniquePathEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.label}\0${entry.path}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveConfiguredPnpmStorePath(env) {
  return (
    env.PNPM_STORE_PATH?.trim() ||
    env.npm_config_store_dir?.trim() ||
    env.pnpm_config_store_dir?.trim() ||
    ""
  );
}

function resolvePathState(filePath) {
  if (!filePath) {
    return "not_configured";
  }
  try {
    fs.accessSync(filePath, fs.constants.W_OK);
    return "writable";
  } catch {
    return fs.existsSync(filePath) ? "not_writable" : "missing";
  }
}

function formatPathState(entry) {
  const suffix = entry.path ? ` path=${entry.path}` : "";
  return `${entry.label}:${entry.state}${suffix}`;
}

function collectValidationPreflightEntries({ cwd, env, runSpecs }) {
  const configuredPnpmStorePath = resolveConfiguredPnpmStorePath(env);
  const cachePaths = runSpecs
    .map((spec) => spec.env?.OPENCLAW_VITEST_FS_MODULE_CACHE_PATH?.trim())
    .filter(Boolean)
    .map((cachePath) => path.dirname(cachePath));
  const rawEntries = [
    { label: "node_modules", path: path.join(cwd, "node_modules") },
    { label: "pnpm_virtual_store", path: path.join(cwd, "node_modules", ".pnpm") },
    { label: "pnpm_store", path: configuredPnpmStorePath },
    { label: "corepack_home", path: env.COREPACK_HOME?.trim() || "" },
    { label: "pnpm_home", path: env.PNPM_HOME?.trim() || "" },
    { label: "tsgo_cache", path: path.join(cwd, ".artifacts", "tsgo-cache") },
    { label: "include_tmp", path: os.tmpdir() },
    ...cachePaths.map((cachePath, index) => ({
      label: `vitest_fs_cache_parent_${index + 1}`,
      path: cachePath,
    })),
  ];
  return uniquePathEntries(rawEntries).map((entry) =>
    Object.assign(entry, { state: resolvePathState(entry.path) }),
  );
}

function printValidationPreflightReceipt({ cwd, env, runSpecs }) {
  const entries = collectValidationPreflightEntries({ cwd, env, runSpecs });
  const limit = 10;
  console.error("[test] validation preflight:");
  for (const entry of entries.slice(0, limit)) {
    console.error(`[test]   ${formatPathState(entry)}`);
  }
  if (entries.length > limit) {
    console.error(`[test]   ... ${entries.length - limit} more preflight entries omitted`);
  }
}

function printValidationPerformanceProfile({
  isFullSuiteRun,
  preflightEntries,
  runSpecs,
  targetArgs,
}) {
  const profile = buildValidationPerformanceProfile({
    isFullSuiteRun,
    preflightEntries,
    runSpecs,
    targetArgs,
  });
  console.error("[test] validation performance profile:");
  console.error(`[test]   schema=${profile.schema}`);
  console.error(`[test]   advisory=${profile.advisory}`);
  console.error(`[test]   command_choice=${profile.commandChoice}`);
  console.error(`[test]   selected_shards=${profile.selectedShardCount}`);
  console.error(`[test]   shard_overhead=${profile.shardOverhead}`);
  console.error(`[test]   transform_import_overhead=${profile.transformImportOverhead}`);
  console.error(`[test]   cache_unavailable=${profile.cacheSummary.unavailableCount}`);
  console.error(`[test]   cache_not_writable=${profile.cacheSummary.notWritableCount}`);
  console.error(`[test]   cache_missing=${profile.cacheSummary.missingCount}`);
  console.error(`[test]   cache_not_configured=${profile.cacheSummary.notConfiguredCount}`);
  console.error(
    `[test]   known_bad_direct_vitest_path_applies=${profile.knownBadDirectVitestPathApplies}`,
  );
  for (const summary of profile.actionableSummaries.slice(0, 4)) {
    console.error(`[test]   action=${summary}`);
  }
}

function runVitestSpec(spec) {
  if (spec.includeFilePath && spec.includePatterns) {
    writeVitestIncludeFile(spec.includeFilePath, spec.includePatterns);
  }
  let noOutputTimedOut = false;
  let noOutputHeartbeatCount = 0;
  let firstOutputMs = null;
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    const { child, teardown } = spawnWatchedVitestProcess({
      pnpmArgs: spec.pnpmArgs,
      env: spec.env,
      label: spec.config,
      onFirstOutput: () => {
        firstOutputMs ??= performance.now() - startedAt;
      },
      onNoOutputHeartbeat: () => {
        noOutputHeartbeatCount += 1;
      },
      onNoOutputTimeout: () => {
        noOutputTimedOut = true;
      },
      spawnParams: {
        cwd: process.cwd(),
        ...resolveVitestSpawnParams(spec.env),
      },
    });

    child.on("exit", (code, signal) => {
      teardown();
      cleanupVitestRunSpec(spec);
      resolve({
        code: code ?? (signal ? 143 : 1),
        firstOutputMs,
        noOutputHeartbeatCount,
        noOutputTimedOut,
        signal,
      });
    });

    child.on("error", (error) => {
      teardown();
      cleanupVitestRunSpec(spec);
      reject(new Error("Vitest process failed to start", { cause: error }));
    });
  });
}

function applyDefaultParallelVitestWorkerBudget(specs, env) {
  if (env.OPENCLAW_VITEST_MAX_WORKERS || env.OPENCLAW_TEST_WORKERS || isCiLikeEnv(env)) {
    return specs;
  }
  const { vitestMaxWorkers } = resolveLocalFullSuiteProfile(env);
  return specs.map((spec) => ({
    ...spec,
    env: {
      ...spec.env,
      OPENCLAW_VITEST_MAX_WORKERS: String(vitestMaxWorkers),
    },
  }));
}

async function runLoggedVitestSpec(spec) {
  console.error(`[test] starting ${spec.config}`);
  const startedAtMs = Date.now();
  const startedAt = performance.now();
  let result = await runVitestSpec(spec);
  if (result.noOutputTimedOut && !spec.watchMode && shouldRetryVitestNoOutputTimeout(spec.env)) {
    console.error(`[test] retrying ${spec.config} after no-output timeout`);
    result = await runVitestSpec(spec);
  }
  const durationMs = performance.now() - startedAt;
  const endedAtMs = Date.now();
  const firstOutputText = result.firstOutputMs === null ? "none" : formatMs(result.firstOutputMs);
  console.error(
    `[test] timing ${spec.config}: total=${formatMs(durationMs)}; first_output=${firstOutputText}; no_output_heartbeats=${result.noOutputHeartbeatCount}`,
  );
  if (result.noOutputTimedOut && result.signal) {
    console.error(`[test] ${spec.config} exceeded no-output timeout`);
    return {
      ...result,
      code: result.code || 143,
      signal: null,
      startedAtMs,
      endedAtMs,
      durationMs,
      timing: null,
    };
  }
  if (result.signal) {
    console.error(`[test] ${spec.config} exited by signal ${result.signal}`);
    releaseLockOnce();
    process.kill(process.pid, result.signal);
    return null;
  }
  return {
    ...result,
    startedAtMs,
    endedAtMs,
    durationMs,
    timing: createShardTimingSample(spec, durationMs),
  };
}

function isFullExtensionsProjectRun(specs) {
  const fullExtensionProjectConfigs = new Set(listFullExtensionVitestProjectConfigs());
  return (
    specs.length > 1 &&
    specs.every(
      (spec) =>
        spec.watchMode === false &&
        spec.includePatterns === null &&
        fullExtensionProjectConfigs.has(spec.config),
    )
  );
}

function printNoChangedTestTargets(args, cwd, baseEnv) {
  const plan = resolveChangedTestTargetPlanForArgs(args, cwd, undefined, { env: baseEnv });
  const skippedBroadFallbackPaths = plan?.skippedBroadFallbackPaths ?? [];
  if (skippedBroadFallbackPaths.length === 0) {
    console.error("[test] no changed test targets; skipping Vitest.");
    return;
  }

  console.error("[test] no precise changed test targets; skipping Vitest.");
  console.error(
    `[test] ${skippedBroadFallbackPaths.length} changed path${
      skippedBroadFallbackPaths.length === 1 ? "" : "s"
    } require broad Vitest fallback:`,
  );
  for (const changedPath of skippedBroadFallbackPaths) {
    console.error(`[test]   ${changedPath}`);
  }
  console.error("[test] run `OPENCLAW_TEST_CHANGED_BROAD=1 pnpm test:changed` for broad coverage.");
}

function formatReceiptList(values, { empty = "none", limit = 6 } = {}) {
  if (!values || values.length === 0) {
    return empty;
  }
  const head = values.slice(0, limit);
  const suffix = values.length > limit ? `, ... ${values.length - limit} more` : "";
  return `${head.join(", ")}${suffix}`;
}

function resolveReceiptRequestMode(targetArgs, changedTargetArgs, runSpecs) {
  if (targetArgs.length > 0) {
    return "explicit-targets";
  }
  if (changedTargetArgs !== null) {
    return "changed-targets";
  }
  if (runSpecs.some((spec) => spec.watchMode)) {
    return "watch";
  }
  return "full-suite";
}

function resolveReceiptRuntimeClass(runSpecs, isFullSuiteRun) {
  if (runSpecs.length === 1 && runSpecs[0]?.includePatterns?.length > 0) {
    return "focused; usually under one minute for one to four focused files";
  }
  if (runSpecs.length === 1 && runSpecs[0]?.watchMode) {
    return "watch; interactive";
  }
  if (isFullSuiteRun) {
    return "broad full suite; expected to be materially slower";
  }
  if (runSpecs.length > 1) {
    return "multi-shard; runtime depends on selected project configs";
  }
  return "single project/config; inspect selected config for expected runtime";
}

function formatReceiptSpec(spec) {
  const include =
    spec.includePatterns?.length > 0
      ? `includes=${formatReceiptList(spec.includePatterns)}`
      : "includes=whole-config-or-cli-target";
  return `${spec.config}; ${include}`;
}

function printValidationReceipt({ changedTargetArgs, isFullSuiteRun, runSpecs, targetArgs }) {
  const requestMode = resolveReceiptRequestMode(targetArgs, changedTargetArgs, runSpecs);
  const requestedTargets = targetArgs.length > 0 ? targetArgs : (changedTargetArgs ?? []);
  console.error("[test] validation receipt:");
  console.error(`[test]   request=${requestMode}`);
  console.error(`[test]   targets=${formatReceiptList(requestedTargets)}`);
  console.error(
    `[test]   selected=${runSpecs.length} Vitest shard${runSpecs.length === 1 ? "" : "s"}`,
  );
  const receiptSpecLimit = 8;
  for (const [index, spec] of runSpecs.slice(0, receiptSpecLimit).entries()) {
    console.error(`[test]   shard[${index + 1}]=${formatReceiptSpec(spec)}`);
  }
  if (runSpecs.length > receiptSpecLimit) {
    console.error(`[test]   ... ${runSpecs.length - receiptSpecLimit} more shard receipts omitted`);
  }
  console.error(
    `[test]   expected_runtime=${resolveReceiptRuntimeClass(runSpecs, isFullSuiteRun)}`,
  );
  console.error(
    "[test]   known_bad=raw direct Vitest is not the default focused validation path when this wrapper owns the target",
  );
  console.error(
    "[test]   fallback=if this receipt selects the wrong shard or stalls, classify the wrapper/routing issue before retrying raw Vitest as final evidence",
  );
}

async function runVitestSpecsParallel(specs, concurrency) {
  let nextIndex = 0;
  let exitCode = 0;
  const failures = [];
  const results = [];
  const timings = [];

  const runWorker = async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const spec = specs[index];
      if (!spec) {
        return;
      }
      const result = await runLoggedVitestSpec(spec);
      if (!result) {
        return;
      }
      if (result.code !== 0) {
        exitCode = exitCode || result.code;
        failures.push({
          code: result.code,
          config: spec.config,
          includePatterns: spec.includePatterns,
          noOutputTimedOut: result.noOutputTimedOut,
          order: index,
          signal: result.signal,
        });
      }
      results.push(createValidationGateResult(spec, result, index));
      if (result.timing) {
        timings.push(result.timing);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
  return { exitCode, failures, results, timings };
}

async function main() {
  const suiteStartedAtMs = Date.now();
  const suiteStartedAt = performance.now();
  const phaseTimer = createPhaseTimer();
  const rawArgs = process.argv.slice(2);
  if (isWrapperMetadataRequest(rawArgs)) {
    printHelp();
    return;
  }
  const { forwardedArgs: args, planOnly } = extractWrapperPlanMode(rawArgs);
  const baseEnv = resolveLocalVitestEnv(process.env);
  const { targetArgs } = parseTestProjectsArgs(args, process.cwd());
  phaseTimer.mark("parse_args");
  const explicitLiveTargets = findExplicitLiveTestTargets(args, process.cwd());
  if (explicitLiveTargets.length > 0) {
    for (const target of explicitLiveTargets) {
      console.error(`[test] live test target belongs to scripts/test-live.mjs: ${target}`);
    }
    console.error(
      `[test] run: OPENCLAW_LIVE_TEST=1 node scripts/test-live.mjs --no-quiet-live -- ${explicitLiveTargets.join(" ")}`,
    );
    printTestSummary("failed", 1, performance.now() - suiteStartedAt);
    process.exitCode = 1;
    return;
  }
  const unmatchedExplicitTargets = findUnmatchedExplicitTestTargets(args, process.cwd());
  phaseTimer.mark("target_validation");
  if (unmatchedExplicitTargets.length > 0) {
    for (const unmatched of unmatchedExplicitTargets) {
      const suffix = unmatched.includePattern ? ` (${unmatched.includePattern})` : "";
      console.error(
        `[test] explicit test target matched no test files: ${unmatched.target}${suffix}`,
      );
    }
    printTestSummary("failed", 1, performance.now() - suiteStartedAt);
    process.exitCode = 1;
    return;
  }
  const changedTargetArgs =
    targetArgs.length === 0
      ? resolveChangedTargetArgs(args, process.cwd(), undefined, { env: baseEnv })
      : null;
  phaseTimer.mark("resolve_targets");
  const rawRunSpecs =
    targetArgs.length === 0 && changedTargetArgs === null
      ? buildFullSuiteVitestRunPlans(args, process.cwd()).map((plan) => ({
          config: plan.config,
          continueOnFailure: true,
          env: baseEnv,
          includeFilePath: null,
          includePatterns: null,
          pnpmArgs: [
            "exec",
            "node",
            ...resolveVitestNodeArgs(process.env),
            resolveVitestCliEntry(),
            ...(plan.watchMode ? [] : ["run"]),
            "--config",
            plan.config,
            ...plan.forwardedArgs,
          ],
          watchMode: plan.watchMode,
        }))
      : createVitestRunSpecs(args, {
          baseEnv,
          cwd: process.cwd(),
        });
  phaseTimer.mark("create_specs");
  const runSpecs = applyDefaultMultiSpecVitestCachePaths(
    applyDefaultVitestNoOutputTimeout(rawRunSpecs, { env: baseEnv }),
    { cwd: process.cwd(), env: baseEnv },
  );
  phaseTimer.mark("apply_defaults");

  if (runSpecs.length === 0) {
    printNoChangedTestTargets(args, process.cwd(), baseEnv);
    phaseTimer.print("dispatcher phase timings");
    printTestSummary("skipped", 0, performance.now() - suiteStartedAt);
    return;
  }

  const isFullSuiteRun =
    targetArgs.length === 0 &&
    changedTargetArgs === null &&
    !runSpecs.some((spec) => spec.watchMode);
  printValidationReceipt({ changedTargetArgs, isFullSuiteRun, runSpecs, targetArgs });
  if (planOnly) {
    phaseTimer.mark("print_receipt");
    phaseTimer.print("dispatcher plan timings");
    printTestSummary("planned", runSpecs.length, performance.now() - suiteStartedAt);
    return;
  }
  const worktreeBefore = resolveValidationWorktreeIdentity(process.cwd());
  releaseLock = shouldAcquireLocalHeavyCheckLock(runSpecs, baseEnv)
    ? acquireLocalHeavyCheckLockSync({
        cwd: process.cwd(),
        env: baseEnv,
        toolName: "test",
      })
    : () => {};
  phaseTimer.mark("acquire_lock");
  printValidationPreflightReceipt({ cwd: process.cwd(), env: baseEnv, runSpecs });
  printValidationPerformanceProfile({
    isFullSuiteRun,
    preflightEntries: collectValidationPreflightEntries({
      cwd: process.cwd(),
      env: baseEnv,
      runSpecs,
    }),
    runSpecs,
    targetArgs,
  });
  phaseTimer.mark("print_receipts");
  const isExplicitParallelMultiConfigRun =
    Boolean(baseEnv.OPENCLAW_TEST_PROJECTS_PARALLEL) &&
    runSpecs.length > 1 &&
    !runSpecs.some((spec) => spec.watchMode);
  const isTargetedParallelMultiConfigRun =
    !isFullSuiteRun && shouldRunTargetedMultiConfigSpecsInParallel(runSpecs, baseEnv);
  const isParallelShardRun =
    isFullSuiteRun ||
    isFullExtensionsProjectRun(runSpecs) ||
    isExplicitParallelMultiConfigRun ||
    isTargetedParallelMultiConfigRun;
  if (isParallelShardRun) {
    const concurrency = resolveParallelFullSuiteConcurrency(runSpecs.length, baseEnv);
    if (
      !isCiLikeEnv(baseEnv) &&
      runSpecs.length > 1 &&
      (isFullSuiteRun || isFullExtensionsProjectRun(runSpecs))
    ) {
      console.warn(
        `[test] warning: broad local run will start ${runSpecs.length} Vitest shards; use \`pnpm test:changed\` for routine checks.`,
      );
    }
    if (!isCiLikeEnv(baseEnv) && isTargetedParallelMultiConfigRun) {
      console.error(
        `[test] targeted multi-config run will start ${runSpecs.length} Vitest shards; set OPENCLAW_TEST_PROJECTS_SERIAL=1 to force serial.`,
      );
    }
    if (concurrency > 1) {
      const localFullSuiteProfile = resolveLocalFullSuiteProfile(baseEnv);
      const shardTimings = readShardTimings(process.cwd(), baseEnv);
      const parallelSpecs = applyDefaultParallelVitestWorkerBudget(
        applyParallelVitestCachePaths(orderFullSuiteSpecsForParallelRun(runSpecs, shardTimings), {
          cwd: process.cwd(),
          env: baseEnv,
        }),
        baseEnv,
      );
      if (
        !isCiLikeEnv(baseEnv) &&
        !baseEnv.OPENCLAW_TEST_PROJECTS_PARALLEL &&
        !baseEnv.OPENCLAW_VITEST_MAX_WORKERS &&
        !baseEnv.OPENCLAW_TEST_WORKERS &&
        localFullSuiteProfile.shardParallelism === 10 &&
        localFullSuiteProfile.vitestMaxWorkers === 2
      ) {
        console.error("[test] using host-aware local full-suite profile: shards=10 workers=2");
      }
      console.error(
        `[test] running ${parallelSpecs.length} Vitest shards with parallelism ${concurrency}`,
      );
      const {
        exitCode: parallelExitCode,
        failures,
        results,
        timings,
      } = await runVitestSpecsParallel(parallelSpecs, concurrency);
      writeShardTimings(timings, process.cwd(), baseEnv);
      printValidationResultLedger({
        startedAtMs: suiteStartedAtMs,
        endedAtMs: Date.now(),
        worktreeBefore,
        worktreeAfter: resolveValidationWorktreeIdentity(process.cwd()),
        results: results.toSorted((left, right) => left.order - right.order),
      });
      phaseTimer.mark("run_specs");
      phaseTimer.print("dispatcher phase timings");
      printTestSummary(
        parallelExitCode === 0 ? "passed" : "failed",
        parallelSpecs.length,
        performance.now() - suiteStartedAt,
        "Vitest summaries above are per-shard, not aggregate totals.",
      );
      for (const line of formatFailedShardDigest(failures)) {
        console.error(line);
      }
      releaseLockOnce();
      if (parallelExitCode !== 0) {
        process.exit(parallelExitCode);
      }
      return;
    }
  }

  let exitCode = 0;
  const results = [];
  const timings = [];
  for (const [index, spec] of runSpecs.entries()) {
    const result = await runLoggedVitestSpec(spec);
    if (!result) {
      return;
    }
    if (result.timing) {
      timings.push(result.timing);
    }
    results.push(createValidationGateResult(spec, result, index));
    if (result.code !== 0) {
      exitCode = exitCode || result.code;
      if (spec.continueOnFailure !== true) {
        phaseTimer.mark("run_specs");
        printValidationResultLedger({
          startedAtMs: suiteStartedAtMs,
          endedAtMs: Date.now(),
          worktreeBefore,
          worktreeAfter: resolveValidationWorktreeIdentity(process.cwd()),
          results,
        });
        phaseTimer.print("dispatcher phase timings");
        printTestSummary("failed", timings.length, performance.now() - suiteStartedAt);
        releaseLockOnce();
        process.exit(result.code);
      }
    }
  }
  writeShardTimings(timings, process.cwd(), baseEnv);
  printValidationResultLedger({
    startedAtMs: suiteStartedAtMs,
    endedAtMs: Date.now(),
    worktreeBefore,
    worktreeAfter: resolveValidationWorktreeIdentity(process.cwd()),
    results,
  });
  phaseTimer.mark("run_specs");
  phaseTimer.print("dispatcher phase timings");
  printTestSummary(
    exitCode === 0 ? "passed" : "failed",
    timings.length,
    performance.now() - suiteStartedAt,
  );

  releaseLockOnce();
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

function printTestSummary(status, shardCount, durationMs, detail) {
  const suffix = detail ? `; ${detail}` : "";
  console.error(
    `[test] ${status} ${shardCount} Vitest shard${shardCount === 1 ? "" : "s"} in ${formatMs(durationMs)}${suffix}`,
  );
}

main().catch(
  /** @param {unknown} error */ (error) => {
    releaseLockOnce();
    console.error(error);
    process.exit(1);
  },
);
