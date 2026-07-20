import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV } from "../agents/system-change-source.js";
import { RELEASE_STORE_ROOT_ENV, resolveReleaseStoreRoot } from "./accepted-release-receipt.js";
import { resolveReleasePreparationAuthority } from "./release-preparation-authority.js";
import {
  deriveReleasePreparationOperationId,
  readOperationJson,
  resolveReleasePreparationOperationPaths,
} from "./release-preparation-store.js";
import {
  parseReleasePreparationResult,
  type ReleasePreparationResult,
} from "./release-preparation.js";

const execFileAsync = promisify(execFile);
const FIXED_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const SYSTEMD_RUN_PATHS = ["/usr/bin/systemd-run", "/bin/systemd-run"] as const;
const SYSTEMCTL_PATHS = ["/usr/bin/systemctl", "/bin/systemctl"] as const;
const ENV_PATHS = ["/usr/bin/env", "/bin/env"] as const;
const RELEASE_GIT_CREDENTIAL = "release-git-token";

type FixedCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type ReleasePreparationHandoffDeps = {
  runCommand: (
    command: string,
    args: string[],
    options: { cwd?: string; env: NodeJS.ProcessEnv },
  ) => Promise<FixedCommandResult>;
  resolveAuthority: typeof resolveReleasePreparationAuthority;
  readResult: (filePath: string) => Promise<unknown>;
  access: typeof fs.access;
  lstat: typeof fs.lstat;
};

export type ReleasePreparationHandoffResult = {
  status: "started" | "running" | "accepted";
  operationId: string;
  unitName: string;
  acceptedReleaseReceiptId?: string;
};

async function defaultRunCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env: NodeJS.ProcessEnv },
): Promise<FixedCommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 256 * 1024,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      code?: string | number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message,
    };
  }
}

function defaultDeps(): ReleasePreparationHandoffDeps {
  return {
    runCommand: defaultRunCommand,
    resolveAuthority: resolveReleasePreparationAuthority,
    readResult: readOperationJson,
    access: fs.access,
    lstat: fs.lstat,
  };
}

function copyDefined(
  target: NodeJS.ProcessEnv,
  source: NodeJS.ProcessEnv,
  keys: readonly string[],
): void {
  for (const key of keys) {
    const value = source[key]?.trim();
    if (value) {
      target[key] = value;
    }
  }
}

/** Build the only environment release preparation is allowed to consume. */
export function buildReleasePreparationEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const releaseStoreRoot = resolveReleaseStoreRoot(source);
  const home = source.HOME?.trim() || os.homedir();
  const cacheRoot = path.join(releaseStoreRoot, "cache");
  const env: NodeJS.ProcessEnv = {
    PATH: FIXED_PATH,
    HOME: home,
    USER: source.USER?.trim() || "openclaw-next",
    LOGNAME: source.LOGNAME?.trim() || source.USER?.trim() || "openclaw-next",
    LANG: source.LANG?.trim() || "C.UTF-8",
    TMPDIR: source.TMPDIR?.trim() || os.tmpdir(),
    [RELEASE_STORE_ROOT_ENV]: releaseStoreRoot,
    NPM_CONFIG_CACHE: source.NPM_CONFIG_CACHE?.trim() || path.join(cacheRoot, "npm"),
    COREPACK_HOME: source.COREPACK_HOME?.trim() || path.join(cacheRoot, "corepack"),
    PNPM_HOME: source.PNPM_HOME?.trim() || path.join(cacheRoot, "pnpm"),
    XDG_CACHE_HOME: source.XDG_CACHE_HOME?.trim() || path.join(cacheRoot, "xdg-cache"),
    XDG_CONFIG_HOME: source.XDG_CONFIG_HOME?.trim() || path.join(cacheRoot, "xdg-config"),
    XDG_DATA_HOME: source.XDG_DATA_HOME?.trim() || path.join(cacheRoot, "xdg-data"),
  };
  copyDefined(env, source, [
    "LC_ALL",
    "XDG_RUNTIME_DIR",
    "OPENCLAW_HOME",
    "OPENCLAW_STATE_DIR",
    "OPENCLAW_CONFIG_PATH",
    "OPENCLAW_WORKSPACE_DIR",
    OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV,
    "OPENCLAW_RELEASE_TAG_REMOTE",
    "CREDENTIALS_DIRECTORY",
  ]);
  return env;
}

async function resolveFixedExecutable(
  candidates: readonly string[],
  deps: Pick<ReleasePreparationHandoffDeps, "access">,
): Promise<string> {
  for (const candidate of candidates) {
    try {
      await deps.access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next fixed distribution path.
    }
  }
  throw new Error(`required executable is unavailable: ${candidates.join(", ")}`);
}

function unitNameForOperation(operationId: string): string {
  return `openclaw-release-prepare-${operationId.slice(0, 40)}.service`;
}

function launcherEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {
    PATH: "/usr/bin:/bin",
    HOME: env.HOME,
    XDG_RUNTIME_DIR: env.XDG_RUNTIME_DIR,
  };
  copyDefined(result, env, ["DBUS_SESSION_BUS_ADDRESS", "LANG", "LC_ALL"]);
  return result;
}

async function credentialSource(
  env: NodeJS.ProcessEnv,
  deps: Pick<ReleasePreparationHandoffDeps, "lstat">,
): Promise<string | null> {
  const directory = env.CREDENTIALS_DIRECTORY?.trim();
  if (!directory || !path.isAbsolute(directory)) {
    return null;
  }
  const candidate = path.join(directory, RELEASE_GIT_CREDENTIAL);
  try {
    const stat = await deps.lstat(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("release Git credential must be a regular non-symlink file");
    }
    return candidate;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function buildReleasePreparationSystemdArgs(params: {
  unitName: string;
  packageRoot: string;
  nodePath: string;
  openclawEntryPath: string;
  envPath: string;
  codingTaskId: string;
  serviceEnv: NodeJS.ProcessEnv;
  credentialSourcePath?: string;
}): string[] {
  const args = [
    "--user",
    `--unit=${params.unitName}`,
    "--service-type=exec",
    "--no-block",
    `--working-directory=${params.packageRoot}`,
    "--property=UMask=0077",
    "--property=NoNewPrivileges=yes",
    "--property=PrivateTmp=yes",
    "--property=ProtectControlGroups=yes",
    "--property=ProtectKernelModules=yes",
    "--property=ProtectKernelTunables=yes",
    "--property=RestrictSUIDSGID=yes",
    "--property=LockPersonality=yes",
    "--property=KillMode=mixed",
    "--property=StandardOutput=journal",
    "--property=StandardError=journal",
  ];
  if (params.credentialSourcePath) {
    args.push(`--property=LoadCredential=${RELEASE_GIT_CREDENTIAL}:${params.credentialSourcePath}`);
  }
  const assignments = Object.entries(params.serviceEnv)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`);
  args.push(
    params.envPath,
    "-i",
    ...assignments,
    params.nodePath,
    params.openclawEntryPath,
    "release",
    "prepare",
    "--coding-task",
    params.codingTaskId,
    "--json",
  );
  return args;
}

async function inspectUnit(params: {
  systemctlPath: string;
  unitName: string;
  env: NodeJS.ProcessEnv;
  deps: ReleasePreparationHandoffDeps;
}): Promise<"missing" | "running" | "terminal"> {
  const result = await params.deps.runCommand(
    params.systemctlPath,
    [
      "--user",
      "show",
      params.unitName,
      "--property=LoadState",
      "--property=ActiveState",
      "--property=SubState",
      "--property=Result",
    ],
    { env: launcherEnvironment(params.env) },
  );
  if (result.code !== 0 || result.stdout.includes("LoadState=not-found")) {
    return "missing";
  }
  if (
    result.stdout.includes("ActiveState=active") ||
    result.stdout.includes("ActiveState=activating") ||
    result.stdout.includes("ActiveState=reloading")
  ) {
    return "running";
  }
  return "terminal";
}

function acceptedResult(
  value: unknown,
  operationId: string,
  codingTaskId: string,
): ReleasePreparationResult | null {
  if (value === null) {
    return null;
  }
  const result = parseReleasePreparationResult(value);
  if (result.operationId !== operationId || result.codingTaskId !== codingTaskId) {
    throw new Error("release preparation result belongs to different authority");
  }
  return result;
}

/** Start or read back the one release-preparation transaction for a Coding task. */
export async function startReleasePreparationHandoff(
  params: { codingTaskId: string; env?: NodeJS.ProcessEnv },
  overrides: Partial<ReleasePreparationHandoffDeps> = {},
): Promise<ReleasePreparationHandoffResult> {
  const sourceEnv = params.env ?? process.env;
  const deps = { ...defaultDeps(), ...overrides };
  const codingTaskId = params.codingTaskId.trim();
  const authority = await deps.resolveAuthority({ codingTaskId, env: sourceEnv });
  const operationId = deriveReleasePreparationOperationId({
    codingTaskId,
    worktreeId: authority.worktree.id,
    loadedReleaseManifestDigest: authority.loadedRelease.releaseManifestDigest,
  });
  const unitName = unitNameForOperation(operationId);
  const releaseStoreRoot = resolveReleaseStoreRoot(sourceEnv);
  const paths = resolveReleasePreparationOperationPaths({ releaseStoreRoot, operationId });
  const existing = acceptedResult(
    await deps.readResult(paths.resultPath),
    operationId,
    codingTaskId,
  );
  if (existing) {
    return {
      status: "accepted",
      operationId,
      unitName,
      acceptedReleaseReceiptId: existing.acceptedReleaseReceiptId,
    };
  }

  const [systemdRunPath, systemctlPath, envPath] = await Promise.all([
    resolveFixedExecutable(SYSTEMD_RUN_PATHS, deps),
    resolveFixedExecutable(SYSTEMCTL_PATHS, deps),
    resolveFixedExecutable(ENV_PATHS, deps),
  ]);
  const unitState = await inspectUnit({ systemctlPath, unitName, env: sourceEnv, deps });
  if (unitState === "running") {
    return { status: "running", operationId, unitName };
  }
  if (unitState === "terminal") {
    await deps.runCommand(systemctlPath, ["--user", "reset-failed", unitName], {
      env: launcherEnvironment(sourceEnv),
    });
  }

  const nodePath = await fs.realpath(process.execPath);
  const packageRoot = await fs.realpath(authority.packageRoot);
  const openclawEntryPath = await fs.realpath(path.join(packageRoot, "openclaw.mjs"));
  if (path.dirname(openclawEntryPath) !== packageRoot) {
    throw new Error("release preparation entrypoint is outside the loaded package root");
  }
  const serviceEnv = buildReleasePreparationEnvironment(sourceEnv);
  const credentialSourcePath = await credentialSource(sourceEnv, deps);
  if (credentialSourcePath) {
    const runtimeDirectory = serviceEnv.XDG_RUNTIME_DIR;
    if (!runtimeDirectory || !path.isAbsolute(runtimeDirectory)) {
      throw new Error("XDG_RUNTIME_DIR is required for systemd release credentials");
    }
    serviceEnv.CREDENTIALS_DIRECTORY = path.join(runtimeDirectory, "credentials", unitName);
  } else {
    delete serviceEnv.CREDENTIALS_DIRECTORY;
  }
  const launch = await deps.runCommand(
    systemdRunPath,
    buildReleasePreparationSystemdArgs({
      unitName,
      packageRoot,
      nodePath,
      openclawEntryPath,
      envPath,
      codingTaskId,
      serviceEnv,
      ...(credentialSourcePath ? { credentialSourcePath } : {}),
    }),
    { cwd: packageRoot, env: launcherEnvironment(sourceEnv) },
  );
  if (launch.code !== 0) {
    const racedState = await inspectUnit({ systemctlPath, unitName, env: sourceEnv, deps });
    if (racedState === "running") {
      return { status: "running", operationId, unitName };
    }
    throw new Error(`release preparation service failed to start: ${launch.stderr.trim()}`);
  }
  return { status: "started", operationId, unitName };
}
