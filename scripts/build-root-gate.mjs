#!/usr/bin/env node

import { runNodeStep, runPnpmStep } from "./root-gate-runtime.mjs";

const args = process.argv.slice(2);
const isFast = args.includes("--fast");

if (args.length > 0) {
  const forwardedArgs = args.filter((arg) => arg !== "--fast");
  if (forwardedArgs.length > 0) {
    runNodeStep(["scripts/build-all.mjs", ...forwardedArgs]);
    process.exit(0);
  }
}

if (isFast) {
  runPnpmStep(["turbo:build"]);
  runPnpmStep(["build:root:canvas-a2ui-bundle"]);
  runPnpmStep(["build:root:tsdown"]);
  runPnpmStep(["build:root:postbuild:fast"]);
  process.exit(0);
}

runPnpmStep(["turbo:build"]);
runPnpmStep(["turbo:build:root"]);
