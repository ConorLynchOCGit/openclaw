#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readlinkSync } from "node:fs";
import process from "node:process";
import { readRepoHeavyLock, ROOT_DIR } from "./lib/repo-heavy-task.mjs";

const asJson = process.argv.includes("--json");

function readProcCwd(pid) {
  try {
    return process.platform === "linux" ? readlinkSync(`/proc/${pid}/cwd`) : null;
  } catch {
    return null;
  }
}

function listRelevantProcesses() {
  const result = spawnSync("ps", ["-eo", "pid=,etimes=,args="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "ps failed");
  }

  const rows = [];
  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const match = trimmed.match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) {
      continue;
    }
    const pid = Number(match[1]);
    const elapsedSeconds = Number(match[2]);
    const command = match[3];
    const cwd = readProcCwd(pid);
    const matchesCommand =
      command.includes("scripts/run-gate.mjs") ||
      command.includes("scripts/test-parallel.mjs") ||
      command.includes("pnpm test") ||
      command.includes("pnpm check") ||
      command.includes("pnpm build") ||
      command.includes("tsgo") ||
      command.includes("oxlint") ||
      command.includes("vitest");
    if (!(matchesCommand && (cwd === ROOT_DIR || command.includes(ROOT_DIR)))) {
      continue;
    }
    rows.push({ pid, elapsedSeconds, cwd, command });
  }
  return rows;
}

const lock = await readRepoHeavyLock();
const processes = listRelevantProcesses();
const status = {
  repoRoot: ROOT_DIR,
  lock,
  processes,
};

if (asJson) {
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
  process.exit(0);
}

process.stdout.write(`repoRoot: ${status.repoRoot}\n`);
if (!lock) {
  process.stdout.write("lock: none\n");
} else {
  process.stdout.write(
    `lock: task=${lock.task ?? "unknown"} pid=${String(lock.pid ?? "unknown")} active=${lock.active ? "yes" : "no"} startedAt=${lock.startedAt ?? "unknown"}\n`,
  );
}

if (processes.length === 0) {
  process.stdout.write("processes: none\n");
  process.exit(0);
}

process.stdout.write("processes:\n");
for (const row of processes) {
  process.stdout.write(
    `- pid=${row.pid} elapsed=${row.elapsedSeconds}s cwd=${row.cwd ?? "unknown"} cmd=${row.command}\n`,
  );
}
