#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { writeGateMetricArtifact } from "./lib/gate-metrics.mjs";
import {
  acquireRepoHeavyLock,
  nowIso,
  pathExists,
  readJson,
  ROOT_DIR,
} from "./lib/repo-heavy-task.mjs";
import {
  currentTreeFingerprint,
  loadReusableLatestArtifact,
  stripArtifactEnvelope,
} from "./lib/unchanged-tree-reuse.mjs";

const LOCAL_DIR = path.join(ROOT_DIR, ".local");
const STAMP_PATH = path.join(LOCAL_DIR, "gate-stamps", "check-fast.json");

const gate = process.argv[2];

function log(message) {
  process.stdout.write(`[gate ${nowIso()}] ${message}\n`);
}

function detectTurboCacheMode(env) {
  return env.TURBO_TOKEN && (env.TURBO_TEAM || env.TURBO_API) ? "remote-configured" : "local-only";
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function runCommand(label, command, args, options = {}) {
  const startedAt = Date.now();
  const childEnv = {
    ...process.env,
    ...options.env,
  };
  log(`${label} start: ${[command, ...args].join(" ")}`);
  let runtimePostbuildSubphases = null;
  let capturedStdout = "";
  let capturedStderr = "";
  const phase = {
    label,
    command,
    args,
    startedAt: new Date(startedAt).toISOString(),
    status: "failed",
  };
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: ROOT_DIR,
        stdio: options.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
        env: childEnv,
      });
      if (options.captureOutput) {
        child.stdout?.on("data", (chunk) => {
          const text = chunk.toString();
          capturedStdout += text;
          process.stdout.write(text);
        });
        child.stderr?.on("data", (chunk) => {
          const text = chunk.toString();
          capturedStderr += text;
          process.stderr.write(text);
        });
      }
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
    phase.status = "success";
  } catch (error) {
    phase.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const elapsedMs = Date.now() - startedAt;
    phase.finishedAt = new Date().toISOString();
    phase.elapsedMs = elapsedMs;
    if (typeof options.runtimePostbuildTimingsPath === "string") {
      try {
        runtimePostbuildSubphases = JSON.parse(
          await fs.readFile(options.runtimePostbuildTimingsPath, "utf8"),
        ).phases;
      } catch {}
      await fs.rm(options.runtimePostbuildTimingsPath, { force: true });
    }
    if (runtimePostbuildSubphases) {
      phase.subphases = runtimePostbuildSubphases;
    }
    if (options.detectTurboCacheStatus) {
      const combinedOutput = `${capturedStdout}\n${capturedStderr}`;
      phase.turboCacheStatus = combinedOutput.includes("cache hit")
        ? "hit"
        : combinedOutput.includes("cache miss")
          ? "miss"
          : "unknown";
      phase.turboCacheMode = detectTurboCacheMode(childEnv);
    }
    log(`${label} done (${(elapsedMs / 1000).toFixed(2)}s)`);
  }
  return phase;
}

async function readCheckFastStamp() {
  if (!(await pathExists(STAMP_PATH))) {
    return null;
  }
  try {
    return await readJson(STAMP_PATH);
  } catch {
    return null;
  }
}

async function writeCheckFastStamp(fingerprint) {
  await ensureParentDir(STAMP_PATH);
  await fs.writeFile(
    STAMP_PATH,
    JSON.stringify(
      {
        fingerprint,
        finishedAt: nowIso(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function clearCheckFastStamp() {
  await fs.rm(STAMP_PATH, { force: true });
}

function buildReuseMetadata(latestKey, sourceArtifact) {
  return {
    ...stripArtifactEnvelope(sourceArtifact),
    status: "success",
    reused: true,
    reusedFrom: {
      latestKey,
      recordedAt: sourceArtifact.recordedAt ?? null,
      elapsedMs: sourceArtifact.elapsedMs ?? null,
    },
  };
}

async function runCheckFastRaw(treeFingerprint) {
  const reusable = await loadReusableLatestArtifact("gate-check-fast", treeFingerprint);
  if (reusable) {
    log("reusing existing green check:fast result for unchanged tree");
    return buildReuseMetadata("gate-check-fast", reusable);
  }
  await runCommand("check:fast:raw", "pnpm", ["turbo:repo:check:fast:raw"], {
    captureOutput: true,
    detectTurboCacheStatus: true,
  });
  await writeCheckFastStamp(treeFingerprint);
  return null;
}

async function runCheckTypesRaw(treeFingerprint) {
  const reusable = await loadReusableLatestArtifact("gate-check-types", treeFingerprint);
  if (reusable) {
    log("reusing existing green check:types result for unchanged tree");
    return buildReuseMetadata("gate-check-types", reusable);
  }
  await runCommand("check:types:raw", "pnpm", ["turbo:repo:check:types:raw"], {
    captureOutput: true,
    detectTurboCacheStatus: true,
  });
  return null;
}

async function runCheck(fingerprint) {
  const reusable = await loadReusableLatestArtifact("gate-check", fingerprint);
  if (reusable) {
    log("reusing existing green check result for unchanged tree");
    return buildReuseMetadata("gate-check", reusable);
  }
  const stamp = await readCheckFastStamp();
  let reusedFast = null;
  if (stamp?.fingerprint === fingerprint) {
    log("reusing existing green check:fast result for unchanged tree");
  } else {
    reusedFast = await runCheckFastRaw(fingerprint);
  }
  const reusedTypes = await runCheckTypesRaw(fingerprint);
  if (reusedFast || reusedTypes) {
    return {
      reusedInputs: {
        checkFast: reusedFast?.reusedFrom ?? (stamp?.fingerprint === fingerprint ? "stamp" : null),
        checkTypes: reusedTypes?.reusedFrom ?? null,
      },
    };
  }
  return null;
}

async function runBuildPhases(phases) {
  const results = [];
  for (const [label, command, args] of phases) {
    const runtimePostbuildTimingsPath =
      label === "build:runtime-postbuild"
        ? path.join(
            LOCAL_DIR,
            "gate-metrics",
            "tmp",
            `${gate}-${Date.now()}-runtime-postbuild.json`,
          )
        : null;
    results.push(
      await runCommand(label, command, args, {
        captureOutput:
          command === "pnpm" && typeof args[0] === "string" && args[0].startsWith("turbo:repo:"),
        detectTurboCacheStatus:
          command === "pnpm" && typeof args[0] === "string" && args[0].startsWith("turbo:repo:"),
        env:
          runtimePostbuildTimingsPath === null
            ? undefined
            : { OPENCLAW_RUNTIME_POSTBUILD_TIMINGS_FILE: runtimePostbuildTimingsPath },
        runtimePostbuildTimingsPath: runtimePostbuildTimingsPath ?? undefined,
      }),
    );
  }
  return results;
}

async function main() {
  if (
    gate !== "check-fast" &&
    gate !== "check-types" &&
    gate !== "check" &&
    gate !== "build" &&
    gate !== "build-strict-smoke" &&
    gate !== "build-runtime-fast"
  ) {
    throw new Error(
      "usage: node scripts/run-gate.mjs <check-fast|check-types|check|build|build-strict-smoke|build-runtime-fast>",
    );
  }

  const startedAt = Date.now();
  const treeFingerprint = await currentTreeFingerprint();
  const runMetadata = {
    gate,
    cwd: ROOT_DIR,
    pid: process.pid,
    treeFingerprint,
  };
  let phases = [];
  let status = "failed";
  let failureMessage = null;
  let reuseMetadata = null;
  const releaseLock = await acquireRepoHeavyLock(gate, { log });
  try {
    if (gate === "check-fast") {
      reuseMetadata = await runCheckFastRaw(treeFingerprint);
      status = "success";
      return;
    }
    if (gate === "check-types") {
      await clearCheckFastStamp();
      reuseMetadata = await runCheckTypesRaw(treeFingerprint);
      status = "success";
      return;
    }
    if (gate === "check") {
      reuseMetadata = await runCheck(treeFingerprint);
      status = "success";
      return;
    }
    if (gate === "build-strict-smoke") {
      await clearCheckFastStamp();
      phases = await runBuildPhases([
        ["build:canvas:a2ui:bundle", "pnpm", ["canvas:a2ui:bundle"]],
        ["build:tsdown", "node", ["scripts/tsdown-build.mjs"]],
        ["build:runtime-postbuild", "node", ["scripts/runtime-postbuild.mjs"]],
        ["build:stamp", "node", ["scripts/build-stamp.mjs"]],
        ["build:plugin-sdk:dts", "pnpm", ["turbo:repo:build:plugin-sdk:dts"]],
        [
          "build:plugin-sdk:entry-dts",
          "node",
          ["--import", "tsx", "scripts/write-plugin-sdk-entry-dts.ts"],
        ],
        ["build:plugin-sdk:exports-check", "node", ["scripts/check-plugin-sdk-exports.mjs"]],
      ]);
      status = "success";
      return;
    }
    if (gate === "build-runtime-fast") {
      await clearCheckFastStamp();
      const reusable = await loadReusableLatestArtifact("build-runtime-fast", treeFingerprint);
      if (reusable) {
        log("reusing existing green build:runtime:fast result for unchanged tree");
        reuseMetadata = buildReuseMetadata("build-runtime-fast", reusable);
        status = "success";
        return;
      }
      phases = await runBuildPhases([
        ["build:tsdown:fast", "node", ["scripts/tsdown-build.mjs", "--no-clean"]],
        ["build:runtime-postbuild", "node", ["scripts/runtime-postbuild.mjs"]],
        ["build:stamp", "node", ["scripts/build-stamp.mjs"]],
        ["build:plugin-sdk:dts", "pnpm", ["turbo:repo:build:plugin-sdk:dts"]],
        [
          "build:plugin-sdk:entry-dts",
          "node",
          ["--import", "tsx", "scripts/write-plugin-sdk-entry-dts.ts"],
        ],
        ["build:plugin-sdk:exports-check", "node", ["scripts/check-plugin-sdk-exports.mjs"]],
        ["build:hook-metadata", "node", ["--import", "tsx", "scripts/copy-hook-metadata.ts"]],
        [
          "build:export-html-templates",
          "node",
          ["--import", "tsx", "scripts/copy-export-html-templates.ts"],
        ],
        ["build:write-build-info", "node", ["--import", "tsx", "scripts/write-build-info.ts"]],
        [
          "build:write-cli-startup-metadata",
          "node",
          ["--import", "tsx", "scripts/write-cli-startup-metadata.ts"],
        ],
        ["build:write-cli-compat", "node", ["--import", "tsx", "scripts/write-cli-compat.ts"]],
      ]);
      status = "success";
      return;
    }

    await clearCheckFastStamp();
    const reusable = await loadReusableLatestArtifact("build", treeFingerprint);
    if (reusable) {
      log("reusing existing green build result for unchanged tree");
      reuseMetadata = buildReuseMetadata("build", reusable);
      status = "success";
      return;
    }
    phases = await runBuildPhases([
      ["build:canvas:a2ui:bundle", "pnpm", ["canvas:a2ui:bundle"]],
      ["build:tsdown", "node", ["scripts/tsdown-build.mjs"]],
      ["build:runtime-postbuild", "node", ["scripts/runtime-postbuild.mjs"]],
      ["build:stamp", "node", ["scripts/build-stamp.mjs"]],
      ["build:plugin-sdk:dts", "pnpm", ["turbo:repo:build:plugin-sdk:dts"]],
      [
        "build:plugin-sdk:entry-dts",
        "node",
        ["--import", "tsx", "scripts/write-plugin-sdk-entry-dts.ts"],
      ],
      ["build:plugin-sdk:exports-check", "node", ["scripts/check-plugin-sdk-exports.mjs"]],
      ["build:canvas:a2ui:copy", "node", ["--import", "tsx", "scripts/canvas-a2ui-copy.ts"]],
      ["build:hook-metadata", "node", ["--import", "tsx", "scripts/copy-hook-metadata.ts"]],
      [
        "build:export-html-templates",
        "node",
        ["--import", "tsx", "scripts/copy-export-html-templates.ts"],
      ],
      ["build:write-build-info", "node", ["--import", "tsx", "scripts/write-build-info.ts"]],
      [
        "build:write-cli-startup-metadata",
        "node",
        ["--import", "tsx", "scripts/write-cli-startup-metadata.ts"],
      ],
      ["build:write-cli-compat", "node", ["--import", "tsx", "scripts/write-cli-compat.ts"]],
      ["build:ui", "pnpm", ["turbo:repo:ui:build"]],
    ]);
    status = "success";
  } catch (error) {
    failureMessage = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const finishedAt = Date.now();
    writeGateMetricArtifact(
      gate.startsWith("build") ? "build" : "gate",
      {
        ...runMetadata,
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        elapsedMs: finishedAt - startedAt,
        status,
        ...(failureMessage ? { failureMessage } : {}),
        ...(reuseMetadata ? { reuseMetadata } : {}),
        phases,
      },
      {
        latestKey: gate.startsWith("build") ? gate : `gate-${gate}`,
        historyKey: gate,
      },
    );
    await releaseLock();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
