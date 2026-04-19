#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function resolveWorkspaceRoot() {
  const explicit = readArg("--workspace")?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  const envWorkspace = process.env.OPENCLAW_WORKSPACE_DIR?.trim();
  if (envWorkspace) {
    return path.resolve(envWorkspace);
  }
  return path.join(os.homedir(), ".openclaw", "workspace");
}

function resolveDateString() {
  const explicit = readArg("--date")?.trim();
  if (explicit) {
    return explicit;
  }
  return new Date().toISOString().slice(0, 10);
}

function readUtf8IfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

const workspaceRoot = resolveWorkspaceRoot();
const date = resolveDateString();
const memoryPath = path.join(workspaceRoot, "memory", `${date}.md`);
const content = readUtf8IfExists(memoryPath);
const present = typeof content === "string";
const hasHeader = present ? content.includes(`# ${date}`) : false;
const sessionMentions = present ? (content.match(/- \*\*Session ID\*\*:/g) ?? []).length : 0;

const report = {
  workspaceRoot,
  date,
  memoryPath,
  present,
  hasHeader,
  sessionMentions,
};

if (hasFlag("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else if (present) {
  console.log(
    `daily-memory continuity OK: ${memoryPath} (${sessionMentions} session entr${
      sessionMentions === 1 ? "y" : "ies"
    })`,
  );
} else {
  console.error(`daily-memory continuity missing: ${memoryPath}`);
}

if (!present || !hasHeader) {
  process.exitCode = 1;
}
