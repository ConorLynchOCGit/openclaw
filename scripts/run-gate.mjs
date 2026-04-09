#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = path.resolve(new URL("..", import.meta.url).pathname);
const LOCAL_DIR = path.join(ROOT_DIR, ".local");
const LOCK_DIR = path.join(LOCAL_DIR, "gate-locks", "repo-heavy-gate.lock");
const STAMP_PATH = path.join(LOCAL_DIR, "gate-stamps", "check-fast.json");

const gate = process.argv[2];

function nowIso() {
  return new Date().toISOString();
}

function log(message) {
  process.stdout.write(`[gate ${nowIso()}] ${message}\n`);
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function acquireLock(activeGate) {
  await fs.mkdir(path.dirname(LOCK_DIR), { recursive: true });

  for (;;) {
    try {
      await fs.mkdir(LOCK_DIR);
      const metadata = {
        pid: process.pid,
        gate: activeGate,
        startedAt: nowIso(),
        cwd: ROOT_DIR,
      };
      await fs.writeFile(
        path.join(LOCK_DIR, "metadata.json"),
        JSON.stringify(metadata, null, 2),
        "utf8",
      );
      return async () => {
        await fs.rm(LOCK_DIR, { recursive: true, force: true });
      };
    } catch (error) {
      if (!(error instanceof Error) || !String(error.message).includes("EEXIST")) {
        throw error;
      }

      const metadataPath = path.join(LOCK_DIR, "metadata.json");
      let metadata = null;
      if (await pathExists(metadataPath)) {
        try {
          metadata = await readJson(metadataPath);
        } catch {
          metadata = null;
        }
      }

      if (metadata && isPidAlive(metadata.pid)) {
        throw new Error(
          [
            `refusing to start ${activeGate} while another repo gate is running`,
            `heldBy=${metadata.gate ?? "unknown"}`,
            `pid=${String(metadata.pid)}`,
            `startedAt=${metadata.startedAt ?? "unknown"}`,
          ].join(" "),
          { cause: error },
        );
      }

      log("removing stale repo gate lock");
      await fs.rm(LOCK_DIR, { recursive: true, force: true });
    }
  }
}

async function runCommand(label, command, args) {
  const startedAt = Date.now();
  log(`${label} start: ${[command, ...args].join(" ")}`);
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      stdio: "inherit",
      env: process.env,
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
  const elapsedMs = Date.now() - startedAt;
  log(`${label} done (${(elapsedMs / 1000).toFixed(2)}s)`);
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
  for (const [label, command, args] of phases) {
    await runCommand(label, command, args);
  }
}

async function main() {
  if (
    gate !== "check-fast" &&
    gate !== "check-types" &&
    gate !== "check" &&
    gate !== "build" &&
    gate !== "build-strict-smoke"
  ) {
    throw new Error(
      "usage: node scripts/run-gate.mjs <check-fast|check-types|check|build|build-strict-smoke>",
    );
  }

  const releaseLock = await acquireLock(gate);
  try {
    if (gate === "check-fast") {
      await runCheckFastRaw();
      return;
    }
    if (gate === "check-types") {
      await clearCheckFastStamp();
      await runCheckTypesRaw();
      return;
    }
    if (gate === "check") {
      await runCheck();
      return;
    }
    if (gate === "build-strict-smoke") {
      await clearCheckFastStamp();
      await runBuildPhases([
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
      return;
    }

    await clearCheckFastStamp();
    await runBuildPhases([
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
  } finally {
    await releaseLock();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
