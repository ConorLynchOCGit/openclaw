#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { listChangedWorktreePaths } from "./lib/git-worktree-paths.mjs";
import { buildFastTsgoArgs } from "./lib/tsgo-fast-target-config.mjs";

const BROAD_CHANGE_PATTERNS = [
  /^package\.json$/u,
  /^pnpm-lock\.yaml$/u,
  /^turbo\.json$/u,
  /^tsconfig(?:\..+)?\.json$/u,
  /^scripts\/run-tsgo(?:-fast)?\.mjs$/u,
  /^scripts\/lib\/local-heavy-check-runtime\.mjs$/u,
];
const TSGO_TARGET_PATTERNS = [
  /^(?:src|test|extensions|packages|scripts|apps|ui)\/.+\.(?:d\.ts|[cm]?[jt]sx?)$/u,
];

function isBroadChange(filePath) {
  return BROAD_CHANGE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function isTsgoTarget(filePath) {
  return TSGO_TARGET_PATTERNS.some((pattern) => pattern.test(filePath));
}

function main() {
  const changedPaths = listChangedWorktreePaths(process.cwd());
  const broadChange = changedPaths.find(isBroadChange);
  const targets = changedPaths.filter(isTsgoTarget);

  if (broadChange) {
    console.error(
      `[tsgo] fast mode falling back to full-repo verification because ${broadChange} changes repo-wide type-check semantics.`,
    );
  } else if (targets.length === 0) {
    console.error("[tsgo] fast mode found no changed TypeScript-relevant paths; skipping.");
    return;
  } else {
    console.error(
      `[tsgo] fast mode checking ${targets.length} changed path${targets.length === 1 ? "" : "s"}.`,
    );
  }

  const forwardedArgs = buildFastTsgoArgs({
    broadChange: Boolean(broadChange),
    targets,
    userArgs: process.argv.slice(2),
  });
  if (!broadChange) {
    console.error(
      "[tsgo] fast mode generated a targeted tsconfig so TypeScript does not receive file args with --project.",
    );
  }

  const result = spawnSync(process.execPath, ["scripts/run-tsgo.mjs", ...forwardedArgs], {
    stdio: "inherit",
    env: {
      ...process.env,
      OPENCLAW_TSGO_MODE: broadChange ? "fast-fallback-full" : "fast",
    },
  });
  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 1);
}

main();
