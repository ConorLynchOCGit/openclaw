#!/usr/bin/env node

import { runNodeStep, runPnpmStep } from "./root-gate-runtime.mjs";

const args = process.argv.slice(2);

if (args.length > 0) {
  runNodeStep(["scripts/build-all.mjs", ...args]);
  process.exit(0);
}

runPnpmStep(["turbo:build"]);
runPnpmStep(["turbo:build:root"]);
