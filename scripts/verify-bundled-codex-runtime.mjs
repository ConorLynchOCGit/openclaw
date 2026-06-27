#!/usr/bin/env node
// Verifies that the first-party bundled Codex plugin has a complete managed runtime.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const MANAGED_CODEX_PACKAGE = "@openai/codex";

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    pluginRoot: path.join(process.cwd(), "dist", "extensions", "codex"),
    runVersion: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      args.root = argv[++index] ?? "";
      continue;
    }
    if (arg === "--plugin-root") {
      args.pluginRoot = argv[++index] ?? "";
      continue;
    }
    if (arg === "--skip-version") {
      args.runVersion = false;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveCodexPackageJson(root) {
  const requireFromRoot = createRequire(path.join(root, "package.json"));
  return requireFromRoot.resolve(`${MANAGED_CODEX_PACKAGE}/package.json`);
}

function resolveCodexBinary(packageJsonPath) {
  const packageRoot = path.dirname(packageJsonPath);
  const packageJson = readJson(packageJsonPath);
  const binPath =
    typeof packageJson.bin === "string"
      ? packageJson.bin
      : packageJson.bin && typeof packageJson.bin.codex === "string"
        ? packageJson.bin.codex
        : "";
  if (!binPath) {
    throw new Error(`${MANAGED_CODEX_PACKAGE} package has no codex bin entry`);
  }
  return path.resolve(packageRoot, binPath);
}

function assertExecutable(filePath) {
  fs.accessSync(filePath, fs.constants.X_OK);
}

export function verifyBundledCodexRuntime(params) {
  const root = path.resolve(params.root);
  const pluginRoot = path.resolve(params.pluginRoot);
  const pluginManifestPath = path.join(pluginRoot, "openclaw.plugin.json");
  const pluginPackagePath = path.join(pluginRoot, "package.json");
  if (!fs.existsSync(pluginManifestPath)) {
    throw new Error(`missing bundled Codex plugin manifest: ${pluginManifestPath}`);
  }
  if (!fs.existsSync(pluginPackagePath)) {
    throw new Error(`missing bundled Codex plugin package: ${pluginPackagePath}`);
  }

  const codexPackageJsonPath = resolveCodexPackageJson(root);
  const codexBinaryPath = resolveCodexBinary(codexPackageJsonPath);
  assertExecutable(codexBinaryPath);

  let version = "";
  if (params.runVersion !== false) {
    version = execFileSync(codexBinaryPath, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15_000,
    }).trim();
    if (!version) {
      throw new Error(`${MANAGED_CODEX_PACKAGE} binary produced empty --version output`);
    }
  }

  return {
    status: "ready",
    root,
    pluginRoot,
    packageJsonPath: codexPackageJsonPath,
    binaryPath: codexBinaryPath,
    ...(version ? { version } : {}),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = verifyBundledCodexRuntime(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`verify-bundled-codex-runtime: ${message}\n`);
    process.exit(1);
  }
}
