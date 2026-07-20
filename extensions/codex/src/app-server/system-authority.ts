import path from "node:path";
import type { SessionEntry } from "openclaw/plugin-sdk/session-store-runtime";
import type {
  CodexThreadResumeResponse,
  CodexThreadStartResponse,
  CodexTurnEnvironmentParams,
} from "./protocol.js";

const SYSTEM_CHANGE_AGENT_IDS = new Set(["coding", "execution-coding"]);
const SYSTEM_WORKTREE_ENVIRONMENT_ID = "worktree";
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

export type CodexSystemAuthority = NonNullable<SessionEntry["codexSystemAuthority"]>;

export type CodexSystemProcessProfile = {
  key: string;
  expectedServerVersion: string;
  codexHome: string;
};

export type CodexSystemThreadContext = {
  authority: CodexSystemAuthority;
  fingerprint: string;
  processProfile: CodexSystemProcessProfile;
  environments: CodexTurnEnvironmentParams[];
};

export function resolveCodexSystemThreadContext(params: {
  sessionEntry?: SessionEntry;
  agentId?: string;
  cwd: string;
}): CodexSystemThreadContext | undefined {
  const worktree = params.sessionEntry?.worktree;
  const authority = params.sessionEntry?.codexSystemAuthority;
  if (worktree?.kind !== "system-change" && !authority) {
    return undefined;
  }
  if (worktree?.kind !== "system-change" || !authority) {
    throw new Error("system-change Codex sessions require both worktree and generation authority");
  }
  const agentId = params.agentId?.trim().toLowerCase();
  if (!agentId || !SYSTEM_CHANGE_AGENT_IDS.has(agentId)) {
    throw new Error("system-change worktrees may only run through the Coding agent");
  }
  const expectedCwd = params.sessionEntry?.spawnedCwd;
  if (!expectedCwd || path.resolve(expectedCwd) !== path.resolve(params.cwd)) {
    throw new Error("system-change Codex cwd does not match the session-managed worktree");
  }
  validateAuthority(authority, params.cwd);
  const environments: CodexTurnEnvironmentParams[] = [
    { environmentId: SYSTEM_WORKTREE_ENVIRONMENT_ID, cwd: params.cwd },
    ...authority.capabilityEnvironments.map((environment) => ({ ...environment })),
  ];
  return {
    authority,
    fingerprint: authority.releaseManifestDigest,
    processProfile: {
      key: authority.releaseManifestDigest,
      expectedServerVersion: authority.expectedServerVersion,
      codexHome: authority.codexHome,
    },
    environments,
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
  const selectedModel = model?.trim();
  if (!selectedModel || !context.authority.v2ModelIds.includes(selectedModel)) {
    throw new Error(
      `Codex system-change model is not declared multi-agent V2 by the loaded generation: ${selectedModel || "missing"}`,
    );
  }
}

function validateAuthority(authority: CodexSystemAuthority, cwd: string): void {
  if (authority.schemaVersion !== 1) {
    throw new Error("unsupported Codex system authority schema");
  }
  if (!authority.releaseManifestDigest.trim()) {
    throw new Error("Codex system authority is missing its loaded release identity");
  }
  if (!authority.expectedServerVersion.trim()) {
    throw new Error("Codex system authority is missing the exact app-server version");
  }
  if (!path.isAbsolute(authority.codexHome) || pathsOverlap(cwd, authority.codexHome)) {
    throw new Error("Codex system authority requires an external absolute CODEX_HOME");
  }
  if (!authority.permissionProfile.trim()) {
    throw new Error("Codex system authority is missing a permission profile");
  }
  if (authority.config.project_doc_max_bytes !== 0) {
    throw new Error("Codex system authority must disable editable project documents");
  }
  if (
    typeof authority.config.developer_instructions !== "string" ||
    authority.config.developer_instructions.trim().length === 0
  ) {
    throw new Error("Codex system authority is missing generation-N developer instructions");
  }
  if (authority.config["features.multi_agent"] !== false) {
    throw new Error("Codex system authority must disable multi-agent V1");
  }
  if (authority.config["features.multi_agent_v2.enabled"] !== true) {
    throw new Error("Codex system authority must enable multi-agent V2");
  }
  const shellEnvironmentSet = authority.config["shell_environment_policy.set"];
  if (!isJsonObject(shellEnvironmentSet)) {
    throw new Error("Codex system authority is missing its fixed shell environment");
  }
  for (const [name, value] of Object.entries(
    resolveCodexSystemFixedEnvironment(authority.codexHome),
  )) {
    if (shellEnvironmentSet[name] !== value) {
      throw new Error(`Codex system authority has an invalid fixed shell environment: ${name}`);
    }
  }
  if (
    authority.v2ModelIds.length === 0 ||
    authority.v2ModelIds.some((model) => !model.trim()) ||
    new Set(authority.v2ModelIds).size !== authority.v2ModelIds.length
  ) {
    throw new Error("Codex system authority requires a unique loaded V2 model set");
  }

  if (
    authority.capabilityEnvironments.length === 0 ||
    authority.selectedCapabilityRoots.length === 0
  ) {
    throw new Error("Codex system authority requires immutable capability environments and roots");
  }

  const environmentIds = new Set<string>([SYSTEM_WORKTREE_ENVIRONMENT_ID]);
  for (const environment of authority.capabilityEnvironments) {
    if (
      !environment.environmentId.trim() ||
      environmentIds.has(environment.environmentId) ||
      !path.isAbsolute(environment.cwd) ||
      pathsOverlap(cwd, environment.cwd)
    ) {
      throw new Error("Codex system authority has an invalid capability environment");
    }
    environmentIds.add(environment.environmentId);
  }
  const rootIds = new Set<string>();
  for (const root of authority.selectedCapabilityRoots) {
    const environment = authority.capabilityEnvironments.find(
      (candidate) => candidate.environmentId === root.location.environmentId,
    );
    if (
      !root.id.trim() ||
      rootIds.has(root.id) ||
      root.location.type !== "environment" ||
      !environment ||
      !path.isAbsolute(root.location.path) ||
      !isWithin(environment.cwd, root.location.path) ||
      isWithin(cwd, root.location.path)
    ) {
      throw new Error("Codex system authority has an invalid selected capability root");
    }
    rootIds.add(root.id);
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function pathsOverlap(left: string, right: string): boolean {
  return isWithin(left, right) || isWithin(right, left);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
