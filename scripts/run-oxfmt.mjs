#!/usr/bin/env node

// Runs oxfmt through the local installed binary without invoking pnpm/corepack.
import path from "node:path";
import { runManagedCommand } from "./lib/managed-child-process.mjs";

const root = path.resolve(import.meta.dirname, "..");
const oxfmtPath = path.join(root, "node_modules", "oxfmt", "bin", "oxfmt");

function hasThreadsArg(args) {
  return args.some((arg) => arg === "--threads" || arg.startsWith("--threads="));
}

const args = process.argv.slice(2);
const finalArgs = hasThreadsArg(args) ? args : ["--threads=1", ...args];

process.exitCode = await runManagedCommand({
  bin: process.execPath,
  args: [oxfmtPath, ...finalArgs],
  cwd: root,
  env: process.env,
});
