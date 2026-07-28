#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(pluginDir, "../..");

export function getCodexSystemProfileAssetPaths() {
  return {
    sourceDir: path.join(pluginDir, "system-profile"),
    outputDir: path.join(rootDir, "dist", "extensions", "codex", "system-profile"),
  };
}

function isRelativeWithin(relativePath) {
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

function pathsOverlap(leftDir, rightDir) {
  const left = path.resolve(leftDir);
  const right = path.resolve(rightDir);
  return (
    isRelativeWithin(path.relative(left, right)) || isRelativeWithin(path.relative(right, left))
  );
}

export async function copyCodexSystemProfileAssets({ sourceDir, outputDir }) {
  if (pathsOverlap(sourceDir, outputDir)) {
    throw new Error("Codex system profile source and output directories must not overlap.");
  }

  await fs.stat(path.join(sourceDir, "project", ".codex", "config.toml"));
  await fs.stat(path.join(sourceDir, "tools", "openclaw-repo-workbench.mjs"));
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(outputDir), { recursive: true });
  await fs.cp(sourceDir, outputDir, { recursive: true });
}

async function main() {
  await copyCodexSystemProfileAssets(getCodexSystemProfileAssetPaths());
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(
    /** @param {unknown} error */ (error) => {
      console.error(
        `[copy-codex-system-profile] ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    },
  );
}
