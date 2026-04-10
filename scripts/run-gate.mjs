#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
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

const LOCAL_DIR = path.join(ROOT_DIR, ".local");
const STAMP_PATH = path.join(LOCAL_DIR, "gate-stamps", "check-fast.json");

const gate = process.argv[2];

function log(message) {
  process.stdout.write(`[gate ${nowIso()}] ${message}\n`);
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
        stdio: "inherit",
        env: childEnv,
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
    log(`${label} done (${(elapsedMs / 1000).toFixed(2)}s)`);
  }
  return phase;
}

async function capture(command, args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed: ${stderr || stdout}`));
    });
  });
}

async function currentTreeFingerprint() {
  const hash = createHash("sha256");
  hash.update(await capture("git", ["rev-parse", "HEAD"]));
  hash.update(await capture("git", ["status", "--porcelain=v1", "--untracked-files=all"]));
  hash.update(await capture("git", ["diff", "--no-ext-diff", "--binary", "HEAD", "--", "."]));

  const untrackedRaw = await capture("git", ["ls-files", "--others", "--exclude-standard", "-z"]);
  const untrackedFiles = untrackedRaw.split("\u0000").filter((value) => value.length > 0);
  for (const relativePath of untrackedFiles) {
    hash.update(relativePath);
    hash.update(await fs.readFile(path.join(ROOT_DIR, relativePath)));
  }

  return hash.digest("hex");
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

async function runCheckFastRaw() {
  await runCommand("check:fast:raw", "pnpm", ["check:fast:raw"]);
  await writeCheckFastStamp(await currentTreeFingerprint());
}

async function runCheckTypesRaw() {
  await runCommand("check:types:raw", "pnpm", ["check:types:raw"]);
}

async function runCheck() {
  const fingerprint = await currentTreeFingerprint();
  const stamp = await readCheckFastStamp();
  if (stamp?.fingerprint === fingerprint) {
    log("reusing existing green check:fast result for unchanged tree");
  } else {
    await runCheckFastRaw();
  }
  await runCheckTypesRaw();
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
  const runMetadata = {
    gate,
    cwd: ROOT_DIR,
    pid: process.pid,
  };
  let phases = [];
  let status = "failed";
  let failureMessage = null;
  const releaseLock = await acquireRepoHeavyLock(gate, { log });
  try {
    if (gate === "check-fast") {
      await runCheckFastRaw();
      status = "success";
      return;
    }
    if (gate === "check-types") {
      await clearCheckFastStamp();
      await runCheckTypesRaw();
      status = "success";
      return;
    }
    if (gate === "check") {
      await runCheck();
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
        ["build:plugin-sdk:dts", "pnpm", ["build:plugin-sdk:dts:raw"]],
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
      phases = await runBuildPhases([
        ["build:tsdown:fast", "node", ["scripts/tsdown-build.mjs", "--no-clean"]],
        ["build:runtime-postbuild", "node", ["scripts/runtime-postbuild.mjs"]],
        ["build:stamp", "node", ["scripts/build-stamp.mjs"]],
        ["build:plugin-sdk:dts", "pnpm", ["build:plugin-sdk:dts:raw"]],
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
    phases = await runBuildPhases([
      ["build:canvas:a2ui:bundle", "pnpm", ["canvas:a2ui:bundle"]],
      ["build:tsdown", "node", ["scripts/tsdown-build.mjs"]],
      ["build:runtime-postbuild", "node", ["scripts/runtime-postbuild.mjs"]],
      ["build:stamp", "node", ["scripts/build-stamp.mjs"]],
      ["build:plugin-sdk:dts", "pnpm", ["build:plugin-sdk:dts:raw"]],
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
      ["build:ui", "pnpm", ["ui:build"]],
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
