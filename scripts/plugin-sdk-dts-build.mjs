import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  hashInputs,
  outputsExist,
  readBuildStamp,
  resolveBuildStampPath,
  writeBuildStamp,
} from "./lib/build-fingerprint.mjs";

const ROOT = process.cwd();
const INPUTS = [
  "packages/memory-host-sdk/src",
  "src/plugin-sdk",
  "src/types",
  "tsconfig.json",
  "tsconfig.plugin-sdk.dts.json",
];
const OUTPUTS = [
  "dist/plugin-sdk/src/plugin-sdk/index.d.ts",
  "dist/plugin-sdk/src/plugin-sdk/core.d.ts",
  "dist/plugin-sdk/.tsbuildinfo",
];
const STAMP_PATH = resolveBuildStampPath(ROOT, "plugin-sdk-dts.json");

function currentFingerprint() {
  return hashInputs(ROOT, INPUTS);
}

function runTsc() {
  const result = spawnSync("tsc", ["-p", "tsconfig.plugin-sdk.dts.json"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const fingerprint = currentFingerprint();
const existingStamp = readBuildStamp(STAMP_PATH);

if (existingStamp?.fingerprint === fingerprint && outputsExist(ROOT, OUTPUTS)) {
  process.stdout.write("[plugin-sdk:dts] inputs unchanged, skipping TypeScript declaration emit\n");
  process.exit(0);
}

runTsc();

writeBuildStamp(STAMP_PATH, {
  fingerprint,
  generatedAt: new Date().toISOString(),
  inputs: INPUTS,
  outputs: OUTPUTS,
});
