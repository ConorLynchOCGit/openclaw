import { createRequire } from "node:module";
import path from "node:path";
import { isCiLikeEnv } from "./lib/vitest-local-scheduling.mjs";
import { spawnPnpmRunner } from "./pnpm-runner.mjs";
import {
  forwardSignalToVitestProcessGroup,
  installVitestProcessGroupCleanup,
  shouldUseDetachedVitestProcessGroup,
} from "./vitest-process-group.mjs";

const FS_MODULE_CACHE_PATH_ENV_KEY = "OPENCLAW_VITEST_FS_MODULE_CACHE_PATH";
const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);
const SUPPRESSED_VITEST_STDERR_PATTERNS = ["[PLUGIN_TIMINGS] Warning:"];
const require = createRequire(import.meta.url);

function isTruthyEnvValue(value) {
  return TRUTHY_ENV_VALUES.has(value?.trim().toLowerCase() ?? "");
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeVitestCachePathSegment(value) {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 180) || "default"
  );
}

function resolveVitestMaxOldSpaceSizeMb(env = process.env) {
  return (
    parsePositiveInt(env.OPENCLAW_VITEST_MAX_OLD_SPACE_SIZE_MB) ??
    parsePositiveInt(env.OPENCLAW_TEST_MAX_OLD_SPACE_SIZE_MB)
  );
}

export function resolveVitestNodeArgs(env = process.env) {
  const args = [];
  const maxOldSpaceSizeMb = resolveVitestMaxOldSpaceSizeMb(env);
  if (maxOldSpaceSizeMb !== null) {
    args.push(`--max-old-space-size=${maxOldSpaceSizeMb}`);
  }
  if (isTruthyEnvValue(env.OPENCLAW_VITEST_ENABLE_MAGLEV)) {
    return args;
  }

  return [...args, "--no-maglev"];
}

export function resolveVitestCliEntry() {
  const vitestPackageJson = require.resolve("vitest/package.json");
  return path.join(path.dirname(vitestPackageJson), "vitest.mjs");
}

export function resolveVitestNoOutputTimeoutMs(env = process.env) {
  return parsePositiveInt(env.OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS);
}

export function resolveVitestCacheIdentity(argv = []) {
  const parts = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") {
      const next = argv[index + 1];
      if (next && !next.startsWith("-")) {
        parts.push(next);
        index += 1;
      }
      continue;
    }
    if (arg.startsWith("--config=")) {
      parts.push(arg.slice("--config=".length));
      continue;
    }
    if (arg === "run" || arg === "watch" || arg.startsWith("-")) {
      continue;
    }
    parts.push(arg);
    if (parts.length >= 3) {
      break;
    }
  }
  return parts.join("--") || "default";
}

export function resolveVitestFsModuleCachePath(argv = [], options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  if (platform === "win32" || isCiLikeEnv(env) || env[FS_MODULE_CACHE_PATH_ENV_KEY]?.trim()) {
    return null;
  }
  const cwd = options.cwd ?? process.cwd();
  const cacheIdentity = sanitizeVitestCachePathSegment(resolveVitestCacheIdentity(argv));
  return path.join(cwd, "node_modules", ".experimental-vitest-cache", cacheIdentity);
}

export function resolveVitestExecutionEnv(argv = [], options = {}) {
  const env = {
    ...(options.env ?? process.env),
  };
  const cachePath = resolveVitestFsModuleCachePath(argv, {
    cwd: options.cwd,
    env,
    platform: options.platform,
  });
  if (cachePath) {
    env[FS_MODULE_CACHE_PATH_ENV_KEY] = cachePath;
  }
  return env;
}

export function resolveVitestSpawnParams(env = process.env, platform = process.platform) {
  return {
    env,
    detached: shouldUseDetachedVitestProcessGroup(platform),
    stdio: ["inherit", "pipe", "pipe"],
  };
}

export function shouldSuppressVitestStderrLine(line) {
  return SUPPRESSED_VITEST_STDERR_PATTERNS.some((pattern) => line.includes(pattern));
}

export function installVitestNoOutputWatchdog(params) {
  const timeoutMs = params.timeoutMs;
  if (!timeoutMs || timeoutMs <= 0) {
    return () => {};
  }

  const setTimeoutFn = params.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = params.clearTimeoutFn ?? clearTimeout;
  const forceKillAfterMs = params.forceKillAfterMs ?? 5_000;
  const streams = params.streams?.filter(Boolean) ?? [];
  const label = params.label?.trim();
  const suffix = label ? ` (${label})` : "";

  let active = true;
  let silenceTimer = null;
  let forceKillTimer = null;

  const clearForceKillTimer = () => {
    if (forceKillTimer !== null) {
      clearTimeoutFn(forceKillTimer);
      forceKillTimer = null;
    }
  };

  const clearSilenceTimer = () => {
    if (silenceTimer !== null) {
      clearTimeoutFn(silenceTimer);
      silenceTimer = null;
    }
  };

  const resetSilenceTimer = () => {
    if (!active) {
      return;
    }
    clearSilenceTimer();
    silenceTimer = setTimeoutFn(() => {
      if (!active) {
        return;
      }
      params.log?.(
        `[vitest] no output for ${timeoutMs}ms; terminating stalled Vitest process group${suffix}.`,
      );
      params.onTimeout?.();
      if (forceKillAfterMs > 0) {
        clearForceKillTimer();
        forceKillTimer = setTimeoutFn(() => {
          if (!active) {
            return;
          }
          params.log?.(
            `[vitest] process group still alive after ${forceKillAfterMs}ms; sending SIGKILL${suffix}.`,
          );
          params.onForceKill?.();
        }, forceKillAfterMs);
      }
    }, timeoutMs);
  };

  const handleActivity = () => {
    clearForceKillTimer();
    resetSilenceTimer();
  };

  const listeners = streams.map((stream) => {
    const handler = () => {
      handleActivity();
    };
    stream.on("data", handler);
    return { stream, handler };
  });

  resetSilenceTimer();

  return () => {
    if (!active) {
      return;
    }
    active = false;
    clearSilenceTimer();
    clearForceKillTimer();
    for (const { stream, handler } of listeners) {
      stream.off("data", handler);
    }
  };
}

export function forwardVitestOutput(stream, target, shouldSuppressLine = () => false) {
  if (!stream) {
    return;
  }

  let buffered = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffered += chunk;
    while (true) {
      const newlineIndex = buffered.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }
      const line = buffered.slice(0, newlineIndex + 1);
      buffered = buffered.slice(newlineIndex + 1);
      if (!shouldSuppressLine(line)) {
        target.write(line);
      }
    }
  });
  stream.on("end", () => {
    if (buffered.length > 0 && !shouldSuppressLine(buffered)) {
      target.write(buffered);
    }
  });
}

function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.length === 0) {
    console.error("usage: node scripts/run-vitest.mjs <vitest args...>");
    process.exit(1);
  }

  const executionEnv = resolveVitestExecutionEnv(argv, { env });
  const spawnParams = resolveVitestSpawnParams(executionEnv);
  const child = spawnPnpmRunner({
    pnpmArgs: [
      "exec",
      "node",
      ...resolveVitestNodeArgs(executionEnv),
      resolveVitestCliEntry(),
      ...argv,
    ],
    ...spawnParams,
  });
  const teardownChildCleanup = installVitestProcessGroupCleanup({ child });
  const teardownNoOutputWatchdog = installVitestNoOutputWatchdog({
    streams: [child.stdout, child.stderr],
    timeoutMs: resolveVitestNoOutputTimeoutMs(executionEnv),
    label: argv.join(" "),
    log: (message) => {
      console.error(message);
    },
    onTimeout: () => {
      forwardSignalToVitestProcessGroup({
        child,
        signal: "SIGTERM",
        kill: process.kill.bind(process),
      });
    },
    onForceKill: () => {
      forwardSignalToVitestProcessGroup({
        child,
        signal: "SIGKILL",
        kill: process.kill.bind(process),
      });
    },
  });
  forwardVitestOutput(child.stdout, process.stdout);
  forwardVitestOutput(child.stderr, process.stderr, shouldSuppressVitestStderrLine);

  child.on("exit", (code, signal) => {
    teardownChildCleanup();
    teardownNoOutputWatchdog();
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    teardownChildCleanup();
    teardownNoOutputWatchdog();
    console.error(error);
    process.exit(1);
  });
}

if (import.meta.main) {
  main();
}
