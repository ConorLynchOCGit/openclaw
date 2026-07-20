import path from "node:path";
import type { SessionEntry } from "openclaw/plugin-sdk/session-store-runtime";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";
import { mergeCodexThreadConfigs } from "./plugin-thread-config.js";
import type {
  CodexThreadResumeResponse,
  CodexThreadStartResponse,
  CodexTurnEnvironmentParams,
  JsonObject,
} from "./protocol.js";
import type { CodexLoadedSystemProfile } from "./system-profile.js";
import { MANAGED_CODEX_APP_SERVER_PACKAGE_VERSION } from "./version.js";

const SYSTEM_CHANGE_AGENT_IDS = new Set(["coding", "execution-coding"]);
const SYSTEM_PERMISSION_PROFILE = "openclaw-system-change";
const SYSTEM_LOCAL_ENVIRONMENT_ID = "local";
export const SYSTEM_WORKTREE_LOCK_SCOPE_ENV = "OPENCLAW_HEAVY_CHECK_LOCK_SCOPE";
export const SYSTEM_WORKTREE_LOCK_SCOPE_VALUE = "worktree";

export function resolveCodexSystemFixedEnvironment(codexHome: string): Record<string, string> {
  const packageCacheRoot = path.join(path.resolve(codexHome), "package-cache");
  const npmCache = path.join(packageCacheRoot, "npm");
  const pnpmStore = path.join(packageCacheRoot, "pnpm-store");
  return {
    [SYSTEM_WORKTREE_LOCK_SCOPE_ENV]: SYSTEM_WORKTREE_LOCK_SCOPE_VALUE,
    XDG_CACHE_HOME: path.join(packageCacheRoot, "xdg"),
    COREPACK_HOME: path.join(packageCacheRoot, "corepack"),
    NPM_CONFIG_CACHE: npmCache,
    npm_config_cache: npmCache,
    PNPM_HOME: path.join(packageCacheRoot, "pnpm-home"),
    PNPM_CONFIG_STORE_DIR: pnpmStore,
    npm_config_store_dir: pnpmStore,
    pnpm_config_store_dir: pnpmStore,
    PNPM_STORE_PATH: pnpmStore,
  };
}

export type CodexSystemProcessProfile = {
  key: string;
  expectedServerVersion: string;
  codexHome: string;
};

export type CodexSystemProcessContext = {
  fingerprint: string;
  cwd: string;
  processProfile: CodexSystemProcessProfile;
};

export type CodexSystemThreadContext = {
  authority: {
    releaseManifestDigest: string;
    permissionProfile: string;
    config: JsonObject;
    selectedCapabilityRoots: CodexLoadedSystemProfile["selectedCapabilityRoots"];
  };
  fingerprint: string;
  processProfile: CodexSystemProcessProfile;
  environments: CodexTurnEnvironmentParams[];
};

type SystemChangeSessionEntry = SessionEntry & {
  worktree?: NonNullable<SessionEntry["worktree"]> & {
    releaseManifestDigest?: string;
  };
};

export function resolveCodexSystemProcessContext(params: {
  sessionEntry?: SystemChangeSessionEntry;
  agentId?: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): CodexSystemProcessContext | undefined {
  const worktree = params.sessionEntry?.worktree;
  if (worktree?.kind !== "system-change") {
    return undefined;
  }
  const agentId = params.agentId?.trim().toLowerCase();
  if (!agentId || !SYSTEM_CHANGE_AGENT_IDS.has(agentId)) {
    throw new Error("system-change worktrees may only run through the Coding agent");
  }
  const expectedCwd = params.sessionEntry?.spawnedCwd;
  if (!expectedCwd || path.resolve(expectedCwd) !== path.resolve(params.cwd)) {
    throw new Error("system-change Codex cwd does not match the session-managed worktree");
  }
  const releaseManifestDigest = worktree.releaseManifestDigest?.trim();
  if (!releaseManifestDigest) {
    throw new Error("system-change worktree is missing its loaded release identity");
  }
  const codexHome = path.join(
    resolveStateDir(params.env ?? process.env),
    "codex",
    "generations",
    releaseManifestDigest,
  );
  if (pathsOverlap(params.cwd, codexHome)) {
    throw new Error("system-change Codex runtime state must remain outside the managed worktree");
  }
  return {
    fingerprint: releaseManifestDigest,
    cwd: path.resolve(params.cwd),
    processProfile: {
      key: releaseManifestDigest,
      expectedServerVersion: MANAGED_CODEX_APP_SERVER_PACKAGE_VERSION,
      codexHome,
    },
  };
}

export function buildCodexSystemThreadContext(params: {
  processContext: CodexSystemProcessContext;
  profile: CodexLoadedSystemProfile;
}): CodexSystemThreadContext {
  const { processContext, profile } = params;
  validateLoadedProfile(profile, processContext.cwd);
  const config = mergeCodexThreadConfigs(profile.config, {
    project_doc_max_bytes: 0,
    projects: {
      [processContext.cwd]: { trust_level: "untrusted" },
    },
    shell_environment_policy: {
      set: resolveCodexSystemFixedEnvironment(processContext.processProfile.codexHome),
    },
  });
  if (!config) {
    throw new Error("Codex system profile produced an empty native thread config");
  }
  return {
    authority: {
      releaseManifestDigest: processContext.fingerprint,
      permissionProfile: SYSTEM_PERMISSION_PROFILE,
      config,
      selectedCapabilityRoots: profile.selectedCapabilityRoots,
    },
    fingerprint: processContext.fingerprint,
    processProfile: processContext.processProfile,
    environments: [{ environmentId: SYSTEM_LOCAL_ENVIRONMENT_ID, cwd: processContext.cwd }],
  };
}

export function assertCodexSystemThreadResponse(params: {
  response: CodexThreadStartResponse | CodexThreadResumeResponse;
  context: CodexSystemThreadContext;
  cwd: string;
  action: "start" | "resume";
}): void {
  const observedCwd = params.response.cwd;
  if (!observedCwd || path.resolve(observedCwd) !== path.resolve(params.cwd)) {
    throw new Error(
      `Codex system thread ${params.action} did not confirm the managed-worktree cwd`,
    );
  }
  const roots = params.response.runtimeWorkspaceRoots;
  if (
    !Array.isArray(roots) ||
    roots.length !== 1 ||
    path.resolve(roots[0] ?? "") !== path.resolve(params.cwd)
  ) {
    throw new Error(
      `Codex system thread ${params.action} did not confirm its sole runtime workspace root`,
    );
  }
  if (!Array.isArray(params.response.instructionSources)) {
    throw new Error(
      `Codex system thread ${params.action} did not return instruction-source readback`,
    );
  }
  if (params.response.instructionSources.length > 0) {
    throw new Error(`Codex system thread ${params.action} loaded editable project instructions`);
  }
  if (params.response.activePermissionProfile?.id !== params.context.authority.permissionProfile) {
    throw new Error(
      `Codex system thread ${params.action} did not confirm permission profile ${params.context.authority.permissionProfile}`,
    );
  }
}

export function assertCodexSystemV2Model(
  context: CodexSystemThreadContext,
  model: string | undefined,
): void {
  if (!model?.trim()) {
    throw new Error("Codex system-change model selection is missing");
  }
  const features = readObject(context.authority.config.features);
  const v2 = readObject(features?.multi_agent_v2);
  if (v2?.enabled !== true) {
    throw new Error("loaded Codex system profile does not enable multi-agent V2");
  }
}

function validateLoadedProfile(profile: CodexLoadedSystemProfile, cwd: string): void {
  if (profile.config.project_doc_max_bytes !== 0) {
    throw new Error("Codex system profile must disable editable project documents");
  }
  if (
    typeof profile.config.developer_instructions !== "string" ||
    !profile.config.developer_instructions.trim()
  ) {
    throw new Error("Codex system profile is missing generation-N developer instructions");
  }
  if (profile.config.default_permissions !== SYSTEM_PERMISSION_PROFILE) {
    throw new Error(`Codex system profile must select ${SYSTEM_PERMISSION_PROFILE}`);
  }
  const features = readObject(profile.config.features);
  if (features?.multi_agent !== false || readObject(features?.multi_agent_v2)?.enabled !== true) {
    throw new Error("Codex system profile must disable V1 and enable V2 collaboration");
  }
  const permissions = readObject(profile.config.permissions);
  if (!readObject(permissions?.[SYSTEM_PERMISSION_PROFILE])) {
    throw new Error(`Codex system profile is missing ${SYSTEM_PERMISSION_PROFILE}`);
  }
  if (profile.selectedCapabilityRoots.length === 0) {
    throw new Error("Codex system profile has no selected capability roots");
  }
  for (const root of profile.selectedCapabilityRoots) {
    if (
      root.location.type !== "environment" ||
      root.location.environmentId !== SYSTEM_LOCAL_ENVIRONMENT_ID ||
      !path.isAbsolute(root.location.path) ||
      isWithin(cwd, root.location.path)
    ) {
      throw new Error("Codex system profile has an invalid capability root");
    }
  }
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function pathsOverlap(left: string, right: string): boolean {
  return isWithin(left, right) || isWithin(right, left);
}
