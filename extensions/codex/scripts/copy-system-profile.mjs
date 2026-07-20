#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(pluginDir, "../..");

/** Copies the immutable Codex profile into the bundled plugin output. */
export async function copyCodexSystemProfile({ srcDir, outDir }) {
  await fs.stat(path.join(srcDir, "project", ".codex", "config.toml"));
  await fs.rm(outDir, { force: true, recursive: true });
  await fs.mkdir(path.dirname(outDir), { recursive: true });
  await fs.cp(srcDir, outDir, { recursive: true });
}

async function main() {
  await copyCodexSystemProfile({
    srcDir: path.join(pluginDir, "system-profile"),
    outDir: path.join(rootDir, "dist", "extensions", "codex", "system-profile"),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
