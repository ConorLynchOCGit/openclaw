import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { resolveAgentProjectRootDir } from "./agent-scope.js";
import { resolveGatewayVisibleSpawnedWorkspaceDir } from "./spawned-context.js";

export type RuntimeWorkspaceSource =
  | "explicit_override"
  | "gateway_visible_project_root"
  | "project_root"
  | "host_operator_repo_root"
  | "host_operator_product_import_root"
  | "host_operator_canonical_repo_root"
  | "process_cwd"
  | "unusable_project_root";

export type RuntimeWorkspaceResolution = {
  agentId: string | null;
  canonicalProjectRoot: string | null;
  gatewayVisibleProjectRoot: string | null;
  readableSourceRootDir: string | null;
  executableWorkspaceDir: string;
  source: RuntimeWorkspaceSource;
};

export type RuntimeWorkspaceLocatorInput = {
  config?: OpenClawConfig;
  agentId?: string | null;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
};

export type RuntimeAgentWorkspaceRoots = {
  agentId: string | null;
  canonicalSourceRoot: string;
  runtimeWorkspaceDir: string;
  transcriptRoot: string;
  artifactRoot: string;
  resolutionSource: RuntimeWorkspaceSource;
};

function normalizeWorkspaceCandidate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? path.resolve(trimmed) : null;
}

function isUsableOpenClawExecutionWorkspaceDir(dir: string): boolean {
  try {
    const resolved = path.resolve(dir);
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return false;
    }
    fs.accessSync(resolved, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
    const packageJson = path.join(resolved, "package.json");
    if (!fs.statSync(packageJson).isFile()) {
      return false;
    }
    fs.accessSync(packageJson, fs.constants.R_OK);
    return [
      path.join(resolved, "src"),
      path.join(resolved, "extensions", "execution-platform"),
    ].some((markerPath) => {
      try {
        return fs.statSync(markerPath).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function isReadableDirectory(dir: string): boolean {
  try {
    const resolved = path.resolve(dir);
    if (!fs.statSync(resolved).isDirectory()) {
      return false;
    }
    fs.accessSync(resolved, fs.constants.R_OK | fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function firstReadableDirectoryCandidate(
  candidates: ReadonlyArray<string | null | undefined>,
): string | null {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const dir = normalizeWorkspaceCandidate(candidate);
    if (!dir || seen.has(dir)) {
      continue;
    }
    seen.add(dir);
    if (isReadableDirectory(dir)) {
      return dir;
    }
  }
  return null;
}

function firstUsableExecutionWorkspaceCandidate(
  candidates: ReadonlyArray<{ dir: string | null | undefined; source: RuntimeWorkspaceSource }>,
): Pick<RuntimeWorkspaceResolution, "executableWorkspaceDir" | "source"> | null {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const dir = normalizeWorkspaceCandidate(candidate.dir);
    if (!dir || seen.has(dir)) {
      continue;
    }
    seen.add(dir);
    if (isUsableOpenClawExecutionWorkspaceDir(dir)) {
      return {
        executableWorkspaceDir: dir,
        source: candidate.source,
      };
    }
  }
  return null;
}

export function resolveRuntimeWorkspaceForAgent(
  input: RuntimeWorkspaceLocatorInput = {},
): RuntimeWorkspaceResolution {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
  const agentId = input.agentId?.trim() || null;
  const explicitOverride = normalizeWorkspaceCandidate(env.OPENCLAW_NODE_EXECUTION_WORKSPACE_DIR);
  const canonicalProjectRoot =
    input.config && agentId
      ? path.resolve(resolveAgentProjectRootDir(input.config, agentId))
      : null;
  const gatewayVisibleProjectRoot = canonicalProjectRoot
    ? normalizeWorkspaceCandidate(
        resolveGatewayVisibleSpawnedWorkspaceDir(canonicalProjectRoot, env),
      )
    : null;

  if (explicitOverride) {
    return {
      agentId,
      canonicalProjectRoot,
      gatewayVisibleProjectRoot,
      readableSourceRootDir: firstReadableDirectoryCandidate([
        gatewayVisibleProjectRoot,
        canonicalProjectRoot,
        explicitOverride,
      ]),
      executableWorkspaceDir: explicitOverride,
      source: "explicit_override",
    };
  }

  const usable = firstUsableExecutionWorkspaceCandidate([
    { dir: gatewayVisibleProjectRoot, source: "gateway_visible_project_root" },
    { dir: canonicalProjectRoot, source: "project_root" },
    { dir: env.OPENCLAW_HOST_OPERATOR_REPO_ROOT, source: "host_operator_repo_root" },
    {
      dir: env.OPENCLAW_HOST_OPERATOR_PRODUCT_IMPORT_ROOT,
      source: "host_operator_product_import_root",
    },
    {
      dir: env.OPENCLAW_HOST_OPERATOR_CANONICAL_REPO_ROOT,
      source: "host_operator_canonical_repo_root",
    },
    { dir: cwd, source: "process_cwd" },
  ]);

  const fallbackDir = path.resolve(canonicalProjectRoot ?? cwd);
  const readableSourceRootDir = firstReadableDirectoryCandidate([
    gatewayVisibleProjectRoot,
    canonicalProjectRoot,
    env.OPENCLAW_HOST_OPERATOR_REPO_ROOT,
    env.OPENCLAW_HOST_OPERATOR_PRODUCT_IMPORT_ROOT,
    cwd,
  ]);
  return {
    agentId,
    canonicalProjectRoot,
    gatewayVisibleProjectRoot,
    readableSourceRootDir,
    executableWorkspaceDir: usable?.executableWorkspaceDir ?? fallbackDir,
    source: usable?.source ?? (canonicalProjectRoot ? "unusable_project_root" : "process_cwd"),
  };
}

export function resolveRuntimeWorkspaceDirForAgent(
  input: RuntimeWorkspaceLocatorInput = {},
): string {
  return resolveRuntimeWorkspaceForAgent(input).executableWorkspaceDir;
}

export function resolveRuntimeSourceRootDirForAgent(
  input: RuntimeWorkspaceLocatorInput = {},
): string {
  const resolution = resolveRuntimeWorkspaceForAgent(input);
  return (
    resolution.readableSourceRootDir ??
    resolution.gatewayVisibleProjectRoot ??
    resolution.canonicalProjectRoot ??
    resolution.executableWorkspaceDir
  );
}

export function resolveGatewayVisibleRuntimePath(
  sourcePath: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.resolve(resolveGatewayVisibleSpawnedWorkspaceDir(sourcePath, env) ?? sourcePath);
}

export function resolveRuntimeAgentWorkspaceRoots(
  input: RuntimeWorkspaceLocatorInput = {},
): RuntimeAgentWorkspaceRoots {
  const env = input.env ?? process.env;
  const agentId = input.agentId?.trim() || null;
  const normalizedAgentId = normalizeAgentId(agentId ?? "unknown-agent");
  const resolution = resolveRuntimeWorkspaceForAgent(input);
  const stateDir = resolveStateDir(env);
  const runtimeRoot = path.join(stateDir, "runtime", "native-execution");
  return {
    agentId,
    canonicalSourceRoot: path.resolve(
      resolution.readableSourceRootDir ??
        resolution.gatewayVisibleProjectRoot ??
        resolution.canonicalProjectRoot ??
        resolution.executableWorkspaceDir,
    ),
    runtimeWorkspaceDir: path.resolve(resolution.executableWorkspaceDir),
    transcriptRoot: path.join(runtimeRoot, "agents", normalizedAgentId, "sessions"),
    artifactRoot: path.join(runtimeRoot, "artifacts"),
    resolutionSource: resolution.source,
  };
}
