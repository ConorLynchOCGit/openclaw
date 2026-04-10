#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { writeGateMetricArtifact } from "./lib/gate-metrics.mjs";
import { acquireRepoHeavyLock, ROOT_DIR, nowIso } from "./lib/repo-heavy-task.mjs";

const DEFAULT_PORT = 19089;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_INTERVAL_MS = 500;
const DEFAULT_PROBE_PATH = "/healthz";

function log(message) {
  process.stdout.write(`[runtime-proof ${nowIso()}] ${message}\n`);
}

export function parseRuntimeProofFastArgs(argv) {
  const args = {
    port: DEFAULT_PORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    intervalMs: DEFAULT_INTERVAL_MS,
    skipBuild: false,
    reset: false,
    probePath: DEFAULT_PROBE_PATH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--skip-build") {
      args.skipBuild = true;
      continue;
    }
    if (arg === "--reset") {
      args.reset = true;
      continue;
    }
    if (arg === "--port") {
      args.port = Number.parseInt(argv[index + 1] ?? "", 10) || DEFAULT_PORT;
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      args.timeoutMs = Number.parseInt(argv[index + 1] ?? "", 10) || DEFAULT_TIMEOUT_MS;
      index += 1;
      continue;
    }
    if (arg === "--interval-ms") {
      args.intervalMs = Number.parseInt(argv[index + 1] ?? "", 10) || DEFAULT_INTERVAL_MS;
      index += 1;
      continue;
    }
    if (arg === "--probe-path") {
      args.probePath = argv[index + 1] ?? DEFAULT_PROBE_PATH;
      index += 1;
      continue;
    }
    throw new Error(
      `Unknown argument ${arg}. Supported flags: --skip-build, --reset, --port <n>, --timeout-ms <ms>, --interval-ms <ms>, --probe-path <path>.`,
    );
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForHttpReady(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const startedAtMs = Date.now();
  let attempts = 0;
  let lastError = "no response";

  while (Date.now() - startedAtMs < timeoutMs) {
    attempts += 1;
    const attemptStartedAtMs = Date.now();
    try {
      const response = await fetch(url);
      if (response.ok) {
        return {
          attempts,
          elapsedMs: Date.now() - startedAtMs,
          lastStatus: response.status,
          lastAttemptElapsedMs: Date.now() - attemptStartedAtMs,
        };
      }
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(intervalMs);
  }

  throw new Error(`timed out waiting for ${url} after ${timeoutMs}ms: ${lastError}`);
}

async function runCommand(label, command, args, env = process.env) {
  const startedAtMs = Date.now();
  log(`${label} start: ${[command, ...args].join(" ")}`);
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      stdio: "inherit",
      env,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(
        new Error(
          `${label} failed with ${signal ? `signal ${signal}` : `exit code ${String(code)}`}`,
        ),
      );
    });
  });
  const elapsedMs = Date.now() - startedAtMs;
  log(`${label} done (${(elapsedMs / 1000).toFixed(2)}s)`);
  return elapsedMs;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      resolve(undefined);
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(undefined);
    });
    try {
      child.kill("SIGTERM");
    } catch {
      clearTimeout(timer);
      resolve(undefined);
    }
  });
}

export async function runRuntimeProofFast(options = {}) {
  const port = options.port ?? DEFAULT_PORT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const probePath = options.probePath ?? DEFAULT_PROBE_PATH;
  const proofRoot = path.join(ROOT_DIR, ".local", "runtime-proof-fast");
  const configDir = path.join(proofRoot, "config");
  const logDir = path.join(proofRoot, "logs");
  const configPath = path.join(configDir, "openclaw.json");
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  const gatewayLogPath = path.join(logDir, "latest.log");
  const gatewayLogStream = fs.createWriteStream(gatewayLogPath, { flags: "w" });

  const baseUrl = `http://127.0.0.1:${String(port)}`;
  const startedAtMs = Date.now();
  const artifactBase = {
    mode: "non-production-proof",
    baseUrl,
    port,
    configDir,
    configPath,
    gatewayLogPath,
    probePath,
  };

  let status = "failed";
  let failureMessage = null;
  let buildElapsedMs = 0;
  let launchElapsedMs = 0;
  let readyElapsedMs = 0;
  let healthElapsedMs = 0;
  let gatewayChild = null;

  let releaseLock = async () => {};
  try {
    if (!options.skipBuild) {
      buildElapsedMs = await runCommand("build:runtime:fast", "pnpm", ["build:runtime:fast"]);
    }
    releaseLock = await acquireRepoHeavyLock("runtime-proof-fast", { log });

    const gatewayArgs = [
      "dist/index.js",
      "gateway",
      "--dev",
      "--allow-unconfigured",
      "--bind",
      "loopback",
      "--port",
      String(port),
    ];
    if (options.reset) {
      gatewayArgs.push("--reset");
    }
    const launchStartedAtMs = Date.now();
    gatewayChild = spawn("node", gatewayArgs, {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        OPENCLAW_HOME: proofRoot,
        OPENCLAW_STATE_DIR: configDir,
        OPENCLAW_CONFIG_PATH: configPath,
        OPENCLAW_CONFIG_DIR: configDir,
        OPENCLAW_SKIP_CHANNELS: "1",
        OPENCLAW_GATEWAY_TOKEN: "runtime-proof-fast-token",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    gatewayChild.stdout?.pipe(gatewayLogStream);
    gatewayChild.stderr?.pipe(gatewayLogStream);
    launchElapsedMs = Date.now() - launchStartedAtMs;

    const ready = await waitForHttpReady(`${baseUrl}/readyz`, {
      timeoutMs,
      intervalMs,
    });
    readyElapsedMs = ready.elapsedMs;

    const healthStartedAtMs = Date.now();
    const probe = await fetch(`${baseUrl}${probePath}`);
    if (!probe.ok) {
      throw new Error(`probe ${probePath} failed with status ${probe.status}`);
    }
    healthElapsedMs = Date.now() - healthStartedAtMs;
    status = "success";
  } catch (error) {
    failureMessage = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await stopChild(gatewayChild);
    gatewayLogStream.end();
    const finishedAtMs = Date.now();
    writeGateMetricArtifact(
      "runtime-proof",
      {
        ...artifactBase,
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: new Date(finishedAtMs).toISOString(),
        elapsedMs: finishedAtMs - startedAtMs,
        buildElapsedMs,
        launchElapsedMs,
        readyElapsedMs,
        proofCheckElapsedMs: healthElapsedMs,
        status,
        ...(failureMessage ? { failureMessage } : {}),
      },
      {
        latestKey: "runtime-proof",
        historyKey: "runtime-proof",
      },
    );
    await releaseLock();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runRuntimeProofFast(parseRuntimeProofFastArgs(process.argv.slice(2))).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
