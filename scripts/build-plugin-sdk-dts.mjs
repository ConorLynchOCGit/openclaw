#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const TSCONFIG_PATH = path.resolve("tsconfig.plugin-sdk.dts.json");
const OUTPUT_DIR = path.resolve("dist/plugin-sdk");
const BUILD_INFO_PATH = path.resolve("dist/plugin-sdk/.tsbuildinfo");
const MANIFEST_PATH = path.resolve(".artifacts/build-cache/plugin-sdk-dts.json");

function loadParsedConfig(tsconfigPath) {
  const readResult = ts.readConfigFile(tsconfigPath, (filePath) => ts.sys.readFile(filePath));
  if (readResult.error) {
    throw new Error(ts.formatDiagnostic(readResult.error, formatHost));
  }
  const configDir = path.dirname(tsconfigPath);
  return ts.parseJsonConfigFileContent(readResult.config, ts.sys, configDir);
}

function fingerprintInputs(parsedConfig) {
  const hash = createHash("sha256");
  hash.update(`tsconfig:${TSCONFIG_PATH}\n`);
  hash.update(fs.readFileSync(TSCONFIG_PATH, "utf8"));
  const fileNames = [...parsedConfig.fileNames].toSorted((left, right) =>
    left.localeCompare(right),
  );
  for (const filePath of fileNames) {
    const stats = fs.statSync(filePath);
    hash.update(
      `${path.relative(process.cwd(), filePath)}:${stats.size}:${Math.trunc(stats.mtimeMs)}\n`,
    );
  }
  return {
    hash: hash.digest("hex"),
    fileCount: fileNames.length,
  };
}

function outputsExist() {
  try {
    return fs.existsSync(OUTPUT_DIR) && fs.readdirSync(OUTPUT_DIR).length > 0;
  } catch {
    return false;
  }
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeManifest(payload) {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

function runTsc() {
  const result = spawnSync("tsc", ["-p", "tsconfig.plugin-sdk.dts.json"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
  return process.exitCode;
}

const formatHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => "\n",
};

function main() {
  const parsedConfig = loadParsedConfig(TSCONFIG_PATH);
  const current = fingerprintInputs(parsedConfig);
  const previous = readManifest();
  if (outputsExist() && previous?.hash === current.hash) {
    console.error(
      `[build:plugin-sdk:dts] inputs unchanged across ${current.fileCount} files; skipping TypeScript declaration emit.`,
    );
    return;
  }

  console.error(
    `[build:plugin-sdk:dts] emitting declarations for ${current.fileCount} input files -> ${path.relative(process.cwd(), OUTPUT_DIR)}`,
  );
  const exitCode = runTsc();
  if (exitCode === 0) {
    writeManifest({
      ...current,
      tsBuildInfoFile: path.relative(process.cwd(), BUILD_INFO_PATH),
      tsBuildInfoPresent: fs.existsSync(BUILD_INFO_PATH),
      generatedAt: new Date().toISOString(),
    });
  }
}

main();
