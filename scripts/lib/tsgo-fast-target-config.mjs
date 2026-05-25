import fs from "node:fs";
import path from "node:path";

export const FAST_TSGO_BUILD_INFO_FILE = ".artifacts/tsgo-cache/root-fast.tsbuildinfo";
export const FAST_TSGO_TARGET_CONFIG_FILE =
  ".artifacts/tsgo-cache/root-fast-targeted.tsconfig.json";

export function buildTargetedTsgoConfig({ cwd, targets }) {
  const root = path.resolve(cwd);
  const absoluteTargets = targets.map((target) => path.resolve(root, target));
  const configDir = path.dirname(path.resolve(root, FAST_TSGO_TARGET_CONFIG_FILE));
  return {
    extends: path.relative(configDir, path.resolve(root, "tsconfig.json")),
    files: absoluteTargets,
  };
}

export function writeTargetedTsgoConfig({ cwd, targets }) {
  const configPath = path.resolve(cwd, FAST_TSGO_TARGET_CONFIG_FILE);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const config = buildTargetedTsgoConfig({ cwd, targets });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return {
    configPath,
    relativeConfigPath: path.relative(cwd, configPath),
    targetCount: targets.length,
  };
}

export function filterFullRepoFallbackArgs(userArgs = []) {
  const flagsWithValue = new Set([
    "--pretty",
    "--diagnostics",
    "--extendedDiagnostics",
    "--generateTrace",
    "--traceResolution",
  ]);
  const filtered = [];
  let keepNextValue = false;
  for (const arg of userArgs) {
    if (typeof arg !== "string" || arg.length === 0 || arg === "--") {
      keepNextValue = false;
      continue;
    }
    if (arg.startsWith("-")) {
      filtered.push(arg);
      keepNextValue = flagsWithValue.has(arg);
      continue;
    }
    if (keepNextValue) {
      filtered.push(arg);
    }
    keepNextValue = false;
  }
  return filtered;
}

export function buildFastTsgoArgs({ broadChange, targets, userArgs = [] }) {
  if (broadChange) {
    return filterFullRepoFallbackArgs(userArgs);
  }
  const { relativeConfigPath } = writeTargetedTsgoConfig({ cwd: process.cwd(), targets });
  return [
    "--project",
    relativeConfigPath,
    "--incremental",
    "--tsBuildInfoFile",
    FAST_TSGO_BUILD_INFO_FILE,
    ...userArgs,
  ];
}
