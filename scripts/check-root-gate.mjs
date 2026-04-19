#!/usr/bin/env node

import { runPnpmStep } from "./root-gate-runtime.mjs";

runPnpmStep(["check:global"]);
runPnpmStep(["turbo:check"]);
