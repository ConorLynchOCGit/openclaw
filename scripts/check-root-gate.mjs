#!/usr/bin/env node

import { runPnpmStep } from "./root-gate-runtime.mjs";

const isFast = process.argv.includes("--fast");

if (isFast) {
  runPnpmStep(["check:fast"]);
  process.exit(0);
}

runPnpmStep(["check:global"]);
runPnpmStep(["turbo:check"]);
