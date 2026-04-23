#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const isFast = process.argv.includes("--fast");

const steps = [
  { label: "runtime-postbuild", args: ["scripts/runtime-postbuild.mjs"] },
  {
    label: "write-npm-update-compat-sidecars",
    args: ["--import", "tsx", "scripts/write-npm-update-compat-sidecars.ts"],
  },
  { label: "build-stamp", args: ["scripts/build-stamp.mjs"] },
  ...(!isFast
    ? [
        {
          label: "write-plugin-sdk-entry-dts",
          args: ["--import", "tsx", "scripts/write-plugin-sdk-entry-dts.ts"],
        },
        { label: "check-plugin-sdk-exports", args: ["scripts/check-plugin-sdk-exports.mjs"] },
      ]
    : []),
  { label: "canvas-a2ui-copy", args: ["--import", "tsx", "scripts/canvas-a2ui-copy.ts"] },
  { label: "copy-hook-metadata", args: ["--import", "tsx", "scripts/copy-hook-metadata.ts"] },
  {
    label: "copy-export-html-templates",
    args: ["--import", "tsx", "scripts/copy-export-html-templates.ts"],
  },
  { label: "write-build-info", args: ["--import", "tsx", "scripts/write-build-info.ts"] },
  {
    label: "write-cli-startup-metadata",
    args: ["--experimental-strip-types", "scripts/write-cli-startup-metadata.ts"],
  },
  { label: "write-cli-compat", args: ["--import", "tsx", "scripts/write-cli-compat.ts"] },
];

for (const step of steps) {
  console.error(`[build:root:postbuild] ${step.label}`);
  const result = spawnSync(process.execPath, step.args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}
