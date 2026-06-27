/**
 * Resolves the managed Codex app-server binary shipped with or installed beside
 * the Codex plugin before stdio startup.
 */
import { constants as fsConstants, readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CodexAppServerStartOptions } from "./config.js";
import { MANAGED_CODEX_APP_SERVER_PACKAGE } from "./version.js";

const CODEX_APP_SERVER_MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const CODEX_PLUGIN_ROOT = resolveDefaultCodexPluginRoot(CODEX_APP_SERVER_MODULE_DIR);

type ManagedCodexAppServerPaths = {
  commandPath: string;
  candidateRoots: string[];
  candidateCommandPaths: string[];
};

type ResolveManagedCodexAppServerOptions = {
  platform?: NodeJS.Platform;
  pluginRoot?: string;
  pathExists?: (filePath: string, platform: NodeJS.Platform) => Promise<boolean>;
};

export type ManagedCodexAppServerRuntimeInspection = {
  packageName: string;
  pluginRoot: string;
  candidateRoots: string[];
  candidateCommandPaths: string[];
  packageJsonPath?: string;
  commandPath?: string;
  ok: boolean;
  error?: string;
};

/** Rewrites managed stdio start options to point at an executable Codex binary path. */
export async function resolveManagedCodexAppServerStartOptions(
  startOptions: CodexAppServerStartOptions,
  options: ResolveManagedCodexAppServerOptions = {},
): Promise<CodexAppServerStartOptions> {
  if (startOptions.transport !== "stdio" || startOptions.commandSource !== "managed") {
    return startOptions;
  }

  const platform = options.platform ?? process.platform;
  const paths = resolveManagedCodexAppServerPaths({
    platform,
    pluginRoot: options.pluginRoot,
  });
  const pathExists = options.pathExists ?? commandPathExists;
  const commandPath = await findManagedCodexAppServerCommandPath({
    candidateCommandPaths: paths.candidateCommandPaths,
    pathExists,
    platform,
  });

  return {
    ...startOptions,
    command: commandPath,
    commandSource: "resolved-managed",
  };
}

/** Returns the preferred and fallback managed Codex binary paths for a plugin root. */
export function resolveManagedCodexAppServerPaths(params: {
  platform?: NodeJS.Platform;
  pluginRoot?: string;
}): ManagedCodexAppServerPaths {
  const platform = params.platform ?? process.platform;
  const pluginRoot = params.pluginRoot ?? CODEX_PLUGIN_ROOT;
  const candidateRoots = resolveManagedCodexAppServerCandidateRoots(pluginRoot, platform);
  const candidateCommandPaths = resolveManagedCodexAppServerCommandCandidatesFromRoots(
    candidateRoots,
    platform,
  );
  return {
    commandPath: candidateCommandPaths[0] ?? "",
    candidateRoots,
    candidateCommandPaths,
  };
}

function resolveManagedCodexAppServerCommandCandidatesFromRoots(
  roots: readonly string[],
  platform: NodeJS.Platform,
): string[] {
  const pathApi = pathForPlatform(platform);
  const commandName = platform === "win32" ? "codex.cmd" : "codex";
  return [
    ...new Set([
      ...roots.map((root) => pathApi.join(root, "node_modules", ".bin", commandName)),
      ...resolveManagedCodexPackageBinCandidates(roots, platform),
    ]),
  ];
}

function resolveDefaultCodexPluginRoot(moduleDir: string): string {
  const moduleBaseName = path.basename(moduleDir);
  if (moduleBaseName === "dist" || moduleBaseName === "dist-runtime") {
    return path.dirname(moduleDir);
  }
  const moduleParent = path.dirname(moduleDir);
  const parentBaseName = path.basename(moduleParent);
  if (parentBaseName === "dist" || parentBaseName === "dist-runtime") {
    return path.dirname(moduleParent);
  }
  const grandParent = path.dirname(moduleParent);
  const grandParentBaseName = path.basename(grandParent);
  if (
    parentBaseName === "src" &&
    (grandParentBaseName === "dist" || grandParentBaseName === "dist-runtime")
  ) {
    return path.dirname(grandParent);
  }
  return path.resolve(moduleDir, "..", "..");
}

function resolveManagedCodexAppServerCandidateRoots(
  pluginRoot: string,
  platform: NodeJS.Platform,
): string[] {
  const pathApi = pathForPlatform(platform);
  const directRoots = [pluginRoot];
  const distPackageRoot = resolveDistExtensionPackageRoot(pluginRoot, platform);
  if (distPackageRoot) {
    directRoots.push(distPackageRoot);
  }
  const sourcePackageRoot = resolveSourceExtensionPackageRoot(pluginRoot, platform);
  if (sourcePackageRoot) {
    directRoots.push(sourcePackageRoot);
  }
  const npmProjectRoot = resolveNearestNodeModulesProjectRoot(pluginRoot, platform);
  if (npmProjectRoot) {
    directRoots.push(npmProjectRoot);
  }
  return [...new Set(directRoots.map((root) => pathApi.resolve(root)))];
}

function resolveNearestNodeModulesProjectRoot(
  root: string,
  platform: NodeJS.Platform,
): string | null {
  const pathApi = pathForPlatform(platform);
  let current = pathApi.resolve(root);
  while (true) {
    if (pathApi.basename(current) === "node_modules") {
      return pathApi.dirname(current);
    }
    const parent = pathApi.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveDistExtensionPackageRoot(
  pluginRoot: string,
  platform: NodeJS.Platform,
): string | null {
  if (!isDistExtensionRoot(pluginRoot, platform)) {
    return null;
  }
  const pathApi = pathForPlatform(platform);
  return pathApi.dirname(pathApi.dirname(pathApi.dirname(pluginRoot)));
}

function resolveSourceExtensionPackageRoot(
  pluginRoot: string,
  platform: NodeJS.Platform,
): string | null {
  const pathApi = pathForPlatform(platform);
  const extensionsDir = pathApi.dirname(pluginRoot);
  if (
    pathApi.basename(pluginRoot) !== "codex" ||
    pathApi.basename(extensionsDir) !== "extensions"
  ) {
    return null;
  }
  const packageRoot = pathApi.dirname(extensionsDir);
  return pathApi.basename(packageRoot) === "dist" ||
    pathApi.basename(packageRoot) === "dist-runtime"
    ? null
    : packageRoot;
}

function resolveManagedCodexPackageBinCandidates(
  roots: readonly string[],
  platform: NodeJS.Platform,
): string[] {
  if (platform === "win32") {
    return [];
  }

  const candidates: string[] = [];
  for (const root of roots) {
    const candidate = resolveManagedCodexPackageBinCandidate(root);
    if (candidate) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

function resolveManagedCodexPackageBinCandidate(root: string): string | null {
  const packageJsonPath = resolveManagedCodexPackageJsonPath(root);
  if (!packageJsonPath) {
    return null;
  }
  try {
    const packageRoot = path.dirname(packageJsonPath);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      bin?: unknown;
    };
    const binPath =
      typeof packageJson.bin === "string"
        ? packageJson.bin
        : isRecord(packageJson.bin) && typeof packageJson.bin.codex === "string"
          ? packageJson.bin.codex
          : null;
    return binPath ? path.resolve(packageRoot, binPath) : null;
  } catch {
    return null;
  }
}

function resolveManagedCodexPackageJsonPath(root: string): string | null {
  try {
    const requireFromRoot = createRequire(path.join(root, "package.json"));
    return requireFromRoot.resolve(`${MANAGED_CODEX_APP_SERVER_PACKAGE}/package.json`);
  } catch {
    return null;
  }
}

function resolveFirstManagedCodexPackageJsonPath(roots: readonly string[]): string | undefined {
  for (const root of roots) {
    const packageJsonPath = resolveManagedCodexPackageJsonPath(root);
    if (packageJsonPath) {
      return packageJsonPath;
    }
  }
  return undefined;
}

export async function inspectManagedCodexAppServerRuntime(
  options: ResolveManagedCodexAppServerOptions = {},
): Promise<ManagedCodexAppServerRuntimeInspection> {
  const platform = options.platform ?? process.platform;
  const pluginRoot = options.pluginRoot ?? CODEX_PLUGIN_ROOT;
  const paths = resolveManagedCodexAppServerPaths({ platform, pluginRoot });
  const pathExists = options.pathExists ?? commandPathExists;
  const packageJsonPath = resolveFirstManagedCodexPackageJsonPath(paths.candidateRoots);
  let commandPath: string | undefined;
  let commandError: string | undefined;
  try {
    commandPath = await findManagedCodexAppServerCommandPath({
      candidateCommandPaths: paths.candidateCommandPaths,
      pathExists,
      platform,
    });
  } catch (error) {
    commandError = error instanceof Error ? error.message : String(error);
  }

  const missing: string[] = [];
  if (!packageJsonPath) {
    missing.push(`${MANAGED_CODEX_APP_SERVER_PACKAGE}/package.json`);
  }
  if (!commandPath) {
    missing.push("executable codex app-server binary");
  }

  return {
    packageName: MANAGED_CODEX_APP_SERVER_PACKAGE,
    pluginRoot,
    candidateRoots: paths.candidateRoots,
    candidateCommandPaths: paths.candidateCommandPaths,
    ...(packageJsonPath ? { packageJsonPath } : {}),
    ...(commandPath ? { commandPath } : {}),
    ok: missing.length === 0,
    ...(missing.length > 0
      ? {
          error:
            commandError ??
            `Managed Codex app-server runtime is incomplete; missing ${missing.join(" and ")}.`,
        }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Internal helpers exposed for managed-binary path-resolution tests. */
export const testing = {
  resolveDefaultCodexPluginRoot,
};

function isDistExtensionRoot(pluginRoot: string, platform: NodeJS.Platform): boolean {
  const pathApi = pathForPlatform(platform);
  const extensionsDir = pathApi.dirname(pluginRoot);
  const distDir = pathApi.dirname(extensionsDir);
  return (
    pathApi.basename(extensionsDir) === "extensions" &&
    (pathApi.basename(distDir) === "dist" || pathApi.basename(distDir) === "dist-runtime")
  );
}

function pathForPlatform(platform: NodeJS.Platform): typeof path {
  return platform === "win32" ? path.win32 : path.posix;
}

async function findManagedCodexAppServerCommandPath(params: {
  candidateCommandPaths: readonly string[];
  pathExists: (filePath: string, platform: NodeJS.Platform) => Promise<boolean>;
  platform: NodeJS.Platform;
}): Promise<string> {
  for (const commandPath of params.candidateCommandPaths) {
    if (await params.pathExists(commandPath, params.platform)) {
      return commandPath;
    }
  }

  throw new Error(
    [
      `Managed Codex app-server binary was not found for ${MANAGED_CODEX_APP_SERVER_PACKAGE}.`,
      "Bundled Codex plugin runtime dependency is missing or incomplete at the declared plugin runtime roots.",
      `Checked: ${params.candidateCommandPaths.join(", ") || "<none>"}.`,
      "Rebuild OpenClaw so the bundled Codex runtime dependency is present, or set plugins.entries.codex.config.appServer.command / OPENCLAW_CODEX_APP_SERVER_BIN as an explicit operator override.",
    ].join(" "),
  );
}

async function commandPathExists(filePath: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    await access(filePath, platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}
export { testing as __testing };
