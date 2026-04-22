#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_PATHS = {
  liveComposeRoot: "/root/services/openclaw-roles/live",
  workspaceRoot: "/root/.openclaw/workspace",
  runtimeStateRoot: "/root/.openclaw",
  backupsRoot: "/root/backups",
};

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    outPath: outIndex >= 0 ? path.resolve(argv[outIndex + 1] ?? "") : null,
    pretty: !argv.includes("--compact"),
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${command} ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function tryRun(command, args, fallback = "") {
  try {
    return run(command, args);
  } catch {
    return fallback;
  }
}

function parseJsonLines(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parseCrontab(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function inspectDocker(kind, name) {
  const output = tryRun("docker", [kind, "inspect", name], "[]");
  return JSON.parse(output)[0] ?? null;
}

function volumeSizeBytes(name) {
  const raw = tryRun("du", ["-sb", `/var/lib/docker/volumes/${name}/_data`], "0");
  return Number(raw.split(/\s+/)[0] ?? 0);
}

function duRows(targetPath) {
  return tryRun("bash", ["-lc", `du -xhd1 ${targetPath} 2>/dev/null | sort -h`], "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [size, rowPath] = line.split("\t");
      return { size, path: rowPath };
    });
}

export async function collectBuildRuntimeInventory() {
  const dockerDfRows = parseJsonLines(
    tryRun("docker", ["system", "df", "--format", "{{json .}}"], ""),
  );
  const containers = parseJsonLines(tryRun("docker", ["ps", "-a", "--format", "{{json .}}"], ""));
  const images = parseJsonLines(
    tryRun("docker", ["image", "ls", "-a", "--format", "{{json .}}"], ""),
  );
  const networks = parseJsonLines(
    tryRun("docker", ["network", "ls", "--format", "{{json .}}"], ""),
  ).map((row) => {
    const inspect = inspectDocker("network", row.Name);
    return {
      name: row.Name,
      driver: row.Driver,
      scope: row.Scope,
      containerCount: Object.keys(inspect?.Containers ?? {}).length,
    };
  });

  const volumeNames = tryRun("docker", ["volume", "ls", "-q"], "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const danglingNames = tryRun("docker", ["volume", "ls", "-qf", "dangling=true"], "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const danglingAnonymous = danglingNames
    .map((name) => ({ name, inspect: inspectDocker("volume", name) }))
    .filter((entry) => Object.hasOwn(entry.inspect?.Labels ?? {}, "com.docker.volume.anonymous"))
    .map((entry) => entry.name);

  const liveContainer =
    inspectDocker("container", "openclaw-runtime") ??
    containers
      .map((row) => inspectDocker("container", row.Names))
      .find((row) => row?.Config?.Labels?.["com.docker.compose.service"] === "openclaw-gateway") ??
    null;

  return {
    generatedAtUtc: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
    },
    paths: DEFAULT_PATHS,
    disk: {
      filesystem: tryRun("df", ["-hT", "/"], ""),
      rootTopLevel: duRows("/root"),
      varTopLevel: duRows("/var"),
      dockerTopLevel: duRows("/var/lib/docker"),
    },
    repos: {
      liveDeploymentRepo: {
        path: DEFAULT_PATHS.liveComposeRoot,
        gitStatus: tryRun(
          "git",
          ["-C", DEFAULT_PATHS.liveComposeRoot, "status", "--short", "--branch"],
          "",
        ),
      },
      workspaceRepo: {
        path: DEFAULT_PATHS.workspaceRoot,
        gitStatus: tryRun(
          "git",
          ["-C", DEFAULT_PATHS.workspaceRoot, "status", "--short", "--branch"],
          "",
        ),
      },
    },
    cron: {
      rootCrontab: parseCrontab(tryRun("crontab", ["-l"], "")),
      cronDOpenClawOperator: tryRun(
        "bash",
        ["-lc", "sed -n '1,200p' /etc/cron.d/openclaw-operator"],
        "",
      ),
    },
    docker: {
      systemDf: dockerDfRows,
      containers,
      images,
      networks,
      volumes: {
        totalCount: volumeNames.length,
        danglingCount: danglingNames.length,
        danglingAnonymousCount: danglingAnonymous.length,
        danglingAnonymousBytes: danglingAnonymous.reduce(
          (sum, name) => sum + volumeSizeBytes(name),
          0,
        ),
      },
    },
    liveRuntime: liveContainer
      ? {
          containerName: liveContainer.Name?.replace(/^\//, "") ?? null,
          image: liveContainer.Config?.Image ?? null,
          service: liveContainer.Config?.Labels?.["com.docker.compose.service"] ?? null,
          project: liveContainer.Config?.Labels?.["com.docker.compose.project"] ?? null,
          status: liveContainer.State?.Status ?? null,
          health: liveContainer.State?.Health?.Status ?? null,
          labels: liveContainer.Config?.Labels ?? {},
        }
      : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inventory = await collectBuildRuntimeInventory();
  const output = JSON.stringify(inventory, null, args.pretty ? 2 : 0);
  if (args.outPath) {
    await fs.mkdir(path.dirname(args.outPath), { recursive: true });
    await fs.writeFile(args.outPath, `${output}\n`, "utf8");
  }
  process.stdout.write(`${output}\n`);
}

const invokedPath = process.argv[1] ? new URL(`file://${process.argv[1]}`).href : null;
if (invokedPath && import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
